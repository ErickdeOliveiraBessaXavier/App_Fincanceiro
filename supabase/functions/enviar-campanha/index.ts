// Edge Function: dispara uma campanha de WhatsApp pelo provedor da empresa.
//
// ESTRUTURA PRONTA, CANAL AINDA NÃO CONTRATADO. Sem credencial do Z-API
// configurada em `integracoes_whatsapp`, a função responde 409 com uma mensagem
// que diz o que falta — ela nunca finge que enviou.
//
// Usa service_role (só disponível aqui) para ler o token do provedor, que a RLS
// esconde do frontend de propósito.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { enviarTexto, type CredenciaisZApi } from "./zapi.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

type Admin = ReturnType<typeof createClient>;

/** Confirma que quem chamou é operador+ da empresa e devolve o company_id. */
async function resolverChamador(admin: Admin, req: Request): Promise<Response | { companyId: string }> {
  const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
  const { data: caller, error } = await admin.auth.getUser(token);
  if (error || !caller?.user) return json(401, { error: "Não autenticado" });

  const { data: perfil } = await admin
    .from("profiles").select("company_id").eq("user_id", caller.user.id).single();
  const companyId = perfil?.company_id as string | null;
  if (!companyId) return json(403, { error: "Usuário não pertence a uma empresa" });

  const { data: roles } = await admin
    .from("user_roles").select("role").eq("user_id", caller.user.id);
  const podeDisparar = (roles ?? []).some((r: { role: string }) =>
    r.role === "operador" || r.role === "admin" || r.role === "super_admin");
  if (!podeDisparar) return json(403, { error: "Sem permissão para disparar campanhas" });

  return { companyId };
}

interface Destinatario {
  cliente_id: string;
  nome: string;
  telefone: string;
}

/**
 * Substitui as marcações da mensagem pelos dados do cliente.
 * Mantido simples de propósito: `{{nome}}` cobre o caso real de hoje.
 */
function montarMensagem(modelo: string, destinatario: Destinatario): string {
  return modelo.replaceAll("{{nome}}", destinatario.nome ?? "");
}

async function credenciaisDaEmpresa(admin: Admin, companyId: string): Promise<CredenciaisZApi | null> {
  const { data } = await admin
    .from("integracoes_whatsapp")
    .select("instance_id, token, client_token, ativo")
    .eq("company_id", companyId)
    .eq("provider", "z-api")
    .maybeSingle();

  if (!data?.ativo || !data.instance_id || !data.token) return null;
  return {
    instanceId: data.instance_id as string,
    token: data.token as string,
    clientToken: (data.client_token as string | null) ?? null,
  };
}

/** Clientes da campanha com telefone. Sem telefone não há o que enviar. */
async function destinatariosDaCampanha(admin: Admin, companyId: string): Promise<Destinatario[]> {
  const { data } = await admin
    .from("clientes")
    .select("id, nome, telefone")
    .eq("company_id", companyId)
    .is("deleted_at", null)
    .not("telefone", "is", null);

  return (data ?? [])
    .filter((c: { telefone: string | null }) => !!c.telefone)
    .map((c: { id: string; nome: string; telefone: string }) => ({
      cliente_id: c.id,
      nome: c.nome,
      telefone: c.telefone,
    }));
}

interface Campanha {
  id: string;
  canal: string;
  mensagem: string;
  status: string;
}

/** Campanha do tenant em condição de disparar, ou a Response que explica por quê não. */
async function campanhaDisparavel(
  admin: Admin, companyId: string, campanhaId: string,
): Promise<Response | Campanha> {
  const { data } = await admin
    .from("campanhas")
    .select("id, nome, canal, mensagem, status")
    .eq("id", campanhaId)
    .eq("company_id", companyId)
    .maybeSingle();

  if (!data) return json(404, { error: "Campanha não encontrada" });
  const campanha = data as unknown as Campanha;
  if (campanha.canal !== "whatsapp") {
    return json(400, { error: `Canal "${campanha.canal}" ainda não tem disparo. Só WhatsApp.` });
  }
  if (campanha.status !== "ativa") {
    return json(400, { error: "Ative a campanha antes de disparar." });
  }
  return campanha;
}

/**
 * Envia para cada destinatário e registra o resultado.
 *
 * Sequencial de propósito: o Z-API limita a taxa por instância e um lote em
 * paralelo derruba a conexão. Volume grande pede fila — ver README.
 */
async function dispararPara(
  admin: Admin,
  companyId: string,
  campanha: Campanha,
  cred: CredenciaisZApi,
  destinatarios: Destinatario[],
) {
  let enviados = 0;
  let falhas = 0;

  for (const destinatario of destinatarios) {
    const resultado = await enviarTexto(
      cred,
      destinatario.telefone,
      montarMensagem(campanha.mensagem, destinatario),
    );

    await admin.from("campanha_envios").insert({
      company_id: companyId,
      campanha_id: campanha.id,
      cliente_id: destinatario.cliente_id,
      canal: "whatsapp",
      destino: destinatario.telefone,
      status: resultado.ok ? "enviado" : "falha",
      provider_msg_id: resultado.providerMsgId ?? null,
      erro: resultado.erro ?? null,
      enviado_em: resultado.ok ? new Date().toISOString() : null,
    });

    if (resultado.ok) enviados += 1;
    else falhas += 1;
  }

  return { enviados, falhas };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const admin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  const chamador = await resolverChamador(admin, req);
  if (chamador instanceof Response) return chamador;
  const { companyId } = chamador;

  const { campanha_id: campanhaId } = await req.json().catch(() => ({}));
  if (!campanhaId) return json(400, { error: "campanha_id é obrigatório" });

  const campanha = await campanhaDisparavel(admin, companyId, campanhaId);
  if (campanha instanceof Response) return campanha;

  const cred = await credenciaisDaEmpresa(admin, companyId);
  if (!cred) {
    return json(409, {
      error: "WhatsApp não configurado. Cadastre a instância e o token do Z-API em Campanhas › Canal de WhatsApp.",
      codigo: "integracao_ausente",
    });
  }

  const destinatarios = await destinatariosDaCampanha(admin, companyId);
  if (destinatarios.length === 0) {
    return json(400, { error: "Nenhum cliente com telefone para esta campanha." });
  }

  const { enviados, falhas } = await dispararPara(admin, companyId, campanha, cred, destinatarios);
  return json(200, { sucesso: true, enviados, falhas, total: destinatarios.length });
});
