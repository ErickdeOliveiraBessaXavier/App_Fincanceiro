import { describe, it, expect } from 'vitest';
import { codigoAcordo } from './identificacao';

describe('codigoAcordo', () => {
  it('usa os 6 últimos caracteres do id, em maiúsculas', () => {
    expect(codigoAcordo('3f2a91c4-7b5e-4d1a-9c8f-0a1b2c3d4e5f')).toBe('#3D4E5F');
  });

  it('devolve travessão quando não há id', () => {
    expect(codigoAcordo(undefined)).toBe('—');
    expect(codigoAcordo(null)).toBe('—');
    expect(codigoAcordo('')).toBe('—');
  });

  it('não quebra com id mais curto que o código', () => {
    expect(codigoAcordo('abc')).toBe('#ABC');
  });
});
