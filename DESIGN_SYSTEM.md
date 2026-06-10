# Design System & Padrões UI (CobrançaPro)

Este documento estabelece as diretrizes visuais e comportamentais do sistema CobrançaPro, extraídas da modernização do Dashboard. O objetivo é garantir consistência, reduzir a carga cognitiva do usuário e acelerar o desenvolvimento de novas telas.

## 1. Princípios de Design

1.  **Contexto sobre Dados Brutos:** Priorize *insights* operacionais. Não exiba números sem referência; use tendências, percentuais de progresso e *benchmarks*.
2.  **Hierarquia Clara:** Use o tamanho e o peso da fonte, juntamente com o espaçamento, para guiar os olhos do usuário das informações mais críticas (KPIs globais) para os detalhes operacionais (listas e ações).
3.  **Redução de Ruído:** Oculte frações decimais em valores altos (ex: em totalizadores), limite o uso de cores apenas para significado semântico (alerta, sucesso, informação) e evite bordas pesadas.
4.  **Ação Imediata:** Agrupe itens que requerem ação do usuário (vencimentos iminentes, top devedores) em zonas de "Ação Prioritária".

## 2. Tipografia (Tailwind base: Plus Jakarta Sans)

A tipografia deve transmitir clareza e autoridade.

*   **Títulos de Seção (Ex: "Resumo Executivo"):** `text-3xl` ou `text-4xl`, `font-black`, `tracking-tighter`.
*   **Títulos de Cards:** `text-lg` ou `text-xl`, `font-bold`, `tracking-tight`.
*   **Valores Numéricos (KPIs):** `text-3xl` a `text-4xl`, `font-black`, `tracking-tighter` (usa proporção semântica para saltar aos olhos).
*   **Subtítulos / Apoio a Valores:** `text-sm`, `font-medium`, `text-muted-foreground`.
*   **Rótulos de Categoria (Labels de pilares/tabelas):** `text-[10px]` ou `text-xs`, `font-bold`, `uppercase`, `tracking-widest`, `text-muted-foreground`. Utilizado para trazer estrutura sem competir com os dados.
*   **Texto Geral (Listas, descrições):** `text-sm`, `font-medium` ou `font-semibold` dependendo do destaque.

## 3. Espaçamento e Layout (Grids e Gaps)

O respiro (whitespace) é fundamental para o visual limpo.

*   **Grid Principal (Telas de Dashboard/Overview):** 12 colunas (`grid-cols-12`) no desktop (`xl`). Permite subdivisões flexíveis (ex: 8 colunas para relatórios longos, 4 colunas para *sidebars* de ação).
*   **Espaçamento entre seções:** `space-y-10` ou `gap-10` entre blocos conceituais distintos.
*   **Espaçamento interno de Cards:** `p-6` a `p-8`. Evite `p-4` a menos que seja um sub-componente muito denso.
*   **Bordas e Divisórias:** Substitua linhas sólidas por `bg-border/60` (fina, semi-transparente) ou use o próprio `bg-muted` / `bg-card` para separar elementos.

## 4. Cards e Superfícies

*   **Estilo Base:** `border-none`, `shadow-card`, `rounded-2xl` (ou `rounded-3xl` para wrappers externos).
*   **Interatividade:** Adicione `group`, `hover:shadow-card-hover`, `transition-all` e `duration-300` para cards clicáveis.
*   **Containers de Destaque:** Para agrupar funcionalidades relacionadas (como a barra lateral "Prioridades de Hoje"), utilize um wrapper de destaque:
    ```html
    <div className="bg-primary/5 rounded-3xl p-1 border border-primary/10">
      <div className="bg-background rounded-[calc(1.5rem-2px)] p-6">...</div>
    </div>
    ```

## 5. Cores Semânticas e Componentes

Use cores intencionalmente. Não adicione fundos coloridos inteiros; prefira sutileza.

*   **Primary (Roxo/Azul do tema):** Ações afirmativas, links principais, foco.
*   **Success (Verde):** Metas atingidas, pagamentos realizados, evolução positiva.
*   **Destructive (Vermelho):** Inadimplência, atrasos graves, erros, exclusões.
*   **Warning/Orange:** Alertas, proximidade de prazo (ex: "vence em 2 dias").

### Badges e Status
*   Prefira *badges* arredondados (`rounded-full`) com fundo com baixa opacidade (`bg-[color]/10`) e texto contrastante (`text-[color]`).
*   Textos dentro de *badges* analíticos devem ser `text-xs`, `font-bold`, preferencialmente `uppercase` (ex: "ATUALIZADO", "POR VOLUME").

### Indicadores Numéricos (Valores Financeiros)
*   **Acima de 1 Milhão:** Use notação compacta com 1 casa decimal (ex: `R$ 1,5 M`) e evite centavos.
*   **Centavos:** Oculte em Dashboards globais. Mostre apenas em faturas individuais ou relatórios de conciliação.

## 6. Estados de Carregamento (Skeleton)

*   **Abandone o "Spinner" central.** Causa ansiedade e reflow de layout.
*   **Use `Skeleton` integrado:** A página deve carregar desenhando a estrutura final da tela. Blocos cinzas (`animate-pulse`) devem simular a posição exata de KPIs, gráficos e textos.

## 7. Inconsistências Atuais e Estratégia de Transição

**Inconsistências Identificadas no Código Legado:**
*   **Excesso de `text-xs` não estruturado:** Muitos componentes (como `GlobalFilter`, `NotificationBell`, Telas de Acordos) usam `text-xs` misturado com peso normal ou sem hierarquia visual clara, tornando a leitura difícil.
*   **Bordas Padrão vs. Sem Borda:** Há um mix de componentes usando o padrão Radix antigo (`border border-border`) contra o novo padrão do Dashboard (`border-none shadow-card`).
*   **Paddings Pequenos:** Vários formulários e sub-listas usam `p-4` ou `p-3`, parecendo comprimidos em relação ao novo grid espaçoso.

**Plano de Padronização Gradual:**
1.  **Fase 1: Envelopamento (Wrappers):** Aplicar a nova padronização de `Layout` e `Cards` nas páginas principais (Acordos, Clientes, Relatórios). Atualizar os imports de Card para garantir que todos usem a sombra customizada (`shadow-card`) e removam a borda dura.
2.  **Fase 2: Refatoração Tipográfica:** Criar componentes de tipografia padrão (ex: `<Heading />`, `<Metric />`, `<Label />`) e substituir a miscelânea de classes Tailwind soltas.
3.  **Fase 3: Tabelas e Listas:** Modernizar a UI de `DataTables`, substituindo bordas internas por listras sutis e aplicando a nova hierarquia de tipografia para cabeçalhos de coluna (uppercase, tracking-widest).
4.  **Fase 4: Formulários:** Aumentar os *inputs*, adotar paddings maiores e usar validação visual alinhada às cores semânticas (vermelho apenas para erro).

---
*Este documento é vivo e deve ser atualizado sempre que um novo padrão comportamental ou visual for consolidado em produção.*