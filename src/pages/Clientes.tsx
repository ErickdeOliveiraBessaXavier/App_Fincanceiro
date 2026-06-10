import { useState, useMemo } from 'react';
import { PageHeader } from '@/components/PageHeader';
import { useNavigate } from 'react-router-dom';
import { Plus, Eye, Edit, Phone, Mail, MessageSquare, FileText, User, Trash2, MoreHorizontal, CheckCircle, AlertTriangle } from 'lucide-react';
import {
  useClientes,
  useComunicacoes,
  useCreateCliente,
  useUpdateCliente,
  useDeleteCliente,
  checkCpfCnpjExists,
  type ClienteRow,
} from '@/lib/queries/clientes';
import { useCobradores } from '@/lib/queries/cobradores';
import { useVendedores } from '@/lib/queries/vendedores';
import { useUserRole } from '@/hooks/useUserRole';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { GlobalFilter } from '@/components/GlobalFilter';
import { StatusBadge } from '@/components/StatusBadge';
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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

interface FormErrors {
  nome?: string;
  cpf_cnpj?: string;
  telefone?: string;
  email?: string;
}

export default function Clientes() {
  const navigate = useNavigate();
  const { toast } = useToast();

  // === Data via React Query ===
  const { data: clientes = [], isLoading: loading } = useClientes();
  const { data: cobradores = [] } = useCobradores();
  const { data: vendedores = [] } = useVendedores();
  const { isOperador } = useUserRole();
  const createClienteMutation = useCreateCliente();
  const updateClienteMutation = useUpdateCliente();
  const deleteClienteMutation = useDeleteCliente();

  const [selectedCliente, setSelectedCliente] = useState<ClienteRow | null>(null);
  const { data: comunicacoes = [] } = useComunicacoes(selectedCliente?.id ?? null);

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
    observacoes: '',
    cobrador_id: '',
    vendedor_id: '',
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
    status: '',
    cobrador_id: '',
    vendedor_id: '',
  });
  const [formErrors, setFormErrors] = useState<FormErrors>({});
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [clienteToDelete, setClienteToDelete] = useState<ClienteRow | null>(null);

  const validateForm = () => {
    const errors: FormErrors = {};
    let isValid = true;
    if (!newCliente.nome.trim()) { errors.nome = 'Nome é obrigatório'; isValid = false; }
    if (!newCliente.cpf_cnpj.trim()) { errors.cpf_cnpj = 'CPF/CNPJ é obrigatório'; isValid = false; }
    setFormErrors(errors);
    return isValid;
  };

  const handleCreateCliente = async () => {
    if (!validateForm()) return;
    try {
      await createClienteMutation.mutateAsync({
        ...newCliente,
        cobrador_id: newCliente.cobrador_id || null,
        vendedor_id: newCliente.vendedor_id || null,
      });
      toast({ title: "Sucesso", description: "Cliente criado com sucesso." });
      setIsCreateModalOpen(false);
      setNewCliente({ nome: '', cpf_cnpj: '', telefone: '', email: '', endereco_completo: '', cep: '', cidade: '', estado: '', observacoes: '', cobrador_id: '', vendedor_id: '' });
    } catch (error) {
      toast({ title: "Erro", description: "Não foi possível criar o cliente.", variant: "destructive" });
    }
  };

  const validateEditForm = () => {
    const errors: FormErrors = {};
    let isValid = true;
    if (!editingCliente.nome.trim()) { errors.nome = 'Nome é obrigatório'; isValid = false; }
    setFormErrors(errors);
    return isValid;
  };

  const handleEditCliente = async () => {
    if (!validateEditForm()) return;
    try {
      await updateClienteMutation.mutateAsync({
        id: editingCliente.id,
        nome: editingCliente.nome,
        cpf_cnpj: editingCliente.cpf_cnpj,
        telefone: editingCliente.telefone,
        email: editingCliente.email,
        endereco_completo: editingCliente.endereco_completo,
        cep: editingCliente.cep,
        cidade: editingCliente.cidade,
        estado: editingCliente.estado,
        observacoes: editingCliente.observacoes,
        cobrador_id: editingCliente.cobrador_id || null,
        vendedor_id: editingCliente.vendedor_id || null,
      });
      toast({ title: "Sucesso", description: "Cliente atualizado com sucesso." });
      setIsEditModalOpen(false);
    } catch (error) {
      toast({ title: "Erro", description: "Não foi possível atualizar o cliente.", variant: "destructive" });
    }
  };

  const handleDeleteCliente = async () => {
    if (!clienteToDelete) return;
    try {
      await deleteClienteMutation.mutateAsync(clienteToDelete.id);
      toast({ title: "Sucesso", description: "Cliente excluído com sucesso." });
      setIsDeleteModalOpen(false);
      setClienteToDelete(null);
    } catch (error) {
      toast({ title: "Erro", description: "Não foi possível excluir o cliente.", variant: "destructive" });
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
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(value);
  };

  const formatDateTime = (date: string) => new Date(date).toLocaleString('pt-BR');

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
    <div className="space-y-10 animate-fade-in pb-10">
      <PageHeader
        title="Clientes"
        description="Gestão da base de clientes e histórico de contatos."
      >
        {isOperador && (
          <Button 
            onClick={() => setIsCreateModalOpen(true)} 
          >
            <Plus className="h-4 w-4 mr-2" />
            Novo Cliente
          </Button>
        )}
      </PageHeader>

      <div className="grid gap-6 grid-cols-2 sm:grid-cols-3 md:grid-cols-5">
        <Card className="border-none shadow-card rounded-2xl overflow-hidden group">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Total</CardTitle>
            <User className="h-4 w-4 text-muted-foreground group-hover:scale-110 transition-transform" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-black tracking-tighter">{statusCounts.total}</div>
          </CardContent>
        </Card>
        <Card className="border-none shadow-card rounded-2xl overflow-hidden group">
          <div className="absolute inset-0 bg-gradient-to-br from-success/5 to-transparent pointer-events-none" />
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 relative z-10">
            <CardTitle className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Ativos</CardTitle>
            <div className="h-6 w-6 rounded-lg bg-success/10 flex items-center justify-center text-success group-hover:scale-110 transition-transform">
              <CheckCircle className="h-3 w-3" />
            </div>
          </CardHeader>
          <CardContent className="relative z-10">
            <div className="text-2xl font-black tracking-tighter text-success">{statusCounts.ativo}</div>
          </CardContent>
        </Card>
        <Card className="border-none shadow-card rounded-2xl overflow-hidden group">
          <div className="absolute inset-0 bg-gradient-to-br from-destructive/5 to-transparent pointer-events-none" />
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 relative z-10">
            <CardTitle className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Inadimplentes</CardTitle>
            <div className="h-6 w-6 rounded-lg bg-destructive/10 flex items-center justify-center text-destructive group-hover:scale-110 transition-transform">
              <AlertTriangle className="h-3 w-3" />
            </div>
          </CardHeader>
          <CardContent className="relative z-10">
            <div className="text-2xl font-black tracking-tighter text-destructive">{statusCounts.inadimplente}</div>
          </CardContent>
        </Card>
        <Card className="border-none shadow-card rounded-2xl overflow-hidden group">
          <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-transparent pointer-events-none" />
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 relative z-10">
            <CardTitle className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Em Acordo</CardTitle>
            <div className="h-6 w-6 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-600 group-hover:scale-110 transition-transform">
              <FileText className="h-3 w-3" />
            </div>
          </CardHeader>
          <CardContent className="relative z-10">
            <div className="text-2xl font-black tracking-tighter text-blue-600">{statusCounts.em_acordo}</div>
          </CardContent>
        </Card>
        <Card className="border-none shadow-card rounded-2xl overflow-hidden group">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Quitados</CardTitle>
            <CheckCircle className="h-4 w-4 text-gray-400 group-hover:scale-110 transition-transform" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-black tracking-tighter text-gray-500">{statusCounts.quitado}</div>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-10">
        <Card className="border-none shadow-card rounded-2xl overflow-hidden">
          <CardHeader className="pb-4 border-b border-border/50 bg-muted/20">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-xl font-bold tracking-tight">Lista de Clientes</CardTitle>
                <CardDescription className="text-xs font-medium">
                  {filteredClientes.length} clientes encontrados na base
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-6">
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
            <div className="lg:hidden space-y-4">
              {filteredClientes.map((cliente) => (
                <div key={cliente.id} className="p-5 rounded-2xl border border-border/50 bg-card hover:border-primary/30 transition-all shadow-sm group">
                  <div className="flex justify-between items-start mb-4">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-bold text-lg text-foreground truncate group-hover:text-primary transition-colors">{cliente.nome}</h3>
                      <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">{cliente.cpf_cnpj}</p>
                    </div>
                    <StatusBadge domain="cliente" status={cliente.status} />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                    {cliente.telefone && (
                      <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                        <div className="h-7 w-7 rounded-lg bg-muted flex items-center justify-center"><Phone className="h-3.5 w-3.5" /></div>
                        <span>{cliente.telefone}</span>
                      </div>
                    )}
                    {cliente.email && (
                      <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                        <div className="h-7 w-7 rounded-lg bg-muted flex items-center justify-center"><Mail className="h-3.5 w-3.5" /></div>
                        <span className="truncate">{cliente.email}</span>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center justify-between pt-4 border-t border-dashed border-border/50">
                    <div className="flex gap-4">
                      <div>
                        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Títulos</p>
                        <p className="text-sm font-black">{cliente.total_titulos}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Total</p>
                        <p className="text-sm font-black text-primary">{formatCurrency(cliente.total_valor || 0)}</p>
                      </div>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-10 w-10 rounded-xl hover:bg-primary/5"><MoreHorizontal className="h-5 w-5" /></Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="rounded-xl shadow-card border-border/40">
                        <DropdownMenuLabel className="text-xs font-bold uppercase tracking-widest text-muted-foreground px-3 py-2">Ações</DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem className="rounded-lg m-1 font-medium" onClick={() => navigate(`/telecobranca/${cliente.id}`)}><Phone className="h-4 w-4 mr-2" />Telecobrança</DropdownMenuItem>
                        <DropdownMenuItem className="rounded-lg m-1 font-medium" onClick={() => { setSelectedCliente(cliente); setIsDetailsModalOpen(true); }}><Eye className="h-4 w-4 mr-2" />Ver Detalhes</DropdownMenuItem>
                        {isOperador && (
                          <>
                            <DropdownMenuItem className="rounded-lg m-1 font-medium" onClick={() => { setEditingCliente({ id: cliente.id, nome: cliente.nome, cpf_cnpj: cliente.cpf_cnpj, telefone: cliente.telefone || '', email: cliente.email || '', endereco_completo: cliente.endereco_completo || '', cep: cliente.cep || '', cidade: cliente.cidade || '', estado: cliente.estado || '', observacoes: cliente.observacoes || '', status: cliente.status, cobrador_id: cliente.cobrador_id || '', vendedor_id: cliente.vendedor_id || '' }); setIsEditModalOpen(true); }}><Edit className="h-4 w-4 mr-2" />Editar</DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem className="rounded-lg m-1 font-medium text-destructive focus:text-destructive" onClick={() => { setClienteToDelete(cliente); setIsDeleteModalOpen(true); }}><Trash2 className="h-4 w-4 mr-2" />Excluir</DropdownMenuItem>
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop Table View */}
            <div className="hidden lg:block rounded-xl border border-border/50 overflow-hidden">
              <Table>
                <TableHeader className="bg-muted/30">
                  <TableRow>
                    <TableHead className="text-[10px] font-bold uppercase tracking-widest">Cliente</TableHead>
                    <TableHead className="text-[10px] font-bold uppercase tracking-widest">CPF/CNPJ</TableHead>
                    <TableHead className="text-[10px] font-bold uppercase tracking-widest">Contato</TableHead>
                    <TableHead className="text-[10px] font-bold uppercase tracking-widest">Cobrador</TableHead>
                    <TableHead className="text-[10px] font-bold uppercase tracking-widest">Vendedor</TableHead>
                    <TableHead className="text-[10px] font-bold uppercase tracking-widest">Status</TableHead>
                    <TableHead className="text-[10px] font-bold uppercase tracking-widest">Títulos</TableHead>
                    <TableHead className="text-[10px] font-bold uppercase tracking-widest">Valor Total</TableHead>
                    <TableHead className="text-[10px] font-bold uppercase tracking-widest">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredClientes.map((cliente) => (
                    <TableRow key={cliente.id} className="hover:bg-muted/10 transition-colors">
                      <TableCell className="font-bold text-sm text-foreground">{cliente.nome}</TableCell>
                      <TableCell className="font-medium text-xs text-muted-foreground">{cliente.cpf_cnpj}</TableCell>
                      <TableCell>
                        <div className="text-xs space-y-1">
                          {cliente.telefone && <div className="font-bold text-foreground">{cliente.telefone}</div>}
                          {cliente.email && <div className="text-muted-foreground font-medium">{cliente.email}</div>}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs font-medium">{cliente.cobrador_nome ?? '—'}</TableCell>
                      <TableCell className="text-xs font-medium">{cliente.vendedor_nome ?? '—'}</TableCell>
                      <TableCell><StatusBadge domain="cliente" status={cliente.status} /></TableCell>
                      <TableCell className="font-bold text-sm">{cliente.total_titulos}</TableCell>
                      <TableCell className="font-black text-sm text-primary">{formatCurrency(cliente.total_valor || 0)}</TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild><Button variant="ghost" size="sm" className="h-8 w-8 p-0 rounded-lg hover:bg-primary/5"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="rounded-xl shadow-card border-border/40">
                            <DropdownMenuItem className="rounded-lg m-1 font-medium" onClick={() => navigate(`/telecobranca/${cliente.id}`)}><Phone className="h-4 w-4 mr-2" />Telecobrança</DropdownMenuItem>
                            <DropdownMenuItem className="rounded-lg m-1 font-medium" onClick={() => { setSelectedCliente(cliente); setIsDetailsModalOpen(true); }}><Eye className="h-4 w-4 mr-2" />Ver Detalhes</DropdownMenuItem>
                            {isOperador && (
                            <>
                            <DropdownMenuItem className="rounded-lg m-1 font-medium" onClick={() => { setEditingCliente({ id: cliente.id, nome: cliente.nome, cpf_cnpj: cliente.cpf_cnpj, telefone: cliente.telefone || '', email: cliente.email || '', endereco_completo: cliente.endereco_completo || '', cep: cliente.cep || '', cidade: cliente.cidade || '', estado: cliente.estado || '', observacoes: cliente.observacoes || '', status: cliente.status, cobrador_id: cliente.cobrador_id || '', vendedor_id: cliente.vendedor_id || '' }); setIsEditModalOpen(true); }}><Edit className="h-4 w-4 mr-2" />Editar</DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem className="rounded-lg m-1 font-medium text-destructive focus:text-destructive" onClick={() => { setClienteToDelete(cliente); setIsDeleteModalOpen(true); }}><Trash2 className="h-4 w-4 mr-2" />Excluir</DropdownMenuItem>
                            </>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Modais */}
      <Dialog open={isCreateModalOpen} onOpenChange={setIsCreateModalOpen}>
        <DialogContent className="sm:max-w-[75vw] max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Novo Cliente</DialogTitle><DialogDescription>Preencha os dados do novo cliente.</DialogDescription></DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-1 gap-2"><Label htmlFor="name">Nome*</Label><Input id="name" value={newCliente.nome} onChange={(e) => setNewCliente({ ...newCliente, nome: e.target.value })} className={formErrors.nome ? "border-red-500" : ""} /></div>
            <div className="grid grid-cols-1 gap-2"><Label htmlFor="cpf_cnpj">CPF/CNPJ*</Label><Input id="cpf_cnpj" value={newCliente.cpf_cnpj} onChange={(e) => setNewCliente({ ...newCliente, cpf_cnpj: e.target.value })} className={formErrors.cpf_cnpj ? "border-red-500" : ""} /></div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="grid grid-cols-1 gap-2"><Label htmlFor="telefone">Telefone</Label><Input id="telefone" value={newCliente.telefone} onChange={(e) => setNewCliente({ ...newCliente, telefone: e.target.value })} /></div>
              <div className="grid grid-cols-1 gap-2"><Label htmlFor="email">Email</Label><Input id="email" type="email" value={newCliente.email} onChange={(e) => setNewCliente({ ...newCliente, email: e.target.value })} /></div>
            </div>
            <div className="grid grid-cols-1 gap-2"><Label htmlFor="endereco">Endereço</Label><Input id="endereco" value={newCliente.endereco_completo} onChange={(e) => setNewCliente({ ...newCliente, endereco_completo: e.target.value })} /></div>
          </div>
          <DialogFooter><Button onClick={handleCreateCliente}>Salvar</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isEditModalOpen} onOpenChange={setIsEditModalOpen}>
        <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Editar Cliente</DialogTitle><DialogDescription>Atualize os dados do cliente.</DialogDescription></DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-1 gap-2"><Label htmlFor="edit-name">Nome*</Label><Input id="edit-name" value={editingCliente.nome} onChange={(e) => setEditingCliente({ ...editingCliente, nome: e.target.value })} /></div>
          </div>
          <DialogFooter><Button onClick={handleEditCliente}>Salvar</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isDetailsModalOpen} onOpenChange={setIsDetailsModalOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          {selectedCliente && (
            <>
              <DialogHeader><DialogTitle className="flex items-center gap-2"><User className="h-5 w-5" />{selectedCliente.nome}</DialogTitle><DialogDescription>Detalhes e histórico do cliente.</DialogDescription></DialogHeader>
              <Tabs defaultValue="detalhes" className="w-full">
                <TabsList className="grid w-full grid-cols-2"><TabsTrigger value="detalhes">Detalhes</TabsTrigger><TabsTrigger value="historico">Histórico</TabsTrigger></TabsList>
                <TabsContent value="detalhes" className="space-y-4">
                  <div className="space-y-3">
                    <div><label className="text-sm font-medium">CPF/CNPJ</label><p className="text-sm text-muted-foreground">{selectedCliente.cpf_cnpj}</p></div>
                    <div className="flex justify-between items-center pt-4 border-t">
                      <div><label className="text-sm font-medium">Total de Títulos</label><p className="text-2xl font-bold text-primary">{selectedCliente.total_titulos}</p></div>
                      <div><label className="text-sm font-medium">Valor Total</label><p className="text-2xl font-bold text-primary">{formatCurrency(selectedCliente.total_valor || 0)}</p></div>
                    </div>
                  </div>
                </TabsContent>
                <TabsContent value="historico" className="space-y-4">
                  <div className="space-y-3">
                    {comunicacoes.length > 0 ? comunicacoes.map((comunicacao) => (
                      <div key={comunicacao.id} className="border rounded-lg p-3">
                        <div className="flex items-center gap-2 mb-2">{getTipoIcon(comunicacao.tipo)}<span className="text-sm font-medium capitalize">{comunicacao.tipo}</span><span className="text-xs text-muted-foreground ml-auto">{formatDateTime(comunicacao.created_at)}</span></div>
                        <h4 className="text-sm font-medium mb-1">{comunicacao.assunto}</h4>
                      </div>
                    )) : <p className="text-sm text-muted-foreground text-center py-4">Nenhuma comunicação registrada</p>}
                  </div>
                </TabsContent>
              </Tabs>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={isDeleteModalOpen} onOpenChange={setIsDeleteModalOpen}>
        <DialogContent><DialogHeader><DialogTitle>Confirmar Exclusão</DialogTitle><DialogDescription>Tem certeza que deseja excluir o cliente {clienteToDelete?.nome}? Esta ação não pode ser desfeita.</DialogDescription></DialogHeader><DialogFooter className="gap-2"><Button variant="ghost" onClick={() => setIsDeleteModalOpen(false)}>Cancelar</Button><Button variant="destructive" onClick={handleDeleteCliente}>Excluir</Button></DialogFooter></DialogContent>
      </Dialog>
    </div>
  );
}
