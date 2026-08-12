import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { getCurrentCompanyId } from '@/lib/currentCompany';

/**
 * Parâmetros de negócio da empresa.
 *
 * O teto de desconto precisava de um lugar (companies só tem nome/cnpj/plano/
 * status) e a meta do Dashboard estava fixa em META_MENSAL = 50000 no código,
 * com um TODO(gestor) ao lado. As duas moram aqui.
 *
 * A leitura é liberada para a empresa inteira porque o operador precisa saber
 * se o desconto está habilitado; a escrita é do admin (RLS).
 */

export interface ConfiguracaoEmpresa {
  company_id: string;
  /** 0 = desconto desabilitado. */
  desconto_maximo_percentual: number;
  /** 0 = sem meta definida; o Dashboard omite a barra de progresso. */
  meta_recuperacao_mensal: number;
}

export const configuracoesKeys = {
  all: ['configuracoes'] as const,
  empresa: () => [...configuracoesKeys.all, 'empresa'] as const,
};

export function useConfiguracaoEmpresa() {
  return useQuery({
    queryKey: configuracoesKeys.empresa(),
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<ConfiguracaoEmpresa | null> => {
      const { data, error } = await supabase
        .from('configuracoes_empresa')
        .select('company_id, desconto_maximo_percentual, meta_recuperacao_mensal')
        .maybeSingle();
      if (error) throw error;
      return (data as ConfiguracaoEmpresa | null) ?? null;
    },
  });
}

export interface SalvarConfiguracaoInput {
  descontoMaximoPercentual: number;
  metaRecuperacaoMensal: number;
}

export function useSalvarConfiguracaoEmpresa() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: SalvarConfiguracaoInput) => {
      const companyId = await getCurrentCompanyId();
      if (!companyId) throw new Error('Empresa não identificada');

      const { error } = await supabase
        .from('configuracoes_empresa')
        .upsert({
          company_id: companyId,
          desconto_maximo_percentual: input.descontoMaximoPercentual,
          meta_recuperacao_mensal: input.metaRecuperacaoMensal,
        }, { onConflict: 'company_id' });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: configuracoesKeys.all }),
  });
}

/** Teto em reais para uma parcela, ou 0 quando o desconto está desabilitado. */
export function tetoDescontoEmReais(
  config: ConfiguracaoEmpresa | null | undefined,
  valorTotalParcela: number,
): number {
  const percentual = config?.desconto_maximo_percentual ?? 0;
  if (percentual <= 0) return 0;
  return Math.round(valorTotalParcela * percentual) / 100;
}
