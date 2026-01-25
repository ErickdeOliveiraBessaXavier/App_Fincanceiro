import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Eye, Edit, Phone, Mail, MessageSquare, FileText, User, Trash2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { GlobalFilter } from '@/components/GlobalFilter';
import { useGlobalFilter } from '@/hooks/useGlobalFilter';
import { clientesFilterConfig } from '@/constants/filterConfigs';
import { clientesPresets } from '@/constants/filterPresets';
import { createClientesFilterFunctions } from '@/utils/filterFunctions';
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

interface FormErrors {
  nome?: string;
  cpf_cnpj?: string;
  telefone?: string;
  email?: string;
}

export default function Clientes() {
  const navigate = useNavigate();
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [selectedCliente, setSelectedCliente] = useState<Cliente | null>(null);
  const [comunicacoes, setComunicacoes] = useState<Comunicacao[]>([]);
  const [loading, setLoading] = useState(true);
  
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
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingCliente, setEditingCliente] = useState({
    id: '',
    nome: '',
    cpf_cnpj: '',
    telefone: '',
    email: '',
    endereco_completo: '',
    cep: '',
    cidade: '',
    estado: '',
    observacoes: '',
    status: ''
  });
  const [formErrors, setFormErrors] = useState<FormErrors>({});
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [clienteToDelete, setClienteToDelete] = useState<Cliente | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    fetchClientes();
  }, []);

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
            valor_original
          )
        `);


      const { data, error } = await query.order('created_at', { ascending: false });

      if (error) throw error;

      // Calcular dados agregados para cada cliente
      const clientesComDados = data?.map(cliente => ({
        ...cliente,
        total_titulos: cliente.titulos?.length || 0,
        total_valor: cliente.titulos?.reduce((sum: number, titulo: any) => sum + (titulo.valor_original || 0), 0) || 0
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

  // Verifica se já existe um cliente com o mesmo CPF/CNPJ
  const checkCpfCnpjExists = async (cpfCnpj: string, excludeId?: string): Promise<boolean> => {
    const cleaned = cpfCnpj.replace(/\D/g, '');
    
    let query = supabase
      .from('clientes')
      .select('id')
      .eq('cpf_cnpj', cleaned);
    
    // Se estiver editando, exclui o próprio cliente da verificação
    if (excludeId) {
      query = query.neq('id', excludeId);
    }
    
    const { data, error } = await query.maybeSingle();
    
    if (error) {
      console.error('Erro ao verificar CPF/CNPJ:', error);
      return false;
    }
    
    return data !== null;
  };

  const validateForm = () => {
    const errors: FormErrors = {};
    let isValid = true;

    if (!newCliente.nome.trim()) {
      errors.nome = 'Nome é obrigatório';
      isValid = false;
    }

    if (!newCliente.cpf_cnpj.trim()) {
      errors.cpf_cnpj = 'CPF/CNPJ é obrigatório';
      isValid = false;
    } else if (!/^\d{11}$|^\d{14}$/.test(newCliente.cpf_cnpj.replace(/\D/g, ''))) {
      errors.cpf_cnpj = 'CPF/CNPJ inválido';
      isValid = false;
    }

    if (newCliente.telefone && !/^\d{10,11}$/.test(newCliente.telefone.replace(/\D/g, ''))) {
      errors.telefone = 'Telefone inválido';
      isValid = false;
    }

    if (newCliente.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newCliente.email)) {
      errors.email = 'E-mail inválido';
      isValid = false;
    }

    setFormErrors(errors);
    return isValid;
  };

  const handleCreateCliente = async () => {
    if (!validateForm()) {
      toast({
        title: "Erro",
        description: "Por favor, preencha os campos obrigatórios corretamente.",
        variant: "destructive",
      });
      return;
    }

    // Verifica se CPF/CNPJ já existe
    const cpfCnpjExists = await checkCpfCnpjExists(newCliente.cpf_cnpj);
    if (cpfCnpjExists) {
      setFormErrors(prev => ({ 
        ...prev, 
        cpf_cnpj: 'Já existe um cliente cadastrado com este CPF/CNPJ' 
      }));
      toast({
        title: "CPF/CNPJ Duplicado",
        description: "Já existe um cliente cadastrado com este CPF/CNPJ.",
        variant: "destructive",
      });
      return;
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) throw new Error('Usuário não autenticado');

      const { data, error } = await supabase
        .from('clientes')
        .insert([
          { 
            ...newCliente,
            cpf_cnpj: newCliente.cpf_cnpj.replace(/\D/g, ''), // Salva apenas números
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

  const validateEditForm = () => {
    const errors: FormErrors = {};
    let isValid = true;

    if (!editingCliente.nome.trim()) {
      errors.nome = 'Nome é obrigatório';
      isValid = false;
    }

    if (!editingCliente.cpf_cnpj.trim()) {
      errors.cpf_cnpj = 'CPF/CNPJ é obrigatório';
      isValid = false;
    } else if (!/^\d{11}$|^\d{14}$/.test(editingCliente.cpf_cnpj.replace(/\D/g, ''))) {
      errors.cpf_cnpj = 'CPF/CNPJ inválido';
      isValid = false;
    }

    if (editingCliente.telefone && !/^\d{10,11}$/.test(editingCliente.telefone.replace(/\D/g, ''))) {
      errors.telefone = 'Telefone inválido';
      isValid = false;
    }

    if (editingCliente.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(editingCliente.email)) {
      errors.email = 'E-mail inválido';
      isValid = false;
    }

    setFormErrors(errors);
    return isValid;
  };

  const handleEditCliente = async () => {
    if (!validateEditForm()) {
      toast({
        title: "Erro",
        description: "Por favor, preencha os campos obrigatórios corretamente.",
        variant: "destructive",
      });
      return;
    }

    // Verifica se CPF/CNPJ já existe (excluindo o próprio cliente)
    const cpfCnpjExists = await checkCpfCnpjExists(editingCliente.cpf_cnpj, editingCliente.id);
    if (cpfCnpjExists) {
      setFormErrors(prev => ({ 
        ...prev, 
        cpf_cnpj: 'Já existe outro cliente cadastrado com este CPF/CNPJ' 
      }));
      toast({
        title: "CPF/CNPJ Duplicado",
        description: "Já existe outro cliente cadastrado com este CPF/CNPJ.",
        variant: "destructive",
      });
      return;
    }

    try {
      const { error } = await supabase
        .from('clientes')
        .update({
          nome: editingCliente.nome,
          cpf_cnpj: editingCliente.cpf_cnpj.replace(/\D/g, ''), // Salva apenas números
          telefone: editingCliente.telefone,
          email: editingCliente.email,
          endereco_completo: editingCliente.endereco_completo,
          cep: editingCliente.cep,
          cidade: editingCliente.cidade,
          estado: editingCliente.estado,
          observacoes: editingCliente.observacoes,
          status: editingCliente.status
        })
        .eq('id', editingCliente.id);

      if (error) throw error;

      toast({
        title: "Sucesso",
        description: "Cliente atualizado com sucesso.",
      });
      setIsEditModalOpen(false);
      fetchClientes();
    } catch (error) {
      console.error('Erro ao atualizar cliente:', error);
      toast({
        title: "Erro",
        description: "Não foi possível atualizar o cliente.",
        variant: "destructive",
      });
    }
  };

  const handleDeleteCliente = async () => {
    if (!clienteToDelete) return;

    try {
      const { error } = await supabase
        .from('clientes')
        .delete()  // Changed from update to delete
        .eq('id', clienteToDelete.id);

      if (error) throw error;

      // Update local state to remove the client from view
      setClientes(prevClientes => 
        prevClientes.filter(c => c.id !== clienteToDelete.id)
      );

      toast({
        title: "Sucesso",
        description: "Cliente excluído com sucesso.",
      });
      
      // Limpa os estados relacionados
      setIsDeleteModalOpen(false);
      setClienteToDelete(null);
      
      // Se o cliente excluído for o selecionado, limpa a seleção
      if (selectedCliente?.id === clienteToDelete.id) {
        setSelectedCliente(null);
        setIsDetailsModalOpen(false);
      }
      
      // Se o cliente excluído estiver sendo editado, fecha o modal de edição
      if (editingCliente.id === clienteToDelete.id) {
        setIsEditModalOpen(false);
      }

    } catch (error) {
      console.error('Erro ao excluir cliente:', error);
      toast({
        title: "Erro",
        description: "Não foi possível excluir o cliente.",
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

  // Filter functions for clientes
  const filterFunctions = useMemo(() => createClientesFilterFunctions(), []);

  const {
    filteredData: filteredClientes,
    filters,
    setFilter,
    setFilters,
    clearFilter,
    clearAllFilters,
    hasActiveFilters,
    activeFiltersCount,
    resultCount,
    totalCount
  } = useGlobalFilter(clientes, filterFunctions);

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
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold">Clientes</h1>
          <p className="text-muted-foreground text-sm sm:text-base">Gerencie os clientes e seu histórico</p>
        </div>
        <Button onClick={() => setIsCreateModalOpen(true)} className="self-start sm:self-auto">
          <Plus className="h-4 w-4 mr-2" />
          <span className="hidden sm:inline">Novo Cliente</span>
          <span className="sm:hidden">Novo</span>
        </Button>
      </div>

      <Dialog open={isCreateModalOpen} onOpenChange={setIsCreateModalOpen}>
        <DialogContent className="sm:max-w-[75vw] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Novo Cliente</DialogTitle>
            <DialogDescription>
              Preencha os dados do novo cliente.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-1 gap-2">
              <Label htmlFor="name" className="flex items-center gap-1">
                Nome
                <span className="text-red-500">*</span>
              </Label>
              <Input 
                id="name" 
                value={newCliente.nome} 
                onChange={(e) => setNewCliente({ ...newCliente, nome: e.target.value })}
                className={formErrors.nome ? "border-red-500" : ""}
              />
              {formErrors.nome && (
                <span className="text-xs text-red-500">{formErrors.nome}</span>
              )}
            </div>
            
            <div className="grid grid-cols-1 gap-2">
              <Label htmlFor="cpf_cnpj" className="flex items-center gap-1">
                CPF/CNPJ
                <span className="text-red-500">*</span>
              </Label>
              <Input 
                id="cpf_cnpj" 
                value={newCliente.cpf_cnpj} 
                onChange={(e) => setNewCliente({ ...newCliente, cpf_cnpj: e.target.value })}
                className={formErrors.cpf_cnpj ? "border-red-500" : ""}
              />
              {formErrors.cpf_cnpj && (
                <span className="text-xs text-red-500">{formErrors.cpf_cnpj}</span>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="grid grid-cols-1 gap-2">
                <Label htmlFor="telefone">Telefone</Label>
                <Input 
                  id="telefone" 
                  value={newCliente.telefone} 
                  onChange={(e) => setNewCliente({ ...newCliente, telefone: e.target.value })}
                  className={formErrors.telefone ? "border-red-500" : ""}
                />
                {formErrors.telefone && (
                  <span className="text-xs text-red-500">{formErrors.telefone}</span>
                )}
              </div>
              <div className="grid grid-cols-1 gap-2">
                <Label htmlFor="email">Email</Label>
                <Input 
                  id="email" 
                  type="email" 
                  value={newCliente.email} 
                  onChange={(e) => setNewCliente({ ...newCliente, email: e.target.value })}
                  className={formErrors.email ? "border-red-500" : ""}
                />
                {formErrors.email && (
                  <span className="text-xs text-red-500">{formErrors.email}</span>
                )}
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="grid grid-cols-1 gap-2">
                <Label htmlFor="cep">CEP</Label>
                <Input id="cep" value={newCliente.cep} onChange={(e) => setNewCliente({ ...newCliente, cep: e.target.value })} />
              </div>
              <div className="grid grid-cols-1 gap-2">
                <Label htmlFor="cidade">Cidade</Label>
                <Input id="cidade" value={newCliente.cidade} onChange={(e) => setNewCliente({ ...newCliente, cidade: e.target.value })} />
              </div>
              <div className="grid grid-cols-1 gap-2">
                <Label htmlFor="estado">Estado</Label>
                <Input id="estado" value={newCliente.estado} onChange={(e) => setNewCliente({ ...newCliente, estado: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-2">
              <Label htmlFor="endereco">Endereço</Label>
              <Input id="endereco" value={newCliente.endereco_completo} onChange={(e) => setNewCliente({ ...newCliente, endereco_completo: e.target.value })} />
            </div>
            <div className="grid grid-cols-1 gap-2">
              <Label htmlFor="observacoes">Observações</Label>
              <Input id="observacoes" value={newCliente.observacoes} onChange={(e) => setNewCliente({ ...newCliente, observacoes: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={handleCreateCliente}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isDetailsModalOpen} onOpenChange={setIsDetailsModalOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          {selectedCliente && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <User className="h-5 w-5" />
                  {selectedCliente.nome}
                </DialogTitle>
                <DialogDescription>
                  Detalhes e histórico do cliente
                </DialogDescription>
              </DialogHeader>

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
                    
                    <div className="flex justify-between items-center pt-4 border-t">
                      <div>
                        <label className="text-sm font-medium">Total de Títulos</label>
                        <p className="text-2xl font-bold text-primary">{selectedCliente.total_titulos}</p>
                      </div>
                      <div>
                        <label className="text-sm font-medium">Valor Total</label>
                        <p className="text-2xl font-bold text-primary">{formatCurrency(selectedCliente.total_valor || 0)}</p>
                      </div>
                    </div>

                    <div className="flex gap-2 pt-4">
                      <Button className="flex-1">
                        <Phone className="h-4 w-4 mr-2" />
                        Ligar
                      </Button>
                      <Button variant="outline" className="flex-1">
                        <Mail className="h-4 w-4 mr-2" />
                        Email
                      </Button>
                      <Button variant="outline" className="flex-1">
                        <MessageSquare className="h-4 w-4 mr-2" />
                        WhatsApp
                      </Button>
                    </div>
                  </div>
                </TabsContent>
                
                <TabsContent value="historico" className="space-y-4">
                  <div className="space-y-3">
                    {comunicacoes.length > 0 ? (
                      comunicacoes.map((comunicacao) => (
                        <div key={comunicacao.id} className="border rounded-lg p-3">
                          <div className="flex items-center gap-2 mb-2">
                            {getTipoIcon(comunicacao.tipo)}
                            <span className="text-sm font-medium capitalize">{comunicacao.tipo}</span>
                            <span className="text-xs text-muted-foreground ml-auto">
                              {formatDateTime(comunicacao.created_at)}
                            </span>
                          </div>
                          <h4 className="text-sm font-medium mb-1">{comunicacao.assunto}</h4>
                          {comunicacao.mensagem && (
                            <p className="text-xs text-muted-foreground mb-2">{comunicacao.mensagem}</p>
                          )}
                          {comunicacao.resultado && (
                            <div className="text-xs">
                              <span className="font-medium">Resultado: </span>
                              <span className="text-muted-foreground">{comunicacao.resultado}</span>
                            </div>
                          )}
                        </div>
                      ))
                    ) : (
                      <p className="text-sm text-muted-foreground text-center py-4">
                        Nenhuma comunicação registrada
                      </p>
                    )}
                  </div>
                </TabsContent>
              </Tabs>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={isEditModalOpen} onOpenChange={setIsEditModalOpen}>
        <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar Cliente</DialogTitle>
            <DialogDescription>
              Atualize os dados do cliente.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-1 gap-2">
              <Label htmlFor="edit-name" className="flex items-center gap-1">
                Nome<span className="text-red-500">*</span>
              </Label>
              <Input
                id="edit-name"
                value={editingCliente.nome}
                onChange={(e) => setEditingCliente({ ...editingCliente, nome: e.target.value })}
                className={formErrors.nome ? "border-red-500" : ""}
              />
              {formErrors.nome && (
                <span className="text-xs text-red-500">{formErrors.nome}</span>
              )}
            </div>

            <div className="grid grid-cols-1 gap-2">
              <Label htmlFor="edit-cpf-cnpj" className="flex items-center gap-1">
                CPF/CNPJ<span className="text-red-500">*</span>
              </Label>
              <Input
                id="edit-cpf-cnpj"
                value={editingCliente.cpf_cnpj}
                onChange={(e) => setEditingCliente({ ...editingCliente, cpf_cnpj: e.target.value })}
                className={formErrors.cpf_cnpj ? "border-red-500" : ""}
              />
              {formErrors.cpf_cnpj && (
                <span className="text-xs text-red-500">{formErrors.cpf_cnpj}</span>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="grid grid-cols-1 gap-2">
                <Label htmlFor="edit-telefone">Telefone</Label>
                <Input
                  id="edit-telefone"
                  value={editingCliente.telefone}
                  onChange={(e) => setEditingCliente({ ...editingCliente, telefone: e.target.value })}
                  className={formErrors.telefone ? "border-red-500" : ""}
                />
                {formErrors.telefone && (
                  <span className="text-xs text-red-500">{formErrors.telefone}</span>
                )}
              </div>
              <div className="grid grid-cols-1 gap-2">
                <Label htmlFor="edit-email">Email</Label>
                <Input
                  id="edit-email"
                  type="email"
                  value={editingCliente.email}
                  onChange={(e) => setEditingCliente({ ...editingCliente, email: e.target.value })}
                  className={formErrors.email ? "border-red-500" : ""}
                />
                {formErrors.email && (
                  <span className="text-xs text-red-500">{formErrors.email}</span>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="grid grid-cols-1 gap-2">
                <Label htmlFor="edit-cep">CEP</Label>
                <Input
                  id="edit-cep"
                  value={editingCliente.cep}
                  onChange={(e) => setEditingCliente({ ...editingCliente, cep: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-1 gap-2">
                <Label htmlFor="edit-cidade">Cidade</Label>
                <Input
                  id="edit-cidade"
                  value={editingCliente.cidade}
                  onChange={(e) => setEditingCliente({ ...editingCliente, cidade: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-1 gap-2">
                <Label htmlFor="edit-estado">Estado</Label>
                <Input
                  id="edit-estado"
                  value={editingCliente.estado}
                  onChange={(e) => setEditingCliente({ ...editingCliente, estado: e.target.value })}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-2">
              <Label htmlFor="edit-endereco">Endereço</Label>
              <Input
                id="edit-endereco"
                value={editingCliente.endereco_completo}
                onChange={(e) => setEditingCliente({ ...editingCliente, endereco_completo: e.target.value })}
              />
            </div>

            <div className="grid grid-cols-1 gap-2">
              <Label htmlFor="edit-observacoes">Observações</Label>
              <Input
                id="edit-observacoes"
                value={editingCliente.observacoes}
                onChange={(e) => setEditingCliente({ ...editingCliente, observacoes: e.target.value })}
              />
            </div>

            <div className="grid grid-cols-1 gap-2">
              <Label htmlFor="edit-status">Status</Label>
              <select
                id="edit-status"
                value={editingCliente.status}
                onChange={(e) => setEditingCliente({ ...editingCliente, status: e.target.value })}
                className="px-3 py-2 border border-input rounded-md bg-background"
              >
                <option value="ativo">Ativo</option>
                <option value="inadimplente">Inadimplente</option>
                <option value="em_acordo">Em Acordo</option>
                <option value="quitado">Quitado</option>
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={handleEditCliente}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isDeleteModalOpen} onOpenChange={setIsDeleteModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar Exclusão</DialogTitle>
            <DialogDescription>
              Tem certeza que deseja excluir o cliente {clienteToDelete?.nome}? 
              Esta ação não pode ser desfeita.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button
              variant="ghost"
              onClick={() => setIsDeleteModalOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteCliente}
            >
              Excluir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 md:grid-cols-5">
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

      <div className="space-y-6">
        {/* Mobile Layout */}
        <div className="block lg:hidden">
          <Card>
            <CardHeader>
              <CardTitle>Lista de Clientes</CardTitle>
              <CardDescription>
                {filteredClientes.length} clientes encontrados
              </CardDescription>
            </CardHeader>
            <CardContent>
              <GlobalFilter
                configs={clientesFilterConfig}
                filters={filters}
                onFilterChange={setFilter}
                onClearFilter={clearFilter}
                onClearAll={clearAllFilters}
                hasActiveFilters={hasActiveFilters}
                activeFiltersCount={activeFiltersCount}
                resultCount={resultCount}
                totalCount={totalCount}
                presets={clientesPresets}
                onPresetSelect={(preset) => setFilters(preset.filters)}
                collapsible={true}
                defaultOpen={false}
              />

              {/* Mobile Card View */}
              <div className="space-y-4">
                {filteredClientes.map((cliente) => (
                  <Card 
                    key={cliente.id} 
                    className="p-4 cursor-pointer border-2 transition-colors border-border hover:border-primary/50"
                  >
                    <div className="flex justify-between items-start mb-3">
                      <div className="flex-1">
                        <h3 className="font-medium text-base">{cliente.nome}</h3>
                        <p className="text-sm text-muted-foreground">{cliente.cpf_cnpj}</p>
                      </div>
                      <Badge className={getStatusColor(cliente.status)} variant="secondary">
                        {cliente.status.replace('_', ' ')}
                      </Badge>
                    </div>
                    
                    <div className="space-y-2 mb-3">
                      {cliente.telefone && (
                        <div className="flex items-center gap-2 text-sm">
                          <Phone className="h-3 w-3 text-muted-foreground" />
                          <span>{cliente.telefone}</span>
                        </div>
                      )}
                      {cliente.email && (
                        <div className="flex items-center gap-2 text-sm">
                          <Mail className="h-3 w-3 text-muted-foreground" />
                          <span className="truncate">{cliente.email}</span>
                        </div>
                      )}
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4 text-sm pt-3 border-t">
                      <div>
                        <span className="text-muted-foreground">Títulos: </span>
                        <span className="font-medium">{cliente.total_titulos}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Total: </span>
                        <span className="font-medium">{formatCurrency(cliente.total_valor || 0)}</span>
                      </div>
                    </div>
                    
                    <div className="flex gap-2 justify-end mt-3 pt-3 border-t">
                      <Button 
                        variant="default" 
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/telecobranca/${cliente.id}`);
                        }}
                      >
                        <Phone className="h-3 w-3 mr-1" />
                        Telecobrança
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedCliente(cliente);
                          setIsDetailsModalOpen(true);
                        }}
                      >
                        <Eye className="h-3 w-3" />
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingCliente({
                            id: cliente.id,
                            nome: cliente.nome,
                            cpf_cnpj: cliente.cpf_cnpj,
                            telefone: cliente.telefone || '',
                            email: cliente.email || '',
                            endereco_completo: cliente.endereco_completo || '',
                            cep: cliente.cep || '',
                            cidade: cliente.cidade || '',
                            estado: cliente.estado || '',
                            observacoes: cliente.observacoes || '',
                            status: cliente.status
                          });
                          setIsEditModalOpen(true);
                        }}
                      >
                        <Edit className="h-3 w-3" />
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          setClienteToDelete(cliente);
                          setIsDeleteModalOpen(true);
                        }}
                      >
                        <Trash2 className="h-3 w-3 text-destructive" />
                      </Button>
                    </div>
                  </Card>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Desktop Layout */}
        <div className="hidden lg:block">
          <Card>
            <CardHeader>
              <CardTitle>Lista de Clientes</CardTitle>
              <CardDescription>
                {filteredClientes.length} clientes encontrados
              </CardDescription>
            </CardHeader>
            <CardContent>
              <GlobalFilter
                configs={clientesFilterConfig}
                filters={filters}
                onFilterChange={setFilter}
                onClearFilter={clearFilter}
                onClearAll={clearAllFilters}
                hasActiveFilters={hasActiveFilters}
                activeFiltersCount={activeFiltersCount}
                resultCount={resultCount}
                totalCount={totalCount}
                presets={clientesPresets}
                onPresetSelect={(preset) => setFilters(preset.filters)}
                collapsible={true}
                defaultOpen={false}
              />

              <div className="rounded-md border overflow-x-auto">
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
                      <TableRow key={cliente.id}>
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
                              variant="default" 
                              size="sm"
                              onClick={() => navigate(`/telecobranca/${cliente.id}`)}
                            >
                              <Phone className="h-4 w-4 mr-1" />
                              Telecobrança
                            </Button>
                            <Button 
                              variant="ghost" 
                              size="sm"
                              onClick={() => {
                                setSelectedCliente(cliente);
                                setIsDetailsModalOpen(true);
                              }}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button 
                              variant="ghost" 
                              size="sm"
                              onClick={() => {
                                setEditingCliente({
                                  id: cliente.id,
                                  nome: cliente.nome,
                                  cpf_cnpj: cliente.cpf_cnpj,
                                  telefone: cliente.telefone || '',
                                  email: cliente.email || '',
                                  endereco_completo: cliente.endereco_completo || '',
                                  cep: cliente.cep || '',
                                  cidade: cliente.cidade || '',
                                  estado: cliente.estado || '',
                                  observacoes: cliente.observacoes || '',
                                  status: cliente.status
                                });
                                setIsEditModalOpen(true);
                              }}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button 
                              variant="ghost" 
                              size="sm"
                              onClick={() => {
                                setClienteToDelete(cliente);
                                setIsDeleteModalOpen(true);
                              }}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
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
      </div>
    </div>
  );
}