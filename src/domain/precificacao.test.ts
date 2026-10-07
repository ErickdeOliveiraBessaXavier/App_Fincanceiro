import { describe, it, expect } from 'vitest';
import {
  blocosExcedentes, precoDoLimite, limiteParaCaber, recomendarPlano, faixasDeExemplo, type PlanoPrecificavel,
} from './precificacao';

const plano = (codigo: string, limite: number | null, mensal: number, implantacao: number,
  excedente?: [number, number, number]): PlanoPrecificavel => ({
  codigo, nome: codigo, limite_titulos: limite, valor_mensal: mensal, valor_implantacao: implantacao,
  excedente_bloco_titulos: excedente?.[0] ?? null,
  excedente_valor_mensal: excedente?.[1] ?? 0,
  excedente_valor_implantacao: excedente?.[2] ?? 0,
});

const CATALOGO = [
  plano('trial', 5000, 0, 0),
  plano('basico', 5000, 297, 990),
  plano('essencial', 10000, 497, 1490),
  plano('profissional', 20000, 797, 2490),
  plano('enterprise', 30000, 1197, 3490, [10000, 300, 500]),
  plano('cortesia', null, 0, 0),
];
const ENTERPRISE = CATALOGO[4];

describe('precoDoLimite (mesma conta do banco)', () => {
  it('sem limite personalizado: preço do plano', () => {
    expect(precoDoLimite(ENTERPRISE, null)).toMatchObject({ limite: 30000, blocosExcedentes: 0, mensal: 1197, implantacao: 3490 });
  });

  it('bloco é cobrado inteiro', () => {
    expect(blocosExcedentes(ENTERPRISE, 35000)).toBe(1);
    expect(precoDoLimite(ENTERPRISE, 35000).mensal).toBe(1497);
    expect(precoDoLimite(ENTERPRISE, 50000)).toMatchObject({ mensal: 1797, implantacao: 4490 });
    expect(precoDoLimite(ENTERPRISE, 100000).mensal).toBe(3297);
  });

  it('limite abaixo do plano não dá desconto; plano sem regra não cobra excedente', () => {
    expect(precoDoLimite(ENTERPRISE, 20000).mensal).toBe(1197);
    expect(precoDoLimite(CATALOGO[1], 7000).mensal).toBe(297);
  });

  it('custo por mil', () => {
    expect(precoDoLimite(ENTERPRISE, 100000).custoPorMil).toBeCloseTo(32.97);
    expect(precoDoLimite(CATALOGO[5], null).custoPorMil).toBeNull();
  });
});

describe('recomendarPlano', () => {
  it('menor plano pago que comporta', () => {
    expect(recomendarPlano(CATALOGO, 4000)?.plano.codigo).toBe('basico');
    expect(recomendarPlano(CATALOGO, 10000)?.plano.codigo).toBe('essencial');
    expect(recomendarPlano(CATALOGO, 25000)?.plano.codigo).toBe('enterprise');
  });

  it('acima do Enterprise: limite arredondado ao bloco', () => {
    const r = recomendarPlano(CATALOGO, 42000)!;
    expect(r.plano.codigo).toBe('enterprise');
    expect(r.limitePersonalizado).toBe(50000);
    expect(r.preco.mensal).toBe(1797);
  });

  it('sem plano com regra, nada comporta acima do maior', () => {
    expect(recomendarPlano(CATALOGO.slice(0, 4), 50000)).toBeNull();
  });
});

it('limiteParaCaber e faixas de exemplo', () => {
  expect(limiteParaCaber(ENTERPRISE, 30000)).toBeNull();
  expect(limiteParaCaber(ENTERPRISE, 30001)).toBe(40000);
  expect(faixasDeExemplo(ENTERPRISE)).toEqual([40000, 50000, 80000, 100000]);
  expect(faixasDeExemplo(CATALOGO[1])).toEqual([]);
});
