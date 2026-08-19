// Edge Function: super admin gera uma chave de API para uma empresa.
//
// Precisa de service role por dois motivos: criar o usuário técnico que assina
// o que entra pela chave, e gravar o hash numa tabela sem policy para o app.
//
// A chave em claro é devolvida UMA ÚNICA VEZ, aqui. Depois disso só existe o
// SHA-256 dela no banco — se o cliente perder, o caminho é gerar outra e
// revogar a antiga.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type Admin = ReturnType<typeof createClient>;

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Só o super admin libera integração: é uma decisão de plataforma (o que foi
// vendido para qual cliente), não uma configuração da empresa.
async function exigirSuperAdmin(admin: Admin, req: Request): Promise<Response | { userId: string }> {
  const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
  const { data: caller, error } = await admin.auth.getUser(token);
  if (error || !caller?.user) return json(401, { error: "Não autenticado" });

  const { data: roles } = await admin
    .from("user_roles").select("role").eq("user_id", caller.user.id);
  const isSuper = (roles ?? []).some((r: { role: string }) => r.role === "super_admin");
  if (!isSuper) return json(403, { error: "Apenas o super admin gerencia chaves de API" });

  return { userId: caller.user.id };
}

function validarEntrada(body: Record<string, unknown> | null): Response | { companyId: string; nome: string } {
  const companyId = body?.company_id as string | undefined;
  const nome = (body?.nome as string | undefined)?.trim();
  if (!companyId) return json(400, { error: "Informe a empresa" });
  if (!nome) return json(400, { error: "Dê um nome à chave (ex.: ERP do cliente)" });
  return { companyId, nome };
}

// Um usuário técnico por empresa, reaproveitado entre chaves. Sem senha: não
// consegue fazer login, mas é um auth.users válido para assinar os registros
// (titulos.created_by é NOT NULL REFERENCES auth.users).
async function obterAtor(admin: Admin, companyId: string): Promise<string> {
  const { data: existente } = await admin
    .from("api_keys").select("actor_id").eq("company_id", companyId).limit(1).maybeSingle();
  if (existente?.actor_id) return existente.actor_id as string;

  const { data: criado, error } = await admin.auth.admin.createUser({
    email: `integracao.${companyId}@no-reply.invalid`,
    email_confirm: true,
    // O trigger handle_new_user lê estes campos e já cria profile + papel.
    user_metadata: { nome: "Integração ERP", company_id: companyId, role: "operador" },
  });
  if (error || !criado?.user) throw new Error(error?.message ?? "Falha ao criar o usuário de integração");
  return criado.user.id;
}

async function sha256Hex(valor: string): Promise<string> {
  const bytes = new TextEncoder().encode(valor);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// 32 bytes de aleatoriedade em base64url — sem caracteres que atrapalhem quem
// for colar a chave num campo de configuração do ERP.
function gerarChave(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const b64 = btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `erp_live_${b64}`;
}

async function criarChave(admin: Admin, criadorId: string, entrada: { companyId: string; nome: string }) {
  const actorId = await obterAtor(admin, entrada.companyId);
  const chave = gerarChave();

  const { data, error } = await admin.from("api_keys").insert({
    company_id: entrada.companyId,
    nome: entrada.nome,
    key_prefix: chave.slice(0, 17),
    key_hash: await sha256Hex(chave),
    actor_id: actorId,
    created_by: criadorId,
  }).select("id, key_prefix, created_at").single();

  if (error) return json(400, { error: error.message });

  // Única vez que a chave em claro sai daqui.
  return json(200, { sucesso: true, chave, ...data });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "Método não permitido" });

  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );

    const caller = await exigirSuperAdmin(admin, req);
    if (caller instanceof Response) return caller;

    const entrada = validarEntrada(await req.json());
    if (entrada instanceof Response) return entrada;

    return await criarChave(admin, caller.userId, entrada);
  } catch (e) {
    return json(500, { error: String((e as Error)?.message ?? e) });
  }
});
