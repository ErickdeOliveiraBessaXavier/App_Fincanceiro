import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { titulosKeys } from './titulos';

// ============== Types ==============
export interface ClienteRow {
  id: string;
  nome: string;
  cpf_cnpj: string;
  telefone?: string | null;
  email?: string | null;
  endereco_completo?: string | null;
  cep?: string | null;
  cidade?: string | null;
  estado?: string | null;
  status: string;
  observacoes?: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  total_titulos?: number;
  total_valor?: number;
  ultima_comunicacao?: string;
}

export interface ComunicacaoRow {
  id: string;
  tipo: string;
  assunto: string;
  mensagem?: string | null;
  resultado?: string | null;
  data_contato?: string | null;
  created_at: string;
}

// ============== Query Keys ==============
export const clientesKeys = {
  all: ['clientes'] as const,
  lists: () => [...clientesKeys.all, 'list'] as const,
  list: (filters?: Record<string, unknown>) => [...clientesKeys.lists(), filters ?? {}] as const,
  comunicacoes: (clienteId: string) => [...clientesKeys.all, 'comunicacoes', clienteId] as const,
};

// ============== Queries ==============

/**
 * Lista clientes com agregados (total_titulos, total_valor).
 */
export function useClientes() {
  return useQuery({
    queryKey: clientesKeys.list(),
    queryFn: async (): Promise<ClienteRow[]> => {
      const { data, error } = await supabase
        .from('clientes')
        .select(`
          *,
          titulos (
            id,
            valor_original
          )
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;

      return (data || []).map((c: any) => ({
        ...c,
        total_titulos: c.titulos?.length || 0,
        total_valor:
          c.titulos?.reduce((sum: number, t: any) => sum + (t.valor_original || 0), 0) || 0,
      })) as ClienteRow[];
    },
  });
}

/**
 * Comunicacoes recentes de um cliente.
 */
export function useComunicacoes(clienteId: string | null) {
  return useQuery({
    queryKey: clientesKeys.comunicacoes(clienteId ?? ''),
    queryFn: async (): Promise<ComunicacaoRow[]> => {
      if (!clienteId) return [];
      const { data, error } = await supabase
        .from('comunicacoes')
        .select('*')
        .eq('cliente_id', clienteId)
        .order('created_at', { ascending: false })
        .limit(10);

      if (error) throw error;
      return (data || []) as ComunicacaoRow[];
    },
    enabled: !!clienteId,
  });
}

// ============== Mutations ==============

export interface CreateClienteInput {
  nome: string;
  cpf_cnpj: string;
  telefone?: string;
  email?: string;
  endereco_completo?: string;
  cep?: string;
  cidade?: string;
  estado?: string;
  observacoes?: string;
}

export function useCreateCliente() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateClienteInput) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error('Usuário não autenticado');

      const { data, error } = await supabase
        .from('clientes')
        .insert([
          {
            ...input,
            cpf_cnpj: input.cpf_cnpj.replace(/\D/g, ''),
            status: 'ativo',
            created_by: user.id,
          },
        ])
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: clientesKeys.all });
      // Lista de clientes para selects (em titulosKeys) tambem deve invalidar
      qc.invalidateQueries({ queryKey: titulosKeys.clientes });
    },
  });
}

export interface UpdateClienteInput {
  id: string;
  nome: string;
  cpf_cnpj: string;
  telefone?: string;
  email?: string;
  endereco_completo?: string;
  cep?: string;
  cidade?: string;
  estado?: string;
  observacoes?: string;
  status: string;
}

export function useUpdateCliente() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: UpdateClienteInput) => {
      const { id, ...rest } = input;
      const { error } = await supabase
        .from('clientes')
        .update({
          ...rest,
          cpf_cnpj: rest.cpf_cnpj.replace(/\D/g, ''),
        })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: clientesKeys.all });
      qc.invalidateQueries({ queryKey: titulosKeys.clientes });
    },
  });
}

export function useDeleteCliente() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (clienteId: string) => {
      const { error } = await supabase.from('clientes').delete().eq('id', clienteId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: clientesKeys.all });
      qc.invalidateQueries({ queryKey: titulosKeys.clientes });
    },
  });
}

/**
 * Helper: verifica se ja existe cliente com o CPF/CNPJ informado.
 */
export async function checkCpfCnpjExists(
  cpfCnpj: string,
  excludeId?: string
): Promise<boolean> {
  const cleaned = cpfCnpj.replace(/\D/g, '');
  let query = supabase.from('clientes').select('id').eq('cpf_cnpj', cleaned);
  if (excludeId) query = query.neq('id', excludeId);
  const { data, error } = await query.maybeSingle();
  if (error) {
    console.error('Erro ao verificar CPF/CNPJ:', error);
    return false;
  }
  return data !== null;
}
