import { describe, expect, it } from 'vitest';
import { createClienteAgrupadoFilterFunctions, tituloNaSituacao } from './filterFunctions';

describe('tituloNaSituacao', () => {
  it('título com acordo vale pelo estado do acordo, não pelo saldo zerado da novação', () => {
    const quebrado = { status: 'renegociado', acordo_status: 'quebrado' };
    expect(tituloNaSituacao(quebrado, 'acordo_quebrado')).toBe(true);
    expect(tituloNaSituacao(quebrado, 'em_acordo')).toBe(false);
    expect(tituloNaSituacao(quebrado, 'vencido')).toBe(false);

    const cumprido = { status: 'pago', acordo_status: 'cumprido' };
    expect(tituloNaSituacao(cumprido, 'acordo_cumprido')).toBe(true);
    expect(tituloNaSituacao(cumprido, 'pago')).toBe(false);
  });

  it('sem acordo, vale o status do título', () => {
    expect(tituloNaSituacao({ status: 'vencido', acordo_status: null }, 'vencido')).toBe(true);
    expect(tituloNaSituacao({ status: 'a_vencer', acordo_status: null }, 'pago')).toBe(false);
  });

  it('aceita o valor antigo "renegociado" de links salvos como "em acordo"', () => {
    expect(tituloNaSituacao({ status: 'renegociado', acordo_status: 'ativo' }, 'renegociado')).toBe(true);
  });
});

describe('filtro de status por cliente', () => {
  const { status } = createClienteAgrupadoFilterFunctions();

  it('não confunde título com uma parcela paga com título pago', () => {
    // Antes: "Pago" casava qualquer título com parcelas_pagas > 0.
    const cliente = { titulos: [{ status: 'vencido', acordo_status: null, parcelas_pagas: 2 }] };
    expect(status(cliente, 'pago')).toBe(false);
    expect(status(cliente, 'vencido')).toBe(true);
  });
});
