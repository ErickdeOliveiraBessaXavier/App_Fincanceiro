import { describe, it, expect } from 'vitest';
import {
  formatData,
  formatMoeda,
  isoDeData,
  mascaraCpfCnpj,
  mascaraTelefone,
  parseDataLocal,
  parseMoeda,
} from './format';

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

describe('isoDeData', () => {
  it('usa os componentes locais, sem passar por UTC', () => {
    // 23h no Brasil (UTC-3) já é o dia seguinte em UTC: o toISOString devolveria
    // '2026-08-06' e a sugestão de vencimento saía como amanhã.
    expect(isoDeData(new Date(2026, 7, 5, 23, 30))).toBe('2026-08-05');
    expect(isoDeData(new Date(2026, 7, 5, 0, 1))).toBe('2026-08-05');
  });

  it('zera à esquerda mês e dia', () => {
    expect(isoDeData(new Date(2026, 0, 9))).toBe('2026-01-09');
  });

  it('é o inverso de parseDataLocal', () => {
    for (const iso of ['2026-01-01', '2026-08-05', '2026-12-31']) {
      expect(isoDeData(parseDataLocal(iso))).toBe(iso);
    }
  });
});

describe('parseMoeda', () => {
  it('lê os dois últimos dígitos como centavos', () => {
    expect(parseMoeda('1560020')).toBe(15600.2);
    expect(parseMoeda('1')).toBe(0.01);
    expect(parseMoeda('100')).toBe(1);
  });

  it('ignora separadores e símbolo já formatados', () => {
    expect(parseMoeda('15.600,20')).toBe(15600.2);
    expect(parseMoeda('R$ 15.600,20')).toBe(15600.2);
  });

  it('descarta zeros à esquerda — o "0" default não gruda no número', () => {
    expect(parseMoeda('015.600,20')).toBe(15600.2);
    expect(parseMoeda('0001')).toBe(0.01);
  });

  it('devolve 0 quando não há dígito', () => {
    expect(parseMoeda('')).toBe(0);
    expect(parseMoeda('R$')).toBe(0);
  });
});

describe('formatMoeda', () => {
  it('formata em pt-BR com duas casas e sem símbolo', () => {
    expect(formatMoeda(15600.2)).toBe('15.600,20');
    expect(formatMoeda(14400.24)).toBe('14.400,24');
    expect(formatMoeda(0)).toBe('0,00');
  });

  it('sobrevive a valor inválido', () => {
    expect(formatMoeda(Number.NaN)).toBe('0,00');
  });

  it('é reversível pelo parseMoeda', () => {
    for (const valor of [0.01, 1, 156, 15600.2, 999999.99]) {
      expect(parseMoeda(formatMoeda(valor))).toBe(valor);
    }
  });
});

describe('mascaraCpfCnpj', () => {
  it('formata progressivamente enquanto se digita', () => {
    expect(mascaraCpfCnpj('0')).toBe('0');
    expect(mascaraCpfCnpj('000')).toBe('000');
    expect(mascaraCpfCnpj('0003')).toBe('000.3');
    expect(mascaraCpfCnpj('00039104')).toBe('000.391.04');
    expect(mascaraCpfCnpj('00039104308')).toBe('000.391.043-08');
  });

  it('vira CNPJ a partir do 12º dígito', () => {
    // O mesmo campo atende os dois documentos: a máscara se reorganiza sozinha.
    expect(mascaraCpfCnpj('000000000001')).toBe('00.000.000/0001');
    expect(mascaraCpfCnpj('00000000000100')).toBe('00.000.000/0001-00');
  });

  it('ignora o que passa de 14 dígitos e o que não é dígito', () => {
    expect(mascaraCpfCnpj('000000000001009999')).toBe('00.000.000/0001-00');
    expect(mascaraCpfCnpj('000.391.043-08')).toBe('000.391.043-08');
  });
});

describe('mascaraTelefone', () => {
  it('formata fixo e celular conforme o comprimento', () => {
    expect(mascaraTelefone('85')).toBe('(85');
    expect(mascaraTelefone('8533334444')).toBe('(85) 3333-4444');
    expect(mascaraTelefone('85999999999')).toBe('(85) 99999-9999');
  });

  it('corta em 11 dígitos', () => {
    expect(mascaraTelefone('859999999991234')).toBe('(85) 99999-9999');
  });
});
