# Auditoria — Rodada 1: dinheiro, concorrência e idempotência

> Executada em **2026-09-29** contra o código em `main` (55b2c4b) e o banco de
> produção `cuejrnqdudadlbuiouph`. Todas as funções, triggers, policies e
> grants foram lidos **do banco** (`pg_get_functiondef`, `pg_policies`,
> `proacl`), não das migrations. As consultas de diagnóstico foram só de leitura.
> Roteiro: [`Plano_Auditoria.md`](Plano_Auditoria.md).

## Veredito

O que está sólido: o razão é de fato o centro do dinheiro. `movimentos_financeiros`
não aceita escrita direta pela API (sem policy de INSERT/UPDATE), o saldo é
projeção nos dois lados, estorno de estorno é recusado, e cada operação
multi-etapa (criar acordo, baixar parcela, cancelar título, excluir cliente,
importar um título) roda dentro de uma única função PL/pgSQL, portanto é
atômica. Nos dados de hoje, os invariantes principais se mantêm: nenhum saldo
negativo, nenhum título com dois acordos ativos, nenhum pagamento duplicado,
nenhuma renegociação órfã.

O que preocupa são as **portas laterais**, não o caminho principal. Duas funções
internas ficaram executáveis por quem não deveria: uma **sem login** grava
título e pagamento em qualquer empresa; outra permite que qualquer usuário logado
**zere a dívida** de um título. É a mesma causa estrutural já registrada em
2026-08-26: função nova em `public` nasce com EXECUTE para `anon` e
`authenticated`, e `REVOKE ... FROM PUBLIC` não remove isso. Fora da segurança,
o risco maior está em regras que valem num fluxo e não em outro: o cancelamento de
acordo ignora o que o cliente já pagou, e o reenvio pela API/planilha passa por
cima das travas que a tela respeita. Nenhuma RPC financeira trava a linha que está
alterando.

---

## Status das correções

Todos os 18 achados foram corrigidos em **2026-09-29**, em três migrations e nas
telas correspondentes. A Dúvida 1 foi resolvida parcialmente, e a 2 ficou
decidida (ver abaixo).

| Item | Correção |
|---|---|
| 1, 2, 17 | `20260929120000`: `anon` não executa nenhuma função do `public`; `authenticated` executa só as RPCs do app e os helpers de RLS. Advisor: 35 → 0 (anon). |
| — | `20260929130000`: fechado o default **global** de funções (o default por schema da migration anterior não tirava o `PUBLIC`: função nova ainda nascia aberta, e a conferência embutida pegou). `20260929140000`: `anon` sem acesso a nenhuma tabela, view ou sequence, e o default também fechado. |
| 3 | `cancelar_acordo(acordo, motivo)`: só cancela acordo `ativo` ou `quebrado`, com motivo obrigatório. Desfaz a novação com um estorno registrado por liquidação e **credita no título o que foi pago no acordo** (tipo `credito_acordo`, da parcela mais antiga para a mais nova). Os pagamentos continuam em `vw_recebimentos`. Tela: botão só para ativo/quebrado; o diálogo pede motivo e explica o crédito. |
| 4 | Reenvio pela API/planilha: título com histórico não tem parcela reescrita (divergência → 422 dizendo qual parcela); `pago` quita só o saldo restante, e não lança em título em acordo nem em parcela com baixa estornada. Esses casos voltam em `avisos`. `valor_original` só acompanha as parcelas enquanto o título não tem histórico. |
| 5 | Nº do título obrigatório no banco e na validação da planilha. A função antiga `importar_titulo`, que não tinha número, foi removida. |
| 6 | `parseValorPlanilha` em `src/utils/format.ts`, com testes ("1.500" → 1500). |
| 7, 18 | Toda RPC financeira trava o título (ou o acordo e a parcela) antes de ler o saldo, e lê o saldo direto do razão, não da MV. `criar_acordo` trava os títulos em ordem de id. `estornar_movimento` trava o lançamento. |
| 8 | Trigger não mexe em acordo cancelado e só grava quando o status muda; baixa e estorno recusam acordo cancelado; `marcar_parcelas_acordo_vencidas` filtra acordos vigentes e usa a data de Brasília. O P8 agora pode ser ligado com segurança. |
| 9 | Cronograma e título manual: parcelas em centavos, com o resíduo na última; o banco confere que a soma bate com o valor do acordo. |
| 10 | Métricas leem `vw_parcelas_acordo_tenant` (`saldo_atual` do razão) em vez de `valor_total`. |
| 11 | `vw_recebimentos.titulo_ids`: o recebimento de acordo liga-se a todos os títulos do acordo; o recorte usa qualquer um deles. |
| 12 | `hoje_br()` no default de `data_evento` e nas RPCs; a baixa de título aceita a data do pagamento (não pode ser futura). |
| 13 | `src/constants/meiosPagamento.ts`, fonte única, espelho do CHECK. |
| 14 | Desconto de título com motivo obrigatório e teto registrado em `metadata` (exceção, não bloqueio, como no acordo). Desconto e encargo recusam título em acordo. O histórico do título lista e estorna desconto e encargo. |
| 15 | `criar_acordo` valida empresa, cliente, duplicidade, saldo em aberto, a soma do cronograma e se o saldo mudou desde a tela. |
| 16 | Autoria sempre `auth.uid()`; `p_created_by` removido das RPCs de baixa, desconto e encargo. |
| — | **Bug achado durante a correção:** o modal de encargo mandava `'juros'`/`'multa'` e a RPC exigia `'juros_aplicado'`/`'multa_aplicada'`: nenhum encargo de título funcionava. Corrigido. |

**Decisões tomadas junto:**
- **Quebra (Dúvida 2):** o acordo quebrado continua travando o título; para renegociar, cancela-se o quebrado (a dívida volta abatida do que foi pago) e cria-se um acordo novo.
- **Exclusão (Dúvida 1, parcial):** acordo com pagamento ou outro lançamento financeiro não é mais excluído definitivamente. A exclusão definitiva de **título** com pagamento continua como estava (decisão de 2026-08-03).

**Verificação:** as migrations foram ensaiadas em `BEGIN … ROLLBACK` e depois
submetidas a 21 cenários com um admin simulado: centavos, baixa parcial, data
futura, desconto sem motivo, acordo com saldo desatualizado, soma errada,
novação, baixa em título renegociado, cancelamento com crédito, pagamento e
estorno em acordo cancelado, trigger após o P8, exclusão com dinheiro, reenvio
idêntico, reenvio divergente e reenvio após estorno. Tudo passou, sem deixar
dado gravado. O teste achou um bug na própria correção: um `f() OR v` que o
planner pode dobrar sem chamar a função; corrigido antes de aplicar. Front:
`tsc` limpo, 129 testes, build OK.

**Dados antigos não reescritos:** os 4 acordos com diferença de centavos e as 17
parcelas de acordo com a coluna `status` parada continuam como estavam. São
histórico de teste gravado antes da correção.

## Achados

### 1. Função interna de importação é executável sem login

**BUG CONFIRMADO · CRÍTICO**

- **Evidência:** `proacl` de `_importar_titulo_completo` =
  `{postgres=X, anon=X, service_role=X}`. A função recebe `p_company` e
  `p_actor` por parâmetro e **não checa papel nenhum** (é o motor da API v1,
  feito para ser chamado com service role). A migration
  `20260819130000_ingestao_para_chamada_de_maquina.sql:179-181` revogou de
  `PUBLIC` e de `authenticated`, mas não de `anon`.
- **Cenário:** qualquer pessoa com a chave pública (que está no bundle do front)
  chama `POST /rest/v1/rpc/_importar_titulo_completo` informando o UUID de uma
  empresa. Com isso ela cria cliente, título e parcelas; lança `pagamento_total`
  (`pago: true`); e, informando um `numero_documento` existente, **sobrescreve o
  valor e o vencimento** das parcelas de um título real.
- **Impacto:** escrita no razão financeiro sem autenticação. A barreira que
  resta é conhecer o UUID da empresa. Ele vai no JWT de todo usuário da empresa,
  então não é segredo.
- **Não verificado ao vivo:** a chamada de prova com a chave pública (que
  falharia na validação, antes de gravar) foi bloqueada pela permissão desta
  sessão. A evidência é o ACL.
- **Correção:** `REVOKE EXECUTE ON FUNCTION public._importar_titulo_completo(...) FROM anon;`
  e conferir depois de aplicar.
- **Teste:** `has_function_privilege('anon', '_importar_titulo_completo(uuid,uuid,text,text,text,jsonb,text,text,text,text,text,text,text)', 'EXECUTE')`
  deve ser `false`. Um POST com a chave pública deve dar 404 ou erro de
  permissão. A API v1 (service role) deve continuar funcionando.

### 2. Qualquer usuário logado zera a dívida de um título

**BUG CONFIRMADO · CRÍTICO**

- **Evidência:** `liquidar_parcelas_titulo(p_titulo_id, p_acordo_id, p_motivo)`
  é `SECURITY DEFINER`, **sem checagem de papel**, e o `proacl` tem
  `authenticated=X`. Para cada parcela com saldo, ela lança `renegociacao` com
  efeito −1. A migration `20260803130000_integridade_acordos.sql:308` revogou só
  de `PUBLIC, anon`.
- **Cenário:** um vendedor (que deveria ser só leitura) ou um cobrador chama
  `supabase.rpc('liquidar_parcelas_titulo', {p_titulo_id, p_acordo_id: null, p_motivo: 'x'})`.
  O título some da inadimplência sem acordo e sem pagamento. O alcance fica
  limitado à empresa e à carteira do usuário, porque a função lê
  `vw_parcelas_consolidadas`.
- **Impacto:** perda de controle sobre a dívida. O lançamento aparece como
  "renegociação", sem acordo correspondente. Um admin consegue estornar, mas
  precisa primeiro perceber.
- **Correção:** `REVOKE EXECUTE ... FROM authenticated`. Só `criar_acordo`
  (definer) chama essa função.
- **Teste:** `rpc('liquidar_parcelas_titulo')` como operador deve dar
  `permission denied`. `criar_acordo` deve continuar liquidando.

> **Causa raiz comum aos itens 1 e 2:** o padrão de REVOKE da casa está
> incompleto. Proponho uma migration que revogue EXECUTE de `anon` e
> `authenticated` em **toda** função interna, seguida de uma consulta fixa no
> checklist de migration. Outras funções sem checagem de papel ainda abertas:
> `marcar_parcelas_acordo_vencidas` (authenticated, ver item 8),
> `refresh_mv_parcelas` (anon, ver item 17), `cliente_tem_titulo_em_aberto`
> (anon) e `find_or_create_cobrador/vendedor` (qualquer papel da empresa cria
> cobrador/vendedor).

### 3. Cancelar acordo ignora o que o cliente já pagou

**BUG CONFIRMADO · CRÍTICO**

- **Evidência:**
  - `cancelar_acordo` não olha o status: cancela acordo `cumprido` e `quebrado`.
    Também não olha pagamentos: estorna todas as `renegociacao`, e a dívida do
    título volta pelo valor inteiro liquidado na novação.
  - `vw_recebimentos` filtra `a.status <> 'cancelado'`, então os pagamentos
    feitos no acordo **somem do "recuperado"**.
  - Na UI, `src/pages/Acordos.tsx:853` mostra "Cancelar" para qualquer
    `status !== 'cancelado'`.
  - O diálogo (`Acordos.tsx:580-582`) só diz que "os títulos voltarão a ficar
    disponíveis". Não avisa sobre valores pagos e não pede motivo.
- **Cenário:** acordo de R$ 10.000 em 5x, com 4 parcelas pagas. O admin
  cancela. O título volta a dever R$ 10.000 e os R$ 8.000 recebidos deixam de
  aparecer no Dashboard e nos Relatórios. Com um acordo **cumprido**, o cliente
  que quitou tudo volta a dever tudo.
- **Impacto:** cobrança indevida de quem pagou, e recebimento real apagado dos
  números. Hoje existem 0 acordos cancelados em produção, então ainda não há dano.
- **Correção:**
  - No servidor, aceitar cancelamento só de acordo `ativo` ou `quebrado`.
  - Se houver pagamento válido, bloquear, ou tratar como **quebra**: a dívida
    residual do título é o que foi liquidado menos o que foi pago.
  - Exigir motivo.
  - A regra de quebra com pagamento parcial é decisão de negócio (ver Dúvidas).
- **Teste:** cancelar um acordo `cumprido` deve ser recusado. Cancelar um acordo
  com pagamento deve ser recusado (ou o título deve voltar só pelo residual), e
  o recebido deve continuar no Dashboard.

### 4. Reenvio pela API ou pela planilha reescreve o histórico e lança pagamento indevido

**BUG CONFIRMADO · ALTO**

- **Evidência:** `_importar_titulo_completo`, que é o mesmo motor da planilha e
  da API v1:
  - `ON CONFLICT (titulo_id, numero_parcela) DO UPDATE SET valor_nominal, vencimento`
    sobrescreve fato histórico, e depois `UPDATE titulos SET valor_original`.
  - `pago: true` lança `pagamento_total` sempre que não existe pagamento
    **não estornado**. Isso vale mesmo para parcela liquidada por renegociação
    ou já quitada por desconto.
  - Essa rota não tem a trava "título renegociado" que o
    `registrar_pagamento_parcela` tem.
  - A API documenta o reenvio como forma normal de sincronizar
    (`api-v1/index.ts:93-94`), então o ERP vai reenviar todo dia.
- **Cenários:**
  - (a) O título está em acordo e o ERP marca a parcela como paga (o cliente
    pagou o acordo). Entra um pagamento na parcela já liquidada: o saldo fica
    negativo e o dinheiro é contado duas vezes, no título e no acordo.
  - (b) O admin estorna uma baixa errada e o ERP reenvia `pago`. A baixa volta
    sozinha.
  - (c) O ERP corrige o valor de uma parcela de um título em acordo. O saldo
    reaparece no título liquidado, e a dívida conta em dobro.
- **Correção:** se o título já existe:
  - Não sobrescrever parcela que tenha movimento; devolver 422 listando a
    divergência.
  - Só aceitar `pago` quando o saldo for > 0 e não houver acordo ativo.
  - Não relançar pagamento em parcela que já teve estorno.
- **Teste:** reenviar o mesmo JSON 2 vezes não deve mudar nada no razão.
  Reenviar `pago` em título com acordo deve dar 422. Reenviar depois de um
  estorno não deve relançar a baixa.

### 5. Planilha sem Nº do título duplica a dívida a cada reimportação

**BUG CONFIRMADO · ALTO**

- **Evidência:** com `v_doc` NULL, o `_importar_titulo_completo` sempre faz
  `INSERT` de um título novo. No front, `ImportarCSV.tsx:183` agrupa por linha
  quando não há documento, e o modelo de planilha trata a coluna
  `numero_documento` como opcional. A API já a exige; a planilha não.
- **Cenário:** o usuário importa a mesma planilha duas vezes (ou reimporta
  depois de corrigir um erro). Cada cliente passa a dever o dobro.
- **Correção:** exigir `numero_documento` na planilha, como a API faz.
- **Teste:** importar um arquivo sem a coluna deve ser recusado na pré-validação.

### 6. Importador lê "1.500" como R$ 1,50

**BUG CONFIRMADO · ALTO**

- **Evidência:** `ImportarCSV.tsx:104-106`. Só com ponto e sem vírgula, a
  função faz `parseFloat("1.500")` = 1,5. `"R$ 1.234.567"` vira 1,234. O
  problema atinge CSV e células de texto; célula numérica do xlsx está correta.
- **Impacto:** a dívida entra mil vezes menor, sem nenhum aviso (a validação
  só exige valor > 0).
- **Correção:** tratar o ponto como milhar quando os grupos depois dele têm 3
  dígitos. Mover o parser para `src/utils/format.ts` com testes.
- **Teste:** `"1.500"→1500`, `"1.500,50"→1500.5`, `"1500,5"→1500.5`,
  `"1.234.567"→1234567`, `"12.5"→12.5`.

### 7. Nenhuma RPC financeira trava a linha: corrida gera pagamento em dobro e saldo negativo

**RISCO · ALTO**

- **Evidência:** `registrar_pagamento_parcela`, `pagar_parcela_acordo` e
  `criar_acordo` leem o saldo sem `FOR UPDATE`. No título, a leitura vem ainda
  da MV, que reflete só o que já foi confirmado antes. O trigger
  `check_titulo_acordo_unico` também lê só dado confirmado.
- **Cenários:**
  - Dois operadores dão baixa integral na mesma parcela ao mesmo tempo: os dois
    passam, pago 2x.
  - Um acordo é criado enquanto uma baixa entra no título: a liquidação usa o
    saldo antigo, e o saldo fica negativo.
  - Dois acordos simultâneos sobre o mesmo título: dois acordos ativos.
- **Idempotência:** botão desabilitado e mutation sem retry cobrem o duplo
  clique comum. No lado do servidor, a 2ª chamada só é recusada quando zera o
  saldo (baixa total) ou pelo trigger (acordo). **Uma baixa parcial repetida
  passa** e não existe chave de idempotência.
- **Não reproduzido:** análise estática. Nos dados de hoje há 0 ocorrências.
- **Correção:**
  - Travar a(s) parcela(s) (`SELECT ... FOR UPDATE`) antes de calcular o saldo.
  - Em `criar_acordo`, travar os títulos em ordem de id.
  - Calcular o saldo direto do razão depois da trava, e não pela MV.
  - Opcional: `p_chave_idempotencia` com UNIQUE no movimento.
- **Teste:** duas sessões `psql` com `BEGIN`, chamando a RPC na mesma parcela.
  A segunda deve esperar e depois ser recusada.

### 8. Acordo cancelado pode voltar a "ativo"; ligar o P8 do jeito que está reativa todos

**BUG CONFIRMADO · ALTO**

- **Evidência:**
  - O trigger `update_acordo_status` tem `ELSE ... SET status = 'ativo'` sem
    olhar o status atual, e dispara em **qualquer** UPDATE de
    `parcelas_acordo.status`.
  - `pagar_parcela_acordo` e `estornar_movimento` não recusam acordo cancelado.
    Só a UI esconde os botões (`Acordos.tsx:430-431`).
  - `marcar_parcelas_acordo_vencidas` atualiza parcelas de **todas as
    empresas**, sem filtro de status do acordo, e é executável por qualquer
    usuário logado.
- **Cenário:** alguém chama a função (ou o P8 é ligado ao app). Todo acordo
  cancelado com parcela vencida vira `quebrado`. Uma baixa ou estorno por RPC
  num acordo cancelado o devolve a `ativo`, com a renegociação do título já
  estornada: a dívida fica em dobro.
- **Dado relacionado (o P8 hoje):** 17 parcelas de acordo estão como
  `pendente` na coluna e `vencida` no razão. Por isso nenhum acordo vira
  `quebrado`.
- **Correção:**
  - O trigger não deve tocar acordo `cancelado`.
  - As RPCs de baixa e estorno devem recusar acordo cancelado.
  - `marcar_parcelas_acordo_vencidas` deve filtrar por acordo ativo, perder o
    grant de `authenticated` e rodar via pg_cron.
- **Teste:** baixa por RPC em acordo cancelado deve ser recusada, e rodar a
  função não deve alterar nenhum acordo cancelado.

### 9. Centavos: a soma das parcelas não bate com o valor combinado

**BUG CONFIRMADO · MÉDIO**

- **Evidência:**
  - `src/domain/acordos/cronograma.ts` manda `valorAcordo / parcelas` sem
    arredondar. O banco (`numeric(10,2)`) arredonda cada parcela na gravação, e
    `valor_acordo` recebe a soma sem arredondar.
  - Em `criar_titulo_com_parcelas`, `ROUND(valor/n, 2)` é aplicado a todas as
    parcelas, sem jogar o resíduo em nenhuma.
- **Dados:** **4 de 14 acordos** divergem. Por exemplo, 228.502,93 combinado
  contra 228.502,95 cobrado, e 8.000,10 contra 8.000,08. Dois títulos têm
  parcelas somando 1 centavo a menos que o valor original (11877 e 12112).
- **Correção:** arredondar cada parcela a 2 casas e jogar o resíduo na última,
  tanto no domínio quanto na RPC. Gravar `valor_acordo` como a soma das parcelas
  arredondadas.
- **Teste:** `gerarCronograma({valorAcordo: 100, parcelas: 3})` deve dar
  33,33 + 33,33 + 33,34, e a soma deve ser exatamente 100.

### 10. Dashboard mede a dívida de acordo pelo previsto, não pelo razão

**BUG CONFIRMADO · MÉDIO**

- **Evidência:** `src/domain/metricas/calculo.ts:642-644`
  (`saldoAcordosEmAberto`) e `:172` (`itensVencidosDeAcordos`) usam
  `valor_total` da parcela. A fonte é a tabela `parcelas_acordo`, não
  `vw_parcelas_acordo_tenant`.
- **Cenário:** um cliente paga R$ 500 de uma parcela de R$ 1.000. O Dashboard
  mostra R$ 1.000 em aberto/vencido **e** R$ 500 recuperados, então a taxa de
  recuperação fica distorcida. Encargos e descontos também ficam de fora.
- **Hoje:** 0 parcelas de acordo com pagamento parcial, logo 0 divergência. É
  latente.
- **Correção:** ler `saldo_atual` da view, como já se faz para o título.
- **Teste:** adicionar ao `calculo.test.ts` um caso de parcela de acordo com
  pagamento parcial.

### 11. Recebimento de acordo multi-título é atribuído só ao 1º título

**BUG CONFIRMADO · MÉDIO**

- **Evidência:** `vw_recebimentos` usa `COALESCE(pt.titulo_id, a.titulo_id)`,
  ou seja, a coluna singular do acordo. É uma regressão do item "título ↔ acordo
  é N:N" da seção 0.A, e está ligada ao P6.
- **Dados:** 10 acordos multi-título, com 29 pagamentos atribuídos a um único
  título.
- **Impacto:** `restringirAoUniverso` e `recortarPorVencimento` filtram
  recebimento por título. Se o 1º título sai do recorte de período, o dinheiro
  do acordo inteiro some daquele relatório.
- **Correção:** atribuir o recebimento ao acordo (e ao cliente), e não a um
  título. Nas métricas, cruzar pelo acordo.

### 12. Data da baixa em UTC

**BUG CONFIRMADO · MÉDIO**

- **Evidência:** `movimentos_financeiros.data_evento DEFAULT CURRENT_DATE`, com
  o banco em `TimeZone=UTC`. `registrar_pagamento_parcela` (título) nem aceita
  data. Os estornos também usam `CURRENT_DATE`.
- **Dados:** 1 de 59 pagamentos/estornos já está com data um dia à frente da
  data no Brasil.
- **Impacto:** baixa feita depois das 21h cai no dia seguinte, e no último dia
  do mês cai no **mês seguinte** do "recuperado no mês".
- **Correção:** usar `(now() AT TIME ZONE 'America/Sao_Paulo')::date` (ou fixar
  o timezone do banco) e aceitar `p_data_pagamento` também no título, como o
  acordo já aceita.
- **Anotado para a Rodada 2:** o status `vencido` da MV também usa
  `CURRENT_DATE` UTC.

### 13. Modal de baixa de título oferece meios que o banco recusa

**BUG CONFIRMADO · MÉDIO**

- **Evidência:** `RegistrarPagamentoModal.tsx:36-40` oferece `cartao_credito`,
  `cartao_debito` e `cheque`. O CHECK `eventos_parcela_meio_pagamento_check` só
  aceita `pix, dinheiro, boleto, transferencia, cartao, outro`.
- **Impacto:** 3 das 7 opções dão um erro técnico de constraint. O operador
  escolhe outro meio e o registro fica com o meio errado.
- **Correção:** uma constante única de meios de pagamento, usada pelos dois
  modais. O do acordo já está certo.

### 14. Desconto e encargo: regra do acordo não vale no título

**BUG CONFIRMADO · MÉDIO**

- **Evidência:**
  - `conceder_desconto_parcela` ignora `p_motivo`, não tem teto e aceita zerar
    a parcela. `pagar_parcela_acordo` exige motivo, teto e antecipação, e recusa
    zerar.
  - O estorno de desconto/encargo de título **não existe na UI**:
    `usePagamentosByParcelas` filtra só pagamentos (`titulos.ts:100`). No
    acordo, dá para estornar qualquer lançamento.
  - `aplicar_encargo_parcela` não tem a trava de acordo ativo: juros numa
    parcela liquidada fazem o saldo reaparecer no título renegociado.
- **Correção:** trazer para o título as mesmas regras (motivo, teto,
  trava de acordo) e listar todos os lançamentos no histórico de estorno.

### 15. `criar_acordo` confia no payload

**RISCO · MÉDIO**

- **Evidência:** a função não valida:
  - que os títulos são da empresa do usuário;
  - que pertencem a `p_cliente_id`;
  - que estão em aberto;
  - que `p_valor_acordo` bate com a soma do cronograma.
- **Cenário:** um admin da empresa A informa o UUID de um título da empresa B.
  Não há liquidação, porque a view filtra por empresa, mas o vínculo é criado,
  e B passa a ter o título **travado**: baixa, cancelamento e novo acordo são
  recusados. É preciso conhecer o UUID.
- **Dados:** 0 vínculos entre empresas e 0 com cliente divergente.
- **Correção:** validar tudo isso no início da RPC.

### 16. Autoria da baixa pode ser forjada

**BUG CONFIRMADO · BAIXO**

`registrar_pagamento_parcela`, `conceder_desconto_parcela` e
`aplicar_encargo_parcela` aceitam `p_created_by` do chamador. Um operador pode
registrar a baixa em nome de outro usuário. Correção: sempre usar `auth.uid()`.

### 17. `refresh_mv_parcelas` executável sem login

**BUG CONFIRMADO · BAIXO (hoje)**

Qualquer pessoa pode disparar o REFRESH da MV inteira. Hoje é barato, mas o
custo cresce com a base (Rodada 3). Correção: revogar de `anon`.

### 18. Estorno concorrente do mesmo lançamento

**RISCO · BAIXO**

Sem `FOR UPDATE`, duas chamadas simultâneas criam dois registros de estorno.
Como o efeito é 0, o saldo não é afetado; só o histórico fica duplicado.

---

## Dúvidas (regra de negócio)

1. **Exclusão definitiva apaga pagamentos.** `movimentos_financeiros` tem
   `ON DELETE CASCADE` para parcela e parcela de acordo. A decisão de
   2026-08-03 deu ao **admin** a exclusão definitiva de título e de acordo
   cancelado, e em 19–20/08 foram apagados 8 movimentos assim, 4 deles
   pagamentos. Isso contraria o invariante "nada de dado financeiro é apagado".
   É aceitável perder o registro de dinheiro recebido?
2. **O que vale quando o acordo quebra?** A quebra depende do item 8, e a
   pergunta é quanto o cliente passa a dever: as parcelas do acordo em aberto,
   ou o título original menos o que foi pago? Isso define a correção do item 3.

## Priorização

| # | Problema | Classificação | Severidade | Esforço | Prioridade |
|---|---|---|---|---|---|
| 1 | `_importar_titulo_completo` executável sem login | Bug | Crítico | P (1 migration) | **Agora** |
| 2 | `liquidar_parcelas_titulo` aberto a qualquer usuário logado | Bug | Crítico | P (mesma migration) | **Agora** |
| 3 | Cancelar acordo ignora o que foi pago | Bug | Crítico | M (+ decisão) | 1 |
| 8 | Acordo cancelado reativado / P8 perigoso | Bug | Alto | P | 1 (antes do P8) |
| 4 | Reenvio da API reescreve e duplica pagamento | Bug | Alto | M | 2 |
| 6 | "1.500" lido como 1,50 | Bug | Alto | P | 2 |
| 5 | Planilha sem Nº duplica dívida | Bug | Alto | P | 2 |
| 7 | Sem trava de linha nas RPCs financeiras | Risco | Alto | M | 3 |
| 13 | Meios de pagamento recusados pelo banco | Bug | Médio | P | 3 |
| 9 | Centavos no cronograma e no título | Bug | Médio | P | 4 |
| 12 | Data da baixa em UTC | Bug | Médio | P | 4 |
| 10 | Dashboard usa o previsto do acordo | Bug | Médio | P | 4 |
| 11 | Recebimento multi-título no 1º título | Bug | Médio | M (liga ao P6) | 5 |
| 14 | Regra de desconto/encargo só no acordo | Bug | Médio | M | 5 |
| 15 | `criar_acordo` sem validação de payload | Risco | Médio | P | 5 |
| 16 | `p_created_by` forjável | Bug | Baixo | P | 6 |
| 17 | `refresh_mv_parcelas` para `anon` | Bug | Baixo | P | junto do 1 |
| 18 | Estorno concorrente duplicado | Risco | Baixo | P | junto do 7 |

## Verificações que passaram

- O razão não aceita escrita direta: `movimentos_financeiros` não tem policy de INSERT/UPDATE; os CHECKs `valor > 0` e alvo exclusivo estão ativos.
- As operações multi-etapa são uma função PL/pgSQL cada, portanto atômicas: `criar_acordo`, `registrar_pagamento_parcela`, `pagar_parcela_acordo`, `cancelar_titulo`, `excluir_cliente` e a importação por título.
- A importação do arquivo não é atômica no todo, mas cada título é, e os erros são listados por título.
- Mutations do TanStack sem retry (padrão); botões de baixa e de acordo ficam desabilitados durante a chamada.
- A escolha da parcela é explícita: botão por parcela; não existe "baixa no título".
- Pagamento direto em título com acordo ativo é bloqueado em `registrar_pagamento_parcela`.
- Estorno de estorno é recusado; estorno com efeito 0 está correto nos dois lados.
- `prevent_hard_delete_financial` cobre `titulos`, `parcelas`, `movimentos_financeiros`, `acordos` e `parcelas_acordo`.
- `db advisors`: a mesma dívida aceita em 2026-08-26 (6 ERROR definer_view, 35 + 52 WARN); nenhuma regressão de view.
- Produção: 0 saldos negativos, 0 títulos com 2 acordos ativos, 0 pagamentos duplicados (os 2 "gêmeos" são estorno + relançamento), 0 renegociações órfãs, 0 vínculos entre empresas.
- Front: nenhuma comparação de igualdade entre somas de dinheiro; os `> 0` comparam um valor único vindo do banco.
