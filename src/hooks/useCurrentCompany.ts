import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { buscarSituacaoFinanceira } from '@/lib/queries/assinaturas';

export interface Company {
  id: string;
  nome: string;
  cnpj: string | null;
  slug: string | null;
  status: string;
  plano: string;
  /** Fim do acesso (teste). null = sem prazo. */
  acesso_expira_em: string | null;
  /** Fatura da plataforma atrasada além da tolerância: acesso bloqueado. */
  inadimplente: boolean;
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
      // A inadimplência não é coluna: o banco calcula pelas faturas, que a
      // empresa não lê direto. situacao_financeira responde mesmo bloqueada.
      const [empresa, financeiro] = await Promise.all([
        supabase
          .from('companies')
          .select('id, nome, cnpj, slug, status, plano, acesso_expira_em')
          .eq('id', companyId!)
          .maybeSingle(),
        buscarSituacaoFinanceira(),
      ]);
      if (empresa.error) throw empresa.error;
      if (!empresa.data) return null;
      return { ...empresa.data, inadimplente: financeiro.inadimplente } as Company;
    },
  });

  return {
    company: query.data ?? null,
    companyId,
    isLoading: query.isLoading,
  };
}
