-- 1. Helper de papel mínimo
create or replace function public.has_min_role(_uid uuid, _min public.app_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case _min
    when 'operador'::public.app_role then exists(select 1 from public.user_roles where user_id = _uid)
    when 'gerente'::public.app_role  then exists(select 1 from public.user_roles where user_id = _uid and role in ('gerente'::public.app_role,'admin'::public.app_role))
    when 'admin'::public.app_role    then exists(select 1 from public.user_roles where user_id = _uid and role = 'admin'::public.app_role)
  end
$$;

-- 2. Guards nas RPCs financeiras (recriação com checagem no topo)

create or replace function public.aplicar_encargo_parcela(
  p_parcela_id uuid, p_tipo text, p_valor numeric,
  p_descricao text default null, p_created_by uuid default null, p_motivo text default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_saldo_atual numeric; v_evento_id uuid; v_result jsonb;
begin
  if not public.has_min_role(auth.uid(),'gerente'::public.app_role) then
    raise exception 'Operação restrita a gerente/admin';
  end if;
  if p_tipo not in ('juros_aplicado','multa_aplicada') then raise exception 'Tipo inválido'; end if;
  select saldo_atual into v_saldo_atual from public.mv_parcelas_consolidadas where id = p_parcela_id;
  if v_saldo_atual is null then raise exception 'Parcela não encontrada'; end if;
  insert into public.eventos_parcela (parcela_id, tipo, valor, efeito, descricao, created_by)
  values (p_parcela_id, p_tipo, p_valor, 1,
    coalesce(p_descricao, format('%s de R$ %s aplicado',
      case when p_tipo='juros_aplicado' then 'Juros' else 'Multa' end, p_valor)),
    coalesce(p_created_by, auth.uid()))
  returning id into v_evento_id;
  refresh materialized view concurrently public.mv_parcelas_consolidadas;
  v_result := jsonb_build_object('sucesso',true,'evento_id',v_evento_id,
    'saldo_anterior',v_saldo_atual,'saldo_atual',v_saldo_atual+p_valor);
  insert into public.audit_log (actor_id, action, table_name, record_id, context)
  values (coalesce(p_created_by, auth.uid()),'rpc','eventos_parcela',v_evento_id,
    jsonb_build_object('rpc','aplicar_encargo_parcela',
      'params',jsonb_build_object('parcela_id',p_parcela_id,'tipo',p_tipo,'valor',p_valor,'descricao',p_descricao,'motivo',p_motivo),
      'result',v_result));
  return v_result;
end; $$;

create or replace function public.conceder_desconto_parcela(
  p_parcela_id uuid, p_valor numeric,
  p_descricao text default null, p_created_by uuid default null, p_motivo text default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_saldo_atual numeric; v_evento_id uuid; v_result jsonb;
begin
  if not public.has_min_role(auth.uid(),'gerente'::public.app_role) then
    raise exception 'Operação restrita a gerente/admin';
  end if;
  select saldo_atual into v_saldo_atual from public.mv_parcelas_consolidadas where id = p_parcela_id;
  if v_saldo_atual is null then raise exception 'Parcela não encontrada'; end if;
  if p_valor > v_saldo_atual then raise exception 'Desconto excede saldo'; end if;
  insert into public.eventos_parcela (parcela_id, tipo, valor, efeito, descricao, created_by)
  values (p_parcela_id,'desconto_concedido',p_valor,-1,
    coalesce(p_descricao, format('Desconto de R$ %s concedido', p_valor)),
    coalesce(p_created_by, auth.uid()))
  returning id into v_evento_id;
  refresh materialized view concurrently public.mv_parcelas_consolidadas;
  v_result := jsonb_build_object('sucesso',true,'evento_id',v_evento_id,
    'saldo_anterior',v_saldo_atual,'saldo_atual',v_saldo_atual-p_valor);
  insert into public.audit_log (actor_id, action, table_name, record_id, context)
  values (coalesce(p_created_by, auth.uid()),'rpc','eventos_parcela',v_evento_id,
    jsonb_build_object('rpc','conceder_desconto_parcela',
      'params',jsonb_build_object('parcela_id',p_parcela_id,'valor',p_valor,'descricao',p_descricao,'motivo',p_motivo),
      'result',v_result));
  return v_result;
end; $$;

create or replace function public.estornar_evento_parcela(
  p_evento_id uuid, p_motivo text, p_created_by uuid default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_evento_original record; v_evento_estorno_id uuid; v_result jsonb;
begin
  if not public.has_min_role(auth.uid(),'gerente'::public.app_role) then
    raise exception 'Operação restrita a gerente/admin';
  end if;
  if p_motivo is null or length(trim(p_motivo)) = 0 then
    raise exception 'Motivo do estorno é obrigatório';
  end if;
  select * into v_evento_original from public.eventos_parcela where id = p_evento_id;
  if v_evento_original.id is null then raise exception 'Evento não encontrado'; end if;
  if v_evento_original.estornado then raise exception 'Já estornado'; end if;
  if v_evento_original.tipo in ('emissao_parcela','estorno') then raise exception 'Não pode estornar'; end if;
  update public.eventos_parcela set estornado = true where id = p_evento_id;
  insert into public.eventos_parcela (parcela_id, tipo, valor, efeito, descricao, created_by, estornado_por_id)
  values (v_evento_original.parcela_id,'estorno',v_evento_original.valor, v_evento_original.efeito * -1,
    format('Estorno: %s - Motivo: %s', v_evento_original.descricao, p_motivo),
    coalesce(p_created_by, auth.uid()), p_evento_id)
  returning id into v_evento_estorno_id;
  refresh materialized view concurrently public.mv_parcelas_consolidadas;
  v_result := jsonb_build_object('sucesso',true,'evento_estorno_id',v_evento_estorno_id,
    'evento_original_id',p_evento_id,'tipo_estornado',v_evento_original.tipo);
  insert into public.audit_log (actor_id, action, table_name, record_id, context)
  values (coalesce(p_created_by, auth.uid()),'rpc','eventos_parcela',p_evento_id,
    jsonb_build_object('rpc','estornar_evento_parcela',
      'params',jsonb_build_object('evento_id',p_evento_id,'motivo',p_motivo),
      'result',v_result));
  return v_result;
end; $$;

-- 3. RLS refinada

-- titulos
drop policy if exists "Títulos podem ser atualizados por quem os criou" on public.titulos;
drop policy if exists "Títulos podem ser excluídos por quem os criou" on public.titulos;
create policy "titulos_update_owner_or_manager" on public.titulos
  for update using (auth.uid() = created_by or public.has_min_role(auth.uid(),'gerente'::public.app_role));
create policy "titulos_delete_manager" on public.titulos
  for delete using (public.has_min_role(auth.uid(),'gerente'::public.app_role));

-- clientes
drop policy if exists "Clientes podem ser atualizados por quem os criou" on public.clientes;
drop policy if exists "Clientes podem ser excluídos por quem os criou" on public.clientes;
create policy "clientes_update_owner_or_manager" on public.clientes
  for update using (auth.uid() = created_by or public.has_min_role(auth.uid(),'gerente'::public.app_role));
create policy "clientes_delete_owner_or_manager" on public.clientes
  for delete using (auth.uid() = created_by or public.has_min_role(auth.uid(),'gerente'::public.app_role));

-- agendamentos
drop policy if exists "Agendamentos podem ser atualizados por quem os criou" on public.agendamentos;
drop policy if exists "Agendamentos podem ser excluídos por quem os criou" on public.agendamentos;
create policy "agendamentos_update_owner_or_manager" on public.agendamentos
  for update using (auth.uid() = created_by or public.has_min_role(auth.uid(),'gerente'::public.app_role));
create policy "agendamentos_delete_owner_or_manager" on public.agendamentos
  for delete using (auth.uid() = created_by or public.has_min_role(auth.uid(),'gerente'::public.app_role));

-- comunicacoes (não tinha update/delete; criamos só p/ owner+manager)
create policy "comunicacoes_update_owner_or_manager" on public.comunicacoes
  for update using (auth.uid() = created_by or public.has_min_role(auth.uid(),'gerente'::public.app_role));
create policy "comunicacoes_delete_owner_or_manager" on public.comunicacoes
  for delete using (auth.uid() = created_by or public.has_min_role(auth.uid(),'gerente'::public.app_role));

-- campanhas
drop policy if exists "Authenticated users can update campanhas" on public.campanhas;
create policy "campanhas_update_manager" on public.campanhas
  for update using (public.has_min_role(auth.uid(),'gerente'::public.app_role));
create policy "campanhas_delete_manager" on public.campanhas
  for delete using (public.has_min_role(auth.uid(),'gerente'::public.app_role));

-- acordos (manager-only para mutar)
drop policy if exists "Acordos podem ser inseridos por usuários autenticados" on public.acordos;
drop policy if exists "Acordos podem ser atualizados por quem os criou" on public.acordos;
drop policy if exists "Acordos podem ser excluídos por quem os criou" on public.acordos;
create policy "acordos_insert_manager" on public.acordos
  for insert with check (public.has_min_role(auth.uid(),'gerente'::public.app_role) and auth.uid() = created_by);
create policy "acordos_update_manager" on public.acordos
  for update using (public.has_min_role(auth.uid(),'gerente'::public.app_role));
create policy "acordos_delete_manager" on public.acordos
  for delete using (public.has_min_role(auth.uid(),'gerente'::public.app_role));

-- parcelas_acordo (manager-only)
drop policy if exists "Parcelas podem ser inseridas por usuários autenticados" on public.parcelas_acordo;
drop policy if exists "Parcelas podem ser atualizadas por quem criou o acordo" on public.parcelas_acordo;
drop policy if exists "Parcelas podem ser excluídas por quem criou o acordo" on public.parcelas_acordo;
create policy "parcelas_acordo_insert_manager" on public.parcelas_acordo
  for insert with check (public.has_min_role(auth.uid(),'gerente'::public.app_role));
create policy "parcelas_acordo_update_manager" on public.parcelas_acordo
  for update using (public.has_min_role(auth.uid(),'gerente'::public.app_role));
create policy "parcelas_acordo_delete_manager" on public.parcelas_acordo
  for delete using (public.has_min_role(auth.uid(),'gerente'::public.app_role));

-- audit_log: admins veem tudo, gerentes veem o que eles mesmos fizeram
drop policy if exists "Admins can read audit_log" on public.audit_log;
create policy "audit_log_select_admin_or_self_manager" on public.audit_log
  for select using (
    public.has_role(auth.uid(),'admin'::public.app_role)
    or (public.has_min_role(auth.uid(),'gerente'::public.app_role) and actor_id = auth.uid())
  );