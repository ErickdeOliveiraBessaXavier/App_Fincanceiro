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

Na raiz, só o que se consulta sempre:

- [`CLAUDE.md`](CLAUDE.md) — regras do projeto (função nova no banco nasce fechada; complexidade ciclomática).
- [`PENDENCIAS.md`](PENDENCIAS.md) — tudo o que está em aberto. Item feito sai de lá.

Referência, em [`docs/`](docs/):

- [`docs/api/README.md`](docs/api/README.md) — API de integração v1, técnica (para a TI do cliente).
- [`docs/api/PERGUNTAS-FREQUENTES.md`](docs/api/PERGUNTAS-FREQUENTES.md) — a mesma API sem jargão, para conversa comercial.
- [`docs/DESIGN_SYSTEM.md`](docs/DESIGN_SYSTEM.md) — padrões visuais e componentes base.
- [`docs/CONFIGURAR_SMTP.md`](docs/CONFIGURAR_SMTP.md) — e-mail próprio (pré-lançamento).
- [`docs/auditoria/`](docs/auditoria/) — roteiro da auditoria em 3 rodadas (`PLANO.md`) e os relatórios das rodadas já feitas.
- [`supabase/functions/enviar-campanha/README.md`](supabase/functions/enviar-campanha/README.md) — canal de WhatsApp.

Teste de ponta a ponta da API (só leitura): `node scripts/testar-api-v1.mjs`.
