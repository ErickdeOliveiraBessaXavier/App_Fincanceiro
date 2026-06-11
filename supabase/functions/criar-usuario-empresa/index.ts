// Edge Function: admin da empresa cria outro ADMINISTRADOR (acesso total).
// Cobradores ganham acesso só pelo convite por link (página Cobradores).
// Usa a service role (disponível no ambiente da função) — nunca exponha no frontend.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

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

// Identifica o chamador pelo token e confirma que é admin da empresa.
// Retorna a empresa do chamador ou uma Response de erro.
async function resolverAdmin(admin: Admin, req: Request): Promise<Response | { companyId: string }> {
  const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
  const { data: callerData, error: callerErr } = await admin.auth.getUser(token);
  if (callerErr || !callerData?.user) return json(401, { error: "Não autenticado" });
  const callerId = callerData.user.id;

  const { data: prof } = await admin
    .from("profiles").select("company_id").eq("user_id", callerId).single();
  const companyId = prof?.company_id as string | null;
  if (!companyId) return json(403, { error: "Chamador não pertence a uma empresa" });

  const { data: roles } = await admin
    .from("user_roles").select("role").eq("user_id", callerId);
  const isAdmin = (roles ?? []).some((r: { role: string }) =>
    r.role === "admin" || r.role === "super_admin");
  if (!isAdmin) return json(403, { error: "Apenas administradores podem criar usuários" });

  return { companyId };
}

// Valida o corpo. Esta função cria SOMENTE administradores: o acesso de um
// cobrador é concedido exclusivamente pelo fluxo de convite (página Cobradores),
// evitando login de cobrador sem carteira (que veria todos os dados da empresa).
function validarEntradaUsuario(body: Record<string, unknown> | null): Response | { email: string; nome: string; senha: string } {
  const email = body?.email as string | undefined;
  const nome = body?.nome as string | undefined;
  const senha = body?.senha as string | undefined;
  if (!email || !nome || !senha) return json(400, { error: "Informe email, nome e senha" });
  if (String(senha).length < 6) return json(400, { error: "A senha deve ter ao menos 6 caracteres" });
  return { email, nome, senha };
}

// Cria a conta (e-mail já confirmado), vincula empresa e papel admin.
async function criarAdmin(admin: Admin, companyId: string, entrada: { email: string; nome: string; senha: string }): Promise<Response> {
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email: entrada.email,
    password: entrada.senha,
    email_confirm: true,
    user_metadata: { nome: entrada.nome },
  });
  if (createErr || !created?.user)
    return json(400, { error: createErr?.message ?? "Falha ao criar usuário" });
  const newUserId = created.user.id;

  // O trigger já criou o profile; aqui apenas vinculamos empresa + papel.
  await admin.from("profiles").update({ company_id: companyId, nome: entrada.nome }).eq("user_id", newUserId);
  const { error: roleErr } = await admin
    .from("user_roles").insert({ user_id: newUserId, company_id: companyId, role: "admin" });
  if (roleErr) return json(400, { error: `Usuário criado, mas falhou ao atribuir papel: ${roleErr.message}` });

  return json(200, { sucesso: true, user_id: newUserId });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "Método não permitido" });

  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

    const auth = await resolverAdmin(admin, req);
    if (auth instanceof Response) return auth;

    const entrada = validarEntradaUsuario(await req.json());
    if (entrada instanceof Response) return entrada;

    return await criarAdmin(admin, auth.companyId, entrada);
  } catch (e) {
    return json(500, { error: String((e as Error)?.message ?? e) });
  }
});
