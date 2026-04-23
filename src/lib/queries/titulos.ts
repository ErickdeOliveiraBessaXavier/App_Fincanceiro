import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { TituloConsolidado, Parcela } from '@/utils/titulo';

// ============== Query Keys ==============
export const titulosKeys = {
  all: ['titulos'] as const,
  lists: () => [...titulosKeys.all, 'list'] as const,
  list: (filters?: Record<string, unknown>) => [...titulosKeys.lists(), filters ?? {}] as const,
  parcelas: (tituloId: string) => [...titulosKeys.all, 'parcelas', tituloId] as const,
  clientes: ['titulos', 'clientes-select'] as const,
};

// ============== Queries ==============

/**
 * Lista todos os titulos consolidados (vw_titulos_completos).
 */
export function useTitulos() {
  return useQuery({
    queryKey: titulosKeys.list(),
    queryFn: async (): Promise<TituloConsolidado[]> => {
      const { data, error } = await supabase
        .from('vw_titulos_completos')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return (data || []) as TituloConsolidado[];
    },
  });
}

/**
 * Lista clientes para selects (id, nome, cpf_cnpj).
 */
export function useClientesSelect() {
  return useQuery({
    queryKey: titulosKeys.clientes,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('clientes')
        .select('id, nome, cpf_cnpj')
        .order('nome');

      if (error) throw error;
      return data || [];
    },
  });
}

/**
 * Busca parcelas consolidadas de um titulo especifico.
 */
export function useParcelasByTitulo(tituloId: string | null, enabled = true) {
  return useQuery({
    queryKey: titulosKeys.parcelas(tituloId ?? ''),
    queryFn: async (): Promise<Parcela[]> => {
      if (!tituloId) return [];
      const { data, error } = await supabase
        .from('mv_parcelas_consolidadas')
        .select('*')
        .eq('titulo_id', tituloId)
        .order('numero_parcela');

      if (error) throw error;
      return (data || []) as Parcela[];
    },
    enabled: enabled && !!tituloId,
  });
}

// ============== Mutations ==============

export interface CreateTituloInput {
  cliente_id: string;
  valor_original: number;
  vencimento_original: string;
  descricao?: string | null;
  numero_documento?: string | null;
  numero_parcelas: number;
  intervalo_dias: number;
  created_by: string;
}

/**
 * Cria titulo + parcelas atomicamente via RPC.
 */
export function useCreateTitulo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateTituloInput) => {
      const { data, error } = await supabase.rpc('criar_titulo_com_parcelas', {
        p_cliente_id: input.cliente_id,
        p_valor_original: input.valor_original,
        p_vencimento_original: input.vencimento_original,
        p_descricao: input.descricao ?? null,
        p_numero_documento: input.numero_documento ?? null,
        p_numero_parcelas: input.numero_parcelas,
        p_intervalo_dias: input.intervalo_dias,
        p_created_by: input.created_by,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: titulosKeys.all });
    },
  });
}

/**
 * Exclui um titulo (e parcelas/eventos relacionados) e refresca a MV.
 */
export function useDeleteTitulo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (tituloId: string) => {
      const { data: parcelas } = await supabase
        .from('parcelas')
        .select('id')
        .eq('titulo_id', tituloId);

      if (parcelas && parcelas.length > 0) {
        const parcelaIds = parcelas.map((p) => p.id);
        await supabase.from('eventos_parcela').delete().in('parcela_id', parcelaIds);
      }

      await supabase.from('parcelas').delete().eq('titulo_id', tituloId);

      const { error } = await supabase.from('titulos').delete().eq('id', tituloId);
      if (error) throw error;

      await supabase.rpc('refresh_mv_parcelas');
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: titulosKeys.all });
    },
  });
}

/**
 * Refresca MV + invalida queries (use apos pagamento/encargo/desconto).
 */
export function useRefreshTitulos() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      await supabase.rpc('refresh_mv_parcelas');
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: titulosKeys.all });
    },
  });
}
