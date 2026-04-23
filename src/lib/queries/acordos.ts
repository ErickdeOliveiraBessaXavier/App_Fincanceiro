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
      return (data as any[]) ?? [];
    },
  });
}

// ============== Mutations ==============

export function useCreateAcordo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateAcordoInput) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error('Usuário não autenticado');

      const { data: acordoData, error: acordoError } = await supabase
        .from('acordos')
        .insert([
          {
            titulo_id: input.titulo_id,
            cliente_id: input.cliente_id,
            valor_original: input.valor_original,
            valor_acordo: input.valor_acordo,
            desconto: input.desconto,
            parcelas: input.parcelas,
            valor_parcela: input.valor_parcela,
            data_acordo: new Date().toISOString().split('T')[0],
            data_vencimento_primeira_parcela: input.data_vencimento_primeira_parcela,
            status: 'ativo',
            observacoes: input.observacoes,
            created_by: user.id,
          },
        ])
        .select()
        .single();

      if (acordoError) throw acordoError;

      if (acordoData && input.cronograma.length > 0) {
        const parcelasInsert = input.cronograma.map((p) => ({
          acordo_id: acordoData.id,
          numero_parcela: p.numero_parcela,
          valor: p.valor,
          valor_juros: p.valor_juros,
          valor_total: p.valor_total,
          data_vencimento: p.data_vencimento,
          status: 'pendente',
        }));

        const { error: parcelasError } = await supabase
          .from('parcelas_acordo')
          .insert(parcelasInsert);

        if (parcelasError) {
          console.error('Erro ao criar parcelas:', parcelasError);
        }
      }

      return acordoData;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: acordosKeys.all });
      qc.invalidateQueries({ queryKey: titulosKeys.all });
      qc.invalidateQueries({ queryKey: clientesKeys.all });
    },
  });
}

export function useDeleteAcordo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (acordoId: string) => {
      await supabase.from('parcelas_acordo').delete().eq('acordo_id', acordoId);
      const { error } = await supabase.from('acordos').delete().eq('id', acordoId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: acordosKeys.all });
      qc.invalidateQueries({ queryKey: titulosKeys.all });
    },
  });
}
