import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { getCurrentCompanyId } from '@/lib/currentCompany';
import { clientesKeys } from './clientes';

// ============== Types ==============
export interface VendedorRow {
  id: string;
  nome: string;
  email?: string | null;
  telefone?: string | null;
  ativo: boolean;
  created_at: string;
  /** Quantidade de clientes na carteira de vendas do vendedor. */
  carteira: number;
  /** user_id do login vinculado (null = ainda sem acesso ao sistema). */
  user_id?: string | null;
}

export const vendedoresKeys = {
  all: ['vendedores'] as const,
  list: () => [...vendedoresKeys.all, 'list'] as const,
};

// ============== Queries ==============
export function useVendedores() {
  return useQuery({
    queryKey: vendedoresKeys.list(),
    queryFn: async (): Promise<VendedorRow[]> => {
      const { data, error } = await supabase
        .from('vendedores')
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
export interface CreateVendedorInput {
  nome: string;
  email?: string;
  telefone?: string;
}

export function useCreateVendedor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateVendedorInput) => {
      const companyId = await getCurrentCompanyId();
      if (!companyId) throw new Error('Empresa não identificada');
      const { error } = await supabase.from('vendedores').insert({
        company_id: companyId,
        nome: input.nome.trim(),
        email: input.email?.trim() || null,
        telefone: input.telefone?.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: vendedoresKeys.all });
      qc.invalidateQueries({ queryKey: clientesKeys.all });
    },
  });
}

export interface UpdateVendedorInput {
  id: string;
  nome?: string;
  email?: string | null;
  telefone?: string | null;
  ativo?: boolean;
}

export function useUpdateVendedor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...rest }: UpdateVendedorInput) => {
      const { error } = await supabase.from('vendedores').update(rest).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: vendedoresKeys.all });
      qc.invalidateQueries({ queryKey: clientesKeys.all });
    },
  });
}

// Exclusão restrita a admin (RLS: vendedores_delete_admin). Os clientes da
// carteira não são apagados — a FK clientes.vendedor_id é ON DELETE SET NULL,
// então eles apenas ficam sem vendedor.
export function useDeleteVendedor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('vendedores').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: vendedoresKeys.all });
      qc.invalidateQueries({ queryKey: clientesKeys.all });
    },
  });
}
