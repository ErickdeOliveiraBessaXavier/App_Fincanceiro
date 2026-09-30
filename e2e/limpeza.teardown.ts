import { test as teardown } from '@playwright/test';

/**
 * Apaga o que a suíte E2E gravou no banco — roda uma vez, depois de todos os
 * testes (projeto "limpeza", teardown do "setup"), mesmo quando algum falha.
 *
 * Três testes escrevem de verdade na ficha do PLAYWRIGHT_CLIENTE_ID:
 * agendar retorno, registrar evento e registrar resultado. Sem esta limpeza,
 * cada execução deixava ~5 linhas (agendamentos + comunicações) no banco de
 * produção, e a ficha de teste acumulava histórico falso.
 *
 * Tudo o que os testes gravam leva o marcador "via Playwright" no texto; a
 * exclusão exige o marcador E o cliente de teste, e nada fora disso é tocado.
 *
 * Por que o token de gestão e não o usuário de teste: comunicações não têm
 * política de DELETE para ninguém (histórico de contato não se apaga pelo
 * app). O token só existe no .env local; sem ele a limpeza avisa e não faz
 * nada. Nunca é impresso.
 */

const MARCADOR = '%via Playwright%';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function sqlDeLimpeza(clienteId: string): string {
  return `
    with ag as (
      delete from agendamentos
       where cliente_id = '${clienteId}'
         and (descricao ilike '${MARCADOR}' or resultado ilike '${MARCADOR}')
      returning 1
    ), com as (
      delete from comunicacoes
       where cliente_id = '${clienteId}'
         and (mensagem ilike '${MARCADOR}' or resultado ilike '${MARCADOR}')
      returning 1
    )
    select (select count(*) from ag) as agendamentos, (select count(*) from com) as comunicacoes`;
}

teardown('apagar os dados gravados pelos testes', async () => {
  const token = process.env.SUPABASE_ACCESS_TOKEN;
  const projeto = process.env.VITE_SUPABASE_PROJECT_ID;
  const clienteId = process.env.PLAYWRIGHT_CLIENTE_ID ?? '';

  if (!token || !projeto) {
    console.warn('[limpeza] SUPABASE_ACCESS_TOKEN ou VITE_SUPABASE_PROJECT_ID ausente — dados de teste NÃO foram apagados.');
    return;
  }
  // O id entra no SQL: só segue se for um UUID de verdade.
  if (!UUID.test(clienteId)) {
    throw new Error('[limpeza] PLAYWRIGHT_CLIENTE_ID não é um UUID válido.');
  }

  const resposta = await fetch(`https://api.supabase.com/v1/projects/${projeto}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sqlDeLimpeza(clienteId) }),
  });
  if (!resposta.ok) {
    throw new Error(`[limpeza] falhou (HTTP ${resposta.status}): ${await resposta.text()}`);
  }
  const [contagem] = (await resposta.json()) as { agendamentos: number; comunicacoes: number }[];
  console.log(`[limpeza] apagados: ${contagem.agendamentos} agendamentos, ${contagem.comunicacoes} comunicações de teste`);
});
