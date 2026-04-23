

# Análise Arquitetural — Sistema de Cobrança

## Visão geral

Backend (Supabase + Event Sourcing): muito bem estruturado. Frontend: funcional, mas com problemas significativos de organização que vão atrapalhar manutenção conforme o sistema cresce.

**Nota geral: 7/10** — Backend 9/10, Frontend 5/10.

---

## ✅ Pontos fortes

1. **Event Sourcing no backend**: `eventos_parcela` como append-only ledger, com `mv_parcelas_consolidadas` e `vw_titulos_completos` para leitura. Excelente para auditoria financeira.
2. **RPCs atômicas**: `criar_titulo_com_parcelas`, `registrar_pagamento_parcela`, etc. garantem consistência transacional.
3. **Roles em tabela separada** (`user_roles` + `has_role`), seguindo a melhor prática contra privilege escalation.
4. **Lazy loading de rotas** no `App.tsx` com `React.lazy`.
5. **Sistema de filtros reutilizável** (`useGlobalFilter` + `filterFunctions` + `filterConfigs`) — boa abstração.
6. **TypeScript types gerados** do Supabase (`integrations/supabase/types.ts`).

---

## ⚠️ Problemas principais

### 1. Páginas gigantes (God Components)

```text
Clientes.tsx     → 1191 linhas
Titulos.tsx      → 1009 linhas
Acordos.tsx      →  828 linhas
ImportarCSV.tsx  →  553 linhas
Dashboard.tsx    →  491 linhas
Relatorios.tsx   →  471 linhas
```

Cada página mistura: estado, fetching, mutations, UI da tabela, modais inline, filtros, lógica de negócio. **Regra prática: arquivo de página > 300 linhas é sinal de extração necessária.**

### 2. Data fetching manual com `useState + useEffect`

Hoje: `setLoading(true)` → `supabase.from(...)` → `setData` → `setLoading(false)`, repetido em todas as páginas, sem cache, sem deduplicação, sem invalidação coordenada (chamadas manuais a `fetchTitulos()` após mutações).

`@tanstack/react-query` já está instalado e configurado no `App.tsx`, **mas não é usado em lugar nenhum**. Essa é a maior melhoria possível.

### 3. Camada de acesso a dados ausente

Chamadas `supabase.from(...)` espalhadas direto nas páginas e componentes. Mudar uma view ou regra exige caçar em vários arquivos. Falta uma camada `services/` ou `api/`.

### 4. `useTitulosAgrupados` faz N+1 queries

```typescript
for (const titulo of titulos) {
  await supabase.from('mv_parcelas_consolidadas').select('*').eq('titulo_id', titulo.id)
}
```
Para 100 títulos = 101 requisições. Deve ser **uma query** com `.in('titulo_id', ids)` e agrupamento client-side, ou uma view dedicada.

### 5. Modais inline gigantes

Em `Titulos.tsx` e `Clientes.tsx` os Dialogs de criar/editar/excluir vivem dentro do JSX da página com formulários completos. Deveriam ser componentes próprios (você já fez isso bem em `RegistrarPagamentoModal`, `AplicarEncargoModal` — falta replicar).

### 6. Estrutura de pastas plana demais

```text
hooks/           → só 4 arquivos
utils/           → mistura formatação, filtros, exports
contexts/        → só Auth
```

Falta separação por domínio. Não há `services/`, `types/` global, `lib/queries/`, nem agrupamento por feature.

### 7. Arquivos de scratch no repositório

`src/arquivo_gemini.txt`, `supabase/migrations/profiles.txt`, `table_clientes.txt`, `acordos.sql` (fora do padrão de migration) — ruído que polui o repo.

### 8. Sem tratamento de erros centralizado

Cada `catch` repete `toast({ title: "Erro", ... })`. Sem boundary, sem logger.

### 9. Sem testes
Nenhum `*.test.ts` no projeto.

### 10. `AuthContext` chama `useToast` direto
Acopla auth ao sistema de notificações. Idealmente o context retorna o erro e o componente decide o feedback.

---

## 🎯 Refatoração recomendada (ordem de prioridade)

### Fase 1 — Adoção de React Query (impacto alto, risco baixo)

Criar `src/lib/queries/` com hooks dedicados:

```text
src/lib/queries/
├── titulos.ts       → useTitulos(), useCreateTitulo(), useDeleteTitulo()
├── clientes.ts      → useClientes(), useCliente(id), useUpdateCliente()
├── acordos.ts       → useAcordos(), useCreateAcordo()
├── parcelas.ts      → useParcelasByTitulo(id)
└── dashboard.ts     → useDashboardMetrics()
```

Benefícios: cache, refetch automático, invalidação cruzada, `isLoading`/`isFetching`/`error` consistentes, elimina ~200 linhas por página.

### Fase 2 — Camada de serviços

```text
src/services/
├── titulos.service.ts   → API calls puras (sem React)
├── clientes.service.ts
├── acordos.service.ts
└── parcelas.service.ts
```
Cada hook do React Query consome um serviço. Facilita testes e troca de backend.

### Fase 3 — Reorganização por feature (estilo "screaming architecture")

```text
src/features/
├── titulos/
│   ├── components/   (TabelaTitulos, FormCriarTitulo, ModalDetalhes)
│   ├── hooks/        (useTitulos, useTituloExpansion)
│   ├── services/
│   ├── types.ts
│   └── pages/Titulos.tsx   (~150 linhas, só composição)
├── clientes/
├── acordos/
├── campanhas/
├── telecobranca/
├── dashboard/
└── importacao/
src/shared/
├── components/ui/    (shadcn permanece aqui)
├── components/      (Layout, AppSidebar, GlobalFilter)
├── hooks/
├── lib/
└── utils/
```

### Fase 4 — Quebrar páginas grandes

Para cada página > 400 linhas, extrair:
- Tabela/listagem como componente próprio
- Cada modal (criar, editar, excluir, detalhes) como componente próprio
- Lógica de filtros para hook próprio

Exemplo `Titulos.tsx` ficaria:
```text
features/titulos/
├── pages/Titulos.tsx                  (~150 linhas)
├── components/
│   ├── TitulosClientesTable.tsx
│   ├── TituloExpandedRow.tsx
│   ├── CriarTituloModal.tsx
│   ├── DetalhesTituloModal.tsx
│   └── ConfirmarExclusaoTituloModal.tsx
└── hooks/useTitulosExpansion.ts
```

### Fase 5 — Otimizações pontuais

- Corrigir N+1 em `useTitulosAgrupados` com uma query única `.in('titulo_id', ids)`.
- Criar `<ErrorBoundary>` global e helper `handleSupabaseError(error, context)`.
- Mover constantes de status/labels para `shared/constants/` (hoje em `utils/titulo.ts`).
- Adicionar `<Skeleton>` consistente em vez de spinners ad-hoc.

### Fase 6 — Higiene

- Remover `arquivo_gemini.txt`, `profiles.txt`, `table_*.txt`, `acordos.sql` da raiz.
- Adicionar Vitest + React Testing Library com 1-2 testes-exemplo nos hooks de query.
- ESLint rule `max-lines` (ex: 400) para prevenir regressão.

---

## Resumo executivo

| Prioridade | Ação | Impacto |
|---|---|---|
| 🔴 Alta | Migrar fetching para React Query | Reduz ~30% do código, elimina bugs de cache |
| 🔴 Alta | Quebrar páginas > 500 linhas | Manutenibilidade |
| 🟠 Média | Criar camada `services/` | Testabilidade, reuso |
| 🟠 Média | Reorganizar em `features/` | Escalabilidade |
| 🟠 Média | Corrigir N+1 em `useTitulosAgrupados` | Performance |
| 🟡 Baixa | Limpar arquivos scratch | Higiene |
| 🟡 Baixa | Adicionar testes | Confiabilidade |

**Recomendação**: começar pela **Fase 1 (React Query)** aplicada a uma página (`Titulos.tsx` é a melhor candidata por ser a mais usada e ter mutations complexas). Validar o padrão, depois replicar nas demais.

Se quiser, posso preparar um plano detalhado de implementação para a Fase 1 em uma página específica.

