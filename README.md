# CobrançaPro

Sistema de cobrança multi-tenant: títulos, parcelas, acordos, telecobrança,
campanhas e relatórios, com isolamento por empresa.

## Stack

| Camada | O que é | Onde fica |
|---|---|---|
| Frontend | React 18 + Vite + TypeScript, shadcn/ui, Tailwind, TanStack Query | `src/` |
| Regra de negócio (cliente) | módulos de domínio puros, testados com Vitest | `src/domain/` |
| Acesso a dados | queries ao PostgREST via `@supabase/supabase-js` | `src/lib/queries/` |
| Backend | Postgres/Supabase — RPCs PL/pgSQL, triggers, views e RLS | `supabase/migrations/` |
| Backend HTTP | Edge Functions (Deno) — usuários, chaves de API, API v1, campanhas | `supabase/functions/` |
| Testes | Vitest (unitário) e Playwright (E2E) | `*.test.ts`, `e2e/` |

## Rodando

```sh
npm i
npm run dev        # http://localhost:8080
npm test           # Vitest
npm run lint
npm run build
```

Banco (projeto Supabase linkado):

```sh
npm run db:status  # migrations locais × remotas
npm run db:push    # aplica migrations pendentes
npm run db:types   # regenera src/integrations/supabase/types.ts
```

## Documentos

- [`CLAUDE.md`](CLAUDE.md) — regras do projeto (complexidade ciclomática).
- [`PENDENCIAS.md`](PENDENCIAS.md) — tudo o que está em aberto.
- [`Plano_Auditoria.md`](Plano_Auditoria.md) — roteiro da auditoria em 3 rodadas.
- [`DESIGN_SYSTEM.md`](DESIGN_SYSTEM.md) — padrões visuais e componentes base.
- [`CONFIGURAR_SMTP.md`](CONFIGURAR_SMTP.md) — e-mail próprio (pré-lançamento).
- [`docs/api/README.md`](docs/api/README.md) — API de integração v1 (para o ERP do cliente).
- [`supabase/functions/enviar-campanha/README.md`](supabase/functions/enviar-campanha/README.md) — canal de WhatsApp.
