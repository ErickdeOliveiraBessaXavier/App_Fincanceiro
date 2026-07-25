-- =====================================================================
-- Acordo com MÚLTIPLOS títulos (corrige limitação pré-existente).
-- =====================================================================
-- A UI sempre deixou selecionar vários títulos para um acordo (o valor_original
-- já somava todos), mas `acordos` só tem UM `titulo_id` — só o primeiro era
-- vinculado. Com a novação (20260724140000), só esse primeiro título era
-- liquidado; os demais ficavam abertos. Aqui introduzimos a tabela de vínculo
-- `acordo_titulos`, e criar/cancelar/liquidar passam a operar sobre TODOS os
-- títulos do acordo. `acordos.titulo_id` continua como o título "principal"
-- (representativo, p/ compatibilidade e exibição).

-- ============== 1. Tabela de vínculo acordo <-> títulos ==============
CREATE TABLE public.acordo_titulos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  acordo_id UUID NOT NULL REFERENCES public.acordos(id) ON DELETE CASCADE,
  titulo_id UUID NOT NULL REFERENCES public.titulos(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uniq_acordo_titulo UNIQUE (acordo_id, titulo_id)
);
GRANT SELECT, INSERT ON public.acordo_titulos TO authenticated;
GRANT ALL ON public.acordo_titulos TO service_role;
CREATE INDEX idx_acordo_titulos_acordo ON public.acordo_titulos(company_id, acordo_id);
CREATE INDEX idx_acordo_titulos_titulo ON public.acordo_titulos(titulo_id);
ALTER TABLE public.acordo_titulos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "acordo_titulos_select" ON public.acordo_titulos FOR SELECT TO authenticated
  USING (public.is_super_admin() OR company_id = public.current_company_id());
CREATE POLICY "acordo_titulos_insert" ON public.acordo_titulos FOR INSERT TO authenticated
  WITH CHECK (company_id = public.current_company_id() AND public.has_min_role(auth.uid(),'financeiro'));

-- ============== 2. Backfill (antes de criar os triggers) ==============
-- Todo acordo existente ganha o vínculo do seu título atual. Feito antes do
-- trigger de company_id e do guard, para não sofrer interferência.
INSERT INTO public.acordo_titulos (company_id, acordo_id, titulo_id)
  SELECT company_id, id, titulo_id FROM public.acordos;

-- ============== 3. Triggers da tabela de vínculo ==============
-- company_id automático nos inserts futuros.
CREATE TRIGGER trg_set_company_acordo_titulos BEFORE INSERT ON public.acordo_titulos
  FOR EACH ROW EXECUTE FUNCTION public.fn_set_company_id();

-- Guard: um título não pode estar em dois acordos ATIVOS ao mesmo tempo
-- (substitui o índice único parcial que existia sobre acordos.titulo_id).
CREATE OR REPLACE FUNCTION public.check_titulo_acordo_unico()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.acordo_titulos at2
    JOIN public.acordos a ON a.id = at2.acordo_id
    WHERE at2.titulo_id = NEW.titulo_id
      AND at2.acordo_id <> NEW.acordo_id
      AND a.status = 'ativo'
  ) THEN
    RAISE EXCEPTION 'Título já está vinculado a um acordo ativo';
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_check_titulo_acordo_unico BEFORE INSERT ON public.acordo_titulos
  FOR EACH ROW EXECUTE FUNCTION public.check_titulo_acordo_unico();

-- O índice único antigo (só cobria o título principal) sai: a unicidade agora
-- é garantida pelo trigger acima sobre a tabela de vínculo.
DROP INDEX IF EXISTS public.uniq_acordo_ativo_por_titulo;

-- ============== 4. criar_acordo agora recebe titulo_ids[] ==============
-- Assinatura muda (uuid -> uuid[]): dropamos a versão anterior antes de recriar.
DROP FUNCTION IF EXISTS public.criar_acordo(uuid, uuid, numeric, numeric, numeric, int, numeric, date, text, jsonb);

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

  -- Vincula e liquida TODOS os títulos do acordo (o guard barra título já em
  -- acordo ativo). A liquidação zera o saldo original de cada um (novação).
  FOREACH v_titulo IN ARRAY p_titulo_ids LOOP
    INSERT INTO public.acordo_titulos (company_id, acordo_id, titulo_id)
      VALUES (v_company, v_acordo_id, v_titulo);
    PERFORM public.liquidar_parcelas_titulo(v_titulo, format('Liquidação por novação (acordo %s)', v_acordo_id));
  END LOOP;

  REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_parcelas_consolidadas;
  RETURN jsonb_build_object('sucesso', true, 'acordo_id', v_acordo_id);
END; $$;

-- ============== 5. cancelar_acordo reverte TODOS os títulos ==============
CREATE OR REPLACE FUNCTION public.cancelar_acordo(p_acordo_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_min_role(auth.uid(),'financeiro') THEN RAISE EXCEPTION 'Operação restrita a financeiro/admin'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.acordos WHERE id = p_acordo_id AND company_id = public.current_company_id()) THEN
    RAISE EXCEPTION 'Acordo não encontrado';
  END IF;

  UPDATE public.acordos SET status = 'cancelado' WHERE id = p_acordo_id;

  -- Reverte a liquidação de todos os títulos vinculados (estorna 'renegociacao').
  UPDATE public.eventos_parcela e
    SET estornado = true
    FROM public.parcelas p
    JOIN public.acordo_titulos at ON at.titulo_id = p.titulo_id
    WHERE p.id = e.parcela_id
      AND at.acordo_id = p_acordo_id
      AND e.tipo = 'renegociacao'
      AND (e.estornado IS NULL OR e.estornado = false);

  REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_parcelas_consolidadas;
  RETURN jsonb_build_object('sucesso', true, 'acordo_id', p_acordo_id);
END; $$;

-- ============== 6. View: 'renegociado' via tabela de vínculo ==============
-- Antes checava acordos.titulo_id (só o principal). Agora qualquer título
-- vinculado a um acordo ATIVO é 'renegociado'. Demais colunas idênticas.
CREATE OR REPLACE VIEW public.vw_titulos_completos AS
SELECT
  t.id, t.company_id, t.cliente_id,
  c.nome AS cliente_nome, c.cpf_cnpj AS cliente_cpf_cnpj, c.telefone AS cliente_telefone, c.email AS cliente_email,
  t.numero_documento, t.descricao, t.valor_original, t.vencimento_original, t.metadata, t.status AS titulo_status,
  t.created_by, t.created_at, t.updated_at,
  COALESCE(p.quantidade_parcelas, 0) AS quantidade_parcelas,
  COALESCE(p.parcelas_pagas, 0) AS parcelas_pagas,
  COALESCE(p.parcelas_pendentes, 0) AS parcelas_pendentes,
  COALESCE(p.parcelas_vencidas, 0) AS parcelas_vencidas,
  COALESCE(p.total_pago, 0) AS total_pago,
  COALESCE(p.total_juros, 0) AS total_juros,
  COALESCE(p.total_multa, 0) AS total_multa,
  COALESCE(p.total_descontos, 0) AS total_descontos,
  COALESCE(p.saldo_devedor, 0) AS saldo_devedor,
  p.proximo_vencimento,
  CASE
    WHEN EXISTS (
      SELECT 1 FROM public.acordo_titulos at
      JOIN public.acordos a ON a.id = at.acordo_id
      WHERE at.titulo_id = t.id AND a.status = 'ativo'
    ) THEN 'renegociado'
    WHEN COALESCE(p.saldo_devedor, 0) <= 0 THEN 'pago'
    WHEN COALESCE(p.parcelas_vencidas, 0) > 0 THEN 'vencido'
    ELSE 'a_vencer'
  END AS status,
  CASE
    WHEN t.metadata->>'tipo' IS NOT NULL THEN t.metadata->>'tipo'
    WHEN COALESCE(p.quantidade_parcelas, 0) > 1 THEN 'parcelado'
    ELSE 'avista'
  END AS tipo,
  c.cobrador_id, c.vendedor_id
FROM public.titulos t
LEFT JOIN public.clientes c ON c.id = t.cliente_id
LEFT JOIN (
  SELECT titulo_id,
    COUNT(*) AS quantidade_parcelas,
    COUNT(*) FILTER (WHERE status = 'pago') AS parcelas_pagas,
    COUNT(*) FILTER (WHERE status = 'a_vencer') AS parcelas_pendentes,
    COUNT(*) FILTER (WHERE status = 'vencido') AS parcelas_vencidas,
    SUM(total_pago) AS total_pago, SUM(juros) AS total_juros, SUM(multa) AS total_multa,
    SUM(descontos) AS total_descontos, SUM(saldo_atual) AS saldo_devedor,
    MIN(vencimento) FILTER (WHERE status != 'pago') AS proximo_vencimento
  FROM public.mv_parcelas_consolidadas GROUP BY titulo_id
) p ON p.titulo_id = t.id
WHERE t.deleted_at IS NULL
  AND (public.is_super_admin()
       OR (t.company_id = public.current_company_id()
           AND ((public.current_cobrador_id() IS NULL AND public.current_vendedor_id() IS NULL)
                OR public.cobrador_ve_cliente(t.cliente_id))));

-- ============== 7. Permissões ==============
REVOKE EXECUTE ON FUNCTION public.criar_acordo(uuid[], uuid, numeric, numeric, numeric, int, numeric, date, text, jsonb) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.criar_acordo(uuid[], uuid, numeric, numeric, numeric, int, numeric, date, text, jsonb) TO authenticated;

NOTIFY pgrst, 'reload schema';
