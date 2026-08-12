-- ============================================================================
-- Razão financeiro único: movimentos_financeiros
--
-- Havia DOIS razões paralelos — `eventos_parcela` (parcela de título) e
-- `eventos_parcela_acordo` (parcela de acordo) — com os mesmos tipos, o mesmo
-- cálculo de saldo e o mesmo estorno, escritos duas vezes. Essa divisão é a
-- causa estrutural da assimetria que o diagnóstico encontrou: o estorno nasceu
-- como funcionalidade do módulo Título e nunca chegou ao Acordo, justamente
-- onde o dinheiro entra parcelado.
--
-- Agora é uma tabela só, com alvo exclusivo: cada movimento aponta para uma
-- parcela de título OU para uma parcela de acordo, nunca as duas, nunca
-- nenhuma (CHECK). Toda operação financeira nova nasce valendo para os dois.
--
-- ============================================================================
-- CORREÇÃO DE DADO: o estorno de título dobrava a dívida
--
-- `estornar_evento_parcela` marcava o movimento original como estornado — o
-- que já o tira da soma, porque as views filtram estornados — E AINDA lançava
-- um contra-movimento com `efeito * -1`. O saldo era corrigido duas vezes.
--
-- Reproduzido no banco local: parcela de R$ 1.000, paga e estornada, ficava
-- com saldo de R$ 2.000 em vez de R$ 1.000.
--
-- O estorno correto tem efeito 0: ele REGISTRA que o original deixou de valer,
-- não soma nada. É como o lado do acordo já fazia. Esta migration zera o
-- efeito dos estornos existentes e recalcula a MV.
-- ============================================================================

-- ============== 1. Unificação da tabela ==============
ALTER TABLE public.eventos_parcela RENAME TO movimentos_financeiros;
ALTER TABLE public.movimentos_financeiros RENAME COLUMN parcela_id TO parcela_titulo_id;

ALTER TABLE public.movimentos_financeiros
  ALTER COLUMN parcela_titulo_id DROP NOT NULL;

ALTER TABLE public.movimentos_financeiros
  ADD COLUMN IF NOT EXISTS parcela_acordo_id uuid
    REFERENCES public.parcelas_acordo(id) ON DELETE CASCADE;

-- Data de NEGÓCIO do lançamento. Entra nula de propósito: com DEFAULT já na
-- criação da coluna, toda linha antiga receberia a data de hoje.
ALTER TABLE public.movimentos_financeiros
  ADD COLUMN IF NOT EXISTS data_evento date;

UPDATE public.movimentos_financeiros
   SET data_evento = created_at::date
 WHERE data_evento IS NULL;

ALTER TABLE public.movimentos_financeiros
  ALTER COLUMN data_evento SET DEFAULT CURRENT_DATE,
  ALTER COLUMN data_evento SET NOT NULL;

COMMENT ON TABLE public.movimentos_financeiros IS
  'Razão append-only de TODO movimento de dinheiro: pagamento, encargo, desconto, renegociação e estorno. Alvo exclusivo: parcela de título OU de acordo.';
COMMENT ON COLUMN public.movimentos_financeiros.parcela_titulo_id IS
  'Parcela de TÍTULO. Nulo quando o movimento é de parcela de acordo.';
COMMENT ON COLUMN public.movimentos_financeiros.parcela_acordo_id IS
  'Parcela de ACORDO. Nulo quando o movimento é de parcela de título.';
COMMENT ON COLUMN public.movimentos_financeiros.data_evento IS
  'Data de negócio informada pelo operador. created_at é quando foi digitado.';

-- ============== 2. Migração das linhas do razão de acordo ==============
-- Os ids são preservados para que `estornado_por_id` continue apontando para o
-- lançamento certo. Vem em duas etapas porque a FK aponta para a própria
-- tabela: se o alvo do ponteiro entrasse depois, a restrição falharia.
INSERT INTO public.movimentos_financeiros
  (id, company_id, parcela_acordo_id, tipo, valor, efeito, data_evento,
   descricao, meio_pagamento, metadata, created_by, created_at, estornado)
SELECT
  e.id, e.company_id, e.parcela_acordo_id, e.tipo, e.valor, e.efeito, e.data_evento,
  e.descricao, e.meio_pagamento, e.metadata, e.created_by, e.created_at, e.estornado
FROM public.eventos_parcela_acordo e;

UPDATE public.movimentos_financeiros m
   SET estornado_por_id = e.estornado_por_id
  FROM public.eventos_parcela_acordo e
 WHERE e.id = m.id AND e.estornado_por_id IS NOT NULL;


-- ============== 3. Alvo exclusivo ==============
ALTER TABLE public.movimentos_financeiros
  DROP CONSTRAINT IF EXISTS movimentos_alvo_exclusivo;
ALTER TABLE public.movimentos_financeiros
  ADD CONSTRAINT movimentos_alvo_exclusivo
  CHECK ((parcela_titulo_id IS NOT NULL) <> (parcela_acordo_id IS NOT NULL));

CREATE INDEX IF NOT EXISTS idx_movimentos_parcela_acordo
  ON public.movimentos_financeiros(company_id, parcela_acordo_id)
  WHERE parcela_acordo_id IS NOT NULL;

-- ============== 4. Correção do estorno em dobro ==============
-- Informa quantos lançamentos entram na correção: é o número de estornos que
-- deixaram um saldo inflado por aí.
DO $$
DECLARE v_qtd int;
BEGIN
  SELECT count(*) INTO v_qtd FROM public.movimentos_financeiros
   WHERE tipo = 'estorno' AND efeito <> 0;
  RAISE NOTICE 'Estornos com efeito duplicado a corrigir: %', v_qtd;
END $$;

UPDATE public.movimentos_financeiros
   SET efeito = 0
 WHERE tipo = 'estorno' AND efeito <> 0;

-- ============== 5. Escrita só pelas RPCs ==============
-- Um razão financeiro não pode aceitar INSERT solto do cliente: o saldo
-- deixaria de ser confiável. Nenhuma tela grava direto — as duas que tocam a
-- tabela no front apenas leem.
DROP POLICY IF EXISTS "eventos_insert" ON public.movimentos_financeiros;
DROP POLICY IF EXISTS "eventos_update" ON public.movimentos_financeiros;

-- ============== 6. Saldo da parcela de acordo ==============
-- Esta view e a de recebimentos ainda apontam para eventos_parcela_acordo:
-- precisam ser recriadas sobre o razão único ANTES de a tabela antiga sair.
CREATE OR REPLACE VIEW public.vw_parcelas_acordo_consolidadas AS
SELECT
  pa.id,
  pa.company_id,
  pa.acordo_id,
  pa.numero_parcela,
  pa.valor,
  pa.valor_juros,
  pa.valor_total,
  pa.data_vencimento,
  pa.data_pagamento,
  COALESCE(SUM(m.valor) FILTER (WHERE m.tipo IN ('pagamento_total','pagamento_parcial') AND NOT m.estornado), 0) AS total_pago,
  COALESCE(SUM(m.valor) FILTER (WHERE m.tipo IN ('juros_aplicado','multa_aplicada') AND NOT m.estornado), 0) AS encargos,
  COALESCE(SUM(m.valor) FILTER (WHERE m.tipo = 'desconto_concedido' AND NOT m.estornado), 0) AS descontos,
  pa.valor_total + COALESCE(SUM(m.valor * m.efeito) FILTER (WHERE NOT m.estornado), 0) AS saldo_atual,
  CASE
    WHEN pa.valor_total + COALESCE(SUM(m.valor * m.efeito) FILTER (WHERE NOT m.estornado), 0) <= 0 THEN 'paga'
    WHEN pa.data_vencimento < CURRENT_DATE THEN 'vencida'
    ELSE 'pendente'
  END AS status
FROM public.parcelas_acordo pa
LEFT JOIN public.movimentos_financeiros m ON m.parcela_acordo_id = pa.id
WHERE pa.deleted_at IS NULL
GROUP BY pa.id, pa.company_id, pa.acordo_id, pa.numero_parcela, pa.valor,
         pa.valor_juros, pa.valor_total, pa.data_vencimento, pa.data_pagamento;

-- ============== 7. Recebimentos: um razão, uma consulta ==============
-- Eram dois SELECT unidos por UNION ALL, um por tabela. Com o razão único, a
-- origem passa a ser derivada do alvo do movimento.
CREATE OR REPLACE VIEW public.vw_recebimentos AS
SELECT
  m.id                                                   AS recebimento_id,
  (CASE WHEN m.parcela_titulo_id IS NOT NULL
        THEN 'titulo' ELSE 'acordo' END)::text           AS origem,
  m.company_id,
  COALESCE(pt.titulo_id, a.titulo_id)                    AS titulo_id,
  pa.acordo_id,
  m.valor::numeric                                       AS valor,
  m.data_evento                                          AS data_recebimento,
  m.meio_pagamento
FROM public.movimentos_financeiros m
LEFT JOIN public.parcelas pt        ON pt.id = m.parcela_titulo_id
LEFT JOIN public.parcelas_acordo pa ON pa.id = m.parcela_acordo_id
LEFT JOIN public.acordos a          ON a.id = pa.acordo_id
WHERE m.tipo IN ('pagamento_total','pagamento_parcial')
  AND NOT COALESCE(m.estornado, false)
  AND (
    m.parcela_titulo_id IS NOT NULL
    OR (pa.deleted_at IS NULL AND a.status <> 'cancelado')
  );

-- ============== 8. Fim do razão paralelo ==============
DROP TABLE public.eventos_parcela_acordo;

-- ============== 9. Funções que escrevem no razão ==============
-- Reescritas a partir da definição que estava no banco, trocando o nome da
-- tabela e o da coluna. Nenhuma regra de negócio muda aqui.

CREATE OR REPLACE FUNCTION public.aplicar_encargo_parcela(p_parcela_id uuid, p_tipo text, p_valor numeric, p_descricao text DEFAULT NULL::text, p_created_by uuid DEFAULT NULL::uuid, p_motivo text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_saldo_atual numeric; v_evento_id uuid; v_result jsonb;
BEGIN
  IF NOT public.has_min_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Operação restrita ao administrador'; END IF;
  IF p_tipo NOT IN ('juros_aplicado','multa_aplicada') THEN RAISE EXCEPTION 'Tipo inválido'; END IF;
  SELECT saldo_atual INTO v_saldo_atual FROM public.vw_parcelas_consolidadas WHERE id = p_parcela_id;
  IF v_saldo_atual IS NULL THEN RAISE EXCEPTION 'Parcela não encontrada'; END IF;
  INSERT INTO public.movimentos_financeiros (parcela_titulo_id, tipo, valor, efeito, descricao, created_by)
  VALUES (p_parcela_id, p_tipo, p_valor, 1,
    COALESCE(p_descricao, format('%s de R$ %s aplicado', CASE WHEN p_tipo='juros_aplicado' THEN 'Juros' ELSE 'Multa' END, p_valor)),
    COALESCE(p_created_by, auth.uid()))
  RETURNING id INTO v_evento_id;
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_parcelas_consolidadas;
  v_result := jsonb_build_object('sucesso',true,'evento_id',v_evento_id,'saldo_anterior',v_saldo_atual,'saldo_atual',v_saldo_atual+p_valor);
  INSERT INTO public.audit_log (company_id, actor_id, action, table_name, record_id, context)
  VALUES (public.current_company_id(), COALESCE(p_created_by, auth.uid()),'rpc','movimentos_financeiros',v_evento_id, jsonb_build_object('rpc','aplicar_encargo_parcela','result',v_result));
  RETURN v_result;
END; $function$;

CREATE OR REPLACE FUNCTION public.cancelar_acordo(p_acordo_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.has_min_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Operação restrita ao administrador'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.acordos WHERE id = p_acordo_id AND company_id = public.current_company_id()) THEN
    RAISE EXCEPTION 'Acordo não encontrado';
  END IF;

  UPDATE public.acordos SET status = 'cancelado' WHERE id = p_acordo_id;

  UPDATE public.movimentos_financeiros e
    SET estornado = true
    FROM public.parcelas p
    JOIN public.acordo_titulos at ON at.titulo_id = p.titulo_id
    WHERE p.id = e.parcela_titulo_id
      AND at.acordo_id = p_acordo_id
      AND e.tipo = 'renegociacao'
      AND (e.acordo_id = p_acordo_id OR e.acordo_id IS NULL)
      AND (e.estornado IS NULL OR e.estornado = false);

  REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_parcelas_consolidadas;
  RETURN jsonb_build_object('sucesso', true, 'acordo_id', p_acordo_id);
END; $function$;

CREATE OR REPLACE FUNCTION public.conceder_desconto_parcela(p_parcela_id uuid, p_valor numeric, p_descricao text DEFAULT NULL::text, p_created_by uuid DEFAULT NULL::uuid, p_motivo text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_saldo_atual numeric; v_evento_id uuid; v_result jsonb;
BEGIN
  IF NOT public.has_min_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Operação restrita ao administrador'; END IF;
  SELECT saldo_atual INTO v_saldo_atual FROM public.vw_parcelas_consolidadas WHERE id = p_parcela_id;
  IF v_saldo_atual IS NULL THEN RAISE EXCEPTION 'Parcela não encontrada'; END IF;
  IF p_valor > v_saldo_atual THEN RAISE EXCEPTION 'Desconto excede saldo'; END IF;
  INSERT INTO public.movimentos_financeiros (parcela_titulo_id, tipo, valor, efeito, descricao, created_by)
  VALUES (p_parcela_id,'desconto_concedido',p_valor,-1, COALESCE(p_descricao, format('Desconto de R$ %s concedido', p_valor)), COALESCE(p_created_by, auth.uid()))
  RETURNING id INTO v_evento_id;
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_parcelas_consolidadas;
  v_result := jsonb_build_object('sucesso',true,'evento_id',v_evento_id,'saldo_anterior',v_saldo_atual,'saldo_atual',v_saldo_atual-p_valor);
  INSERT INTO public.audit_log (company_id, actor_id, action, table_name, record_id, context)
  VALUES (public.current_company_id(), COALESCE(p_created_by, auth.uid()),'rpc','movimentos_financeiros',v_evento_id, jsonb_build_object('rpc','conceder_desconto_parcela','result',v_result));
  RETURN v_result;
END; $function$;

CREATE OR REPLACE FUNCTION public.criar_evento_emissao_parcela()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_total_parcelas INTEGER; v_created_by UUID; v_company UUID;
BEGIN
  SELECT COUNT(*) INTO v_total_parcelas FROM public.parcelas p WHERE p.titulo_id = NEW.titulo_id;
  SELECT t.created_by, t.company_id INTO v_created_by, v_company FROM public.titulos t WHERE t.id = NEW.titulo_id;
  INSERT INTO public.movimentos_financeiros (company_id, parcela_titulo_id, tipo, valor, efeito, descricao, created_by)
  VALUES (v_company, NEW.id, 'emissao_parcela', NEW.valor_nominal, 0,
    format('Parcela %s/%s emitida - Vencimento: %s', NEW.numero_parcela, v_total_parcelas, to_char(NEW.vencimento, 'DD/MM/YYYY')), v_created_by);
  RETURN NEW;
END; $function$;

CREATE OR REPLACE FUNCTION public.importar_titulo_completo(p_company_id uuid, p_cliente_nome text, p_cpf_cnpj text, p_numero_documento text, p_parcelas jsonb, p_contato text DEFAULT NULL::text, p_descricao text DEFAULT NULL::text, p_cobrador text DEFAULT NULL::text, p_vendedor text DEFAULT NULL::text, p_cidade text DEFAULT NULL::text, p_estado text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_company uuid;
  v_is_super boolean := public.is_super_admin();
  v_cliente_id uuid;
  v_cobrador_id uuid;
  v_vendedor_id uuid;
  v_titulo_id uuid;
  v_parcela_id uuid;
  v_doc text := NULLIF(trim(coalesce(p_numero_documento,'')), '');
  v_cidade text := NULLIF(trim(coalesce(p_cidade,'')), '');
  v_estado text := NULLIF(trim(coalesce(p_estado,'')), '');
  v_cpf text := regexp_replace(coalesce(p_cpf_cnpj,''), '[^0-9]', '', 'g');
  v_parc jsonb;
  v_num int;
  v_valor numeric;
  v_venc date;
  v_pago boolean;
  v_total numeric := 0;
  v_venc_min date;
  v_inseridas int := 0;
BEGIN
  -- Empresa efetiva + permissão
  IF v_is_super THEN
    v_company := p_company_id;
    IF v_company IS NULL THEN RAISE EXCEPTION 'Selecione a empresa de destino'; END IF;
  ELSE
    IF NOT public.has_min_role(auth.uid(), 'admin') THEN
      RAISE EXCEPTION 'Apenas administradores podem importar';
    END IF;
    v_company := public.current_company_id();
    IF p_company_id IS NOT NULL AND p_company_id <> v_company THEN
      RAISE EXCEPTION 'Empresa inválida para este usuário';
    END IF;
  END IF;
  IF v_company IS NULL THEN RAISE EXCEPTION 'Empresa não identificada'; END IF;

  -- Validações básicas
  IF length(v_cpf) NOT IN (11, 14) THEN RAISE EXCEPTION 'CPF/CNPJ inválido'; END IF;
  IF coalesce(trim(p_cliente_nome),'') = '' THEN RAISE EXCEPTION 'Nome do cliente obrigatório'; END IF;
  IF p_parcelas IS NULL OR jsonb_typeof(p_parcelas) <> 'array' OR jsonb_array_length(p_parcelas) = 0 THEN
    RAISE EXCEPTION 'Título sem parcelas';
  END IF;

  -- Cobrador (opcional)
  IF p_cobrador IS NOT NULL AND length(trim(p_cobrador)) > 0 THEN
    SELECT id INTO v_cobrador_id FROM public.cobradores
      WHERE company_id = v_company AND lower(nome) = lower(trim(p_cobrador)) AND deleted_at IS NULL;
    IF v_cobrador_id IS NULL THEN
      INSERT INTO public.cobradores (company_id, nome, created_by)
      VALUES (v_company, trim(p_cobrador), auth.uid()) RETURNING id INTO v_cobrador_id;
    END IF;
  END IF;

  -- Vendedor (opcional)
  IF p_vendedor IS NOT NULL AND length(trim(p_vendedor)) > 0 THEN
    SELECT id INTO v_vendedor_id FROM public.vendedores
      WHERE company_id = v_company AND lower(nome) = lower(trim(p_vendedor)) AND deleted_at IS NULL;
    IF v_vendedor_id IS NULL THEN
      INSERT INTO public.vendedores (company_id, nome, created_by)
      VALUES (v_company, trim(p_vendedor), auth.uid()) RETURNING id INTO v_vendedor_id;
    END IF;
  END IF;

  -- Cliente
  SELECT id INTO v_cliente_id FROM public.clientes
    WHERE company_id = v_company AND cpf_cnpj = v_cpf;
  IF v_cliente_id IS NULL THEN
    INSERT INTO public.clientes (company_id, nome, cpf_cnpj, telefone, cidade, estado, cobrador_id, vendedor_id, created_by, status)
    VALUES (v_company, trim(p_cliente_nome), v_cpf, NULLIF(trim(coalesce(p_contato,'')),''), v_cidade, v_estado, v_cobrador_id, v_vendedor_id, auth.uid(), 'ativo')
    RETURNING id INTO v_cliente_id;
  ELSE
    UPDATE public.clientes SET
      cobrador_id = COALESCE(v_cobrador_id, cobrador_id),
      vendedor_id = COALESCE(v_vendedor_id, vendedor_id),
      cidade = COALESCE(v_cidade, cidade),
      estado = COALESCE(v_estado, estado)
    WHERE id = v_cliente_id;
  END IF;

  -- Pré-cálculo
  FOR v_parc IN SELECT jsonb_array_elements(p_parcelas) LOOP
    v_valor := (v_parc->>'valor')::numeric;
    v_venc  := (v_parc->>'vencimento')::date;
    IF v_valor IS NULL OR v_valor <= 0 THEN RAISE EXCEPTION 'Valor de parcela inválido'; END IF;
    IF v_venc IS NULL THEN RAISE EXCEPTION 'Vencimento de parcela inválido'; END IF;
    v_total := v_total + v_valor;
    IF v_venc_min IS NULL OR v_venc < v_venc_min THEN v_venc_min := v_venc; END IF;
  END LOOP;

  -- Título
  IF v_doc IS NOT NULL THEN
    SELECT id INTO v_titulo_id FROM public.titulos
      WHERE company_id = v_company AND numero_documento = v_doc AND deleted_at IS NULL;
  END IF;
  IF v_titulo_id IS NULL THEN
    INSERT INTO public.titulos (company_id, cliente_id, numero_documento, valor_original, vencimento_original, descricao, created_by)
    VALUES (v_company, v_cliente_id, v_doc, v_total, v_venc_min, NULLIF(trim(coalesce(p_descricao,'')),''), auth.uid())
    RETURNING id INTO v_titulo_id;
  END IF;

  -- Parcelas (idempotente com suporte a pagamento)
  FOR v_parc IN SELECT jsonb_array_elements(p_parcelas) LOOP
    v_num   := (v_parc->>'numero')::int;
    v_valor := (v_parc->>'valor')::numeric;
    v_venc  := (v_parc->>'vencimento')::date;
    v_pago  := COALESCE((v_parc->>'pago')::boolean, false);

    INSERT INTO public.parcelas (company_id, titulo_id, numero_parcela, valor_nominal, vencimento)
    VALUES (v_company, v_titulo_id, v_num, v_valor, v_venc)
    ON CONFLICT (titulo_id, numero_parcela) DO UPDATE SET
      valor_nominal = EXCLUDED.valor_nominal,
      vencimento = EXCLUDED.vencimento
    RETURNING id INTO v_parcela_id;

    -- Se marcado como pago, registra o evento se ainda não houver pagamento
    IF v_pago THEN
      IF NOT EXISTS (
        SELECT 1 FROM public.movimentos_financeiros 
        WHERE parcela_titulo_id = v_parcela_id AND tipo IN ('pagamento_total', 'pagamento_parcial') AND estornado = false
      ) THEN
        INSERT INTO public.movimentos_financeiros (company_id, parcela_titulo_id, tipo, valor, efeito, descricao, created_by)
        VALUES (v_company, v_parcela_id, 'pagamento_total', v_valor, -1, 'Pagamento importado via planilha', auth.uid());
      END IF;
    END IF;

    v_inseridas := v_inseridas + 1;
  END LOOP;

  -- Recalcula totais do título
  UPDATE public.titulos t SET
    valor_original = COALESCE((SELECT sum(valor_nominal) FROM public.parcelas WHERE titulo_id = t.id AND deleted_at IS NULL), t.valor_original),
    vencimento_original = COALESCE((SELECT min(vencimento) FROM public.parcelas WHERE titulo_id = t.id AND deleted_at IS NULL), t.vencimento_original)
  WHERE t.id = v_titulo_id;

  RETURN jsonb_build_object(
    'sucesso', true,
    'titulo_id', v_titulo_id,
    'cliente_id', v_cliente_id,
    'parcelas_processadas', v_inseridas
  );
END; $function$;

CREATE OR REPLACE FUNCTION public.liquidar_parcelas_titulo(p_titulo_id uuid, p_acordo_id uuid, p_motivo text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT vp.id, vp.saldo_atual
    FROM public.vw_parcelas_consolidadas vp
    WHERE vp.titulo_id = p_titulo_id AND vp.saldo_atual > 0
  LOOP
    INSERT INTO public.movimentos_financeiros (parcela_titulo_id, tipo, valor, efeito, descricao, acordo_id, created_by)
    VALUES (r.id, 'renegociacao', r.saldo_atual, -1, p_motivo, p_acordo_id, auth.uid());
  END LOOP;
END; $function$;

CREATE OR REPLACE FUNCTION public.pagar_parcela_acordo(p_parcela_acordo_id uuid, p_valor numeric, p_data_pagamento date DEFAULT NULL::date, p_meio_pagamento text DEFAULT NULL::text, p_descricao text DEFAULT NULL::text, p_desconto numeric DEFAULT 0, p_motivo_desconto text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_parcela record;
  v_saldo numeric;
  v_data date;
  v_desconto numeric;
  v_excedente numeric;
  v_tipo text;
  v_evento_id uuid;
  v_resultado jsonb;
BEGIN
  IF NOT public.has_min_role(auth.uid(), 'operador') THEN
    RAISE EXCEPTION 'Sem permissão';
  END IF;
  IF p_valor IS NULL OR p_valor <= 0 THEN
    RAISE EXCEPTION 'Valor deve ser positivo';
  END IF;

  SELECT * INTO v_parcela FROM public.parcelas_acordo
    WHERE id = p_parcela_acordo_id AND company_id = public.current_company_id();
  IF v_parcela.id IS NULL THEN
    RAISE EXCEPTION 'Parcela do acordo não encontrada';
  END IF;

  SELECT saldo_atual INTO v_saldo
    FROM public.vw_parcelas_acordo_consolidadas WHERE id = p_parcela_acordo_id;
  IF v_saldo <= 0 THEN
    RAISE EXCEPTION 'Parcela do acordo já está quitada';
  END IF;

  v_data := COALESCE(p_data_pagamento, CURRENT_DATE);
  v_desconto := COALESCE(p_desconto, 0);

  IF v_desconto > 0 THEN
    IF p_motivo_desconto IS NULL OR btrim(p_motivo_desconto) = '' THEN
      RAISE EXCEPTION 'Motivo do desconto é obrigatório';
    END IF;
    IF v_desconto >= v_saldo THEN
      RAISE EXCEPTION 'Desconto não pode zerar ou exceder o saldo da parcela';
    END IF;
    PERFORM public.validar_desconto_acordo(
      v_parcela.company_id, v_parcela.valor_total, v_desconto, v_data, v_parcela.data_vencimento);

    INSERT INTO public.movimentos_financeiros
      (company_id, parcela_acordo_id, tipo, valor, efeito, data_evento, descricao, created_by)
    VALUES (v_parcela.company_id, p_parcela_acordo_id, 'desconto_concedido', v_desconto, -1, v_data,
      format('Desconto por antecipação: %s', p_motivo_desconto), auth.uid());

    v_saldo := v_saldo - v_desconto;
  END IF;

  -- Recebido acima do saldo é encargo de atraso: entra como juros ANTES do
  -- pagamento, para o saldo nunca ficar negativo e para o relatório conseguir
  -- responder quanto entrou de juros. Não confundir com parcelas_acordo.valor_juros,
  -- que é o juros do PARCELAMENTO, definido na criação do acordo.
  v_excedente := p_valor - v_saldo;
  IF v_excedente > 0 THEN
    INSERT INTO public.movimentos_financeiros
      (company_id, parcela_acordo_id, tipo, valor, efeito, data_evento, descricao, created_by)
    VALUES (v_parcela.company_id, p_parcela_acordo_id, 'juros_aplicado', v_excedente, 1, v_data,
      format('Encargo por atraso: R$ %s', to_char(v_excedente, 'FM999999990.00')), auth.uid());
  END IF;

  -- Abaixo do saldo é pagamento PARCIAL: a parcela continua aberta pela
  -- diferença.
  v_tipo := CASE WHEN p_valor >= v_saldo THEN 'pagamento_total' ELSE 'pagamento_parcial' END;

  INSERT INTO public.movimentos_financeiros
    (company_id, parcela_acordo_id, tipo, valor, efeito, data_evento, descricao, meio_pagamento, created_by)
  VALUES (v_parcela.company_id, p_parcela_acordo_id, v_tipo, p_valor, -1, v_data,
    COALESCE(p_descricao, format('Pagamento de R$ %s', to_char(p_valor, 'FM999999990.00'))),
    p_meio_pagamento, auth.uid())
  RETURNING id INTO v_evento_id;

  v_resultado := public.sincronizar_parcela_acordo(p_parcela_acordo_id)
                 || jsonb_build_object('sucesso', true, 'evento_id', v_evento_id, 'tipo', v_tipo,
                                       'desconto', v_desconto);

  INSERT INTO public.audit_log (company_id, actor_id, action, table_name, record_id, context)
  VALUES (v_parcela.company_id, auth.uid(), 'rpc', 'movimentos_financeiros', v_evento_id,
    jsonb_build_object('rpc','pagar_parcela_acordo','valor',p_valor,'desconto',v_desconto,'result',v_resultado));

  RETURN v_resultado;
END; $function$;

CREATE OR REPLACE FUNCTION public.registrar_pagamento_parcela(p_parcela_id uuid, p_valor numeric, p_meio_pagamento text, p_descricao text DEFAULT NULL::text, p_created_by uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  INSERT INTO public.movimentos_financeiros (parcela_titulo_id, tipo, valor, efeito, meio_pagamento, descricao, created_by)
  VALUES (p_parcela_id, v_tipo_evento, p_valor, -1, p_meio_pagamento,
    COALESCE(p_descricao, format('Pagamento de R$ %s via %s', p_valor, p_meio_pagamento)), COALESCE(p_created_by, auth.uid()))
  RETURNING id INTO v_evento_id;
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_parcelas_consolidadas;
  v_result := jsonb_build_object('sucesso', true, 'evento_id', v_evento_id, 'tipo', v_tipo_evento,
    'saldo_anterior', v_saldo_atual, 'saldo_atual', v_saldo_atual - p_valor, 'valor_pago', p_valor);
  INSERT INTO public.audit_log (company_id, actor_id, action, table_name, record_id, context)
  VALUES (public.current_company_id(), COALESCE(p_created_by, auth.uid()), 'rpc', 'movimentos_financeiros', v_evento_id,
    jsonb_build_object('rpc','registrar_pagamento_parcela','result',v_result));
  RETURN v_result;
END; $function$;

CREATE OR REPLACE FUNCTION public.sincronizar_parcela_acordo(p_parcela_acordo_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_saldo numeric;
  v_status text;
  v_data date;
BEGIN
  SELECT saldo_atual, status INTO v_saldo, v_status
    FROM public.vw_parcelas_acordo_consolidadas WHERE id = p_parcela_acordo_id;

  -- Quitada => data do último pagamento não estornado. Em aberto => sem data.
  SELECT MAX(data_evento) INTO v_data
    FROM public.movimentos_financeiros
   WHERE parcela_acordo_id = p_parcela_acordo_id
     AND tipo IN ('pagamento_total','pagamento_parcial')
     AND NOT estornado;

  UPDATE public.parcelas_acordo
     SET status = v_status,
         data_pagamento = CASE WHEN v_status = 'paga' THEN v_data ELSE NULL END,
         updated_at = now()
   WHERE id = p_parcela_acordo_id;

  RETURN jsonb_build_object('saldo_atual', v_saldo, 'status', v_status);
END; $function$;

-- ============== 10. Estorno único ==============
-- Antes eram duas funções idênticas em intenção, uma por razão. Agora é uma
-- só, que descobre o alvo pelo próprio movimento.
DROP FUNCTION IF EXISTS public.estornar_evento_parcela(uuid, text, uuid);
DROP FUNCTION IF EXISTS public.estornar_evento_parcela_acordo(uuid, text);

CREATE OR REPLACE FUNCTION public.estornar_movimento(
  p_movimento_id uuid,
  p_motivo       text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_mov record;
  v_estorno_id uuid;
  v_resultado jsonb;
BEGIN
  -- Estornar é correção de erro operacional: um degrau acima de quem lança.
  IF NOT public.has_min_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Operação restrita ao administrador';
  END IF;
  IF p_motivo IS NULL OR btrim(p_motivo) = '' THEN
    RAISE EXCEPTION 'Motivo do estorno é obrigatório';
  END IF;

  SELECT * INTO v_mov FROM public.movimentos_financeiros
   WHERE id = p_movimento_id AND company_id = public.current_company_id();
  IF v_mov.id IS NULL THEN
    RAISE EXCEPTION 'Lançamento não encontrado';
  END IF;
  IF v_mov.estornado THEN
    RAISE EXCEPTION 'Lançamento já estornado';
  END IF;
  IF v_mov.tipo IN ('emissao_parcela','estorno') THEN
    RAISE EXCEPTION 'Este lançamento não pode ser estornado';
  END IF;

  -- Efeito 0: o estorno REGISTRA que o original deixou de valer; quem tira o
  -- valor da conta é a marca `estornado`, que as views filtram. Lançar um
  -- contra-movimento aqui corrigiria o saldo duas vezes — era o defeito do
  -- estorno de título até esta migration.
  INSERT INTO public.movimentos_financeiros
    (company_id, parcela_titulo_id, parcela_acordo_id, tipo, valor, efeito,
     data_evento, descricao, created_by, estornado_por_id)
  VALUES (v_mov.company_id, v_mov.parcela_titulo_id, v_mov.parcela_acordo_id,
    'estorno', v_mov.valor, 0, CURRENT_DATE,
    format('Estorno de %s: %s', v_mov.tipo, p_motivo), auth.uid(), p_movimento_id)
  RETURNING id INTO v_estorno_id;

  UPDATE public.movimentos_financeiros
     SET estornado = true, estornado_por_id = v_estorno_id
   WHERE id = p_movimento_id;

  -- Cada lado recalcula do seu jeito: título pela MV, acordo por sincronização.
  IF v_mov.parcela_acordo_id IS NOT NULL THEN
    v_resultado := public.sincronizar_parcela_acordo(v_mov.parcela_acordo_id);
  ELSE
    REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_parcelas_consolidadas;
    v_resultado := jsonb_build_object();
  END IF;

  v_resultado := v_resultado || jsonb_build_object(
    'sucesso', true, 'estorno_id', v_estorno_id, 'tipo_estornado', v_mov.tipo);

  INSERT INTO public.audit_log (company_id, actor_id, action, table_name, record_id, context)
  VALUES (v_mov.company_id, auth.uid(), 'rpc', 'movimentos_financeiros', p_movimento_id,
    jsonb_build_object('rpc','estornar_movimento','motivo',p_motivo,'result',v_resultado));

  RETURN v_resultado;
END; $fn$;

REVOKE EXECUTE ON FUNCTION public.estornar_movimento(uuid, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.estornar_movimento(uuid, text) TO authenticated;

COMMENT ON FUNCTION public.estornar_movimento(uuid, text) IS
  'Desfaz UM lançamento do razão, de parcela de título ou de acordo (admin+, motivo obrigatório).';

-- ============== 11. Recalcula a MV com os estornos corrigidos ==============
REFRESH MATERIALIZED VIEW public.mv_parcelas_consolidadas;

GRANT SELECT ON public.movimentos_financeiros TO authenticated;
GRANT ALL ON public.movimentos_financeiros TO service_role;

NOTIFY pgrst, 'reload schema';
