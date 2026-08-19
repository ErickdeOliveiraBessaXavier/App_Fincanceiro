import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * Chaves de API por empresa — a credencial que o ERP do cliente usa para falar
 * com a Edge Function `api-v1`.
 *
 * A chave em claro só existe uma vez, na resposta de `criar-chave-api`. Aqui só
 * trafega o prefixo (`erp_live_a1b2…`), o suficiente para a tela dizer QUAL
 * chave é sem nunca revelar o resto. Quem perde a chave gera outra e revoga a
 * antiga — não há como recuperá-la.
 *
 * Isto é decisão de plataforma (o que foi liberado para qual cliente), por isso
 * vive na página Plataforma e só o super admin enxerga.
 */

export interface ChaveApi {
  id: string;
  company_id: string;
  nome: string;
  key_prefix: string;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
  ativa: boolean;
}

export const chavesApiKeys = {
  all: ['chaves-api'] as const,
  daEmpresa: (companyId: string) => [...chavesApiKeys.all, companyId] as const,
};

export function useChavesApi(companyId: string | null) {
  return useQuery({
    queryKey: chavesApiKeys.daEmpresa(companyId ?? ''),
    enabled: !!companyId,
    queryFn: async (): Promise<ChaveApi[]> => {
      const { data, error } = await supabase
        .from('vw_api_keys')
        .select('id, company_id, nome, key_prefix, created_at, last_used_at, revoked_at, ativa')
        .eq('company_id', companyId!)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as ChaveApi[];
    },
  });
}

export interface ChaveGerada {
  id: string;
  chave: string;
  key_prefix: string;
  created_at: string;
}

export function useCriarChaveApi() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ companyId, nome }: { companyId: string; nome: string }): Promise<ChaveGerada> => {
      const { data, error } = await supabase.functions.invoke('criar-chave-api', {
        body: { company_id: companyId, nome },
      });
      if (error) throw error;
      if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error);
      return data as ChaveGerada;
    },
    onSuccess: (_d, { companyId }) => {
      qc.invalidateQueries({ queryKey: chavesApiKeys.daEmpresa(companyId) });
    },
  });
}

export function useRevogarChaveApi() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id }: { id: string; companyId: string }) => {
      const { error } = await supabase.rpc('revogar_chave_api', { p_id: id });
      if (error) throw error;
    },
    onSuccess: (_d, { companyId }) => {
      qc.invalidateQueries({ queryKey: chavesApiKeys.daEmpresa(companyId) });
    },
  });
}
