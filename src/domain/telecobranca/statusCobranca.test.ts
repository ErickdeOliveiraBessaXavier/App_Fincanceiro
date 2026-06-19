import { describe, it, expect } from 'vitest';
import {
  STATUS_COBRANCA,
  STATUS_COBRANCA_LIST,
  getStatusCobranca,
  addDiasCorridos,
  isFimDeSemana,
  ajustarProximoDiaUtil,
  calcularProximoContato,
  validarStatusCobranca,
  paraTimestampNegocio,
  agoraTimestampNegocio,
  isContatoEfetivo,
  contarNaoAtendeConsecutivos,
  naoAtendeExigePesquisa,
  exigePesquisa,
} from './statusCobranca';

// Datas civis ancoradas ao meio-dia, como a camada de negócio trabalha.
const d = (ano: number, mes: number, dia: number) => new Date(ano, mes - 1, dia, 12, 0, 0, 0);
const ymd = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

// Referências fixas em junho/2026: 17 = quarta, 20 = sábado, 21 = domingo, 22 = segunda.
const QUARTA = d(2026, 6, 17);
const SABADO = d(2026, 6, 20);
const DOMINGO = d(2026, 6, 21);

describe('addDiasCorridos', () => {
  it('soma dias sem mutar o original', () => {
    const base = d(2026, 6, 17);
    expect(ymd(addDiasCorridos(base, 7))).toBe('2026-06-24');
    expect(ymd(base)).toBe('2026-06-17'); // imutável
  });
});

describe('isFimDeSemana', () => {
  it('reconhece sábado e domingo', () => {
    expect(isFimDeSemana(SABADO)).toBe(true);
    expect(isFimDeSemana(DOMINGO)).toBe(true);
  });
  it('é falso em dia útil', () => {
    expect(isFimDeSemana(QUARTA)).toBe(false);
  });
});

describe('ajustarProximoDiaUtil', () => {
  it('empurra fim de semana para segunda', () => {
    expect(ymd(ajustarProximoDiaUtil(SABADO))).toBe('2026-06-22');
    expect(ymd(ajustarProximoDiaUtil(DOMINGO))).toBe('2026-06-22');
  });
  it('mantém dia útil', () => {
    expect(ymd(ajustarProximoDiaUtil(QUARTA))).toBe('2026-06-17');
  });
});

describe('calcularProximoContato', () => {
  it('sem previsão: +7 dias corridos a partir da referência', () => {
    expect(ymd(calcularProximoContato('sem_previsao_pagamento', { referencia: QUARTA }))).toBe('2026-06-24');
  });

  it('recado: +2 dias corridos', () => {
    expect(ymd(calcularProximoContato('recado', { referencia: QUARTA }))).toBe('2026-06-19');
  });

  it('agendamento de pagamento: data prevista + 1 dia', () => {
    const proximo = calcularProximoContato('agendamento_pagamento', {
      referencia: QUARTA,
      dataPrevista: d(2026, 6, 18),
    });
    expect(ymd(proximo)).toBe('2026-06-19');
  });

  it('agendamento de pagamento: respeita o teto de 7 dias quando a data prevista é distante', () => {
    // dataPrevista muito à frente → limitado a referência + 7 (24/06, quarta).
    const proximo = calcularProximoContato('agendamento_pagamento', {
      referencia: QUARTA,
      dataPrevista: d(2026, 12, 1),
    });
    expect(ymd(proximo)).toBe('2026-06-24');
  });

  it('dia útil prevalece sobre o teto: se o teto cair no fim de semana, passa para segunda', () => {
    // referência sábado 20/06 → teto em 27/06 (sábado) → ajusta para 29/06 (segunda),
    // ultrapassando o teto em 2 dias (intencional, ver doc da função).
    const proximo = calcularProximoContato('agendamento_pagamento', {
      referencia: SABADO,
      dataPrevista: d(2026, 12, 1),
    });
    expect(ymd(proximo)).toBe('2026-06-29');
  });
});

describe('isContatoEfetivo', () => {
  it('marca contato efetivo apenas onde houve diálogo', () => {
    expect(isContatoEfetivo('agendamento_pagamento')).toBe(true);
    expect(isContatoEfetivo('sem_previsao_pagamento')).toBe(true);
    expect(isContatoEfetivo('devolucao')).toBe(true);
    expect(isContatoEfetivo('nao_atende')).toBe(false);
    expect(isContatoEfetivo('recado')).toBe(false);
    expect(isContatoEfetivo('sem_contato_incorreto')).toBe(false);
  });
});

describe('contarNaoAtendeConsecutivos', () => {
  it('conta sequência sem contato efetivo', () => {
    expect(contarNaoAtendeConsecutivos([])).toBe(0);
    expect(contarNaoAtendeConsecutivos(['nao_atende', 'nao_atende'])).toBe(2);
  });
  it('recado não conta nem zera a sequência', () => {
    expect(contarNaoAtendeConsecutivos(['nao_atende', 'recado', 'nao_atende'])).toBe(2);
  });
  it('contato efetivo zera a sequência (para a contagem)', () => {
    expect(contarNaoAtendeConsecutivos(['nao_atende', 'agendamento_pagamento', 'nao_atende'])).toBe(1);
    expect(contarNaoAtendeConsecutivos(['agendamento_pagamento', 'nao_atende'])).toBe(0);
  });
});

describe('naoAtendeExigePesquisa', () => {
  it('exige pesquisa a partir da 3ª tentativa (2 anteriores)', () => {
    expect(naoAtendeExigePesquisa(0)).toBe(false);
    expect(naoAtendeExigePesquisa(1)).toBe(false);
    expect(naoAtendeExigePesquisa(2)).toBe(true);
    expect(naoAtendeExigePesquisa(3)).toBe(true);
  });
});

describe('exigePesquisa', () => {
  it('sem contato sempre exige', () => {
    expect(exigePesquisa('sem_contato_incorreto')).toBe(true);
  });
  it('não atende exige só a partir da 3ª tentativa', () => {
    expect(exigePesquisa('nao_atende', { tentativasAnteriores: 1 })).toBe(false);
    expect(exigePesquisa('nao_atende', { tentativasAnteriores: 2 })).toBe(true);
  });
  it('status com contato efetivo não exige', () => {
    expect(exigePesquisa('sem_previsao_pagamento')).toBe(false);
  });
});

describe('validarStatusCobranca', () => {
  it('exige data prevista no agendamento de pagamento', () => {
    expect(validarStatusCobranca('agendamento_pagamento', {})).not.toBeNull();
    expect(validarStatusCobranca('agendamento_pagamento', { dataPrevista: QUARTA })).toBeNull();
  });
  it('sem contato exige confirmação de pesquisa', () => {
    expect(validarStatusCobranca('sem_contato_incorreto', {})).not.toBeNull();
    expect(validarStatusCobranca('sem_contato_incorreto', { pesquisaConfirmada: true })).toBeNull();
  });
  it('devolução exige confirmação interna', () => {
    expect(validarStatusCobranca('devolucao', {})).not.toBeNull();
    expect(validarStatusCobranca('devolucao', { confirmacaoInterna: true })).toBeNull();
  });
  it('não atende na 3ª tentativa exige pesquisa', () => {
    expect(validarStatusCobranca('nao_atende', { tentativasAnteriores: 2 })).not.toBeNull();
    expect(validarStatusCobranca('nao_atende', { tentativasAnteriores: 2, pesquisaConfirmada: true })).toBeNull();
    expect(validarStatusCobranca('nao_atende', { tentativasAnteriores: 1 })).toBeNull();
  });
  it('não exige nada nos status simples', () => {
    expect(validarStatusCobranca('sem_previsao_pagamento', {})).toBeNull();
    expect(validarStatusCobranca('suspeita_fraude', {})).toBeNull();
  });
});

describe('paraTimestampNegocio', () => {
  it('monta o timestamp no fuso de São Paulo às 9h por padrão', () => {
    expect(paraTimestampNegocio(d(2026, 6, 19))).toBe('2026-06-19T09:00:00-03:00');
  });
});

describe('agoraTimestampNegocio', () => {
  it('retorna string ISO com offset fixo -03:00', () => {
    expect(agoraTimestampNegocio()).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00-03:00$/);
  });
});

describe('config dos status', () => {
  it('a fraude é de alta prioridade', () => {
    expect(STATUS_COBRANCA.suspeita_fraude.prioridade).toBe('alta');
  });
  it('a lista cobre todos os status configurados', () => {
    expect(STATUS_COBRANCA_LIST).toHaveLength(Object.keys(STATUS_COBRANCA).length);
  });
  it('getStatusCobranca lança para slug desconhecido', () => {
    // @ts-expect-error slug inválido proposital
    expect(() => getStatusCobranca('inexistente')).toThrow();
  });
});
