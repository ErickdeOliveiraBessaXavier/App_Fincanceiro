import { describe, it, expect } from 'vitest';
import { filtrarEmpresas, listarPendencias, type ContextoPendencias, type EmpresaAvaliada } from './plataforma';

const AGORA = new Date('2026-10-06T12:00:00-03:00');

const empresa = (id: string, extra: Partial<EmpresaAvaliada> = {}): EmpresaAvaliada => ({
  id, nome: id, status: 'ativa', plano: 'basico', acesso_expira_em: null, ...extra,
});

const ctx = (extra: Partial<ContextoPendencias> = {}): ContextoPendencias => ({
  uso: new Map(),
  cobranca: new Map(),
  planosPagos: new Set(['basico']),
  cobrancaCarregada: true,
  agora: AGORA,
  ...extra,
});

const comContrato = (ids: string[]) =>
  new Map(ids.map((id) => [id, { situacao: null, emAberto: 0, emAtraso: 0, mensal: 297 }]));

describe('listarPendencias', () => {
  it('empresa pendente pede aprovação e nada mais', () => {
    const [p, ...resto] = listarPendencias([empresa('a', { status: 'pendente' })], ctx());
    expect(p.acao).toBe('aprovar');
    expect(resto).toHaveLength(0);
  });

  it('suspensa não gera pendência', () => {
    expect(listarPendencias([empresa('a', { status: 'suspensa' })], ctx())).toEqual([]);
  });

  it('empresa ativa em dia não gera pendência', () => {
    expect(listarPendencias([empresa('a')], ctx({ cobranca: comContrato(['a']) }))).toEqual([]);
  });

  it('plano pago sem assinatura pede cadastro de cobrança, mas só depois de carregar', () => {
    const semContrato = new Map([['a', { situacao: null, emAberto: 0, emAtraso: 0, mensal: null }]]);
    expect(listarPendencias([empresa('a')], ctx({ cobranca: semContrato }))[0].acao).toBe('cobranca');
    expect(listarPendencias([empresa('a')], ctx({ cobranca: semContrato, cobrancaCarregada: false }))).toEqual([]);
  });

  it('plano sem mensalidade (teste, cortesia) não exige cobrança', () => {
    expect(listarPendencias([empresa('a', { plano: 'trial' })], ctx())).toEqual([]);
  });

  it('prazo vencido é grave; perto do fim é aviso', () => {
    const lista = listarPendencias([
      empresa('vencida', { plano: 'trial', acesso_expira_em: '2026-10-05T23:59:59-03:00' }),
      empresa('acabando', { plano: 'trial', acesso_expira_em: '2026-10-09T23:59:59-03:00' }),
      empresa('longe', { plano: 'trial', acesso_expira_em: '2026-11-30T23:59:59-03:00' }),
    ], ctx());
    expect(lista.map((p) => [p.companyId, p.gravidade])).toEqual([['vencida', 'alta'], ['acabando', 'media']]);
    expect(lista[1].texto).toBe('Acesso termina em 4 dias');
  });

  it('limite: 100% é grave, 90% é aviso, 80% não entra na lista', () => {
    const uso = new Map([
      ['cheio', { usados: 5000, limite: 5000 }],
      ['quase', { usados: 4600, limite: 5000 }],
      ['ok', { usados: 4000, limite: 5000 }],
    ]);
    const lista = listarPendencias(
      [empresa('cheio'), empresa('quase'), empresa('ok')],
      ctx({ uso, cobranca: comContrato(['cheio', 'quase', 'ok']) }),
    );
    expect(lista.map((p) => [p.companyId, p.gravidade])).toEqual([['cheio', 'alta'], ['quase', 'media']]);
  });

  it('fatura bloqueando vem antes dos avisos', () => {
    const cobranca = comContrato(['a', 'b']);
    cobranca.set('b', { situacao: 'bloqueando', emAberto: 297, emAtraso: 297, mensal: 297 });
    const uso = new Map([['a', { usados: 4600, limite: 5000 }]]);
    const lista = listarPendencias([empresa('a'), empresa('b')], ctx({ cobranca, uso }));
    expect(lista[0]).toMatchObject({ companyId: 'b', gravidade: 'alta', acao: 'cobranca' });
  });
});

describe('filtrarEmpresas', () => {
  const lista = [
    { ...empresa('Farmácia Boa Saúde'), cnpj: '12345678000190' },
    { ...empresa('Distribuidora Sul', { status: 'pendente' }), cnpj: '12ABC34501DE35' },
    { ...empresa('Atacado Norte', { status: 'suspensa' }), cnpj: null },
  ];

  it('busca pelo nome sem diferenciar maiúsculas', () => {
    expect(filtrarEmpresas(lista, 'todas', 'farmácia', new Set()).map((e) => e.nome)).toEqual(['Farmácia Boa Saúde']);
  });

  it('busca pelo CNPJ com pontuação, inclusive o alfanumérico', () => {
    expect(filtrarEmpresas(lista, 'todas', '12.345.678/0001-90', new Set())).toHaveLength(1);
    expect(filtrarEmpresas(lista, 'todas', '12.abc.345', new Set())[0].nome).toBe('Distribuidora Sul');
  });

  it('filtra por situação e por "precisa de atenção"', () => {
    expect(filtrarEmpresas(lista, 'suspensa', '', new Set()).map((e) => e.nome)).toEqual(['Atacado Norte']);
    expect(filtrarEmpresas(lista, 'atencao', '', new Set(['Distribuidora Sul'])).map((e) => e.nome))
      .toEqual(['Distribuidora Sul']);
  });
});
