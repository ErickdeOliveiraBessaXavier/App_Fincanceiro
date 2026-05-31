# Plano Ajustado — Plataforma SaaS Multi-Tenant (Cobrança Financeira)

> Versão revisada do roadmap em `.lovable/plan.md`, alinhada ao estado **real** do código
> (Vite + React + Supabase/Postgres) e aos requisitos de arquitetura financeira multi-tenant.
> Status: **planejamento**. Nada é executado até aprovação fase a fase.

---

## 0. Diagnóstico do estado atual

| Área | Hoje | Veredito |
|---|---|---|
| Multi-tenancy | Inexistente (sem `companies`, sem `company_id`) | ❌ Crítico |
| Isolamento RLS | Policies `USING (true)` — todos veem tudo | ❌ Crítico |
| Lógica financeira | Em RPCs Postgres (`SECURITY DEFINER`) | ✅ Correto |
| Não-deleção financeira | Estorno + event-sourcing em `eventos_parcela` | ✅ … mas frontend tem DELETE físico (`useDeleteTitulo`) | ⚠️ Corrigir |
| Auditoria | `audit_log` + `fn_audit_row` (8 tabelas) | ✅ … sem `company_id` nem IP | ⚠️ Ajustar |
| Roles | `admin, operador, gerente` | ⚠️ Diverge da spec |
| MV `mv_parcelas_consolidadas` | Consultada direto pelo front | ⚠️ Vaza entre tenants |
| Assíncrono (CNAB, boleto, e-mail) | Inexistente | ⏳ Futuro |

### Decisões de arquitetura (assumidas — confirmar)

1. **Backend = Supabase/Postgres.** A lógica financeira já está centralizada em RPCs `SECURITY DEFINER`,
   o que satisfaz "nenhuma regra de negócio no frontend". **Recomendação:** manter este modelo em vez de
   reescrever em NestJS/Laravel/Django (reescrita massiva, sem ganho imediato). Um backend Node/Edge fino
   pode ser adicionado **depois**, só para integrações que o Postgres não faz bem (CNAB, e-mail, filas).
2. **1 usuário pertence a 1 empresa** (mantido do plano original).
3. **Dados atuais serão descartados** (reset) na Fase 0.
4. **Origem do `company_id`:** começar com `current_company_id()` lendo de `profiles` (simples), com plano de
   migrar para **custom access token hook** (claim no JWT) por performance — ver Fase 2.

---

## 1. Hierarquia de papéis (alinhada à spec)

```text
super_admin  → "admin master": opera a PLATAFORMA, vê/gerencia todas as companies, sem company_id obrigatório
admin        → "admin da empresa": administra a própria company (usuários, configs, dados)
financeiro   → operações financeiras (pagamento, encargo, desconto, acordo, estorno)
operador     → execução operacional (telecobrança, registros, comunicações)
leitura      → somente visualização (read-only)
```

Migração do enum atual: `gerente` → `financeiro`; adicionar `super_admin` e `leitura`.
`super_admin` bypassa RLS de tenant via `is_super_admin()`.

| Papel | Ver | Criar/editar cadastro | Operação financeira | Gerir usuários | Plataforma |
|---|---|---|---|---|---|
| super_admin | tudo | — | — | — | ✅ |
| admin | empresa | ✅ | ✅ | ✅ | — |
| financeiro | empresa | ✅ | ✅ | — | — |
| operador | empresa | ✅ (limitado) | — | — | — |
| leitura | empresa | — | — | — | — |

---

## 2. Modelo de dados alvo

### Tabelas novas
- `companies` (id, nome, cnpj, slug, status [`ativa`/`suspensa`], plano, created_at, deleted_at)
- *(futuras, já nascendo com `company_id`)* `bank_accounts`, `imports` (CNAB), `remittances` (remessa)

### Mapeamento dos nomes da spec → schema atual
| Spec | Tabela no projeto |
|---|---|
| customers | `clientes` |
| invoices | `titulos` |
| payments | `eventos_parcela` (event-sourced) |
| audit_logs | `audit_log` |
| companies / bank_accounts / imports / remittances | **a criar** |

### Mudança transversal (após reset)
Adicionar a **toda tabela de domínio**:
- `company_id uuid NOT NULL REFERENCES companies(id)`
- `deleted_at timestamptz NULL` (soft delete) onde for financeiro

Tabelas afetadas: `profiles`, `user_roles` (nullable p/ super_admin), `clientes`, `titulos`, `parcelas`,
`eventos_parcela`, `acordos`, `parcelas_acordo`, `campanhas`, `campaign_logs`, `agendamentos`,
`comunicacoes`, `anexos`, `notificacoes`, `audit_log`.

**Índices obrigatórios:** todo índice de domínio passa a ser composto começando por `company_id`
(ex.: `(company_id, status)`, `(company_id, vencimento)`), para performance por tenant.

---

## 3. Segurança / RLS (núcleo do isolamento)

Funções `SECURITY DEFINER`:
- `current_company_id()` — retorna o `company_id` do `auth.uid()` (via `profiles`; depois via JWT claim). `STABLE`.
- `is_super_admin()` — `has_role(auth.uid(),'super_admin')`.
- `fn_set_company_id()` — `BEFORE INSERT`, preenche `company_id` automaticamente (defesa contra insert sem tenant).
- `prevent_hard_delete_financial()` — bloqueia `DELETE` em tabelas financeiras, forçando soft delete/estorno.
- `prevent_last_admin_per_company()` — evolução do `prevent_last_admin_removal`, por empresa.

Padrão de policy aplicado a **toda** tabela de domínio (substitui os `USING (true)`):
```sql
USING ( is_super_admin() OR company_id = current_company_id() )
WITH CHECK ( is_super_admin() OR company_id = current_company_id() )
```

**Isolamento da MV** (ponto técnico crítico — MV não suporta RLS):
- `mv_parcelas_consolidadas` ganha coluna `company_id`.
- Frontend deixa de consultar a MV diretamente; passa a usar uma **view `security_invoker`** que filtra por tenant,
  ou a MV recebe `REVOKE` de `authenticated`.

---

## 4. Auditoria (ajustada à spec)

`audit_log` ganha `company_id`. `fn_audit_row` passa a gravar:
quem (`actor_id`/`actor_email`), quando (`occurred_at`), **IP**, valor antigo (`before_data`), valor novo (`after_data`).

> **IP:** RPC puro do Postgres não enxerga o IP do cliente. Opções: (a) capturar via **Edge Function**
> que repassa o header e grava no `context`; ou (b) injetar no JWT claim. Decidir na Fase 4.

---

## 5. Fluxo assíncrono (CNAB / boleto / e-mail / conciliação / relatórios)

Sua spec pede Redis + workers. No stack Supabase o equivalente nativo:
- **Supabase Queues** (pgmq) ou **pg_cron** para agendamento.
- **Edge Functions** como workers para CNAB, geração de boleto, e-mail, conciliação e relatórios pesados.
- Redis + workers Node só se/quando o volume justificar (decisão adiada — monolito modular primeiro).

Tabelas de suporte: `imports` (status do processamento CNAB), `remittances` (lotes de remessa), todas com `company_id`.

---

## 6. Roadmap por fases

| Fase | Entrega | Depende de |
|---|---|---|
| **0 — Fundação** | `companies`; `company_id`+`deleted_at` em todas as tabelas; funções `current_company_id`/`is_super_admin`/`fn_set_company_id`; RLS por tenant substituindo `USING(true)`; `prevent_hard_delete_financial`; reset dos dados | — |
| **1 — Onboarding/Auth** | signup cria company + 1º admin; `handle_new_user` exige `company_id`; convite por e-mail com `company_id`+papel; `/setup-empresa`; limpar cache React Query por tenant no logout | 0 |
| **2 — Queries/RPCs** | RPCs financeiras validam/derivam `company_id`; MV + view com `company_id`; `useCurrentCompany()`; cache key `['titulos', companyId]`; **migrar para JWT claim** | 0,1 |
| **2.5 — Correção do DELETE físico** | `useDeleteTitulo` deixa de apagar; passa a **cancelar/soft-delete** via RPC | 0 |
| **3 — Painel super_admin** | `/plataforma`: lista/suspende/reativa tenants, métricas | 1 |
| **4 — Auditoria** | tela `/auditoria` (admin vê só sua company); filtros; IP; export CSV | 0 |
| **5 — Módulos financeiros** | `bank_accounts`, CNAB `imports`, `remittances`, conciliação — já multi-tenant | 0–2 |
| **6 — Assíncrono** | Edge Functions/Queues para CNAB, boleto, e-mail, relatórios | 5 |
| **7 — Hardening** | rate limit por company; backup/export por tenant; **testes E2E de isolamento** (usuário A nunca vê dado de B) | todas |

---

## 7. Erros da spec — como este plano os evita

- ❌ Lógica financeira no front → RPC é fonte única (já hoje); reforçado.
- ❌ Query sem `company_id` → RLS bloqueia + `fn_set_company_id` + cache key por tenant (defesa em profundidade).
- ❌ DELETE físico → `prevent_hard_delete_financial` + correção da Fase 2.5.
- ❌ Regras espalhadas → RPCs centralizam.
- ❌ Acesso direto ao banco pelo front → mantido via Supabase client + RLS.
- ❌ Ausência de auditoria → `fn_audit_row` universal com `company_id` e IP.

---

## 8. Riscos / pontos de atenção

- **Reset destrutivo** na Fase 0 — confirmar que ninguém depende dos dados atuais.
- **MV sem RLS** — precisa de view `security_invoker` ou revogação de acesso (Fase 2).
- **`REFRESH MATERIALIZED VIEW CONCURRENTLY` por pagamento** — gargalo; avaliar refresh assíncrono/incremental.
- **JWT claim vs profile lookup** — começar com lookup `STABLE`; migrar para claim por performance.
- **IP na auditoria** — exige Edge Function ou claim.
- **Storage de anexos** — arquivos precisam de path + policy por tenant (não vazar entre companies).

---

## 9. Próximo passo

Aprovar/ajustar este plano e abrir a **Fase 0** como entrega isolada (migration única + reset + RLS + auditoria),
validar em staging e só então seguir. **Decisões a confirmar:** (1) manter Supabase como backend? (2) conjunto
final de papéis? (3) origem do `company_id` (profile vs JWT)?
