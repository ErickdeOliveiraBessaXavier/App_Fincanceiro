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
  cobrada. Para encerrar uma cobrança, fale com a equipe de cobrança (veja
  "O que ainda não existe na v1").

### Pagamento

`pago: true` quita o que ainda resta da parcela. Reenviar o título com a mesma
parcela paga não duplica o pagamento.

- A data do pagamento registrada é a **data em que o envio chegou**. Envie a
  baixa assim que ela acontecer no ERP.
- `pago: false`, ou o campo ausente, **não desfaz** um pagamento já registrado.
  Pagamento lançado por engano é estornado pela equipe de cobrança.

A baixa **não** é lançada, e o motivo vem em `avisos`, quando:

- o título está em acordo: o pagamento passa a acontecer nas parcelas do acordo;
- a baixa daquela parcela foi estornada do nosso lado: o estorno prevalece
  sobre o reenvio.

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

- **Envio:** uma chamada por título, quando ele é criado ou muda no ERP. Para
  uma carga inicial muito grande (milhares de títulos), fale com o suporte:
  pode sair mais rápido pela importação de planilha.
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
| 401 | `chave_ausente`, `chave_invalida` | Chave não enviada, inválida ou revogada, ou empresa sem acesso (suspensa ou com o prazo do plano vencido) | Não: fale com o suporte |
| 404 | `titulo_nao_encontrado` | Não existe título com esse número nesta empresa | Não |
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

- **Cancelar ou encerrar um título pelo ERP** (ex.: nota devolvida). Hoje o
  cancelamento é feito pela equipe de cobrança, e o ERP fica sabendo pela
  consulta (`situacao: "cancelado"`).
- **Baixa avulsa** com valor parcial, data e meio de pagamento. Hoje o pagamento
  entra pelo reenvio do título com `pago: true` na parcela, sempre pelo valor
  restante.
- **Avisos automáticos** (webhooks: nós chamarmos o ERP quando algo muda). Por
  enquanto o caminho é consultar `GET /titulos?atualizado_apos=…` de tempos em
  tempos.
- **Envio em lote** de vários títulos numa só chamada.
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
