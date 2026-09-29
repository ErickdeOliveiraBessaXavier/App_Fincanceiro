# Auditoria crítica — Sistema de Cobrança

Você foi contratado para fazer uma auditoria independente deste sistema. Seu
trabalho não é elogiar o projeto nem gerar uma lista genérica de boas práticas —
é encontrar problemas reais: erros de regra de negócio, falhas de segurança,
inconsistências de dados, situações em que o sistema pode mostrar informações
erradas ou permitir operações que não deveriam ser permitidas.

Não presuma que uma regra está correta só porque está implementada e "parece
funcionar". Primeiro entenda qual era a intenção da regra, depois verifique se a
implementação realmente corresponde a ela. Sempre que encontrar algo suspeito,
investigue mais fundo antes de concluir. Se não houver evidência suficiente para
confirmar um problema, diga isso explicitamente e explique o que precisaria ser
checado para confirmar.

**Falso positivo custa caro.** Cada achado inventado vira tempo de verificação
manual. Prefira cinco achados confirmados a trinta hipóteses.

---

## Stack real do projeto (leia antes de procurar qualquer coisa)

Não existe backend Python, ORM, nem camada de `services/controllers`. A
arquitetura real é:

| Camada | O que é | Onde fica |
|---|---|---|
| Frontend | React 18 + Vite + TypeScript, shadcn/ui, TanStack Query | `src/` |
| Regra de negócio (cliente) | módulos de domínio puros, com testes Vitest | `src/domain/` |
| Acesso a dados | queries diretas ao PostgREST via `@supabase/supabase-js` | `src/lib/queries/` |
| Backend | **Postgres/Supabase** — a lógica de negócio vive em RPCs PL/pgSQL, triggers, views e RLS | `supabase/migrations/` (61 migrations) |
| Backend HTTP | Edge Functions em Deno/TypeScript | `supabase/functions/` |
| E2E / unitário | Playwright + Vitest | `e2e/`, `*.test.ts` |

Consequências práticas para a auditoria:

* **Não procure `Decimal` nem `float` no backend.** Os campos monetários já são
  `numeric` nas migrations — isso está correto e não precisa ser reauditado. O
  risco de arredondamento real deste projeto está em **TypeScript**: todo valor
  vira `number` (float64 IEEE-754) ao sair do PostgREST, e qualquer soma,
  comparação `===` ou total agregado no cliente carrega esse erro.
* **A autorização não está em middleware** — está em RLS por tabela, em
  `has_min_role()`/`has_role()` dentro das RPCs, e em checagem de papel dentro
  das Edge Functions. É nesses três lugares que se verifica permissão.
* **A transação não é controlada pelo frontend.** Ou a operação inteira está
  dentro de uma função PL/pgSQL (atômica por definição), ou o frontend faz N
  chamadas sequenciais (não atômica). Essa distinção é o eixo da Rodada 1.

---

## Como rodar esta auditoria: 3 rodadas independentes

Não faça tudo de uma vez. O escopo (61 migrations + `src/` inteiro) não cabe em
uma passada com profundidade, e auditoria rasa gera achado inventado. Cada
rodada abaixo é uma execução separada, com relatório próprio:

1. **Rodada 1 — Dinheiro, concorrência e idempotência.** Maior risco não
   auditado. Comece por aqui.
2. **Rodada 2 — Regra de negócio e estados impossíveis.**
3. **Rodada 3 — Volume, performance e limites silenciosos.**

Executando só uma rodada, execute a Rodada 1.

---

## Seção 0 — Modelo de domínio: o que verificar e o que não reauditar

O modelo de referência abaixo vale para qualquer sistema de cobrança com título,
acordo, parcela e pagamento. **Mas boa parte dele já foi implementada neste
projeto.** Está dividido em duas partes: o que é verificação de regressão
(barato, confirmar que continua valendo) e o que é investigação aberta (caro,
onde está o valor).

### 0.A — Já resolvido: verifique regressão, não reinvestigue

Para cada item, a tarefa é **confirmar em uma passada que o invariante continua
valendo**, e só aprofundar se encontrar contra-exemplo. Não escreva análise
longa sobre item verde.

| Invariante | Implementação | Como confirmar rápido |
|---|---|---|
| Saldo é projeção, não coluna decrementada | razão append-only em `movimentos_financeiros` (`20260812130000_razao_financeiro_unico`) | procure `UPDATE` em coluna de saldo/`valor_pago` fora do razão |
| Movimento financeiro unificado (pagamento, estorno, desconto, encargo) | `registrar_pagamento_parcela`, `estornar_movimento`, `conceder_desconto_parcela`, `aplicar_encargo_parcela` | algum fluxo mexe em dinheiro **sem** passar pelo razão? |
| Simetria de estorno título ↔ acordo | `estornar_evento_parcela` e `estornar_evento_parcela_acordo` existem dos dois lados | a simetria vale também para **desconto** e **encargo**? (essa parte não foi verificada) |
| Métrica calculada num único lugar | `src/domain/metricas/` + `20260806120000_metricas_base_unica` | alguma tela soma valor por conta própria em vez de usar o domínio? |
| Título ↔ acordo é N:N | tabela `acordo_titulos` (`20260724150000_acordo_multi_titulo`) | sobrou alguma query lendo `titulo_id` singular num acordo? |
| Dois acordos ativos sobre o mesmo título | `check_titulo_acordo_unico` (`20260803130000_integridade_acordos`) | a constraint cobre acordo multi-título, ou só o caso 1:1? |
| RLS / views vazando dado entre tenants | auditado e corrigido em 2026-08-26 (5 últimas migrations) | rode `supabase db advisors` e compare com o que já foi fechado |

> Se algum desses itens **não** se confirmar, aí sim é achado de alta
> severidade: é regressão sobre correção já aplicada.

### 0.B — Não verificado: investigue de verdade

1. **Fato histórico nunca se sobrescreve.** `valor_original` do título,
   `valor_negociado`/termos do acordo e datas de criação devem ser imutáveis
   após a criação. Procure qualquer fluxo (tela, RPC, Edge Function, importação)
   que faça `UPDATE` nesses campos depois do fato em vez de criar um novo
   registro. Bandeira vermelha mesmo que "resolva" o problema do usuário.
2. **Renegociação é sempre registro novo.** Procure qualquer caminho que faça
   `UPDATE status = 'ativo'` num acordo que já passou por estado terminal
   (cancelado, quebrado, cumprido).
3. **Escolha de parcela nunca deveria ser implícita.** Uma ação de "registrar
   pagamento" no nível do título ou do cliente que escolhe sozinha qual parcela
   recebe a baixa (ex: "a primeira pendente") sem o operador ver e confirmar
   qual é, é fonte clássica de baixa na parcela errada. Verifique
   `src/components/titulos/RegistrarPagamentoModal.tsx` e
   `liquidar_parcelas_titulo`.
4. **Nada de dado financeiro é apagado.** Existe trigger
   `prevent_hard_delete_financial` — confirme que ele cobre **todas** as tabelas
   de movimento, inclusive as criadas depois dele, e que nenhuma RPC
   `SECURITY DEFINER` passa por cima.
5. **Status de ciclo de vida ≠ situação derivada.** "Inadimplente", "em atraso",
   "em negociação" devem ser projeções, nunca coluna que uma tela atualiza por
   conta própria. Confira `src/domain/clientes/situacao.ts` contra o que as
   telas realmente exibem.

Sempre que encontrar uma dessas situações, não trate como bug isolado: aponte a
causa raiz estrutural e verifique se o mesmo padrão se repete em outro lugar
(normalmente se repete).

---

# RODADA 1 — Dinheiro, concorrência e idempotência

Esta é a área de maior risco não auditado do projeto. Um pagamento duplicado ou
um acordo criado pela metade em produção é dano financeiro real e difícil de
reverter.

## 1.1 Atomicidade de operações multi-etapa

Para cada operação abaixo, determine se ela é **uma** chamada atômica ao banco
ou **várias** chamadas sequenciais do frontend. Se for sequencial, descreva
exatamente qual estado inconsistente sobra quando a conexão cai no meio.

* Criar acordo → gerar parcelas do acordo → vincular títulos → liquidar o título
  original (novação). Ponto de partida: `criar_acordo`, `marcar_substituicao`,
  `liquidar_parcelas_titulo`, `src/lib/queries/acordos.ts`,
  `src/components/acordos/SelecionarTitulosAcordo.tsx`.
* Registrar pagamento de parcela → gravar movimento → atualizar status da
  parcela → refletir no título. Ponto de partida: `registrar_pagamento_parcela`,
  `pagar_parcela_acordo`.
* Importar planilha: criar cliente → criar título → gerar parcelas.
  Ponto de partida: `importar_titulo_completo`, `_importar_titulo_completo`,
  `src/pages/ImportarCSV.tsx`.
* Cancelar/excluir título e cliente com a limpeza associada (agendamentos,
  comunicações). Ponto de partida: `cancelar_titulo`, `excluir_cliente`.

Para cada uma responda: está tudo dentro de uma função PL/pgSQL? Se sim, é
atômica. Se o frontend orquestra, **não é** — e o relatório deve dizer qual
registro fica órfão.

## 1.2 Idempotência e requisição repetida

* Duplo clique em "registrar pagamento": gera dois movimentos? Existe alguma
  chave de idempotência, ou o botão só é desabilitado no cliente (o que não
  protege contra retry de rede)?
* Duplo clique em "criar acordo": cria dois acordos sobre o mesmo título? A
  constraint `check_titulo_acordo_unico` pega esse caso, ou há janela de corrida
  entre a checagem e o insert?
* Retry automático do TanStack Query em mutation que já chegou ao banco.
  Verifique a configuração de `retry` nas mutations financeiras.
* **Reimportar o mesmo arquivo**: o importador agrupa parcelas por `Nº TITULO`
  (formato GRAN). Importar o mesmo arquivo duas vezes duplica títulos, é
  idempotente, ou dá erro? Se duplicar, a dívida do cliente dobra na tela.
* Arquivo parcialmente inválido: processa tudo-ou-nada, ou entra parcialmente
  sem dizer quais linhas falharam?

## 1.3 Escrita concorrente

* Dois operadores registrando pagamento na mesma parcela ao mesmo tempo:
  existe `SELECT ... FOR UPDATE`, controle otimista, ou o último `UPDATE` vence?
* Um operador criando acordo enquanto outro registra pagamento no título de
  origem.
* Estorno concorrente com novo pagamento na mesma parcela.

## 1.4 Precisão monetária em TypeScript

* Onde valores vindos do banco (`numeric` → `number` em JS) são **somados no
  cliente** em vez de agregados em SQL? Cada soma dessas acumula erro de
  float64.
* Existe comparação de igualdade entre valores monetários (`===`, `!==`,
  `valor === 0`, `saldo === total`) para decidir se algo está quitado? Isso
  falha silenciosamente com centavos.
* Regra de arredondamento: é a mesma em todo lugar (banco e frontend)? Meio
  centavo arredonda para onde, e isso é consistente?
* Conversão de string brasileira (`R$ 1.234,56`) na importação: o parsing assume
  o separador certo? Perde casa decimal? Aceita valor negativo?
* Total do dashboard bate exatamente com a soma das linhas da listagem
  detalhada correspondente, ou diverge por arredondamento de exibição?

## 1.5 Casos extremos de valor

Pagamento parcial; pagamento maior que o saldo; múltiplos pagamentos na mesma
parcela; valor zero; valor negativo; desconto de 100%; parcela única; estorno de
um estorno; quebra de acordo logo após pagamento parcial (o valor pago fica
preservado no histórico?); título com acordo ativo recebendo pagamento direto
(deveria ser bloqueado — é?).

---

# RODADA 2 — Regra de negócio e estados impossíveis

## 2.1 Estados impossíveis

Escreva uma query de diagnóstico para cada um e diga se o schema permite:

* Acordo `cumprido` com parcela ainda pendente.
* Acordo `ativo` cujas parcelas estão todas pagas.
* Título `quitado` com saldo > 0 na projeção do razão.
* Parcela paga com soma de movimentos igual a zero (ou vice-versa).
* Movimento financeiro sem parcela associada; parcela sem título/acordo pai.
* Cliente com título em aberto e situação derivada "sem dívida".

## 2.2 Regra aplicada num fluxo e ignorada em outro

Este é o padrão mais produtivo de procurar. A mesma regra pode existir em três
lugares (frontend, RPC, constraint) com definições levemente diferentes:

* Regra que a tela aplica mas a **importação em lote** não.
* Regra que a tela aplica mas a **API v1** (`supabase/functions/api-v1`) não —
  ela é consumida por ERP externo e não passa pela UI.
* Regra que a RPC aplica mas a Edge Function equivalente não.
* Operação que a UI não oferece botão mas o PostgREST aceita direto.

## 2.3 Datas e atraso

* Off-by-one em dias de atraso; comparação de `date` com `timestamptz`.
* Fuso horário: o projeto já tem `parseDataLocal`/`isoDeData`/`hojeIso` em
  `src/utils/`. Sobrou algum `toISOString()` ou `new Date(colunaDate)` cru?
  Esse padrão desloca a data em um dia no Brasil.
* Confusão entre data de criação, vencimento, pagamento e atualização — procure
  query que usa a data errada para decidir status.
* Vencimento em fim de semana/feriado: a regra atual ignora — está correto para
  o negócio?

## 2.4 Cadastro e identidade

* CPF/CNPJ com e sem máscara, zeros à esquerda, validação de dígito verificador
  (existe no banco ou só no frontend?). O projeto centraliza formatação em
  `src/utils/format.ts` — a validação também está centralizada?
* Cliente duplicado pelo mesmo documento: existe `UNIQUE` por
  `(company_id, documento)`?
* Cliente sem responsável, com vários, ou transferido entre carteiras.
* Cliente arquivado/excluído (soft) ainda aparecendo em contagem, soma ou join
  que esqueceu o filtro.

## 2.5 Autorização efetiva por papel

Os papéis são `leitura < operador < financeiro < admin < super_admin`, mais
`cobrador` e `vendedor` com carteira própria. Verifique **no backend**, não no
menu:

* Cada RPC financeira chama `has_min_role()` com o papel certo?
* Cobrador consegue, via PostgREST direto, ler cliente fora da própria carteira?
  (`cobrador_ve_cliente`, `cobrador_ve_titulo`)
* Vendedor é read-only de verdade, ou alguma RPC aceita escrita dele?
* Edge Functions com `service_role`: todas validam o papel do chamador antes de
  usar a key? Especialmente `criar-usuario-empresa`,
  `excluir-usuario-empresa`, `criar-chave-api`.
* Troca de `cliente_id`/`titulo_id`/`acordo_id` no payload atinge dado de outro
  tenant?

---

# RODADA 3 — Volume, performance e limites silenciosos

## 3.1 Truncamento silencioso do PostgREST (verificar primeiro)

O projeto pagina **no cliente** (`usePagination` + `TablePagination`,
pageSize 25), o que significa que a query traz o conjunto inteiro. Existem
apenas 5 usos de `.range()`/`.limit()` em todo o `src/`. O PostgREST aplica um
limite default de linhas e **corta o resultado sem erro**.

Para cada listagem principal (Títulos, Clientes, Acordos, Fila, Relatórios,
Telecobrança): quantas linhas ela pede? O que acontece quando o tenant passa de
1000 títulos? O total exibido fica errado sem nenhum aviso — e o usuário não tem
como perceber. Este é um bug latente que aparece sozinho conforme a base cresce.

## 3.2 Volume 10x / 100x / 1000x

* Índices ausentes em coluna de filtro/join frequente (`cliente_id`,
  `company_id`, `status`, datas de vencimento) — e índices redundantes.
* `SELECT *` em listagem trazendo coluna pesada sem necessidade.
* N+1 query: componente que busca dado relacionado por linha renderizada.
* Views e a materialized view de parcelas (`refresh_mv_parcelas`): quando são
  atualizadas, e o custo cresce como?
* Dashboard e Relatórios: agregação feita em SQL ou puxando linha a linha para
  o cliente?
* Lista grande sem virtualização; refetch a cada render; polling desnecessário.
* Importação de arquivo grande: processamento síncrono bloqueia a aba?

## 3.3 Consistência entre telas

Para cliente, título, acordo, parcela, pagamento e responsável que aparecem em
mais de uma tela, verifique se é a mesma fonte, o mesmo filtro e o mesmo cálculo
— e se o mesmo status usa o mesmo rótulo e a mesma cor em todo lugar. Procure
ativamente por "na tela A está certo, na tela B está diferente" comparando o
código, não o resultado visual.

## 3.4 Frontend e UX

Pergunte sempre: **um usuário leigo entenderia o que está acontecendo aqui sem
conhecer a implementação?**

* Rótulo ambíguo ("Valor" — original, negociado, pago ou saldo?).
* Ação perigosa (cancelar acordo, excluir cliente, estornar pagamento) sem
  confirmação ou sem exigir motivo.
* Estado vazio, de erro e de loading mal tratado; erro genérico que não diz o
  que fazer.
* Feedback insuficiente: o operador sabe se o pagamento foi mesmo registrado?

---

## Classificação (use com honestidade)

* **BUG CONFIRMADO** — evidência clara no código, com arquivo e linha.
* **RISCO** — possibilidade real, não confirmável por análise estática. Diga
  exatamente o que precisaria ser testado.
* **MELHORIA** — não é erro, mas há oportunidade clara.
* **DÚVIDA** — falta informação de regra de negócio para julgar.

Preferência de estilo não é bug. Para cada problema, mostre a evidência e
explique por que é problemático — não basta dizer "isso está errado".

## Severidade

* **CRÍTICO** — perda ou vazamento de dado, valor financeiro incorreto.
* **ALTO** — erro importante de negócio, acesso indevido, inconsistência
  significativa.
* **MÉDIO** — cenário específico, impacto limitado.
* **BAIXO** — problema pequeno, UX ou manutenção.

---

## Formato do relatório (por rodada, não um documento único)

Mantenha enxuto. O relatório é para agir, não para arquivar.

1. **Veredito da rodada** — 2 parágrafos: o que está sólido, o que preocupa.
2. **Achados**, em ordem de severidade. Para cada um:
   * Problema (uma frase)
   * Classificação e severidade
   * Evidência — arquivo:linha ou trecho
   * Cenário em que acontece
   * Impacto
   * Como corrigir
   * Como testar a correção
3. **Tabela de priorização**:

   | Problema | Classificação | Severidade | Esforço | Prioridade |
   |----------|---------------|------------|---------|------------|

4. **Verificações que passaram** — lista curta, uma linha cada. Serve para eu
   saber o que foi coberto e não precisa ser reauditado na próxima rodada.

---

## Regra principal

Seja desconfiado, mas seja honesto sobre o nível de certeza. Não presuma que o
código está correto porque aparentemente funciona — tente quebrá-lo. Sempre que
encontrar um padrão problemático (assimetria entre entidades irmãs, cálculo
duplicado da mesma métrica, regra aplicada num fluxo e não em outro), trate como
sinal estrutural e procure onde mais ele se repete.

Se não houver evidência suficiente para confirmar um problema, diga
explicitamente que é hipótese e informe o que precisaria ser verificado. E se
uma área estiver realmente sólida, diga isso em uma linha e siga adiante — não
invente achado para preencher relatório.
