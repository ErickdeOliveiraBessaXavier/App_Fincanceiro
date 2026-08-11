import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { DollarSign, AlertTriangle, Clock, MessageSquare } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useBaseMetricasCliente } from '@/lib/queries/metricas';
import { prepararBase, situacaoFinanceiraCliente } from '@/domain/metricas';

interface MetricasClienteProps {
  clienteId: string;
  refreshTrigger?: number;
}

/**
 * Cartões de situação do cliente.
 *
 * A soma da dívida sai de `domain/metricas` — a mesma regra do Dashboard e da
 * lista de títulos da ficha. Antes este componente tinha o próprio cálculo (só
 * parcelas de título), então um cliente com acordo em atraso aparecia devendo
 * zero: a novação zera o saldo do título e a parcela do acordo ficava invisível.
 */

// Último contato = a data mais recente entre a última comunicação e o último agendamento.
function determinarUltimoContato(dataComunicacao?: string | null, dataAgendamento?: string | null): string | null {
  if (dataComunicacao && dataAgendamento) {
    return new Date(dataComunicacao) > new Date(dataAgendamento) ? dataComunicacao : dataAgendamento;
  }
  return dataComunicacao || dataAgendamento || null;
}

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

const formatUltimoContato = (data: string | null) =>
  data ? formatDistanceToNow(new Date(data), { addSuffix: false, locale: ptBR }) : 'Nunca';

function useUltimoContato(clienteId: string, refreshTrigger?: number) {
  const [ultimoContato, setUltimoContato] = useState<string | null>(null);

  useEffect(() => {
    let ativo = true;
    (async () => {
      const [{ data: comunicacoes }, { data: agendamentos }] = await Promise.all([
        supabase
          .from('comunicacoes')
          .select('created_at')
          .eq('cliente_id', clienteId)
          .order('created_at', { ascending: false })
          .limit(1),
        supabase
          .from('agendamentos')
          .select('updated_at')
          .eq('cliente_id', clienteId)
          .eq('status', 'concluido')
          .order('updated_at', { ascending: false })
          .limit(1),
      ]);
      if (!ativo) return;
      setUltimoContato(determinarUltimoContato(comunicacoes?.[0]?.created_at, agendamentos?.[0]?.updated_at));
    })();
    return () => { ativo = false; };
  }, [clienteId, refreshTrigger]);

  return ultimoContato;
}

export function MetricasCliente({ clienteId, refreshTrigger }: MetricasClienteProps) {
  const { data: base, isLoading } = useBaseMetricasCliente(clienteId);
  const ultimoContato = useUltimoContato(clienteId, refreshTrigger);

  const situacao = useMemo(
    () => (base ? situacaoFinanceiraCliente(prepararBase(base), clienteId) : null),
    [base, clienteId],
  );

  if (isLoading || !situacao) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[0, 1, 2, 3].map((i) => (
          <Card key={i} className="animate-pulse">
            <CardContent className="p-4">
              <div className="h-12 bg-muted rounded" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  const cards = [
    {
      label: 'Dívida em Aberto',
      value: formatCurrency(situacao.emAberto),
      icon: DollarSign,
      gradient: 'from-destructive/10 to-destructive/5',
      border: 'border-destructive/20',
      iconColor: 'text-destructive/40',
      valueColor: 'text-destructive',
    },
    {
      label: 'Parcelas Vencidas',
      value: situacao.parcelasVencidas.toString(),
      icon: AlertTriangle,
      gradient: 'from-yellow-500/10 to-yellow-500/5',
      border: 'border-yellow-500/20',
      iconColor: 'text-yellow-500/40',
      valueColor: 'text-yellow-600',
    },
    {
      label: 'Maior Atraso',
      value: situacao.maiorAtraso > 0 ? `${situacao.maiorAtraso} dias` : '-',
      icon: Clock,
      gradient: 'from-blue-500/10 to-blue-500/5',
      border: 'border-blue-500/20',
      iconColor: 'text-blue-500/40',
      valueColor: 'text-blue-600',
    },
    {
      label: 'Último Contato',
      value: formatUltimoContato(ultimoContato),
      icon: MessageSquare,
      gradient: 'from-green-500/10 to-green-500/5',
      border: 'border-green-500/20',
      iconColor: 'text-green-500/40',
      valueColor: 'text-green-600',
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {cards.map((card) => (
        <Card key={card.label} className={`bg-gradient-to-br ${card.gradient} ${card.border}`}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground truncate">{card.label}</p>
                <p className={`text-lg md:text-xl font-bold ${card.valueColor} truncate`}>
                  {card.value}
                </p>
              </div>
              <card.icon className={`h-8 w-8 ${card.iconColor} flex-shrink-0`} />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
