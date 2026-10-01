import { describe, expect, it } from 'vitest';
import { statusExibidoParcela } from './titulo';

describe('statusExibidoParcela', () => {
  it('parcela liquidada por acordo aparece como renegociada, não como paga', () => {
    expect(statusExibidoParcela({ status: 'pago', renegociada: true })).toBe('renegociada');
  });

  it('parcela paga em dinheiro continua paga', () => {
    expect(statusExibidoParcela({ status: 'pago', renegociada: false })).toBe('pago');
    expect(statusExibidoParcela({ status: 'pago' })).toBe('pago');
  });
});
