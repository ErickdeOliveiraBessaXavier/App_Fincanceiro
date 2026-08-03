import { describe, it, expect } from 'vitest';
import { formatData } from './format';

describe('formatData', () => {
  it('formata data pura sem deslocar por fuso horário', () => {
    // `new Date('2026-08-15')` seria meia-noite UTC -> 14/08 no Brasil.
    expect(formatData('2026-08-15')).toBe('15/08/2026');
    expect(formatData('2026-01-01')).toBe('01/01/2026');
    expect(formatData('2026-12-31')).toBe('31/12/2026');
  });

  it('devolve string vazia para valor ausente', () => {
    expect(formatData(null)).toBe('');
    expect(formatData(undefined)).toBe('');
    expect(formatData('')).toBe('');
  });

  it('formata timestamp completo pelo caminho normal', () => {
    expect(formatData('2026-08-15T13:45:00-03:00')).toBe('15/08/2026');
  });
});
