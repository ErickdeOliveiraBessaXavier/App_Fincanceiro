import { describe, it, expect } from 'vitest';
import {
  calcularAging,
  calcularIndicadores,
  calcularTopDevedores,
  classificarTitulo,
  diasDeAtraso,
  listarItensVencidos,
  prepararBase,
  recortarPorVencimento,
  restringirAoUniverso,
  serieRecuperacaoMensal,
  situacaoFinanceiraCliente,
} from './calculo';
import type { BaseMetricas, TituloMetrica } from './tipos';

const HOJE = '2026-08-06';

function titulo(over: Partial<TituloMetrica> & { id: string }): TituloMetrica {
  return {
    cliente_id: 'cli-1',
    cliente_nome: 'Cliente 1',
    cliente_cpf_cnpj: '11111111111',
    valor_original: 1000,
    saldo_devedor: 1000,
    total_pago: 0,
    status: 'a_vencer',
    acordo_status: null,
    proximo_vencimento: '2026-09-01',
    vencimento_original: '2026-09-01',
    created_at: '2026-01-01T12:00:00Z',
    ...over,
  };
}

function baseVazia(): BaseMetricas {
  return { titulos: [], parcelas: [], recebimentos: [], acordos: [], parcelasAcordo: [] };
}

describe('classificarTitulo', () => {
  it('o estado do acordo tem precedência sobre o saldo', () => {
    // A novação zera o saldo do título; sem esta regra, um acordo QUEBRADO
    // (dívida real, não paga) apareceria como "pago".
    expect(classificarTitulo(titulo({ id: 't', status: 'pago', acordo_status: 'quebrado' })))
      .toBe('acordo_quebrado');
    expect(classificarTitulo(titulo({ id: 't', status: 'pago', acordo_status: 'cumprido' })))
      .toBe('acordo_cumprido');
    expect(classificarTitulo(titulo({ id: 't', status: 'renegociado', acordo_status: 'ativo' })))
      .toBe('em_acordo');
  });

  it('sem acordo, vale o status financeiro', () => {
    expect(classificarTitulo(titulo({ id: 't', status: 'vencido' }))).toBe('vencido');
    expect(classificarTitulo(titulo({ id: 't', status: 'pago' }))).toBe('pago');
    expect(classificarTitulo(titulo({ id: 't', status: 'pendente' }))).toBe('a_vencer');
  });
});

describe('restringirAoUniverso', () => {
  it('descarta parcela e recebimento de título fora do universo', () => {
    // É o caso do título cancelado / do cliente excluído: a view de títulos já
    // os remove, mas vw_parcelas_consolidadas e vw_recebimentos não sabem disso.
    const base: BaseMetricas = {
      ...baseVazia(),
      titulos: [titulo({ id: 't1' })],
      parcelas: [
        { id: 'p1', titulo_id: 't1', vencimento: '2026-07-01', valor_nominal: 100, saldo_atual: 100, status: 'vencido' },
        { id: 'p2', titulo_id: 't-cancelado', vencimento: '2026-07-01', valor_nominal: 500, saldo_atual: 500, status: 'vencido' },
      ],
      recebimentos: [
        { recebimento_id: 'r1', origem: 'titulo', titulo_id: 't1', acordo_id: null, valor: 50, data_recebimento: '2026-08-01' },
        { recebimento_id: 'r2', origem: 'titulo', titulo_id: 't-cancelado', acordo_id: null, valor: 900, data_recebimento: '2026-08-01' },
      ],
    };

    const resultado = restringirAoUniverso(base);
    expect(resultado.parcelas.map((p) => p.id)).toEqual(['p1']);
    expect(resultado.recebimentos.map((r) => r.recebimento_id)).toEqual(['r1']);
  });

  it('remove acordo cancelado e as parcelas dele', () => {
    const base: BaseMetricas = {
      ...baseVazia(),
      acordos: [
        { id: 'a1', status: 'ativo', valor_acordo: 800, valor_original: 1000, data_acordo: '2026-07-01', created_at: '2026-07-01T00:00:00Z', cliente_id: 'cli-1', cliente_nome: 'Cliente 1' },
        { id: 'a2', status: 'cancelado', valor_acordo: 5000, valor_original: 6000, data_acordo: '2026-07-01', created_at: '2026-07-01T00:00:00Z', cliente_id: 'cli-2', cliente_nome: 'Cliente 2' },
      ],
      parcelasAcordo: [
        { id: 'pa1', acordo_id: 'a1', valor_total: 400, data_vencimento: '2026-09-01', status: 'pendente' },
        { id: 'pa2', acordo_id: 'a2', valor_total: 2500, data_vencimento: '2026-09-01', status: 'pendente' },
      ],
    };

    const resultado = restringirAoUniverso(base);
    expect(resultado.acordos.map((a) => a.id)).toEqual(['a1']);
    expect(resultado.parcelasAcordo.map((p) => p.id)).toEqual(['pa1']);
  });
});

describe('recortarPorVencimento', () => {
  const base: BaseMetricas = {
    ...baseVazia(),
    titulos: [titulo({ id: 't1' }), titulo({ id: 't2' })],
    parcelas: [
      { id: 'p1', titulo_id: 't1', vencimento: '2026-08-15', valor_nominal: 100, saldo_atual: 100, status: 'a_vencer' },
      { id: 'p2', titulo_id: 't2', vencimento: '2026-10-15', valor_nominal: 200, saldo_atual: 200, status: 'a_vencer' },
    ],
  };

  it('seleciona o título pela parcela que vence no período', () => {
    const r = recortarPorVencimento(base, { de: '2026-08-01', ate: '2026-08-31' });
    expect(r.titulos.map((t) => t.id)).toEqual(['t1']);
    expect(r.parcelas.map((p) => p.id)).toEqual(['p1']);
  });

  it('sem período, devolve a base intacta', () => {
    expect(recortarPorVencimento(base, undefined)).toBe(base);
  });
});

describe('diasDeAtraso', () => {
  it('conta dias corridos sem sofrer com fuso', () => {
    expect(diasDeAtraso('2026-08-06', HOJE)).toBe(0);
    expect(diasDeAtraso('2026-07-07', HOJE)).toBe(30);
    expect(diasDeAtraso('2026-05-08', HOJE)).toBe(90);
  });
});

describe('aging e top devedores', () => {
  const base: BaseMetricas = {
    ...baseVazia(),
    titulos: [
      titulo({ id: 't1', cliente_id: 'cli-1', cliente_nome: 'Ana', status: 'vencido' }),
      titulo({ id: 't2', cliente_id: 'cli-2', cliente_nome: 'Bruno', status: 'vencido' }),
    ],
    parcelas: [
      { id: 'p1', titulo_id: 't1', vencimento: '2026-08-01', valor_nominal: 100, saldo_atual: 100, status: 'vencido' },
      { id: 'p2', titulo_id: 't2', vencimento: '2026-01-01', valor_nominal: 700, saldo_atual: 700, status: 'vencido' },
    ],
    acordos: [
      { id: 'a1', status: 'quebrado', valor_acordo: 300, valor_original: 400, data_acordo: '2026-05-01', created_at: '2026-05-01T00:00:00Z', cliente_id: 'cli-1', cliente_nome: 'Ana' },
    ],
    parcelasAcordo: [
      { id: 'pa1', acordo_id: 'a1', valor_total: 300, data_vencimento: '2026-06-20', status: 'vencida' },
    ],
  };

  it('inclui parcela de acordo em atraso, que antes era invisível', () => {
    const itens = listarItensVencidos(base, HOJE);
    expect(itens).toHaveLength(3);
    expect(itens.filter((i) => i.origem === 'acordo')).toHaveLength(1);
  });

  it('aging e top devedores fecham no mesmo total', () => {
    const itens = listarItensVencidos(base, HOJE);
    const aging = calcularAging(itens, HOJE);
    const totalAging = aging.reduce((s, f) => s + f.value, 0);
    const totalDevedores = calcularTopDevedores(itens).reduce((s, d) => s + d.totalValor, 0);

    expect(totalAging).toBe(1100);
    expect(totalDevedores).toBe(totalAging);
  });

  it('distribui nas faixas certas', () => {
    const aging = calcularAging(listarItensVencidos(base, HOJE), HOJE);
    expect(aging[0]).toMatchObject({ label: '0-30 dias', count: 1, value: 100 });
    expect(aging[1]).toMatchObject({ label: '31-60 dias', count: 1, value: 300 });
    expect(aging[3]).toMatchObject({ label: '+90 dias', count: 1, value: 700 });
  });

  it('agrupa o devedor somando título e acordo', () => {
    const devedores = calcularTopDevedores(listarItensVencidos(base, HOJE));
    expect(devedores[0]).toMatchObject({ clienteNome: 'Bruno', totalValor: 700 });
    expect(devedores[1]).toMatchObject({ clienteNome: 'Ana', totalValor: 400, totalItens: 2 });
  });
});

describe('serieRecuperacaoMensal', () => {
  it('usa a data real do recebimento e soma as duas origens', () => {
    const serie = serieRecuperacaoMensal(
      [
        { recebimento_id: 'r1', origem: 'titulo', titulo_id: 't1', acordo_id: null, valor: 100, data_recebimento: '2026-07-10' },
        { recebimento_id: 'r2', origem: 'acordo', titulo_id: 't2', acordo_id: 'a1', valor: 250, data_recebimento: '2026-08-02' },
        { recebimento_id: 'r3', origem: 'titulo', titulo_id: 't1', acordo_id: null, valor: 50, data_recebimento: '2026-08-05' },
      ],
      ['2026-07', '2026-08'],
    );
    expect(serie.map((p) => p.valor)).toEqual([100, 300]);
  });
});

describe('calcularIndicadores', () => {
  const base: BaseMetricas = {
    titulos: [
      titulo({ id: 't1', status: 'vencido', valor_original: 1000 }),
      titulo({ id: 't2', status: 'pago', acordo_status: 'quebrado', valor_original: 400 }),
      titulo({ id: 't3', status: 'pago', valor_original: 600 }),
    ],
    parcelas: [
      { id: 'p1', titulo_id: 't1', vencimento: '2026-07-01', valor_nominal: 1000, saldo_atual: 1000, status: 'vencido' },
      { id: 'p3', titulo_id: 't3', vencimento: '2026-07-01', valor_nominal: 600, saldo_atual: 0, status: 'pago' },
    ],
    acordos: [
      { id: 'a1', status: 'quebrado', valor_acordo: 400, valor_original: 400, data_acordo: '2026-05-01', created_at: '2026-05-01T00:00:00Z', cliente_id: 'cli-1', cliente_nome: 'Ana' },
    ],
    parcelasAcordo: [
      { id: 'pa1', acordo_id: 'a1', valor_total: 400, data_vencimento: '2026-06-01', status: 'vencida' },
    ],
    recebimentos: [
      { recebimento_id: 'r1', origem: 'titulo', titulo_id: 't3', acordo_id: null, valor: 600, data_recebimento: '2026-07-15' },
    ],
  };

  const ind = calcularIndicadores(base, HOJE);

  it('não conta o acordo quebrado como título pago', () => {
    expect(ind.titulosPagos).toBe(1); // só t3
    expect(ind.titulosVencidos).toBe(2); // t1 + o quebrado t2
  });

  it('soma o atraso do acordo ao valor vencido', () => {
    expect(ind.valorVencido).toBe(1400); // 1000 do título + 400 do acordo
    expect(ind.valorEmAberto).toBe(1400);
  });

  it('inadimplência e valor vencido saem da mesma base', () => {
    expect(ind.taxaInadimplencia).toBe(100);
  });

  it('recuperação vem de vw_recebimentos, não de total_pago', () => {
    expect(ind.valorRecuperado).toBe(600);
    expect(ind.taxaRecuperacao).toBeCloseTo((600 / 2000) * 100);
  });
});

describe('prepararBase', () => {
  it('aplica universo antes do período', () => {
    const base: BaseMetricas = {
      ...baseVazia(),
      titulos: [titulo({ id: 't1' })],
      parcelas: [
        { id: 'p1', titulo_id: 't1', vencimento: '2026-08-15', valor_nominal: 100, saldo_atual: 100, status: 'vencido' },
        { id: 'p2', titulo_id: 't-fora', vencimento: '2026-08-15', valor_nominal: 900, saldo_atual: 900, status: 'vencido' },
      ],
    };
    const r = prepararBase(base, { de: '2026-08-01', ate: '2026-08-31' });
    expect(r.parcelas.map((p) => p.id)).toEqual(['p1']);
  });
});

describe('situacaoFinanceiraCliente', () => {
  // Base com DOIS clientes: um com título vencido, outro com acordo em atraso.
  function baseDoisClientes(): BaseMetricas {
    return {
      ...baseVazia(),
      titulos: [
        titulo({ id: 't1', cliente_id: 'cli-1', cliente_nome: 'Cliente 1', status: 'vencido' }),
        // Renegociado: a novação zerou o saldo, a dívida vive no acordo.
        titulo({ id: 't2', cliente_id: 'cli-2', cliente_nome: 'Cliente 2', status: 'renegociado', acordo_status: 'quebrado', saldo_devedor: 0 }),
      ],
      parcelas: [
        { id: 'p1', titulo_id: 't1', vencimento: '2026-07-07', valor_nominal: 300, saldo_atual: 300, status: 'vencido' },
        { id: 'p2', titulo_id: 't1', vencimento: '2026-09-07', valor_nominal: 200, saldo_atual: 200, status: 'a_vencer' },
      ],
      acordos: [
        { id: 'a1', status: 'quebrado', valor_acordo: 800, valor_original: 1000, data_acordo: '2026-05-01', created_at: '2026-05-01', cliente_id: 'cli-2', cliente_nome: 'Cliente 2' },
      ],
      parcelasAcordo: [
        { id: 'pa1', acordo_id: 'a1', valor_total: 400, data_vencimento: '2026-06-06', status: 'pendente' },
        { id: 'pa2', acordo_id: 'a1', valor_total: 400, data_vencimento: '2026-10-06', status: 'pendente' },
      ],
    };
  }

  it('soma vencido e a vencer só do cliente pedido', () => {
    const situacao = situacaoFinanceiraCliente(prepararBase(baseDoisClientes()), 'cli-1', HOJE);
    expect(situacao.vencido).toBe(300);
    expect(situacao.aVencer).toBe(200);
    expect(situacao.emAberto).toBe(500);
    expect(situacao.parcelasVencidas).toBe(1);
  });

  it('enxerga a dívida que vive no acordo, não no título', () => {
    // Era o furo da ficha: o título renegociado tem saldo zero, então somar as
    // parcelas do título dava R$ 0 para um cliente que deve de verdade.
    const situacao = situacaoFinanceiraCliente(prepararBase(baseDoisClientes()), 'cli-2', HOJE);
    expect(situacao.vencido).toBe(400);
    expect(situacao.aVencer).toBe(400);
    expect(situacao.emAberto).toBe(800);
    expect(situacao.parcelasVencidas).toBe(1);
  });

  it('reporta o maior atraso entre as parcelas vencidas', () => {
    const situacao = situacaoFinanceiraCliente(prepararBase(baseDoisClientes()), 'cli-1', HOJE);
    expect(situacao.maiorAtraso).toBe(diasDeAtraso('2026-07-07', HOJE));
  });

  it('cliente sem dívida devolve zeros', () => {
    const situacao = situacaoFinanceiraCliente(prepararBase(baseDoisClientes()), 'cli-999', HOJE);
    expect(situacao).toEqual({ emAberto: 0, vencido: 0, aVencer: 0, parcelasVencidas: 0, maiorAtraso: 0 });
  });
});
