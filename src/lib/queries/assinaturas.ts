import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { FaturaAssinatura } from '@/domain/assinatura';

/**
 * Cobrança da plataforma (implantação + mensalidade).
 *
 * As tabelas só são legíveis pelo super admin. A empresa vê a própria situação
 * por `situacao_financeira()`, que responde mesmo com a empresa bloqueada.
 * Toda escrita passa por RPC; o banco recusa qualquer outro caminho.
 */

export interface Assinatura {
  company_id: string;
  valor_mensal_personalizado: number | null;
  dia_vencimento: number;
  inicio_cobranca: string;
  dias_tolerancia: number;
  ativa: boolean;
}

export interface FaturaDaEmpresa extends FaturaAssinatura {
  company_id: string;
}

/** O que a empresa logada sabe da própria cobrança. Sem `assinatura` e `faturas` para quem não é admin. */
export interface SituacaoFinanceira {
  inadimplente: boolean;
  assinatura?: {
    valor_mensal: number;
    dia_vencimento: number;
    inicio_cobranca: string;
    dias_tolerancia: number;
    ativa: boolean;
  } | null;
  faturas?: FaturaAssinatura[];
}

export const assinaturasKeys = {
  all: ['assinaturas'] as const,
  minha: () => [...assinaturasKeys.all, 'minha'] as const,
  plataforma: () => [...assinaturasKeys.all, 'plataforma'] as const,
  empresa: (companyId: string | null) => [...assinaturasKeys.all, 'empresa', companyId] as const,
};

const CAMPOS_FATURA = 'id, company_id, tipo, competencia, vencimento, valor, status, pago_em, forma_pagamento, observacao';

export async function buscarSituacaoFinanceira(): Promise<SituacaoFinanceira> {
  const { data, error } = await supabase.rpc('situacao_financeira');
  if (error) throw error;
  return data as unknown as SituacaoFinanceira;
}

export function useSituacaoFinanceira(enabled = true) {
  return useQuery({
    queryKey: assinaturasKeys.minha(),
    enabled,
    staleTime: 5 * 60 * 1000,
    queryFn: buscarSituacaoFinanceira,
  });
}

/** Super admin: assinaturas e faturas em aberto de todas as empresas (tabela da Plataforma). */
export function useCobrancaPlataforma(enabled = true) {
  return useQuery({
    queryKey: assinaturasKeys.plataforma(),
    enabled,
    queryFn: async () => {
      const [assinaturas, faturas] = await Promise.all([
        supabase.from('assinaturas')
          .select('company_id, valor_mensal_personalizado, dia_vencimento, inicio_cobranca, dias_tolerancia, ativa'),
        supabase.from('faturas_assinatura').select(CAMPOS_FATURA).eq('status', 'aberta'),
      ]);
      if (assinaturas.error) throw assinaturas.error;
      if (faturas.error) throw faturas.error;
      return {
        assinaturas: (assinaturas.data ?? []) as Assinatura[],
        faturasAbertas: (faturas.data ?? []) as FaturaDaEmpresa[],
      };
    },
  });
}

/** Super admin: assinatura e histórico de faturas de uma empresa. */
export function useCobrancaEmpresa(companyId: string | null) {
  return useQuery({
    queryKey: assinaturasKeys.empresa(companyId),
    enabled: !!companyId,
    queryFn: async () => {
      const [assinatura, faturas] = await Promise.all([
        supabase.from('assinaturas')
          .select('company_id, valor_mensal_personalizado, dia_vencimento, inicio_cobranca, dias_tolerancia, ativa')
          .eq('company_id', companyId!)
          .maybeSingle(),
        supabase.from('faturas_assinatura')
          .select(CAMPOS_FATURA)
          .eq('company_id', companyId!)
          .order('vencimento', { ascending: false }),
      ]);
      if (assinatura.error) throw assinatura.error;
      if (faturas.error) throw faturas.error;
      return {
        assinatura: assinatura.data as Assinatura | null,
        faturas: (faturas.data ?? []) as FaturaDaEmpresa[],
      };
    },
  });
}

// ===================== Mutações (super admin) =====================

/** O builder do Supabase é "thenable", não Promise: basta poder ser aguardado. */
function useMutacaoCobranca<T>(executar: (input: T) => PromiseLike<{ error: unknown }>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: T) => {
      const { error } = await executar(input);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: assinaturasKeys.all });
      qc.invalidateQueries({ queryKey: ['planos'] });
    },
  });
}

export interface SalvarAssinaturaInput {
  companyId: string;
  diaVencimento: number;
  inicioCobranca: string;
  valorMensalPersonalizado: number | null;
  diasTolerancia: number;
  /** 0 = sem fatura de implantação (ou já emitida). */
  valorImplantacao: number;
  vencimentoImplantacao: string | null;
}

export function useSalvarAssinatura() {
  return useMutacaoCobranca((i: SalvarAssinaturaInput) => supabase.rpc('salvar_assinatura', {
    p_company_id: i.companyId,
    p_dia_vencimento: i.diaVencimento,
    p_inicio_cobranca: i.inicioCobranca,
    p_valor_mensal_personalizado: i.valorMensalPersonalizado ?? undefined,
    p_dias_tolerancia: i.diasTolerancia,
    p_valor_implantacao: i.valorImplantacao,
    p_vencimento_implantacao: i.vencimentoImplantacao ?? undefined,
  }));
}

export function useEncerrarAssinatura() {
  return useMutacaoCobranca((companyId: string) =>
    supabase.rpc('encerrar_assinatura', { p_company_id: companyId }));
}

export function useRegistrarPagamentoFatura() {
  return useMutacaoCobranca((i: { faturaId: string; pagoEm: string; forma: string; observacao: string }) =>
    supabase.rpc('registrar_pagamento_fatura', {
      p_fatura_id: i.faturaId,
      p_pago_em: i.pagoEm,
      p_forma_pagamento: i.forma || undefined,
      p_observacao: i.observacao || undefined,
    }));
}

export function useEstornarPagamentoFatura() {
  return useMutacaoCobranca((i: { faturaId: string; motivo: string }) =>
    supabase.rpc('estornar_pagamento_fatura', { p_fatura_id: i.faturaId, p_motivo: i.motivo }));
}

export function useCancelarFatura() {
  return useMutacaoCobranca((i: { faturaId: string; motivo: string }) =>
    supabase.rpc('cancelar_fatura', { p_fatura_id: i.faturaId, p_motivo: i.motivo }));
}

export function useAlterarValorFatura() {
  return useMutacaoCobranca((i: { faturaId: string; valor: number; motivo: string }) =>
    supabase.rpc('alterar_valor_fatura', { p_fatura_id: i.faturaId, p_valor: i.valor, p_motivo: i.motivo }));
}

export function useDefinirPrecosPlano() {
  return useMutacaoCobranca((i: { codigo: string; valorMensal: number; valorImplantacao: number }) =>
    supabase.rpc('definir_precos_plano', {
      p_codigo: i.codigo,
      p_valor_mensal: i.valorMensal,
      p_valor_implantacao: i.valorImplantacao,
    }));
}

export interface DefinirExcedenteInput {
  codigo: string;
  /** null desliga a regra. */
  blocoTitulos: number | null;
  valorMensal: number;
  valorImplantacao: number;
}

export function useDefinirExcedentePlano() {
  return useMutacaoCobranca((i: DefinirExcedenteInput) => supabase.rpc('definir_excedente_plano', {
    p_codigo: i.codigo,
    p_bloco_titulos: i.blocoTitulos ?? undefined,
    p_valor_mensal: i.valorMensal,
    p_valor_implantacao: i.valorImplantacao,
  }));
}
