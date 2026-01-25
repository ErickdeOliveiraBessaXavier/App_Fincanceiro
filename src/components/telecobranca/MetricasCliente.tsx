import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { DollarSign, AlertTriangle, Clock, MessageSquare } from 'lucide-react';
import { differenceInDays, formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface MetricasClienteProps {
  clienteId: string;
}

interface Metricas {
  dividaTotal: number;
  parcelasVencidas: number;
  maiorAtraso: number;
  ultimoContato: string | null;
}

export function MetricasCliente({ clienteId }: MetricasClienteProps) {
  const [metricas, setMetricas] = useState<Metricas>({
    dividaTotal: 0,
    parcelasVencidas: 0,
    maiorAtraso: 0,
    ultimoContato: null,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchMetricas();
  }, [clienteId]);

  const fetchMetricas = async () => {
    try {
      // Buscar títulos do cliente
      const { data: titulos } = await supabase
        .from('titulos')
        .select('id')
        .eq('cliente_id', clienteId);

      if (!titulos || titulos.length === 0) {
        setLoading(false);
        return;
      }

      const tituloIds = titulos.map(t => t.id);

      // Buscar parcelas consolidadas
      const { data: parcelas } = await supabase
        .from('mv_parcelas_consolidadas')
        .select('*')
        .in('titulo_id', tituloIds);

      // Buscar último contato (comunicações + agendamentos concluídos)
      const { data: comunicacoes } = await supabase
        .from('comunicacoes')
        .select('created_at')
        .eq('cliente_id', clienteId)
        .order('created_at', { ascending: false })
        .limit(1);

      const { data: agendamentos } = await supabase
        .from('agendamentos')
        .select('updated_at')
        .eq('cliente_id', clienteId)
        .eq('status', 'concluido')
        .order('updated_at', { ascending: false })
        .limit(1);

      // Calcular métricas
      const hoje = new Date();
      let dividaTotal = 0;
      let parcelasVencidas = 0;
      let maiorAtraso = 0;

      parcelas?.forEach(parcela => {
        if (parcela.status === 'vencida' || parcela.status === 'pendente') {
          dividaTotal += Number(parcela.saldo_atual || 0);
        }
        
        if (parcela.status === 'vencida') {
          parcelasVencidas++;
          const diasAtraso = differenceInDays(hoje, new Date(parcela.vencimento!));
          if (diasAtraso > maiorAtraso) {
            maiorAtraso = diasAtraso;
          }
        }
      });

      // Determinar último contato
      let ultimoContato: string | null = null;
      const dataComunicacao = comunicacoes?.[0]?.created_at;
      const dataAgendamento = agendamentos?.[0]?.updated_at;

      if (dataComunicacao && dataAgendamento) {
        ultimoContato = new Date(dataComunicacao) > new Date(dataAgendamento) 
          ? dataComunicacao 
          : dataAgendamento;
      } else {
        ultimoContato = dataComunicacao || dataAgendamento || null;
      }

      setMetricas({
        dividaTotal,
        parcelasVencidas,
        maiorAtraso,
        ultimoContato,
      });
    } catch (error) {
      console.error('Erro ao carregar métricas:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(value);
  };

  const formatUltimoContato = (data: string | null) => {
    if (!data) return 'Nunca';
    return formatDistanceToNow(new Date(data), { 
      addSuffix: false, 
      locale: ptBR 
    });
  };

  if (loading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
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
      label: 'Dívida Total',
      value: formatCurrency(metricas.dividaTotal),
      icon: DollarSign,
      gradient: 'from-destructive/10 to-destructive/5',
      border: 'border-destructive/20',
      iconColor: 'text-destructive/40',
      valueColor: 'text-destructive',
    },
    {
      label: 'Parcelas Vencidas',
      value: metricas.parcelasVencidas.toString(),
      icon: AlertTriangle,
      gradient: 'from-yellow-500/10 to-yellow-500/5',
      border: 'border-yellow-500/20',
      iconColor: 'text-yellow-500/40',
      valueColor: 'text-yellow-600',
    },
    {
      label: 'Maior Atraso',
      value: metricas.maiorAtraso > 0 ? `${metricas.maiorAtraso} dias` : '-',
      icon: Clock,
      gradient: 'from-blue-500/10 to-blue-500/5',
      border: 'border-blue-500/20',
      iconColor: 'text-blue-500/40',
      valueColor: 'text-blue-600',
    },
    {
      label: 'Último Contato',
      value: formatUltimoContato(metricas.ultimoContato),
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
        <Card 
          key={card.label} 
          className={`bg-gradient-to-br ${card.gradient} ${card.border}`}
        >
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
