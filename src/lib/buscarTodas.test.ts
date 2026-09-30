import { describe, it, expect } from 'vitest';
import { buscarTodas, LINHAS_POR_LOTE } from './buscarTodas';

/** Simula o PostgREST: devolve a fatia pedida, cortada em LINHAS_POR_LOTE. */
function servidorCom(total: number) {
  const chamadas: Array<[number, number]> = [];
  const linhas = Array.from({ length: total }, (_, i) => ({ id: i }));
  const lote = async (de: number, ate: number) => {
    chamadas.push([de, ate]);
    return { data: linhas.slice(de, Math.min(ate + 1, de + LINHAS_POR_LOTE)), error: null };
  };
  return { lote, chamadas };
}

describe('buscarTodas', () => {
  it('traz tudo quando passa do limite do servidor (o caso que truncava)', async () => {
    const { lote, chamadas } = servidorCom(2500);
    const linhas = await buscarTodas(lote);
    expect(linhas).toHaveLength(2500);
    expect(linhas[2499]).toEqual({ id: 2499 });
    expect(chamadas).toEqual([[0, 999], [1000, 1999], [2000, 2999]]);
  });

  it('faz uma chamada só quando cabe num lote', async () => {
    const { lote, chamadas } = servidorCom(40);
    expect(await buscarTodas(lote)).toHaveLength(40);
    expect(chamadas).toHaveLength(1);
  });

  it('múltiplo exato do lote: confirma o fim com um lote vazio', async () => {
    const { lote, chamadas } = servidorCom(2000);
    expect(await buscarTodas(lote)).toHaveLength(2000);
    expect(chamadas).toHaveLength(3);
  });

  it('lista vazia e data nula', async () => {
    expect(await buscarTodas(async () => ({ data: null, error: null }))).toEqual([]);
  });

  it('propaga o erro da consulta', async () => {
    const erro = { message: 'falhou', details: '', hint: '', code: '42501', name: 'PostgrestError' };
    await expect(buscarTodas(async () => ({ data: null, error: erro }))).rejects.toBe(erro);
  });
});
