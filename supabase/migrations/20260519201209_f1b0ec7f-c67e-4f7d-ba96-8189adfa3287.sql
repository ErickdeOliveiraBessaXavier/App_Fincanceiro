-- ============ AUDIT LOG GENÉRICO ============

create table public.audit_log (
  id              uuid primary key default gen_random_uuid(),
  occurred_at     timestamptz not null default now(),
  actor_id        uuid,
  actor_email     text,
  action          text not null,
  table_name      text,
  record_id       uuid,
  before_data     jsonb,
  after_data      jsonb,
  changed_fields  text[],
  context         jsonb,
  reverted        boolean not null default false,
  reverted_by_id  uuid references public.audit_log(id)
);

create index idx_audit_log_record on public.audit_log (table_name, record_id, occurred_at desc);
create index idx_audit_log_actor  on public.audit_log (actor_id, occurred_at desc);
create index idx_audit_log_action on public.audit_log (action, occurred_at desc);

alter table public.audit_log enable row level security;

-- Apenas admin pode ler o audit
create policy "Admins can read audit_log"
  on public.audit_log for select
  to authenticated
  using (public.has_role(auth.uid(), 'admin'));

-- Sem policy de insert/update/delete: somente SECURITY DEFINER escreve

-- ============ FUNÇÃO GENÉRICA DE AUDITORIA ============

create or replace function public.fn_audit_row()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_before  jsonb;
  v_after   jsonb;
  v_changed text[];
  v_rec_id  uuid;
  v_email   text;
begin
  if TG_OP in ('UPDATE','DELETE') then
    v_before := to_jsonb(OLD);
  end if;
  if TG_OP in ('INSERT','UPDATE') then
    v_after := to_jsonb(NEW);
  end if;

  v_rec_id := coalesce((v_after->>'id')::uuid, (v_before->>'id')::uuid);

  if TG_OP = 'UPDATE' then
    select coalesce(array_agg(key), '{}') into v_changed
    from jsonb_each(v_after) a
    where a.value is distinct from (v_before->a.key);
    if v_changed is null or array_length(v_changed,1) is null then
      return NEW;
    end if;
  end if;

  select email into v_email from public.profiles where user_id = auth.uid() limit 1;

  insert into public.audit_log
    (actor_id, actor_email, action, table_name, record_id, before_data, after_data, changed_fields)
  values
    (auth.uid(), v_email, lower(TG_OP), TG_TABLE_NAME, v_rec_id, v_before, v_after, v_changed);

  return coalesce(NEW, OLD);
end;
$$;

-- ============ TRIGGERS ============

create trigger trg_audit_titulos          after insert or update or delete on public.titulos          for each row execute function public.fn_audit_row();
create trigger trg_audit_parcelas         after insert or update or delete on public.parcelas         for each row execute function public.fn_audit_row();
create trigger trg_audit_clientes         after insert or update or delete on public.clientes         for each row execute function public.fn_audit_row();
create trigger trg_audit_acordos          after insert or update or delete on public.acordos          for each row execute function public.fn_audit_row();
create trigger trg_audit_parcelas_acordo  after insert or update or delete on public.parcelas_acordo  for each row execute function public.fn_audit_row();
create trigger trg_audit_agendamentos     after insert or update or delete on public.agendamentos     for each row execute function public.fn_audit_row();
create trigger trg_audit_comunicacoes     after insert or update or delete on public.comunicacoes     for each row execute function public.fn_audit_row();
create trigger trg_audit_campanhas        after insert or update or delete on public.campanhas        for each row execute function public.fn_audit_row();
create trigger trg_audit_user_roles       after insert or update or delete on public.user_roles       for each row execute function public.fn_audit_row();

-- ============ RPCs FINANCEIRAS: log adicional + p_motivo ============

create or replace function public.registrar_pagamento_parcela(
  p_parcela_id uuid, p_valor numeric, p_meio_pagamento text,
  p_descricao text default null, p_created_by uuid default null
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_saldo_atual numeric; v_tipo_evento text; v_evento_id uuid; v_parcela_info record; v_result jsonb;
begin
  select id, saldo_atual, status into v_parcela_info from public.mv_parcelas_consolidadas where id = p_parcela_id;
  if v_parcela_info.id is null then raise exception 'Parcela não encontrada'; end if;
  v_saldo_atual := v_parcela_info.saldo_atual;
  if v_parcela_info.status = 'paga' then raise exception 'Parcela já está paga'; end if;
  if p_valor <= 0 then raise exception 'Valor deve ser positivo'; end if;
  if p_valor > v_saldo_atual then raise exception 'Valor excede saldo devedor'; end if;
  v_tipo_evento := case when p_valor >= v_saldo_atual then 'pagamento_total' else 'pagamento_parcial' end;
  insert into public.eventos_parcela (parcela_id, tipo, valor, efeito, meio_pagamento, descricao, created_by)
  values (p_parcela_id, v_tipo_evento, p_valor, -1, p_meio_pagamento,
    coalesce(p_descricao, format('Pagamento de R$ %s via %s', p_valor, p_meio_pagamento)), coalesce(p_created_by, auth.uid()))
  returning id into v_evento_id;
  refresh materialized view concurrently public.mv_parcelas_consolidadas;

  v_result := jsonb_build_object('sucesso', true, 'evento_id', v_evento_id, 'tipo', v_tipo_evento,
    'saldo_anterior', v_saldo_atual, 'saldo_atual', v_saldo_atual - p_valor, 'valor_pago', p_valor);

  insert into public.audit_log (actor_id, action, table_name, record_id, context)
  values (coalesce(p_created_by, auth.uid()), 'rpc', 'eventos_parcela', v_evento_id,
    jsonb_build_object('rpc','registrar_pagamento_parcela',
      'params', jsonb_build_object('parcela_id',p_parcela_id,'valor',p_valor,'meio',p_meio_pagamento,'descricao',p_descricao),
      'result', v_result));

  return v_result;
end; $$;

create or replace function public.aplicar_encargo_parcela(
  p_parcela_id uuid, p_tipo text, p_valor numeric,
  p_descricao text default null, p_created_by uuid default null, p_motivo text default null
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_saldo_atual numeric; v_evento_id uuid; v_result jsonb;
begin
  if p_tipo not in ('juros_aplicado', 'multa_aplicada') then raise exception 'Tipo inválido'; end if;
  select saldo_atual into v_saldo_atual from public.mv_parcelas_consolidadas where id = p_parcela_id;
  if v_saldo_atual is null then raise exception 'Parcela não encontrada'; end if;
  insert into public.eventos_parcela (parcela_id, tipo, valor, efeito, descricao, created_by)
  values (p_parcela_id, p_tipo, p_valor, 1,
    coalesce(p_descricao, format('%s de R$ %s aplicado', case when p_tipo='juros_aplicado' then 'Juros' else 'Multa' end, p_valor)),
    coalesce(p_created_by, auth.uid()))
  returning id into v_evento_id;
  refresh materialized view concurrently public.mv_parcelas_consolidadas;

  v_result := jsonb_build_object('sucesso', true, 'evento_id', v_evento_id, 'saldo_anterior', v_saldo_atual, 'saldo_atual', v_saldo_atual + p_valor);

  insert into public.audit_log (actor_id, action, table_name, record_id, context)
  values (coalesce(p_created_by, auth.uid()), 'rpc', 'eventos_parcela', v_evento_id,
    jsonb_build_object('rpc','aplicar_encargo_parcela',
      'params', jsonb_build_object('parcela_id',p_parcela_id,'tipo',p_tipo,'valor',p_valor,'descricao',p_descricao,'motivo',p_motivo),
      'result', v_result));

  return v_result;
end; $$;

create or replace function public.conceder_desconto_parcela(
  p_parcela_id uuid, p_valor numeric,
  p_descricao text default null, p_created_by uuid default null, p_motivo text default null
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_saldo_atual numeric; v_evento_id uuid; v_result jsonb;
begin
  select saldo_atual into v_saldo_atual from public.mv_parcelas_consolidadas where id = p_parcela_id;
  if v_saldo_atual is null then raise exception 'Parcela não encontrada'; end if;
  if p_valor > v_saldo_atual then raise exception 'Desconto excede saldo'; end if;
  insert into public.eventos_parcela (parcela_id, tipo, valor, efeito, descricao, created_by)
  values (p_parcela_id, 'desconto_concedido', p_valor, -1,
    coalesce(p_descricao, format('Desconto de R$ %s concedido', p_valor)), coalesce(p_created_by, auth.uid()))
  returning id into v_evento_id;
  refresh materialized view concurrently public.mv_parcelas_consolidadas;

  v_result := jsonb_build_object('sucesso', true, 'evento_id', v_evento_id, 'saldo_anterior', v_saldo_atual, 'saldo_atual', v_saldo_atual - p_valor);

  insert into public.audit_log (actor_id, action, table_name, record_id, context)
  values (coalesce(p_created_by, auth.uid()), 'rpc', 'eventos_parcela', v_evento_id,
    jsonb_build_object('rpc','conceder_desconto_parcela',
      'params', jsonb_build_object('parcela_id',p_parcela_id,'valor',p_valor,'descricao',p_descricao,'motivo',p_motivo),
      'result', v_result));

  return v_result;
end; $$;

create or replace function public.estornar_evento_parcela(
  p_evento_id uuid, p_motivo text, p_created_by uuid default null
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_evento_original record; v_evento_estorno_id uuid; v_result jsonb;
begin
  if p_motivo is null or length(trim(p_motivo)) = 0 then
    raise exception 'Motivo do estorno é obrigatório';
  end if;
  select * into v_evento_original from public.eventos_parcela where id = p_evento_id;
  if v_evento_original.id is null then raise exception 'Evento não encontrado'; end if;
  if v_evento_original.estornado then raise exception 'Já estornado'; end if;
  if v_evento_original.tipo in ('emissao_parcela', 'estorno') then raise exception 'Não pode estornar'; end if;
  update public.eventos_parcela set estornado = true where id = p_evento_id;
  insert into public.eventos_parcela (parcela_id, tipo, valor, efeito, descricao, created_by, estornado_por_id)
  values (v_evento_original.parcela_id, 'estorno', v_evento_original.valor, v_evento_original.efeito * -1,
    format('Estorno: %s - Motivo: %s', v_evento_original.descricao, p_motivo),
    coalesce(p_created_by, auth.uid()), p_evento_id)
  returning id into v_evento_estorno_id;
  refresh materialized view concurrently public.mv_parcelas_consolidadas;

  v_result := jsonb_build_object('sucesso', true, 'evento_estorno_id', v_evento_estorno_id,
    'evento_original_id', p_evento_id, 'tipo_estornado', v_evento_original.tipo);

  insert into public.audit_log (actor_id, action, table_name, record_id, context)
  values (coalesce(p_created_by, auth.uid()), 'rpc', 'eventos_parcela', p_evento_id,
    jsonb_build_object('rpc','estornar_evento_parcela',
      'params', jsonb_build_object('evento_id',p_evento_id,'motivo',p_motivo),
      'result', v_result));

  return v_result;
end; $$;

create or replace function public.criar_titulo_com_parcelas(
  p_cliente_id uuid, p_valor_original numeric, p_vencimento_original date,
  p_descricao text default null, p_numero_documento varchar default null,
  p_numero_parcelas integer default 1, p_intervalo_dias integer default 30,
  p_created_by uuid default null
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_titulo_id uuid; v_valor_parcela numeric; v_data_vencimento date; i integer; v_result jsonb;
begin
  insert into titulos (cliente_id, valor_original, vencimento_original, descricao, numero_documento, created_by)
  values (p_cliente_id, p_valor_original, p_vencimento_original, p_descricao, p_numero_documento, coalesce(p_created_by, auth.uid()))
  returning id into v_titulo_id;

  v_valor_parcela := round(p_valor_original / p_numero_parcelas, 2);

  for i in 1..p_numero_parcelas loop
    v_data_vencimento := p_vencimento_original + ((i - 1) * p_intervalo_dias);
    insert into parcelas (titulo_id, numero_parcela, valor_nominal, vencimento)
    values (v_titulo_id, i, v_valor_parcela, v_data_vencimento);
  end loop;

  refresh materialized view concurrently mv_parcelas_consolidadas;

  v_result := jsonb_build_object('sucesso', true, 'titulo_id', v_titulo_id, 'parcelas_criadas', p_numero_parcelas);

  insert into public.audit_log (actor_id, action, table_name, record_id, context)
  values (coalesce(p_created_by, auth.uid()), 'rpc', 'titulos', v_titulo_id,
    jsonb_build_object('rpc','criar_titulo_com_parcelas',
      'params', jsonb_build_object('cliente_id',p_cliente_id,'valor',p_valor_original,'venc',p_vencimento_original,
        'descricao',p_descricao,'numero_documento',p_numero_documento,
        'numero_parcelas',p_numero_parcelas,'intervalo_dias',p_intervalo_dias),
      'result', v_result));

  return v_result;
end; $$;

-- ============ REVERSÃO GENÉRICA ============

create or replace function public.reverter_audit_log(
  p_audit_id uuid, p_motivo text
)
returns jsonb language plpgsql security definer set search_path = public as $$
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

  insert into public.audit_log (actor_id, action, table_name, record_id, context)
  values (auth.uid(), 'revert', v_log.table_name, v_log.record_id,
    jsonb_build_object('motivo', p_motivo, 'original_audit_id', p_audit_id, 'original_action', v_log.action))
  returning id into v_new_audit_id;

  update public.audit_log
     set reverted = true, reverted_by_id = v_new_audit_id
   where id = p_audit_id;

  return jsonb_build_object('sucesso', true, 'audit_id', p_audit_id, 'revert_audit_id', v_new_audit_id);
end; $$;

-- ============ VIEW DE HISTÓRICO ============

create or replace view public.vw_audit_record as
select
  al.*,
  p.nome  as actor_nome,
  p.email as actor_profile_email
from public.audit_log al
left join public.profiles p on p.user_id = al.actor_id;