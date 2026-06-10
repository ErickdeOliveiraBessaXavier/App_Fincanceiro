import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export type AppRole = 'leitura' | 'vendedor' | 'operador' | 'financeiro' | 'admin' | 'super_admin';

// Espelha public.role_rank no banco: 'vendedor' fica abaixo de 'operador'
// (read-only). Só a ordem relativa importa.
const RANK: Record<AppRole, number> = {
  leitura: 1,
  vendedor: 2,
  operador: 3,
  financeiro: 4,
  admin: 5,
  super_admin: 6,
};

// Cache leve da role no localStorage para o menu não "piscar" no reload.
// É só UX/visibilidade — a segurança real continua na RLS do banco.
const storageKey = (userId: string) => `user-roles:${userId}`;
const readCachedRoles = (userId?: string): AppRole[] | undefined => {
  if (!userId) return undefined;
  try {
    const raw = localStorage.getItem(storageKey(userId));
    return raw ? (JSON.parse(raw) as AppRole[]) : undefined;
  } catch {
    return undefined;
  }
};

export function useUserRole() {
  const { user } = useAuth();
  const userId = user?.id;

  const query = useQuery({
    queryKey: ['user-roles', userId],
    enabled: !!userId,
    staleTime: 5 * 60 * 1000,
    // Mostra a role do último acesso na hora (sem flash) e revalida em background.
    initialData: () => readCachedRoles(userId),
    initialDataUpdatedAt: 0,
    queryFn: async (): Promise<AppRole[]> => {
      const { data, error } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', userId!);
      if (error) throw error;
      const roles = (data || []).map((r: any) => r.role as AppRole);
      try {
        if (userId) localStorage.setItem(storageKey(userId), JSON.stringify(roles));
      } catch {
        /* localStorage indisponível: segue sem cache */
      }
      return roles;
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
    isVendedor: highest === 'vendedor',
    isReadOnly: highest === 'leitura',
    hasMinRole,
    isLoading: query.isLoading,
  };
}
