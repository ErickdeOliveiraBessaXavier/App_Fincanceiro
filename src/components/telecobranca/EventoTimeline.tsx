import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
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
import { Filter, Clock, CheckCircle, XCircle, AlertCircle, MoreHorizontal } from 'lucide-react';

interface Evento {
  id: string;
  tipo: string;
  descricao: string | null;
  data: string;
  origem: 'comunicacao' | 'agendamento';
  status?: string;
  statusCobranca?: string;
  operador?: string;
}

interface EventoTimelineProps {
  clienteId: string;
  refreshTrigger?: number;
}

type ComunicacaoRow = { id: string; tipo: string; mensagem: string | null; status_cobranca: string | null; data_contato: string | null; created_at: string; created_by: string | null };
type AgendamentoRow = { id: string; tipo_evento: string; descricao: string | null; data_agendamento: string; status: string | null; status_cobranca: string | null; created_at: string; created_by: string | null };

// Resolve nomes dos operadores (created_by -> profiles.user_id). O FK aponta para
// auth.users, então buscamos os nomes à parte e devolvemos um mapa id -> nome.
async function carregarOperadores(coms: ComunicacaoRow[], ags: AgendamentoRow[]): Promise<Map<string, string>> {
  const operadorIds = [
    ...coms.map(c => c.created_by),
    ...ags.map(a => a.created_by),
  ].filter((id): id is string => !!id);

  const operadorMap = new Map<string, string>();
  if (operadorIds.length === 0) return operadorMap;

  const { data: perfis } = await supabase
    .from('profiles')
    .select('user_id, nome')
    .in('user_id', [...new Set(operadorIds)]);
  perfis?.forEach(p => operadorMap.set(p.user_id, p.nome));
  return operadorMap;
}

// Funde comunicações e agendamentos numa linha do tempo única, ordenada por data desc.
function unificarEventos(coms: ComunicacaoRow[], ags: AgendamentoRow[], operadorMap: Map<string, string>): Evento[] {
  const eventos: Evento[] = [];

  coms.forEach((com) => {
    eventos.push({
      id: com.id,
      tipo: com.tipo,
      descricao: com.mensagem,
      data: com.data_contato || com.created_at,
      origem: 'comunicacao',
      statusCobranca: com.status_cobranca ?? undefined,
      operador: operadorMap.get(com.created_by!) || 'Sistema',
    });
  });

  ags.forEach((ag) => {
    eventos.push({
      id: ag.id,
      tipo: ag.tipo_evento,
      descricao: ag.descricao,
      data: ag.data_agendamento,
      origem: 'agendamento',
      status: ag.status ?? undefined,
      statusCobranca: ag.status_cobranca ?? undefined,
      operador: operadorMap.get(ag.created_by!) || 'Sistema',
    });
  });

  eventos.sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime());
  return eventos;
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
          status_cobranca,
          data_contato,
          created_at,
          created_by
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
          status_cobranca,
          created_at,
          created_by
        `)
        .eq('cliente_id', clienteId)
        .order('data_agendamento', { ascending: false });

      if (agError) throw agError;

      const coms = comunicacoes ?? [];
      const ags = agendamentos ?? [];
      const operadorMap = await carregarOperadores(coms, ags);
      setEventos(unificarEventos(coms, ags, operadorMap));
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
          </div>
        )}
      </CardContent>
    </Card>
  );
}
