# Auditoria — Rodada 2: regra de negócio e estados impossíveis

> Executada em **2026-09-30** contra `main` (3838ee0) e o banco de produção
> `cuejrnqdudadlbuiouph`. Policies, grants, triggers e funções foram lidos **do
> banco**. Os achados de autorização foram **provados** numa transação desfeita
> (`BEGIN … ROLLBACK`), simulando um admin e um cobrador. Nada ficou gravado.
> Roteiro: [`Plano_Auditoria.md`](Plano_Auditoria.md), seção Rodada 2.

## Veredito

O que está sólido: os dados. Das 28 consultas de estado impossível, nenhuma achou
problema real. Não há acordo cumprido com parcela aberta, parcela paga com saldo,
saldo negativo, MV divergente do razão, movimento sem alvo ou de outra empresa,
vínculo de acordo com título de outro cliente, nem cliente duplicado por documento.
As RPCs financeiras validam papel e empresa, as Edge Functions com service role
validam o chamador, e ninguém consegue trocar a própria empresa.

O que preocupa são, de novo, as **portas laterais**, agora do lado das tabelas:
1. **Carteira do cobrador:** a RLS de `clientes` só olha a empresa. O cobrador lê o
   cadastro de todos os clientes e consegue **puxar todos para a própria carteira**.
   Com isso passa a ver todos os títulos.
2. **Admin por fora do razão:** o admin tem UPDATE direto em `parcelas`, `acordos` e
   `titulos` pelo PostgREST. Consegue criar dívida sem lançamento, ou cancelar
   acordo sem desfazer a novação. A tela nunca usa esse caminho: tudo passa por RPC.
3. **Status 'vencido' congelado:** a MV grava o status na hora do refresh, em UTC,
   e ninguém a atualiza enquanto não houver operação financeira.

---

## Status das correções

Corrigido em **2026-09-30**, no mesmo dia, em três migrations
(`20260930130000`, `140000` e `150000`), testadas em transação desfeita
(20 + 8 + 4 cenários) antes do `db push`.

| Item | Correção |
|---|---|
| 3 | `authenticated` perdeu INSERT/UPDATE/DELETE em `titulos`, `parcelas`, `acordos`, `parcelas_acordo`, `acordo_titulos` e `movimentos_financeiros`; as policies de escrita saíram. Dinheiro só por RPC. Os ataques P1 a P4 dão `permission denied`; o fluxo inteiro do admin pela tela continua funcionando. |
| 1 | Trigger `_proteger_carteira_cliente`: só admin troca `cobrador_id`/`vendedor_id`; cliente cadastrado por cobrador entra na carteira dele. Cobrador e vendedor só são cadastrados por admin. Na tela, os campos de carteira aparecem só para admin. |
| 2 | Decisão do gestor: "só enxergar o que for dele". Filtro de carteira em `clientes` (pelas colunas da própria linha; `cobrador_ve_cliente(id)` quebrava o INSERT … RETURNING), `comunicacoes`, `agendamentos`, `anexos`, `campanha_envios` e `campaign_logs`. `agendar_retorno`, `registrar_resultado_cobranca` e `criar_titulo_com_parcelas` checam a carteira por dentro. |
| 4 | Status calculado na leitura (`_vw_parcelas_status`, só service role; as views do app leem dela) com `hoje_br()`. **Vencimento em dia não útil vai para o próximo dia útil** (decisão do gestor): `proximo_dia_util` com o calendário bancário nacional calculado (`feriado_bancario_nacional`: feriados nacionais, Carnaval, Sexta-feira Santa, Corpus Christi e 31/12) e datas extras por empresa na tabela `feriados` (ainda sem tela). A tolerância de quebra do P8 conta do vencimento efetivo. O front usa o status do banco também para parcela de acordo. A coluna `status` da MV ficou como legado, com comentário. |
| 5 | Cobrador dispara campanha só para a própria carteira. A parte "financeiro barrado" **não era bug**: o papel saiu de circulação em 2026-08-03 e o CHECK impede atribuí-lo. |
| 6 | `erroCpfCnpj` em `src/utils/format.ts` (tamanho, dígito verificador, sequência repetida), com testes, no cadastro e na edição de cliente. No banco, CHECK de 11 ou 14 dígitos (`NOT VALID`: vale para linha nova ou editada). O importador e a API não conferem o dígito, para não travar a carga do ERP (3 dos 19 clientes atuais têm dígito errado). |
| 7 | `Math.floor` no serial do Excel. |

**Dúvidas:** 1 (fim de semana/feriado) → prorroga para o próximo dia útil, calendário
nacional por enquanto; 2 → cobrador só vê a carteira; 3 → mantido: a tela Usuários
cria administrador por desenho, e cobrador/vendedor entram por convite (definição de
2026-08-03).

**Sem ação:** o cliente com documento vazio continua gravado; a tela vai exigir um
documento válido na próxima edição.

## Achados

### 1. Cobrador altera cadastro e carteira de qualquer cliente da empresa

**BUG CONFIRMADO · ALTO**

- **Evidência:**
  - `clientes_update` exige só `company_id = current_company_id()` e
    `has_min_role('operador')`, sem `cobrador_ve_cliente`.
  - `authenticated` tem UPDATE em todas as colunas, inclusive `cobrador_id` e
    `vendedor_id`.
  - `cobradores_insert` e `cobradores_update` também exigem só operador, com
    UPDATE em `user_id` e `ativo`.
- **Prova (transação desfeita):** um cobrador com carteira de 2 clientes executou
  - `UPDATE clientes SET telefone = …` → 12 linhas fora da carteira alteradas;
  - `UPDATE clientes SET cobrador_id = <ele>` → **12 clientes alheios puxados para
    a própria carteira**. A partir daí ele vê os títulos e acordos de todos.
- **Impacto:**
  - A carteira deixa de ser fronteira de acesso.
  - Dá para esvaziar a carteira de um colega ou trocar o telefone de contato de
    qualquer cliente.
  - Por `cobradores_update`, dá para apontar o cadastro de outro cobrador para si.
- **Correção:**
  - `clientes_update`: `USING`/`WITH CHECK` com `cobrador_ve_cliente(id)`.
  - Trocar `cobrador_id`/`vendedor_id` só como admin: trigger que recusa, ou uma
    RPC de atribuição (resolve também a URL longa da atribuição em massa, anotada
    em PENDENCIAS "Volume").
  - `cobradores`/`vendedores`: escrita só para admin, que é quem cadastra pela tela.
- **Teste:** como cobrador, os dois UPDATE acima devem afetar 0 linhas; como
  admin, a atribuição continua funcionando.

### 2. Cobrador lê nome, CPF e telefone de todos os clientes da empresa

**BUG CONFIRMADO · ALTO**

- **Evidência:** `clientes_select` = `deleted_at IS NULL AND (is_super_admin() OR
  company_id = current_company_id())`. É a única tabela de dado de cliente sem
  `cobrador_ve_cliente`: `titulos`, `acordos` e `parcelas` têm o filtro.
- **Prova:** o mesmo cobrador (carteira = 2) viu **14 clientes, 11 com CPF** fora
  da carteira, enquanto via 6 títulos e 2 acordos (só os da carteira).
- **Impacto:** exposição de dado pessoal (LGPD) além da necessidade do cargo, e
  contradição com a regra de carteira aplicada no resto.
- **Correção:** acrescentar `cobrador_ve_cliente(id)` ao `clientes_select`. Antes,
  conferir se alguma tela do cobrador depende de ver cliente fora da carteira
  (ver Dúvida 2).
- **Teste:** como cobrador, `select count(*) from clientes` = tamanho da carteira.

### 3. Admin altera dinheiro sem passar pelo razão

**BUG CONFIRMADO · ALTO**

- **Evidência:**
  - Policies de UPDATE com admin em `parcelas`, `titulos`, `acordos` e
    `parcelas_acordo`, e de INSERT em `acordos`, `parcelas_acordo` e
    `acordo_titulos` (admin) e em `parcelas` (operador).
  - `authenticated` tem UPDATE em todas as colunas, inclusive `valor_nominal`,
    `valor_total`, `status`, `valor_acordo` e `cliente_id`.
  - Nenhum trigger barra. O front **não usa nenhum desses caminhos**: todas as
    escritas financeiras passam por RPC.
- **Prova (transação desfeita, como admin):**
  - P1: `UPDATE parcelas SET valor_nominal = valor_nominal + 5000` → saldo **0,00 →
    5.000,00**, com o razão intacto (2 lançamentos antes, 2 depois).
  - P2: `UPDATE acordos SET status = 'cancelado'` → acordo cancelado, títulos
    continuam "pago", 3 renegociações ativas. **A dívida some** dos dois lados.
    Esse é o bug do item 3 da Rodada 1, por outra porta.
  - P3: `UPDATE acordos SET status = 'ativo', valor_acordo = 1` num cancelado →
    aceito.
  - P4: `UPDATE titulos SET cliente_id = <outro>` → aceito.
- **Impacto:** o invariante "saldo é projeção do razão" só vale para quem usa a
  tela. O único rastro fica no `audit_log`.
- **Correção:**
  - Revogar INSERT/UPDATE de `authenticated` nas colunas financeiras e de
    vínculo. Grant por coluna: manter só as descritivas que a tela edita, se houver.
  - Tirar as policies de escrita correspondentes.
  - Toda mudança passa a ser por RPC, como já é na prática.
- **Teste:** P1 a P4 devem dar `permission denied`. Criar título, acordo, baixa,
  cancelamento e estorno pela tela continuam funcionando.

### 4. Status 'vencido' da parcela congela entre operações e vira o dia em UTC

**BUG CONFIRMADO · ALTO**

- **Evidência:**
  - `mv_parcelas_consolidadas` calcula `WHEN p.vencimento < CURRENT_DATE THEN
    'vencido'` na hora do REFRESH.
  - O banco está em UTC.
  - O refresh só roda dentro das RPCs financeiras e depois de algumas ações do
    front. Não há refresh agendado (o único job do cron é o de quebra de acordo).
  - Leem esse status: `vw_parcelas_consolidadas`, `vw_titulos_completos` (contagem
    de vencidas e status do título) e a api-v1 (status enviado ao ERP).
- **Cenários:**
  - Sexta sem baixa depois do meio-dia: as parcelas que vencem na sexta continuam
    'a vencer' no sábado e no domingo, até a primeira operação de segunda.
  - Uma baixa às 22h de Brasília refaz a MV já no "amanhã" UTC: as parcelas que
    vencem hoje aparecem **vencidas** antes da hora.
- **Hoje:** 0 divergências, porque houve lançamento hoje às 08:25. O problema
  aparece nos dias parados, que é justamente quando ninguém percebe.
- **Impacto:** inadimplência, filtro "vencido", Dashboard, Fila e o status mandado
  ao ERP ficam errados por dias. O cliente pode aparecer em dia estando vencido.
- **Correção (recomendada):** manter na MV só o que é caro (saldo e totais) e
  calcular o status na leitura, com `hoje_br()`, em `vw_parcelas_consolidadas`,
  `vw_titulos_completos` e na api-v1. A alternativa de agendar um refresh às
  00:05 de Brasília é mais barata, mas continua errada entre o refresh e a
  primeira operação quando a data vira às 21h em UTC.
  Junto: `vw_parcelas_acordo_consolidadas` também usa `CURRENT_DATE` (é view, então
  só erra entre 21h e meia-noite).
- **Teste:** com `now()` simulado para 22h de Brasília, a parcela que vence hoje
  continua 'a vencer'. Sem nenhuma operação, a parcela vencida ontem já aparece
  'vencido' hoje.

### 5. Campanha: financeiro não dispara, e cobrador dispara para a empresa inteira

**BUG CONFIRMADO · MÉDIO**

- **Evidência:** `supabase/functions/enviar-campanha/index.ts:41-42` aceita
  `operador`, `admin` e `super_admin` (lista fixa, sem `financeiro`, que está
  acima de operador). `destinatariosDaCampanha` lê todos os clientes da empresa
  com service role, sem olhar a carteira de quem dispara.
- **Impacto:** o financeiro é bloqueado sem motivo, e um cobrador manda mensagem
  a clientes fora da carteira (mesma fronteira dos itens 1 e 2).
- **Correção:** usar a hierarquia (`has_min_role` via RPC, ou `role_rank`) em vez da
  lista. Se o chamador for cobrador ou vendedor, filtrar os destinatários pela
  carteira.
- **Teste:** financeiro dispara; cobrador com carteira de 2 gera 2 envios.

### 6. CPF/CNPJ sem validação no banco

**BUG CONFIRMADO · BAIXO**

- **Evidência:**
  - `clientes` tem só `UNIQUE (company_id, cpf_cnpj)`, sem CHECK.
  - Não há validação de dígito verificador em lugar nenhum (front, importador ou
    banco). O importador exige 11 ou 14 dígitos; o cadastro direto não exige nada.
  - Existe **1 cliente com `cpf_cnpj = ''`** (criado em 2026-08-04).
- **Impacto:**
  - Documento inválido entra e não casa na reimportação.
  - O UNIQUE deixa só um cliente "sem documento" por empresa; o segundo dá um erro
    técnico.
- **Correção:**
  - Função de validação (DV de CPF e CNPJ) em `src/utils/format.ts`, com testes, e
    espelho em SQL.
  - CHECK de 11/14 dígitos no banco depois de corrigir o registro vazio.
  - Decidir se o DV também vira CHECK.
- **Teste:** `111.111.111-11` e `123` são recusados; um CPF válido entra.

### 7. Importador joga datas com hora da tarde para o dia seguinte

**BUG CONFIRMADO · BAIXO**

- **Evidência:** `src/pages/ImportarCSV.tsx:80` → `Math.round(v)` no serial do Excel.
  A célula `30/09/2026 18:00` (serial com fração 0,75) vira 01/10.
- **Correção:** `Math.floor(v)`, com teste.

---

## Dúvidas (regra de negócio)

1. **Vencimento em fim de semana ou feriado.** No Brasil, boleto que vence em dia
   não útil pode ser pago no próximo dia útil sem encargo. Hoje a parcela aparece
   vencida no sábado e, com o P8, os dias contam para a tolerância da quebra.
   O sistema deve prorrogar o vencimento efetivo para o próximo dia útil? Se sim,
   com qual calendário (nacional; estadual ou municipal por empresa?).
2. **Cobrador precisa ver cliente fora da carteira?** Por exemplo, para buscar um
   cliente que ligou e não é dele. Se não, o item 2 é correção direta. Se sim, a
   saída é mostrar só nome, sem CPF e telefone.
3. **`criar-usuario-empresa` cria sempre como `admin`.** É o fluxo pensado (o admin
   só cria outros admins; cobrador entra por convite)?

## Priorização

| # | Problema | Classificação | Severidade | Esforço | Prioridade |
|---|---|---|---|---|---|
| 3 | Admin altera dinheiro por fora do razão (PostgREST) | Bug | Alto | P (revogar grants e policies; o front não usa) | **1** |
| 1 | Cobrador altera cadastro e carteira de qualquer cliente | Bug | Alto | P/M (policy + trigger/RPC de atribuição) | **1** |
| 2 | Cobrador lê todos os clientes | Bug | Alto | P (+ Dúvida 2) | **1** |
| 4 | Status 'vencido' congelado e em UTC | Bug | Alto | M (status na leitura, 2 views + api-v1) | **2** |
| 5 | Campanha: financeiro barrado, cobrador sem carteira | Bug | Médio | P | 3 |
| 6 | CPF/CNPJ sem validação no banco | Bug | Baixo | P | 4 |
| 7 | Serial do Excel arredondado para cima | Bug | Baixo | P | 4 |

## Dados antigos (sem ação necessária)

- **18 renegociações** marcadas como estornadas sem apontar para o registro de
  estorno (agosto a 09/09, antes da correção de 29/09). O saldo está certo; só a
  trilha ficou incompleta. O `cancelar_acordo` atual liga os dois lados.
- **17 parcelas de acordo** com a coluna `status` parada em 'pendente'. O job do P8
  as marca hoje à 00:10.
- **2 títulos** com 1 centavo de diferença entre as parcelas e o valor original
  (já registrado na Rodada 1).

## Verificações que passaram

- 28 consultas de estado impossível: todas zeradas, depois de corrigidas 3
  consultas minhas que não excluíam movimento estornado. Nada inventado.
- Acordo cumprido ↔ parcelas pagas, e a coluna `paga` ↔ saldo do razão: coerentes.
- MV = razão em todas as parcelas; nenhum saldo negativo em título ou acordo.
- Movimento sempre com um único alvo e da mesma empresa; nenhum estorno órfão.
- Nenhum título ou acordo ativo de cliente excluído; nenhum agendamento pendente de
  cliente excluído.
- Nenhum cliente com cobrador ou vendedor de outra empresa; nenhum duplicado por
  documento; nenhum documento gravado com máscara.
- Todas as RPCs expostas validam papel (`has_min_role`) e empresa. As sem papel são
  helpers de RLS, `hoje_br` ou verificam `is_super_admin`.
- Usuário não troca a própria empresa: `profiles` só aceita UPDATE em `email` e
  `nome`; INSERT bloqueado na prática (perfil criado no cadastro, `user_id` único).
- `user_roles`: admin não concede `super_admin`; trigger impede remover o último
  admin da empresa.
- Autocadastro: empresa nova nasce 'pendente' (só funciona depois de ativada pelo
  super admin); confirmação de e-mail ligada.
- Edge Functions com service role (`criar-usuario-empresa`,
  `excluir-usuario-empresa`, `criar-chave-api`, `excluir-cadastro-incompleto`)
  validam papel e empresa do chamador antes de agir.
- `vendedor` e `leitura` não escrevem: todas as policies de escrita e RPCs exigem
  operador ou mais.
- Front: filtros de data comparam 'YYYY-MM-DD' com 'YYYY-MM-DD' (sem erro de um
  dia); "próximo retorno" usa meio-dia local; nenhuma RPC usa `CURRENT_DATE`;
  `criar_acordo` grava a data com `hoje_br()`.
- Importador: normaliza o documento, exige 11 ou 14 dígitos, lê o xlsx como serial
  em UTC.
