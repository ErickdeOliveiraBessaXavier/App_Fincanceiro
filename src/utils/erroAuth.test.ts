import { describe, it, expect } from 'vitest';
import { codigoErroAuth, traduzirErroAuth } from './erroAuth';

describe('traduzirErroAuth', () => {
  it('traduz pelo code do erro', () => {
    expect(traduzirErroAuth({ code: 'invalid_credentials', message: 'Invalid login credentials' }))
      .toBe('E-mail ou senha incorretos.');
    expect(traduzirErroAuth({ code: 'email_not_confirmed', message: 'Email not confirmed' }))
      .toMatch(/ainda não foi confirmado/);
  });

  it('reconhece pela mensagem quando o servidor não manda code', () => {
    expect(codigoErroAuth({ message: 'Email not confirmed' })).toBe('email_not_confirmed');
    expect(codigoErroAuth({ message: 'Invalid login credentials' })).toBe('invalid_credentials');
  });

  it('cai na mensagem original quando não conhece o erro', () => {
    expect(traduzirErroAuth({ code: 'algo_novo', message: 'Something else' })).toBe('Something else');
    expect(traduzirErroAuth(null)).toMatch(/Tente de novo/);
  });
});
