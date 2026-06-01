// Edge Function: cadastro de representante via link de convite (PÚBLICA).
// O representante informa nome/e-mail/senha; aqui validamos o token do convite
// e criamos a conta com a service role. A empresa é definida no servidor a
// partir do convite — o cliente nunca se auto-atribui a um tenant.
// A conta nasce SEM papel: o admin precisa autorizar depois.
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

    const body = await req.json();
    const token = String(body?.token ?? "").trim();
    const nome = String(body?.nome ?? "").trim();
    const email = String(body?.email ?? "").trim().toLowerCase();
    const senha = String(body?.senha ?? "");

    if (!token) return json(400, { error: "Convite não informado" });
    if (nome.length < 2) return json(400, { error: "Informe seu nome" });
    if (!email.includes("@")) return json(400, { error: "E-mail inválido" });
    if (senha.length < 6) return json(400, { error: "A senha deve ter ao menos 6 caracteres" });

    // 1) Valida o convite (pendente e não expirado)
    const { data: convite } = await admin
      .from("convites")
      .select("id, company_id, status, expires_at")
      .eq("token", token)
      .maybeSingle();

    if (!convite || convite.status !== "pendente")
      return json(400, { error: "Convite inválido ou já utilizado" });
    if (new Date(convite.expires_at).getTime() < Date.now())
      return json(400, { error: "Convite expirado. Peça um novo link ao administrador." });

    // 2) Cria o usuário (e-mail já confirmado — o gate de acesso é a autorização do admin)
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password: senha,
      email_confirm: true,
      user_metadata: { nome },
    });
    if (createErr || !created?.user) {
      const msg = createErr?.message ?? "Falha ao criar conta";
      const friendly = /already|exist|registered/i.test(msg)
        ? "Já existe uma conta com este e-mail. Tente entrar ou use outro e-mail."
        : msg;
      return json(400, { error: friendly });
    }
    const newUserId = created.user.id;

    // 3) Vincula à empresa do convite (o trigger on_auth_user_created já criou o profile).
    //    NÃO atribui papel: a conta fica "aguardando autorização" do admin.
    await admin.from("profiles")
      .update({ company_id: convite.company_id, nome })
      .eq("user_id", newUserId);

    // 4) Marca o convite como aguardando aprovação
    await admin.from("convites")
      .update({ status: "aguardando", used_by: newUserId })
      .eq("id", convite.id);

    return json(200, { sucesso: true });
  } catch (e) {
    return json(500, { error: String((e as Error)?.message ?? e) });
  }
});
