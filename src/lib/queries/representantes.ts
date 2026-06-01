import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { clientesKeys } from './clientes';

// ============== Types ==============
export interface RepresentanteRow {
  id: string;
  nome: string;
  email?: string | null;
  telefone?: string | null;
  ativo: boolean;
  created_at: string;
  /** Quantidade de clientes na carteira do representante. */
  carteira: number;
}

export const representantesKeys = {
  all: ['representantes'] as const,
  list: () => [...representantesKeys.all, 'list'] as const,
};

// ============== Queries ==============
export function useRepresentantes() {
  return useQuery({
    queryKey: representantesKeys.list(),
    queryFn: async (): Promise<RepresentanteRow[]> => {
      const { data, error } = await supabase
        .from('representantes')
        .select('id, nome, email, telefone, ativo, created_at, clientes(count)')
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
        carteira: r.clientes?.[0]?.count ?? 0,
      }));
    },
  });
}

// ============== Mutations ==============
export interface CreateRepresentanteInput {
  nome: string;
  email?: string;
  telefone?: string;
}

export function useCreateRepresentante() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateRepresentanteInput) => {
      const { error } = await supabase.from('representantes').insert({
        nome: input.nome.trim(),
        email: input.email?.trim() || null,
        telefone: input.telefone?.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: representantesKeys.all });
      qc.invalidateQueries({ queryKey: clientesKeys.all });
    },
  });
}

export interface UpdateRepresentanteInput {
  id: string;
  nome?: string;
  email?: string | null;
  telefone?: string | null;
  ativo?: boolean;
}

export function useUpdateRepresentante() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...rest }: UpdateRepresentanteInput) => {
      const { error } = await supabase.from('representantes').update(rest).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: representantesKeys.all });
      qc.invalidateQueries({ queryKey: clientesKeys.all });
    },
  });
}
