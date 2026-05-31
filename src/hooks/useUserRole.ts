import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export type AppRole = 'leitura' | 'operador' | 'financeiro' | 'admin' | 'super_admin';

const RANK: Record<AppRole, number> = {
  leitura: 1,
  operador: 2,
  financeiro: 3,
  admin: 4,
  super_admin: 5,
};

export function useUserRole() {
  const { user } = useAuth();
  const userId = user?.id;

  const query = useQuery({
    queryKey: ['user-roles', userId],
    enabled: !!userId,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<AppRole[]> => {
      const { data, error } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', userId!);
      if (error) throw error;
      return (data || []).map((r: any) => r.role as AppRole);
    },
  });

  const roles = query.data ?? [];
  const highest: AppRole | null = roles.length
    ? (roles.reduce((a, b) => (RANK[a] >= RANK[b] ? a : b)) as AppRole)
    : null;

  const hasMinRole = (min: AppRole) =>
    highest ? RANK[highest] >= RANK[min] : false;

  return {
    roles,
    role: highest,
    isSuperAdmin: roles.includes('super_admin'),
    isAdmin: hasMinRole('admin'),
    isFinanceiro: hasMinRole('financeiro'),
    isOperador: hasMinRole('operador'),
    isReadOnly: highest === 'leitura',
    hasMinRole,
    isLoading: query.isLoading,
  };
}
