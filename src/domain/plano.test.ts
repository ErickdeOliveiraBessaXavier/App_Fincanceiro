import { describe, it, expect } from 'vitest';
import {
  calcularUso, usoMereceAviso, diasRestantes, situacaoDeAcesso, ehErroDeLimite, descreverUso,
  fimDoDiaNoBrasil,
} from './plano';

describe('calcularUso', () => {
  it('plano sem limite não tem percentual nem aviso', () => {
    const uso = calcularUso(50_000, null);
    expect(uso.faixa).toBe('ilimitado');
    expect(uso.percentual).toBeNull();
    expect(uso.restantes).toBeNull();
    expect(usoMereceAviso(uso)).toBe(false);
  });

  it('faixas de aviso em 80%, 90% e 100%', () => {
    expect(calcularUso(7_999, 10_000).faixa).toBe('normal');
    expect(calcularUso(8_000, 10_000).faixa).toBe('atencao');
    expect(calcularUso(9_000, 10_000).faixa).toBe('critico');
    expect(calcularUso(10_000, 10_000).faixa).toBe('esgotado');
  });

  it('só marca 100% quando de fato não cabe mais nenhum', () => {
    const uso = calcularUso(9_999, 10_000);
    expect(uso.percentual).toBe(99);
    expect(uso.faixa).toBe('critico');
    expect(uso.restantes).toBe(1);
  });

  it('limite reduzido abaixo do uso: esgotado, sem restante negativo', () => {
    const uso = calcularUso(6_000, 5_000);
    expect(uso.faixa).toBe('esgotado');
    expect(uso.percentual).toBe(120);
    expect(uso.restantes).toBe(0);
  });
});

describe('descreverUso', () => {
  it('formata no padrão brasileiro', () => {
    expect(descreverUso(calcularUso(7_842, 10_000))).toBe('7.842 de 10.000 títulos — 78%');
    expect(descreverUso(calcularUso(1_200, null))).toBe('1.200 títulos — sem limite');
  });
});

describe('diasRestantes', () => {
  const agora = new Date('2026-10-01T12:00:00Z');

  it('sem prazo devolve null', () => {
    expect(diasRestantes(null, agora)).toBeNull();
  });

  it('arredonda para cima enquanto ainda há acesso', () => {
    expect(diasRestantes('2026-10-08T12:00:00Z', agora)).toBe(7);
    expect(diasRestantes('2026-10-01T12:01:00Z', agora)).toBe(1);
  });

  it('prazo passado é zero', () => {
    expect(diasRestantes('2026-10-01T11:59:00Z', agora)).toBe(0);
  });
});

describe('situacaoDeAcesso', () => {
  const agora = new Date('2026-10-01T12:00:00Z');

  it('segue o status quando não está ativa', () => {
    expect(situacaoDeAcesso({ status: 'pendente' }, agora)).toBe('pendente');
    expect(situacaoDeAcesso({ status: 'suspensa' }, agora)).toBe('suspensa');
    expect(situacaoDeAcesso({ status: 'cancelada' }, agora)).toBe('suspensa');
  });

  it('ativa com prazo vencido é expirada', () => {
    expect(situacaoDeAcesso({ status: 'ativa', acesso_expira_em: '2026-09-30T00:00:00Z' }, agora))
      .toBe('expirada');
  });

  it('ativa sem prazo ou dentro do prazo é ativa', () => {
    expect(situacaoDeAcesso({ status: 'ativa', acesso_expira_em: null }, agora)).toBe('ativa');
    expect(situacaoDeAcesso({ status: 'ativa', acesso_expira_em: '2026-10-05T00:00:00Z' }, agora))
      .toBe('ativa');
  });
});

describe('ehErroDeLimite', () => {
  it('reconhece pelo hint do banco', () => {
    expect(ehErroDeLimite({ hint: 'limite_do_plano' })).toBe(true);
    expect(ehErroDeLimite({ hint: null })).toBe(false);
    expect(ehErroDeLimite(null)).toBe(false);
  });
});

describe('fimDoDiaNoBrasil', () => {
  it('o dia escolhido vale inteiro no horário de Brasília', () => {
    const fim = fimDoDiaNoBrasil('2026-10-15');
    expect(new Date(fim).toISOString()).toBe('2026-10-16T02:59:59.000Z');
    expect(diasRestantes(fim, new Date('2026-10-15T23:00:00-03:00'))).toBe(1);
  });
});
