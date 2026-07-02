import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { getCurrentCompanyId } from '@/lib/currentCompany';
import { hojeNegocio } from '@/domain/telecobranca/statusCobranca';
import { soDigitos } from '@/utils/format';
import { titulosKeys } from './titulos';

// Chaves literais das carteiras (evita import circular com cobradores/vendedores,
// que já importam clientesKeys). A contagem de carteira depende de clientes.
const cobradoresAllKey = ['cobradores'] as const;
const vendedoresAllKey = ['vendedores'] as const;

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
  cobrador_id?: string | null;
  cobrador_nome?: string | null;
  vendedor_id?: string | null;
  vendedor_nome?: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  total_titulos?: number;
  total_valor?: number;
  ultima_comunicacao?: string;
  /** Data (ISO) do próximo retorno agendado pendente; null se não houver. */
  proximo_retorno?: string | null;
  /** Status de cobrança (slug) do próximo retorno agendado. */
  retorno_status_cobranca?: string | null;
  /** true se o próximo retorno já está com data anterior a hoje (fuso do negócio). */
  retorno_atrasado?: boolean;
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
 * Deriva o status do cliente a partir dos status (computados) dos seus títulos.
 * Precedência: inadimplente > em_acordo > quitado > ativo.
 */
function derivarStatusCliente(statuses: string[]): string {
  if (statuses.length === 0) return 'ativo';
  if (statuses.includes('vencido')) return 'inadimplente';
  if (statuses.includes('renegociado')) return 'em_acordo';
  if (statuses.every((s) => s === 'pago')) return 'quitado';
  return 'ativo';
}

interface ProximoRetorno {
  data: string | null;
  status_cobranca: string | null;
  atrasado: boolean;
}

interface AgendamentoRetorno {
  cliente_id: string;
  data_agendamento: string;
  status_cobranca: string | null;
}

/**
 * Mapeia o retorno agendado pendente mais próximo por cliente. Os agendamentos
 * chegam ordenados por data ascendente, então o primeiro visto de cada cliente
 * já é o mais próximo. `atrasado` compara a data (civil) com hoje no fuso do negócio.
 */
function mapProximosRetornos(agendamentos: AgendamentoRetorno[]): Map<string, ProximoRetorno> {
  const hojeStr = hojeNegocio().toISOString().slice(0, 10);
  const porCliente = new Map<string, ProximoRetorno>();
  for (const a of agendamentos) {
    if (!a.cliente_id || porCliente.has(a.cliente_id)) continue;
    porCliente.set(a.cliente_id, {
      data: a.data_agendamento,
      status_cobranca: a.status_cobranca ?? null,
      atrasado: String(a.data_agendamento).slice(0, 10) < hojeStr,
    });
  }
  return porCliente;
}

/**
 * Lista clientes com agregados (total_titulos, total_valor) e status derivado
 * dos títulos. O status armazenado em `clientes.status` é ignorado para exibição,
 * pois não é mantido em sincronia com a realidade financeira.
 */
export function useClientes() {
  return useQuery({
    queryKey: clientesKeys.list(),
    queryFn: async (): Promise<ClienteRow[]> => {
      const [clientesRes, titulosRes, agendamentosRes] = await Promise.all([
        supabase
          .from('clientes')
          .select(`
            *,
            cobradores ( nome ),
            vendedores ( nome )
          `)
          .order('created_at', { ascending: false }),
        // vw_titulos_completos já exclui títulos cancelados/excluídos (deleted_at)
        // e traz o status consolidado (a_vencer/vencido/pago/renegociado).
        supabase
          .from('vw_titulos_completos')
          .select('cliente_id, status, valor_original'),
        // Próximos retornos pendentes (RLS já limita à carteira do cobrador).
        supabase
          .from('agendamentos')
          .select('cliente_id, data_agendamento, status_cobranca')
          .eq('status', 'pendente')
          .is('deleted_at', null)
          .order('data_agendamento', { ascending: true }),
      ]);

      if (clientesRes.error) throw clientesRes.error;
      if (titulosRes.error) throw titulosRes.error;
      if (agendamentosRes.error) throw agendamentosRes.error;

      const retornos = mapProximosRetornos(agendamentosRes.data ?? []);

      // Agrega títulos por cliente.
      const porCliente = new Map<
        string,
        { total: number; valor: number; statuses: string[] }
      >();
      (titulosRes.data ?? []).forEach((t: any) => {
        if (!t.cliente_id) return;
        const agg = porCliente.get(t.cliente_id) ?? { total: 0, valor: 0, statuses: [] };
        agg.total += 1;
        agg.valor += Number(t.valor_original || 0);
        agg.statuses.push(t.status);
        porCliente.set(t.cliente_id, agg);
      });

      const semRetorno: ProximoRetorno = { data: null, status_cobranca: null, atrasado: false };
      return (clientesRes.data || []).map((c: any) => {
        const { statuses, total, valor } = porCliente.get(c.id) ?? { total: 0, valor: 0, statuses: [] };
        const retorno = retornos.get(c.id) ?? semRetorno;
        return {
          ...c,
          cobrador_nome: c.cobradores?.nome ?? null,
          vendedor_nome: c.vendedores?.nome ?? null,
          status: derivarStatusCliente(statuses),
          total_titulos: total,
          total_valor: valor,
          proximo_retorno: retorno.data,
          retorno_status_cobranca: retorno.status_cobranca,
          retorno_atrasado: retorno.atrasado,
        };
      }) as ClienteRow[];
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
  cobrador_id?: string | null;
  vendedor_id?: string | null;
}

export function useCreateCliente() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateClienteInput) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error('Usuário não autenticado');
      const companyId = await getCurrentCompanyId();
      if (!companyId) throw new Error('Empresa não identificada');

      const { data, error } = await supabase
        .from('clientes')
        .insert([
          {
            ...input,
            company_id: companyId,
            cpf_cnpj: soDigitos(input.cpf_cnpj),
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
  // status do cliente é derivado dos títulos (useClientes); não é editável aqui.
  cobrador_id?: string | null;
  vendedor_id?: string | null;
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
          cpf_cnpj: soDigitos(rest.cpf_cnpj),
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

export interface AssignInput {
  clienteIds: string[];
  /** id do cobrador/vendedor alvo; null remove o vínculo. */
  targetId: string | null;
}

/**
 * Atribui (ou remove) o cobrador de um ou vários clientes de uma vez. Usada
 * tanto na troca individual por linha quanto na ação em massa do painel de
 * atribuição. A contagem de carteira em `cobradores` depende disso, então
 * invalidamos as duas listas.
 */
export function useAssignCobrador() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ clienteIds, targetId }: AssignInput) => {
      if (clienteIds.length === 0) return;
      const { error } = await supabase
        .from('clientes')
        .update({ cobrador_id: targetId })
        .in('id', clienteIds);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: clientesKeys.all });
      qc.invalidateQueries({ queryKey: cobradoresAllKey });
      qc.invalidateQueries({ queryKey: titulosKeys.clientes });
    },
  });
}

/** Atribui (ou remove) o vendedor de um ou vários clientes de uma vez. */
export function useAssignVendedor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ clienteIds, targetId }: AssignInput) => {
      if (clienteIds.length === 0) return;
      const { error } = await supabase
        .from('clientes')
        .update({ vendedor_id: targetId })
        .in('id', clienteIds);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: clientesKeys.all });
      qc.invalidateQueries({ queryKey: vendedoresAllKey });
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
  const cleaned = soDigitos(cpfCnpj);
  let query = supabase.from('clientes').select('id').eq('cpf_cnpj', cleaned);
  if (excludeId) query = query.neq('id', excludeId);
  const { data, error } = await query.maybeSingle();
  if (error) {
    console.error('Erro ao verificar CPF/CNPJ:', error);
    return false;
  }
  return data !== null;
}
