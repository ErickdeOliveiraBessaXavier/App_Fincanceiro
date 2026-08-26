import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useEventosCliente, useInvalidarEventos } from '@/lib/queries/eventos';
import { getTipoEvento } from '@/constants/tiposEvento';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatusBadge } from '@/components/StatusBadge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useToast } from '@/hooks/use-toast';
import { usePagination } from '@/hooks/usePagination';
import { TablePagination } from '@/components/TablePagination';
import { Filter, Clock, CheckCircle, History, XCircle, AlertCircle, MoreHorizontal } from 'lucide-react';

/**
 * Aba "Histórico de Eventos": a linha do tempo completa do cliente.
 *
 * A busca e a fusão de comunicações + agendamentos vivem em
 * `@/lib/queries/eventos` — a ficha reaproveita a MESMA consulta para mostrar o
 * último contato sem precisar abrir esta aba.
 *
 * Não recebe mais `refreshTrigger`: quem registra um contato invalida a query
 * (useInvalidarEventos) e todas as leituras da timeline se atualizam juntas.
 */

interface EventoTimelineProps {
  clienteId: string;
}

export function EventoTimeline({ clienteId }: EventoTimelineProps) {
  const [filtroTipo, setFiltroTipo] = useState<string>('todos');
  const { toast } = useToast();
  const { data: eventos = [], isLoading: loading } = useEventosCliente(clienteId);
  const invalidarEventos = useInvalidarEventos();

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
      
      void invalidarEventos(clienteId);
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
      case 'substituido':
        return <History className="h-4 w-4 text-muted-foreground" />;
      default:
        return null;
    }
  };

  const filteredEventos = filtroTipo === 'todos' 
    ? eventos 
    : eventos.filter(e => e.tipo === filtroTipo);

  // Cliente antigo acumula centenas de eventos; a lista inteira de uma vez
  // esticava a aba sem fim (mesma regra das outras listagens do app).
  const pagina = usePagination(filteredEventos, 10, `${filtroTipo}-${filteredEventos.length}`);

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
    <Card className="overflow-hidden">
      <CardHeader className="pb-4 bg-muted/10 border-b border-border/40">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-bold tracking-tight">Histórico de Eventos</CardTitle>
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
      <CardContent className="pt-6">
        {filteredEventos.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <AlertCircle className="h-12 w-12 mx-auto mb-2 opacity-50" />
            <p>Nenhum evento registrado</p>
          </div>
        ) : (
          <div className="space-y-4">
            {pagina.pageItems.map((evento, index) => {
              const tipoInfo = getTipoEvento(evento.tipo);
              const Icon = tipoInfo.icon;
              
              return (
                <div
                  key={evento.id}
                  className={cn(
                    "relative pl-8 pb-4",
                    index < pagina.pageItems.length - 1 && "border-l-2 border-border ml-3"
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
                          {evento.origem === 'agendamento' && (
                            <StatusBadge domain="agendamento" status={evento.status} />
                          )}
                          {evento.statusCobranca && (
                            <StatusBadge domain="status_cobranca" status={evento.statusCobranca} />
                          )}
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
            {pagina.totalItems > pagina.pageSize && <TablePagination pagination={pagina} />}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
