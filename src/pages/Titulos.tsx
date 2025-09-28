import { useState, useEffect } from 'react';
import { Plus, Search, Filter, Eye, Edit, Phone, Mail, MessageSquare, FileText, User, Trash2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
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
import type { Database } from '@/integrations/supabase/types';

// Tipos derivados do esquema do banco de dados gerado pelo Supabase
type TituloRow = Database['public']['Tables']['titulos']['Row'];

// Interface para o estado do formulário de criação de título.
// É diferente do tipo de inserção, pois `created_by` é adicionado no momento do envio.
interface NovoTitulo {
  cliente_id: string;
  valor: number;
  vencimento: string;
  status: 'em_aberto' | 'pago' | 'vencido' | 'acordo';
  observacoes?: string | null;
}

// Interface principal para um Título, estendendo a linha da tabela e adicionando o cliente aninhado
export interface Titulo extends TituloRow {
  cliente: {
    id: string;
    nome: string;
    cpf_cnpj: string;
    telefone?: string | null;
    email?: string | null;
  };
}

// Interface para os erros do formulário
interface FormErrors {
  cliente_id?: string;
  valor?: string;
  vencimento?: string;
}

// Interface para o estado de um título que está sendo editado
interface TituloEditando {
  id: string;
  cliente_id: string;
  valor: number;
  vencimento: string;
  status: 'em_aberto' | 'pago' | 'vencido' | 'acordo';
  observacoes?: string | null;
}


export default function Titulos() {
  const [titulos, setTitulos] = useState<Titulo[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [selectedTitulo, setSelectedTitulo] = useState<Titulo | null>(null);
  const [tituloToDelete, setTituloToDelete] = useState<Titulo | null>(null);
  const [clientes, setClientes] = useState<Array<{ id: string; nome: string; cpf_cnpj: string }>>([]);
  const [newTitulo, setNewTitulo] = useState<NovoTitulo>({
    cliente_id: '',
    valor: 0,
    vencimento: new Date().toISOString().split('T')[0],
    status: 'em_aberto',
    observacoes: ''
  });
  const [editingTitulo, setEditingTitulo] = useState<TituloEditando>({
    id: '',
    cliente_id: '',
    valor: 0,
    vencimento: new Date().toISOString().split('T')[0],
    status: 'em_aberto',
    observacoes: ''
  });
  const [formErrors, setFormErrors] = useState<FormErrors>({});
  const { toast } = useToast();

  useEffect(() => {
    fetchTitulos();
    fetchClientes();
  }, []);

  const fetchTitulos = async () => {
    try {
      setLoading(true);
      const { data: rawData, error } = await supabase
        .from('titulos')
        .select(`
          *,
          cliente:clientes (
            id,
            nome,
            cpf_cnpj,
            telefone,
            email
          )
        `)
        .order('vencimento', { ascending: true });

      if (error) {
        console.error('Erro na query:', error);
        throw error;
      }

      // Verificar se rawData existe e tem o formato correto
      const typedData = (rawData || []).map((item: any) => {
        console.log('Item da API:', item); // Para debug
        return {
          id: item.id,
          cliente_id: item.cliente_id,
          valor: item.valor,
          vencimento: item.vencimento,
          status: item.status as 'em_aberto' | 'pago' | 'vencido' | 'acordo',
          observacoes: item.observacoes || '',
          created_by: item.created_by,
          created_at: item.created_at,
          updated_at: item.updated_at,
          cliente: item.cliente ? {
            id: item.cliente.id,
            nome: item.cliente.nome,
            cpf_cnpj: item.cliente.cpf_cnpj,
            telefone: item.cliente.telefone || '',
            email: item.cliente.email || ''
          } : {
            id: item.cliente_id || '',
            nome: 'Cliente não encontrado',
            cpf_cnpj: '',
            telefone: '',
            email: ''
          }
        };
      });

      console.log('Dados processados:', typedData); // Para debug
      setTitulos(typedData as Titulo[]);
    } catch (error) {
      console.error('Erro ao carregar títulos:', error);
      toast({
        title: "Erro",
        description: `Não foi possível carregar os títulos: ${error.message}`,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchClientes = async () => {
    try {
      const { data, error } = await supabase
        .from('clientes')
        .select('id, nome, cpf_cnpj, status')
        .in('status', ['ativo', 'inadimplente', 'em_acordo']) // Incluir mais status
        .order('nome');

      if (error) throw error;
      setClientes(data || []);
    } catch (error) {
      console.error('Erro ao carregar clientes:', error);
      toast({
        title: "Erro",
        description: "Não foi possível carregar a lista de clientes",
        variant: "destructive",
      });
    }
  };

  const handleDeleteTitulo = async () => {
    if (!tituloToDelete) return;

    try {
      const { error } = await supabase
        .from('titulos')
        .delete()
        .eq('id', tituloToDelete.id);

      if (error) throw error;

      setTitulos(prev => prev.filter(t => t.id !== tituloToDelete.id));
      setTituloToDelete(null);
      setIsDeleteModalOpen(false);

      if (selectedTitulo?.id === tituloToDelete.id) {
        setSelectedTitulo(null);
        setIsDetailsModalOpen(false);
      }

      toast({
        title: "Sucesso",
        description: "Título excluído com sucesso",
      });
    } catch (error) {
      console.error('Erro ao excluir título:', error);
      toast({
        title: "Erro",
        description: "Não foi possível excluir o título",
        variant: "destructive",
      });
    }
  };

  const validateForm = () => {
    const errors: FormErrors = {};
    let isValid = true;

    if (!newTitulo.cliente_id) {
      errors.cliente_id = 'Cliente é obrigatório';
      isValid = false;
    }

    if (!newTitulo.valor || newTitulo.valor <= 0) {
      errors.valor = 'Valor deve ser maior que zero';
      isValid = false;
    }

    if (!newTitulo.vencimento) {
      errors.vencimento = 'Data de vencimento é obrigatória';
      isValid = false;
    }

    setFormErrors(errors);
    return isValid;
  };

  const handleCreateTitulo = async () => {
    if (!validateForm()) {
      toast({
        title: "Erro",
        description: "Por favor, preencha todos os campos obrigatórios.",
        variant: "destructive",
      });
      return;
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) throw new Error('Usuário não autenticado');

      // Inserir o título usando exatamente os campos da tabela
      const { data: insertedData, error: insertError } = await supabase
        .from('titulos')
        .insert({
          cliente_id: newTitulo.cliente_id,
          valor: newTitulo.valor,
          vencimento: newTitulo.vencimento,
          status: newTitulo.status,
          observacoes: newTitulo.observacoes || null,
          created_by: user.id
        })
        .select()
        .single();

      if (insertError) throw insertError;

      // Buscar dados do cliente para completar a interface
      const { data: clienteData } = await supabase
        .from('clientes')
        .select('id, nome, cpf_cnpj, telefone, email')
        .eq('id', newTitulo.cliente_id)
        .single();

      // Criar objeto compatível com a interface
      const novoTitulo: Titulo = {
        id: insertedData.id,
        cliente_id: insertedData.cliente_id,
        valor: insertedData.valor,
        vencimento: insertedData.vencimento,
        status: insertedData.status as 'em_aberto' | 'pago' | 'vencido' | 'acordo',
        observacoes: insertedData.observacoes || '',
        created_by: insertedData.created_by,
        created_at: insertedData.created_at,
        updated_at: insertedData.updated_at,
        cliente: clienteData || {
          id: newTitulo.cliente_id,
          nome: 'Cliente não encontrado',
          cpf_cnpj: '',
          telefone: '',
          email: ''
        }
      };

      setTitulos(prev => [novoTitulo, ...prev]);
      setIsCreateModalOpen(false);
      setNewTitulo({
        cliente_id: '',
        valor: 0,
        vencimento: new Date().toISOString().split('T')[0],
        status: 'em_aberto',
        observacoes: ''
      });
      setFormErrors({});

      toast({
        title: "Sucesso",
        description: "Título criado com sucesso",
      });
    } catch (error) {
      console.error('Erro ao criar título:', error);
      toast({
        title: "Erro",
        description: `Não foi possível criar o título: ${error.message}`,
        variant: "destructive",
      });
    }
  };

  const validateEditForm = () => {
    const errors: FormErrors = {};
    let isValid = true;

    if (!editingTitulo.cliente_id) {
      errors.cliente_id = 'Cliente é obrigatório';
      isValid = false;
    }

    if (!editingTitulo.valor || editingTitulo.valor <= 0) {
      errors.valor = 'Valor deve ser maior que zero';
      isValid = false;
    }

    if (!editingTitulo.vencimento) {
      errors.vencimento = 'Data de vencimento é obrigatória';
      isValid = false;
    }

    setFormErrors(errors);
    return isValid;
  };

  const handleEditTitulo = async () => {
    if (!validateEditForm()) {
      toast({
        title: "Erro",
        description: "Por favor, preencha todos os campos obrigatórios.",
        variant: "destructive",
      });
      return;
    }

    try {
      // Atualizar o título e retornar o registro atualizado para obter o `updated_at` do banco
      const { data: updatedData, error: updateError } = await supabase
        .from('titulos')
        .update({
          cliente_id: editingTitulo.cliente_id,
          valor: editingTitulo.valor,
          vencimento: editingTitulo.vencimento,
          status: editingTitulo.status,
          observacoes: editingTitulo.observacoes || null
        })
        .eq('id', editingTitulo.id)
        .select()
        .single();

      if (updateError) throw updateError;
      if (!updatedData) throw new Error("Não foi possível obter os dados atualizados do título.");

      // Buscar dados do cliente para atualizar a interface
      const { data: clienteData } = await supabase
        .from('clientes')
        .select('id, nome, cpf_cnpj, telefone, email')
        .eq('id', editingTitulo.cliente_id)
        .single();

      // Atualizar estado local com os dados retornados pelo banco de dados
      const updatedTitulo: Titulo = {
        ...updatedData,
        status: updatedData.status as 'em_aberto' | 'pago' | 'vencido' | 'acordo',
        observacoes: updatedData.observacoes || '',
        cliente: clienteData || {
          id: editingTitulo.cliente_id,
          nome: 'Cliente não encontrado',
          cpf_cnpj: '',
          telefone: '',
          email: ''
        }
      };

      setTitulos(prev => prev.map(t => 
        t.id === updatedTitulo.id ? updatedTitulo : t
      ));

      setIsEditModalOpen(false);
      setFormErrors({});
      toast({
        title: "Sucesso",
        description: "Título atualizado com sucesso",
      });
    } catch (error) {
      console.error('Erro ao atualizar título:', error);
      toast({
        title: "Erro",
        description: `Não foi possível atualizar o título: ${error.message}`,
        variant: "destructive",
      });
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
    titulo.cliente.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
    titulo.cliente.cpf_cnpj.includes(searchTerm) ||
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
        <Button 
          onClick={() => setIsCreateModalOpen(true)} 
          className="self-start sm:self-auto"
        >
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
                    <h3 className="font-medium text-sm">{titulo.cliente.nome}</h3>
                    <p className="text-xs text-muted-foreground">{titulo.cliente.cpf_cnpj}</p>
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
                  <Button variant="ghost" size="sm" onClick={() => {
                    setSelectedTitulo(titulo);
                    setIsDetailsModalOpen(true);
                  }}>
                    <Eye className="h-3 w-3" />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => {
                    setEditingTitulo({
                      id: titulo.id,
                      cliente_id: titulo.cliente_id,
                      valor: titulo.valor,
                      vencimento: new Date(titulo.vencimento).toISOString().split('T')[0],
                      status: titulo.status as 'em_aberto' | 'pago' | 'vencido' | 'acordo',
                      observacoes: titulo.observacoes || ''
                    });
                    setIsEditModalOpen(true);
                  }}>
                    <Edit className="h-3 w-3" />
                  </Button>
                  <Button variant="ghost" size="sm"
                    onClick={() => {
                      setTituloToDelete(titulo);
                      setIsDeleteModalOpen(true);
                    }}
                  >
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
                        <div>{titulo.cliente.nome}</div>
                        <div className="text-xs text-muted-foreground md:hidden">{titulo.cliente.cpf_cnpj}</div>
                      </div>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">{titulo.cliente.cpf_cnpj}</TableCell>
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
                        <Button variant="ghost" size="sm" onClick={() => {
                          setSelectedTitulo(titulo);
                          setIsDetailsModalOpen(true);
                        }}>
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => {
                          setEditingTitulo({
                            id: titulo.id,
                            cliente_id: titulo.cliente_id,
                            valor: titulo.valor,
                            vencimento: new Date(titulo.vencimento).toISOString().split('T')[0],
                            status: titulo.status as 'em_aberto' | 'pago' | 'vencido' | 'acordo',
                            observacoes: titulo.observacoes || ''
                          });
                          setIsEditModalOpen(true);
                        }}>
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="sm"
                          onClick={() => {
                            setTituloToDelete(titulo);
                            setIsDeleteModalOpen(true);
                          }}
                        >
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

      {/* Modals */}
      <Dialog open={isCreateModalOpen} onOpenChange={setIsCreateModalOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Novo Título</DialogTitle>
            <DialogDescription>
              Crie um novo título para cobrança
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="cliente">Cliente</Label>
              <select
                id="cliente"
                value={newTitulo.cliente_id}
                onChange={(e) => setNewTitulo({ ...newTitulo, cliente_id: e.target.value })}
                className={`flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors
                  ${formErrors.cliente_id ? 'border-red-500' : ''}`}
              >
                <option value="">Selecione um cliente</option>
                {clientes.map((cliente) => (
                  <option key={cliente.id} value={cliente.id}>
                    {cliente.nome} - {cliente.cpf_cnpj}
                  </option>
                ))}
              </select>
              {formErrors.cliente_id && (
                <span className="text-xs text-red-500">{formErrors.cliente_id}</span>
              )}
            </div>

            <div className="grid gap-2">
              <Label htmlFor="valor">Valor</Label>
              <Input
                id="valor"
                type="number"
                step="0.01"
                min="0"
                value={newTitulo.valor}
                onChange={(e) => setNewTitulo({ ...newTitulo, valor: parseFloat(e.target.value) || 0 })}
                className={formErrors.valor ? "border-red-500" : ""}
              />
              {formErrors.valor && (
                <span className="text-xs text-red-500">{formErrors.valor}</span>
              )}
            </div>

            <div className="grid gap-2">
              <Label htmlFor="vencimento">Data de Vencimento</Label>
              <Input
                id="vencimento"
                type="date"
                value={newTitulo.vencimento}
                onChange={(e) => setNewTitulo({ ...newTitulo, vencimento: e.target.value })}
                className={formErrors.vencimento ? "border-red-500" : ""}
              />
              {formErrors.vencimento && (
                <span className="text-xs text-red-500">{formErrors.vencimento}</span>
              )}
            </div>

            <div className="grid gap-2">
              <Label htmlFor="observacoes">Observações</Label>
              <Input
                id="observacoes"
                value={newTitulo.observacoes}
                onChange={(e) => setNewTitulo({ ...newTitulo, observacoes: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={handleCreateTitulo}>Criar Título</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isEditModalOpen} onOpenChange={setIsEditModalOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Editar Título</DialogTitle>
            <DialogDescription>
              Atualize os dados do título
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="edit-cliente">Cliente</Label>
              <select
                id="edit-cliente"
                value={editingTitulo.cliente_id}
                onChange={(e) => setEditingTitulo({ ...editingTitulo, cliente_id: e.target.value })}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
              >
                {clientes.map((cliente) => (
                  <option key={cliente.id} value={cliente.id}>
                    {cliente.nome} - {cliente.cpf_cnpj}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="edit-valor">Valor</Label>
              <Input
                id="edit-valor"
                type="number"
                step="0.01"
                min="0"
                value={editingTitulo.valor}
                onChange={(e) => setEditingTitulo({ ...editingTitulo, valor: parseFloat(e.target.value) || 0 })}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="edit-vencimento">Data de Vencimento</Label>
              <Input
                id="edit-vencimento"
                type="date"
                value={editingTitulo.vencimento}
                onChange={(e) => setEditingTitulo({ ...editingTitulo, vencimento: e.target.value })}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="edit-status">Status</Label>
              <select
                id="edit-status"
                value={editingTitulo.status}
                onChange={(e) => setEditingTitulo({ 
                  ...editingTitulo, 
                  status: e.target.value as 'em_aberto' | 'pago' | 'vencido' | 'acordo' 
                })}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
              >
                <option value="em_aberto">Em Aberto</option>
                <option value="pago">Pago</option>
                <option value="vencido">Vencido</option>
                <option value="acordo">Em Acordo</option>
              </select>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="edit-observacoes">Observações</Label>
              <Input
                id="edit-observacoes"
                value={editingTitulo.observacoes}
                onChange={(e) => setEditingTitulo({ ...editingTitulo, observacoes: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={handleEditTitulo}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isDetailsModalOpen} onOpenChange={setIsDetailsModalOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Detalhes do Título</DialogTitle>
          </DialogHeader>
          {selectedTitulo && (
            <div className="space-y-4">
              <div>
                <Label className="text-sm font-medium">Cliente</Label>
                <p className="text-sm">{selectedTitulo.cliente.nome}</p>
                <p className="text-xs text-muted-foreground">{selectedTitulo.cliente.cpf_cnpj}</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-sm font-medium">Valor</Label>
                  <p className="text-sm">{formatCurrency(selectedTitulo.valor)}</p>
                </div>
                <div>
                  <Label className="text-sm font-medium">Vencimento</Label>
                  <p className="text-sm">{formatDate(selectedTitulo.vencimento)}</p>
                </div>
              </div>

              <div>
                <Label className="text-sm font-medium">Status</Label>
                <Badge className={getStatusColor(selectedTitulo.status)}>
                  {selectedTitulo.status.replace('_', ' ')}
                </Badge>
              </div>

              {selectedTitulo.observacoes && (
                <div>
                  <Label className="text-sm font-medium">Observações</Label>
                  <p className="text-sm text-muted-foreground">{selectedTitulo.observacoes}</p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Remove o modal duplicado de delete - manter apenas um */}
      <Dialog open={isDeleteModalOpen} onOpenChange={setIsDeleteModalOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Confirmar Exclusão</DialogTitle>
            <DialogDescription>
              Você tem certeza que deseja excluir este título?
              {tituloToDelete && (
                <div className="mt-4 rounded-md border bg-muted p-3 text-sm">
                  <p><span className="font-semibold">Cliente:</span> {tituloToDelete.cliente.nome}</p>
                  <p><span className="font-semibold">Valor:</span> {formatCurrency(tituloToDelete.valor)}</p>
                  <p><span className="font-semibold">Vencimento:</span> {formatDate(tituloToDelete.vencimento)}</p>
                </div>
              )}
              Esta ação não pode ser desfeita.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setIsDeleteModalOpen(false);
              setTituloToDelete(null);
            }}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={handleDeleteTitulo}>
              Excluir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}