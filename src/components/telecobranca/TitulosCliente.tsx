import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Handshake, AlertTriangle, FileText } from 'lucide-react';
import { format, differenceInDays } from 'date-fns';
import { useNavigate } from 'react-router-dom';

interface Parcela {
  id: string;
  titulo_id: string;
  numero_parcela: number;
  valor_nominal: number;
  vencimento: string;
  saldo_atual: number;
  total_pago: number;
  status: string;
}

interface TitulosClienteProps {
  clienteId: string;
}

export function TitulosCliente({ clienteId }: TitulosClienteProps) {
  const [parcelas, setParcelas] = useState<Parcela[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    fetchParcelas();
  }, [clienteId]);

  const fetchParcelas = async () => {
    try {
      setLoading(true);
      
      // Buscar títulos do cliente
      const { data: titulos, error: titulosError } = await supabase
        .from('titulos')
        .select('id')
        .eq('cliente_id', clienteId);

      if (titulosError) throw titulosError;

      if (!titulos || titulos.length === 0) {
        setParcelas([]);
        return;
      }

      const tituloIds = titulos.map(t => t.id);

      // Buscar parcelas consolidadas desses títulos
      const { data: parcelasData, error: parcelasError } = await supabase
        .from('mv_parcelas_consolidadas')
        .select('*')
        .in('titulo_id', tituloIds)
        .order('vencimento', { ascending: true });

      if (parcelasError) throw parcelasError;

      setParcelas(parcelasData || []);
    } catch (error) {
      console.error('Erro ao carregar parcelas:', error);
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
      pendente: { label: 'Pendente', className: 'bg-yellow-100 text-yellow-800' },
      vencida: { label: 'Vencida', className: 'bg-red-100 text-red-800' },
      paga: { label: 'Paga', className: 'bg-green-100 text-green-800' },
    };
    const config = statusConfig[status] || { label: status, className: 'bg-gray-100 text-gray-800' };
    return <Badge className={config.className}>{config.label}</Badge>;
  };

  const totalEmAberto = parcelas
    .filter(p => p.status === 'pendente' || p.status === 'vencida')
    .reduce((sum, p) => sum + Number(p.saldo_atual), 0);

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
            Parcelas
          </CardTitle>
          <div className="text-right">
            <p className="text-sm text-muted-foreground">Total em Aberto</p>
            <p className="text-xl font-bold text-destructive">{formatCurrency(totalEmAberto)}</p>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {parcelas.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <FileText className="h-12 w-12 mx-auto mb-2 opacity-50" />
            <p>Nenhuma parcela encontrada</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Parcela</TableHead>
                  <TableHead>Vencimento</TableHead>
                  <TableHead>Valor Original</TableHead>
                  <TableHead>Saldo</TableHead>
                  <TableHead>Atraso</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Ação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {parcelas.map((parcela) => {
                  const atraso = calcularAtraso(parcela.vencimento);
                  const isVencida = parcela.status === 'vencida';
                  
                  return (
                    <TableRow key={parcela.id}>
                      <TableCell>
                        {parcela.numero_parcela}
                      </TableCell>
                      <TableCell>
                        {format(new Date(parcela.vencimento), 'dd/MM/yyyy')}
                      </TableCell>
                      <TableCell>
                        {formatCurrency(parcela.valor_nominal)}
                      </TableCell>
                      <TableCell className="font-medium">
                        {formatCurrency(parcela.saldo_atual)}
                      </TableCell>
                      <TableCell>
                        {isVencida ? (
                          <span className="flex items-center gap-1 text-destructive">
                            <AlertTriangle className="h-3 w-3" />
                            {atraso} dias
                          </span>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {getStatusBadge(parcela.status)}
                      </TableCell>
                      <TableCell className="text-right">
                        {(parcela.status === 'pendente' || parcela.status === 'vencida') && (
                          <Button 
                            size="sm" 
                            variant="outline"
                            onClick={() => navigate('/acordos', {
                              state: {
                                clienteId,
                                tituloIds: [parcela.titulo_id],
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
