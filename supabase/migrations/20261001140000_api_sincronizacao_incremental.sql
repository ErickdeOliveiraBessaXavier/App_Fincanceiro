-- ============================================================================
-- API v1: sincronização incremental enxerga pagamento e acordo
--
-- `GET /titulos?atualizado_apos=` filtrava por `titulos.updated_at`, que só
-- muda em importação/envio e cancelamento (conferido em 2026-10-01: nenhuma
-- função de pagamento ou de acordo faz UPDATE em `titulos`). Pagamento lançado
-- no app e acordo criado/quebrado/cumprido/cancelado nunca chegavam ao ERP que
-- sincroniza de forma incremental.
--
-- "Última mudança" do título = a mais recente entre:
--   - titulos.updated_at                         (envio, importação, cancelamento)
--   - movimentos_financeiros.created_at das parcelas do título
--                                                (pagamento, estorno, encargo,
--                                                 desconto, renegociação)
--   - acordos.updated_at / acordo_titulos.created_at dos acordos do título
--                                                (criado, quebrado, cumprido,
--                                                 cancelado)
--
-- Calculada na leitura, não gravada por trigger: nenhum risco novo no caminho
-- de gravação do dinheiro. Se o volume pedir, o próximo passo é materializar
-- (ver PENDENCIAS.md, "Volume").
--
-- Fora do alcance de propósito: a passagem do tempo (a_vencer → vencido não é
-- um evento) e pagamento de parcela de ACORDO que não muda o estado do acordo
-- (não altera nada do que a API devolve sobre o título).
--
-- Interna da api-v1 (service role). Sem grant para anon/authenticated.
-- ============================================================================

CREATE OR REPLACE FUNCTION public._api_titulos_alterados(
  p_company uuid,
  p_desde timestamptz,
  p_incluir_cancelados boolean,
  p_limite integer,
  p_offset integer,
  p_titulo uuid DEFAULT NULL
)
RETURNS TABLE (titulo_id uuid, ultima_mudanca timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH tit AS (
    SELECT t.id, t.updated_at
      FROM public.titulos t
     WHERE t.company_id = p_company
       AND (p_incluir_cancelados OR t.deleted_at IS NULL)
       AND (p_titulo IS NULL OR t.id = p_titulo)
  ),
  mov AS (
    SELECT p.titulo_id, max(m.created_at) AS em
      FROM public.movimentos_financeiros m
      JOIN public.parcelas p ON p.id = m.parcela_titulo_id
     WHERE m.company_id = p_company
       AND (p_titulo IS NULL OR p.titulo_id = p_titulo)
     GROUP BY p.titulo_id
  ),
  aco AS (
    SELECT at.titulo_id, max(GREATEST(a.updated_at, at.created_at)) AS em
      FROM public.acordo_titulos at
      JOIN public.acordos a ON a.id = at.acordo_id
     WHERE at.company_id = p_company
       AND (p_titulo IS NULL OR at.titulo_id = p_titulo)
     GROUP BY at.titulo_id
  ),
  -- GREATEST ignora NULL: título sem movimento ou sem acordo vale pelo resto.
  ultima AS (
    SELECT tit.id, GREATEST(tit.updated_at, mov.em, aco.em) AS em
      FROM tit
      LEFT JOIN mov ON mov.titulo_id = tit.id
      LEFT JOIN aco ON aco.titulo_id = tit.id
  )
  SELECT ultima.id, ultima.em
    FROM ultima
   WHERE p_desde IS NULL OR ultima.em > p_desde
   ORDER BY ultima.em DESC, ultima.id
   LIMIT p_limite OFFSET p_offset;
$function$;

REVOKE ALL ON FUNCTION public._api_titulos_alterados(uuid, timestamptz, boolean, integer, integer, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._api_titulos_alterados(uuid, timestamptz, boolean, integer, integer, uuid)
  TO service_role;

COMMENT ON FUNCTION public._api_titulos_alterados(uuid, timestamptz, boolean, integer, integer, uuid) IS
  'api-v1: títulos da empresa por última mudança real (título, razão, acordo). Só service role.';

-- Conferência pelo privilégio efetivo, não pelo DDL.
DO $$
DECLARE f text := 'public._api_titulos_alterados(uuid, timestamptz, boolean, integer, integer, uuid)';
BEGIN
  IF has_function_privilege('anon', f, 'EXECUTE') OR has_function_privilege('authenticated', f, 'EXECUTE') THEN
    RAISE EXCEPTION '_api_titulos_alterados não pode ser chamada pelo app (recebe a empresa por parâmetro)';
  END IF;
  IF NOT has_function_privilege('service_role', f, 'EXECUTE') THEN
    RAISE EXCEPTION 'api-v1 (service role) precisa executar _api_titulos_alterados';
  END IF;
END $$;
