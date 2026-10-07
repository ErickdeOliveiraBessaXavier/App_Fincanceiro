-- =====================================================================
-- Preço por excedente: planos acima do Enterprise
-- =====================================================================
-- Até aqui, empresa acima de 30 mil títulos recebia limite personalizado e a
-- mensalidade era negociada à mão, sem regra. Agora o plano pode ter uma regra
-- de excedente:
--
--   a cada `excedente_bloco_titulos` títulos acima do limite do plano,
--   + `excedente_valor_mensal` na mensalidade
--   + `excedente_valor_implantacao` na implantação.
--
-- O bloco é cobrado inteiro (35 mil no Enterprise = 1 bloco de 10 mil).
-- A mensalidade da empresa passa a sair do limite dela pela regra; mudar a
-- regra muda as próximas faturas. Mensalidade negociada continua prevalecendo.
--
-- Valores iniciais no Enterprise: blocos de 10 mil, + R$ 300/mês e + R$ 500 de
-- implantação (≈ R$ 30 por mil, desconto por volume sobre os R$ 40 do topo).

ALTER TABLE public.planos
  ADD COLUMN excedente_bloco_titulos     integer CHECK (excedente_bloco_titulos IS NULL OR excedente_bloco_titulos > 0),
  ADD COLUMN excedente_valor_mensal      numeric(12,2) NOT NULL DEFAULT 0 CHECK (excedente_valor_mensal >= 0),
  ADD COLUMN excedente_valor_implantacao numeric(12,2) NOT NULL DEFAULT 0 CHECK (excedente_valor_implantacao >= 0),
  -- Regra de excedente só faz sentido em plano com limite.
  ADD CONSTRAINT planos_excedente_com_limite
    CHECK (excedente_bloco_titulos IS NULL OR limite_titulos IS NOT NULL);

UPDATE public.planos
   SET excedente_bloco_titulos = 10000, excedente_valor_mensal = 300, excedente_valor_implantacao = 500
 WHERE codigo = 'enterprise';

-- Quantos blocos de excedente o limite personalizado da empresa ocupa.
CREATE OR REPLACE FUNCTION public._blocos_excedentes(p_limite integer, p_limite_plano integer, p_bloco integer)
RETURNS integer LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE
    WHEN p_bloco IS NULL OR p_limite IS NULL OR p_limite_plano IS NULL OR p_limite <= p_limite_plano THEN 0
    ELSE ceil((p_limite - p_limite_plano)::numeric / p_bloco)::integer
  END;
$$;

-- Mensalidade efetiva: a negociada, se houver; senão, a do plano + excedente.
CREATE OR REPLACE FUNCTION public._valor_mensal(p_company uuid)
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(
           a.valor_mensal_personalizado,
           p.valor_mensal + p.excedente_valor_mensal
             * public._blocos_excedentes(c.limite_titulos_personalizado, p.limite_titulos, p.excedente_bloco_titulos))
    FROM public.companies c
    JOIN public.planos p ON p.codigo = c.plano
    LEFT JOIN public.assinaturas a ON a.company_id = c.id
   WHERE c.id = p_company;
$$;

-- Mesma geração de antes; o valor agora vem de _valor_mensal (regra única).
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
    CROSS JOIN LATERAL (SELECT public._valor_mensal(a.company_id) AS valor) v
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

-- Regra de excedente do plano. Bloco NULL desliga a regra.
CREATE OR REPLACE FUNCTION public.definir_excedente_plano(
  p_codigo text, p_bloco_titulos integer, p_valor_mensal numeric, p_valor_implantacao numeric
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_super_admin() THEN RAISE EXCEPTION 'Operação restrita ao super admin'; END IF;
  IF p_bloco_titulos IS NOT NULL AND p_bloco_titulos < 1 THEN
    RAISE EXCEPTION 'Bloco deve ter pelo menos 1 título';
  END IF;
  IF COALESCE(p_valor_mensal, 0) < 0 OR COALESCE(p_valor_implantacao, 0) < 0 THEN
    RAISE EXCEPTION 'Valores não podem ser negativos';
  END IF;

  UPDATE public.planos
     SET excedente_bloco_titulos     = p_bloco_titulos,
         excedente_valor_mensal      = round(COALESCE(p_valor_mensal, 0), 2),
         excedente_valor_implantacao = round(COALESCE(p_valor_implantacao, 0), 2)
   WHERE codigo = p_codigo;
  IF NOT FOUND THEN RAISE EXCEPTION 'Plano inexistente: %', p_codigo; END IF;

  RETURN jsonb_build_object('sucesso', true);
END; $$;

REVOKE EXECUTE ON FUNCTION public._blocos_excedentes(integer, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.definir_excedente_plano(text, integer, numeric, numeric) TO authenticated;

DO $$
BEGIN
  IF NOT has_function_privilege('authenticated', 'public.definir_excedente_plano(text,integer,numeric,numeric)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.definir_excedente_plano(text,integer,numeric,numeric)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public._blocos_excedentes(integer,integer,integer)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public._valor_mensal(uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public._gerar_mensalidades(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'grant errado nas funções de excedente';
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
