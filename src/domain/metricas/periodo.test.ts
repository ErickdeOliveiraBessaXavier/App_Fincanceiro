import { describe, it, expect } from 'vitest';
import {
  diaLocal,
  mesDe,
  ultimosMeses,
  periodoDeIntervalo,
  dentroDoPeriodo,
  inicioDoMesAtual,
} from './periodo';

describe('mesDe / diaLocal', () => {
  it('mantém o dia de uma data pura (não desloca para UTC)', () => {
    expect(diaLocal('2026-08-01')).toBe('2026-08-01');
    expect(mesDe('2026-08-01')).toBe('2026-08');
  });

  it('usa o calendário local em timestamp de fim de mês à noite', () => {
    // 31/07 23:00 no Brasil (UTC-3) é 01/08 02:00 em UTC. O código antigo usava
    // toISOString() e jogava este registro em agosto.
    const timestamp = new Date(2026, 6, 31, 23, 0, 0).toISOString();
    expect(mesDe(timestamp)).toBe('2026-07');
  });
});

describe('ultimosMeses', () => {
  it('devolve a série do mais antigo ao mais recente, incluindo a referência', () => {
    expect(ultimosMeses(6, new Date(2026, 7, 6))).toEqual([
      '2026-03',
      '2026-04',
      '2026-05',
      '2026-06',
      '2026-07',
      '2026-08',
    ]);
  });

  it('não pula nem duplica meses partindo de um dia 31', () => {
    // date.setMonth(getMonth()-1) em 31/03 vira "31/02" -> 03/03, o bug antigo.
    expect(ultimosMeses(3, new Date(2026, 2, 31))).toEqual(['2026-01', '2026-02', '2026-03']);
  });

  it('atravessa a virada de ano', () => {
    expect(ultimosMeses(3, new Date(2026, 0, 15))).toEqual(['2025-11', '2025-12', '2026-01']);
  });
});

describe('periodoDeIntervalo / dentroDoPeriodo', () => {
  it('inclui o último dia do período', () => {
    // O bug antigo: to.toISOString() cortava o dia final quase inteiro.
    const periodo = periodoDeIntervalo(new Date(2026, 7, 1), new Date(2026, 7, 31));
    expect(periodo).toEqual({ de: '2026-08-01', ate: '2026-08-31' });
    expect(dentroDoPeriodo('2026-08-31', periodo)).toBe(true);
    expect(dentroDoPeriodo('2026-09-01', periodo)).toBe(false);
    expect(dentroDoPeriodo('2026-07-31', periodo)).toBe(false);
  });

  it('sem período, aceita tudo; com período, descarta data ausente', () => {
    expect(dentroDoPeriodo(null, undefined)).toBe(true);
    expect(dentroDoPeriodo(null, { de: '2026-08-01', ate: '2026-08-31' })).toBe(false);
  });
});

describe('inicioDoMesAtual', () => {
  it('devolve o dia 1 do mês da referência', () => {
    expect(inicioDoMesAtual(new Date(2026, 7, 6))).toBe('2026-08-01');
  });
});
