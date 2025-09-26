import { useState, useEffect } from 'react';
import { Plus, Search, Filter, Eye, Edit, Phone, Mail, MessageSquare, FileText, User } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

// Atualize a interface Cliente para incluir todos os campos
interface Cliente {
  id: string;
  nome: string;
  cpf_cnpj: string;
  telefone?: string;
  email?: string;
  endereco_completo?: string;
  cep?: string;
  cidade?: string;
  estado?: string;
  status: string;
  observacoes?: string;
  created_by: string;
  created_at: string;
  updated_at: string;
  // Dados calculados
  total_titulos?: number;
  total_valor?: number;
  ultima_comunicacao?: string;
}

interface Comunicacao {
  id: string;
  tipo: string;
  assunto: string;
  mensagem?: string;
  resultado?: string;
  data_contato?: string;
  created_at: string;
}

export default function Clientes() {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [selectedCliente, setSelectedCliente] = useState<Cliente | null>(null);
  const [comunicacoes, setComunicacoes] = useState<Comunicacao[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('todos');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [newCliente, setNewCliente] = useState({
    nome: '',
    cpf_cnpj: '',
    telefone: '',
    email: '',
    endereco_completo: '',
    cep: '',
    cidade: '',
    estado: '',
    observacoes: ''
  });
  const { toast } = useToast();

  useEffect(() => {
    fetchClientes();
  }, [statusFilter]);

  useEffect(() => {
    if (selectedCliente) {
      fetchComunicacoes(selectedCliente.id);
    }
  }, [selectedCliente]);

  const fetchClientes = async () => {
    try {
      setLoading(true);
      let query = supabase
        .from('clientes')
        .select(`
          *,
          titulos (
            id,
            valor
          )
        `);

      if (statusFilter !== 'todos') {
        query = query.eq('status', statusFilter);
      }

      const { data, error } = await query.order('created_at', { ascending: false });

      if (error) throw error;

      // Calcular dados agregados para cada cliente
      const clientesComDados = data?.map(cliente => ({
        ...cliente,
        total_titulos: cliente.titulos?.length || 0,
        total_valor: cliente.titulos?.reduce((sum: number, titulo: any) => sum + titulo.valor, 0) || 0
      })) || [];

      setClientes(clientesComDados);
    } catch (error) {
      console.error('Erro ao carregar clientes:', error);
      toast({
        title: "Erro",
        description: "Não foi possível carregar os clientes",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchComunicacoes = async (clienteId: string) => {
    try {
      const { data, error } = await supabase
        .from('comunicacoes')
        .select('*')
        .eq('cliente_id', clienteId)
        .order('created_at', { ascending: false })
        .limit(10);

      if (error) throw error;
      setComunicacoes(data || []);
    } catch (error) {
      console.error('Erro ao carregar comunicações:', error);
    }
  };

  const handleCreateCliente = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) throw new Error('Usuário não autenticado');

      const { data, error } = await supabase
        .from('clientes')
        .insert([
          { 
            ...newCliente,
            status: 'ativo',
            created_by: user.id
          }
        ])
        .select();

      if (error) throw error;

      toast({
        title: "Sucesso",
        description: "Cliente criado com sucesso.",
      });
      setIsCreateModalOpen(false);
      fetchClientes();
      setNewCliente({
        nome: '',
        cpf_cnpj: '',
        telefone: '',
        email: '',
        endereco_completo: '',
        cep: '',
        cidade: '',
        estado: '',
        observacoes: ''
      });
    } catch (error) {
      console.error('Erro ao criar cliente:', error);
      toast({
        title: "Erro",
        description: "Não foi possível criar o cliente.",
        variant: "destructive",
      });
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'ativo': return 'bg-green-100 text-green-800';
      case 'inadimplente': return 'bg-red-100 text-red-800';
      case 'em_acordo': return 'bg-blue-100 text-blue-800';
      case 'quitado': return 'bg-gray-100 text-gray-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getTipoIcon = (tipo: string) => {
    switch (tipo) {
      case 'ligacao': return <Phone className="h-4 w-4" />;
      case 'email': return <Mail className="h-4 w-4" />;
      case 'sms': 
      case 'whatsapp': return <MessageSquare className="h-4 w-4" />;
      case 'visita': return <User className="h-4 w-4" />;
      default: return <FileText className="h-4 w-4" />;
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

  const formatDateTime = (date: string) => {
    return new Date(date).toLocaleString('pt-BR');
  };

  const filteredClientes = clientes.filter(cliente =>
    cliente.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
    cliente.cpf_cnpj.includes(searchTerm) ||
    cliente.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    cliente.telefone?.includes(searchTerm)
  );

  const statusCounts = {
    total: clientes.length,
    ativo: clientes.filter(c => c.status === 'ativo').length,
    inadimplente: clientes.filter(c => c.status === 'inadimplente').length,
    em_acordo: clientes.filter(c => c.status === 'em_acordo').length,
    quitado: clientes.filter(c => c.status === 'quitado').length,
  };

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
          <h1 className="text-2xl font-bold">Clientes</h1>
          <p className="text-muted-foreground">Gerencie os clientes e seu histórico</p>
        </div>
        <Button onClick={() => setIsCreateModalOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Novo Cliente
        </Button>
      </div>

      <Dialog open={isCreateModalOpen} onOpenChange={setIsCreateModalOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Novo Cliente</DialogTitle>
            <DialogDescription>
              Preencha os dados do novo cliente.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="name" className="text-right">
                Nome
              </Label>
              <Input id="name" value={newCliente.nome} onChange={(e) => setNewCliente({ ...newCliente, nome: e.target.value })} className="col-span-3" />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="cpf_cnpj" className="text-right">
                CPF/CNPJ
              </Label>
              <Input id="cpf_cnpj" value={newCliente.cpf_cnpj} onChange={(e) => setNewCliente({ ...newCliente, cpf_cnpj: e.target.value })} className="col-span-3" />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="telefone" className="text-right">
                Telefone
              </Label>
              <Input id="telefone" value={newCliente.telefone} onChange={(e) => setNewCliente({ ...newCliente, telefone: e.target.value })} className="col-span-3" />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="email" className="text-right">
                Email
              </Label>
              <Input id="email" type="email" value={newCliente.email} onChange={(e) => setNewCliente({ ...newCliente, email: e.target.value })} className="col-span-3" />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="cep" className="text-right">
                CEP
              </Label>
              <Input id="cep" value={newCliente.cep} onChange={(e) => setNewCliente({ ...newCliente, cep: e.target.value })} className="col-span-3" />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="cidade" className="text-right">
                Cidade
              </Label>
              <Input id="cidade" value={newCliente.cidade} onChange={(e) => setNewCliente({ ...newCliente, cidade: e.target.value })} className="col-span-3" />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="estado" className="text-right">
                Estado
              </Label>
              <Input id="estado" value={newCliente.estado} onChange={(e) => setNewCliente({ ...newCliente, estado: e.target.value })} className="col-span-3" />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="endereco" className="text-right">
                Endereço
              </Label>
              <Input id="endereco" value={newCliente.endereco_completo} onChange={(e) => setNewCliente({ ...newCliente, endereco_completo: e.target.value })} className="col-span-3" />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="observacoes" className="text-right">
                Observações
              </Label>
              <Input id="observacoes" value={newCliente.observacoes} onChange={(e) => setNewCliente({ ...newCliente, observacoes: e.target.value })} className="col-span-3" />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={handleCreateCliente}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="grid gap-4 md:grid-cols-5">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total</CardTitle>
            <User className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{statusCounts.total}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Ativos</CardTitle>
            <User className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{statusCounts.ativo}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Inadimplentes</CardTitle>
            <User className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{statusCounts.inadimplente}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Em Acordo</CardTitle>
            <User className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">{statusCounts.em_acordo}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Quitados</CardTitle>
            <User className="h-4 w-4 text-gray-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-600">{statusCounts.quitado}</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Lista de Clientes</CardTitle>
              <CardDescription>
                {filteredClientes.length} clientes encontrados
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex gap-4 mb-6">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                  <Input
                    placeholder="Buscar por nome, CPF/CNPJ, email ou telefone..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="px-3 py-2 border border-input rounded-md bg-background"
                >
                  <option value="todos">Todos os Status</option>
                  <option value="ativo">Ativo</option>
                  <option value="inadimplente">Inadimplente</option>
                  <option value="em_acordo">Em Acordo</option>
                  <option value="quitado">Quitado</option>
                </select>
              </div>

              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Cliente</TableHead>
                      <TableHead>CPF/CNPJ</TableHead>
                      <TableHead>Contato</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Títulos</TableHead>
                      <TableHead>Valor Total</TableHead>
                      <TableHead>Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredClientes.map((cliente) => (
                      <TableRow 
                        key={cliente.id}
                        className={selectedCliente?.id === cliente.id ? "bg-muted/50" : ""}
                      >
                        <TableCell className="font-medium">{cliente.nome}</TableCell>
                        <TableCell>{cliente.cpf_cnpj}</TableCell>
                        <TableCell>
                          <div className="text-sm">
                            {cliente.telefone && <div>{cliente.telefone}</div>}
                            {cliente.email && <div className="text-muted-foreground">{cliente.email}</div>}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge className={getStatusColor(cliente.status)}>
                            {cliente.status.replace('_', ' ')}
                          </Badge>
                        </TableCell>
                        <TableCell>{cliente.total_titulos}</TableCell>
                        <TableCell>{formatCurrency(cliente.total_valor || 0)}</TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            <Button 
                              variant="ghost" 
                              size="sm"
                              onClick={() => setSelectedCliente(cliente)}
                            >
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

        <div>
          {selectedCliente ? (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <User className="h-5 w-5" />
                  {selectedCliente.nome}
                </CardTitle>
                <CardDescription>
                  Detalhes e histórico do cliente
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Tabs defaultValue="detalhes" className="w-full">
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="detalhes">Detalhes</TabsTrigger>
                    <TabsTrigger value="historico">Histórico</TabsTrigger>
                  </TabsList>
                  
                  <TabsContent value="detalhes" className="space-y-4">
                    <div className="space-y-3">
                      <div>
                        <label className="text-sm font-medium">CPF/CNPJ</label>
                        <p className="text-sm text-muted-foreground">{selectedCliente.cpf_cnpj}</p>
                      </div>
                      
                      {selectedCliente.telefone && (
                        <div>
                          <label className="text-sm font-medium">Telefone</label>
                          <p className="text-sm text-muted-foreground">{selectedCliente.telefone}</p>
                        </div>
                      )}
                      
                      {selectedCliente.email && (
                        <div>
                          <label className="text-sm font-medium">E-mail</label>
                          <p className="text-sm text-muted-foreground">{selectedCliente.email}</p>
                        </div>
                      )}
                      
                      {selectedCliente.endereco_completo && (
                        <div>
                          <label className="text-sm font-medium">Endereço</label>
                          <p className="text-sm text-muted-foreground">{selectedCliente.endereco_completo}</p>
                        </div>
                      )}
                      
                      <div>
                        <label className="text-sm font-medium">Status</label>
                        <div className="mt-1">
                          <Badge className={getStatusColor(selectedCliente.status)}>
                            {selectedCliente.status.replace('_', ' ')}
                          </Badge>
                        </div>
                      </div>
                      
                      <div className="pt-3 border-t">
                        <div className="grid grid-cols-2 gap-4 text-center">
                          <div>
                            <p className="text-lg font-bold">{selectedCliente.total_titulos}</p>
                            <p className="text-sm text-muted-foreground">Títulos</p>
                          </div>
                          <div>
                            <p className="text-lg font-bold">{formatCurrency(selectedCliente.total_valor || 0)}</p>
                            <p className="text-sm text-muted-foreground">Valor Total</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </TabsContent>
                  
                  <TabsContent value="historico" className="space-y-4">
                    <div className="space-y-3">
                      {comunicacoes.length === 0 ? (
                        <p className="text-sm text-muted-foreground text-center py-4">
                          Nenhuma comunicação registrada
                        </p>
                      ) : (
                        comunicacoes.map((comunicacao) => (
                          <div key={comunicacao.id} className="flex items-start gap-3 p-3 border rounded-lg">
                            <div className="p-2 rounded-full bg-muted">
                              {getTipoIcon(comunicacao.tipo)}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="text-sm font-medium capitalize">{comunicacao.tipo}</span>
                                {comunicacao.resultado && (
                                  <Badge variant="outline" className="text-xs">
                                    {comunicacao.resultado}
                                  </Badge>
                                )}
                              </div>
                              <p className="text-sm font-medium">{comunicacao.assunto}</p>
                              {comunicacao.mensagem && (
                                <p className="text-sm text-muted-foreground mt-1">{comunicacao.mensagem}</p>
                              )}
                              <p className="text-xs text-muted-foreground mt-2">
                                {formatDateTime(comunicacao.data_contato || comunicacao.created_at)}
                              </p>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                    
                    <Button variant="outline" className="w-full">
                      <Plus className="h-4 w-4 mr-2" />
                      Nova Comunicação
                    </Button>
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="flex items-center justify-center h-64">
                <div className="text-center">
                  <User className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                  <p className="text-muted-foreground">
                    Selecione um cliente para ver os detalhes
                  </p>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}