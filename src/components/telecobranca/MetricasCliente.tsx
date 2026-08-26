import { useMemo } from 'react';
import { DollarSign, AlertTriangle, Clock, MessageSquare } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ResumoNumeros } from '@/components/ResumoNumeros';
import { useBaseMetricasCliente } from '@/lib/queries/metricas';
import { useEventosCliente } from '@/lib/queries/eventos';
import { prepararBase, situacaoFinanceiraCliente } from '@/domain/metricas';

interface MetricasClienteProps {
  clienteId: string;
}

/**
 * Situação do cliente em uma faixa compacta.
 *
 * Eram quatro cartões altos ocupando a largura inteira logo abaixo do cabeçalho:
 * empurravam parcelas e ações para fora da primeira tela, justamente o que o
 * operador precisa ver ao atender. Os mesmos números cabem numa linha (mesmo
 * componente das listagens).
 *
 * A soma da dívida sai de `domain/metricas` — a mesma regra do Dashboard e da
 * lista de títulos da ficha. Antes este componente tinha o próprio cálculo (só
 * parcelas de título), então um cliente com acordo em atraso aparecia devendo
 * zero: a novação zera o saldo do título e a parcela do acordo ficava invisível.
 */

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

const formatUltimoContato = (data: string | null) =>
  data ? formatDistanceToNow(new Date(data), { addSuffix: false, locale: ptBR }) : 'Nunca';

/** Último contato = o evento mais recente que já aconteceu (comunicação ou agendamento). */
function useUltimoContato(clienteId: string): string | null {
  const { data: eventos = [] } = useEventosCliente(clienteId);
  const agora = new Date().toISOString();
  return eventos.find((e) => e.data <= agora)?.data ?? null;
}

export function MetricasCliente({ clienteId }: MetricasClienteProps) {
  const { data: base, isLoading } = useBaseMetricasCliente(clienteId);
  const ultimoContato = useUltimoContato(clienteId);

  const situacao = useMemo(
    () => (base ? situacaoFinanceiraCliente(prepararBase(base), clienteId) : null),
    [base, clienteId],
  );

  if (isLoading || !situacao) {
    return <div className="h-14 animate-pulse rounded-xl bg-muted/40" />;
  }

  return (
    <ResumoNumeros
      itens={[
        {
          rotulo: 'Dívida em aberto',
          valor: formatCurrency(situacao.emAberto),
          icone: DollarSign,
          cor: situacao.emAberto > 0 ? 'text-destructive' : undefined,
        },
        {
          rotulo: 'Parcelas vencidas',
          valor: situacao.parcelasVencidas,
          icone: AlertTriangle,
          cor: situacao.parcelasVencidas > 0 ? 'text-amber-600' : undefined,
        },
        {
          rotulo: 'Maior atraso',
          valor: situacao.maiorAtraso > 0 ? `${situacao.maiorAtraso} dias` : '—',
          icone: Clock,
        },
        {
          rotulo: 'Último contato',
          valor: formatUltimoContato(ultimoContato),
          icone: MessageSquare,
        },
      ]}
    />
  );
}
