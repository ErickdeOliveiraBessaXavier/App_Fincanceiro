# enviar-campanha

Dispara uma campanha de WhatsApp usando o provedor configurado pela empresa.

**Estado atual: estrutura pronta, canal não contratado.** Sem credencial válida a
função responde `409 { codigo: "integracao_ausente" }` e não envia nada — ela
nunca finge que enviou.

## Como ligar o Z-API

1. No painel do Z-API, crie uma instância e conecte o número (QR Code).
2. Anote **ID da instância**, **Token da instância** e, se a conta exigir, o
   **Client-Token**.
3. No app: **Campanhas › Canal de WhatsApp › Configurar** (visível para admin).
   Preencha os campos e marque *Canal ativo*.
4. Publique a função:
   ```
   supabase functions deploy enviar-campanha
   ```

Nada de credencial vai para o repositório nem para o navegador: o token fica em
`integracoes_whatsapp`, cuja RLS impede o frontend de lê-lo. A tela consome
`vw_integracoes_whatsapp`, que só informa **se** o token está preenchido. Quem
lê o segredo é esta função, com `service_role`.

## Onde cada coisa vive

| Arquivo | Papel |
|---|---|
| `zapi.ts` | Único módulo que conhece o formato do Z-API |
| `index.ts` | Autorização, seleção de destinatários e registro dos envios |
| `integracoes_whatsapp` | Credenciais por empresa (token nunca sai daqui) |
| `campanha_envios` | Uma linha por destinatário: status, id no provedor, erro |

Trocar de provedor (Meta Cloud API, Twilio) é escrever outro módulo com a mesma
assinatura de `EnvioResultado` — `index.ts` não muda.

## Limites conhecidos

- **Envio sequencial.** O Z-API limita a taxa por instância e um lote em paralelo
  derruba a conexão. Para volume alto, a evolução natural é enfileirar
  (`campanha_envios` já nasce com `status = 'pendente'` para isso) e processar em
  lotes por agendamento.
- **Público = todos os clientes com telefone.** A coluna `campanhas.filtros`
  existe no banco mas ainda não recorta o público; quando for usada, o lugar de
  aplicar é `destinatariosDaCampanha`.
- **Só texto.** `send-text` cobre o caso de hoje; mídia e template exigem outros
  endpoints do provedor.
- **Só WhatsApp.** Campanhas de e-mail e SMS são recusadas com mensagem clara.

## Variáveis de ambiente

Só as que o Supabase já injeta: `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY`.
