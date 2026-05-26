# Roadmap Multi-Tenant SaaS — Plano por fases

Escopo desta entrega: **apenas planejamento**. Nenhum código ou migração será executado agora. Decisões já tomadas:

- 1 usuário pertence a 1 empresa
- Dados atuais serão descartados (reset / começar do zero)
- Existirá papel `super_admin` (operador da plataforma) acima de `admin` (da empresa)

---

## Princípios da arquitetura alvo

1. **Toda tabela de domínio carrega `company_id NOT NULL`** com FK para `companies(id)`.
2. **RLS por tenant** em todas as tabelas, usando função `current_company_id()` lida de JWT claim ou de `profiles.company_id`.
3. **Soft delete** (`deleted_at timestamptz`) em tudo que é financeiro — nunca DELETE físico.
4. **RPCs Supabase** continuam sendo o único caminho para operações financeiras; passam a validar tenant.
5. **Auditoria universal**: trigger `fn_audit_row` em todas as tabelas sensíveis, gravando em `audit_log` (com `company_id`, `user_id`, ação, valor antigo/novo).
6. **Sem lógica financeira no frontend** — frontend só dispara RPC e renderiza.
7. **Monolito modular**: organização por domínio em `src/lib/queries/<dominio>` e em `supabase/migrations` por feature, preparado para extração futura.

---

## Hierarquia de papéis

```text
super_admin   → opera a plataforma, vê todas as companies, cria/suspende tenants
admin         → administra a própria empresa (usuários, configs, dados)
gerente       → gestão operacional dentro da empresa
operador      → execução (telecobrança, registros)
```

`super_admin` **não** carrega `company_id` obrigatório e bypassa RLS de tenant via `has_role(uid,'super_admin')`.

---

## Fase 0 — Fundação (schema + segurança)

Tabelas novas:
- `companies` (id, nome, cnpj, slug, status, plano, created_at, deleted_at)
- `audit_log` (id, company_id, user_id, tabela, registro_id, acao, valor_antigo jsonb, valor_novo jsonb, created_at)

Mudanças em tabelas existentes (após reset dos dados):
- `profiles`: adicionar `company_id uuid NOT NULL REFERENCES companies`
- `user_roles`: adicionar `company_id uuid` (nullable só para `super_admin`)
- `clientes`, `titulos`, `parcelas`, `eventos_parcela`, `acordos`, `parcelas_acordo`, `campanhas`, notificações etc.: adicionar `company_id NOT NULL` + `deleted_at`

Funções/triggers:
- `current_company_id()` — security definer, lê de `profiles` pelo `auth.uid()`
- `is_super_admin()` — security definer
- `fn_audit_row()` — trigger genérica anexada a todas as tabelas de domínio
- `fn_set_company_id()` — BEFORE INSERT que preenche `company_id` a partir do JWT/profile
- `prevent_hard_delete_financial()` — bloqueia DELETE em tabelas financeiras (força soft delete)

RLS (padrão aplicado a toda tabela de domínio):
```text
SELECT/UPDATE/INSERT/DELETE permitido se:
  is_super_admin() OR company_id = current_company_id()
```

## Fase 1 — Onboarding e autenticação

- Cadastro de empresa (signup cria `companies` + 1º usuário como `admin` daquela company)
- Trigger `handle_new_user` atualizada para exigir `company_id` (do convite ou do signup de empresa)
- Convite de usuário por e-mail (admin convida; convite carrega `company_id` + papel)
- Rota `/setup-empresa` para 1º acesso
- Logout/troca de sessão limpa cache do React Query por tenant

## Fase 2 — Refator de queries e RPCs

- Todas as RPCs financeiras (`criar_titulo_com_parcelas`, pagamento, encargo, desconto, acordo, refresh MV) recebem/derivam `company_id` e validam antes de gravar
- `vw_titulos_completos` e `mv_parcelas_consolidadas` passam a filtrar por `company_id`
- Hooks em `src/lib/queries/*` não mudam assinatura — RLS faz o filtro; o que muda é a chave de cache (`['titulos', companyId]`) para isolar caches
- Hook novo `useCurrentCompany()` (id, nome, plano)

## Fase 3 — Painel super_admin

- Rota `/plataforma` (só super_admin): listar companies, status, métricas básicas, suspender/reativar tenant
- Não substitui dashboard da empresa

## Fase 4 — Auditoria e observabilidade

- Tela `/auditoria` (admin da empresa vê só sua company; super_admin vê tudo)
- Filtros: tabela, usuário, ação, período
- Export CSV

## Fase 5 — Hardening

- Rate limit por company em edge functions (se houver)
- Backup/export por tenant
- Testes E2E garantindo isolamento (usuário da company A nunca vê dado da B)

---

## O que evitamos por design

- Lógica financeira no frontend (mantido)
- Queries sem tenant (RLS bloqueia, mas defesa em profundidade no app via cache key)
- DELETE físico em financeiro (trigger bloqueia)
- Regras duplicadas (RPC é fonte única)
- Microserviços prematuros (monolito modular)

---

## Riscos e pontos de atenção

- **Reset destrutivo**: confirmar que ninguém depende dos dados atuais antes da Fase 0
- **JWT claim x profile lookup**: ler `company_id` do profile é mais simples mas adiciona 1 query por RLS; alternativa é injetar claim via hook de auth (mais performático, mais complexo). Recomendação: começar com profile lookup cacheado em `current_company_id() STABLE`
- **MV `mv_parcelas_consolidadas`**: precisará incluir `company_id` e RLS na view que a consome
- **Trigger `prevent_last_admin_removal`** existente vira `prevent_last_admin_per_company`

---

## Próximo passo sugerido

Aprovar este roadmap e, em seguida, abrir a **Fase 0** como entrega isolada (migration única + reset + RLS + auditoria), validar em staging, e só então prosseguir para Fase 1.

Nenhuma alteração será feita até você aprovar.
