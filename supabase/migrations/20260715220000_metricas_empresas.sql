-- =====================================================================
-- Métricas por empresa para o painel da Plataforma
-- =====================================================================
-- A tabela de empresas mostrava CNPJ, plano, status e data de cadastro —
-- nenhum número. Não dava para distinguir um cliente ativo de uma casca vazia
-- sem ir ao banco na mão. E, como os planos cobram por faixa de títulos, sem
-- essa contagem não há como faturar o modelo.
--
-- "Última atividade" vem do audit_log, não do activity_logs: apesar do nome,
-- activity_logs é tabela morta — nada escreve nela (nem frontend, nem RPC, nem
-- edge function). O audit_log é alimentado pelos triggers fn_audit_row a cada
-- insert/update/delete e tem o índice certo para isto
-- (idx_audit_log_company: company_id, occurred_at DESC).
--
-- titulos_ativos é o número que os planos cobram (título cancelado não conta);
-- titulos_total fica disponível para a tela mostrar o volume real da base.

CREATE OR REPLACE FUNCTION public.metricas_empresas()
RETURNS TABLE(
  company_id       uuid,
  titulos_ativos   bigint,
  titulos_total    bigint,
  clientes         bigint,
  usuarios         bigint,
  ultima_atividade timestamptz
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_super_admin() THEN RAISE EXCEPTION 'Operação restrita ao super admin'; END IF;

  -- Subconsultas correlacionadas: cada uma usa o índice por company_id. Com
  -- dezenas de empresas é barato. Se um dia forem centenas com bases grandes,
  -- vale materializar em vez de contar a cada abertura da tela.
  RETURN QUERY
    SELECT
      c.id,
      (SELECT count(*) FROM public.titulos t
        WHERE t.company_id = c.id AND t.status = 'ativo'),
      (SELECT count(*) FROM public.titulos t WHERE t.company_id = c.id),
      (SELECT count(*) FROM public.clientes cl WHERE cl.company_id = c.id),
      (SELECT count(*) FROM public.profiles p WHERE p.company_id = c.id),
      (SELECT max(a.occurred_at) FROM public.audit_log a WHERE a.company_id = c.id)
    FROM public.companies c;
END; $$;

REVOKE EXECUTE ON FUNCTION public.metricas_empresas() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.metricas_empresas() TO authenticated;

NOTIFY pgrst, 'reload schema';
