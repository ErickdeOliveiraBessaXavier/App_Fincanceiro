import { useState, useEffect } from 'react';
import { Plus, Search, Filter, Eye, Edit, Phone, Mail, MessageSquare, FileText, User, Trash2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';

interface Titulo {
  id: string;
  cliente: string;
  cpf_cnpj: string;
  valor: number;
  vencimento: string;
  status: string;
  contato?: string;
  descricao?: string;
  created_at: string;
}

export default function Titulos() {
  const [titulos, setTitulos] = useState<Titulo[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const { toast } = useToast();

  useEffect(() => {
    fetchTitulos();
  }, []);

  const fetchTitulos = async () => {
    try {
      const { data, error } = await supabase
        .from('titulos')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setTitulos(data || []);
    } catch (error) {
      console.error('Erro ao carregar títulos:', error);
      toast({
        title: "Erro",
        description: "Não foi possível carregar os títulos",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'em_aberto': return 'bg-yellow-100 text-yellow-800';
      case 'pago': return 'bg-green-100 text-green-800';
      case 'vencido': return 'bg-red-100 text-red-800';
      case 'acordo': return 'bg-blue-100 text-blue-800';
      default: return 'bg-gray-100 text-gray-800';
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

  const filteredTitulos = titulos.filter(titulo =>
    titulo.cliente.toLowerCase().includes(searchTerm.toLowerCase()) ||
    titulo.cpf_cnpj.includes(searchTerm) ||
    titulo.status.toLowerCase().includes(searchTerm.toLowerCase())
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
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold">Títulos</h1>
          <p className="text-muted-foreground text-sm sm:text-base">Gerencie os títulos de cobrança</p>
        </div>
        <Button className="self-start sm:self-auto">
          <Plus className="h-4 w-4 mr-2" />
          <span className="hidden sm:inline">Novo Título</span>
          <span className="sm:hidden">Novo</span>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Lista de Títulos</CardTitle>
          <CardDescription>
            Total de {titulos.length} títulos cadastrados
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-4 mb-6">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
              <Input
                placeholder="Buscar por cliente, CPF/CNPJ..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <Button variant="outline" className="sm:w-auto">
              <Filter className="h-4 w-4 mr-2" />
              <span className="hidden sm:inline">Filtros</span>
              <span className="sm:hidden">Filtrar</span>
            </Button>
          </div>

          {/* Mobile Card View */}
          <div className="block sm:hidden space-y-4">
            {filteredTitulos.map((titulo) => (
              <Card key={titulo.id} className="p-4">
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <h3 className="font-medium text-sm">{titulo.cliente}</h3>
                    <p className="text-xs text-muted-foreground">{titulo.cpf_cnpj}</p>
                  </div>
                  <Badge className={getStatusColor(titulo.status)} variant="secondary">
                    {titulo.status.replace('_', ' ')}
                  </Badge>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs mb-3">
                  <div>
                    <span className="text-muted-foreground">Valor: </span>
                    <span className="font-medium">{formatCurrency(titulo.valor)}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Vencimento: </span>
                    <span className="font-medium">{formatDate(titulo.vencimento)}</span>
                  </div>
                </div>
                <div className="flex gap-1 justify-end">
                  <Button variant="ghost" size="sm">
                    <Eye className="h-3 w-3" />
                  </Button>
                  <Button variant="ghost" size="sm">
                    <Edit className="h-3 w-3" />
                  </Button>
                  <Button variant="ghost" size="sm">
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </Card>
            ))}
          </div>

          {/* Desktop Table View */}
          <div className="hidden sm:block rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cliente</TableHead>
                  <TableHead className="hidden md:table-cell">CPF/CNPJ</TableHead>
                  <TableHead>Valor</TableHead>
                  <TableHead className="hidden lg:table-cell">Vencimento</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredTitulos.map((titulo) => (
                  <TableRow key={titulo.id}>
                    <TableCell className="font-medium">
                      <div>
                        <div>{titulo.cliente}</div>
                        <div className="text-xs text-muted-foreground md:hidden">{titulo.cpf_cnpj}</div>
                      </div>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">{titulo.cpf_cnpj}</TableCell>
                    <TableCell>
                      <div>
                        <div>{formatCurrency(titulo.valor)}</div>
                        <div className="text-xs text-muted-foreground lg:hidden">{formatDate(titulo.vencimento)}</div>
                      </div>
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">{formatDate(titulo.vencimento)}</TableCell>
                    <TableCell>
                      <Badge className={getStatusColor(titulo.status)} variant="secondary">
                        {titulo.status.replace('_', ' ')}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="sm">
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="sm">
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="sm">
                          <Trash2 className="h-4 w-4" />
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