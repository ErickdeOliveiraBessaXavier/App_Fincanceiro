-- ============================================================================
-- P6 — aposentar acordos.titulo_id, etapa 2 de 2
--
-- Aplicar DEPOIS do front que parou de ler acordos.titulo_id estar publicado
-- (commit do P6). Recebimento de acordo deixa de ter "título principal": o
-- rateio está em titulo_pesos (etapa 1). criar_acordo para de gravar a coluna,
-- e a coluna sai.
-- ============================================================================

-- ─── Recebimento de acordo sem título principal ──────────────────────────
CREATE OR REPLACE VIEW public.vw_recebimentos AS
 SELECT m.id AS recebimento_id,
        CASE
            WHEN (m.parcela_titulo_id IS NOT NULL) THEN 'titulo'::text
            ELSE 'acordo'::text
        END AS origem,
    m.company_id,
    pt.titulo_id,
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


-- ─── Funções que ainda usavam a coluna ─────────────────────────────────────
CREATE OR REPLACE FUNCTION public.criar_acordo(p_titulo_ids uuid[], p_cliente_id uuid, p_valor_original numeric, p_valor_acordo numeric, p_desconto numeric, p_parcelas integer, p_valor_parcela numeric, p_data_vencimento_primeira_parcela date, p_observacoes text, p_cronograma jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_company uuid := public.current_company_id();
  v_qtd int := COALESCE(array_length(p_titulo_ids, 1), 0);
  v_validos int; v_saldo numeric; v_saldo_total numeric := 0;
  v_acordo_id uuid; v_item jsonb; v_titulo uuid;
BEGIN
  IF NOT public.has_min_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Operação restrita ao administrador'; END IF;
  IF v_qtd = 0 THEN RAISE EXCEPTION 'Selecione ao menos um título'; END IF;
  IF v_qtd <> (SELECT count(DISTINCT x) FROM unnest(p_titulo_ids) x) THEN
    RAISE EXCEPTION 'Título repetido na seleção';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.clientes
                  WHERE id = p_cliente_id AND company_id = v_company AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'Cliente não encontrado';
  END IF;
  PERFORM public._validar_cronograma(p_cronograma, p_parcelas, p_valor_acordo);

  -- Ordem fixa de trava: dois acordos sobre o mesmo título não se cruzam.
  PERFORM 1 FROM public.titulos WHERE id = ANY (p_titulo_ids) ORDER BY id FOR UPDATE;
  SELECT count(*) INTO v_validos FROM public.titulos
   WHERE id = ANY (p_titulo_ids) AND company_id = v_company
     AND cliente_id = p_cliente_id AND deleted_at IS NULL;
  IF v_validos <> v_qtd THEN
    RAISE EXCEPTION 'Há título que não pertence a este cliente ou não está disponível';
  END IF;

  FOREACH v_titulo IN ARRAY p_titulo_ids LOOP
    IF public._titulo_em_acordo_vigente(v_titulo) THEN
      RAISE EXCEPTION 'Há título já vinculado a um acordo ativo ou quebrado';
    END IF;
    v_saldo := public._saldo_titulo(v_titulo);
    IF v_saldo <= 0 THEN RAISE EXCEPTION 'Há título sem saldo em aberto na seleção'; END IF;
    v_saldo_total := v_saldo_total + v_saldo;
  END LOOP;

  -- O valor original que a tela mostrou tem de ser o que será liquidado. Se
  -- mudou (baixa entrou no meio), o acordo seria calculado sobre dívida velha.
  IF abs(v_saldo_total - COALESCE(p_valor_original, 0)) >= 0.01 THEN
    RAISE EXCEPTION 'O saldo dos títulos mudou para R$ %. Reabra o acordo para recalcular.',
      to_char(v_saldo_total, 'FM999999999990.00');
  END IF;

  INSERT INTO public.acordos (
    company_id, cliente_id, valor_original, valor_acordo, desconto,
    parcelas, valor_parcela, data_acordo, data_vencimento_primeira_parcela,
    status, observacoes, created_by
  ) VALUES (
    v_company, p_cliente_id, v_saldo_total, round(p_valor_acordo, 2), p_desconto,
    p_parcelas, round(p_valor_parcela, 2), public.hoje_br(), p_data_vencimento_primeira_parcela,
    'ativo', p_observacoes, auth.uid()
  ) RETURNING id INTO v_acordo_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_cronograma) LOOP
    INSERT INTO public.parcelas_acordo (
      company_id, acordo_id, numero_parcela, valor, valor_juros, valor_total, data_vencimento, status
    ) VALUES (
      v_company, v_acordo_id,
      (v_item->>'numero_parcela')::int, round((v_item->>'valor')::numeric, 2),
      round(COALESCE((v_item->>'valor_juros')::numeric, 0), 2),
      round((v_item->>'valor_total')::numeric, 2), (v_item->>'data_vencimento')::date, 'pendente'
    );
  END LOOP;

  FOREACH v_titulo IN ARRAY p_titulo_ids LOOP
    INSERT INTO public.acordo_titulos (company_id, acordo_id, titulo_id)
      VALUES (v_company, v_acordo_id, v_titulo);
    PERFORM public.liquidar_parcelas_titulo(
      v_titulo, v_acordo_id, format('Liquidação por novação (acordo %s)', v_acordo_id));
  END LOOP;

  REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_parcelas_consolidadas;
  RETURN jsonb_build_object('sucesso', true, 'acordo_id', v_acordo_id);
END $function$;


-- ─── A coluna sai ──────────────────────────────────────────────────────────
-- Antes de tirar: todo acordo precisa ter o vínculo em acordo_titulos, e o
-- título da coluna precisa estar entre eles (senão perderíamos informação).
DO $$
DECLARE v int;
BEGIN
  SELECT count(*) INTO v FROM public.acordos a
   WHERE NOT EXISTS (SELECT 1 FROM public.acordo_titulos at WHERE at.acordo_id = a.id)
      OR (a.titulo_id IS NOT NULL AND NOT EXISTS (
            SELECT 1 FROM public.acordo_titulos at WHERE at.acordo_id = a.id AND at.titulo_id = a.titulo_id));
  IF v > 0 THEN RAISE EXCEPTION '% acordo(s) sem o vínculo equivalente em acordo_titulos', v; END IF;
END $$;

ALTER TABLE public.acordos DROP COLUMN titulo_id;

-- ─── Conferência ───────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT has_function_privilege('authenticated', 'public.criar_acordo(uuid[],uuid,numeric,numeric,numeric,integer,numeric,date,text,jsonb)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.excluir_titulos_definitivo(uuid[])', 'EXECUTE') THEN
    RAISE EXCEPTION 'RPC perdeu o grant';
  END IF;
  IF EXISTS (SELECT 1 FROM public.vw_recebimentos WHERE origem = 'acordo' AND titulo_pesos IS NULL) THEN
    RAISE EXCEPTION 'recebimento de acordo sem titulo_pesos';
  END IF;
END $$;
