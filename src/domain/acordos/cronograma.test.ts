import { describe, it, expect } from 'vitest';
import {
  somarMesesAncorado, gerarCronograma, podarDatasManuais, totalCronograma, emCentavos,
} from './cronograma';

const datas = (parcelas: ReturnType<typeof gerarCronograma>) => parcelas.map((p) => p.data_vencimento);

describe('somarMesesAncorado', () => {
  it('mantém o dia do mês nos meses seguintes', () => {
    expect(somarMesesAncorado('2026-08-10', 0)).toBe('2026-08-10');
    expect(somarMesesAncorado('2026-08-10', 1)).toBe('2026-09-10');
    expect(somarMesesAncorado('2026-08-10', 4)).toBe('2026-12-10');
  });

  it('vira o ano corretamente', () => {
    expect(somarMesesAncorado('2026-11-05', 3)).toBe('2027-02-05');
  });

  it('ancora no último dia quando o mês de destino é mais curto', () => {
    // Sem a âncora, setMonth transbordaria 31/01 para 03/03.
    expect(somarMesesAncorado('2026-01-31', 1)).toBe('2026-02-28');
    expect(somarMesesAncorado('2026-01-31', 3)).toBe('2026-04-30');
  });

  it('respeita ano bissexto', () => {
    expect(somarMesesAncorado('2028-01-31', 1)).toBe('2028-02-29');
  });

  it('volta a usar o dia original nos meses que o comportam', () => {
    // O clamp de fevereiro não pode "grudar" nas parcelas seguintes.
    expect(somarMesesAncorado('2026-01-31', 2)).toBe('2026-03-31');
  });

  it('não desloca a data por causa de fuso horário', () => {
    expect(somarMesesAncorado('2026-03-01', 0)).toBe('2026-03-01');
  });
});

describe('gerarCronograma', () => {
  const base = { valorAcordo: 1200, parcelas: 3, primeiroVencimento: '2026-08-10' };

  it('sugere vencimentos mensais a partir da 1ª parcela', () => {
    expect(datas(gerarCronograma(base))).toEqual(['2026-08-10', '2026-09-10', '2026-10-10']);
  });

  it('divide o valor e numera as parcelas', () => {
    const parcelas = gerarCronograma(base);
    expect(parcelas.map((p) => p.numero)).toEqual([1, 2, 3]);
    expect(parcelas.every((p) => p.valor === 400)).toBe(true);
    expect(parcelas.every((p) => p.status === 'pendente')).toBe(true);
  });

  it('aplica juros progressivos sobre o valor base', () => {
    const parcelas = gerarCronograma({ ...base, taxaJuros: 10 });
    expect(parcelas.map((p) => p.valor_juros)).toEqual([40, 80, 120]);
    expect(parcelas.map((p) => p.valor_total)).toEqual([440, 480, 520]);
  });

  it('sem taxa, o total é igual ao valor base', () => {
    expect(gerarCronograma(base).map((p) => p.valor_total)).toEqual([400, 400, 400]);
  });

  it('deixa a data manual sobrescrever a sugestão', () => {
    expect(datas(gerarCronograma(base, { 2: '2026-09-25' })))
      .toEqual(['2026-08-10', '2026-09-25', '2026-10-10']);
  });

  it('sobrescrita de uma parcela não afeta as outras', () => {
    expect(datas(gerarCronograma(base, { 1: '2026-08-01' })))
      .toEqual(['2026-08-01', '2026-09-10', '2026-10-10']);
  });

  it('retorna vazio quando faltam dados', () => {
    expect(gerarCronograma({ ...base, valorAcordo: 0 })).toEqual([]);
    expect(gerarCronograma({ ...base, parcelas: 0 })).toEqual([]);
    expect(gerarCronograma({ ...base, primeiroVencimento: '' })).toEqual([]);
  });
});

describe('centavos do cronograma', () => {
  const gerar = (valorAcordo: number, parcelas: number, taxaJuros = 0) =>
    gerarCronograma({ valorAcordo, parcelas, taxaJuros, primeiroVencimento: '2026-08-10' });

  it('joga o resíduo na última parcela: 100 em 3 = 33,33 + 33,33 + 33,34', () => {
    expect(gerar(100, 3).map((p) => p.valor)).toEqual([33.33, 33.33, 33.34]);
    expect(totalCronograma(gerar(100, 3))).toBe(100);
  });

  it('a soma fecha no valor combinado (casos que divergiam em produção)', () => {
    // 8.000,10 em 8x virava 8.000,08; 228.502,93 em 5x virava 228.502,95.
    expect(totalCronograma(gerar(8000.1, 8))).toBe(8000.1);
    expect(totalCronograma(gerar(228502.93, 5))).toBe(228502.93);
    expect(totalCronograma(gerar(7339.79, 2))).toBe(7339.79);
  });

  it('toda parcela sai com no máximo 2 casas', () => {
    const temMaisDeDuasCasas = (v: number) => Math.abs(v * 100 - Math.round(v * 100)) > 1e-6;
    const parcelas = gerar(25951.33, 8, 1.7);
    expect(parcelas.some((p) => temMaisDeDuasCasas(p.valor))).toBe(false);
    expect(parcelas.some((p) => temMaisDeDuasCasas(p.valor_juros))).toBe(false);
    expect(parcelas.some((p) => temMaisDeDuasCasas(p.valor_total))).toBe(false);
  });

  it('o total é a soma exata das parcelas, com juros', () => {
    const parcelas = gerar(1000, 3, 2.5);
    const soma = emCentavos(parcelas.reduce((s, p) => s + p.valor_total, 0));
    expect(totalCronograma(parcelas)).toBe(soma);
  });
});

describe('podarDatasManuais', () => {
  it('descarta sobrescritas acima do número de parcelas', () => {
    expect(podarDatasManuais({ 1: '2026-08-01', 5: '2026-12-01' }, 3)).toEqual({ 1: '2026-08-01' });
  });

  it('preserva as que ainda existem', () => {
    const manuais = { 2: '2026-09-25', 3: '2026-10-30' };
    expect(podarDatasManuais(manuais, 3)).toEqual(manuais);
  });
});
