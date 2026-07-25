import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { titulosKeys } from './titulos';
import { clientesKeys } from './clientes';

// ============== Types ==============
export interface AcordoRow {
  id: string;
  titulo_id: string;
  cliente_id: string;
  valor_original: number;
  valor_acordo: number;
  desconto: number;
  parcelas: number;
  valor_parcela: number;
  data_acordo: string;
  data_vencimento_primeira_parcela: string;
  status: 'ativo' | 'cumprido' | 'quebrado' | 'cancelado';
  observacoes?: string;
  created_by: string;
  created_at: string;
  updated_at: string;
  titulo: {
    id: string;
    valor_original: number;
    vencimento_original: string;
    numero_documento?: string;
  };
  cliente: {
    id: string;
    nome: string;
    cpf_cnpj: string;
  };
}

export interface ParcelaAcordoInput {
  numero_parcela: number;
  valor: number;
  valor_juros: number;
  valor_total: number;
  data_vencimento: string;
}

export interface ParcelaAcordoRow {
  id: string;
  numero_parcela: number;
  valor: number;
  valor_juros: number;
  valor_total: number;
  data_vencimento: string;
  data_pagamento: string | null;
  status: 'pendente' | 'paga' | 'vencida';
}

export interface CreateAcordoInput {
  titulo_id: string;
  cliente_id: string;
  valor_original: number;
  valor_acordo: number;
  desconto: number;
  parcelas: number;
  valor_parcela: number;
  data_vencimento_primeira_parcela: string;
  observacoes?: string;
  cronograma: ParcelaAcordoInput[];
}

// ============== Query Keys ==============
export const acordosKeys = {
  all: ['acordos'] as const,
  lists: () => [...acordosKeys.all, 'list'] as const,
  list: (filters?: Record<string, unknown>) => [...acordosKeys.lists(), filters ?? {}] as const,
  parcelas: (acordoId: string) => [...acordosKeys.all, 'parcelas', acordoId] as const,
};

// ============== Queries ==============

export function useAcordos() {
  return useQuery({
    queryKey: acordosKeys.list(),
    queryFn: async (): Promise<AcordoRow[]> => {
      const { data, error } = await supabase
        .from('acordos')
        .select(`
          id,
          titulo_id,
          cliente_id,
          valor_original,
          valor_acordo,
          desconto,
          parcelas,
          valor_parcela,
          data_acordo,
          data_vencimento_primeira_parcela,
          status,
          observacoes,
          created_by,
          created_at,
          updated_at,
          titulo:titulos (
            id,
            valor_original,
            vencimento_original,
            numero_documento
          ),
          cliente:clientes (
            id,
            nome,
            cpf_cnpj
          )
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return (data as unknown as AcordoRow[]) ?? [];
    },
  });
}

/**
 * Cronograma (parcelas) de um acordo — usado no modal de detalhes. Ordenado
 * por número da parcela.
 */
export function useParcelasAcordo(acordoId: string | null, enabled = true) {
  return useQuery({
    queryKey: acordosKeys.parcelas(acordoId ?? ''),
    queryFn: async (): Promise<ParcelaAcordoRow[]> => {
      if (!acordoId) return [];
      const { data, error } = await supabase
        .from('parcelas_acordo')
        .select('id, numero_parcela, valor, valor_juros, valor_total, data_vencimento, data_pagamento, status')
        .eq('acordo_id', acordoId)
        .order('numero_parcela');

      if (error) throw error;
      return (data || []) as ParcelaAcordoRow[];
    },
    enabled: enabled && !!acordoId,
  });
}

// ============== Mutations ==============

// Criação atômica via RPC criar_acordo: insere acordo + cronograma e LIQUIDA as
// parcelas originais do título (novação). Antes eram inserts client-side soltos
// que não fechavam o título — origem da inconsistência acordo × pagamento.
export function useCreateAcordo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateAcordoInput) => {
      const { data, error } = await supabase.rpc('criar_acordo', {
        p_titulo_id: input.titulo_id,
        p_cliente_id: input.cliente_id,
        p_valor_original: input.valor_original,
        p_valor_acordo: input.valor_acordo,
        p_desconto: input.desconto,
        p_parcelas: input.parcelas,
        p_valor_parcela: input.valor_parcela,
        p_data_vencimento_primeira_parcela: input.data_vencimento_primeira_parcela,
        p_observacoes: input.observacoes ?? null,
        p_cronograma: input.cronograma,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: acordosKeys.all });
      qc.invalidateQueries({ queryKey: titulosKeys.all });
      qc.invalidateQueries({ queryKey: clientesKeys.all });
    },
  });
}

/**
 * Registra o pagamento de uma parcela do acordo (novação): marca 'paga' + data.
 * O trigger update_acordo_status leva o acordo a 'cumprido' quando todas quitam.
 */
export function usePagarParcelaAcordo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ parcelaAcordoId, dataPagamento }: { parcelaAcordoId: string; dataPagamento?: string }) => {
      const { error } = await supabase.rpc('pagar_parcela_acordo', {
        p_parcela_acordo_id: parcelaAcordoId,
        p_data_pagamento: dataPagamento ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: acordosKeys.all });
      qc.invalidateQueries({ queryKey: titulosKeys.all });
      qc.invalidateQueries({ queryKey: clientesKeys.all });
    },
  });
}

/**
 * Cancelamento (soft delete) de um acordo — financeiro+ (validado pela RLS
 * acordos_update). Marca status='cancelado'; os títulos vinculados deixam de
 * ser 'renegociado' e voltam a ficar disponíveis. Mantém o histórico.
 */
export function useCancelAcordo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (acordoId: string) => {
      // RPC cancelar_acordo: além de marcar 'cancelado', REVERTE a liquidação do
      // título (estorna os eventos 'renegociacao'), fazendo a dívida voltar.
      const { error } = await supabase.rpc('cancelar_acordo', { p_acordo_id: acordoId });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: acordosKeys.all });
      qc.invalidateQueries({ queryKey: titulosKeys.all });
      qc.invalidateQueries({ queryKey: clientesKeys.all });
    },
  });
}

// Hard delete por-acordo não tem entrada na UI: o super admin opera no painel
// da Plataforma (limpeza por empresa). A RPC excluir_acordos_definitivo existe
// no banco como ferramenta de plataforma, mas não é exposta na tela de Acordos.
