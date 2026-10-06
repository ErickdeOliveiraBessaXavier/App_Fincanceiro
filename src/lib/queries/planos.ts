import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { calcularUso, type UsoDoPlano } from '@/domain/plano';

/**
 * Plano da empresa (limite de títulos e prazo de acesso).
 *
 * O catálogo (`planos`) é legível por qualquer usuário logado; trocar o plano de
 * uma empresa é só do super admin (`definir_plano_empresa`). O banco recusa a
 * troca feita por qualquer outro caminho.
 */

export interface Plano {
  codigo: string;
  nome: string;
  limite_titulos: number | null;
  dias_teste: number | null;
  valor_mensal: number;
  valor_implantacao: number;
}

export interface PlanoDaEmpresa extends UsoDoPlano {
  plano: string;
  planoNome: string;
  acessoExpiraEm: string | null;
}

interface RespostaUso {
  plano: string;
  plano_nome: string;
  limite: number | null;
  usados: number;
  acesso_expira_em: string | null;
}

export const planosKeys = {
  all: ['planos'] as const,
  catalogo: () => [...planosKeys.all, 'catalogo'] as const,
  uso: (companyId: string | null) => [...planosKeys.all, 'uso', companyId] as const,
};

export function usePlanos(enabled = true) {
  return useQuery({
    queryKey: planosKeys.catalogo(),
    enabled,
    staleTime: 30 * 60 * 1000,
    queryFn: async (): Promise<Plano[]> => {
      const { data, error } = await supabase
        .from('planos')
        .select('codigo, nome, limite_titulos, dias_teste, valor_mensal, valor_implantacao')
        .eq('ativo', true)
        .order('ordem');
      if (error) throw error;
      return data ?? [];
    },
  });
}

/**
 * Uso do plano. Sem `companyId`, a empresa de quem está logado; o super admin
 * informa a empresa (ex.: importação pela Plataforma).
 */
export function useUsoDoPlano(companyId: string | null = null, enabled = true) {
  return useQuery({
    queryKey: planosKeys.uso(companyId),
    enabled,
    staleTime: 60 * 1000,
    queryFn: async (): Promise<PlanoDaEmpresa | null> => {
      const { data, error } = await supabase.rpc('uso_do_plano', { p_company_id: companyId ?? undefined });
      if (error) throw error;
      const r = data as unknown as RespostaUso | null;
      if (!r) return null;
      return {
        ...calcularUso(r.usados, r.limite),
        plano: r.plano,
        planoNome: r.plano_nome,
        acessoExpiraEm: r.acesso_expira_em,
      };
    },
  });
}

export interface DefinirPlanoInput {
  companyId: string;
  plano: string;
  limitePersonalizado: number | null;
  /** ISO; null = plano de teste ganha os dias do plano, os demais ficam sem prazo. */
  acessoExpiraEm: string | null;
}

export function useDefinirPlanoEmpresa() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: DefinirPlanoInput) => {
      const { error } = await supabase.rpc('definir_plano_empresa', {
        p_company_id: input.companyId,
        p_plano: input.plano,
        p_limite_personalizado: input.limitePersonalizado ?? undefined,
        p_acesso_expira_em: input.acessoExpiraEm ?? undefined,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['plataforma'] });
      qc.invalidateQueries({ queryKey: planosKeys.all });
    },
  });
}
