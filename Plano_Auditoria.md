# Auditoria completa e crítica — Sistema de Cobrança

Você foi contratado para fazer uma auditoria independente deste sistema antes de
colocá-lo em produção (ou antes de uma release importante). Seu trabalho não é
elogiar o projeto nem gerar uma lista genérica de boas práticas — é encontrar
problemas reais: erros de regra de negócio, falhas de segurança, inconsistências
de dados, situações em que o sistema pode mostrar informações erradas ou permitir
operações que não deveriam ser permitidas.

Não presuma que uma regra está correta só porque está implementada e "parece
funcionar". Primeiro entenda qual era a intenção da regra, depois verifique se a
implementação realmente corresponde a ela. Sempre que encontrar algo suspeito,
investigue mais fundo antes de concluir. Se não houver evidência suficiente para
confirmar um problema, diga isso explicitamente e explique o que precisaria ser
checado para confirmar.

---

## 0. Modelo de domínio de referência (cobrança)

Antes de avaliar se algo é "certo" ou "errado", explore o código e reconstrua o
modelo de domínio real implementado — depois compare com os invariantes abaixo,
que valem para praticamente qualquer sistema de cobrança com título, acordo,
parcela e pagamento. Trate divergência como candidato a BUG ou RISCO, não como
estilo:

1. **Fato histórico nunca se sobrescreve.** Valores originais (`valor_original`
   do título, `valor_negociado`/termos do acordo, datas de criação) devem ser
   imutáveis a partir da criação. Se algum fluxo edita esses campos depois do
   fato (em vez de criar um novo registro/movimento), isso é uma bandeira
   vermelha, mesmo que "resolva" o problema imediato do usuário.
2. **Saldo é projeção, nunca coluna decrementada.** Procure por qualquer
   `UPDATE` em campo de saldo/valor_pago disparado a cada pagamento. O saldo
   correto é sempre `valor_face − soma de movimentos que o reduzem + soma de
   estornos que revertem isso`. Uma coluna de saldo mantida por update é fonte
   quase garantida de divergência entre telas.
3. **Todo movimento de dinheiro deveria ser o mesmo tipo de fato.** Pagamento,
   estorno, desconto, encargo/juros, ajuste manual — verifique se são tratados
   de forma unificada (um "ledger" append-only) ou se cada tipo tem seu próprio
   mecanismo. Preste atenção especial a **assimetrias entre entidades irmãs**:
   se existe estorno para parcela de título, existe também para parcela de
   acordo (ou vice-versa)? Se existe desconto para um, existe para o outro?
   Assimetria aqui não é feature faltando — é sinal de que o conceito de
   "movimento financeiro" não foi generalizado, e tende a gerar o mesmo tipo de
   bug em todo lugar onde a simetria falta.
4. **Status de ciclo de vida ≠ situação derivada.** `status` de um acordo
   (ativo, cumprido, cancelado, quebrado) é fato. "Inadimplente", "em atraso",
   "em negociação" são *projeções calculadas* a partir de título + acordos +
   movimentos — nunca deveriam ser uma coluna que uma tela específica atualiza
   por conta própria. Se duas telas parecem calcular a mesma coisa (situação do
   cliente, dívida total) por caminhos de código separados, isso é bug de
   arquitetura mesmo que os números batam hoje — o risco é divergência futura,
   não erro atual.
5. **Renegociação é sempre um registro novo.** Um acordo cancelado ou quebrado
   não deveria ser reaberto/reativado. Procure por qualquer caminho de código
   que faça `UPDATE status = 'ativo'` num acordo que já passou por um estado
   terminal.
6. **Relação título↔acordo costuma ser N:N, não 1:1.** Um acordo pode
   consolidar vários títulos; um título pode ter tido vários acordos ao longo
   do tempo (mas nunca dois *ativos* simultaneamente sobre o mesmo saldo).
   Procure especificamente por telas/queries que leem um campo `titulo_id`
   singular quando o schema já modela N:N via tabela de junção — isso produz
   informação **errada**, não apenas incompleta (ex: acordo que cobre 3 títulos
   aparecendo como se cobrisse 1).
7. **Nada de dado financeiro é apagado ou editado.** Correção é sempre um novo
   registro (estorno, ajuste) referenciando o original, com motivo obrigatório.
   `DELETE` ou `UPDATE` destrutivo em qualquer tabela de movimento financeiro é
   suspeito por padrão.
8. **Escolha de parcela nunca deveria ser implícita.** Uma ação de "registrar
   pagamento" no nível do título/cliente que escolhe automaticamente qual
   parcela recebe a baixa (ex: "a primeira pendente") sem o operador ver e
   confirmar qual parcela é essa, é uma fonte clássica de baixa na parcela
   errada — procure por esse padrão explicitamente.

Ao longo da auditoria, sempre que encontrar uma dessas oito situações, não trate
como um bug isolado — aponte a causa raiz estrutural e avalie se o mesmo padrão
se repete em outros lugares do código (normalmente se repete).

---

## 1. Entenda primeiro o sistema

Antes de apontar problemas, explore o projeto e documente (com base em código,
não em suposição):

* Objetivo principal do sistema e para quem ele serve.
* Perfis de usuário e o que cada um pode/não pode fazer.
* Principais fluxos de uso ponta a ponta.
* Quais dados entram no sistema, de onde vêm (formulário, importação, API,
  integração externa) e quem os digita/valida.
* Onde os dados são armazenados e como se relacionam (esboce o modelo
  relacional real, não o que a documentação diz que é).
* Quais regras de negócio existem — e onde estão implementadas (pode haver a
  mesma regra duplicada em frontend, backend e banco, cada uma levemente
  diferente).
* Quais operações alteram dados, e quais desses dados são financeiros vs.
  cadastrais vs. derivados/calculados.
* Quais telas dependem de quais dados, e como frontend, backend, banco e APIs
  externas se comunicam.
* Linguagem/stack principal (aqui: Python no backend) — identifique onde a
  lógica de negócio realmente vive (services/domain) vs. onde deveria viver mas
  está espalhada em views/controllers/handlers.

---

## 2. Erros de regra de negócio

Além dos itens do modelo de domínio (Seção 0), procure especificamente por:

* Clientes classificados incorretamente (ex: situação de dívida calculada sem
  considerar acordo ativo).
* Clientes atribuídos ao responsável/carteira errado, ou sem responsável.
* Regras de dias de atraso com off-by-one, fuso horário errado, ou que ignoram
  feriados/fins de semana quando deveriam considerar.
* CPF/CNPJ tratados de forma inconsistente: com/sem máscara, com/sem zeros à
  esquerda, validação de dígito verificador ausente ou só no frontend.
* Duplicidade de clientes (mesmo CPF/CNPJ cadastrado mais de uma vez; merge de
  cadastros duplicados perdendo histórico).
* Alterações que sobrescrevem dado histórico em vez de criar novo registro.
* Valores financeiros incorretos (ver Seção 8 em detalhe).
* Confusão entre data de criação, vencimento, pagamento, atraso e atualização —
  procure por queries que usam a data errada para decidir status.
* Status que podem entrar em estados impossíveis (ex: acordo "cumprido" com
  parcelas ainda pendentes; título "quitado" com saldo > 0 na projeção).
* Operações que deveriam ser proibidas mas são permitidas pela API/serviço
  mesmo que a UI não ofereça o botão.
* Regras aplicadas em um fluxo (ex: tela) mas ignoradas em outro (ex: importação
  em lote, endpoint administrativo, script de manutenção).
* Divergência entre o que a interface mostra e o que é realmente persistido.
* Cálculos que produzem resultado incorreto em casos extremos (parcela única,
  valor zero, desconto de 100%, arredondamento).

---

## 3. Testes mentais de casos extremos

Não analise só o caminho feliz. Simule e diga, para cada caso, se o sistema se
comportaria corretamente e, se não, qual seria o problema:

**Cadastro / cliente**
* Cliente sem CPF/CNPJ; CPF/CNPJ duplicado; nome alterado; sem responsável;
  com vários responsáveis; transferido entre responsáveis.

**Título / acordo / pagamento**
* Pagamento parcial; pagamento maior que o esperado; pagamento atrasado;
  múltiplos pagamentos na mesma parcela; título com acordo ativo recebendo
  pagamento direto (deveria ser bloqueado?); acordo criado sobre título que já
  tem outro acordo ativo; acordo quebrado sendo "reaberto"; acordo já
  renegociado sendo renegociado de novo; quebra de acordo com pagamento parcial
  recente (o valor pago fica preservado no histórico?); estorno de um estorno.

**Valores e datas**
* Valores zerados; valores negativos; datas futuras; datas muito antigas;
  campos vazios.

**Dados e volume**
* Dados duplicados; importação repetida do mesmo arquivo (é idempotente?);
  dois usuários alterando o mesmo registro simultaneamente; exclusão de
  registro com relacionamentos (título com acordo, cliente com títulos);
  registros desativados que ainda aparecem em listagens/relatórios/totais;
  usuário tentando acessar dados de outro usuário/outra carteira; grande
  quantidade de registros; paginação; filtros combinados; busca sem resultado;
  busca com caracteres especiais (`%`, `_`, aspas, emoji); perda ou
  sobrescrita de dado em atualização concorrente.

**Operação repetida / rede instável**
* Duplo clique no botão de "registrar pagamento" ou "criar acordo"; requisição
  reenviada por timeout/retry do frontend; conexão caindo no meio de uma
  operação multi-etapa (ex: criar acordo + gerar parcelas + vincular títulos).

---

## 4. Segurança

Verifique, sempre com evidência no backend/banco — não considere algo seguro só
porque está escondido na UI:

* Autenticação (sessão, token, expiração, revogação).
* Autorização e controle de acesso por perfil (o que cada papel pode
  efetivamente fazer, testado no backend, não só escondido no menu).
* Row Level Security / equivalente: um usuário consegue, via API direta,
  consultar ou alterar dados de outro usuário/carteira/tenant?
* Endpoints administrativos acessíveis sem checagem de perfil.
* Dados sensíveis expostos no payload do frontend mesmo que não exibidos na
  tela (CPF completo, valores de outros clientes, etc.).
* Chaves, tokens ou secrets hardcoded ou expostos no bundle do frontend.
* Validação existente só no frontend (repita a validação direto na API e veja
  se ela aceita o que não deveria).
* Manipulação de parâmetros (IDs sequenciais previsíveis, troca de
  `cliente_id`/`titulo_id`/`acordo_id` na requisição).
* Upload e importação de arquivos: tipo de arquivo, tamanho, conteúdo
  malicioso, path traversal no nome do arquivo.
* Envio de payload malformado/incompleto para endpoints financeiros — o
  backend valida tipo, sinal, obrigatoriedade, ou confia no frontend?
* Rate limiting / proteção contra automação em endpoints sensíveis
  (login, criação de acordo, registro de pagamento).

---

## 5. Banco de dados

* Chaves primárias e estrangeiras adequadas; FKs realmente ausentes onde
  deveriam existir.
* Índices ausentes em colunas usadas para filtro/join frequente (ex:
  `cliente_id`, `status`, datas de vencimento) — e índices redundantes ou não
  usados.
* Constraints insuficientes para impedir estado inválido (ex: nada impede dois
  acordos `ativo` simultâneos sobre o mesmo título; nada impede movimento
  financeiro sem parcela associada).
* Duplicidade possível por falta de `UNIQUE`.
* Dados órfãos (parcela sem título/acordo pai, movimento sem parcela).
* Soft delete mal implementado: registros "excluídos" ainda aparecendo em
  contagens, somas ou joins que esqueceram o filtro.
* Campos que deveriam ser `NOT NULL` mas não são.
* Tipos de dado inadequados para dinheiro (float/double em vez de
  decimal/numeric — ver Seção 8).
* **Saldo armazenado como coluna decrementada** em vez de calculado por
  projeção sobre movimentos (ver Seção 0, item 2) — se existir, é candidato
  forte a BUG estrutural, não só melhoria.
* Tabela de movimentos financeiros permite `UPDATE`/`DELETE`? Deveria ser
  append-only.
* Se houver Supabase (ou equivalente): policies de RLS por tabela sensível,
  functions/RPCs que bypassam RLS usando `service_role` sem necessidade real,
  triggers que podem mascarar ou duplicar efeitos colaterais, views que
  vazam mais dado do que a tabela base permitiria.
* Queries potencialmente lentas hoje que ficam inviáveis com 10x/100x/1000x o
  volume atual (full scan sem índice, `SELECT *` em listagens, N+1 query).

---

## 6. Frontend e UX

Pergunte sempre: **"um usuário leigo entenderia o que está acontecendo aqui sem
conhecer a implementação?"**

* Informações ambíguas ou rótulos que não deixam claro o que representam
  (ex: "Valor" — original, negociado, pago, ou saldo?).
* Ações perigosas (cancelar acordo, excluir cliente, estornar pagamento) sem
  confirmação ou sem exigir motivo quando deveriam.
* Informações financeiras importantes escondidas ou difíceis de encontrar.
* Estados vazios, de erro e de loading mal tratados (tela em branco sem
  explicação, erro genérico sem dizer o que fazer).
* Feedback insuficiente depois de uma operação (usuário não sabe se o
  pagamento foi realmente registrado).
* Status difíceis de interpretar, ou o mesmo status representado com
  rótulos/cores diferentes em telas diferentes.
* Dados que parecem corretos visualmente mas podem estar errados (ex: soma na
  tela não bate com a soma real por arredondamento de exibição).
* Problemas de responsividade / telas pequenas.
* Fluxos com passos desnecessários para operações comuns (ex: registrar
  pagamento).

---

## 7. Performance

* Queries, joins, filtros, ordenação e paginação — testados mentalmente com
  volume atual e projetado (10x, 100x, 1000x).
* Carregamento inicial de telas com muitos dados agregados.
* Renderização de listas grandes sem virtualização.
* Componentes fazendo requisições repetidas/desnecessárias (polling
  excessivo, refetch em cada render).
* Importação de arquivos grandes: processamento síncrono bloqueante, memória.
* Limites de retorno da API sendo ultrapassados silenciosamente (paginação
  default do Supabase/ORM cortando resultado sem avisar).

---

## 8. Dados financeiros (área crítica)

* **Tipo de dado**: valores monetários usando `float`/`double` em vez de
  `Decimal`/`numeric` — tanto em Python quanto no banco. Isso é uma classe de
  bug real (erro de arredondamento acumulado, comparações `==` que falham).
* Conversão entre string (formato brasileiro `R$ 1.234,56`) e número: parsing
  que assume separador errado, perda de casas decimais.
* Regra de arredondamento usada (bancário/`ROUND_HALF_EVEN` vs
  `ROUND_HALF_UP`) e se é consistente em todos os cálculos.
* Soma de pagamentos, saldo restante, valor original, valor pago, valor em
  aberto — todos calculados pela **mesma** função/query em todas as telas, ou
  duplicados com lógica levemente diferente (ver Seção 0, item 4)?
* Pagamentos parciais, estornos, descontos, juros e multas — tratados de forma
  simétrica entre título e acordo (ver Seção 0, item 3)?
* Totais de dashboard batendo com a soma das linhas exibidas na listagem
  detalhada correspondente.
* Situações em que o mesmo valor pode ser calculado de formas diferentes
  dependendo da tela — procure ativamente por isso comparando o código de
  cada tela, não só o resultado visual.

---

## 9. Consistência entre telas

Para cliente, título, acordo, parcela, pagamento e responsável que aparecem em
mais de uma tela, verifique se:

* É o mesmo registro/fonte de dado, não uma cópia ou cache divergente.
* Os filtros seguem a mesma lógica (ex: "cliente ativo" significa a mesma
  coisa em todo lugar).
* Status e valores são idênticos entre telas para o mesmo registro no mesmo
  instante.
* As regras de cálculo (saldo, situação, dias de atraso) passam pela mesma
  função em todas as telas.
* As datas têm o mesmo significado em todo lugar (não confundir data de
  vencimento com data de referência do relatório, por exemplo).

Procure especificamente por casos do tipo "na tela A está correto, na tela B
está diferente" — este é historicamente um dos bugs mais comuns em sistemas de
cobrança com métricas calculadas em mais de um lugar.

---

## 10. Testes de fluxo completo

Simule fluxos ponta a ponta reais do sistema (adapte à nomenclatura real do
projeto), por exemplo:

1. Cliente é cadastrado/importado.
2. Título é criado e cliente é classificado/atribuído.
3. Cliente entra em atraso.
4. Acordo é proposto e ativado sobre um ou mais títulos.
5. Pagamento de parcela do acordo é registrado.
6. Status do acordo e a situação derivada do cliente são atualizados.
7. Essas mudanças aparecem corretamente em todas as telas relevantes
   (ficha do cliente, lista de títulos, lista de acordos, dashboard,
   relatórios).
8. Acordo é quebrado (ou renegociado) e o histórico do que já foi pago
   permanece íntegro.

Para cada etapa, verifique se o dado permanece consistente e se o histórico é
preservado.

---

## 11. Problemas que ainda não aconteceram

* O que quebra quando o volume de dados crescer 10x/100x/1000x?
* O que acontece com dois usuários operando o mesmo registro ao mesmo tempo
  (ex: dois operadores registrando pagamento na mesma parcela)? Existe locking
  ou controle otimista, ou o último `UPDATE` simplesmente vence?
* O que acontece se uma requisição falhar no meio de uma operação com múltiplas
  escritas (ex: criar acordo → gerar parcelas → vincular títulos)? Está numa
  transação de banco, ou pode parar pela metade em estado inconsistente?
* Duplo clique / reenvio de requisição gera pagamento/acordo duplicado?
  Existe alguma chave de idempotência?
* Queda de conexão no meio de uma importação — o arquivo fica parcialmente
  importado sem indicação clara disso?
* O que acontece se o banco retornar dados incompletos (join que não achou
  registro relacionado)?
* Um arquivo de importação parcialmente errado (algumas linhas válidas, outras
  não) é processado tudo ou nada, ou entra parcialmente sem avisar quais
  linhas falharam?
* Um usuário manipulando a API diretamente (fora da UI) consegue efeitos
  colaterais que a UI não permite?
* Que tipo de dado tende a ficar inconsistente depois de meses de uso real
  (ex: saldo calculado divergindo do saldo "congelado" em algum lugar,
  histórico de status incompleto)?

---

## 12. Não invente problemas — classifique com honestidade

* **BUG CONFIRMADO** — evidência clara no código/comportamento (cite
  arquivo e trecho/linha).
* **RISCO** — possibilidade real, mas não confirmável só pela análise
  estática; diga o que precisaria ser testado/verificado para confirmar.
* **MELHORIA** — não é erro, mas há oportunidade clara.
* **DÚVIDA** — falta informação (regra de negócio não documentada, por
  exemplo) para julgar se está correto.

Não classifique preferência pessoal de estilo como bug. Para cada problema
apontado, mostre a evidência e explique por que é problemático — não basta
dizer "isso está errado".

---

## 13. Severidade

* **CRÍTICO** — perda de dado, vazamento de dado, valor financeiro incorreto,
  comprometimento grave do sistema.
* **ALTO** — erro importante de negócio, acesso indevido, inconsistência
  significativa.
* **MÉDIO** — problema em cenários específicos, impacto limitado.
* **BAIXO** — problema pequeno, principalmente UX ou manutenção.
* **MELHORIA** — oportunidade, não problema.

---

## 14. Formato da resposta

1. **Resumo geral da saúde do projeto** (poucos parágrafos, direto ao ponto).
2. Por categoria — **Problemas críticos**, **Problemas de negócio**,
   **Problemas de segurança**, **Problemas de banco de dados**,
   **Problemas de frontend/UX**, **Problemas de performance**,
   **Problemas de consistência de dados**, **Melhorias recomendadas** — liste
   cada problema com:
   * Problema
   * Classificação (bug confirmado / risco / melhoria / dúvida)
   * Severidade
   * Evidência (arquivo, trecho de código ou comportamento observado)
   * Cenário em que acontece
   * Impacto
   * Causa provável
   * Como corrigir
   * Como testar a correção
3. **Tabela de priorização**:

   | Problema | Classificação | Severidade | Impacto | Esforço | Prioridade |
   |----------|---------------|------------|---------|---------|------------|

4. **Plano de ação em ordem de prioridade.**

---

## 15. Regra principal da auditoria

Seja desconfiado. Não presuma que o código está correto porque aparentemente
funciona — tente quebrá-lo. Procure inconsistências entre intenção, interface,
código, banco de dados e regras de negócio. Sempre que encontrar algo
suspeito, investigue mais a fundo antes de concluir, e sempre que encontrar um
padrão problemático (ex: assimetria entre entidades irmãs, cálculo duplicado
de uma mesma métrica), trate como sinal estrutural e procure onde mais ele se
repete — não como incidente isolado.

Se não houver evidência suficiente para confirmar um problema, diga
explicitamente que é hipótese e informe o que precisaria ser verificado.

O objetivo não é elogiar o projeto nem produzir uma lista enorme de sugestões
genéricas. O objetivo é descobrir problemas reais antes que os usuários os
descubram.