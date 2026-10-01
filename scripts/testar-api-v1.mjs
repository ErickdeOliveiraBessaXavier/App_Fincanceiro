#!/usr/bin/env node
// Teste de ponta a ponta da API v1 (api-v1), contra produção. SÓ LEITURA:
// nenhum título é criado ou alterado.
//
// Rode antes de entregar uma chave a um cliente:
//
//   node scripts/testar-api-v1.mjs
//
// Lê do .env.local (nunca imprime as chaves):
//   API_V1_CHAVE                — chave de uma empresa COM títulos
//   API_V1_CHAVE_OUTRA_EMPRESA  — (opcional) chave de OUTRA empresa, para o
//                                 teste de isolamento
//
// Gere as chaves na tela Plataforma (super admin) e revogue depois do teste.

import { readFileSync } from 'node:fs';

const BASE = 'https://cuejrnqdudadlbuiouph.supabase.co/functions/v1/api-v1';

const SITUACOES_TITULO = new Set([
  'a_vencer', 'vencido', 'pago', 'em_acordo', 'acordo_quebrado', 'acordo_cumprido', 'cancelado', 'indefinida',
]);
const SITUACOES_PARCELA = new Set(['a_vencer', 'vencido', 'pago', 'renegociado']);
const EM_ACORDO = new Set(['em_acordo', 'acordo_quebrado', 'acordo_cumprido']);

function lerEnvLocal() {
  try {
    const linhas = readFileSync('.env.local', 'utf8').split(/\r?\n/);
    return Object.fromEntries(
      linhas
        .filter((l) => /^[A-Z0-9_]+=/.test(l))
        .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).replace(/^["']|["']$/g, '').trim()]),
    );
  } catch {
    return {};
  }
}

const resultados = [];
function verificar(nome, ok, detalhe = '') {
  resultados.push({ nome, ok });
  console.log(`${ok ? '✔' : '✘'} ${nome}${detalhe ? ` — ${detalhe}` : ''}`);
}

async function chamar(caminho, chave) {
  const headers = chave ? { Authorization: `Bearer ${chave}` } : {};
  const resposta = await fetch(`${BASE}${caminho}`, { headers });
  const corpo = await resposta.json().catch(() => null);
  return { status: resposta.status, corpo };
}

async function testarAutenticacao() {
  const semChave = await chamar('/titulos');
  verificar('sem chave → 401 chave_ausente', semChave.status === 401 && semChave.corpo?.erro?.codigo === 'chave_ausente');

  const invalida = await chamar('/titulos', 'erp_live_chave_que_nao_existe');
  verificar('chave inválida → 401 chave_invalida', invalida.status === 401 && invalida.corpo?.erro?.codigo === 'chave_invalida');
}

async function testarListagem(chave) {
  const { status, corpo } = await chamar('/titulos?limite=200', chave);
  const titulos = corpo?.titulos ?? [];
  verificar('lista → 200 com títulos', status === 200 && titulos.length > 0, `${titulos.length} título(s)`);

  const foraDoContrato = titulos.filter((t) => !SITUACOES_TITULO.has(t.situacao));
  verificar('toda situação de título é um valor documentado', foraDoContrato.length === 0,
    foraDoContrato.map((t) => t.situacao).join(', '));

  const ordenada = titulos.every((t, i) => i === 0 || titulos[i - 1].atualizado_em >= t.atualizado_em);
  verificar('lista vem da mudança mais recente para a mais antiga', ordenada);
  return titulos;
}

async function testarSincronizacao(chave, titulos) {
  const invalida = await chamar('/titulos?atualizado_apos=ontem', chave);
  verificar('atualizado_apos inválido → 400 parametro_invalido',
    invalida.status === 400 && invalida.corpo?.erro?.codigo === 'parametro_invalido');

  // Corte no meio da lista: tem que vir exatamente quem mudou depois dele.
  const corte = titulos[Math.floor(titulos.length / 2)]?.atualizado_em;
  if (!corte) return;
  const { corpo } = await chamar(`/titulos?limite=200&atualizado_apos=${encodeURIComponent(corte)}`, chave);
  const recebidos = corpo?.titulos ?? [];
  const esperados = titulos.filter((t) => t.atualizado_em > corte).length;
  verificar('atualizado_apos traz só (e todos) os que mudaram depois do corte',
    recebidos.length === esperados && recebidos.every((t) => t.atualizado_em > corte),
    `${recebidos.length} recebido(s), ${esperados} esperado(s)`);
}

async function testarPaginacao(chave) {
  const [p1, p2] = await Promise.all([
    chamar('/titulos?limite=2&offset=0', chave),
    chamar('/titulos?limite=2&offset=2', chave),
  ]);
  const docs1 = (p1.corpo?.titulos ?? []).map((t) => t.numero_documento);
  const docs2 = (p2.corpo?.titulos ?? []).map((t) => t.numero_documento);
  verificar('páginas não repetem título', docs2.every((d) => !docs1.includes(d)));
}

// Título em acordo: saldo zero, mas a situação diz acordo e as parcelas dizem
// "renegociado" — nunca "pago".
async function testarTituloEmAcordo(chave, titulos) {
  const emAcordo = titulos.find((t) => t.situacao === 'acordo_quebrado') ?? titulos.find((t) => EM_ACORDO.has(t.situacao));
  if (!emAcordo) {
    verificar('título em acordo (pulado: nenhum na empresa)', true);
    return;
  }
  const { status, corpo } = await chamar(`/titulos/${encodeURIComponent(emAcordo.numero_documento)}`, chave);
  const parcelas = corpo?.parcelas ?? [];
  verificar(`consulta de título ${emAcordo.situacao} → 200`, status === 200 && corpo?.situacao === emAcordo.situacao);
  verificar('parcelas do título em acordo saem "renegociado"', parcelas.length > 0 && parcelas.every((p) => p.situacao === 'renegociado'),
    parcelas.map((p) => p.situacao).join(', '));
  verificar('toda situação de parcela é um valor documentado', parcelas.every((p) => SITUACOES_PARCELA.has(p.situacao)));
}

async function testarIsolamento(chaveOutra, titulos) {
  if (!chaveOutra) {
    console.log('… isolamento entre empresas: pulado (defina API_V1_CHAVE_OUTRA_EMPRESA)');
    return;
  }
  const alvo = titulos[0].numero_documento;
  const direto = await chamar(`/titulos/${encodeURIComponent(alvo)}`, chaveOutra);
  verificar('outra empresa consultando título alheio → 404', direto.status === 404);

  const lista = await chamar('/titulos?limite=200&incluir_cancelados=true', chaveOutra);
  const docsAlheios = new Set(titulos.map((t) => t.numero_documento));
  const vazou = (lista.corpo?.titulos ?? []).filter((t) => docsAlheios.has(t.numero_documento));
  verificar('lista da outra empresa não traz nenhum título alheio', lista.status === 200 && vazou.length === 0);
}

async function main() {
  const env = { ...lerEnvLocal(), ...process.env };
  if (!env.API_V1_CHAVE) {
    console.error('Defina API_V1_CHAVE no .env.local (chave de uma empresa com títulos).');
    process.exit(2);
  }

  await testarAutenticacao();
  const titulos = await testarListagem(env.API_V1_CHAVE);
  if (titulos.length > 0) {
    await testarSincronizacao(env.API_V1_CHAVE, titulos);
    await testarPaginacao(env.API_V1_CHAVE);
    await testarTituloEmAcordo(env.API_V1_CHAVE, titulos);
    await testarIsolamento(env.API_V1_CHAVE_OUTRA_EMPRESA, titulos);
  }

  const falhas = resultados.filter((r) => !r.ok).length;
  console.log(`\n${resultados.length - falhas}/${resultados.length} verificações passaram.`);
  process.exit(falhas === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error('Falha ao rodar o teste:', e.message);
  process.exit(1);
});
