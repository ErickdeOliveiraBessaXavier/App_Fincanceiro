// Cliente do Z-API isolado do resto da função.
//
// Único lugar que conhece o formato do provedor: trocar de provedor (Meta Cloud
// API, Twilio) é escrever outro módulo com a mesma assinatura `EnvioResultado`,
// sem tocar no orquestrador da campanha.
//
// Referência do endpoint: POST {base}/instances/{instance}/token/{token}/send-text
// Corpo: { phone, message }. Cabeçalho Client-Token quando a conta exige.

export interface CredenciaisZApi {
  instanceId: string;
  token: string;
  clientToken?: string | null;
}

export interface EnvioResultado {
  ok: boolean;
  /** Id da mensagem no provedor, quando o envio foi aceito. */
  providerMsgId?: string;
  erro?: string;
}

const BASE = "https://api.z-api.io";

/**
 * Telefone no formato que o Z-API espera: só dígitos, com DDI.
 *
 * Os números do sistema são gravados sem máscara e sem DDI (o padrão brasileiro
 * do cadastro), então 10/11 dígitos ganham o 55 na frente. Número que já venha
 * com DDI passa intacto.
 */
export function telefoneParaZApi(telefone: string): string | null {
  const digitos = String(telefone ?? "").replace(/\D/g, "");
  if (digitos.length === 10 || digitos.length === 11) return `55${digitos}`;
  if (digitos.length === 12 || digitos.length === 13) return digitos;
  return null;
}

interface CorpoZApi {
  error?: string;
  messageId?: string;
  zaapId?: string;
}

/** Traduz a resposta do provedor no resultado que a função registra. */
function lerResposta(status: number, ok: boolean, corpo: CorpoZApi): EnvioResultado {
  // O Z-API devolve a causa em `error`; sem ela, o status já orienta.
  if (!ok) return { ok: false, erro: corpo.error ?? `HTTP ${status}` };
  return { ok: true, providerMsgId: corpo.messageId ?? corpo.zaapId };
}

function cabecalhos(cred: CredenciaisZApi): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (cred.clientToken) headers["Client-Token"] = cred.clientToken;
  return headers;
}

export async function enviarTexto(
  cred: CredenciaisZApi,
  telefone: string,
  mensagem: string,
): Promise<EnvioResultado> {
  const phone = telefoneParaZApi(telefone);
  if (!phone) return { ok: false, erro: `Telefone inválido: ${telefone}` };

  const url = `${BASE}/instances/${cred.instanceId}/token/${cred.token}/send-text`;

  try {
    const resposta = await fetch(url, {
      method: "POST",
      headers: cabecalhos(cred),
      body: JSON.stringify({ phone, message: mensagem }),
    });
    const corpo = (await resposta.json().catch(() => ({}))) as CorpoZApi;
    return lerResposta(resposta.status, resposta.ok, corpo);
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : "Falha de rede" };
  }
}
