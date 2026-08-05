import { describe, it, expect } from 'vitest';
import { descontoPercentual, resumoNegociacao } from './negociacao';

describe('resumoNegociacao', () => {
  it('identifica desconto', () => {
    expect(resumoNegociacao(1000, 800)).toEqual({ tipo: 'desconto', valor: 200, percentual: 20 });
  });

  it('identifica acréscimo quando o acordo fecha acima do débito', () => {
    // Caso real: débito de 14.400,24 negociado por 15.600,00.
    const resumo = resumoNegociacao(14400.24, 15600);
    expect(resumo.tipo).toBe('acrescimo');
    expect(resumo.valor).toBeCloseTo(1199.76, 2);
    expect(resumo.percentual).toBeCloseTo(8.33, 2);
  });

  it('trata valores iguais como neutro', () => {
    expect(resumoNegociacao(1000, 1000)).toEqual({ tipo: 'neutro', valor: 0, percentual: 0 });
  });

  it('ignora diferença abaixo de meio centavo', () => {
    expect(resumoNegociacao(1000, 1000.004).tipo).toBe('neutro');
  });

  it('não divide por zero quando não há valor original', () => {
    expect(resumoNegociacao(0, 500)).toEqual({ tipo: 'acrescimo', valor: 500, percentual: 0 });
  });
});

describe('descontoPercentual', () => {
  it('devolve o percentual quando há desconto', () => {
    expect(descontoPercentual(1000, 750)).toBe(25);
  });

  // O banco recusa desconto fora de 0..100 (acordos_desconto_check) — era a
  // origem do HTTP 400 ao salvar acordo acima do débito.
  it('devolve 0 quando o acordo fecha acima do débito', () => {
    expect(descontoPercentual(14400.24, 15600)).toBe(0);
  });

  it('devolve 0 sem valor original, em vez de NaN', () => {
    expect(descontoPercentual(0, 500)).toBe(0);
  });

  it('nunca passa de 100', () => {
    expect(descontoPercentual(1000, 0)).toBe(100);
  });

  it('mantém o resultado dentro do domínio aceito pelo banco', () => {
    const casos: Array<[number, number]> = [[1000, 800], [1000, 1200], [0, 0], [14400.24, 15600]];
    for (const [original, acordo] of casos) {
      const pct = descontoPercentual(original, acordo);
      expect(pct).toBeGreaterThanOrEqual(0);
      expect(pct).toBeLessThanOrEqual(100);
    }
  });
});
