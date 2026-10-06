import { describe, it, expect } from 'vitest';
import {
  situacaoDaFatura, dataDoBloqueio, inicioCobrancaPadrao, primeiroVencimento, descreverFatura,
  descreverSituacao, resumirCobranca, valorMensalEfetivo, diasEntre,
} from './assinatura';

const aberta = (vencimento: string) => ({ status: 'aberta' as const, vencimento });

describe('situacaoDaFatura', () => {
  it('em aberto até o dia do vencimento: a vencer', () => {
    expect(situacaoDaFatura(aberta('2026-10-10'), 10, '2026-10-05')).toBe('a_vencer');
    expect(situacaoDaFatura(aberta('2026-10-05'), 10, '2026-10-05')).toBe('a_vencer');
  });

  it('vencida dentro da tolerância não bloqueia; o dia seguinte ao fim bloqueia (igual ao banco)', () => {
    expect(situacaoDaFatura(aberta('2026-10-01'), 10, '2026-10-02')).toBe('vencida');
    expect(situacaoDaFatura(aberta('2026-10-01'), 10, '2026-10-11')).toBe('vencida');
    expect(situacaoDaFatura(aberta('2026-10-01'), 10, '2026-10-12')).toBe('bloqueando');
  });

  it('tolerância zero bloqueia no dia seguinte ao vencimento', () => {
    expect(situacaoDaFatura(aberta('2026-10-01'), 0, '2026-10-02')).toBe('bloqueando');
  });

  it('paga e cancelada não dependem da data', () => {
    expect(situacaoDaFatura({ status: 'paga', vencimento: '2020-01-01' }, 10, '2026-10-05')).toBe('paga');
    expect(situacaoDaFatura({ status: 'cancelada', vencimento: '2020-01-01' }, 10, '2026-10-05')).toBe('cancelada');
  });
});

describe('datas', () => {
  it('bloqueio é o dia seguinte ao fim da tolerância', () => {
    expect(dataDoBloqueio('2026-10-01', 10)).toBe('2026-10-12');
  });

  it('carência padrão de 60 dias', () => {
    expect(inicioCobrancaPadrao('2026-10-05')).toBe('2026-12-04');
  });

  it('primeiro vencimento no mesmo mês ou no seguinte', () => {
    expect(primeiroVencimento('2026-12-04', 10)).toBe('2026-12-10');
    expect(primeiroVencimento('2026-12-04', 4)).toBe('2026-12-04');
    expect(primeiroVencimento('2026-12-04', 1)).toBe('2027-01-01');
  });

  it('diasEntre conta dias corridos', () => {
    expect(diasEntre('2026-10-01', '2026-10-31')).toBe(30);
    expect(diasEntre('2026-10-05', '2026-10-01')).toBe(-4);
  });
});

describe('textos', () => {
  it('descreve a fatura pelo tipo e competência', () => {
    expect(descreverFatura({ tipo: 'implantacao', competencia: null })).toBe('Implantação');
    expect(descreverFatura({ tipo: 'mensalidade', competencia: '2026-12-01' })).toBe('Mensalidade dez/2026');
  });

  it('situação em texto', () => {
    const f = { status: 'aberta' as const, vencimento: '2026-10-01', pago_em: null };
    expect(descreverSituacao(f, 10, '2026-10-05')).toBe('Vencida — bloqueio em 12/10/2026');
    expect(descreverSituacao({ ...f, status: 'paga', pago_em: '2026-10-03' }, 10, '2026-10-05'))
      .toBe('Paga em 03/10/2026');
  });
});

describe('resumirCobranca', () => {
  it('soma em aberto e em atraso e devolve a pior situação', () => {
    const r = resumirCobranca([
      { status: 'aberta', vencimento: '2026-10-10', valor: 297 },
      { status: 'aberta', vencimento: '2026-09-20', valor: 990 },
    ], 10, '2026-10-05');
    expect(r).toEqual({ situacao: 'bloqueando', emAberto: 1287, emAtraso: 990 });
  });

  it('sem faturas em aberto', () => {
    expect(resumirCobranca([], 10, '2026-10-05')).toEqual({ situacao: null, emAberto: 0, emAtraso: 0 });
  });
});

it('mensalidade negociada prevalece sobre a do plano', () => {
  expect(valorMensalEfetivo(null, 297)).toBe(297);
  expect(valorMensalEfetivo(250, 297)).toBe(250);
  expect(valorMensalEfetivo(0, 297)).toBe(0);
});
