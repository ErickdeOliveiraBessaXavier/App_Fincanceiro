// Edge Function: admin da empresa exclui um usuário (conta de login).
// Usa a service role (disponível no ambiente da função) — nunca exponha no frontend.
// Apagar a conta de auth faz cascata: profiles e user_roles são removidos (ON DELETE
// CASCADE); cobradores.user_id e convites.used_by viram NULL (ON DELETE SET NULL) —
// ou seja, a carteira do cobrador é preservada, apenas perde o vínculo de acesso.
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
    const { data: callerProf } = await admin
      .from("profiles").select("company_id").eq("user_id", callerId).single();
    const companyId = callerProf?.company_id as string | null;
    if (!companyId) return json(403, { error: "Chamador não pertence a uma empresa" });

    const { data: roles } = await admin
      .from("user_roles").select("role").eq("user_id", callerId);
    const isAdmin = (roles ?? []).some((r: { role: string }) =>
      r.role === "admin" || r.role === "super_admin");
    if (!isAdmin) return json(403, { error: "Apenas administradores podem excluir usuários" });

    // 3) Valida entrada
    const body = await req.json();
    const targetId = String(body?.user_id ?? "");
    if (!targetId) return json(400, { error: "Informe o usuário a excluir" });
    if (targetId === callerId) return json(400, { error: "Você não pode excluir a própria conta" });

    // 4) O alvo precisa pertencer à mesma empresa do admin
    const { data: targetProf } = await admin
      .from("profiles").select("company_id").eq("user_id", targetId).single();
    if (!targetProf || targetProf.company_id !== companyId)
      return json(403, { error: "Usuário não pertence à sua empresa" });

    // 5) Exclui a conta de auth (cascata cuida do resto)
    const { error: delErr } = await admin.auth.admin.deleteUser(targetId);
    if (delErr) return json(400, { error: `Falha ao excluir usuário: ${delErr.message}` });

    return json(200, { sucesso: true });
  } catch (e) {
    return json(500, { error: String((e as Error)?.message ?? e) });
  }
});
