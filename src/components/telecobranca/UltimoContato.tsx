import { Clock } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { StatusBadge } from '@/components/StatusBadge';
import { getTipoEvento } from '@/constants/tiposEvento';
import { useEventosCliente, type EventoCliente } from '@/lib/queries/eventos';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { formatData } from '@/utils/format';
import { cn } from '@/lib/utils';

/**
 * As duas últimas interações, sempre visíveis acima das parcelas.
 *
 * O histórico só existia dentro de uma aba: para saber o que foi combinado na
 * última ligação, o operador tinha de sair da lista de parcelas, ler, e voltar.
 * Como as duas informações são usadas ao mesmo tempo na negociação, o resumo
 * fica aqui e a aba continua guardando a linha do tempo inteira.
 */

const QUANTIDADE = 2;

/** Agendamento que ainda está de pé (não foi concluído nem cancelado). */
const estaAgendado = (evento: EventoCliente) =>
  evento.origem === 'agendamento' && (evento.status ?? 'pendente') === 'pendente';

/**
 * Data + hora no fuso local, como na linha do tempo.
 *
 * Recortar a hora da string ISO (`slice(11,16)`) mostrava o horário em UTC: o
 * mesmo contato aparecia às 15:21 aqui e às 12:21 no histórico.
 */
function quando(data: string): string {
  if (!data.includes('T')) return formatData(data);
  return format(new Date(data), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
}

function LinhaEvento({ evento, futuro }: { evento: EventoCliente; futuro: boolean }) {
  const tipo = getTipoEvento(evento.tipo);
  const Icone = tipo.icon;

  return (
    <div className="flex items-start gap-3">
      <div className={cn('mt-0.5 rounded-full p-1.5', tipo.bg)}>
        <Icone className={cn('h-3.5 w-3.5', tipo.color)} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium">{tipo.label}</span>
          {evento.statusCobranca && (
            <StatusBadge domain="status_cobranca" status={evento.statusCobranca} />
          )}
          {futuro && (
            <span className="text-[10px] font-bold uppercase tracking-widest text-primary">
              retorno agendado
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          {quando(evento.data)}
          {evento.operador ? ` · ${evento.operador}` : ''}
        </p>
        {evento.descricao && (
          <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{evento.descricao}</p>
        )}
      </div>
    </div>
  );
}

export function UltimoContato({ clienteId }: { clienteId: string }) {
  const { data: eventos = [], isLoading } = useEventosCliente(clienteId);

  if (isLoading) return null;

  const agora = new Date().toISOString();
  // O próximo retorno (evento futuro) primeiro, depois o que já aconteceu: é a
  // ordem em que o operador precisa da informação ao abrir a ficha.
  //
  // Só conta como retorno o agendamento AINDA pendente: cancelar ou concluir um
  // agendamento não muda a data dele, então sem o filtro de status um retorno
  // cancelado continuava anunciado aqui como se estivesse de pé.
  const futuros = eventos.filter(estaAgendado).filter((e) => e.data > agora).slice(-1);
  const passados = eventos.filter((e) => e.data <= agora).slice(0, QUANTIDADE);

  if (futuros.length === 0 && passados.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex items-center gap-2 py-3 text-xs text-muted-foreground">
          <Clock className="h-4 w-4" />
          Nenhum contato registrado com este cliente ainda.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="space-y-3 py-3">
        {futuros.map((evento) => (
          <LinhaEvento key={evento.id} evento={evento} futuro />
        ))}
        {passados.map((evento) => (
          <LinhaEvento key={evento.id} evento={evento} futuro={false} />
        ))}
      </CardContent>
    </Card>
  );
}
