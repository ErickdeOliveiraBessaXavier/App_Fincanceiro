// Edge Function: admin da empresa cria um usuário (opcionalmente representante).
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "Método não permitido" });

  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

    // 1) Identifica o chamador pelo token
    const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
    const { data: callerData, error: callerErr } = await admin.auth.getUser(token);
    if (callerErr || !callerData?.user) return json(401, { error: "Não autenticado" });
    const callerId = callerData.user.id;

    // 2) Empresa + papel do chamador
    const { data: prof } = await admin
      .from("profiles").select("company_id").eq("user_id", callerId).single();
    const companyId = prof?.company_id as string | null;
    if (!companyId) return json(403, { error: "Chamador não pertence a uma empresa" });

    const { data: roles } = await admin
      .from("user_roles").select("role").eq("user_id", callerId);
    const isAdmin = (roles ?? []).some((r: { role: string }) =>
      r.role === "admin" || r.role === "super_admin");
    if (!isAdmin) return json(403, { error: "Apenas administradores podem criar usuários" });

    // 3) Valida entrada
    const body = await req.json();
    const { email, nome, senha, role, as_representante, representante_id } = body ?? {};
    if (!email || !nome || !senha || !role)
      return json(400, { error: "Informe email, nome, senha e papel" });
    if (!["operador", "financeiro", "leitura", "admin"].includes(role))
      return json(400, { error: "Papel inválido" });
    if (String(senha).length < 6)
      return json(400, { error: "A senha deve ter ao menos 6 caracteres" });

    // 4) Cria o usuário (e-mail já confirmado)
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password: senha,
      email_confirm: true,
      user_metadata: { nome },
    });
    if (createErr || !created?.user)
      return json(400, { error: createErr?.message ?? "Falha ao criar usuário" });
    const newUserId = created.user.id;

    // 5) Vincula empresa + papel (o trigger já criou o profile)
    await admin.from("profiles").update({ company_id: companyId, nome }).eq("user_id", newUserId);
    const { error: roleErr } = await admin
      .from("user_roles").insert({ user_id: newUserId, company_id: companyId, role });
    if (roleErr) return json(400, { error: `Usuário criado, mas falhou ao atribuir papel: ${roleErr.message}` });

    // 6) Representante (carteira)
    if (as_representante) {
      if (representante_id) {
        await admin.from("representantes")
          .update({ user_id: newUserId, email })
          .eq("id", representante_id).eq("company_id", companyId);
      } else {
        await admin.from("representantes")
          .insert({ company_id: companyId, user_id: newUserId, nome, email, created_by: callerId });
      }
    }

    return json(200, { sucesso: true, user_id: newUserId });
  } catch (e) {
    return json(500, { error: String((e as Error)?.message ?? e) });
  }
});
