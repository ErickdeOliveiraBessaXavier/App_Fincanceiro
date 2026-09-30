-- ============================================================================
-- Correções da Auditoria — Rodada 2 (AUDITORIA_RODADA_2.md), parte 2
--
--   4  status 'vencido' calculado na LEITURA, no fuso de Brasília. A MV gravava
--      o status na hora do refresh (CURRENT_DATE em UTC) e só era atualizada
--      em operação financeira: em dia parado, parcela vencida seguia 'a vencer';
--      depois das 21h, a do dia aparecia vencida antes da hora.
--
--   Decisão do gestor (2026-09-30): vencimento em dia não útil vai para o
--   próximo dia útil, como o boleto no Brasil. Calendário bancário nacional
--   (calculado, não precisa de manutenção anual) + datas extras por empresa
--   (tabela feriados — ex.: feriado municipal), sem tela por enquanto.
--   O vencimento gravado não muda; muda quando a parcela é considerada vencida,
--   e a partir de quando conta a tolerância de quebra do acordo.
--
--   Junto: as duas funções de policy criadas na parte 1 perdem o prefixo "_"
--   (no projeto, "_" = interna, sem grant; estas precisam de EXECUTE).
-- ============================================================================

ALTER FUNCTION public._na_carteira(uuid, uuid) RENAME TO na_carteira;
ALTER FUNCTION public._cliente_do_anexo(uuid, uuid, uuid) RENAME TO cliente_do_anexo;

-- ─── Calendário ────────────────────────────────────────────────────────────
-- Páscoa (algoritmo de Meeus/Jones/Butcher, calendário gregoriano).
CREATE OR REPLACE FUNCTION public.data_pascoa(p_ano int)
 RETURNS date LANGUAGE plpgsql IMMUTABLE SET search_path TO 'public'
AS $function$
DECLARE a int; b int; c int; d int; e int; f int; g int; h int; i int; k int; l int; m int; mes int; dia int;
BEGIN
  a := p_ano % 19; b := p_ano / 100; c := p_ano % 100;
  d := b / 4; e := b % 4; f := (b + 8) / 25; g := (b - f + 1) / 3;
  h := (19 * a + b - d - g + 15) % 30;
  i := c / 4; k := c % 4;
  l := (32 + 2 * e + 2 * i - h - k) % 7;
  m := (a + 11 * h + 22 * l) / 451;
  mes := (h + l - 7 * m + 114) / 31;
  dia := ((h + l - 7 * m + 114) % 31) + 1;
  RETURN make_date(p_ano, mes, dia);
END $function$;

-- Dia sem expediente bancário no país inteiro.
-- Carnaval (segunda e terça) e Corpus Christi não são feriado nacional por
-- lei, mas não há expediente bancário (calendário da Febraban). 31/12 também
-- não tem expediente para o público, e o que vence nele pode ser pago no dia
-- útil seguinte sem encargo. Consciência Negra é nacional desde 2024.
CREATE OR REPLACE FUNCTION public.feriado_bancario_nacional(p_data date)
 RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path TO 'public'
AS $function$
  SELECT to_char(p_data, 'MM-DD') IN ('01-01','04-21','05-01','09-07','10-12','11-02','11-15','12-25','12-31')
      OR (to_char(p_data, 'MM-DD') = '11-20' AND extract(year FROM p_data) >= 2024)
      OR p_data - public.data_pascoa(extract(year FROM p_data)::int) IN (-48, -47, -2, 60);
$function$;

CREATE TABLE IF NOT EXISTS public.feriados (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  data date NOT NULL,
  descricao text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, data)
);
COMMENT ON TABLE public.feriados IS
  'Dias sem expediente específicos da empresa (feriado estadual/municipal). Os nacionais são calculados por feriado_bancario_nacional().';

ALTER TABLE public.feriados ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.feriados FROM anon, authenticated;
GRANT SELECT ON public.feriados TO authenticated;
DROP POLICY IF EXISTS feriados_select ON public.feriados;
CREATE POLICY feriados_select ON public.feriados FOR SELECT TO authenticated
  USING (public.is_super_admin() OR company_id = public.current_company_id());

-- Primeiro dia útil a partir da data (ela mesma, se já for útil).
-- SECURITY DEFINER: é chamada dentro de views, com o papel de quem consulta,
-- e precisa ler os feriados da empresa da PARCELA, não os de quem consulta.
CREATE OR REPLACE FUNCTION public.proximo_dia_util(p_data date, p_company uuid)
 RETURNS date LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v date := p_data;
BEGIN
  IF v IS NULL THEN RETURN NULL; END IF;
  WHILE extract(isodow FROM v) IN (6, 7)
     OR public.feriado_bancario_nacional(v)
     OR EXISTS (SELECT 1 FROM public.feriados f WHERE f.company_id = p_company AND f.data = v)
  LOOP
    v := v + 1;
  END LOOP;
  RETURN v;
END $function$;

REVOKE EXECUTE ON FUNCTION public.data_pascoa(int) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.feriado_bancario_nacional(date) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.proximo_dia_util(date, uuid) FROM PUBLIC, anon;
-- Chamadas dentro de views: quem consulta precisa do EXECUTE.
GRANT EXECUTE ON FUNCTION public.data_pascoa(int) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.feriado_bancario_nacional(date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.proximo_dia_util(date, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.hoje_br() TO service_role;

-- ─── Status da parcela de título, na leitura ───────────────────────────────
-- A MV continua guardando o que é caro (saldo e totais). O status sai daqui.
-- Sem filtro de empresa: é a base das views do app (que filtram) e da api-v1
-- (service role). O app não lê esta view direto.
CREATE OR REPLACE VIEW public._vw_parcelas_status AS
SELECT mv.id, mv.company_id, mv.titulo_id, mv.numero_parcela, mv.valor_nominal, mv.vencimento,
       mv.juros, mv.multa, mv.descontos, mv.total_pago, mv.saldo_atual,
       CASE
         WHEN mv.saldo_atual <= 0 THEN 'pago'
         WHEN public.proximo_dia_util(mv.vencimento, mv.company_id) < public.hoje_br() THEN 'vencido'
         ELSE 'a_vencer'
       END AS status,
       mv.data_ultimo_pagamento, mv.total_eventos
  FROM public.mv_parcelas_consolidadas mv;
REVOKE ALL ON public._vw_parcelas_status FROM anon, authenticated;
GRANT SELECT ON public._vw_parcelas_status TO service_role;

COMMENT ON COLUMN public.mv_parcelas_consolidadas.status IS
  'LEGADO: calculado no refresh, com CURRENT_DATE em UTC. Não use: leia o status de _vw_parcelas_status / vw_parcelas_consolidadas.';

CREATE OR REPLACE VIEW public.vw_parcelas_consolidadas AS
 SELECT mv.id, mv.company_id, mv.titulo_id, mv.numero_parcela, mv.valor_nominal, mv.vencimento,
        mv.juros, mv.multa, mv.descontos, mv.total_pago, mv.saldo_atual, mv.status,
        mv.data_ultimo_pagamento, mv.total_eventos
   FROM public._vw_parcelas_status mv
   LEFT JOIN public.titulos t ON t.id = mv.titulo_id
  WHERE (public.is_super_admin() OR mv.company_id = public.current_company_id())
    AND public.cobrador_ve_cliente(t.cliente_id);

-- ─── Acordo: mesma regra ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.marcar_parcelas_acordo_vencidas()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_count int;
BEGIN
  UPDATE public.parcelas_acordo pa
     SET status = 'vencida', updated_at = now()
    FROM public.acordos a
   WHERE a.id = pa.acordo_id
     AND a.status IN ('ativo', 'quebrado')
     AND pa.status = 'pendente'
     AND public.proximo_dia_util(pa.data_vencimento, pa.company_id) < public.hoje_br()
     AND pa.deleted_at IS NULL;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN jsonb_build_object('sucesso', true, 'parcelas_vencidas', v_count);
END $function$;

-- A tolerância conta a partir do vencimento efetivo (próximo dia útil).
CREATE OR REPLACE FUNCTION public._status_devido_acordo(p_acordo_id uuid)
 RETURNS text
 LANGUAGE sql
 VOLATILE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH acordo AS (
    SELECT a.company_id, COALESCE(ce.dias_tolerancia_quebra, 10) AS dias
      FROM public.acordos a
      LEFT JOIN public.configuracoes_empresa ce ON ce.company_id = a.company_id
     WHERE a.id = p_acordo_id
  ), abertas AS (
    SELECT pa.data_vencimento
      FROM public.parcelas_acordo pa
     WHERE pa.acordo_id = p_acordo_id AND pa.deleted_at IS NULL AND pa.status <> 'paga'
  )
  SELECT CASE
    WHEN NOT EXISTS (SELECT 1 FROM abertas) THEN 'cumprido'
    WHEN EXISTS (SELECT 1 FROM abertas, acordo
                  WHERE public.proximo_dia_util(abertas.data_vencimento, acordo.company_id) + acordo.dias
                        < public.hoje_br()) THEN 'quebrado'
    ELSE 'ativo'
  END;
$function$;
REVOKE EXECUTE ON FUNCTION public._status_devido_acordo(uuid) FROM PUBLIC, anon, authenticated;

-- ─── Título: contagem de vencidas e status passam a vir do status na leitura ─
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
           FROM public._vw_parcelas_status mv_parcelas_consolidadas
          GROUP BY mv_parcelas_consolidadas.titulo_id) p ON ((p.titulo_id = t.id)))
     LEFT JOIN LATERAL ( SELECT a.status
           FROM (acordo_titulos at
             JOIN acordos a ON ((a.id = at.acordo_id)))
          WHERE ((at.titulo_id = t.id) AND (a.status <> 'cancelado'::text))
          ORDER BY (a.status = ANY (ARRAY['ativo'::text, 'quebrado'::text])) DESC, a.created_at DESC
         LIMIT 1) ac ON (true))
  WHERE ((t.deleted_at IS NULL) AND (c.deleted_at IS NULL) AND (is_super_admin() OR ((t.company_id = current_company_id()) AND (((current_cobrador_id() IS NULL) AND (current_vendedor_id() IS NULL)) OR cobrador_ve_cliente(t.cliente_id)))));

-- ─── Parcela de acordo: vencida pelo dia útil, no fuso de Brasília ─────────
CREATE OR REPLACE VIEW public.vw_parcelas_acordo_consolidadas AS
SELECT pa.id,
    pa.company_id,
    pa.acordo_id,
    pa.numero_parcela,
    pa.valor,
    pa.valor_juros,
    pa.valor_total,
    pa.data_vencimento,
    pa.data_pagamento,
    COALESCE(sum(m.valor) FILTER (WHERE ((m.tipo = ANY (ARRAY['pagamento_total'::text, 'pagamento_parcial'::text])) AND (NOT m.estornado))), (0)::numeric) AS total_pago,
    COALESCE(sum(m.valor) FILTER (WHERE ((m.tipo = ANY (ARRAY['juros_aplicado'::text, 'multa_aplicada'::text])) AND (NOT m.estornado))), (0)::numeric) AS encargos,
    COALESCE(sum(m.valor) FILTER (WHERE ((m.tipo = 'desconto_concedido'::text) AND (NOT m.estornado))), (0)::numeric) AS descontos,
    (pa.valor_total + COALESCE(sum((m.valor * (m.efeito)::numeric)) FILTER (WHERE (NOT m.estornado)), (0)::numeric)) AS saldo_atual,
        CASE
            WHEN ((pa.valor_total + COALESCE(sum((m.valor * (m.efeito)::numeric)) FILTER (WHERE (NOT m.estornado)), (0)::numeric)) <= (0)::numeric) THEN 'paga'::text
            WHEN (public.proximo_dia_util(pa.data_vencimento, pa.company_id) < public.hoje_br()) THEN 'vencida'::text
            ELSE 'pendente'::text
        END AS status,
    ac.cliente_id
   FROM ((parcelas_acordo pa
     LEFT JOIN movimentos_financeiros m ON ((m.parcela_acordo_id = pa.id)))
     LEFT JOIN acordos ac ON ((ac.id = pa.acordo_id)))
  WHERE (pa.deleted_at IS NULL)
  GROUP BY pa.id, pa.company_id, pa.acordo_id, pa.numero_parcela, pa.valor, pa.valor_juros, pa.valor_total, pa.data_vencimento, pa.data_pagamento, ac.cliente_id;

-- ─── Conferência ───────────────────────────────────────────────────────────
DO $$
BEGIN
  IF has_table_privilege('authenticated', 'public._vw_parcelas_status', 'SELECT')
     OR has_table_privilege('anon', 'public._vw_parcelas_status', 'SELECT') THEN
    RAISE EXCEPTION '_vw_parcelas_status não pode ser lida pelo app (não filtra empresa)';
  END IF;
  IF NOT has_table_privilege('service_role', 'public._vw_parcelas_status', 'SELECT') THEN
    RAISE EXCEPTION 'api-v1 (service role) precisa ler _vw_parcelas_status';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.proximo_dia_util(date,uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.proximo_dia_util(date,uuid)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.na_carteira(uuid,uuid)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.cliente_do_anexo(uuid,uuid,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'grant errado nas funções de view/policy';
  END IF;
  IF public.proximo_dia_util('2026-10-10', NULL) <> '2026-10-13'   -- sáb → seg 12 é N. Sra. Aparecida
     OR public.data_pascoa(2026) <> '2026-04-05'
     OR NOT public.feriado_bancario_nacional('2026-02-17')          -- terça de Carnaval
     OR public.feriado_bancario_nacional('2026-09-30') THEN
    RAISE EXCEPTION 'calendário bancário errado';
  END IF;
END $$;
