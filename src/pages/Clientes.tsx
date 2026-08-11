import { useState, useMemo, type ChangeEvent } from 'react';
import { PageHeader } from '@/components/PageHeader';
import { CarregandoConteudo } from '@/components/TelaCarregamento';
import { useLocation, useNavigate } from 'react-router-dom';
import { Plus, Eye, Edit, Phone, Mail, FileText, User, Trash2, MoreHorizontal, CheckCircle, AlertTriangle } from 'lucide-react';
import {
  useClientes,
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
import { useToast } from '@/hooks/use-toast';
import { GlobalFilter } from '@/components/GlobalFilter';
import { StatusBadge } from '@/components/StatusBadge';
import { ResumoNumeros } from '@/components/ResumoNumeros';
import { ConfirmarAcaoDestrutiva } from '@/components/ConfirmarAcaoDestrutiva';
import { useGlobalFilter } from '@/hooks/useGlobalFilter';
import { usePagination, PARAM_PAGINA } from '@/hooks/usePagination';
import { TablePagination } from '@/components/TablePagination';
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
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import type { CobradorRow } from '@/lib/queries/cobradores';
import type { VendedorRow } from '@/lib/queries/vendedores';
import { formatCpfCnpj, formatTelefone, formatData } from '@/utils/format';

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

// ===================== Helpers puros =====================
const formatCurrency = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(value);

// 'proximo_retorno' é data pura: formatData evita o deslocamento de fuso.
const formatDateShort = (date: string) => formatData(date);

// Célula "Próximo retorno": data + status de cobrança; destaca atrasados.
function RetornoCell({ cliente }: { cliente: ClienteRow }) {
  if (!cliente.proximo_retorno) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }
  return (
    <div className="space-y-1">
      <div className={cliente.retorno_atrasado ? 'text-xs font-bold text-destructive' : 'text-xs font-bold text-foreground'}>
        {formatDateShort(cliente.proximo_retorno)}
      </div>
      {cliente.retorno_status_cobranca && (
        <StatusBadge domain="status_cobranca" status={cliente.retorno_status_cobranca} />
      )}
    </div>
  );
}

// ===================== Subcomponentes =====================
interface ClienteItemProps {
  cliente: ClienteRow;
  isOperador: boolean;
  onDetails: (c: ClienteRow) => void;
  onEdit: (c: ClienteRow) => void;
  onDelete: (c: ClienteRow) => void;
}

function ClienteCard({ cliente, isOperador, onDetails, onEdit, onDelete }: ClienteItemProps) {
  return (
    <div className="p-5 rounded-2xl border border-border/50 bg-card hover:border-primary/30 transition-all shadow-sm group">
      <div className="flex justify-between items-start mb-4">
        <div className="flex-1 min-w-0">
          <button type="button" onClick={() => onDetails(cliente)} className="block text-left font-bold text-lg text-foreground truncate hover:text-primary hover:underline transition-colors">{cliente.nome}</button>
          <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">{formatCpfCnpj(cliente.cpf_cnpj)}</p>
        </div>
        <StatusBadge domain="cliente" status={cliente.status} />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
        {cliente.telefone && (
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <div className="h-7 w-7 rounded-lg bg-muted flex items-center justify-center"><Phone className="h-3.5 w-3.5" /></div>
            <span>{formatTelefone(cliente.telefone)}</span>
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
          <div>
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Retorno</p>
            <RetornoCell cliente={cliente} />
          </div>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="h-10 w-10 rounded-xl hover:bg-primary/5"><MoreHorizontal className="h-5 w-5" /></Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="rounded-xl shadow-card border-border/40">
            <DropdownMenuLabel className="text-xs font-bold uppercase tracking-widest text-muted-foreground px-3 py-2">Ações</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="rounded-lg m-1 font-medium" onClick={() => onDetails(cliente)}><Eye className="h-4 w-4 mr-2" />Abrir ficha</DropdownMenuItem>
            {isOperador && (
              <>
                <DropdownMenuItem className="rounded-lg m-1 font-medium" onClick={() => onEdit(cliente)}><Edit className="h-4 w-4 mr-2" />Editar</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="rounded-lg m-1 font-medium text-destructive focus:text-destructive" onClick={() => onDelete(cliente)}><Trash2 className="h-4 w-4 mr-2" />Excluir</DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

function ClienteTableRow({ cliente, isOperador, onDetails, onEdit, onDelete }: ClienteItemProps) {
  return (
    <TableRow className="hover:bg-muted/10 transition-colors">
      {/* Cliente: nome + CPF/CNPJ empilhados (antes eram 2 colunas) */}
      <TableCell>
        <button type="button" onClick={() => onDetails(cliente)} className="block text-left font-bold text-sm text-foreground hover:text-primary hover:underline transition-colors">{cliente.nome}</button>
        <div className="text-[11px] font-medium text-muted-foreground">{formatCpfCnpj(cliente.cpf_cnpj)}</div>
      </TableCell>
      {/* Contato: some abaixo de xl (email é o principal vilão de largura) */}
      <TableCell className="hidden xl:table-cell">
        <div className="text-xs space-y-0.5">
          {cliente.telefone
            ? <div className="font-bold text-foreground">{formatTelefone(cliente.telefone)}</div>
            : <span className="text-muted-foreground">—</span>}
          {cliente.email && <div className="text-muted-foreground font-medium truncate max-w-[200px]">{cliente.email}</div>}
        </div>
      </TableCell>
      {/* Responsáveis: cobrador + vendedor num só bloco; some abaixo de xl */}
      <TableCell className="hidden xl:table-cell">
        <div className="text-xs space-y-0.5">
          <div><span className="text-muted-foreground">Cob:</span> <span className="font-medium">{cliente.cobrador_nome ?? '—'}</span></div>
          <div><span className="text-muted-foreground">Vend:</span> <span className="font-medium">{cliente.vendedor_nome ?? '—'}</span></div>
        </div>
      </TableCell>
      <TableCell><RetornoCell cliente={cliente} /></TableCell>
      {/* Situação + resumo financeiro (antes eram 3 colunas: situação/títulos/valor) */}
      <TableCell>
        <div className="space-y-1">
          <StatusBadge domain="cliente" status={cliente.status} />
          <div className="text-xs">
            <span className="font-black text-primary">{formatCurrency(cliente.total_valor || 0)}</span>
            <span className="text-muted-foreground"> · {cliente.total_titulos} tít.</span>
          </div>
        </div>
      </TableCell>
      <TableCell className="text-right">
        <DropdownMenu>
          <DropdownMenuTrigger asChild><Button variant="ghost" size="sm" className="h-8 w-8 p-0 rounded-lg hover:bg-primary/5"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="rounded-xl shadow-card border-border/40">
            <DropdownMenuItem className="rounded-lg m-1 font-medium" onClick={() => onDetails(cliente)}><Eye className="h-4 w-4 mr-2" />Abrir ficha</DropdownMenuItem>
            {isOperador && (
            <>
            <DropdownMenuItem className="rounded-lg m-1 font-medium" onClick={() => onEdit(cliente)}><Edit className="h-4 w-4 mr-2" />Editar</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="rounded-lg m-1 font-medium text-destructive focus:text-destructive" onClick={() => onDelete(cliente)}><Trash2 className="h-4 w-4 mr-2" />Excluir</DropdownMenuItem>
            </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </TableCell>
    </TableRow>
  );
}

type NovoClienteForm = {
  nome: string; cpf_cnpj: string; telefone: string; email: string; endereco_completo: string;
  cep: string; cidade: string; estado: string; observacoes: string; cobrador_id: string; vendedor_id: string;
};

// Selects de Cobrador/Vendedor reutilizados nos diálogos de novo/editar cliente.
// Radix Select não aceita value vazio, então usamos o sentinela 'none'.
interface CarteiraFieldsProps {
  cobradorId: string;
  vendedorId: string;
  cobradores: CobradorRow[];
  vendedores: VendedorRow[];
  onCobrador: (id: string) => void;
  onVendedor: (id: string) => void;
}
function CarteiraFields({ cobradorId, vendedorId, cobradores, vendedores, onCobrador, onVendedor }: CarteiraFieldsProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <div className="grid grid-cols-1 gap-2">
        <Label>Cobrador</Label>
        <Select value={cobradorId || 'none'} onValueChange={(v) => onCobrador(v === 'none' ? '' : v)}>
          <SelectTrigger><SelectValue placeholder="Sem cobrador" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Sem cobrador</SelectItem>
            {cobradores.map((c) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="grid grid-cols-1 gap-2">
        <Label>Vendedor</Label>
        <Select value={vendedorId || 'none'} onValueChange={(v) => onVendedor(v === 'none' ? '' : v)}>
          <SelectTrigger><SelectValue placeholder="Sem vendedor" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Sem vendedor</SelectItem>
            {vendedores.map((v) => <SelectItem key={v.id} value={v.id}>{v.nome}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

type EditClienteForm = NovoClienteForm & { id: string; status: string };

/**
 * Campos do cliente — os MESMOS em cadastrar e editar.
 *
 * O formulário de criação não tinha CEP, cidade, estado e observações: quem
 * cadastrava completo precisava salvar e reabrir em modo edição, dois modais
 * para uma tarefa. Agora existe um conjunto de campos só.
 */
interface ClienteCamposProps<T extends NovoClienteForm> {
  prefixo: string;
  valores: T;
  onChange: (valores: T) => void;
  formErrors: FormErrors;
  cobradores: CobradorRow[];
  vendedores: VendedorRow[];
}
function ClienteCampos<T extends NovoClienteForm>({
  prefixo, valores, onChange, formErrors, cobradores, vendedores,
}: ClienteCamposProps<T>) {
  const campo = (chave: keyof NovoClienteForm) => ({
    id: `${prefixo}-${String(chave)}`,
    value: valores[chave] as string,
    onChange: (e: ChangeEvent<HTMLInputElement>) =>
      onChange({ ...valores, [chave]: e.target.value }),
  });

  return (
    <div className="grid gap-4 py-4">
      <div className="grid grid-cols-1 gap-2">
        <Label htmlFor={`${prefixo}-nome`}>Nome*</Label>
        <Input {...campo('nome')} className={formErrors.nome ? 'border-red-500' : ''} />
      </div>
      <div className="grid grid-cols-1 gap-2">
        <Label htmlFor={`${prefixo}-cpf_cnpj`}>CPF/CNPJ*</Label>
        <Input {...campo('cpf_cnpj')} className={formErrors.cpf_cnpj ? 'border-red-500' : ''} />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="grid grid-cols-1 gap-2">
          <Label htmlFor={`${prefixo}-telefone`}>Telefone</Label>
          <Input {...campo('telefone')} />
        </div>
        <div className="grid grid-cols-1 gap-2">
          <Label htmlFor={`${prefixo}-email`}>Email</Label>
          <Input type="email" {...campo('email')} />
        </div>
      </div>
      <div className="grid grid-cols-1 gap-2">
        <Label htmlFor={`${prefixo}-endereco_completo`}>Endereço</Label>
        <Input {...campo('endereco_completo')} />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="grid grid-cols-1 gap-2">
          <Label htmlFor={`${prefixo}-cep`}>CEP</Label>
          <Input {...campo('cep')} />
        </div>
        <div className="grid grid-cols-1 gap-2">
          <Label htmlFor={`${prefixo}-cidade`}>Cidade</Label>
          <Input {...campo('cidade')} />
        </div>
        <div className="grid grid-cols-1 gap-2">
          <Label htmlFor={`${prefixo}-estado`}>Estado</Label>
          <Input {...campo('estado')} />
        </div>
      </div>
      <div className="grid grid-cols-1 gap-2">
        <Label htmlFor={`${prefixo}-observacoes`}>Observações</Label>
        <Input {...campo('observacoes')} />
      </div>
      <CarteiraFields
        cobradorId={valores.cobrador_id}
        vendedorId={valores.vendedor_id}
        cobradores={cobradores}
        vendedores={vendedores}
        onCobrador={(id) => onChange({ ...valores, cobrador_id: id })}
        onVendedor={(id) => onChange({ ...valores, vendedor_id: id })}
      />
    </div>
  );
}

interface NovoClienteDialogProps {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  novoCliente: NovoClienteForm;
  setNovoCliente: (c: NovoClienteForm) => void;
  formErrors: FormErrors;
  onSave: () => void;
  cobradores: CobradorRow[];
  vendedores: VendedorRow[];
}
function NovoClienteDialog({ open, onOpenChange, novoCliente, setNovoCliente, formErrors, onSave, cobradores, vendedores }: NovoClienteDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[75vw] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Novo Cliente</DialogTitle>
          <DialogDescription>Preencha os dados do novo cliente.</DialogDescription>
        </DialogHeader>
        <ClienteCampos
          prefixo="novo"
          valores={novoCliente}
          onChange={setNovoCliente}
          formErrors={formErrors}
          cobradores={cobradores}
          vendedores={vendedores}
        />
        <DialogFooter><Button onClick={onSave}>Salvar</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface EditClienteDialogProps {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  editingCliente: EditClienteForm;
  setEditingCliente: (c: EditClienteForm) => void;
  formErrors: FormErrors;
  onSave: () => void;
  cobradores: CobradorRow[];
  vendedores: VendedorRow[];
}
function EditClienteDialog({ open, onOpenChange, editingCliente, setEditingCliente, formErrors, onSave, cobradores, vendedores }: EditClienteDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[75vw] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar Cliente</DialogTitle>
          <DialogDescription>Atualize os dados do cliente.</DialogDescription>
        </DialogHeader>
        <ClienteCampos
          prefixo="edit"
          valores={editingCliente}
          onChange={setEditingCliente}
          formErrors={formErrors}
          cobradores={cobradores}
          vendedores={vendedores}
        />
        <DialogFooter><Button onClick={onSave}>Salvar</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface DeleteClienteDialogProps {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  cliente: ClienteRow | null;
  onCancel: () => void;
  onConfirm: () => void;
}
function DeleteClienteDialog({ open, onOpenChange, cliente, onCancel, onConfirm }: DeleteClienteDialogProps) {
  return (
    <ConfirmarAcaoDestrutiva
      open={open}
      onOpenChange={(o) => { onOpenChange(o); if (!o) onCancel(); }}
      titulo="Excluir cliente"
      descricao={
        <>
          <p>
            O cliente <span className="font-medium">{cliente?.nome}</span> sai das listagens
            junto com seus agendamentos e comunicações. O histórico financeiro é preservado
            no banco.
          </p>
          <p>
            A exclusão é recusada se houver título ou acordo em aberto — quite ou cancele antes.
          </p>
        </>
      }
      rotuloConfirmar="Excluir cliente"
      textoConfirmacao="EXCLUIR"
      onConfirm={onConfirm}
    />
  );
}

export default function Clientes() {
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();

  // === Data via React Query ===
  const { data: clientes = [], isLoading: loading } = useClientes();
  const { data: cobradores = [] } = useCobradores();
  const { data: vendedores = [] } = useVendedores();
  const { isOperador, isVendedor } = useUserRole();
  const createClienteMutation = useCreateCliente();
  const updateClienteMutation = useUpdateCliente();
  const deleteClienteMutation = useDeleteCliente();

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
      const description = error instanceof Error ? error.message : "Não foi possível excluir o cliente.";
      toast({ title: "Erro", description, variant: "destructive" });
    }
  };

  // Leva a origem junto: o breadcrumb da ficha volta para esta lista com os
  // filtros e a página que estavam valendo, em vez de um /clientes limpo.
  const openDetails = (c: ClienteRow) =>
    navigate(`/clientes/${c.id}`, { state: { from: location.pathname + location.search } });
  const openDelete = (c: ClienteRow) => { setClienteToDelete(c); setIsDeleteModalOpen(true); };
  const openEdit = (c: ClienteRow) => {
    setEditingCliente({
      id: c.id, nome: c.nome, cpf_cnpj: c.cpf_cnpj, telefone: c.telefone || '', email: c.email || '',
      endereco_completo: c.endereco_completo || '', cep: c.cep || '', cidade: c.cidade || '',
      estado: c.estado || '', observacoes: c.observacoes || '', status: c.status,
      cobrador_id: c.cobrador_id || '', vendedor_id: c.vendedor_id || '',
    });
    setIsEditModalOpen(true);
  };

  const filterFunctions = useMemo(() => createClientesFilterFunctions(), []);

  // Filtros "Cobrador" e "Vendedor" com opções dinâmicas (equipe da empresa).
  const filterConfigs = useMemo(() => [
    ...clientesFilterConfig,
    {
      id: 'cobrador',
      label: 'Cobrador',
      type: 'select' as const,
      placeholder: 'Todos',
      options: cobradores.map((c) => ({ value: c.id, label: c.nome })),
    },
    {
      id: 'vendedor',
      label: 'Vendedor',
      type: 'select' as const,
      placeholder: 'Todos',
      options: vendedores.map((v) => ({ value: v.id, label: v.nome })),
    },
  ], [cobradores, vendedores]);

  // ?vendedor=<id> (link vindo da tela de Vendedores) não precisa mais de
  // tratamento especial: o useGlobalFilter lê da URL toda chave que é filtro.
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

  // Com filtro de retorno ativo, ordena por data do próximo retorno (mais
  // urgentes/atrasados primeiro) para o cobrador enxergar o dia organizado.
  const orderedClientes = useMemo(() => {
    if (!filters.retorno) return filteredClientes;
    return [...filteredClientes].sort((a, b) => {
      if (!a.proximo_retorno) return 1;
      if (!b.proximo_retorno) return -1;
      return a.proximo_retorno.localeCompare(b.proximo_retorno);
    });
  }, [filteredClientes, filters.retorno]);

  const pagination = usePagination(orderedClientes, 25, JSON.stringify(filters), PARAM_PAGINA);

  const statusCounts = {
    total: clientes.length,
    ativo: clientes.filter(c => c.status === 'ativo').length,
    inadimplente: clientes.filter(c => c.status === 'inadimplente').length,
    em_acordo: clientes.filter(c => c.status === 'em_acordo').length,
    quitado: clientes.filter(c => c.status === 'quitado').length,
  };

  if (loading) {
    return <CarregandoConteudo />;
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

      <ResumoNumeros
        itens={[
          { rotulo: 'Total', valor: statusCounts.total, icone: User },
          { rotulo: 'Ativos', valor: statusCounts.ativo, icone: CheckCircle, cor: 'text-success' },
          { rotulo: 'Inadimplentes', valor: statusCounts.inadimplente, icone: AlertTriangle, cor: 'text-destructive' },
          { rotulo: 'Em acordo', valor: statusCounts.em_acordo, icone: FileText, cor: 'text-blue-600' },
          { rotulo: 'Quitados', valor: statusCounts.quitado, icone: CheckCircle },
        ]}
      />

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
              configs={filterConfigs}
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
            />

            {/* Mobile Card View */}
            <div className="lg:hidden space-y-4">
              {pagination.pageItems.map((cliente) => (
                <ClienteCard
                  key={cliente.id}
                  cliente={cliente}
                  isOperador={isOperador}
                  onDetails={openDetails}
                  onEdit={openEdit}
                  onDelete={openDelete}
                />
              ))}
            </div>

            {/* Desktop Table View */}
            <div className="hidden lg:block rounded-xl border border-border/50 overflow-hidden">
              <Table>
                <TableHeader className="bg-muted/30">
                  <TableRow>
                    <TableHead className="text-[10px] font-bold uppercase tracking-widest">Cliente</TableHead>
                    <TableHead className="hidden xl:table-cell text-[10px] font-bold uppercase tracking-widest">Contato</TableHead>
                    <TableHead className="hidden xl:table-cell text-[10px] font-bold uppercase tracking-widest">Responsáveis</TableHead>
                    <TableHead className="text-[10px] font-bold uppercase tracking-widest">Retorno</TableHead>
                    <TableHead className="text-[10px] font-bold uppercase tracking-widest">Situação</TableHead>
                    <TableHead className="text-right text-[10px] font-bold uppercase tracking-widest">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pagination.pageItems.map((cliente) => (
                    <ClienteTableRow
                      key={cliente.id}
                      cliente={cliente}
                      isOperador={isOperador}
                      onDetails={openDetails}
                      onEdit={openEdit}
                      onDelete={openDelete}
                    />
                  ))}
                </TableBody>
              </Table>
            </div>

            <TablePagination pagination={pagination} />
          </CardContent>
        </Card>
      </div>

      {/* Modais */}
      <NovoClienteDialog
        open={isCreateModalOpen}
        onOpenChange={setIsCreateModalOpen}
        novoCliente={newCliente}
        setNovoCliente={setNewCliente}
        formErrors={formErrors}
        onSave={handleCreateCliente}
        cobradores={cobradores}
        vendedores={vendedores}
      />

      <EditClienteDialog
        open={isEditModalOpen}
        onOpenChange={setIsEditModalOpen}
        editingCliente={editingCliente}
        setEditingCliente={setEditingCliente}
        formErrors={formErrors}
        onSave={handleEditCliente}
        cobradores={cobradores}
        vendedores={vendedores}
      />

      <DeleteClienteDialog
        open={isDeleteModalOpen}
        onOpenChange={setIsDeleteModalOpen}
        cliente={clienteToDelete}
        onCancel={() => setIsDeleteModalOpen(false)}
        onConfirm={handleDeleteCliente}
      />
    </div>
  );
}
