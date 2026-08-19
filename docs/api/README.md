# API de integração — v1

Documentação para a equipe de TI do cliente. É a porta oficial de entrada do
ERP: o cliente **não recebe acesso ao banco de dados**, e todas as conexões
partem do ERP para cá (nada precisa ser exposto na rede dele).

## Endereço e autenticação

```
Base: https://<projeto>.supabase.co/functions/v1/api-v1
```

Toda requisição leva a chave de API no cabeçalho:

```
Authorization: Bearer erp_live_XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
Content-Type: application/json
```

A chave é gerada por nós, é exclusiva de uma empresa e pode ser revogada a
qualquer momento. **A empresa vem sempre da chave** — não existe campo de
empresa no corpo da requisição, e não há como uma chave enxergar dados de outra.

A versão está no endereço (`api-v1`). Quando existir uma v2, esta continua no ar
sem alteração.

---

## `POST /titulos` — enviar ou atualizar um título

Um título por requisição. O `numero_documento` é o que identifica o título:
enviar de novo o mesmo número **corrige o título existente em vez de duplicar**.
Isso torna o reenvio seguro — se a rede cair no meio, basta repetir a chamada.

```bash
curl -X POST "$BASE/titulos" \
  -H "Authorization: Bearer $CHAVE" \
  -H "Content-Type: application/json" \
  -d '{
    "cliente_nome": "Comercial Silva LTDA",
    "cpf_cnpj": "12345678000190",
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

**Campos**

| Campo | Obrigatório | Observação |
|---|---|---|
| `cliente_nome` | sim | |
| `cpf_cnpj` | sim | Com ou sem pontuação; 11 ou 14 dígitos |
| `numero_documento` | sim | Identifica o título no reenvio |
| `parcelas` | sim | Ao menos uma |
| `parcelas[].numero` | sim | Inteiro ≥ 1 |
| `parcelas[].valor` | sim | Maior que zero |
| `parcelas[].vencimento` | sim | `AAAA-MM-DD` |
| `parcelas[].pago` | não | `true` registra a baixa da parcela |
| `descricao`, `contato`, `cidade`, `estado`, `cobrador`, `vendedor` | não | Cobrador e vendedor são criados se ainda não existirem |

**Resposta `200`**

```json
{ "sucesso": true, "titulo_id": "…", "cliente_id": "…", "parcelas_processadas": 3 }
```

O cliente é localizado pelo CPF/CNPJ: se já existir, é reaproveitado; se não,
é criado. `pago: true` só registra a baixa se ainda não houver pagamento
naquela parcela, então reenviar não duplica pagamento.

---

## `GET /titulos/{numero_documento}` — situação de um título

```bash
curl "$BASE/titulos/NF-4417" -H "Authorization: Bearer $CHAVE"
```

```json
{
  "numero_documento": "NF-4417",
  "situacao": "vencido",
  "cliente": { "nome": "Comercial Silva LTDA", "cpf_cnpj": "12345678000190", "telefone": "11988887777" },
  "valor_original": 4500.00,
  "vencimento_original": "2026-09-10",
  "descricao": "Venda 4417",
  "total_pago": 1500.00,
  "saldo_atual": 3000.00,
  "atualizado_em": "2026-08-19T14:02:11.482Z",
  "parcelas": [
    {
      "numero": 1, "valor_nominal": 1500.00, "vencimento": "2026-09-10",
      "juros": 0, "multa": 0, "descontos": 0,
      "total_pago": 1500.00, "saldo_atual": 0, "situacao": "pago",
      "ultimo_pagamento_em": "2026-09-09T11:20:00.000Z"
    }
  ]
}
```

`situacao` do título: `pago` (sem saldo), `vencido` (alguma parcela em aberto
passou do vencimento), `a_vencer`, `cancelado` ou `indefinida` (título sem
parcelas consolidadas — não deve acontecer em uso normal). O `saldo_atual` já
considera juros, multa, descontos e pagamentos.

Um título **cancelado continua respondendo aqui**, com `situacao: "cancelado"`.
É assim que o ERP descobre que a cobrança foi encerrada do nosso lado — se ele
sumisse, a dívida ficaria aberta no ERP para sempre.

---

## `GET /titulos` — listar títulos

```bash
curl "$BASE/titulos?atualizado_apos=2026-08-19T00:00:00Z&limite=100" \
  -H "Authorization: Bearer $CHAVE"
```

| Parâmetro | Padrão | Observação |
|---|---|---|
| `atualizado_apos` | — | Data/hora ISO. Traz só o que mudou desde então |
| `incluir_cancelados` | `false` | `true` traz também os títulos cancelados |
| `limite` | 50 | Máximo 200 |
| `offset` | 0 | Paginação |

Resposta: `{ "titulos": [ … ], "limite": 100, "offset": 0 }`, cada item no
mesmo formato do título individual, sem a lista de parcelas.

**Sincronização recomendada:** guarde o horário da última consulta bem-sucedida
e use em `atualizado_apos` na próxima, com `incluir_cancelados=true`. Assim o
ERP puxa só o que mudou — inclusive os cancelamentos — em vez de varrer a base
inteira.

---

## Erros

Todo erro tem a mesma forma. O `codigo` é estável e pode ser tratado em código;
a `mensagem` é para leitura humana e pode mudar.

```json
{ "erro": { "codigo": "parcela_invalida", "mensagem": "Cada parcela precisa de numero…" } }
```

| HTTP | Código | Significado |
|---|---|---|
| 400 | `corpo_invalido`, `cliente_nome_obrigatorio`, `cpf_cnpj_obrigatorio`, `numero_documento_obrigatorio`, `parcelas_obrigatorias`, `parcela_invalida` | O corpo enviado está incompleto ou malformado |
| 401 | `chave_ausente`, `chave_invalida` | Chave não enviada, inválida ou revogada |
| 404 | `titulo_nao_encontrado`, `rota_desconhecida` | |
| 405 | `metodo_nao_permitido` | |
| 422 | `regra_de_negocio` | O corpo está bem formado, mas o conteúdo não passa numa regra (ex.: CPF/CNPJ com quantidade de dígitos inválida) |
| 500 | `erro_interno`, `falha_consulta`, `falha_autenticacao` | Falha nossa — pode repetir a chamada |

Em `500`, repetir é seguro: a ingestão é idempotente.

---

## O que ainda não existe na v1

- **Webhooks** (nós avisarmos o ERP quando algo muda). Por enquanto o caminho é
  consultar `GET /titulos?atualizado_apos=…` periodicamente.
- **Baixa avulsa** com valor parcial e meio de pagamento. Hoje o pagamento entra
  pelo reenvio do título com `pago: true` na parcela.
- **Envio em lote** numa única chamada. Carga inicial grande costuma sair mais
  rápido pela importação de planilha; o dia a dia é uma chamada por título.
- **Acordos**. Renegociação acontece no nosso lado e aparece na consulta.
