import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * Linha do tempo do cliente — comunicações + agendamentos, numa lista só.
 *
 * A fusão morava dentro do componente da timeline, então qualquer outra tela que
 * quisesse "o último contato" tinha de refazer as duas consultas e a ordenação.
 * Agora a regra é uma só e o cache é compartilhado (a ficha mostra o resumo e a
 * aba Histórico mostra a lista inteira, com uma ida ao banco).
 */

export interface EventoCliente {
  id: string;
  tipo: string;
  descricao: string | null;
  data: string;
  origem: 'comunicacao' | 'agendamento';
  /** Só para agendamento: pendente/concluido/cancelado. */
  status?: string;
  statusCobranca?: string;
  operador?: string;
}

export const eventosKeys = {
  all: ['eventos-cliente'] as const,
  cliente: (clienteId: string) => [...eventosKeys.all, clienteId] as const,
};

type ComunicacaoRow = {
  id: string; tipo: string; mensagem: string | null; status_cobranca: string | null;
  data_contato: string | null; created_at: string; created_by: string | null;
};

type AgendamentoRow = {
  id: string; tipo_evento: string; descricao: string | null; data_agendamento: string;
  status: string | null; status_cobranca: string | null; created_at: string; created_by: string | null;
};

/**
 * Resolve nomes dos operadores (created_by -> profiles.user_id). O FK aponta
 * para auth.users, então buscamos os nomes à parte.
 */
async function carregarOperadores(coms: ComunicacaoRow[], ags: AgendamentoRow[]): Promise<Map<string, string>> {
  const ids = [...coms.map((c) => c.created_by), ...ags.map((a) => a.created_by)]
    .filter((id): id is string => !!id);

  const mapa = new Map<string, string>();
  if (ids.length === 0) return mapa;

  const { data } = await supabase
    .from('profiles')
    .select('user_id, nome')
    .in('user_id', [...new Set(ids)]);
  data?.forEach((p) => mapa.set(p.user_id, p.nome));
  return mapa;
}

/** Funde as duas origens numa linha do tempo única, do mais recente ao mais antigo. */
function unificarEventos(
  coms: ComunicacaoRow[],
  ags: AgendamentoRow[],
  operadores: Map<string, string>,
): EventoCliente[] {
  const nome = (id: string | null) => (id ? operadores.get(id) : undefined) ?? 'Sistema';

  const deComunicacoes = coms.map((c) => ({
    id: c.id,
    tipo: c.tipo,
    descricao: c.mensagem,
    data: c.data_contato || c.created_at,
    origem: 'comunicacao' as const,
    statusCobranca: c.status_cobranca ?? undefined,
    operador: nome(c.created_by),
  }));

  const deAgendamentos = ags.map((a) => ({
    id: a.id,
    tipo: a.tipo_evento,
    descricao: a.descricao,
    data: a.data_agendamento,
    origem: 'agendamento' as const,
    status: a.status ?? undefined,
    statusCobranca: a.status_cobranca ?? undefined,
    operador: nome(a.created_by),
  }));

  return [...deComunicacoes, ...deAgendamentos].sort(
    (a, b) => new Date(b.data).getTime() - new Date(a.data).getTime(),
  );
}

export function useEventosCliente(clienteId: string | null) {
  return useQuery({
    queryKey: eventosKeys.cliente(clienteId ?? ''),
    enabled: !!clienteId,
    queryFn: async (): Promise<EventoCliente[]> => {
      if (!clienteId) return [];

      const [comunicacoesRes, agendamentosRes] = await Promise.all([
        supabase
          .from('comunicacoes')
          .select('id, tipo, mensagem, status_cobranca, data_contato, created_at, created_by')
          .eq('cliente_id', clienteId)
          .order('created_at', { ascending: false }),
        supabase
          .from('agendamentos')
          .select('id, tipo_evento, descricao, data_agendamento, status, status_cobranca, created_at, created_by')
          .eq('cliente_id', clienteId)
          .order('data_agendamento', { ascending: false }),
      ]);

      if (comunicacoesRes.error) throw comunicacoesRes.error;
      if (agendamentosRes.error) throw agendamentosRes.error;

      const coms = (comunicacoesRes.data ?? []) as ComunicacaoRow[];
      const ags = (agendamentosRes.data ?? []) as AgendamentoRow[];
      return unificarEventos(coms, ags, await carregarOperadores(coms, ags));
    },
  });
}

/** Recarrega a linha do tempo depois de registrar contato, agendar ou baixar. */
export function useInvalidarEventos() {
  const qc = useQueryClient();
  return (clienteId?: string) =>
    qc.invalidateQueries({
      queryKey: clienteId ? eventosKeys.cliente(clienteId) : eventosKeys.all,
    });
}
