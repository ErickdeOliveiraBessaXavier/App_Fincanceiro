import { describe, it, expect } from 'vitest';
import { rotuloDaRota } from './navegacao';

describe('rotuloDaRota', () => {
  it('nomeia a tela de origem da ficha', () => {
    expect(rotuloDaRota('/relatorios')).toBe('Relatórios');
    expect(rotuloDaRota('/fila')).toBe('Minha fila');
    expect(rotuloDaRota('/clientes')).toBe('Clientes');
  });

  it('ignora query e hash: a origem leva filtros e página junto', () => {
    expect(rotuloDaRota('/relatorios?periodo=2026-09&pagina=2')).toBe('Relatórios');
    expect(rotuloDaRota('/titulos#topo')).toBe('Títulos');
  });

  it('casa subrotas da tela, mas não prefixos soltos', () => {
    expect(rotuloDaRota('/clientes/abc')).toBe('Clientes');
    expect(rotuloDaRota('/clientesX')).toBeNull();
  });

  it('"/" só casa exato — senão toda rota viraria "Resumo executivo"', () => {
    expect(rotuloDaRota('/')).toBe('Resumo executivo');
    expect(rotuloDaRota('/?x=1')).toBe('Resumo executivo');
    expect(rotuloDaRota('/desconhecida')).toBeNull();
  });
});
