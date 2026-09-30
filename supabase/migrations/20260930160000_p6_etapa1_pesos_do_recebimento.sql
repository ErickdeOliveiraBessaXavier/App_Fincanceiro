-- ============================================================================
-- P6 — aposentar acordos.titulo_id, etapa 1 de 2 (PENDENCIAS.md)
--
-- Duas fontes de verdade para "títulos do acordo": a coluna (resquício de
-- quando o acordo cobria um título só) e acordo_titulos (N:N). A coluna
-- guardava só o primeiro título selecionado e servia de "título principal" do
-- recebimento de acordo: num acordo com vários títulos, a exportação de
-- Relatórios punha todo o dinheiro nesse primeiro título.
--
-- Esta etapa só ACRESCENTA titulo_pesos ao recebimento de acordo: a fração de
-- cada título, pelo que cada um teve liquidado na novação (lançamentos
-- 'renegociacao' do acordo no razão — os 14 acordos atuais têm). Nada sai
-- ainda: o front publicado continua lendo acordos.titulo_id. A etapa 2
-- (20260930170000) tira a coluna depois que o front novo estiver no ar.
-- ============================================================================

-- ─── Recebimentos ──────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW public.vw_recebimentos AS
 SELECT m.id AS recebimento_id,
        CASE
            WHEN (m.parcela_titulo_id IS NOT NULL) THEN 'titulo'::text
            ELSE 'acordo'::text
        END AS origem,
    m.company_id,
    COALESCE(pt.titulo_id, a.titulo_id) AS titulo_id,  -- etapa 2: só pt.titulo_id
    pa.acordo_id,
    (m.valor)::numeric AS valor,
    m.data_evento AS data_recebimento,
    m.meio_pagamento,
    COALESCE(t.cliente_id, a.cliente_id) AS cliente_id,
        CASE
            WHEN (pt.titulo_id IS NOT NULL) THEN ARRAY[pt.titulo_id]
            ELSE ( SELECT array_agg(at.titulo_id ORDER BY at.titulo_id) AS array_agg
               FROM acordo_titulos at
              WHERE (at.acordo_id = pa.acordo_id))
        END AS titulo_ids,
        CASE
            WHEN (pt.titulo_id IS NOT NULL) THEN NULL::jsonb
            ELSE ( SELECT jsonb_object_agg(w.titulo_id, w.liquidado / w.total)
                     FROM ( SELECT p2.titulo_id, sum(r.valor) AS liquidado, sum(sum(r.valor)) OVER () AS total
                              FROM movimentos_financeiros r
                              JOIN parcelas p2 ON p2.id = r.parcela_titulo_id
                             WHERE r.tipo = 'renegociacao' AND r.acordo_id = pa.acordo_id
                             GROUP BY p2.titulo_id) w
                    WHERE w.total > 0)
        END AS titulo_pesos
   FROM ((((movimentos_financeiros m
     LEFT JOIN parcelas pt ON ((pt.id = m.parcela_titulo_id)))
     LEFT JOIN parcelas_acordo pa ON ((pa.id = m.parcela_acordo_id)))
     LEFT JOIN acordos a ON ((a.id = pa.acordo_id)))
     LEFT JOIN titulos t ON ((t.id = pt.titulo_id)))
  WHERE ((m.tipo = ANY (ARRAY['pagamento_total'::text, 'pagamento_parcial'::text])) AND (NOT COALESCE(m.estornado, false)) AND ((m.parcela_titulo_id IS NOT NULL) OR (pa.deleted_at IS NULL)));

COMMENT ON COLUMN public.vw_recebimentos.titulo_pesos IS
  'Recebimento de acordo: {titulo_id: fração} pelo liquidado de cada título na novação. Soma 1. NULL para recebimento de título.';

CREATE OR REPLACE VIEW public.vw_recebimentos_tenant AS
 SELECT recebimento_id, origem, company_id, titulo_id, acordo_id, valor,
        data_recebimento, meio_pagamento, cliente_id, titulo_ids, titulo_pesos
   FROM public.vw_recebimentos
  WHERE (public.is_super_admin() OR company_id = public.current_company_id())
    AND public.cobrador_ve_cliente(cliente_id);

-- excluir_titulos_definitivo passa a olhar só acordo_titulos (o vínculo N:N sempre existe).
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

  SELECT count(DISTINCT at.acordo_id) INTO v_com_acordo
    FROM public.acordo_titulos at
   WHERE at.titulo_id = ANY(p_titulo_ids);
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
