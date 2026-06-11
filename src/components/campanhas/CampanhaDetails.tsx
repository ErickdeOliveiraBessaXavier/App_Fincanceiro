import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { StatusBadge } from '@/components/StatusBadge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Mail, MessageSquare, Phone, CheckCircle, XCircle, Clock } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

interface CampaignLog {
  id: string;
  cliente: string;
  contato: string;
  status: string;
  erro_mensagem: string | null;
  sent_at: string;
}

interface Campanha {
  id: string;
  nome: string;
  canal: string;
  mensagem: string;
  status: string;
  created_at: string;
  filtros?: any;
}

interface CampanhaDetailsProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  campanha: Campanha | null;
}

function calcularStatsCampanha(logs: CampaignLog[]) {
  return {
    enviados: logs.length,
    sucesso: logs.filter(l => l.status === 'enviado').length,
    erro: logs.filter(l => l.status === 'erro').length,
  };
}

const CampanhaDetails = ({ open, onOpenChange, campanha }: CampanhaDetailsProps) => {
  const [logs, setLogs] = useState<CampaignLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState({ enviados: 0, sucesso: 0, erro: 0 });

  useEffect(() => {
    if (open && campanha?.id) {
      fetchLogs();
    }
  }, [open, campanha?.id]);

  const fetchLogs = async () => {
    if (!campanha?.id) return;

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('campaign_logs')
        .select('*')
        .eq('campanha_id', campanha.id)
        .order('sent_at', { ascending: false });

      if (error) throw error;

      const logsData = data ?? [];
      setLogs(logsData);
      setStats(calcularStatsCampanha(logsData));
    } catch (error) {
      console.error('Erro ao buscar logs:', error);
    } finally {
      setLoading(false);
    }
  };

  const getCanalIcon = (canal: string) => {
    switch (canal) {
      case 'email': return <Mail className="h-4 w-4" />;
      case 'sms': return <Phone className="h-4 w-4" />;
      case 'whatsapp': return <MessageSquare className="h-4 w-4" />;
      default: return <MessageSquare className="h-4 w-4" />;
    }
  };

  const getLogStatusIcon = (status: string) => {
    switch (status) {
      case 'enviado':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'erro':
        return <XCircle className="h-4 w-4 text-destructive" />;
      default:
        return <Clock className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleString('pt-BR');
  };

  if (!campanha) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {getCanalIcon(campanha.canal)}
            {campanha.nome}
            <StatusBadge domain="campanha" status={campanha.status} />
          </DialogTitle>
          <DialogDescription>
            Detalhes da campanha e histórico de envios aos destinatários.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Info da Campanha */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Mensagem</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                {campanha.mensagem}
              </p>
              <p className="text-xs text-muted-foreground mt-4">
                Criada em: {formatDate(campanha.created_at)}
              </p>
            </CardContent>
          </Card>

          {/* Estatísticas */}
          <div className="grid grid-cols-3 gap-4">
            <Card>
              <CardContent className="pt-4 text-center">
                <p className="text-2xl font-bold">{stats.enviados}</p>
                <p className="text-xs text-muted-foreground">Total Enviados</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 text-center">
                <p className="text-2xl font-bold text-green-500">{stats.sucesso}</p>
                <p className="text-xs text-muted-foreground">Sucesso</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 text-center">
                <p className="text-2xl font-bold text-destructive">{stats.erro}</p>
                <p className="text-xs text-muted-foreground">Erros</p>
              </CardContent>
            </Card>
          </div>

          {/* Histórico de Envios */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Histórico de Envios</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
                </div>
              ) : logs.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  Nenhum envio registrado ainda
                </p>
              ) : (
                <div className="max-h-64 overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Status</TableHead>
                        <TableHead>Cliente</TableHead>
                        <TableHead>Contato</TableHead>
                        <TableHead>Data</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {logs.map((log) => (
                        <TableRow key={log.id}>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              {getLogStatusIcon(log.status)}
                              <span className="text-xs">{log.status}</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-sm">{log.cliente}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {log.contato}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {formatDate(log.sent_at)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default CampanhaDetails;
