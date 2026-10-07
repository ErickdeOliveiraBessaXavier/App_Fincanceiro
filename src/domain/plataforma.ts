/**
 * O que precisa da atenção do super admin, empresa a empresa: a lista do topo
 * da Plataforma. Cada item já diz o que fazer e em que aba resolver, para quem
 * não conhece o painel não precisar caçar o lugar certo.
 */
import { calcularUso, diasRestantes } from '@/domain/plano';
import type { ResumoCobrancaEmpresa } from '@/domain/assinatura';
import { normalizarDocumento } from '@/utils/format';

/** Abas da janela "Gerenciar empresa". */
export type AbaEmpresa = 'plano' | 'cobranca' | 'integracao';

export type Gravidade = 'alta' | 'media';

export interface Pendencia {
  companyId: string;
  empresa: string;
  texto: string;
  gravidade: Gravidade;
  /** 'aprovar' aprova direto; as demais abrem a empresa naquela aba. */
  acao: 'aprovar' | AbaEmpresa;
  rotuloAcao: string;
}

export interface EmpresaAvaliada {
  id: string;
  nome: string;
  status: string;
  plano: string;
  acesso_expira_em: string | null;
}

export interface ContextoPendencias {
  /** Títulos contabilizados e limite efetivo; ausente enquanto carrega. */
  uso: Map<string, { usados: number; limite: number | null }>;
  /** Cobrança por empresa; `mensal` null = sem assinatura ativa. */
  cobranca: Map<string, ResumoCobrancaEmpresa & { mensal: number | null }>;
  /** Planos com mensalidade (os que exigem contrato de cobrança). */
  planosPagos: Set<string>;
  /** false enquanto a cobrança carrega: evita acusar "sem cobrança" de todo mundo. */
  cobrancaCarregada: boolean;
  agora?: Date;
}

/** A partir de quantos dias o fim do prazo de acesso vira aviso. */
export const DIAS_AVISO_PRAZO = 7;

type Regra = (e: EmpresaAvaliada, ctx: ContextoPendencias) => Omit<Pendencia, 'companyId' | 'empresa'> | null;

const regraCobranca: Regra = (e, ctx) => {
  const situacao = ctx.cobranca.get(e.id)?.situacao;
  if (situacao === 'bloqueando') {
    return { texto: 'Mensalidade em atraso: acesso bloqueado', gravidade: 'alta', acao: 'cobranca', rotuloAcao: 'Ver cobrança' };
  }
  if (situacao === 'vencida') {
    return { texto: 'Fatura vencida', gravidade: 'media', acao: 'cobranca', rotuloAcao: 'Ver cobrança' };
  }
  return null;
};

const regraPrazo: Regra = (e, ctx) => {
  const dias = diasRestantes(e.acesso_expira_em, ctx.agora);
  if (dias === null || dias > DIAS_AVISO_PRAZO) return null;
  if (dias === 0) {
    return { texto: 'Prazo de acesso vencido: empresa sem acesso', gravidade: 'alta', acao: 'plano', rotuloAcao: 'Liberar acesso' };
  }
  const quando = dias === 1 ? 'amanhã' : `em ${dias} dias`;
  return { texto: `Acesso termina ${quando}`, gravidade: 'media', acao: 'plano', rotuloAcao: 'Ver plano' };
};

const regraLimite: Regra = (e, ctx) => {
  const m = ctx.uso.get(e.id);
  if (!m) return null;
  const uso = calcularUso(m.usados, m.limite);
  if (uso.faixa === 'esgotado') {
    return { texto: 'Limite de títulos atingido: não cadastra títulos novos', gravidade: 'alta', acao: 'plano', rotuloAcao: 'Aumentar limite' };
  }
  if (uso.faixa === 'critico') {
    return { texto: `Perto do limite de títulos (${uso.percentual}%)`, gravidade: 'media', acao: 'plano', rotuloAcao: 'Ver plano' };
  }
  return null;
};

const regraSemContrato: Regra = (e, ctx) => {
  if (!ctx.cobrancaCarregada || !ctx.planosPagos.has(e.plano)) return null;
  if (ctx.cobranca.get(e.id)?.mensal !== null) return null;
  return { texto: 'Plano pago sem cobrança cadastrada', gravidade: 'media', acao: 'cobranca', rotuloAcao: 'Cadastrar cobrança' };
};

/** Só empresa ativa tem o que acompanhar; suspensa e cancelada já foram decididas. */
const REGRAS_DA_ATIVA: Regra[] = [regraCobranca, regraPrazo, regraLimite, regraSemContrato];

function pendenciasDaEmpresa(e: EmpresaAvaliada, ctx: ContextoPendencias): Pendencia[] {
  const base = { companyId: e.id, empresa: e.nome };
  if (e.status === 'pendente') {
    return [{ ...base, texto: 'Cadastro aguardando aprovação', gravidade: 'alta', acao: 'aprovar', rotuloAcao: 'Aprovar' }];
  }
  if (e.status !== 'ativa') return [];
  return REGRAS_DA_ATIVA
    .map((regra) => regra(e, ctx))
    .filter((p): p is NonNullable<typeof p> => p !== null)
    .map((p) => ({ ...base, ...p }));
}

const PESO: Record<Gravidade, number> = { alta: 0, media: 1 };

/** Todas as pendências, as graves primeiro e, dentro delas, por empresa. */
export function listarPendencias(empresas: EmpresaAvaliada[], ctx: ContextoPendencias): Pendencia[] {
  return empresas
    .flatMap((e) => pendenciasDaEmpresa(e, ctx))
    .sort((a, b) => PESO[a.gravidade] - PESO[b.gravidade] || a.empresa.localeCompare(b.empresa, 'pt-BR'));
}

// ===================== Filtro da tabela de empresas =====================

export type FiltroEmpresas = 'todas' | 'atencao' | 'pendente' | 'ativa' | 'suspensa';

function casaBusca(e: EmpresaAvaliada & { cnpj: string | null }, busca: string): boolean {
  const termo = busca.trim().toLowerCase();
  if (!termo) return true;
  if (e.nome.toLowerCase().includes(termo)) return true;
  const doc = normalizarDocumento(termo);
  return !!doc && normalizarDocumento(e.cnpj).includes(doc);
}

/** Busca por nome ou CNPJ (com ou sem pontuação) e filtro por situação. */
export function filtrarEmpresas<T extends EmpresaAvaliada & { cnpj: string | null }>(
  empresas: T[],
  filtro: FiltroEmpresas,
  busca: string,
  comPendencia: Set<string>,
): T[] {
  return empresas.filter((e) => {
    if (filtro === 'atencao' && !comPendencia.has(e.id)) return false;
    if (filtro !== 'todas' && filtro !== 'atencao' && e.status !== filtro) return false;
    return casaBusca(e, busca);
  });
}
