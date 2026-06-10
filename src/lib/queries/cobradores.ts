import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { clientesKeys } from './clientes';

// ============== Types ==============
export interface CobradorRow {
  id: string;
  nome: string;
  email?: string | null;
  telefone?: string | null;
  ativo: boolean;
  created_at: string;
  /** Quantidade de clientes na carteira do cobrador. */
  carteira: number;
  /** user_id do login vinculado (null = ainda sem acesso ao sistema). */
  user_id?: string | null;
}

export const cobradoresKeys = {
  all: ['cobradores'] as const,
  list: () => [...cobradoresKeys.all, 'list'] as const,
};

// ============== Queries ==============
export function useCobradores() {
  return useQuery({
    queryKey: cobradoresKeys.list(),
    queryFn: async (): Promise<CobradorRow[]> => {
      const { data, error } = await supabase
        .from('cobradores')
        .select('id, nome, email, telefone, ativo, created_at, user_id, clientes(count)')
        .is('deleted_at', null)
        .order('nome');
      if (error) throw error;
      return (data || []).map((r: any) => ({
        id: r.id,
        nome: r.nome,
        email: r.email,
        telefone: r.telefone,
        ativo: r.ativo,
        created_at: r.created_at,
        user_id: r.user_id ?? null,
        carteira: r.clientes?.[0]?.count ?? 0,
      }));
    },
  });
}

// ============== Mutations ==============
export interface CreateCobradorInput {
  nome: string;
  email?: string;
  telefone?: string;
}

export function useCreateCobrador() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateCobradorInput) => {
      const { error } = await supabase.from('cobradores').insert({
        nome: input.nome.trim(),
        email: input.email?.trim() || null,
        telefone: input.telefone?.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: cobradoresKeys.all });
      qc.invalidateQueries({ queryKey: clientesKeys.all });
    },
  });
}

export interface UpdateCobradorInput {
  id: string;
  nome?: string;
  email?: string | null;
  telefone?: string | null;
  ativo?: boolean;
}

export function useUpdateCobrador() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...rest }: UpdateCobradorInput) => {
      const { error } = await supabase.from('cobradores').update(rest).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: cobradoresKeys.all });
      qc.invalidateQueries({ queryKey: clientesKeys.all });
    },
  });
}

// Exclusão restrita a admin (RLS: cobradores_delete_admin). Os clientes da
// carteira não são apagados — a FK clientes.cobrador_id é ON DELETE SET NULL,
// então eles apenas ficam sem cobrador.
export function useDeleteCobrador() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('cobradores').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: cobradoresKeys.all });
      qc.invalidateQueries({ queryKey: clientesKeys.all });
    },
  });
}
