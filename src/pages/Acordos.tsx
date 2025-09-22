import { useState, useEffect } from 'react';
import { Plus, Search, Eye, Edit, FileText } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';

interface Acordo {
  id: string;
  titulo_id: string;
  valor_original: number;
  valor_acordo: number;
  desconto: number;
  parcelas: number;
  observacoes?: string;
  created_at: string;
  // Joined from titulos table
  cliente?: string;
  cpf_cnpj?: string;
}

export default function Acordos() {
  const [acordos, setAcordos] = useState<Acordo[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const { toast } = useToast();

  useEffect(() => {
    fetchAcordos();
  }, []);

  const fetchAcordos = async () => {
    try {
      const { data, error } = await supabase
        .from('acordos')
        .select(`
          *,
          titulos:titulo_id (
            cliente,
            cpf_cnpj
          )
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;
      
      const formattedData = data?.map(acordo => ({
        ...acordo,
        cliente: acordo.titulos?.cliente,
        cpf_cnpj: acordo.titulos?.cpf_cnpj
      })) || [];
      
      setAcordos(formattedData);
    } catch (error) {
      console.error('Erro ao carregar acordos:', error);
      toast({
        title: "Erro",
        description: "Não foi possível carregar os acordos",
        variant: "destructive",
      });
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

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('pt-BR');
  };

  const calculateDesconto = (original: number, acordo: number) => {
    const desconto = ((original - acordo) / original) * 100;
    return `${desconto.toFixed(1)}%`;
  };

  const filteredAcordos = acordos.filter(acordo =>
    acordo.cliente?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    acordo.cpf_cnpj?.includes(searchTerm) ||
    acordo.observacoes?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold">Acordos</h1>
          <p className="text-muted-foreground">Gerencie os acordos de pagamento</p>
        </div>
        <Button>
          <Plus className="h-4 w-4 mr-2" />
          Novo Acordo
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total de Acordos</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{acordos.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Valor Total Original</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatCurrency(acordos.reduce((sum, acordo) => sum + acordo.valor_original, 0))}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Valor Total Acordado</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatCurrency(acordos.reduce((sum, acordo) => sum + acordo.valor_acordo, 0))}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Desconto Médio</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {acordos.length > 0 
                ? `${(acordos.reduce((sum, acordo) => sum + ((acordo.valor_original - acordo.valor_acordo) / acordo.valor_original * 100), 0) / acordos.length).toFixed(1)}%`
                : '0%'
              }
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Lista de Acordos</CardTitle>
          <CardDescription>
            Acordos realizados com clientes
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4 mb-6">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
              <Input
                placeholder="Buscar por cliente, CPF/CNPJ ou observações..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>

          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cliente</TableHead>
                  <TableHead>CPF/CNPJ</TableHead>
                  <TableHead>Valor Original</TableHead>
                  <TableHead>Valor Acordo</TableHead>
                  <TableHead>Desconto</TableHead>
                  <TableHead>Parcelas</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead>Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredAcordos.map((acordo) => (
                  <TableRow key={acordo.id}>
                    <TableCell className="font-medium">{acordo.cliente}</TableCell>
                    <TableCell>{acordo.cpf_cnpj}</TableCell>
                    <TableCell>{formatCurrency(acordo.valor_original)}</TableCell>
                    <TableCell>{formatCurrency(acordo.valor_acordo)}</TableCell>
                    <TableCell className="text-green-600 font-medium">
                      {calculateDesconto(acordo.valor_original, acordo.valor_acordo)}
                    </TableCell>
                    <TableCell>{acordo.parcelas}x</TableCell>
                    <TableCell>{formatDate(acordo.created_at)}</TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button variant="ghost" size="sm">
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="sm">
                          <Edit className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}