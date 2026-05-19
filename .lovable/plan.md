# Plano — Permissões granulares (RBAC)

Hoje quase todas as policies usam `auth.role() = 'authenticated'` ou `auth.uid() = created_by`. Qualquer usuário logado pode estornar, dar desconto, excluir título alheio. Vamos introduzir 3 papéis claros e aplicar guards no banco (RPC + RLS), única camada confiável.

## 1. Papéis

Adicionar `gerente` ao enum `app_role` (já existem `admin`, `operador`).

| Ação | operador | gerente | admin |
|---|---|---|---|
| Ver tudo (títulos, clientes, parcelas, acordos) | ✅ | ✅ | ✅ |
| Criar título / cliente / agendamento / comunicação | ✅ | ✅ | ✅ |
| Registrar pagamento | ✅ | ✅ | ✅ |
| Aplicar encargo (juros/multa) | ❌ | ✅ | ✅ |
| Conceder desconto | ❌ | ✅ | ✅ |
| Estornar evento | ❌ | ✅ | ✅ |
| Editar/excluir título alheio | ❌ | ✅ | ✅ |
| Criar/quebrar acordo | ❌ | ✅ | ✅ |
| Reverter via `reverter_audit_log` | ❌ | ❌ | ✅ |
| Ler `audit_log` | ❌ | ✅ (próprias ações) | ✅ (tudo) |
| Gerenciar `user_roles` | ❌ | ❌ | ✅ |

## 2. Guards nas RPCs financeiras

Adicionar no topo de cada RPC `SECURITY DEFINER` uma checagem com `has_role`:

- `aplicar_encargo_parcela`, `conceder_desconto_parcela`, `estornar_evento_parcela`
  → exige `admin` OU `gerente`. Caso contrário `RAISE EXCEPTION 'Operação restrita a gerente/admin'`.
- `registrar_pagamento_parcela`, `criar_titulo_com_parcelas` → qualquer autenticado (mantém).
- `reverter_audit_log` → já exige `admin` (mantém).

## 3. RLS refinada por tabela

Substituir as policies permissivas atuais:

### `titulos`
- SELECT: qualquer autenticado (mantém).
- INSERT: qualquer autenticado.
- UPDATE: `created_by = auth.uid() OR has_role(auth.uid(),'gerente') OR has_role(auth.uid(),'admin')`.
- DELETE: `has_role(auth.uid(),'gerente') OR has_role(auth.uid(),'admin')` (operador não exclui mais).

### `clientes`, `agendamentos`, `comunicacoes`, `campanhas`
- UPDATE/DELETE: `created_by = auth.uid() OR has_role(...,'gerente') OR has_role(...,'admin')`.

### `acordos` + `parcelas_acordo`
- INSERT/UPDATE/DELETE: somente `gerente` ou `admin`.

### `eventos_parcela`
- INSERT direto continua bloqueado na prática (só RPCs gravam). Reforçar policy de INSERT para exigir o guard de papel quando `tipo IN ('juros_aplicado','multa_aplicada','desconto_concedido','estorno')` — mas como passa por RPC `SECURITY DEFINER`, o guard real é o do item 2.

### `audit_log`
- SELECT: `has_role(auth.uid(),'admin') OR (has_role(auth.uid(),'gerente') AND actor_id = auth.uid())`.

### `user_roles`
- Atual já restringe a `admin`. Mantém.

## 4. Helper único de papel mínimo

```sql
create or replace function public.has_min_role(_uid uuid, _min app_role)
returns boolean language sql stable security definer set search_path=public as $$
  select case _min
    when 'operador' then exists(select 1 from user_roles where user_id=_uid)
    when 'gerente'  then exists(select 1 from user_roles where user_id=_uid and role in ('gerente','admin'))
    when 'admin'    then exists(select 1 from user_roles where user_id=_uid and role='admin')
  end
$$;
```

Usar nos guards de RPC para legibilidade: `if not public.has_min_role(auth.uid(),'gerente') then raise exception ...`.

## 5. Frontend — só esconder, banco é a verdade

Pequeno hook `useUserRole()` (lê `user_roles` do usuário atual, cacheia em React Query) já existirá / criar se faltar. Esconder botões de Estorno/Desconto/Encargo/Excluir/Acordo para quem não tem papel. **Não** é guard — banco bloqueia mesmo se driblado.

## 6. Migrações

1. **Migration 1** — `alter type app_role add value 'gerente'`; criar `has_min_role`; recriar policies (drop + create) das tabelas listadas; recriar 3 RPCs financeiras com guard no topo.
2. **Migration 2** — refinar policy do `audit_log` para gerente ver as próprias ações.
3. Smoke test: logar como operador e tentar `conceder_desconto_parcela` → deve falhar com mensagem clara.

## 7. Fora do escopo desta fase

- Tela de "Gerenciar usuários e papéis" (já existe `Usuarios.tsx` — só conferir se permite atribuir `gerente`).
- UI de Histórico/confirmações (próxima frente).
- Atribuição automática de `gerente` — feita manualmente por admin via UI atual.
