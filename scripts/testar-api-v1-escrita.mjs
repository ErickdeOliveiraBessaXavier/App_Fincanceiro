#!/usr/bin/env node
// Teste de ponta a ponta das rotas de ESCRITA da API v1: lote, baixa avulsa e
// cancelamento. GRAVA DADOS — use só com a chave de uma EMPRESA DE TESTE.
//
//   node scripts/testar-api-v1-escrita.mjs
//
// Lê do .env.local (nunca imprime a chave):
//   API_V1_CHAVE_TESTE_ESCRITA — chave de uma empresa de teste. É uma variável
//                                separada de propósito: a chave do teste de
//                                leitura pode ser de empresa real.
//
// Cada execução cria 2 títulos novos (API-TESTE-<horário>-A e -B): o A fica
// com um pagamento parcial e o B termina cancelado.

import { readFileSync } from 'node:fs';

const BASE = 'https://cuejrnqdudadlbuiouph.supabase.co/functions/v1/api-v1';

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

let CHAVE = '';
async function chamar(metodo, caminho, corpo) {
  const resposta = await fetch(`${BASE}${caminho}`, {
    method: metodo,
    headers: { Authorization: `Bearer ${CHAVE}`, 'Content-Type': 'application/json' },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });
  return { status: resposta.status, corpo: await resposta.json().catch(() => null) };
}

const codigo = (r) => r.corpo?.erro?.codigo;
const resumo = (r) => `HTTP ${r.status} ${codigo(r) ?? ''} ${r.corpo?.erro?.mensagem ?? ''}`.trim();

// Datas no fuso de Brasília, como o banco (hoje_br).
function diaBr(deslocamento) {
  const d = new Date(Date.now() + deslocamento * 86_400_000);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(d);
}

function titulo(numero, parcelas) {
  return {
    cliente_nome: 'Teste Integracao LTDA',
    cpf_cnpj: '12.345.678/0001-95',
    numero_documento: numero,
    descricao: 'Criado por scripts/testar-api-v1-escrita.mjs',
    parcelas,
  };
}

async function testarLote(docA, docB) {
  const vazio = await chamar('POST', '/titulos/lote', { titulos: [] });
  verificar('lote vazio → 400 titulos_obrigatorios', vazio.status === 400 && codigo(vazio) === 'titulos_obrigatorios');

  const grande = await chamar('POST', '/titulos/lote', { titulos: Array.from({ length: 101 }, () => ({})) });
  verificar('lote com 101 → 400 lote_grande_demais', grande.status === 400 && codigo(grande) === 'lote_grande_demais');

  const r = await chamar('POST', '/titulos/lote', {
    titulos: [
      titulo(docA, [
        { numero: 1, valor: 100, vencimento: diaBr(-10) },
        { numero: 2, valor: 100, vencimento: diaBr(20) },
      ]),
      titulo(docB, [{ numero: 1, valor: 50, vencimento: diaBr(30) }]),
      { numero_documento: 'SEM-CLIENTE' },
    ],
  });
  const itens = r.corpo?.resultados ?? [];
  verificar('lote com 2 bons e 1 ruim → 200, 2 sucesso e 1 erro',
    r.status === 200 && r.corpo?.com_sucesso === 2 && r.corpo?.com_erro === 1, resumo(r));
  verificar('item ruim do lote traz o erro e repetir=false',
    itens[2]?.sucesso === false && itens[2]?.erro?.codigo === 'cliente_nome_obrigatorio' && itens[2]?.repetir === false);
  verificar('itens bons do lote vêm como novos', itens[0]?.novo === true && itens[1]?.novo === true);
}

async function testarPagamento(docA) {
  const rota = `/titulos/${encodeURIComponent(docA)}/parcelas/1/pagamentos`;
  const idPagamento = `PG-${docA}`;
  const pagamento = { id_pagamento: idPagamento, valor: 40, data_pagamento: diaBr(-1), meio_pagamento: 'pix' };

  const sem = await chamar('POST', rota, { valor: 10 });
  verificar('pagamento sem id_pagamento → 400', sem.status === 400 && codigo(sem) === 'id_pagamento_obrigatorio');

  const meio = await chamar('POST', rota, { ...pagamento, meio_pagamento: 'cheque' });
  verificar('meio de pagamento desconhecido → 400 pagamento_invalido', meio.status === 400 && codigo(meio) === 'pagamento_invalido');

  const ok = await chamar('POST', rota, pagamento);
  verificar('pagamento parcial → 200, pagamento_parcial, saldo 60',
    ok.status === 200 && ok.corpo?.repetido === false && ok.corpo?.tipo === 'pagamento_parcial' && Number(ok.corpo?.saldo_atual) === 60,
    resumo(ok));

  const repetido = await chamar('POST', rota, pagamento);
  verificar('mesmo id_pagamento de novo → 200 repetido, sem lançar outra vez',
    repetido.status === 200 && repetido.corpo?.repetido === true && Number(repetido.corpo?.saldo_atual) === 60, resumo(repetido));

  const consulta = await chamar('GET', `/titulos/${encodeURIComponent(docA)}`);
  const p1 = consulta.corpo?.parcelas?.find((p) => p.numero === 1);
  verificar('consulta mostra 40 pagos na parcela 1 (não 80)', Number(p1?.total_pago) === 40, `total_pago=${p1?.total_pago}`);

  const reuso = await chamar('POST', rota, { ...pagamento, valor: 41 });
  verificar('id_pagamento reaproveitado com outro valor → 422', reuso.status === 422 && codigo(reuso) === 'regra_de_negocio');

  const acima = await chamar('POST', rota, { ...pagamento, id_pagamento: `${idPagamento}-2`, valor: 1000 });
  verificar('valor acima do saldo → 422', acima.status === 422, resumo(acima));

  const futura = await chamar('POST', rota, { ...pagamento, id_pagamento: `${idPagamento}-3`, valor: 1, data_pagamento: diaBr(3) });
  verificar('data futura → 422', futura.status === 422, resumo(futura));

  const semParcela = await chamar('POST', `/titulos/${encodeURIComponent(docA)}/parcelas/9/pagamentos`,
    { ...pagamento, id_pagamento: `${idPagamento}-4` });
  verificar('parcela que não existe → 404 parcela_nao_encontrada',
    semParcela.status === 404 && codigo(semParcela) === 'parcela_nao_encontrada');

  const semTitulo = await chamar('POST', '/titulos/NAO-EXISTE-XYZ/parcelas/1/pagamentos',
    { ...pagamento, id_pagamento: `${idPagamento}-5` });
  verificar('título que não existe → 404 titulo_nao_encontrado',
    semTitulo.status === 404 && codigo(semTitulo) === 'titulo_nao_encontrado');
}

async function testarCancelamento(docA, docB) {
  const comPagamento = await chamar('POST', `/titulos/${encodeURIComponent(docA)}/cancelar`, { motivo: 'teste' });
  verificar('cancelar título com pagamento → 422', comPagamento.status === 422, resumo(comPagamento));

  const rota = `/titulos/${encodeURIComponent(docB)}/cancelar`;
  const ok = await chamar('POST', rota, { motivo: 'Nota devolvida (teste)' });
  verificar('cancelar título sem pagamento → 200',
    ok.status === 200 && ok.corpo?.situacao === 'cancelado' && ok.corpo?.ja_estava_cancelado === false, resumo(ok));

  const denovo = await chamar('POST', rota);
  verificar('cancelar de novo (sem corpo) → 200 ja_estava_cancelado',
    denovo.status === 200 && denovo.corpo?.ja_estava_cancelado === true, resumo(denovo));

  const consulta = await chamar('GET', `/titulos/${encodeURIComponent(docB)}`);
  verificar('consulta do cancelado → situacao cancelado', consulta.corpo?.situacao === 'cancelado');

  const inexistente = await chamar('POST', '/titulos/NAO-EXISTE-XYZ/cancelar');
  verificar('cancelar título que não existe → 404', inexistente.status === 404 && codigo(inexistente) === 'titulo_nao_encontrado');
}

async function main() {
  const env = { ...lerEnvLocal(), ...process.env };
  CHAVE = env.API_V1_CHAVE_TESTE_ESCRITA ?? '';
  if (!CHAVE) {
    console.error('Defina API_V1_CHAVE_TESTE_ESCRITA no .env.local (chave de uma EMPRESA DE TESTE: este teste grava dados).');
    process.exit(2);
  }

  const prefixo = `API-TESTE-${Date.now()}`;
  const [docA, docB] = [`${prefixo}-A`, `${prefixo}-B`];
  console.log(`Títulos deste teste: ${docA} e ${docB}\n`);

  await testarLote(docA, docB);
  await testarPagamento(docA);
  await testarCancelamento(docA, docB);

  const falhas = resultados.filter((r) => !r.ok).length;
  console.log(`\n${resultados.length - falhas}/${resultados.length} verificações passaram.`);
  process.exit(falhas === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error('Falha ao rodar o teste:', e.message);
  process.exit(1);
});
