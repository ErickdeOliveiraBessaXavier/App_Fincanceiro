import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';
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
  /**
   * Todos os títulos incluídos no acordo (acordo_titulos).
   *
   * A coluna `titulo_id` é do tempo em que um acordo cobria um título só; a
   * lista mostrava apenas esse documento e um acordo consolidado aparecia como
   * se cobrisse um título — informação errada, não só incompleta.
   */
  titulos: TituloDoAcordo[];
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
  /** Juros do PARCELAMENTO, fixado na criação do acordo. Não é encargo de atraso. */
  valor_juros: number;
  valor_total: number;
  data_vencimento: string;
  data_pagamento: string | null;
  status: 'pendente' | 'paga' | 'vencida';
  /** Somatório dos pagamentos não estornados. */
  total_pago: number;
  /** Juros e multa por atraso lançados nesta parcela. */
  encargos: number;
  descontos: number;
  /** valor_total + encargos − pagamentos − descontos. Zero ou menos = quitada. */
  saldo_atual: number;
}

/** Um lançamento do razão da parcela de acordo. */
export interface EventoParcelaAcordo {
  id: string;
  tipo: 'pagamento_total' | 'pagamento_parcial' | 'juros_aplicado' | 'multa_aplicada' | 'desconto_concedido' | 'estorno';
  valor: number;
  data_evento: string;
  descricao: string | null;
  meio_pagamento: string | null;
  estornado: boolean;
  created_at: string;
}

export interface CreateAcordoInput {
  titulo_ids: string[];
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

export interface TituloDoAcordo {
  id: string;
  numero_documento: string | null;
}

// ============== Query Keys ==============
export const acordosKeys = {
  all: ['acordos'] as const,
  lists: () => [...acordosKeys.all, 'list'] as const,
  list: (filters?: Record<string, unknown>) => [...acordosKeys.lists(), filters ?? {}] as const,
  parcelas: (acordoId: string) => [...acordosKeys.all, 'parcelas', acordoId] as const,
  eventosParcela: (parcelaId: string) => [...acordosKeys.all, 'eventos', parcelaId] as const,
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
          acordo_titulos ( titulos ( id, numero_documento ) ),
          cliente:clientes (
            id,
            nome,
            cpf_cnpj
          )
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;

      type LinhaVinculo = { titulos: TituloDoAcordo | null };
      return ((data ?? []) as unknown as Array<AcordoRow & { acordo_titulos?: LinhaVinculo[] }>)
        .map((a) => ({
          ...a,
          // Fallback no vínculo legado para acordos anteriores à acordo_titulos.
          titulos: (a.acordo_titulos ?? [])
            .map((v) => v.titulos)
            .filter((t): t is TituloDoAcordo => !!t),
        }));
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
      // A view traz o saldo derivado do razão; a tabela crua só sabe o previsto.
      const { data, error } = await supabase
        .from('vw_parcelas_acordo_tenant')
        .select('id, numero_parcela, valor, valor_juros, valor_total, data_vencimento, data_pagamento, status, total_pago, encargos, descontos, saldo_atual')
        .eq('acordo_id', acordoId)
        .order('numero_parcela');

      if (error) throw error;
      return (data || []) as unknown as ParcelaAcordoRow[];
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
        p_titulo_ids: input.titulo_ids,
        p_cliente_id: input.cliente_id,
        p_valor_original: input.valor_original,
        p_valor_acordo: input.valor_acordo,
        p_desconto: input.desconto,
        p_parcelas: input.parcelas,
        p_valor_parcela: input.valor_parcela,
        p_data_vencimento_primeira_parcela: input.data_vencimento_primeira_parcela,
        p_observacoes: input.observacoes ?? null,
        p_cronograma: input.cronograma as unknown as Json,
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
export interface PagarParcelaAcordoInput {
  parcelaAcordoId: string;
  /**
   * O que ENTROU, não o previsto. Acima do saldo o excedente vira encargo de
   * atraso; abaixo, a parcela continua aberta pela diferença.
   */
  valor: number;
  dataPagamento?: string;
  meioPagamento?: string;
  descricao?: string;
  /**
   * Desconto por antecipação, abatido antes do pagamento. Exige admin, teto
   * configurado na empresa e pagamento até o vencimento — o banco valida.
   */
  desconto?: number;
  motivoDesconto?: string;
}

export function usePagarParcelaAcordo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: PagarParcelaAcordoInput) => {
      const { error } = await supabase.rpc('pagar_parcela_acordo', {
        p_parcela_acordo_id: input.parcelaAcordoId,
        p_valor: input.valor,
        p_data_pagamento: input.dataPagamento ?? null,
        p_meio_pagamento: input.meioPagamento ?? null,
        p_descricao: input.descricao ?? null,
        p_desconto: input.desconto ?? 0,
        p_motivo_desconto: input.motivoDesconto ?? null,
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

/** Lançamentos do razão de uma parcela — base do estorno e do histórico. */
export function useEventosParcelaAcordo(parcelaAcordoId: string | null, enabled = true) {
  return useQuery({
    queryKey: acordosKeys.eventosParcela(parcelaAcordoId ?? ''),
    queryFn: async (): Promise<EventoParcelaAcordo[]> => {
      if (!parcelaAcordoId) return [];
      const { data, error } = await supabase
        .from('movimentos_financeiros')
        .select('id, tipo, valor, data_evento, descricao, meio_pagamento, estornado, created_at')
        .eq('parcela_acordo_id', parcelaAcordoId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []) as EventoParcelaAcordo[];
    },
    enabled: enabled && !!parcelaAcordoId,
  });
}

/**
 * Desfaz UM lançamento do razão (admin+, motivo obrigatório).
 *
 * Estorna o lançamento, não a parcela inteira: numa parcela com pagamento
 * parcial e encargo, dá para corrigir só o que foi lançado errado. O trigger
 * update_acordo_status devolve o acordo de 'cumprido' para 'ativo' quando o
 * saldo volta a ser positivo.
 */
export function useEstornarEventoParcelaAcordo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ eventoId, motivo }: { eventoId: string; motivo: string }) => {
      const { error } = await supabase.rpc('estornar_movimento', {
        p_movimento_id: eventoId,
        p_motivo: motivo,
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

/**
 * Exclusão DEFINITIVA (hard delete) de acordos — admin da própria empresa.
 *
 * A RPC só aceita acordo já CANCELADO: acordo ativo mantém as parcelas do título
 * liquidadas por novação, e apagá-lo direto deixaria o título com saldo zerado e
 * nenhum acordo apontando para ele. Cancelar primeiro estorna a liquidação.
 */
export function useHardDeleteAcordos() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (acordoIds: string[]) => {
      const { error } = await supabase.rpc('excluir_acordos_definitivo', {
        p_acordo_ids: acordoIds,
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
