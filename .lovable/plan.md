# Plano — Auditoria genérica + Reversões append-only

## Objetivo

Adicionar uma camada de auditoria backend que registre **toda** alteração relevante (quem, quando, antes/depois) e padronizar reversões financeiras como **eventos compensatórios** (append-only), aproveitando o ledger `eventos_parcela` já existente.

Escopo: **somente backend** (tabelas, funções, triggers, RLS). Nenhuma mudança de UI nesta fase.

---

## 1. Tabela `audit_log` genérica

```sql
create table public.audit_log (
  id              uuid primary key default gen_random_uuid(),
  occurred_at     timestamptz not null default now(),
  actor_id        uuid,                       -- auth.uid() quando disponível
  actor_email     text,                       -- snapshot p/ histórico
  action          text not null,              -- insert | update | delete | rpc | login
  table_name      text,                       -- nullable p/ ações não-tabulares
  record_id       uuid,                       -- PK da linha afetada
  before_data     jsonb,                      -- linha antes (null em insert)
  after_data      jsonb,                      -- linha depois (null em delete)
  changed_fields  text[],                     -- diff em update
  context         jsonb,                      -- rpc name, ip, request_id, motivo
  reverted        boolean not null default false,
  reverted_by_id  uuid references public.audit_log(id)
);

create index on public.audit_log (table_name, record_id, occurred_at desc);
create index on public.audit_log (actor_id, occurred_at desc);
create index on public.audit_log (action, occurred_at desc);
```

**RLS**: somente `admin` (via `has_role`) pode `SELECT`. `INSERT` é feito apenas por funções `SECURITY DEFINER` (sem policy de insert direta para usuários). Nunca `UPDATE`/`DELETE` — append-only.

---

## 2. Função e trigger genéricos

```sql
create or replace function public.fn_audit_row()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_before jsonb := case when TG_OP in ('UPDATE','DELETE') then to_jsonb(OLD) end;
  v_after  jsonb := case when TG_OP in ('INSERT','UPDATE') then to_jsonb(NEW) end;
  v_changed text[];
  v_rec_id uuid := coalesce((v_after->>'id')::uuid, (v_before->>'id')::uuid);
begin
  if TG_OP = 'UPDATE' then
    select array_agg(key) into v_changed
    from jsonb_each(v_after) a
    where a.value is distinct from (v_before->a.key);
    if v_changed is null then return NEW; end if;
  end if;

  insert into public.audit_log
    (actor_id, action, table_name, record_id, before_data, after_data, changed_fields)
  values
    (auth.uid(), lower(TG_OP), TG_TABLE_NAME, v_rec_id, v_before, v_after, v_changed);

  return coalesce(NEW, OLD);
end $$;
```

Anexar trigger `AFTER INSERT OR UPDATE OR DELETE` em: `titulos`, `parcelas`, `clientes`, `acordos`, `parcelas_acordo`, `agendamentos`, `comunicacoes`, `campanhas`, `user_roles`.

Não anexar em `eventos_parcela` (já é append-only e o histórico vive lá) nem em `audit_log`/`activity_logs`.

---

## 3. RPCs financeiras: registrar no audit_log + contexto

Atualizar as RPCs existentes para também gravar uma linha em `audit_log` com `action='rpc'` e `context = {rpc, params, resultado}`:

- `criar_titulo_com_parcelas`
- `registrar_pagamento_parcela`
- `aplicar_encargo_parcela`
- `conceder_desconto_parcela`
- `estornar_evento_parcela`

Aceitar parâmetro opcional `p_motivo text` em operações críticas (encargo, desconto, estorno) e exigi-lo via `RAISE EXCEPTION` quando ausente em `estornar_evento_parcela` (já existe `p_motivo`, manter).

---

## 4. Reversões append-only — padrão único

Hoje só `eventos_parcela` tem `estornar_evento_parcela`. Padronizar:

### 4a. Eventos financeiros (`eventos_parcela`)
Já está correto: marca `estornado=true` no original e cria evento `tipo='estorno'` com `efeito` invertido e link via `estornado_por_id`. **Manter.** Adicionar gravação em `audit_log` (item 3).

### 4b. Reversão genérica de mutações (`audit_log`)
Nova RPC para reverter ações registradas em `audit_log` (ex.: edição equivocada de cliente, exclusão de agendamento):

```sql
create or replace function public.reverter_audit_log(
  p_audit_id uuid,
  p_motivo   text
) returns jsonb language plpgsql security definer set search_path = public as $$
-- Aplica before_data de volta na tabela alvo:
--   * action='update' -> UPDATE com colunas de before_data
--   * action='delete' -> INSERT com before_data
--   * action='insert' -> DELETE da linha
-- Marca audit_log.reverted=true, cria nova linha de audit
-- com action='revert', context={motivo, original_id} e
-- preenche reverted_by_id na linha original.
-- Bloqueia se já reverted, se motivo nulo, ou se tabela não estiver
-- na whitelist de reversíveis (titulos, clientes, parcelas, etc.).
$$;
```

Restrição: apenas `admin` pode chamar. Reversões também ficam no audit (rastreabilidade total).

### 4c. Excluir título → soft-delete via reversão
Hoje `useDeleteTitulo` faz `DELETE` físico. Manter o DELETE (já será capturado pelo trigger de auditoria com `before_data` completo), permitindo reverter via `reverter_audit_log` se necessário. Sem mudança de schema aqui.

---

## 5. View de histórico por registro

```sql
create or replace view public.vw_audit_record as
select
  al.*,
  p.nome  as actor_nome,
  p.email as actor_profile_email
from public.audit_log al
left join public.profiles p on p.user_id = al.actor_id;
```

Permite consultar `select * from vw_audit_record where table_name='titulos' and record_id = $1 order by occurred_at desc` — base para a futura aba "Histórico" na UI (fora desta fase).

---

## 6. Ordem de execução

1. Migration 1 — cria `audit_log`, índices, RLS, função `fn_audit_row`, triggers nas 9 tabelas.
2. Migration 2 — atualiza as 5 RPCs financeiras para gravar em `audit_log` + aceitar `p_motivo` onde aplicável.
3. Migration 3 — cria `reverter_audit_log` e `vw_audit_record`.
4. Validação: smoke test manual (criar título → editar cliente → reverter → conferir `audit_log`).

---

## 7. Fora do escopo (fases futuras)

- UI de "Histórico" por registro e tela global de auditoria.
- Exportação de log para storage externo / retenção.
- Confirmações no frontend para operações críticas (Fase UX).
- Camada `services/` + React Query para o restante das páginas (já parcialmente iniciada em `lib/queries/`).
