-- =====================================================================
-- Reconciliação: funções que existiam no banco e não no repositório
-- =====================================================================
-- Comparando o schema real com as migrations, três funções divergiam. Todas
-- chegaram ao banco por SQL colado no editor, sem virar arquivo — então nunca
-- passaram por revisão e não seriam recriadas ao reconstruir o banco pelo repo.
--
-- 1) handle_new_user  — o repo tinha uma versão ANTIGA, de quando a empresa
--    vinha no metadata do usuário. Hoje ninguém envia company_id no metadata:
--    o convite (edge function registrar-convite) cria a conta e depois amarra
--    a empresa no servidor, a partir do token, e o cadastro self-service usa
--    criar_empresa_e_admin. Na prática as duas versões se comportam igual —
--    a do repo só tem um ramo morto. Aqui o repo passa a registrar a real.
--
-- 2) migrate_existing_titulos_to_clientes — fóssil pré-multi-tenant. Usa
--    titulos.cliente / titulos.cpf_cnpj / titulos.contato, colunas que não
--    existem mais. Estouraria se chamada, e estava exposta a anon e
--    authenticated. Removida.
--
-- 3) reverter_audit_log — funcional e exposta a todo authenticated, mas SEM
--    NENHUMA CHECAGEM DE TENANT: rodava como dono (ignorando RLS), lia
--    audit_log de qualquer empresa e escrevia na tabela alvo, autorizada só
--    por "é admin" — nunca por "é admin DESTA empresa". Um admin do cliente A,
--    de posse de um id de auditoria do cliente B, reverteria dados do B. O que
--    segurava era apenas o UUID ser inadivinhável. Corrigida abaixo.

-- ============== 1. handle_new_user (registrar a versão real) ==============
-- Cria só o profile básico. company_id e papel são atribuídos depois, pelo
-- fluxo que criou a conta (convite no servidor, ou criar_empresa_e_admin).
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (user_id, nome, email)
  VALUES (NEW.id,
    COALESCE(NEW.raw_user_meta_data ->> 'nome', NEW.raw_user_meta_data ->> 'name', 'Usuário'),
    NEW.email);
  RETURN NEW;
END; $$;

-- ============== 2. Remover o fóssil ==============
DROP FUNCTION IF EXISTS public.migrate_existing_titulos_to_clientes();

-- ============== 3. reverter_audit_log: exigir mesmo tenant ==============

-- A checagem sai em função própria para não inflar a complexidade de
-- reverter_audit_log, que já tem muitos ramos.
-- Retorna falso quando o registro é de outra empresa, quando não tem empresa
-- (ex.: linha-resumo de operação de plataforma) ou quando o chamador não tem
-- tenant efetivo — inclusive se a empresa dele estiver bloqueada, já que
-- current_company_id() devolve NULL nesse caso e a comparação vira NULL.
CREATE OR REPLACE FUNCTION public.audit_log_do_tenant(p_audit_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.audit_log a
    WHERE a.id = p_audit_id
      AND a.company_id IS NOT NULL
      AND a.company_id = public.current_company_id()
  );
$$;

-- Corpo idêntico ao que rodava, com uma única adição: o guard de tenant logo
-- após confirmar que o registro existe.
CREATE OR REPLACE FUNCTION public.reverter_audit_log(p_audit_id uuid, p_motivo text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
declare
  v_log record;
  v_allowed text[] := array['titulos','parcelas','clientes','acordos','parcelas_acordo','agendamentos','comunicacoes','campanhas'];
  v_cols text;
  v_sql text;
  v_new_audit_id uuid;
begin
  if not public.has_role(auth.uid(), 'admin') then
    raise exception 'Apenas administradores podem reverter';
  end if;
  if p_motivo is null or length(trim(p_motivo)) = 0 then
    raise exception 'Motivo é obrigatório';
  end if;

  select * into v_log from public.audit_log where id = p_audit_id;
  if v_log.id is null then raise exception 'Registro de auditoria não encontrado'; end if;

  -- NOVO: sem isto, qualquer admin revertia dados de qualquer empresa.
  if not public.audit_log_do_tenant(p_audit_id) then
    raise exception 'Registro de auditoria não encontrado';
  end if;

  if v_log.reverted then raise exception 'Já revertido'; end if;
  if not (v_log.table_name = any (v_allowed)) then
    raise exception 'Tabela % não é reversível', v_log.table_name;
  end if;
  if v_log.action not in ('insert','update','delete') then
    raise exception 'Ação % não é reversível', v_log.action;
  end if;

  if v_log.action = 'update' then
    -- Aplica before_data nos campos alterados
    select string_agg(format('%I = %L', key, v_log.before_data->>key), ', ')
      into v_cols
      from unnest(v_log.changed_fields) as key;
    v_sql := format('update public.%I set %s where id = %L', v_log.table_name, v_cols, v_log.record_id);
    execute v_sql;

  elsif v_log.action = 'delete' then
    -- Reinsere a linha completa
    select string_agg(format('%I', key), ','), string_agg(format('%L', value), ',')
      into v_cols, v_sql
      from jsonb_each_text(v_log.before_data);
    execute format('insert into public.%I (%s) values (%s)', v_log.table_name, v_cols, v_sql);

  elsif v_log.action = 'insert' then
    execute format('delete from public.%I where id = %L', v_log.table_name, v_log.record_id);
  end if;

  insert into public.audit_log (company_id, actor_id, action, table_name, record_id, context)
  values (v_log.company_id, auth.uid(), 'revert', v_log.table_name, v_log.record_id,
    jsonb_build_object('motivo', p_motivo, 'original_audit_id', p_audit_id, 'original_action', v_log.action))
  returning id into v_new_audit_id;

  update public.audit_log
     set reverted = true, reverted_by_id = v_new_audit_id
   where id = p_audit_id;

  return jsonb_build_object('sucesso', true, 'audit_id', p_audit_id, 'revert_audit_id', v_new_audit_id);
end; $$;

-- ============== 4. Grants ==============
-- anon nunca teve motivo para executar (has_role(NULL,'admin') já barrava,
-- mas função de escrita não deve sequer estar exposta a quem não logou).
REVOKE EXECUTE ON FUNCTION public.reverter_audit_log(uuid, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.reverter_audit_log(uuid, text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.audit_log_do_tenant(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.audit_log_do_tenant(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
