# Próximos Passos — SaaS Multi-Tenant (Cobrança)

> Documento de planejamento. Reflete o estado real em **2026-05-31** e o que falta.
> Complementa o `PLANO_MULTI_TENANT.md` (visão original) com o progresso concreto.

Projeto Supabase oficial: **`cuejrnqdudadlbuiouph`** (`.env` e `config.toml` alinhados).

---

## ✅ O que já está PRONTO e aplicado no banco

**Fase 0 — Fundação multi-tenant** (migration `20260531170000_fase0...`)
- `companies` + `company_id` em todas as tabelas de domínio
- RLS por tenant (substituiu os `USING(true)`); isolamento real entre empresas
- Papéis: `leitura < operador < financeiro < admin < super_admin`
- Soft delete em tabelas financeiras + bloqueio de DELETE físico (trigger)
- Auditoria universal em `audit_log` (com `company_id`)
- Views isoladas por tenant (`vw_titulos_completos`, `vw_parcelas_consolidadas`)
- RPCs financeiras validando papel; RPC `cancelar_titulo` (substitui delete físico)
- JWT custom access token hook (`custom_access_token_hook`) — injeta `company_id`/`user_role`

**Fase 1/2 — Frontend tenant-aware**
- `AuthContext` lê tenant do JWT (com fallback ao banco) e limpa cache no logout
- `/setup-empresa` (onboarding), `useCurrentCompany`, papéis novos no `useUserRole`
- Tela amigável de "confirme seu e-mail" no cadastro
- `types.ts` regenerado do schema real

**Fase 3 (parcial) — Plataforma**
- Empresa nasce `pendente` (migration `20260531200000_companies_approval`)
- Painel `/plataforma` (super_admin): listar empresas, aprovar/suspender/reativar
- super_admin tem área própria (não vê o dashboard financeiro)
- Gate de acesso: empresa `pendente`/`suspensa` é bloqueada com tela explicativa
- super_admin criado: `eobx@hotmail.com`

### Decisões já tomadas
- Backend = Supabase/Postgres (lógica em RPCs). Sem NestJS/Laravel/Django.
- Tenant via JWT claim (fallback profile). 1 usuário = 1 empresa.
- Onboarding: **self-service + aprovação** do super_admin.
- Equipe: **super_admin cria os usuários** das empresas (admin da empresa só altera papéis).

---

## 🔜 O que FALTA

### Fase 3 — item 3: super_admin cria usuários das empresas
- Criar usuário é operação de admin do Supabase → exige **service role key**.
- Implementar via **Edge Function** (nunca expor a key no frontend):
  - função recebe `{ email, nome, company_id, role }`, valida que o chamador é super_admin,
    cria o usuário (auth admin), e grava profile + user_roles com o `company_id`.
- Tela no `/plataforma` para listar usuários por empresa e cadastrar novos.

### Fase 4 — Auditoria (UI)
- Tela `/auditoria` (admin vê só a própria empresa; super_admin vê tudo).
- Filtros: tabela, usuário, ação, período. Export CSV.
- Backend já grava tudo em `audit_log`.
- Pendência menor: gravar **IP** do autor (via Edge Function ou claim).

### Fase 5+ — Módulos financeiros
- `bank_accounts`, importação **CNAB**, **remessa**, conciliação (já nascem com `company_id`).
- Processamento assíncrono (Edge Functions / pg_cron / Supabase Queues) para CNAB,
  geração de boleto, e-mail, relatórios pesados.

---

## 🔴 Pré-requisitos para LANÇAR (sair do teste)

1. **SMTP próprio** (Authentication → Emails → SMTP). O e-mail embutido do Supabase é
   limitado (causa o erro 429 em testes) e não serve para clientes reais.
   Opções: Resend (mais simples), SendGrid, Postmark, Amazon SES.
2. **Religar confirmação de e-mail** se tiver desligado para testar.
3. **Habilitar o JWT hook** no Dashboard (Auth → Hooks → `custom_access_token_hook`),
   se ainda não estiver — o app funciona via fallback, mas o hook é a prática recomendada.
4. **Billing/assinatura** (ex.: Stripe) para cobrar as empresas por plano.
5. **URL Configuration** com o domínio de produção (Site URL / Redirect URLs).

---

## ✔️ Checklist de teste (fase atual)

- [ ] Confirmar e-mail de teste (ou desligar confirmação no dev) — contorna o 429
- [ ] super_admin (`eobx@hotmail.com`) loga e cai em `/plataforma`
- [ ] Cadastrar empresa de teste → aparece como **pendente** no painel
- [ ] Empresa pendente vê tela "aguardando aprovação" (bloqueada)
- [ ] super_admin **aprova** → empresa acessa o dashboard
- [ ] **Isolamento**: criar 2 empresas e confirmar que uma NÃO vê dados da outra
- [ ] admin da empresa altera papel de um usuário existente (`/usuarios`)
- [ ] Cancelar título → vira "cancelado" (sem delete físico) e some da lista

---

## 📝 Notas técnicas / dívidas
- Migrations pontuais (limpeza de usuários, bootstrap do super_admin) foram aplicadas e
  removidas do histórico — não estão no repo (one-time).
- `REFRESH MATERIALIZED VIEW CONCURRENTLY` roda a cada operação financeira — reavaliar
  para refresh assíncrono/incremental sob volume.
- Convite de equipe pelo próprio admin da empresa ficou **fora** por decisão (super_admin cria).
