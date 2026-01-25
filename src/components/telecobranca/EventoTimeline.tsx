import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { getTipoEvento } from '@/constants/tiposEvento';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useToast } from '@/hooks/use-toast';
import { Filter, Clock, CheckCircle, XCircle, AlertCircle, MoreHorizontal } from 'lucide-react';

interface Evento {
  id: string;
  tipo: string;
  descricao: string | null;
  data: string;
  origem: 'comunicacao' | 'agendamento';
  status?: string;
  operador?: string;
}

interface EventoTimelineProps {
  clienteId: string;
  refreshTrigger?: number;
}

export function EventoTimeline({ clienteId, refreshTrigger }: EventoTimelineProps) {
  const [eventos, setEventos] = useState<Evento[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtroTipo, setFiltroTipo] = useState<string>('todos');
  const { toast } = useToast();

  useEffect(() => {
    fetchEventos();
  }, [clienteId, refreshTrigger]);

  const fetchEventos = async () => {
    try {
      setLoading(true);

      // Buscar comunicações
      const { data: comunicacoes, error: comError } = await supabase
        .from('comunicacoes')
        .select(`
          id,
          tipo,
          mensagem,
          data_contato,
          created_at,
          created_by,
          profiles!comunicacoes_created_by_fkey (nome)
        `)
        .eq('cliente_id', clienteId)
        .order('created_at', { ascending: false });

      if (comError) throw comError;

      // Buscar agendamentos
      const { data: agendamentos, error: agError } = await supabase
        .from('agendamentos')
        .select(`
          id,
          tipo_evento,
          descricao,
          data_agendamento,
          status,
          created_at,
          created_by,
          profiles!agendamentos_created_by_fkey (nome)
        `)
        .eq('cliente_id', clienteId)
        .order('data_agendamento', { ascending: false });

      if (agError) throw agError;

      // Unificar eventos
      const eventosUnificados: Evento[] = [];

      comunicacoes?.forEach((com: any) => {
        eventosUnificados.push({
          id: com.id,
          tipo: com.tipo,
          descricao: com.mensagem,
          data: com.data_contato || com.created_at,
          origem: 'comunicacao',
          operador: com.profiles?.nome || 'Sistema'
        });
      });

      agendamentos?.forEach((ag: any) => {
        eventosUnificados.push({
          id: ag.id,
          tipo: ag.tipo_evento,
          descricao: ag.descricao,
          data: ag.data_agendamento,
          origem: 'agendamento',
          status: ag.status,
          operador: ag.profiles?.nome || 'Sistema'
        });
      });

      // Ordenar por data (mais recente primeiro)
      eventosUnificados.sort((a, b) => 
        new Date(b.data).getTime() - new Date(a.data).getTime()
      );

      setEventos(eventosUnificados);
    } catch (error) {
      console.error('Erro ao carregar eventos:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateStatus = async (agendamentoId: string, novoStatus: string) => {
    try {
      const { error } = await supabase
        .from('agendamentos')
        .update({ 
          status: novoStatus,
          updated_at: new Date().toISOString()
        })
        .eq('id', agendamentoId);

      if (error) throw error;

      toast({
        title: "Sucesso",
        description: `Agendamento ${novoStatus === 'concluido' ? 'concluído' : 'cancelado'} com sucesso`,
      });
      
      fetchEventos();
    } catch (error) {
      console.error('Erro ao atualizar status:', error);
      toast({
        title: "Erro",
        description: "Não foi possível atualizar o status do agendamento",
        variant: "destructive",
      });
    }
  };

  const getStatusIcon = (status?: string) => {
    switch (status) {
      case 'concluido':
        return <CheckCircle className="h-4 w-4 text-green-600" />;
      case 'cancelado':
        return <XCircle className="h-4 w-4 text-destructive" />;
      case 'pendente':
        return <Clock className="h-4 w-4 text-yellow-600" />;
      default:
        return null;
    }
  };

  const getStatusBadge = (status?: string) => {
    if (!status) return null;
    
    const statusConfig: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
      pendente: { label: 'Pendente', variant: 'secondary' },
      concluido: { label: 'Concluído', variant: 'default' },
      cancelado: { label: 'Cancelado', variant: 'destructive' },
    };
    
    const config = statusConfig[status] || { label: status, variant: 'outline' as const };
    
    return (
      <Badge variant={config.variant} className="text-xs">
        {config.label}
      </Badge>
    );
  };

  const filteredEventos = filtroTipo === 'todos' 
    ? eventos 
    : eventos.filter(e => e.tipo === filtroTipo);

  const tiposUnicos = [...new Set(eventos.map(e => e.tipo))];

  if (loading) {
    return (
      <Card>
        <CardContent className="py-8">
          <div className="flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">Histórico de Eventos</CardTitle>
          <Select value={filtroTipo} onValueChange={setFiltroTipo}>
            <SelectTrigger className="w-[180px]">
              <Filter className="mr-2 h-4 w-4" />
              <SelectValue placeholder="Filtrar" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              {tiposUnicos.map((tipo) => {
                const tipoInfo = getTipoEvento(tipo);
                return (
                  <SelectItem key={tipo} value={tipo}>
                    {tipoInfo.label}
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        {filteredEventos.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <AlertCircle className="h-12 w-12 mx-auto mb-2 opacity-50" />
            <p>Nenhum evento registrado</p>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredEventos.map((evento, index) => {
              const tipoInfo = getTipoEvento(evento.tipo);
              const Icon = tipoInfo.icon;
              
              return (
                <div
                  key={evento.id}
                  className={cn(
                    "relative pl-8 pb-4",
                    index < filteredEventos.length - 1 && "border-l-2 border-border ml-3"
                  )}
                >
                  {/* Ícone do evento */}
                  <div className={cn(
                    "absolute -left-3 p-1.5 rounded-full",
                    tipoInfo.bg
                  )}>
                    <Icon className={cn("h-4 w-4", tipoInfo.color)} />
                  </div>

                  {/* Conteúdo do evento */}
                  <div className="ml-4">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{tipoInfo.label}</span>
                          {evento.origem === 'agendamento' && getStatusBadge(evento.status)}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {evento.operador} - {format(new Date(evento.data), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                        </p>
                      </div>
                      <div className="flex items-center gap-1">
                        {evento.origem === 'agendamento' && getStatusIcon(evento.status)}
                        {evento.origem === 'agendamento' && evento.status === 'pendente' && (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                                <MoreHorizontal className="h-3 w-3" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => handleUpdateStatus(evento.id, 'concluido')}>
                                <CheckCircle className="h-4 w-4 mr-2 text-green-600" />
                                Marcar como Concluído
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleUpdateStatus(evento.id, 'cancelado')}>
                                <XCircle className="h-4 w-4 mr-2 text-destructive" />
                                Cancelar Agendamento
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </div>
                    </div>
                    
                    {evento.descricao && (
                      <p className="mt-2 text-sm text-muted-foreground bg-muted/50 p-2 rounded">
                        {evento.descricao}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
