// Edge Function: cadastro de cobrador via link de convite (PÚBLICA).
// O cobrador informa nome/e-mail/senha; aqui validamos o token do convite
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

type Admin = ReturnType<typeof createClient>;
interface Entrada { token: string; nome: string; email: string; senha: string; }
interface ConviteRow { id: string; company_id: string; status: string; expires_at: string; }

function lerEntrada(body: Record<string, unknown> | null): Entrada {
  return {
    token: String(body?.token ?? "").trim(),
    nome: String(body?.nome ?? "").trim(),
    email: String(body?.email ?? "").trim().toLowerCase(),
    senha: String(body?.senha ?? ""),
  };
}

function validarEntrada(e: Entrada): Response | null {
  if (!e.token) return json(400, { error: "Convite não informado" });
  if (e.nome.length < 2) return json(400, { error: "Informe seu nome" });
  if (!e.email.includes("@")) return json(400, { error: "E-mail inválido" });
  if (e.senha.length < 6) return json(400, { error: "A senha deve ter ao menos 6 caracteres" });
  return null;
}

// Busca o convite e confirma que está pendente e não expirado.
async function buscarConvite(admin: Admin, token: string): Promise<Response | ConviteRow> {
  const { data: convite } = await admin
    .from("convites")
    .select("id, company_id, status, expires_at")
    .eq("token", token)
    .maybeSingle();

  if (!convite || convite.status !== "pendente")
    return json(400, { error: "Convite inválido ou já utilizado" });
  if (new Date(convite.expires_at).getTime() < Date.now())
    return json(400, { error: "Convite expirado. Peça um novo link ao administrador." });
  return convite as ConviteRow;
}

// Cria o usuário (e-mail já confirmado — o gate de acesso é a autorização do admin).
async function criarConta(admin: Admin, e: Entrada): Promise<Response | { userId: string }> {
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email: e.email,
    password: e.senha,
    email_confirm: true,
    user_metadata: { nome: e.nome },
  });
  if (createErr || !created?.user) {
    const msg = createErr?.message ?? "Falha ao criar conta";
    const friendly = /already|exist|registered/i.test(msg)
      ? "Já existe uma conta com este e-mail. Tente entrar ou use outro e-mail."
      : msg;
    return json(400, { error: friendly });
  }
  return { userId: created.user.id };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "Método não permitido" });

  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

    const entrada = lerEntrada(await req.json());
    const erroEntrada = validarEntrada(entrada);
    if (erroEntrada) return erroEntrada;

    const convite = await buscarConvite(admin, entrada.token);
    if (convite instanceof Response) return convite;

    const conta = await criarConta(admin, entrada);
    if (conta instanceof Response) return conta;

    // Vincula à empresa do convite (o trigger on_auth_user_created já criou o profile).
    // NÃO atribui papel: a conta fica "aguardando autorização" do admin.
    await admin.from("profiles")
      .update({ company_id: convite.company_id, nome: entrada.nome })
      .eq("user_id", conta.userId);

    // Marca o convite como aguardando aprovação.
    await admin.from("convites")
      .update({ status: "aguardando", used_by: conta.userId })
      .eq("id", convite.id);

    return json(200, { sucesso: true });
  } catch (e) {
    return json(500, { error: String((e as Error)?.message ?? e) });
  }
});
