import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { RANK, papeisValidos, papelMaisAlto, type AppRole } from '@/domain/perfis';

export type { AppRole };

// Cache leve da role no localStorage para o menu não "piscar" no reload.
// É só UX/visibilidade — a segurança real continua na RLS do banco.
const storageKey = (userId: string) => `user-roles:${userId}`;

const readCachedRoles = (userId?: string): AppRole[] | undefined => {
  if (!userId) return undefined;
  try {
    const raw = localStorage.getItem(storageKey(userId));
    return raw ? papeisValidos(JSON.parse(raw)) : undefined;
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
      const roles = papeisValidos((data || []).map((r) => r.role));
      try {
        if (userId) localStorage.setItem(storageKey(userId), JSON.stringify(roles));
      } catch {
        /* localStorage indisponível: segue sem cache */
      }
      return roles;
    },
  });

  const roles = query.data ?? [];
  const highest = papelMaisAlto(roles);

  const hasMinRole = (min: AppRole) =>
    highest ? RANK[highest] >= RANK[min] : false;

  return {
    roles,
    role: highest,
    isSuperAdmin: roles.includes('super_admin'),
    isAdmin: hasMinRole('admin'),
    isOperador: hasMinRole('operador'),
    isVendedor: highest === 'vendedor',
    hasMinRole,
    isLoading: query.isLoading,
  };
}
