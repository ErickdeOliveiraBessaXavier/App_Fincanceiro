import { CalendarClock } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useEventosCliente, type EventoCliente } from '@/lib/queries/eventos';
import { formatData } from '@/utils/format';
import { cn } from '@/lib/utils';

/**
 * O compromisso combinado com o cliente, no cabeçalho da ficha.
 *
 * É o dado que a `/fila` inteira usa para ordenar o dia, mas dentro da ficha
 * ele só existia na aba Histórico — que o operador não abre no meio da
 * ligação. Aqui fica ao lado do status de cobrança, visível em qualquer aba,
 * sem ocupar altura do conteúdo.
 *
 * Retorno com a data já vencida aparece como ATRASADO em vez de sumir: um
 * compromisso furado é mais urgente que um futuro, não menos.
 */

/** Só conta o agendamento de pé: concluir ou cancelar não muda a data dele. */
const agendamentoDePe = (evento: EventoCliente) =>
  evento.origem === 'agendamento' && (evento.status ?? 'pendente') === 'pendente';

/** O compromisso mais próximo — atrasado ou futuro, o que vier primeiro. */
function retornoMaisProximo(eventos: EventoCliente[]): EventoCliente | null {
  const pendentes = eventos.filter(agendamentoDePe);
  if (pendentes.length === 0) return null;
  return pendentes.reduce((maisProximo, atual) =>
    atual.data < maisProximo.data ? atual : maisProximo,
  );
}

/**
 * Data legível de um agendamento.
 *
 * `data_agendamento` é timestamptz: recortar a hora da string ISO mostraria o
 * horário em UTC, três horas fora do que foi combinado.
 */
function quando(data: string): string {
  if (!data.includes('T')) return formatData(data);
  return format(new Date(data), "dd/MM 'às' HH:mm", { locale: ptBR });
}

export function ProximoRetorno({ clienteId }: { clienteId: string }) {
  const { data: eventos = [], isLoading } = useEventosCliente(clienteId);

  if (isLoading) return null;

  const retorno = retornoMaisProximo(eventos);
  if (!retorno) return null;

  const atrasado = retorno.data < new Date().toISOString();

  return (
    <div
      className={cn(
        'flex items-center gap-1.5 rounded-full border px-2.5 py-0.5',
        atrasado
          ? 'border-destructive/30 bg-destructive/10 text-destructive'
          : 'border-primary/20 bg-primary/5 text-primary',
      )}
      title={retorno.descricao ?? undefined}
    >
      <CalendarClock className="h-3.5 w-3.5 shrink-0" />
      <span className="text-[10px] font-bold uppercase tracking-widest">
        {atrasado ? 'Retorno atrasado' : 'Retorno'}
      </span>
      <span className="whitespace-nowrap text-xs font-bold tabular-nums">{quando(retorno.data)}</span>
    </div>
  );
}
