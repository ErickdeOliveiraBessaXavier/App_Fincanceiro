// Edge Function: super admin descarta um cadastro que nunca virou empresa.
//
// São contas que se cadastraram e abandonaram no meio: ficam sem empresa e sem
// papel, e sem isto acumulam para sempre no painel da Plataforma, escondendo o
// caso seguinte que realmente precisa de atenção.
//
// A trava importante: quem decide se a conta é descartável é o banco, via
// `cadastro_incompleto_descartavel`. Se a conta tiver ganhado empresa, papel ou
// virado ator de uma chave de API entre a tela carregar e o clique, a exclusão
// é recusada. Não existe caminho aqui para apagar um usuário de verdade.
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

async function exigirSuperAdmin(admin: Admin, req: Request): Promise<Response | { callerId: string }> {
  const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
  const { data: caller, error } = await admin.auth.getUser(token);
  if (error || !caller?.user) return json(401, { error: "Não autenticado" });

  const { data: roles } = await admin
    .from("user_roles").select("role").eq("user_id", caller.user.id);
  const isSuper = (roles ?? []).some((r: { role: string }) => r.role === "super_admin");
  if (!isSuper) return json(403, { error: "Operação restrita ao super admin" });

  return { callerId: caller.user.id };
}

async function descartar(admin: Admin, callerId: string, body: Record<string, unknown> | null): Promise<Response> {
  const alvo = String(body?.user_id ?? "");
  if (!alvo) return json(400, { error: "Informe o cadastro a excluir" });
  if (alvo === callerId) return json(400, { error: "Você não pode excluir a própria conta" });

  const { data: descartavel, error: checkErr } = await admin
    .rpc("cadastro_incompleto_descartavel", { p_user_id: alvo });
  if (checkErr) return json(500, { error: "Não foi possível validar o cadastro" });
  if (!descartavel) {
    return json(409, {
      error: "Este cadastro não está mais incompleto — recarregue a página antes de excluir.",
    });
  }

  // A cascata do banco remove profile e vínculos junto com a conta de auth.
  const { error: delErr } = await admin.auth.admin.deleteUser(alvo);
  if (delErr) return json(400, { error: `Falha ao excluir: ${delErr.message}` });

  return json(200, { sucesso: true });
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

    return await descartar(admin, caller.callerId, await req.json());
  } catch (e) {
    return json(500, { error: String((e as Error)?.message ?? e) });
  }
});
