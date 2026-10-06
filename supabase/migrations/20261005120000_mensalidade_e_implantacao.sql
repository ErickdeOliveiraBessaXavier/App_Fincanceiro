-- =====================================================================
-- Mensalidade e implantação das empresas (cobrança da plataforma)
-- =====================================================================
-- Retorno dos parceiros em 2026-10-05, decidido com o gestor:
--
--   * Preço = valor de IMPLANTAÇÃO (uma vez) + MENSALIDADE. Os dois ficam no
--     catálogo `planos`; a empresa pode ter mensalidade negociada
--     (assinaturas.valor_mensal_personalizado), no mesmo espírito do
--     limite_titulos_personalizado.
--   * "Cortesia 60 dias" = CARÊNCIA da mensalidade: a primeira mensalidade
--     vence 60 dias depois da contratação. O plano "Cortesia" (piloto, sem
--     limite e sem prazo) continua existindo à parte.
--   * Teste passa de 7 para 30 dias.
--   * Controle manual: o sistema gera as faturas e o super admin registra o
--     pagamento ao receber (PIX/boleto). Sem gateway por enquanto.
--   * Fatura em aberto vencida há mais que a tolerância (10 dias, ajustável
--     por empresa) BLOQUEIA a empresa, pelo mesmo caminho do teste vencido
--     (current_company_id e _empresa_liberada). Registrar o pagamento libera
--     na hora.
--
-- Os preços de partida foram escolhidos pela faixa de mercado de sistemas de
-- cobrança/telecobrança para PMEs (2026); o super admin ajusta na Plataforma
-- (definir_precos_plano) sem migration.
--
-- Fatura é registro financeiro: não é apagada nem editada livremente. Muda só
-- por RPC (pagar, estornar pagamento, cancelar, ajustar valor), e cada mudança
-- fica no audit_log.

-- ============== 1. PREÇOS NO CATÁLOGO + TESTE DE 30 DIAS ==============

ALTER TABLE public.planos
  ADD COLUMN valor_mensal      numeric(12,2) NOT NULL DEFAULT 0 CHECK (valor_mensal >= 0),
  ADD COLUMN valor_implantacao numeric(12,2) NOT NULL DEFAULT 0 CHECK (valor_implantacao >= 0);

UPDATE public.planos AS p SET valor_mensal = v.mensal, valor_implantacao = v.implantacao
  FROM (VALUES
    ('basico',        297.00,  990.00),
    ('essencial',     497.00, 1490.00),
    ('profissional',  797.00, 2490.00),
    ('enterprise',   1197.00, 3490.00)
  ) AS v(codigo, mensal, implantacao)
 WHERE p.codigo = v.codigo;

UPDATE public.planos SET dias_teste = 30 WHERE codigo = 'trial';

-- Quem já está em teste ganha a diferença (7 → 30). Prazo vencido também:
-- o teste dele passou a valer 30 dias.
UPDATE public.companies
   SET acesso_expira_em = acesso_expira_em + interval '23 days'
 WHERE plano = 'trial' AND acesso_expira_em IS NOT NULL;

-- ============== 2. ASSINATURA E FATURAS ==============

-- Contrato de cobrança da empresa. Sem linha aqui, a empresa não gera fatura
-- (teste, cortesia, ou ainda não contratou).
CREATE TABLE public.assinaturas (
  company_id                 uuid PRIMARY KEY REFERENCES public.companies(id) ON DELETE CASCADE,
  -- NULL = mensalidade do plano.
  valor_mensal_personalizado numeric(12,2)
    CHECK (valor_mensal_personalizado IS NULL OR valor_mensal_personalizado >= 0),
  -- Até 28 para existir em todo mês.
  dia_vencimento             smallint NOT NULL CHECK (dia_vencimento BETWEEN 1 AND 28),
  -- Nenhuma mensalidade vence antes desta data. Contratação + carência.
  inicio_cobranca            date NOT NULL,
  dias_tolerancia            smallint NOT NULL DEFAULT 10 CHECK (dias_tolerancia BETWEEN 0 AND 60),
  ativa                      boolean NOT NULL DEFAULT true,
  created_at                 timestamptz NOT NULL DEFAULT now(),
  updated_at                 timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.faturas_assinatura (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  tipo            text NOT NULL CHECK (tipo IN ('implantacao', 'mensalidade')),
  -- Primeiro dia do mês a que a mensalidade se refere.
  competencia     date CHECK (competencia IS NULL OR extract(day FROM competencia) = 1),
  vencimento      date NOT NULL,
  -- Copiado na emissão: mudar o preço depois não reescreve fatura emitida.
  valor           numeric(12,2) NOT NULL CHECK (valor > 0),
  status          text NOT NULL DEFAULT 'aberta' CHECK (status IN ('aberta', 'paga', 'cancelada')),
  pago_em         date,
  forma_pagamento text,
  observacao      text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT faturas_competencia_por_tipo CHECK ((tipo = 'mensalidade') = (competencia IS NOT NULL)),
  CONSTRAINT faturas_pagamento_coerente   CHECK ((status = 'paga') = (pago_em IS NOT NULL))
);

-- Uma mensalidade por mês e uma implantação por empresa (canceladas não contam).
CREATE UNIQUE INDEX uq_faturas_mensalidade_competencia
  ON public.faturas_assinatura (company_id, competencia)
  WHERE tipo = 'mensalidade' AND status <> 'cancelada';
CREATE UNIQUE INDEX uq_faturas_implantacao
  ON public.faturas_assinatura (company_id)
  WHERE tipo = 'implantacao' AND status <> 'cancelada';
-- O bloqueio consulta só as abertas, em toda requisição (current_company_id).
CREATE INDEX idx_faturas_abertas
  ON public.faturas_assinatura (company_id, vencimento)
  WHERE status = 'aberta';

ALTER TABLE public.assinaturas        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.faturas_assinatura ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.assinaturas, public.faturas_assinatura TO authenticated;
GRANT ALL    ON public.assinaturas, public.faturas_assinatura TO service_role;

-- Leitura direta só para o super admin. A empresa vê a própria situação por
-- situacao_financeira(), que funciona inclusive com a empresa bloqueada.
-- Escrita: nenhuma policy — só pelas RPCs abaixo.
CREATE POLICY assinaturas_super_admin_select ON public.assinaturas
  AS PERMISSIVE FOR SELECT TO authenticated USING ((SELECT public.is_super_admin()));
CREATE POLICY faturas_assinatura_super_admin_select ON public.faturas_assinatura
  AS PERMISSIVE FOR SELECT TO authenticated USING ((SELECT public.is_super_admin()));

CREATE TRIGGER trg_audit_assinaturas
  AFTER INSERT OR UPDATE OR DELETE ON public.assinaturas
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_row();
CREATE TRIGGER trg_audit_faturas_assinatura
  AFTER INSERT OR UPDATE OR DELETE ON public.faturas_assinatura
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_row();

-- ============== 3. REGRAS INTERNAS ==============

-- Mensalidade efetiva: a negociada, se houver; senão, a do plano.
CREATE OR REPLACE FUNCTION public._valor_mensal(p_company uuid)
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(a.valor_mensal_personalizado, p.valor_mensal)
    FROM public.companies c
    JOIN public.planos p ON p.codigo = c.plano
    LEFT JOIN public.assinaturas a ON a.company_id = c.id
   WHERE c.id = p_company;
$$;

-- Há fatura em aberto vencida há mais que a tolerância? Sem assinatura (fatura
-- avulsa de implantação, por exemplo) vale a tolerância padrão de 10 dias.
CREATE OR REPLACE FUNCTION public._empresa_inadimplente(p_company uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.faturas_assinatura f
      LEFT JOIN public.assinaturas a ON a.company_id = f.company_id
     WHERE f.company_id = p_company
       AND f.status = 'aberta'
       AND f.vencimento + COALESCE(a.dias_tolerancia, 10)::int < public.hoje_br()
  );
$$;

-- Emite as mensalidades que vencem na janela [hoje - 7, hoje + 10].
--   * 10 dias à frente: a empresa vê a fatura antes de vencer.
--   * 7 dias para trás: cobre um dia em que o job não rodou, sem ressuscitar
--     meses antigos (empresa suspensa por meses não acorda devendo todos).
--   * Mês com fatura CANCELADA não é reemitido: cancelar é dispensar o mês.
-- Sem p_company, processa todas (job diário).
CREATE OR REPLACE FUNCTION public._gerar_mensalidades(p_company uuid DEFAULT NULL)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_de  date := public.hoje_br() - 7;
  v_ate date := public.hoje_br() + 10;
  v_qtd integer;
BEGIN
  INSERT INTO public.faturas_assinatura (company_id, tipo, competencia, vencimento, valor)
  SELECT a.company_id, 'mensalidade', m.mes, d.venc, v.valor
    FROM public.assinaturas a
    JOIN public.companies c ON c.id = a.company_id AND c.status = 'ativa'
    JOIN public.planos p    ON p.codigo = c.plano
    CROSS JOIN LATERAL (SELECT COALESCE(a.valor_mensal_personalizado, p.valor_mensal) AS valor) v
    CROSS JOIN LATERAL (
      SELECT g::date AS mes
        FROM generate_series(date_trunc('month', v_de::timestamp),
                             date_trunc('month', v_ate::timestamp),
                             interval '1 month') AS g
    ) m
    CROSS JOIN LATERAL (
      SELECT make_date(extract(year FROM m.mes)::int, extract(month FROM m.mes)::int,
                       a.dia_vencimento) AS venc
    ) d
   WHERE a.ativa
     AND v.valor > 0
     AND (p_company IS NULL OR a.company_id = p_company)
     AND d.venc BETWEEN GREATEST(v_de, a.inicio_cobranca) AND v_ate
     AND NOT EXISTS (
       SELECT 1 FROM public.faturas_assinatura f
        WHERE f.company_id = a.company_id
          AND f.tipo = 'mensalidade'
          AND f.competencia = m.mes
     );
  GET DIAGNOSTICS v_qtd = ROW_COUNT;
  RETURN v_qtd;
END; $$;

-- ============== 4. ACESSO: STATUS + PRAZO + ADIMPLÊNCIA ==============

CREATE OR REPLACE FUNCTION public._empresa_liberada(p_company uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.companies c
     WHERE c.id = p_company
       AND c.status = 'ativa'
       AND (c.acesso_expira_em IS NULL OR c.acesso_expira_em > now())
       AND NOT public._empresa_inadimplente(c.id)
  );
$$;

-- Com fatura atrasada além da tolerância devolve NULL e toda policy falha
-- sozinha, como já acontece com a empresa suspensa e com o teste vencido.
CREATE OR REPLACE FUNCTION public.current_company_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT c.id
  FROM public.companies c
  WHERE c.id = public.company_id_do_usuario()
    AND c.status = 'ativa'
    AND (c.acesso_expira_em IS NULL OR c.acesso_expira_em > now())
    AND NOT public._empresa_inadimplente(c.id);
$$;

-- ============== 5. RPCs DO SUPER ADMIN ==============

-- Preços do catálogo.
CREATE OR REPLACE FUNCTION public.definir_precos_plano(
  p_codigo text, p_valor_mensal numeric, p_valor_implantacao numeric
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_super_admin() THEN RAISE EXCEPTION 'Operação restrita ao super admin'; END IF;
  IF p_valor_mensal IS NULL OR p_valor_mensal < 0 OR p_valor_implantacao IS NULL OR p_valor_implantacao < 0 THEN
    RAISE EXCEPTION 'Valores não podem ser negativos';
  END IF;

  UPDATE public.planos
     SET valor_mensal = round(p_valor_mensal, 2), valor_implantacao = round(p_valor_implantacao, 2)
   WHERE codigo = p_codigo;
  IF NOT FOUND THEN RAISE EXCEPTION 'Plano inexistente: %', p_codigo; END IF;

  RETURN jsonb_build_object('sucesso', true);
END; $$;

-- Cria ou altera a assinatura da empresa. Na primeira vez (ou reativando),
-- emite a fatura de implantação se houver valor e ainda não existir uma.
-- Já emite também a mensalidade que cair na janela, para a tela mostrar na hora.
CREATE OR REPLACE FUNCTION public.salvar_assinatura(
  p_company_id                 uuid,
  p_dia_vencimento             integer,
  p_inicio_cobranca            date,
  p_valor_mensal_personalizado numeric DEFAULT NULL,
  p_dias_tolerancia            integer DEFAULT 10,
  p_valor_implantacao          numeric DEFAULT 0,
  p_vencimento_implantacao     date DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_implantacao boolean := false;
BEGIN
  IF NOT public.is_super_admin() THEN RAISE EXCEPTION 'Operação restrita ao super admin'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.companies WHERE id = p_company_id) THEN
    RAISE EXCEPTION 'Empresa não encontrada';
  END IF;
  IF p_dia_vencimento IS NULL OR p_dia_vencimento NOT BETWEEN 1 AND 28 THEN
    RAISE EXCEPTION 'Dia de vencimento deve ser de 1 a 28';
  END IF;
  IF p_inicio_cobranca IS NULL THEN RAISE EXCEPTION 'Informe o início da cobrança'; END IF;
  IF p_valor_mensal_personalizado < 0 OR COALESCE(p_valor_implantacao, 0) < 0 THEN
    RAISE EXCEPTION 'Valores não podem ser negativos';
  END IF;

  INSERT INTO public.assinaturas AS a
    (company_id, valor_mensal_personalizado, dia_vencimento, inicio_cobranca, dias_tolerancia, ativa)
  VALUES
    (p_company_id, round(p_valor_mensal_personalizado, 2), p_dia_vencimento, p_inicio_cobranca,
     COALESCE(p_dias_tolerancia, 10), true)
  ON CONFLICT (company_id) DO UPDATE
    SET valor_mensal_personalizado = EXCLUDED.valor_mensal_personalizado,
        dia_vencimento             = EXCLUDED.dia_vencimento,
        inicio_cobranca            = EXCLUDED.inicio_cobranca,
        dias_tolerancia            = EXCLUDED.dias_tolerancia,
        ativa                      = true,
        updated_at                 = now();

  IF COALESCE(p_valor_implantacao, 0) > 0 AND NOT EXISTS (
    SELECT 1 FROM public.faturas_assinatura
     WHERE company_id = p_company_id AND tipo = 'implantacao' AND status <> 'cancelada'
  ) THEN
    INSERT INTO public.faturas_assinatura (company_id, tipo, vencimento, valor)
    VALUES (p_company_id, 'implantacao', COALESCE(p_vencimento_implantacao, public.hoje_br()),
            round(p_valor_implantacao, 2));
    v_implantacao := true;
  END IF;

  RETURN jsonb_build_object(
    'sucesso', true,
    'implantacao_emitida', v_implantacao,
    'mensalidades_emitidas', public._gerar_mensalidades(p_company_id)
  );
END; $$;

-- Para de emitir mensalidades. Faturas já emitidas continuam devidas.
CREATE OR REPLACE FUNCTION public.encerrar_assinatura(p_company_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_super_admin() THEN RAISE EXCEPTION 'Operação restrita ao super admin'; END IF;
  UPDATE public.assinaturas SET ativa = false, updated_at = now() WHERE company_id = p_company_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Empresa sem assinatura'; END IF;
  RETURN jsonb_build_object('sucesso', true);
END; $$;

-- Fatura travada para alteração, conferindo o status esperado. Interna.
CREATE OR REPLACE FUNCTION public._fatura_para_alterar(p_fatura_id uuid, p_status_esperado text)
RETURNS public.faturas_assinatura
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_fatura public.faturas_assinatura;
BEGIN
  IF NOT public.is_super_admin() THEN RAISE EXCEPTION 'Operação restrita ao super admin'; END IF;
  SELECT * INTO v_fatura FROM public.faturas_assinatura WHERE id = p_fatura_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Fatura não encontrada'; END IF;
  IF v_fatura.status <> p_status_esperado THEN
    RAISE EXCEPTION 'Fatura está %; a operação exige fatura %', v_fatura.status, p_status_esperado;
  END IF;
  RETURN v_fatura;
END; $$;

CREATE OR REPLACE FUNCTION public._exigir_motivo(p_motivo text)
RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
BEGIN
  IF p_motivo IS NULL OR length(trim(p_motivo)) < 3 THEN RAISE EXCEPTION 'Informe o motivo'; END IF;
  RETURN trim(p_motivo);
END; $$;

CREATE OR REPLACE FUNCTION public.registrar_pagamento_fatura(
  p_fatura_id uuid, p_pago_em date, p_forma_pagamento text DEFAULT NULL, p_observacao text DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public._fatura_para_alterar(p_fatura_id, 'aberta');
  IF p_pago_em IS NULL OR p_pago_em > public.hoje_br() THEN
    RAISE EXCEPTION 'Data do pagamento não pode ser futura';
  END IF;

  UPDATE public.faturas_assinatura
     SET status = 'paga', pago_em = p_pago_em,
         forma_pagamento = NULLIF(trim(p_forma_pagamento), ''),
         observacao = COALESCE(NULLIF(trim(p_observacao), ''), observacao),
         updated_at = now()
   WHERE id = p_fatura_id;
  RETURN jsonb_build_object('sucesso', true);
END; $$;

-- Pagamento registrado por engano volta a ficar em aberto. O que estava antes
-- fica no audit_log (before_data).
CREATE OR REPLACE FUNCTION public.estornar_pagamento_fatura(p_fatura_id uuid, p_motivo text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_motivo text := public._exigir_motivo(p_motivo);
BEGIN
  PERFORM public._fatura_para_alterar(p_fatura_id, 'paga');
  UPDATE public.faturas_assinatura
     SET status = 'aberta', pago_em = NULL, forma_pagamento = NULL,
         observacao = 'Pagamento estornado: ' || v_motivo, updated_at = now()
   WHERE id = p_fatura_id;
  RETURN jsonb_build_object('sucesso', true);
END; $$;

-- Dispensa a fatura (desconto total, cobrança indevida). Mensalidade cancelada
-- não é reemitida pelo job.
CREATE OR REPLACE FUNCTION public.cancelar_fatura(p_fatura_id uuid, p_motivo text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_motivo text := public._exigir_motivo(p_motivo);
BEGIN
  PERFORM public._fatura_para_alterar(p_fatura_id, 'aberta');
  UPDATE public.faturas_assinatura
     SET status = 'cancelada', observacao = 'Cancelada: ' || v_motivo, updated_at = now()
   WHERE id = p_fatura_id;
  RETURN jsonb_build_object('sucesso', true);
END; $$;

-- Desconto ou acréscimo pontual numa fatura em aberto.
CREATE OR REPLACE FUNCTION public.alterar_valor_fatura(p_fatura_id uuid, p_valor numeric, p_motivo text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_motivo text := public._exigir_motivo(p_motivo);
BEGIN
  PERFORM public._fatura_para_alterar(p_fatura_id, 'aberta');
  IF p_valor IS NULL OR p_valor <= 0 THEN
    RAISE EXCEPTION 'Valor deve ser maior que zero (para dispensar, cancele a fatura)';
  END IF;
  UPDATE public.faturas_assinatura
     SET valor = round(p_valor, 2), observacao = 'Valor ajustado: ' || v_motivo, updated_at = now()
   WHERE id = p_fatura_id;
  RETURN jsonb_build_object('sucesso', true);
END; $$;

-- ============== 6. SITUAÇÃO PARA A EMPRESA ==============

-- O que a empresa precisa saber da própria cobrança. Funciona com a empresa
-- BLOQUEADA (é quando mais importa): por isso usa company_id_do_usuario() e
-- confere o papel direto em user_roles — has_min_role passa por
-- current_company_id(), que é NULL justamente nessa hora.
-- Só o admin vê valores e faturas; os demais, se está bloqueada ou não.
CREATE OR REPLACE FUNCTION public.situacao_financeira()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_company uuid := public.company_id_do_usuario();
BEGIN
  IF v_company IS NULL THEN RAISE EXCEPTION 'Empresa não identificada'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles ur
     WHERE ur.user_id = auth.uid() AND ur.company_id = v_company AND ur.role = 'admin'
  ) THEN
    RETURN jsonb_build_object('inadimplente', public._empresa_inadimplente(v_company));
  END IF;

  RETURN jsonb_build_object(
    'inadimplente', public._empresa_inadimplente(v_company),
    'assinatura', (
      SELECT jsonb_build_object(
        'valor_mensal',    public._valor_mensal(v_company),
        'dia_vencimento',  a.dia_vencimento,
        'inicio_cobranca', a.inicio_cobranca,
        'dias_tolerancia', a.dias_tolerancia,
        'ativa',           a.ativa)
        FROM public.assinaturas a WHERE a.company_id = v_company
    ),
    'faturas', COALESCE((
      SELECT jsonb_agg(to_jsonb(f) - 'company_id' - 'created_at' - 'updated_at' ORDER BY f.vencimento DESC)
        FROM (
          SELECT * FROM public.faturas_assinatura
           WHERE company_id = v_company AND status <> 'cancelada'
           ORDER BY vencimento DESC LIMIT 12
        ) f
    ), '[]'::jsonb)
  );
END; $$;

-- ============== 7. JOB DIÁRIO ==============

-- 03:20 UTC = 00:20 em Brasília, depois do quebra-acordos (03:10).
DO $$
BEGIN
  PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'gerar-mensalidades-diaria';
  PERFORM cron.schedule('gerar-mensalidades-diaria', '20 3 * * *',
                        'SELECT public._gerar_mensalidades()');
END $$;

-- ============== 8. GRANTS + CONFERÊNCIA ==============

REVOKE EXECUTE ON FUNCTION public._valor_mensal(uuid)                       FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._empresa_inadimplente(uuid)               FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._gerar_mensalidades(uuid)                 FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._fatura_para_alterar(uuid, text)          FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._exigir_motivo(text)                      FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.definir_precos_plano(text, numeric, numeric)                         TO authenticated;
GRANT EXECUTE ON FUNCTION public.salvar_assinatura(uuid, integer, date, numeric, integer, numeric, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.encerrar_assinatura(uuid)                                            TO authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_pagamento_fatura(uuid, date, text, text)                   TO authenticated;
GRANT EXECUTE ON FUNCTION public.estornar_pagamento_fatura(uuid, text)                                TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancelar_fatura(uuid, text)                                          TO authenticated;
GRANT EXECUTE ON FUNCTION public.alterar_valor_fatura(uuid, numeric, text)                            TO authenticated;
GRANT EXECUTE ON FUNCTION public.situacao_financeira()                                                TO authenticated;

DO $$
DECLARE
  v_expostas text[] := ARRAY[
    'public.definir_precos_plano(text,numeric,numeric)',
    'public.salvar_assinatura(uuid,integer,date,numeric,integer,numeric,date)',
    'public.encerrar_assinatura(uuid)',
    'public.registrar_pagamento_fatura(uuid,date,text,text)',
    'public.estornar_pagamento_fatura(uuid,text)',
    'public.cancelar_fatura(uuid,text)',
    'public.alterar_valor_fatura(uuid,numeric,text)',
    'public.situacao_financeira()'];
  v_internas text[] := ARRAY[
    'public._valor_mensal(uuid)',
    'public._empresa_inadimplente(uuid)',
    'public._gerar_mensalidades(uuid)',
    'public._fatura_para_alterar(uuid,text)',
    'public._exigir_motivo(text)'];
  f text;
BEGIN
  FOREACH f IN ARRAY v_expostas LOOP
    IF NOT has_function_privilege('authenticated', f, 'EXECUTE') OR has_function_privilege('anon', f, 'EXECUTE') THEN
      RAISE EXCEPTION 'grant errado em %', f;
    END IF;
  END LOOP;
  FOREACH f IN ARRAY v_internas LOOP
    IF has_function_privilege('authenticated', f, 'EXECUTE') OR has_function_privilege('anon', f, 'EXECUTE') THEN
      RAISE EXCEPTION 'função interna exposta: %', f;
    END IF;
  END LOOP;
  IF NOT has_function_privilege('authenticated', 'public.current_company_id()', 'EXECUTE') THEN
    RAISE EXCEPTION 'current_company_id perdeu o grant';
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
