# Design System & Padrões UI (CobrançaPro)

Diretrizes visuais do app. A regra de ouro: **o padrão mora no componente base,
não na tela.** Antes de escrever classe de aparência numa página, veja se o
componente já resolve; se um padrão novo se repete em 2+ lugares, ele nasce no
componente base.

## 1. Princípios

1. **Contexto sobre dado bruto:** número sem referência não ajuda; use tendência,
   percentual de progresso ou comparação.
2. **Hierarquia clara:** tamanho, peso e espaçamento levam o olho do mais crítico
   (KPIs) para o operacional (listas e ações).
3. **Menos ruído:** cor só com significado semântico; nada de bordas pesadas.
4. **Ação imediata:** o que exige ação do usuário fica agrupado e visível.

## 2. Componentes base (use em vez de copiar classes)

| Precisa de | Use | Onde |
|---|---|---|
| Cartão | `<Card>` — já traz `rounded-xl`, `border-none`, `bg-card`, `shadow-card` e transição. Só `hover:shadow-card-hover` precisa ser escrito | `src/components/ui/card.tsx` |
| Caixa aninhada num cartão | `rounded-lg` (= `var(--radius)`), casa com `p-1` da moldura | — |
| Rótulo "eyebrow" (texto curto sobre um valor) | `<Rotulo>`; ou `rotuloClasses` quando o elemento vem de outro componente (`CardTitle`, `Label`) | `src/components/Rotulo.tsx` |
| Cabeçalho de tabela | `<TableHead>` — já nasce no padrão; não passe classes de tipografia | `src/components/ui/table.tsx` |
| Abas | `<TabsList variant="pill">` — a variante desce por contexto para o `TabsTrigger` | `src/components/ui/tabs.tsx` |
| Status (título, parcela, acordo…) | `<StatusBadge domain status>` — rótulo, cor e ícone vêm de `statusConfig` | `src/components/StatusBadge.tsx`, `src/constants/statusConfig.ts` |
| Título da página | `<PageHeader>` | `src/components/PageHeader.tsx` |
| Faixa de números/KPIs | `<ResumoNumeros>`, `<StatPillar>` | `src/components/` |
| Paginação de lista | `usePagination` + `<TablePagination>` | `src/components/TablePagination.tsx` |
| Ação destrutiva | `<ConfirmarAcaoDestrutiva>` | `src/components/` |
| Carregamento de página | `<TelaCarregamento>` | `src/components/` |
| Moeda, data, CPF/CNPJ, telefone | `formatMoeda`, `formatData`, `formatCpfCnpj`, `formatTelefone`, máscaras e `InputMoeda`/`InputMascarado` | `src/utils/format.ts` |

Não use `rounded-2xl`/`rounded-3xl` em `<Card>`, não recopie
`text-[10px] font-bold uppercase tracking-widest` e não formate data com
`new Date(colunaDate)` — desloca um dia no fuso do Brasil (use `formatData`/
`parseDataLocal`).

## 3. Tipografia (Plus Jakarta Sans)

- **Título de página:** via `PageHeader` (`text-4xl font-black tracking-tighter`).
- **Título de card:** `text-lg`/`text-xl`, `font-bold`, `tracking-tight`.
- **KPI numérico:** `text-3xl`–`text-4xl`, `font-black`, `tracking-tighter`.
- **Apoio a valores:** `text-sm font-medium text-muted-foreground`.
- **Texto geral:** `text-sm`, `font-medium` ou `font-semibold` conforme destaque.

## 4. Espaçamento

- **Grid de overview:** 12 colunas no `xl` (ex.: 8 para conteúdo, 4 para ações).
- **Entre seções:** `space-y-10` / `gap-10`.
- **Dentro do card:** `p-6` a `p-8`; `p-4` só em sub-componente denso.
- **Divisórias:** `bg-border/60` ou contraste de superfície (`bg-muted`/`bg-card`)
  em vez de linha sólida.

## 5. Cores semânticas

- **Primary:** ação afirmativa, link principal, foco.
- **Success (verde):** pago, meta atingida.
- **Destructive (vermelho):** inadimplência, atraso grave, erro, exclusão.
- **Warning (laranja):** alerta, prazo próximo.

Badges: `rounded-full`, fundo `bg-[cor]/10`, texto na cor, `text-xs font-bold`.
Prefira sutileza a fundos coloridos inteiros.

## 6. Valores financeiros

- Acima de 1 milhão: notação compacta com 1 casa (`R$ 1,5 M`).
- Centavos: ocultos em totalizadores de dashboard; visíveis em parcela, fatura
  e conciliação.

## 7. Carregamento

Prefira `Skeleton` desenhando a estrutura final da tela a spinner central — evita
reflow e ansiedade.
