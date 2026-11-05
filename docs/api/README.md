# API de integração — v1

Documentação para a equipe de TI (ou o fornecedor do ERP) que vai integrar o
ERP da empresa à plataforma de cobrança.

**Como funciona:** o ERP chama esta API pela internet, do mesmo jeito que já
faz para emitir nota fiscal. Por ela, ele **envia os títulos** a cobrar e
**consulta como está cada um** (em aberto, vencido, pago, em acordo, cancelado).
A empresa **não precisa abrir acesso ao banco de dados nem à rede dela**: todas
as conexões partem do ERP para cá.

**Suporte técnico:** Erick de Oliveira (TI) · telefone (85) 99428-3128 ·
e-mail eobx@hotmail.com

---

## Endereço e autenticação

```
Base: https://cuejrnqdudadlbuiouph.supabase.co/functions/v1/api-v1
```

Toda requisição leva a chave de API no cabeçalho:

```
Authorization: Bearer erp_live_XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
Content-Type: application/json
```

- A chave é gerada por nós e é exclusiva de uma empresa. **A empresa vem sempre
  da chave**: não existe campo de empresa no corpo da requisição, e uma chave
  não tem como enxergar dados de outra.
- A chave é **mostrada uma única vez**, na entrega. Guarde-a num lugar seguro
  do servidor (cofre de senhas, variável de ambiente). Se ela se perder, geramos
  outra.
- Use a chave **só em servidor**. Nunca a coloque em site, aplicativo ou
  planilha que outras pessoas possam abrir: quem tiver a chave envia e consulta
  títulos em nome da empresa.
- Se a chave vazar, avise o suporte: ela é revogada na hora e uma nova é
  entregue.
- Toda a comunicação é por HTTPS (criptografada).

A versão está no endereço (`api-v1`). Quando existir uma v2, esta continua no ar
sem alteração.

### Ambiente de teste

Não há um endereço separado para testes. Para homologar a integração, peça ao
suporte uma **chave de uma empresa de teste**: o endereço e as regras são os
mesmos, e nada do que for enviado com ela aparece na cobrança real. Depois de
validado, a chave de produção é entregue e a de teste é revogada.

---

## `POST /titulos` — enviar ou atualizar um título

Um título por requisição. O `numero_documento` identifica o título: enviar de
novo o mesmo número **nunca duplica**. Isso torna o reenvio seguro: se a rede
cair no meio, basta repetir a chamada.

```bash
curl -X POST "$BASE/titulos" \
  -H "Authorization: Bearer $CHAVE" \
  -H "Content-Type: application/json" \
  -d '{
    "cliente_nome": "Comercial Silva LTDA",
    "cpf_cnpj": "12.345.678/0001-95",
    "numero_documento": "NF-4417",
    "descricao": "Venda 4417",
    "contato": "11988887777",
    "cidade": "Campinas",
    "estado": "SP",
    "vendedor": "Marcos Antunes",
    "parcelas": [
      { "numero": 1, "valor": 1500.00, "vencimento": "2026-09-10", "pago": true },
      { "numero": 2, "valor": 1500.00, "vencimento": "2026-10-10" },
      { "numero": 3, "valor": 1500.00, "vencimento": "2026-11-10" }
    ]
  }'
```

### Campos

| Campo | Obrigatório | Observação |
|---|---|---|
| `cliente_nome` | sim | |
| `cpf_cnpj` | sim | Com ou sem pontuação. Os dígitos verificadores são conferidos. Aceita o CNPJ alfanumérico (com letras) |
| `numero_documento` | sim | Identifica o título no reenvio. Espaços nas pontas são ignorados |
| `parcelas` | sim | Ao menos uma |
| `parcelas[].numero` | sim | Inteiro ≥ 1 |
| `parcelas[].valor` | sim | Maior que zero, em reais. Mais de 2 casas decimais são arredondadas |
| `parcelas[].vencimento` | sim | `AAAA-MM-DD`, e precisa ser uma data que existe |
| `parcelas[].pago` | não | `true` registra a baixa da parcela |
| `descricao`, `contato`, `cidade`, `estado`, `cobrador`, `vendedor` | não | Cobrador e vendedor são criados se ainda não existirem |

**Números são números JSON, sem aspas:** `"numero": 1` e `"valor": 1500.00`.
Enviar `"numero": "1"` ou `"valor": "1500,00"` (como texto) é recusado com
`parcela_invalida`.

**Número do título repetido entre filiais ou séries.** O `numero_documento` é
único dentro da empresa. Se o ERP reinicia a numeração por filial ou série
(a filial A e a filial B têm, cada uma, uma "NF-100"), inclua essa informação no
número, por exemplo `F01-S1-100`. Sem isso, o segundo envio é recusado
(`Título … já existe para outro cliente`) ou, se for o mesmo cliente,
confundido com o primeiro.

### Resposta `200`

```json
{
  "sucesso": true,
  "titulo_id": "3f0c…",
  "cliente_id": "9a71…",
  "novo": true,
  "parcelas_processadas": 3,
  "avisos": []
}
```

`novo` diz se o título foi criado agora (`true`) ou já existia (`false`).
`avisos` lista o que foi aceito mas não aplicado (ver "Pagamento", abaixo). Uma
resposta `200` com avisos **não** é erro: não repita a chamada por causa deles.

### O cliente

O cliente é localizado pelo CPF/CNPJ: se já existir, é reaproveitado; se não,
é criado com os dados enviados.

Quando o cliente **já existe**, o reenvio atualiza `cidade`, `estado`,
`cobrador` e `vendedor` (só os que vierem preenchidos). **O nome e o telefone
não são alterados**: podem ter sido corrigidos pela equipe de cobrança, e o
envio do ERP não sobrescreve isso.

### Reenvio e alteração de parcelas

- **Enquanto o título não tem movimentação do nosso lado** (pagamento, desconto,
  encargo ou acordo), o reenvio **corrige** o valor e o vencimento das parcelas
  e aceita parcelas novas.
- **Depois disso, as parcelas ficam fixas.** Reenviar os mesmos valores é aceito
  sem mudar nada. Reenviar um valor ou vencimento diferente, ou uma parcela nova,
  devolve `422` dizendo qual parcela divergiu.
- **Parcela que deixa de vir no reenvio não é apagada.** Ela continua sendo
  cobrada. Para encerrar a cobrança do título inteiro, use
  `POST /titulos/{numero_documento}/cancelar`. Para tirar só uma parcela, fale
  com a equipe de cobrança.

### Pagamento

`pago: true` quita o que ainda resta da parcela. Reenviar o título com a mesma
parcela paga não duplica o pagamento.

- A data do pagamento registrada é a **data em que o envio chegou**. Envie a
  baixa assim que ela acontecer no ERP. Para informar a **data real**, um
  **valor parcial** ou o **meio de pagamento**, use a rota de pagamento
  (`POST /titulos/{numero_documento}/parcelas/{numero}/pagamentos`, abaixo).
- `pago: false`, ou o campo ausente, **não desfaz** um pagamento já registrado.
  Pagamento lançado por engano é estornado pela equipe de cobrança.

A baixa **não** é lançada, e o motivo vem em `avisos`, quando:

- o título está em acordo: o pagamento passa a acontecer nas parcelas do acordo;
- a baixa daquela parcela foi estornada do nosso lado: o estorno prevalece
  sobre o reenvio.

---

## `POST /titulos/lote` — enviar vários títulos numa chamada

Até **100 títulos** por chamada. Cada título segue exatamente as regras do
`POST /titulos` e é gravado separadamente: **um título com erro não impede os
outros**.

```bash
curl -X POST "$BASE/titulos/lote" \
  -H "Authorization: Bearer $CHAVE" \
  -H "Content-Type: application/json" \
  -d '{ "titulos": [ { …título 1… }, { …título 2… } ] }'
```

Resposta `200` (mesmo quando algum título falhou):

```json
{
  "processados": 2,
  "com_sucesso": 1,
  "com_erro": 1,
  "resultados": [
    { "indice": 0, "numero_documento": "NF-4417", "status": 200, "sucesso": true,
      "titulo_id": "3f0c…", "cliente_id": "9a71…", "novo": true, "parcelas_processadas": 3, "avisos": [] },
    { "indice": 1, "numero_documento": "NF-4418", "status": 422, "sucesso": false,
      "erro": { "codigo": "regra_de_negocio", "mensagem": "CPF/CNPJ inválido…" }, "repetir": false }
  ]
}
```

- `indice` é a posição do título na lista enviada (começa em 0).
- `status` e `erro` são os mesmos que o envio individual daria.
- **Reenvie só os itens com `repetir: true`** (falha temporária do nosso lado).
  Os de `repetir: false` precisam de correção no dado. Reenviar o lote inteiro
  também é seguro, porque o envio nunca duplica, só é mais lento.
- Lote vazio ou com mais de 100 títulos é recusado inteiro (`400`).

---

## `POST /titulos/{numero_documento}/parcelas/{numero}/pagamentos` — registrar um pagamento

Registra um pagamento numa parcela com **valor** (total ou parcial), **data
real** e **meio de pagamento**.

```bash
curl -X POST "$BASE/titulos/NF-4417/parcelas/2/pagamentos" \
  -H "Authorization: Bearer $CHAVE" \
  -H "Content-Type: application/json" \
  -d '{
    "id_pagamento": "BX-99812",
    "valor": 500.00,
    "data_pagamento": "2026-10-12",
    "meio_pagamento": "pix",
    "descricao": "Baixa 99812 do ERP"
  }'
```

| Campo | Obrigatório | Observação |
|---|---|---|
| `id_pagamento` | sim | O identificador da baixa **no ERP** (até 100 caracteres). Único por empresa: é ele que impede o pagamento de ser lançado duas vezes |
| `valor` | sim | Maior que zero, em reais, como número JSON. Não pode passar do saldo da parcela |
| `data_pagamento` | não | `AAAA-MM-DD`. Não pode ser futura. Sem ela, vale a data de hoje (horário de Brasília) |
| `meio_pagamento` | não | `pix`, `dinheiro`, `boleto`, `transferencia`, `cartao` ou `outro` |
| `descricao` | não | Texto livre que aparece no histórico da parcela |

Resposta `200`:

```json
{
  "numero_documento": "NF-4417",
  "sucesso": true,
  "repetido": false,
  "estornado": false,
  "id_pagamento": "BX-99812",
  "parcela": 2,
  "tipo": "pagamento_parcial",
  "valor_pago": 500.00,
  "data_pagamento": "2026-10-12",
  "saldo_anterior": 1500.00,
  "saldo_atual": 1000.00
}
```

`tipo` é `pagamento_total` quando o valor quita o saldo da parcela, e
`pagamento_parcial` quando sobra saldo.

**Repetir é seguro.** Reenviar o mesmo `id_pagamento` com os mesmos dados não
lança de novo: a resposta vem com `repetido: true` e o saldo atual. Usar um
`id_pagamento` que já existe com **outra** parcela ou **outro** valor devolve
`422`, porque provavelmente é um erro do lado do ERP.

`estornado: true` (só aparece em `repetido: true`) quer dizer que a equipe de
cobrança estornou esse pagamento. O estorno prevalece: o reenvio não relança.
Se o pagamento é legítimo, envie com um `id_pagamento` novo.

O pagamento é recusado (`422`, com o motivo em `mensagem`) quando:

- o valor passa do saldo da parcela, ou a parcela já está paga;
- a data é futura;
- o título está em acordo: o pagamento passa a acontecer nas parcelas do acordo.

Título ou parcela que não existem devolvem `404` (`titulo_nao_encontrado` ou
`parcela_nao_encontrada`).

---

## `POST /titulos/{numero_documento}/cancelar` — cancelar um título

Encerra a cobrança de um título, por exemplo numa nota devolvida ou cancelada no
ERP. O corpo é opcional:

```bash
curl -X POST "$BASE/titulos/NF-4417/cancelar" \
  -H "Authorization: Bearer $CHAVE" \
  -H "Content-Type: application/json" \
  -d '{ "motivo": "Nota fiscal devolvida" }'
```

Resposta `200`:

```json
{ "sucesso": true, "numero_documento": "NF-4417", "situacao": "cancelado", "ja_estava_cancelado": false }
```

- **Cancelar de novo não é erro:** a resposta vem com `ja_estava_cancelado: true`.
- O cancelamento é **recusado** (`422`) quando o título tem pagamento registrado
  ou está em acordo. Nesses casos, fale com a equipe de cobrança: eles estornam
  o pagamento ou cancelam o acordo antes, para que os relatórios fiquem certos.
- Depois de cancelado, o título continua aparecendo na consulta, com
  `situacao: "cancelado"`. O mesmo `numero_documento` pode ser enviado de novo
  depois disso, e vira um título novo.

---

## `GET /titulos/{numero_documento}` — situação de um título

```bash
curl "$BASE/titulos/NF-4417" -H "Authorization: Bearer $CHAVE"
```

O número vai no endereço, então caracteres especiais precisam ser codificados
(URL encoding): `NF/4417` vira `NF%2F4417`, um espaço vira `%20`. As bibliotecas
HTTP costumam ter uma função para isso (`encodeURIComponent`, `urlencode`…).

```json
{
  "numero_documento": "NF-4417",
  "situacao": "vencido",
  "cliente": { "nome": "Comercial Silva LTDA", "cpf_cnpj": "12345678000195", "telefone": "11988887777" },
  "valor_original": 4500.00,
  "vencimento_original": "2026-09-10",
  "descricao": "Venda 4417",
  "total_pago": 1500.00,
  "saldo_atual": 3000.00,
  "atualizado_em": "2026-09-09T11:20:00.000Z",
  "parcelas": [
    {
      "numero": 1, "valor_nominal": 1500.00, "vencimento": "2026-09-10",
      "juros": 0, "multa": 0, "descontos": 0,
      "total_pago": 1500.00, "saldo_atual": 0, "situacao": "pago",
      "ultimo_pagamento_em": "2026-09-09T11:20:00.000Z"
    },
    {
      "numero": 2, "valor_nominal": 1500.00, "vencimento": "2026-10-10",
      "juros": 0, "multa": 0, "descontos": 0,
      "total_pago": 0, "saldo_atual": 1500.00, "situacao": "vencido",
      "ultimo_pagamento_em": null
    },
    {
      "numero": 3, "valor_nominal": 1500.00, "vencimento": "2026-11-10",
      "juros": 0, "multa": 0, "descontos": 0,
      "total_pago": 0, "saldo_atual": 1500.00, "situacao": "a_vencer",
      "ultimo_pagamento_em": null
    }
  ]
}
```

Valores em reais; datas no formato `AAAA-MM-DD`; data e hora em ISO 8601 (UTC).
O CPF/CNPJ volta sem pontuação.

### `situacao` do título

| Valor | Significado |
|---|---|
| `a_vencer` | Em aberto, nada vencido |
| `vencido` | Alguma parcela em aberto passou do vencimento |
| `pago` | Quitado pelo pagamento das parcelas |
| `em_acordo` | Renegociado num acordo que está em dia |
| `acordo_quebrado` | Renegociado num acordo com parcela em atraso: **dívida em aberto** |
| `acordo_cumprido` | Quitado pelo acordo (todas as parcelas do acordo pagas) |
| `cancelado` | Cobrança cancelada do nosso lado |
| `indefinida` | Título sem parcelas consolidadas. Não deve acontecer em uso normal; se aparecer, avise o suporte |

**Para o ERP, "encerrado" é `pago`, `acordo_cumprido` ou `cancelado`.** Os
demais são dívida em aberto, inclusive `em_acordo` e `acordo_quebrado`.

### `situacao` da parcela

`a_vencer`, `vencido`, `pago` ou `renegociado` (a parcela foi levada para um
acordo; não foi paga).

**Quando uma parcela vira `vencido`:** no dia seguinte ao vencimento, pelo
horário de Brasília. Se o vencimento cai em sábado, domingo ou feriado (os
bancários nacionais, inclusive o Carnaval, e os cadastrados pela empresa), a
parcela só vence depois do próximo dia útil.

### Saldo

O `saldo_atual` já considera juros, multa, descontos e pagamentos lançados do
nosso lado. **Em título de acordo ele é zero:** o acordo substitui a dívida do
título e o saldo passa a ser cobrado nas parcelas do acordo, que a v1 não
mostra. Por isso `em_acordo` e `acordo_quebrado` com saldo zero **não**
significam quitado.

### Título cancelado

Um título **cancelado continua respondendo aqui**, com `situacao: "cancelado"`.
É assim que o ERP descobre que a cobrança foi encerrada do nosso lado.

---

## `GET /titulos` — listar títulos

```bash
curl "$BASE/titulos?atualizado_apos=2026-10-01T00:00:00Z&incluir_cancelados=true&limite=100" \
  -H "Authorization: Bearer $CHAVE"
```

| Parâmetro | Padrão | Observação |
|---|---|---|
| `atualizado_apos` | — | Data/hora ISO 8601. Traz só o que mudou depois dela |
| `incluir_cancelados` | `false` | `true` traz também os títulos cancelados |
| `limite` | 50 | Itens por página, de 1 a 200 |
| `offset` | 0 | Quantos itens pular (paginação) |

Resposta: `{ "titulos": [ … ], "limite": 100, "offset": 0 }`. Cada item tem o
mesmo formato do título individual, sem a lista de parcelas. A lista vem da
mudança mais recente para a mais antiga. Quando vier com menos itens que o
`limite`, acabou.

### Sincronização recomendada

1. Na primeira vez, liste tudo (sem `atualizado_apos`), página por página.
2. Guarde o **horário em que a consulta começou**.
3. Nas próximas, use esse horário em `atualizado_apos`, sempre com
   `incluir_cancelados=true` e alguns minutos de folga (ex.: 5 minutos antes).
   Repetir um título já recebido não faz mal; perder um, sim.

Assim o ERP puxa só o que mudou, inclusive os cancelamentos, em vez de varrer a
base inteira.

**O que conta como mudança** (`atualizado_apos` e `atualizado_em`): o envio ou
cancelamento do título; qualquer lançamento nas parcelas dele (pagamento,
estorno, encargo, desconto); e qualquer mudança no acordo do título (criado,
quebrado, cumprido, cancelado).

**O que não conta:** a passagem do tempo. Um título que vira `vencido` só porque
a data passou não aparece como alterado, porque o ERP já tem o vencimento de
cada parcela. Para refletir isso, consulte o título ou faça uma varredura
completa de tempos em tempos (ex.: uma vez por dia).

---

## Frequência das chamadas

Não há limite rígido de chamadas hoje, mas pedimos bom senso:

- **Envio:** uma chamada por título, quando ele é criado ou muda no ERP, ou
  `POST /titulos/lote` para vários de uma vez (até 100 por chamada). Para uma
  carga inicial muito grande (milhares de títulos), fale com o suporte: pode
  sair mais rápido pela importação de planilha.
- **Consulta incremental:** a cada 15 minutos já é bem atualizado; não há
  ganho em consultar a cada poucos segundos.
- Envie as chamadas **uma de cada vez** (ou poucas em paralelo), não centenas
  ao mesmo tempo.

---

## Erros

Todo erro tem a mesma forma. O `codigo` é estável e pode ser tratado no
programa; a `mensagem` é para leitura humana e pode mudar.

```json
{ "erro": { "codigo": "parcela_invalida", "mensagem": "Cada parcela precisa de numero…" } }
```

| HTTP | Código | Significado | Repetir? |
|---|---|---|---|
| 400 | `corpo_invalido` | O corpo não é um JSON válido, ou não é um objeto | Não: corrija o envio |
| 400 | `cliente_nome_obrigatorio`, `cpf_cnpj_obrigatorio`, `numero_documento_obrigatorio`, `parcelas_obrigatorias`, `parcela_invalida` | Falta um campo obrigatório ou ele veio no formato errado | Não: corrija o envio |
| 400 | `parametro_invalido` | Parâmetro de consulta malformado (ex.: `atualizado_apos` que não é data/hora) | Não: corrija o envio |
| 400 | `titulos_obrigatorios`, `lote_grande_demais` | Lote vazio, sem a lista `titulos`, ou com mais de 100 títulos | Não: corrija o envio |
| 400 | `id_pagamento_obrigatorio`, `pagamento_invalido` | Pagamento sem `id_pagamento`, ou com valor, data ou meio de pagamento no formato errado | Não: corrija o envio |
| 401 | `chave_ausente`, `chave_invalida` | Chave não enviada, inválida ou revogada, ou empresa sem acesso (suspensa ou com o prazo do plano vencido) | Não: fale com o suporte |
| 404 | `titulo_nao_encontrado` | Não existe título com esse número nesta empresa | Não |
| 404 | `parcela_nao_encontrada` | O título existe, mas não tem a parcela informada no endereço | Não |
| 404 | `rota_desconhecida` | Endereço errado | Não: confira o endereço |
| 405 | `metodo_nao_permitido` | Método HTTP não aceito nessa rota | Não |
| 422 | `regra_de_negocio` | O corpo está bem formado, mas o conteúdo não passa numa regra (ex.: CPF/CNPJ inválido, data que não existe, parcela com movimentação reenviada com outro valor, número de título já usado por outro cliente). A `mensagem` diz qual | Não: corrija o dado |
| 422 | `limite_do_plano` | A empresa atingiu o limite de títulos do plano. Só título **novo** é recusado: reenviar um título que já existe continua funcionando | Não: pare de enviar títulos novos e avise o responsável para ampliar o plano |
| 500 | `erro_interno`, `falha_consulta`, `falha_autenticacao` | Falha temporária do nosso lado | **Sim** |

**Repetir é seguro:** o envio é idempotente (o mesmo título nunca duplica). Em
`500` ou falha de rede, repita com espera crescente (ex.: 1 minuto, 5 minutos,
15 minutos). Se persistir, avise o suporte.

---

## O que ainda não existe na v1

- **Avisos automáticos** (webhooks: nós chamarmos o ERP quando algo muda). Por
  enquanto o caminho é consultar `GET /titulos?atualizado_apos=…` de tempos em
  tempos.
- **Detalhe dos acordos.** A renegociação acontece do nosso lado e aparece na
  consulta como `situacao` do título (`em_acordo`, `acordo_quebrado`,
  `acordo_cumprido`); o valor e as parcelas do acordo ainda não são mostrados.

Se algum desses itens for necessário para a sua integração, fale com o suporte.

---

## Estabilidade e histórico de mudanças

A v1 só recebe **acréscimos**: campos novos na resposta, códigos de erro novos,
valores novos de `situacao`, sempre registrados aqui. Por isso, **o programa
deve ignorar campos que não conhece**, em vez de falhar. Mudança incompatível
vai para uma v2, e a v1 continua funcionando por um prazo combinado.

- **2026-11** — Versão inicial.
- **2026-11** — Acréscimos: envio em lote (`POST /titulos/lote`), pagamento com
  valor, data e meio (`POST /titulos/{numero_documento}/parcelas/{numero}/pagamentos`)
  e cancelamento pelo ERP (`POST /titulos/{numero_documento}/cancelar`). Códigos
  de erro novos: `titulos_obrigatorios`, `lote_grande_demais`,
  `id_pagamento_obrigatorio`, `pagamento_invalido`, `parcela_nao_encontrada`.
