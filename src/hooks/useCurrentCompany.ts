import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface Company {
  id: string;
  nome: string;
  cnpj: string | null;
  slug: string | null;
  status: string;
  plano: string;
}

/**
 * Dados da empresa (tenant) do usuário logado. O company_id vem do JWT;
 * o RLS garante que só a própria empresa é retornada.
 */
export function useCurrentCompany() {
  const { companyId } = useAuth();

  const query = useQuery({
    queryKey: ['current-company', companyId],
    enabled: !!companyId,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<Company | null> => {
      const { data, error } = await supabase
        .from('companies')
        .select('id, nome, cnpj, slug, status, plano')
        .eq('id', companyId!)
        .maybeSingle();
      if (error) throw error;
      return data as Company | null;
    },
  });

  return {
    company: query.data ?? null,
    companyId,
    isLoading: query.isLoading,
  };
}
