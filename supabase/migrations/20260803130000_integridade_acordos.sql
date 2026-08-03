-- =====================================================================
-- Integridade do módulo de acordos (revisão arquitetural 2026-08-03).
-- =====================================================================
-- Cobre P1..P5 e P8 da revisão. P6 (aposentar acordos.titulo_id) e P7
-- (MV filtrar deleted_at) ficam para migration própria: exigem reconstruir a
-- materialized view e as views dependentes, risco maior, melhor isolado.

-- ============== P5. Vínculo evento -> acordo deixa de ser string ==============
-- A origem da liquidação vivia só no texto de `descricao` ('... (acordo <uuid>)').
-- Agora é coluna com FK, e o cancelamento pode filtrar por ela em vez de confiar
-- no invariante "só existe um acordo ativo por título".
ALTER TABLE public.eventos_parcela
  ADD COLUMN IF NOT EXISTS acordo_id UUID REFERENCES public.acordos(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_eventos_parcela_acordo
  ON public.eventos_parcela(acordo_id) WHERE acordo_id IS NOT NULL;

-- Backfill dos eventos antigos: o formato da descrição é determinístico.
UPDATE public.eventos_parcela e
   SET acordo_id = (substring(e.descricao from 'acordo ([0-9a-fA-F-]{36})'))::uuid
 WHERE e.tipo = 'renegociacao'
   AND e.acordo_id IS NULL
   AND e.descricao ~ 'acordo [0-9a-fA-F-]{36}'
   AND EXISTS (
     SELECT 1 FROM public.acordos a
      WHERE a.id = (substring(e.descricao from 'acordo ([0-9a-fA-F-]{36})'))::uuid
   );

-- liquidar_parcelas_titulo passa a receber o acordo. A versão de 2 argumentos sai
-- (assinatura muda), então dropamos antes de recriar.
DROP FUNCTION IF EXISTS public.liquidar_parcelas_titulo(uuid, text);

CREATE OR REPLACE FUNCTION public.liquidar_parcelas_titulo(
  p_titulo_id uuid, p_acordo_id uuid, p_motivo text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT vp.id, vp.saldo_atual
    FROM public.vw_parcelas_consolidadas vp
    WHERE vp.titulo_id = p_titulo_id AND vp.saldo_atual > 0
  LOOP
    INSERT INTO public.eventos_parcela (parcela_id, tipo, valor, efeito, descricao, acordo_id, created_by)
    VALUES (r.id, 'renegociacao', r.saldo_atual, -1, p_motivo, p_acordo_id, auth.uid());
  END LOOP;
END; $$;

-- ============== P2. Título com acordo deixa de ser purgável em cascata ==============
-- `acordos.titulo_id ... ON DELETE CASCADE` fazia o hard delete de UM título
-- apagar o acordo inteiro (e suas parcelas, inclusive pagas) — num acordo
-- multi-título, levava junto o acordo dos outros. Passa a RESTRICT: a exclusão
-- definitiva precisa ser explícita quanto ao acordo.
ALTER TABLE public.acordos DROP CONSTRAINT IF EXISTS acordos_titulo_id_fkey;
ALTER TABLE public.acordos
  ADD CONSTRAINT acordos_titulo_id_fkey
  FOREIGN KEY (titulo_id) REFERENCES public.titulos(id) ON DELETE RESTRICT;

CREATE OR REPLACE FUNCTION public.excluir_titulos_definitivo(p_titulo_ids uuid[])
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_count int; v_com_acordo int;
BEGIN
  IF NOT public.is_super_admin() THEN RAISE EXCEPTION 'Operação restrita ao super admin'; END IF;
  IF p_titulo_ids IS NULL OR array_length(p_titulo_ids, 1) IS NULL THEN
    RETURN jsonb_build_object('sucesso', true, 'excluidos', 0);
  END IF;

  -- Mensagem clara em vez do erro de FK cru.
  SELECT count(DISTINCT a.id) INTO v_com_acordo
    FROM public.acordos a
    LEFT JOIN public.acordo_titulos at ON at.acordo_id = a.id
   WHERE a.titulo_id = ANY(p_titulo_ids) OR at.titulo_id = ANY(p_titulo_ids);
  IF v_com_acordo > 0 THEN
    RAISE EXCEPTION 'Há % acordo(s) vinculado(s) a estes títulos. Exclua os acordos antes de purgar os títulos.', v_com_acordo;
  END IF;

  DELETE FROM public.agendamentos WHERE titulo_id = ANY(p_titulo_ids);
  DELETE FROM public.titulos WHERE id = ANY(p_titulo_ids);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  REFRESH MATERIALIZED VIEW public.mv_parcelas_consolidadas;
  RETURN jsonb_build_object('sucesso', true, 'excluidos', v_count);
END; $$;

-- A limpeza por empresa (super admin) apaga os acordos antes dos títulos, senão
-- o RESTRICT novo passaria a barrá-la.
CREATE OR REPLACE FUNCTION public.limpar_titulos_empresa(p_company_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_count int;
BEGIN
  IF NOT public.is_super_admin() THEN RAISE EXCEPTION 'Operação restrita ao super admin'; END IF;
  IF p_company_id IS NULL THEN RAISE EXCEPTION 'Empresa não informada'; END IF;
  DELETE FROM public.agendamentos WHERE company_id = p_company_id AND titulo_id IS NOT NULL;
  DELETE FROM public.acordos WHERE company_id = p_company_id;
  DELETE FROM public.titulos WHERE company_id = p_company_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  REFRESH MATERIALIZED VIEW public.mv_parcelas_consolidadas;
  RETURN jsonb_build_object('sucesso', true, 'excluidos', v_count, 'company_id', p_company_id);
END; $$;

-- ============== P3. Cancelar título com acordo ativo passa a ser recusado ==============
-- Antes o acordo continuava ativo apontando para um título invisível (zumbi).
-- Recusar é mais previsível que cancelar em cascata: a decisão fica com o operador.
CREATE OR REPLACE FUNCTION public.cancelar_titulo(
  p_titulo_id uuid, p_motivo text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_titulo record;
BEGIN
  IF NOT public.has_min_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Operação restrita ao administrador'; END IF;
  SELECT * INTO v_titulo FROM public.titulos
    WHERE id = p_titulo_id AND company_id = public.current_company_id();
  IF v_titulo.id IS NULL THEN RAISE EXCEPTION 'Título não encontrado'; END IF;
  IF v_titulo.status = 'cancelado' THEN RAISE EXCEPTION 'Título já cancelado'; END IF;

  IF EXISTS (
    SELECT 1 FROM public.acordo_titulos at
    JOIN public.acordos a ON a.id = at.acordo_id
    WHERE at.titulo_id = p_titulo_id AND a.status = 'ativo'
  ) THEN
    RAISE EXCEPTION 'Título possui acordo ativo. Cancele o acordo antes de cancelar o título.';
  END IF;

  UPDATE public.titulos
    SET status = 'cancelado', deleted_at = now(),
        metadata = COALESCE(metadata,'{}'::jsonb) || jsonb_build_object('motivo_cancelamento', p_motivo)
    WHERE id = p_titulo_id;
  UPDATE public.parcelas SET deleted_at = now() WHERE titulo_id = p_titulo_id AND deleted_at IS NULL;
  UPDATE public.agendamentos SET deleted_at = now() WHERE titulo_id = p_titulo_id AND deleted_at IS NULL;

  RETURN jsonb_build_object('sucesso', true, 'titulo_id', p_titulo_id, 'status', 'cancelado');
END; $$;

-- ============== P5 (cont). Cancelar acordo estorna só o que ELE liquidou ==============
CREATE OR REPLACE FUNCTION public.cancelar_acordo(p_acordo_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_min_role(auth.uid(),'financeiro') THEN RAISE EXCEPTION 'Operação restrita a financeiro/admin'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.acordos WHERE id = p_acordo_id AND company_id = public.current_company_id()) THEN
    RAISE EXCEPTION 'Acordo não encontrado';
  END IF;

  UPDATE public.acordos SET status = 'cancelado' WHERE id = p_acordo_id;

  -- Filtra por acordo_id. O `IS NULL` cobre eventos legados cuja descrição não
  -- pôde ser interpretada no backfill — para eles vale o comportamento antigo.
  UPDATE public.eventos_parcela e
    SET estornado = true
    FROM public.parcelas p
    JOIN public.acordo_titulos at ON at.titulo_id = p.titulo_id
    WHERE p.id = e.parcela_id
      AND at.acordo_id = p_acordo_id
      AND e.tipo = 'renegociacao'
      AND (e.acordo_id = p_acordo_id OR e.acordo_id IS NULL)
      AND (e.estornado IS NULL OR e.estornado = false);

  REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_parcelas_consolidadas;
  RETURN jsonb_build_object('sucesso', true, 'acordo_id', p_acordo_id);
END; $$;

-- criar_acordo repassa o acordo para a liquidação (nova assinatura de 3 args).
CREATE OR REPLACE FUNCTION public.criar_acordo(
  p_titulo_ids uuid[], p_cliente_id uuid, p_valor_original numeric, p_valor_acordo numeric,
  p_desconto numeric, p_parcelas int, p_valor_parcela numeric,
  p_data_vencimento_primeira_parcela date, p_observacoes text, p_cronograma jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_acordo_id uuid; v_company uuid; v_item jsonb; v_titulo uuid;
BEGIN
  IF NOT public.has_min_role(auth.uid(),'financeiro') THEN RAISE EXCEPTION 'Operação restrita a financeiro/admin'; END IF;
  IF p_titulo_ids IS NULL OR array_length(p_titulo_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'Selecione ao menos um título';
  END IF;
  v_company := public.current_company_id();

  INSERT INTO public.acordos (
    company_id, titulo_id, cliente_id, valor_original, valor_acordo, desconto,
    parcelas, valor_parcela, data_acordo, data_vencimento_primeira_parcela,
    status, observacoes, created_by
  ) VALUES (
    v_company, p_titulo_ids[1], p_cliente_id, p_valor_original, p_valor_acordo, p_desconto,
    p_parcelas, p_valor_parcela, CURRENT_DATE, p_data_vencimento_primeira_parcela,
    'ativo', p_observacoes, auth.uid()
  ) RETURNING id INTO v_acordo_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(p_cronograma, '[]'::jsonb)) LOOP
    INSERT INTO public.parcelas_acordo (
      company_id, acordo_id, numero_parcela, valor, valor_juros, valor_total, data_vencimento, status
    ) VALUES (
      v_company, v_acordo_id,
      (v_item->>'numero_parcela')::int, (v_item->>'valor')::numeric, (v_item->>'valor_juros')::numeric,
      (v_item->>'valor_total')::numeric, (v_item->>'data_vencimento')::date, 'pendente'
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
END; $$;

-- ============== P4. Trava de pagamento direto passa a usar acordo_titulos ==============
-- A guarda checava `acordos.titulo_id` (só o título principal), então um título
-- vinculado via acordo_titulos mas não principal ficava desprotegido — bastava
-- aplicar juros na parcela original para o saldo voltar e o pagamento passar,
-- contabilizando dinheiro fora do acordo.
CREATE OR REPLACE FUNCTION public.registrar_pagamento_parcela(
  p_parcela_id uuid, p_valor numeric, p_meio_pagamento text, p_descricao text DEFAULT NULL, p_created_by uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_saldo_atual numeric; v_tipo_evento text; v_evento_id uuid; v_parcela_info record; v_result jsonb;
BEGIN
  IF NOT public.has_min_role(auth.uid(),'operador') THEN RAISE EXCEPTION 'Sem permissão'; END IF;
  IF EXISTS (
    SELECT 1
    FROM public.parcelas p
    JOIN public.acordo_titulos at ON at.titulo_id = p.titulo_id
    JOIN public.acordos a ON a.id = at.acordo_id
    WHERE p.id = p_parcela_id AND a.status = 'ativo'
  ) THEN
    RAISE EXCEPTION 'Título renegociado: registre o pagamento nas parcelas do acordo';
  END IF;
  SELECT id, saldo_atual, status INTO v_parcela_info FROM public.vw_parcelas_consolidadas WHERE id = p_parcela_id;
  IF v_parcela_info.id IS NULL THEN RAISE EXCEPTION 'Parcela não encontrada'; END IF;
  v_saldo_atual := v_parcela_info.saldo_atual;
  IF v_parcela_info.status = 'pago' THEN RAISE EXCEPTION 'Parcela já está paga'; END IF;
  IF p_valor <= 0 THEN RAISE EXCEPTION 'Valor deve ser positivo'; END IF;
  IF p_valor > v_saldo_atual THEN RAISE EXCEPTION 'Valor excede saldo devedor'; END IF;
  v_tipo_evento := CASE WHEN p_valor >= v_saldo_atual THEN 'pagamento_total' ELSE 'pagamento_parcial' END;
  INSERT INTO public.eventos_parcela (parcela_id, tipo, valor, efeito, meio_pagamento, descricao, created_by)
  VALUES (p_parcela_id, v_tipo_evento, p_valor, -1, p_meio_pagamento,
    COALESCE(p_descricao, format('Pagamento de R$ %s via %s', p_valor, p_meio_pagamento)), COALESCE(p_created_by, auth.uid()))
  RETURNING id INTO v_evento_id;
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_parcelas_consolidadas;
  v_result := jsonb_build_object('sucesso', true, 'evento_id', v_evento_id, 'tipo', v_tipo_evento,
    'saldo_anterior', v_saldo_atual, 'saldo_atual', v_saldo_atual - p_valor, 'valor_pago', p_valor);
  INSERT INTO public.audit_log (company_id, actor_id, action, table_name, record_id, context)
  VALUES (public.current_company_id(), COALESCE(p_created_by, auth.uid()), 'rpc', 'eventos_parcela', v_evento_id,
    jsonb_build_object('rpc','registrar_pagamento_parcela','result',v_result));
  RETURN v_result;
END; $$;

-- ============== P8. 'quebrado' deixa de ser status morto ==============
-- Nada marcava parcelas_acordo como 'vencida', então o trigger update_acordo_status
-- nunca chegava a 'quebrado' e acordos abandonados ficavam 'ativo' para sempre —
-- travando novo acordo sobre o título. Esta rotina é idempotente e pode ser
-- chamada pelo app (como refresh_mv_parcelas) ou por agendamento.
CREATE OR REPLACE FUNCTION public.marcar_parcelas_acordo_vencidas()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_count int;
BEGIN
  UPDATE public.parcelas_acordo
     SET status = 'vencida', updated_at = now()
   WHERE status = 'pendente'
     AND data_vencimento < CURRENT_DATE
     AND deleted_at IS NULL;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN jsonb_build_object('sucesso', true, 'parcelas_vencidas', v_count);
END; $$;

-- ============== P1. Visão unificada de recebimento ==============
-- pagar_parcela_acordo só muda parcelas_acordo.status — nunca gera evento. Logo
-- mv_parcelas_consolidadas / vw_titulos_completos.total_pago (e o Dashboard, que
-- soma esse campo) ignoram TODO o dinheiro recuperado via acordo. Esta view une
-- as duas origens para que relatórios parem de subnotificar.
CREATE OR REPLACE VIEW public.vw_recebimentos AS
SELECT
  e.id                    AS recebimento_id,
  'titulo'::text          AS origem,
  p.company_id,
  p.titulo_id,
  NULL::uuid              AS acordo_id,
  e.valor,
  e.created_at::date      AS data_recebimento,
  e.meio_pagamento
FROM public.eventos_parcela e
JOIN public.parcelas p ON p.id = e.parcela_id
WHERE e.tipo IN ('pagamento_total','pagamento_parcial')
  AND (e.estornado IS NULL OR e.estornado = false)
UNION ALL
SELECT
  pa.id                   AS recebimento_id,
  'acordo'::text          AS origem,
  pa.company_id,
  a.titulo_id,
  pa.acordo_id,
  pa.valor_total          AS valor,
  pa.data_pagamento       AS data_recebimento,
  NULL::text              AS meio_pagamento
FROM public.parcelas_acordo pa
JOIN public.acordos a ON a.id = pa.acordo_id
WHERE pa.status = 'paga'
  AND pa.data_pagamento IS NOT NULL
  AND pa.deleted_at IS NULL
  AND a.status <> 'cancelado';

-- A view roda como owner e por isso NÃO herda a RLS das tabelas base — o
-- isolamento por tenant tem de ser explícito, como em vw_parcelas_consolidadas.
-- `authenticated` só recebe GRANT na versão filtrada.
CREATE OR REPLACE VIEW public.vw_recebimentos_tenant AS
SELECT * FROM public.vw_recebimentos
WHERE public.is_super_admin() OR company_id = public.current_company_id();

GRANT SELECT ON public.vw_recebimentos_tenant TO authenticated;
GRANT ALL ON public.vw_recebimentos TO service_role;

-- ============== Permissões ==============
REVOKE EXECUTE ON FUNCTION public.liquidar_parcelas_titulo(uuid, uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.marcar_parcelas_acordo_vencidas() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.marcar_parcelas_acordo_vencidas() TO authenticated;
GRANT  EXECUTE ON FUNCTION public.cancelar_titulo(uuid, text) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.cancelar_acordo(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
