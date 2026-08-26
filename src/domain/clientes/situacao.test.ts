import { describe, it, expect } from 'vitest';
import { derivarStatusCliente } from './situacao';

describe('derivarStatusCliente', () => {
  it('sem título nenhum, o cliente é apenas ativo', () => {
    expect(derivarStatusCliente([])).toBe('ativo');
  });

  it('vencido ganha de tudo', () => {
    expect(derivarStatusCliente([{ status: 'pago' }, { status: 'vencido' }])).toBe('inadimplente');
  });

  it('acordo quebrado é inadimplência, não quitação', () => {
    // O título renegociado fica com status 'pago' porque a novação zerou o
    // saldo. Sem olhar o acordo, quem quebrou o acordo aparecia como "Quitado".
    expect(derivarStatusCliente([{ status: 'pago', acordo_status: 'quebrado' }]))
      .toBe('inadimplente');
  });

  it('acordo ativo é "em acordo", mesmo com o título zerado', () => {
    expect(derivarStatusCliente([{ status: 'pago', acordo_status: 'ativo' }])).toBe('em_acordo');
    expect(derivarStatusCliente([{ status: 'renegociado' }])).toBe('em_acordo');
  });

  it('acordo cumprido conta como quitado', () => {
    expect(derivarStatusCliente([
      { status: 'pago' },
      { status: 'pago', acordo_status: 'cumprido' },
    ])).toBe('quitado');
  });

  it('quitado exige que TODOS os títulos estejam resolvidos', () => {
    expect(derivarStatusCliente([{ status: 'pago' }, { status: 'a_vencer' }])).toBe('ativo');
  });
});
