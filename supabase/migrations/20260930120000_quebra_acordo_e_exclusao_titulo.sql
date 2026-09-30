-- ============================================================================
-- Decisões do gestor de 2026-09-30 (PENDENCIAS.md, "Por onde retomar" 2 e 3)
--
-- 1. Exclusão definitiva de título com lançamento financeiro: BLOQUEADA.
--    Igual ao acordo (20260929130000). Dinheiro recebido não se apaga: baixa
--    errada se corrige com estorno, título indevido se cancela.
--    `limpar_titulos_empresa` (Plataforma) continua apagando tudo — só enquanto
--    os dados forem de teste.
--
-- 2. P8 ligado com tolerância: acordo vira 'quebrado' quando uma parcela fica
--    em aberto por MAIS de `dias_tolerancia_quebra` dias (por empresa, padrão
--    10). Volta a 'ativo' se o cliente regularizar. NUNCA é cancelado sozinho:
--    cancelar continua sendo decisão do admin.
--
--    A regra mora numa função só (`_status_devido_acordo`), usada pelo trigger
--    e pelo job diário. Antes o trigger quebrava o acordo pela coluna 'vencida'
--    da parcela, que também é gravada por `sincronizar_parcela_acordo` depois
--    de qualquer baixa/estorno — uma baixa parcial numa parcela com 1 dia de
--    atraso quebraria o acordo na hora, furando a tolerância. A coluna
--    `parcelas_acordo.status` continua dizendo o fato (vencida = passou do
--    vencimento); a quebra é decisão de política, com a tolerância.
--
-- 3. vw_titulos_completos: título de acordo 'quebrado' aparecia como 'pago'
--    (a novação zera o saldo e só 'ativo' virava 'renegociado'). Acordo vigente
--    = 'ativo' ou 'quebrado', como nas RPCs desde a Rodada 1.
-- ============================================================================

-- ─── 1. Exclusão definitiva de título ──────────────────────────────────────
CREATE OR REPLACE FUNCTION public.excluir_titulos_definitivo(p_titulo_ids uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_count int; v_com_acordo int; v_alheios int; v_com_dinheiro int;
BEGIN
  IF NOT public.has_min_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Operação restrita ao administrador'; END IF;
  IF p_titulo_ids IS NULL OR array_length(p_titulo_ids, 1) IS NULL THEN
    RETURN jsonb_build_object('sucesso', true, 'excluidos', 0);
  END IF;

  IF NOT public.is_super_admin() THEN
    SELECT count(*) INTO v_alheios FROM public.titulos
     WHERE id = ANY(p_titulo_ids) AND company_id IS DISTINCT FROM public.current_company_id();
    IF v_alheios > 0 THEN RAISE EXCEPTION 'Há título(s) de outra empresa na seleção'; END IF;
  END IF;

  SELECT count(DISTINCT a.id) INTO v_com_acordo
    FROM public.acordos a
    LEFT JOIN public.acordo_titulos at ON at.acordo_id = a.id
   WHERE a.titulo_id = ANY(p_titulo_ids) OR at.titulo_id = ANY(p_titulo_ids);
  IF v_com_acordo > 0 THEN
    RAISE EXCEPTION 'Há % acordo(s) vinculado(s) a estes títulos. Exclua os acordos antes de purgar os títulos.', v_com_acordo;
  END IF;

  -- Qualquer lançamento além da emissão (pagamento, desconto, encargo, e o
  -- estorno deles) é histórico financeiro. Pagamento estornado também conta:
  -- o registro do erro e da correção faz parte da trilha.
  SELECT count(DISTINCT p.titulo_id) INTO v_com_dinheiro
    FROM public.parcelas p
    JOIN public.movimentos_financeiros m ON m.parcela_titulo_id = p.id
   WHERE p.titulo_id = ANY(p_titulo_ids)
     AND m.tipo <> 'emissao_parcela';
  IF v_com_dinheiro > 0 THEN
    RAISE EXCEPTION 'Há % título(s) com pagamento ou lançamento financeiro. Eles ficam no histórico e não podem ser excluídos; use "Cancelar título".', v_com_dinheiro;
  END IF;

  PERFORM set_config('app.hard_delete','on',true);
  DELETE FROM public.agendamentos WHERE titulo_id = ANY(p_titulo_ids);
  DELETE FROM public.titulos WHERE id = ANY(p_titulo_ids);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  PERFORM set_config('app.hard_delete','off',true);

  REFRESH MATERIALIZED VIEW public.mv_parcelas_consolidadas;
  RETURN jsonb_build_object('sucesso', true, 'excluidos', v_count);
END; $function$;

-- ─── 2. Tolerância de quebra ───────────────────────────────────────────────
ALTER TABLE public.configuracoes_empresa
  ADD COLUMN IF NOT EXISTS dias_tolerancia_quebra integer NOT NULL DEFAULT 10;

ALTER TABLE public.configuracoes_empresa
  DROP CONSTRAINT IF EXISTS configuracoes_empresa_dias_tolerancia_quebra_check;
ALTER TABLE public.configuracoes_empresa
  ADD CONSTRAINT configuracoes_empresa_dias_tolerancia_quebra_check
  CHECK (dias_tolerancia_quebra BETWEEN 0 AND 90);

COMMENT ON COLUMN public.configuracoes_empresa.dias_tolerancia_quebra IS
  'Dias de atraso tolerados numa parcela de acordo antes de o acordo virar quebrado. 0 = quebra no 1º dia de atraso.';

-- Estado que o acordo DEVERIA ter agora. Interna (trigger e job).
-- Empresa sem linha em configuracoes_empresa usa o mesmo padrão da coluna (10).
CREATE OR REPLACE FUNCTION public._status_devido_acordo(p_acordo_id uuid)
 RETURNS text
 LANGUAGE sql
 VOLATILE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH abertas AS (
    SELECT pa.data_vencimento
      FROM public.parcelas_acordo pa
     WHERE pa.acordo_id = p_acordo_id AND pa.deleted_at IS NULL AND pa.status <> 'paga'
  ), tolerancia AS (
    SELECT COALESCE(ce.dias_tolerancia_quebra, 10) AS dias
      FROM public.acordos a
      LEFT JOIN public.configuracoes_empresa ce ON ce.company_id = a.company_id
     WHERE a.id = p_acordo_id
  )
  SELECT CASE
    WHEN NOT EXISTS (SELECT 1 FROM abertas) THEN 'cumprido'
    WHEN EXISTS (SELECT 1 FROM abertas, tolerancia
                  WHERE abertas.data_vencimento + tolerancia.dias < public.hoje_br()) THEN 'quebrado'
    ELSE 'ativo'
  END;
$function$;

CREATE OR REPLACE FUNCTION public.update_acordo_status()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_atual text; v_novo text;
BEGIN
  SELECT status INTO v_atual FROM public.acordos WHERE id = NEW.acordo_id;
  IF v_atual IS NULL OR v_atual = 'cancelado' THEN RETURN NEW; END IF;

  v_novo := public._status_devido_acordo(NEW.acordo_id);
  IF v_novo <> v_atual THEN
    UPDATE public.acordos SET status = v_novo WHERE id = NEW.acordo_id;
  END IF;
  RETURN NEW;
END $function$;

-- Job diário. O trigger só roda quando uma parcela muda; a passagem do tempo
-- (a tolerância vencer sem ninguém mexer no acordo) só o job enxerga. Também
-- reavalia os quebrados: se a empresa aumentar a tolerância, voltam a 'ativo'.
CREATE OR REPLACE FUNCTION public._processar_quebra_acordos()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_parcelas jsonb; v_antes uuid[]; v_quebrados int; v_retomados int;
BEGIN
  -- A contagem é por diferença: marcar parcelas dispara o trigger, que já
  -- quebra parte dos acordos antes do UPDATE abaixo.
  SELECT coalesce(array_agg(id), '{}') INTO v_antes FROM public.acordos WHERE status = 'quebrado';

  v_parcelas := public.marcar_parcelas_acordo_vencidas();

  WITH devido AS (
    SELECT a.id, public._status_devido_acordo(a.id) AS novo
      FROM public.acordos a
     WHERE a.status IN ('ativo', 'quebrado')
  )
  UPDATE public.acordos a
     SET status = d.novo
    FROM devido d
   WHERE a.id = d.id
     AND a.status IN ('ativo', 'quebrado')
     AND a.status <> d.novo;

  SELECT count(*) FILTER (WHERE status = 'quebrado' AND NOT (id = ANY (v_antes))),
         count(*) FILTER (WHERE status <> 'quebrado' AND id = ANY (v_antes))
    INTO v_quebrados, v_retomados
    FROM public.acordos;

  RETURN jsonb_build_object(
    'sucesso', true,
    'parcelas_vencidas', v_parcelas->'parcelas_vencidas',
    'acordos_quebrados', v_quebrados,
    'acordos_retomados', v_retomados);
END $function$;

-- Interna: sem grant. Função nova já nasce fechada (20260929130000); o REVOKE
-- explícito é para a conferência no fim não depender disso.
REVOKE EXECUTE ON FUNCTION public._status_devido_acordo(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._processar_quebra_acordos() FROM PUBLIC, anon, authenticated;

-- ─── Agendamento (pg_cron) ─────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
GRANT USAGE ON SCHEMA cron TO postgres;

-- 03:10 UTC = 00:10 em Brasília: o dia já virou para hoje_br().
DO $$
BEGIN
  PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'quebra-acordos-diaria';
  PERFORM cron.schedule('quebra-acordos-diaria', '10 3 * * *',
                        'SELECT public._processar_quebra_acordos()');
END $$;

-- ─── 3. Título de acordo quebrado não aparece como pago ────────────────────
CREATE OR REPLACE VIEW public.vw_titulos_completos AS
 SELECT t.id,
    t.company_id,
    t.cliente_id,
    c.nome AS cliente_nome,
    c.cpf_cnpj AS cliente_cpf_cnpj,
    c.telefone AS cliente_telefone,
    c.email AS cliente_email,
    t.numero_documento,
    t.descricao,
    t.valor_original,
    t.vencimento_original,
    t.metadata,
    t.status AS titulo_status,
    t.created_by,
    t.created_at,
    t.updated_at,
    COALESCE(p.quantidade_parcelas, (0)::bigint) AS quantidade_parcelas,
    COALESCE(p.parcelas_pagas, (0)::bigint) AS parcelas_pagas,
    COALESCE(p.parcelas_pendentes, (0)::bigint) AS parcelas_pendentes,
    COALESCE(p.parcelas_vencidas, (0)::bigint) AS parcelas_vencidas,
    COALESCE(p.total_pago, (0)::numeric) AS total_pago,
    COALESCE(p.total_juros, (0)::numeric) AS total_juros,
    COALESCE(p.total_multa, (0)::numeric) AS total_multa,
    COALESCE(p.total_descontos, (0)::numeric) AS total_descontos,
    COALESCE(p.saldo_devedor, (0)::numeric) AS saldo_devedor,
    p.proximo_vencimento,
        CASE
            WHEN (ac.status = ANY (ARRAY['ativo'::text, 'quebrado'::text])) THEN 'renegociado'::text
            WHEN (COALESCE(p.saldo_devedor, (0)::numeric) <= (0)::numeric) THEN 'pago'::text
            WHEN (COALESCE(p.parcelas_vencidas, (0)::bigint) > 0) THEN 'vencido'::text
            ELSE 'a_vencer'::text
        END AS status,
        CASE
            WHEN ((t.metadata ->> 'tipo'::text) IS NOT NULL) THEN (t.metadata ->> 'tipo'::text)
            WHEN (COALESCE(p.quantidade_parcelas, (0)::bigint) > 1) THEN 'parcelado'::text
            ELSE 'avista'::text
        END AS tipo,
    c.cobrador_id,
    c.vendedor_id,
    ac.status AS acordo_status
   FROM (((titulos t
     LEFT JOIN clientes c ON ((c.id = t.cliente_id)))
     LEFT JOIN ( SELECT mv_parcelas_consolidadas.titulo_id,
            count(*) AS quantidade_parcelas,
            count(*) FILTER (WHERE (mv_parcelas_consolidadas.status = 'pago'::text)) AS parcelas_pagas,
            count(*) FILTER (WHERE (mv_parcelas_consolidadas.status = 'a_vencer'::text)) AS parcelas_pendentes,
            count(*) FILTER (WHERE (mv_parcelas_consolidadas.status = 'vencido'::text)) AS parcelas_vencidas,
            sum(mv_parcelas_consolidadas.total_pago) AS total_pago,
            sum(mv_parcelas_consolidadas.juros) AS total_juros,
            sum(mv_parcelas_consolidadas.multa) AS total_multa,
            sum(mv_parcelas_consolidadas.descontos) AS total_descontos,
            sum(mv_parcelas_consolidadas.saldo_atual) AS saldo_devedor,
            min(mv_parcelas_consolidadas.vencimento) FILTER (WHERE (mv_parcelas_consolidadas.status <> 'pago'::text)) AS proximo_vencimento
           FROM mv_parcelas_consolidadas
          GROUP BY mv_parcelas_consolidadas.titulo_id) p ON ((p.titulo_id = t.id)))
     LEFT JOIN LATERAL ( SELECT a.status
           FROM (acordo_titulos at
             JOIN acordos a ON ((a.id = at.acordo_id)))
          WHERE ((at.titulo_id = t.id) AND (a.status <> 'cancelado'::text))
          ORDER BY (a.status = ANY (ARRAY['ativo'::text, 'quebrado'::text])) DESC, a.created_at DESC
         LIMIT 1) ac ON (true))
  WHERE ((t.deleted_at IS NULL) AND (c.deleted_at IS NULL) AND (is_super_admin() OR ((t.company_id = current_company_id()) AND (((current_cobrador_id() IS NULL) AND (current_vendedor_id() IS NULL)) OR cobrador_ve_cliente(t.cliente_id)))));

-- ─── Conferência ───────────────────────────────────────────────────────────
DO $$
BEGIN
  IF has_function_privilege('authenticated', 'public._status_devido_acordo(uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public._status_devido_acordo(uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public._processar_quebra_acordos()', 'EXECUTE')
     OR has_function_privilege('anon', 'public._processar_quebra_acordos()', 'EXECUTE') THEN
    RAISE EXCEPTION 'função interna do P8 ficou executável pelo app';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.excluir_titulos_definitivo(uuid[])', 'EXECUTE')
     OR has_function_privilege('anon', 'public.excluir_titulos_definitivo(uuid[])', 'EXECUTE') THEN
    RAISE EXCEPTION 'excluir_titulos_definitivo com grant errado';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'quebra-acordos-diaria') THEN
    RAISE EXCEPTION 'job diário de quebra não foi agendado';
  END IF;
END $$;
