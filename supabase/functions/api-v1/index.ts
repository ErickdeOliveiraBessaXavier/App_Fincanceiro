// Edge Function: API pública v1 — porta de entrada do ERP do cliente.
//
// O cliente NUNCA recebe acesso ao banco. Ele chama estas rotas com uma chave
// de API por empresa; a chave é quem diz de qual empresa é a requisição. O
// `company_id` jamais vem do corpo — vem sempre da chave resolvida.
//
// Rotas (base: /functions/v1/api-v1):
//   POST /titulos                      -> cria ou atualiza um título (idempotente)
//   GET  /titulos                      -> lista títulos com saldo e situação
//   GET  /titulos/:numero_documento    -> um título com as parcelas
//
// A versão está no NOME da função: uma v2 futura vira `api-v2` e esta continua
// no ar sem alteração, que é o que permite prometer estabilidade ao cliente.
//
// Chamada sem JWT (verify_jwt = false no config.toml): a segurança vem da
// chave de API, no mesmo espírito de `registrar-convite`.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { buscarTodas } from "../_shared/buscarTodas.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

// O tipo sai do cliente criado de verdade: `ReturnType<typeof createClient>`
// pegava a versão genérica "vazia" e todo `rpc(...)` parecia não aceitar
// argumentos (erros de tipo que o deploy ignorava).
const novoAdmin = () =>
  createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
type Admin = ReturnType<typeof novoAdmin>;
type Contexto = { companyId: string; actorId: string };

const LIMITE_PADRAO = 50;
const LIMITE_MAXIMO = 200;

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Forma estável de erro: o ERP do cliente vai programar em cima disto, então
// `codigo` é contrato e não pode mudar de nome depois.
function erro(status: number, codigo: string, mensagem: string) {
  return json(status, { erro: { codigo, mensagem } });
}

// ===================== Autenticação por chave =====================

async function sha256Hex(valor: string): Promise<string> {
  const bytes = new TextEncoder().encode(valor);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// Resolve a chave do cabeçalho em empresa + ator. Devolve uma Response de erro
// quando a chave está ausente, é inválida ou foi revogada.
async function autenticar(admin: Admin, req: Request): Promise<Response | Contexto> {
  const bruto = req.headers.get("Authorization") ?? "";
  const chave = bruto.replace(/^Bearer\s+/i, "").trim();
  if (!chave) return erro(401, "chave_ausente", "Informe a chave de API no cabeçalho Authorization.");

  const { data, error } = await admin.rpc("resolver_chave_api", { p_hash: await sha256Hex(chave) });
  if (error) return erro(500, "falha_autenticacao", "Não foi possível validar a chave de API.");
  // A chave também deixa de valer com a empresa suspensa ou com o prazo do
  // plano vencido (resolver_chave_api devolve null nos dois casos).
  if (!data) {
    return erro(401, "chave_invalida",
      "Chave de API inválida ou revogada, ou empresa sem acesso (suspensa ou com o plano vencido).");
  }

  const resolvido = data as { company_id: string; actor_id: string };
  return { companyId: resolvido.company_id, actorId: resolvido.actor_id };
}

// ===================== Ingestão =====================

type ParcelaEntrada = { numero: number; valor: number; vencimento: string; pago?: boolean };

function parcelaInvalida(p: ParcelaEntrada): boolean {
  return !Number.isInteger(p?.numero) || p.numero < 1 ||
    typeof p?.valor !== "number" || !(p.valor > 0) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(String(p?.vencimento ?? ""));
}

type TituloEntrada = {
  cliente_nome: string;
  cpf_cnpj: string;
  numero_documento: string;
  parcelas: ParcelaEntrada[];
  contato?: string; descricao?: string; cobrador?: string;
  vendedor?: string; cidade?: string; estado?: string;
};

// Campo, código do erro e o que dizer. Em tabela em vez de uma escada de ifs:
// acrescentar um obrigatório vira uma linha, não mais um desvio.
const TEXTOS_OBRIGATORIOS: Array<[keyof TituloEntrada, string, string]> = [
  ["cliente_nome", "cliente_nome_obrigatorio", "Informe cliente_nome."],
  ["cpf_cnpj", "cpf_cnpj_obrigatorio", "Informe cpf_cnpj do cliente."],
  ["numero_documento", "numero_documento_obrigatorio",
    "Informe numero_documento: é ele que identifica o título no reenvio."],
];

function textoObrigatorioFaltando(t: TituloEntrada): Response | null {
  for (const [campo, codigo, mensagem] of TEXTOS_OBRIGATORIOS) {
    if (!String(t[campo] ?? "").trim()) return erro(400, codigo, mensagem);
  }
  return null;
}

// Valida a forma do corpo. As regras de negócio (CPF/CNPJ com dígito verificador, valor
// positivo, título sem parcelas) continuam no banco — aqui só evitamos ida ao
// Postgres com um corpo obviamente malformado, e damos uma mensagem melhor.
function validarTitulo(body: unknown): Response | TituloEntrada {
  const t = body as TituloEntrada | null;
  if (!t || typeof t !== "object") return erro(400, "corpo_invalido", "Envie um objeto JSON com o título.");

  const faltando = textoObrigatorioFaltando(t);
  if (faltando) return faltando;

  if (!Array.isArray(t.parcelas) || t.parcelas.length === 0) {
    return erro(400, "parcelas_obrigatorias", "Informe ao menos uma parcela.");
  }
  if (t.parcelas.some(parcelaInvalida)) {
    return erro(400, "parcela_invalida",
      "Cada parcela precisa de numero (inteiro >= 1), valor (> 0) e vencimento no formato AAAA-MM-DD.");
  }
  return t;
}

// Traduz uma exceção do Postgres em resposta. Regras de negócio viram 422 (o
// pedido chegou bem formado, mas o conteúdo não passa na regra). O limite do
// plano tem código próprio: o ERP precisa distinguir "pare de enviar títulos
// novos" de um título com dado errado.
function erroDoBanco(e: { message: string; hint?: string | null }): Response {
  if (e.hint === "limite_do_plano") return erro(422, "limite_do_plano", e.message);
  return erro(422, "regra_de_negocio", e.message);
}

async function postTitulos(admin: Admin, ctx: Contexto, body: unknown): Promise<Response> {
  const entrada = validarTitulo(body);
  if (entrada instanceof Response) return entrada;

  const { data, error } = await admin.rpc("_importar_titulo_completo", {
    p_company: ctx.companyId,
    p_actor: ctx.actorId,
    p_cliente_nome: entrada.cliente_nome,
    p_cpf_cnpj: entrada.cpf_cnpj,
    p_numero_documento: entrada.numero_documento,
    p_parcelas: entrada.parcelas,
    p_contato: entrada.contato ?? null,
    p_descricao: entrada.descricao ?? null,
    p_cobrador: entrada.cobrador ?? null,
    p_vendedor: entrada.vendedor ?? null,
    p_cidade: entrada.cidade ?? null,
    p_estado: entrada.estado ?? null,
    p_origem: "API",
  });
  if (error) return erroDoBanco(error);

  // A consolidação de saldos é materializada; sem isto uma consulta logo após a
  // gravação devolveria o estado anterior. A tela de importação faz o mesmo.
  await admin.rpc("refresh_mv_parcelas");

  return json(200, data);
}

// ===================== Consulta =====================

type LinhaMv = {
  titulo_id: string; numero_parcela: number; valor_nominal: number; vencimento: string;
  juros: number; multa: number; descontos: number; total_pago: number;
  saldo_atual: number; status: string; data_ultimo_pagamento: string | null;
  renegociada: boolean;
};

// Acordo é novação: criar o acordo zera o saldo das parcelas do título, e pelo
// saldo elas seriam "pago". Até 2026-10-01 a API entregava assim — o ERP via
// como quitado um título cuja dívida só tinha mudado para o acordo (inclusive
// acordo QUEBRADO). Mesma classificação das telas (classificarTitulo).
const SITUACAO_POR_ACORDO: Record<string, string> = {
  ativo: "em_acordo",
  quebrado: "acordo_quebrado",
  cumprido: "acordo_cumprido",
};

// Situação do título: o acordo, quando houver, manda; senão, as parcelas —
// quitado quando não há saldo, vencido quando alguma parcela em aberto já
// passou do vencimento.
//
// Sem parcelas não dá para afirmar nada — e `every` sobre lista vazia é
// verdadeiro, o que faria um título sem consolidação ser reportado como pago.
function situacaoDoTitulo(parcelas: LinhaMv[], acordoStatus?: string): string {
  const porAcordo = acordoStatus ? SITUACAO_POR_ACORDO[acordoStatus] : undefined;
  if (porAcordo) return porAcordo;
  if (parcelas.length === 0) return "indefinida";
  if (parcelas.every((p) => p.status === "pago")) return "pago";
  if (parcelas.some((p) => p.status === "vencido")) return "vencido";
  return "a_vencer";
}

function somar(parcelas: LinhaMv[], campo: keyof LinhaMv): number {
  const total = parcelas.reduce((acc, p) => acc + Number(p[campo] ?? 0), 0);
  return Math.round(total * 100) / 100;
}

// Uma página de até LIMITE_MAXIMO títulos passa fácil de 1.000 parcelas: sem
// buscar em lotes, o PostgREST cortava a resposta e o ERP recebia título com
// parcela faltando. Erro de consulta agora sobe (antes virava lista vazia).
async function parcelasDe(admin: Admin, companyId: string, tituloIds: string[]): Promise<LinhaMv[]> {
  if (tituloIds.length === 0) return [];
  const linhas = await buscarTodas((de, ate) =>
    admin
      // Status calculado na leitura (fuso de Brasília + próximo dia útil); o da
      // MV é gravado no refresh e fica parado entre operações.
      .from("_vw_parcelas_status")
      .select("titulo_id, numero_parcela, valor_nominal, vencimento, juros, multa, descontos, total_pago, saldo_atual, status, data_ultimo_pagamento, renegociada")
      .eq("company_id", companyId)
      .in("titulo_id", tituloIds)
      .order("numero_parcela")
      .order("id")
      .range(de, ate)
  );
  return linhas as LinhaMv[];
}

type AcordoDoTitulo = { status: string; created_at: string };
type LinhaAcordoTitulo = { titulo_id: string; acordos: AcordoDoTitulo };

// Mesma precedência da vw_titulos_completos: acordo vigente (ativo/quebrado)
// antes de encerrado; entre iguais, o mais recente.
const ACORDO_VIGENTE = new Set(["ativo", "quebrado"]);
function prevalece(novo: AcordoDoTitulo, atual: AcordoDoTitulo): boolean {
  const novoVigente = ACORDO_VIGENTE.has(novo.status);
  if (novoVigente !== ACORDO_VIGENTE.has(atual.status)) return novoVigente;
  return novo.created_at > atual.created_at;
}

// Estado do acordo não cancelado de cada título (cancelado estorna a novação e
// o título volta a valer pelo próprio saldo).
async function acordosDe(admin: Admin, companyId: string, tituloIds: string[]): Promise<Map<string, string>> {
  if (tituloIds.length === 0) return new Map();
  const linhas = await buscarTodas((de, ate) =>
    admin
      .from("acordo_titulos")
      .select("titulo_id, acordos!inner(status, created_at)")
      .eq("company_id", companyId)
      .in("titulo_id", tituloIds)
      .neq("acordos.status", "cancelado")
      .order("id")
      .range(de, ate)
  // Sem o schema tipado, o embed é inferido como lista; acordo_id → acordos(id)
  // é muitos-para-um e o PostgREST devolve objeto.
  ) as unknown as LinhaAcordoTitulo[];

  const escolhido = new Map<string, AcordoDoTitulo>();
  for (const linha of linhas) {
    const atual = escolhido.get(linha.titulo_id);
    if (!atual || prevalece(linha.acordos, atual)) escolhido.set(linha.titulo_id, linha.acordos);
  }
  return new Map([...escolhido].map(([tituloId, acordo]) => [tituloId, acordo.status]));
}

type LinhaTitulo = {
  id: string; numero_documento: string; valor_original: number; vencimento_original: string;
  descricao: string | null; status: string; created_at: string; updated_at: string;
  clientes: { nome: string; cpf_cnpj: string; telefone: string | null } | null;
};

// `atualizado_em` é a última mudança REAL do título (envio, pagamento, estorno,
// encargo, desconto, acordo), não só `titulos.updated_at` — que não muda quando
// alguém paga ou quando o acordo quebra.
function resumoDoTitulo(t: LinhaTitulo, parcelas: LinhaMv[], acordoStatus?: string, ultimaMudanca?: string) {
  return {
    numero_documento: t.numero_documento,
    situacao: t.status === "cancelado" ? "cancelado" : situacaoDoTitulo(parcelas, acordoStatus),
    cliente: {
      nome: t.clientes?.nome ?? null,
      cpf_cnpj: t.clientes?.cpf_cnpj ?? null,
      telefone: t.clientes?.telefone ?? null,
    },
    valor_original: Number(t.valor_original),
    vencimento_original: t.vencimento_original,
    descricao: t.descricao,
    total_pago: somar(parcelas, "total_pago"),
    saldo_atual: somar(parcelas, "saldo_atual"),
    atualizado_em: ultimaMudanca ?? t.updated_at,
  };
}

type Alteracao = { titulo_id: string; ultima_mudanca: string };
type FiltroAlterados = { desde: string | null; incluirCancelados: boolean; limite: number; offset: number };

// Títulos por última mudança real, já filtrados e paginados no banco.
// Ver migration 20261001140000 (_api_titulos_alterados).
async function titulosAlterados(
  admin: Admin, companyId: string, filtro: FiltroAlterados, tituloId?: string,
): Promise<Alteracao[]> {
  const { data, error } = await admin.rpc("_api_titulos_alterados", {
    p_company: companyId,
    p_desde: filtro.desde,
    p_incluir_cancelados: filtro.incluirCancelados,
    p_limite: filtro.limite,
    p_offset: filtro.offset,
    p_titulo: tituloId ?? null,
  });
  if (error) throw new Error(error.message);
  return (data ?? []) as Alteracao[];
}

function detalheDaParcela(p: LinhaMv) {
  return {
    numero: p.numero_parcela,
    valor_nominal: Number(p.valor_nominal),
    vencimento: p.vencimento,
    juros: Number(p.juros),
    multa: Number(p.multa),
    descontos: Number(p.descontos),
    total_pago: Number(p.total_pago),
    saldo_atual: Number(p.saldo_atual),
    // Liquidada por acordo: saldo zero, mas não foi paga.
    situacao: p.renegociada ? "renegociado" : p.status,
    ultimo_pagamento_em: p.data_ultimo_pagamento,
  };
}

const CAMPOS_TITULO =
  "id, numero_documento, valor_original, vencimento_original, descricao, status, created_at, updated_at, clientes(nome, cpf_cnpj, telefone)";

async function getTitulo(admin: Admin, ctx: Contexto, numeroDocumento: string): Promise<Response> {
  // Cancelar um título marca `deleted_at`, mas ele NÃO pode sumir daqui: o ERP
  // precisa saber que a cobrança foi cancelada, senão mantém a dívida aberta
  // para sempre. Um número cancelado e um ativo podem coexistir (o índice único
  // ignora cancelados), então o ativo vem primeiro.
  const { data } = await admin
    .from("titulos").select(CAMPOS_TITULO)
    .eq("company_id", ctx.companyId)
    .eq("numero_documento", numeroDocumento)
    .order("deleted_at", { ascending: true, nullsFirst: true })
    .limit(1);

  const encontrado = (data ?? [])[0];
  if (!encontrado) return erro(404, "titulo_nao_encontrado", `Nenhum título com numero_documento ${numeroDocumento}.`);

  const titulo = encontrado as unknown as LinhaTitulo;
  const umTitulo = { desde: null, incluirCancelados: true, limite: 1, offset: 0 };
  const [parcelas, acordos, alteracao] = await Promise.all([
    parcelasDe(admin, ctx.companyId, [titulo.id]),
    acordosDe(admin, ctx.companyId, [titulo.id]),
    titulosAlterados(admin, ctx.companyId, umTitulo, titulo.id),
  ]);
  return json(200, {
    ...resumoDoTitulo(titulo, parcelas, acordos.get(titulo.id), alteracao[0]?.ultima_mudanca),
    parcelas: parcelas.map(detalheDaParcela),
  });
}

async function titulosPorId(admin: Admin, companyId: string, ids: string[]): Promise<Map<string, LinhaTitulo>> {
  if (ids.length === 0) return new Map();
  const { data, error } = await admin
    .from("titulos").select(CAMPOS_TITULO)
    .eq("company_id", companyId)
    .in("id", ids);
  if (error) throw new Error(error.message);
  const titulos = (data ?? []) as unknown as LinhaTitulo[];
  return new Map(titulos.map((t) => [t.id, t]));
}

function paginacao(url: URL): { limite: number; offset: number } {
  const limite = Math.min(Number(url.searchParams.get("limite")) || LIMITE_PADRAO, LIMITE_MAXIMO);
  const offset = Math.max(Number(url.searchParams.get("offset")) || 0, 0);
  return { limite, offset };
}

async function getTitulos(admin: Admin, ctx: Contexto, url: URL): Promise<Response> {
  const { limite, offset } = paginacao(url);

  // Filtro pensado para sincronização incremental: o ERP guarda o horário da
  // última consulta e pede só o que mudou desde então. Antes comparava só
  // `titulos.updated_at` e não via pagamento nem acordo.
  const desde = url.searchParams.get("atualizado_apos");
  if (desde && Number.isNaN(Date.parse(desde))) {
    return erro(400, "parametro_invalido", "atualizado_apos deve ser uma data/hora ISO, ex.: 2026-10-01T00:00:00Z.");
  }

  // Cancelados ficam de fora por padrão. Quem sincroniza de forma incremental
  // precisa deles: é como o ERP descobre que uma cobrança foi encerrada aqui.
  // Ordem: última mudança desc, desempate por id (ordem total entre páginas).
  let alterados: Alteracao[];
  try {
    alterados = await titulosAlterados(admin, ctx.companyId, {
      desde,
      incluirCancelados: url.searchParams.get("incluir_cancelados") === "true",
      limite,
      offset,
    });
  } catch {
    return erro(500, "falha_consulta", "Não foi possível listar os títulos.");
  }

  const ids = alterados.map((a) => a.titulo_id);
  const [titulos, parcelas, acordos] = await Promise.all([
    titulosPorId(admin, ctx.companyId, ids),
    parcelasDe(admin, ctx.companyId, ids),
    acordosDe(admin, ctx.companyId, ids),
  ]);
  const porTitulo = (id: string) => parcelas.filter((p) => p.titulo_id === id);

  return json(200, {
    // Na ordem que o banco decidiu; título que sumiu entre as duas leituras sai.
    titulos: alterados
      .filter((a) => titulos.has(a.titulo_id))
      .map((a) => resumoDoTitulo(
        titulos.get(a.titulo_id)!, porTitulo(a.titulo_id), acordos.get(a.titulo_id), a.ultima_mudanca,
      )),
    limite,
    offset,
  });
}

// ===================== Roteamento =====================

// A função é servida em /<nome-da-funcao>/<rota>; aqui ficam só os segmentos
// da rota, sem o nome da função.
function segmentosDaRota(url: URL): string[] {
  const partes = url.pathname.split("/").filter(Boolean);
  const inicio = partes.indexOf("api-v1");
  return inicio === -1 ? partes : partes.slice(inicio + 1);
}

async function rotearGet(admin: Admin, ctx: Contexto, url: URL, rota: string[]): Promise<Response> {
  if (rota.length === 1) return await getTitulos(admin, ctx, url);
  if (rota.length === 2) return await getTitulo(admin, ctx, decodeURIComponent(rota[1]));
  return erro(404, "rota_desconhecida", "Rota não encontrada.");
}

async function rotear(admin: Admin, ctx: Contexto, req: Request): Promise<Response> {
  const url = new URL(req.url);
  const rota = segmentosDaRota(url);

  if (rota[0] !== "titulos") {
    return erro(404, "rota_desconhecida", "Rota não encontrada. Rotas disponíveis: /titulos.");
  }
  if (req.method === "GET") return await rotearGet(admin, ctx, url, rota);
  if (req.method === "POST" && rota.length === 1) return await postTitulos(admin, ctx, await req.json());
  return erro(405, "metodo_nao_permitido", `Método ${req.method} não permitido nesta rota.`);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const admin = novoAdmin();

    const ctx = await autenticar(admin, req);
    if (ctx instanceof Response) return ctx;

    return await rotear(admin, ctx, req);
  } catch (e) {
    return erro(500, "erro_interno", String((e as Error)?.message ?? e));
  }
});
