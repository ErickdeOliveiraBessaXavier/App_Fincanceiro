import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Handshake, AlertTriangle, FileText } from 'lucide-react';
import { format, differenceInDays } from 'date-fns';
import { useNavigate } from 'react-router-dom';

interface Titulo {
  id: string;
  valor: number;
  vencimento: string;
  status: string;
  observacoes?: string | null;
  numero_parcela?: number | null;
  total_parcelas?: number | null;
  titulo_pai_id?: string | null;
}

interface TitulosClienteProps {
  clienteId: string;
}

export function TitulosCliente({ clienteId }: TitulosClienteProps) {
  const [titulos, setTitulos] = useState<Titulo[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    fetchTitulos();
  }, [clienteId]);

  const fetchTitulos = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('titulos')
        .select('*')
        .eq('cliente_id', clienteId)
        .order('vencimento', { ascending: true });

      if (error) throw error;
      setTitulos(data || []);
    } catch (error) {
      console.error('Erro ao carregar títulos:', error);
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

  const calcularAtraso = (vencimento: string) => {
    const hoje = new Date();
    const dataVencimento = new Date(vencimento);
    const dias = differenceInDays(hoje, dataVencimento);
    return dias > 0 ? dias : 0;
  };

  const getStatusBadge = (status: string) => {
    const statusConfig: Record<string, { label: string; className: string }> = {
      em_aberto: { label: 'Em Aberto', className: 'bg-yellow-100 text-yellow-800' },
      vencido: { label: 'Vencido', className: 'bg-red-100 text-red-800' },
      pago: { label: 'Pago', className: 'bg-green-100 text-green-800' },
      em_acordo: { label: 'Em Acordo', className: 'bg-blue-100 text-blue-800' },
      cancelado: { label: 'Cancelado', className: 'bg-gray-100 text-gray-800' },
    };
    const config = statusConfig[status] || { label: status, className: 'bg-gray-100 text-gray-800' };
    return <Badge className={config.className}>{config.label}</Badge>;
  };

  const totalEmAberto = titulos
    .filter(t => t.status === 'em_aberto' || t.status === 'vencido')
    .reduce((sum, t) => sum + t.valor, 0);

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
          <CardTitle className="text-lg flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Títulos / Contratos
          </CardTitle>
          <div className="text-right">
            <p className="text-sm text-muted-foreground">Total em Aberto</p>
            <p className="text-xl font-bold text-destructive">{formatCurrency(totalEmAberto)}</p>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {titulos.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <FileText className="h-12 w-12 mx-auto mb-2 opacity-50" />
            <p>Nenhum título encontrado</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Parcela</TableHead>
                  <TableHead>Vencimento</TableHead>
                  <TableHead>Valor</TableHead>
                  <TableHead>Atraso</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Ação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {titulos.map((titulo) => {
                  const atraso = calcularAtraso(titulo.vencimento);
                  const isVencido = titulo.status === 'vencido' || (titulo.status === 'em_aberto' && atraso > 0);
                  
                  return (
                    <TableRow key={titulo.id}>
                      <TableCell>
                        {titulo.numero_parcela && titulo.total_parcelas
                          ? `${titulo.numero_parcela}/${titulo.total_parcelas}`
                          : '-'}
                      </TableCell>
                      <TableCell>
                        {format(new Date(titulo.vencimento), 'dd/MM/yyyy')}
                      </TableCell>
                      <TableCell className="font-medium">
                        {formatCurrency(titulo.valor)}
                      </TableCell>
                      <TableCell>
                        {isVencido ? (
                          <span className="flex items-center gap-1 text-destructive">
                            <AlertTriangle className="h-3 w-3" />
                            {atraso} dias
                          </span>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {getStatusBadge(titulo.status)}
                      </TableCell>
                      <TableCell className="text-right">
                        {(titulo.status === 'em_aberto' || titulo.status === 'vencido') && (
                          <Button 
                            size="sm" 
                            variant="outline"
                            onClick={() => navigate('/acordos', {
                              state: {
                                clienteId,
                                tituloIds: [titulo.titulo_pai_id || titulo.id],
                                valorTotal: totalEmAberto
                              }
                            })}
                          >
                            <Handshake className="h-4 w-4 mr-1" />
                            Acordo
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
