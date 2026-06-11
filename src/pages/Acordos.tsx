import { useState, useEffect, useCallback, useMemo, type Dispatch, type SetStateAction } from 'react';
import { PageHeader } from '@/components/PageHeader';
import { useLocation } from 'react-router-dom';
import { Plus, Eye, Trash2, FileText, CheckCircle, TrendingUp } from 'lucide-react';
import { useAcordos, useCreateAcordo, useDeleteAcordo, type AcordoRow } from '@/lib/queries/acordos';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { StatusBadge } from '@/components/StatusBadge';
import { GlobalFilter } from '@/components/GlobalFilter';
import { useGlobalFilter } from '@/hooks/useGlobalFilter';
import { acordosFilterConfig } from '@/constants/filterConfigs';
import { acordosPresets } from '@/constants/filterPresets';
import { createAcordosFilterFunctions } from '@/utils/filterFunctions';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useTitulosAgrupados, TituloAgrupado } from '@/hooks/useTitulosAgrupados';
import { useUserRole } from '@/hooks/useUserRole';
import { SelecionarTitulosAcordo } from '@/components/acordos/SelecionarTitulosAcordo';

interface Acordo {
  id: string;
  titulo_id: string;
  cliente_id: string;
  valor_original: number;
  valor_acordo: number;
  desconto: number;
  parcelas: number;
  valor_parcela: number;
  data_acordo: string;
  data_vencimento_primeira_parcela: string;
  status: 'ativo' | 'cumprido' | 'quebrado' | 'cancelado';
  observacoes?: string;
  created_by: string;
  created_at: string;
  updated_at: string;
  titulo: {
    id: string;
    valor_original: number;
    vencimento_original: string;
    numero_documento?: string;
  };
  cliente: {
    id: string;
    nome: string;
    cpf_cnpj: string;
  };
}

interface NovoAcordo {
  cliente_id: string;
  titulo_ids: string[];
  valor_original: number;
  valor_acordo: number;
  parcelas: number;
  taxa_juros?: number;
  data_inicio: string;
  data_vencimento_primeira_parcela: string;
  observacoes?: string;
}

interface CronogramaParcela {
  numero: number;
  valor: number;
  valor_juros: number;
  valor_total: number;
  data_vencimento: string;
  status: 'pendente' | 'paga' | 'vencida';
}

interface FormErrors {
  cliente_id?: string;
  valor_acordo?: string;
  parcelas?: string;
  data_vencimento_primeira_parcela?: string;
}

interface SelectionData {
  clienteId: string;
  cliente: { id: string; nome: string; cpf_cnpj: string };
  tituloIds: string[];
  valorTotal: number;
  dividas: TituloAgrupado[];
}

interface LocationState {
  clienteId?: string;
  tituloIds?: string[];
  valorTotal?: number;
}

// ===================== Helpers puros =====================
const formatCurrency = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

const formatDate = (date: string) => new Date(date).toLocaleDateString('pt-BR');

// ===================== Subcomponentes =====================
interface NovoAcordoDialogProps {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  clientes: Parameters<typeof SelecionarTitulosAcordo>[0]['clientes'];
  clienteIdPreSelecionado?: string;
  onSelectionChange: (selection: SelectionData | null) => void;
  newAcordo: NovoAcordo;
  setNewAcordo: Dispatch<SetStateAction<NovoAcordo>>;
  formErrors: FormErrors;
  showCronograma: boolean;
  cronograma: CronogramaParcela[];
  onVisualizarCronograma: () => void;
  onCancel: () => void;
  onCreate: () => void;
}
function NovoAcordoDialog({
  open, onOpenChange, clientes, clienteIdPreSelecionado, onSelectionChange,
  newAcordo, setNewAcordo, formErrors, showCronograma, cronograma,
  onVisualizarCronograma, onCancel, onCreate,
}: NovoAcordoDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Novo Acordo</DialogTitle>
          <DialogDescription>
            Selecione os títulos e configure o acordo de pagamento
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <SelecionarTitulosAcordo
            clientes={clientes}
            clienteIdPreSelecionado={clienteIdPreSelecionado}
            onSelectionChange={onSelectionChange}
          />

          {newAcordo.titulo_ids.length > 0 && (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Valor Original</Label>
                  <Input
                    value={formatCurrency(newAcordo.valor_original)}
                    disabled
                    className="bg-muted"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Valor do Acordo</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={newAcordo.valor_acordo}
                    onChange={(e) => setNewAcordo(prev => ({ ...prev, valor_acordo: parseFloat(e.target.value) || 0 }))}
                    className={formErrors.valor_acordo ? "border-red-500" : ""}
                  />
                  {formErrors.valor_acordo && (
                    <span className="text-xs text-red-500">{formErrors.valor_acordo}</span>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Parcelas</Label>
                  <Input
                    type="number"
                    min="1"
                    value={newAcordo.parcelas}
                    onChange={(e) => setNewAcordo(prev => ({ ...prev, parcelas: parseInt(e.target.value) || 1 }))}
                    className={formErrors.parcelas ? "border-red-500" : ""}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Taxa de Juros (%)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={newAcordo.taxa_juros}
                    onChange={(e) => setNewAcordo(prev => ({ ...prev, taxa_juros: parseFloat(e.target.value) || 0 }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>1ª Parcela</Label>
                  <Input
                    type="date"
                    value={newAcordo.data_vencimento_primeira_parcela}
                    onChange={(e) => setNewAcordo(prev => ({ ...prev, data_vencimento_primeira_parcela: e.target.value }))}
                    className={formErrors.data_vencimento_primeira_parcela ? "border-red-500" : ""}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Observações</Label>
                <Input
                  value={newAcordo.observacoes}
                  onChange={(e) => setNewAcordo(prev => ({ ...prev, observacoes: e.target.value }))}
                />
              </div>

              <Button variant="outline" onClick={onVisualizarCronograma} className="w-full">
                Visualizar Cronograma
              </Button>

              {showCronograma && cronograma.length > 0 && (
                <div className="p-4 bg-muted rounded-lg">
                  <h4 className="font-medium mb-2">Cronograma de Parcelas</h4>
                  <div className="space-y-1 text-sm">
                    {cronograma.map((p) => (
                      <div key={p.numero} className="flex justify-between">
                        <span>Parcela {p.numero} - {formatDate(p.data_vencimento)}</span>
                        <span>{formatCurrency(p.valor_total)}</span>
                      </div>
                    ))}
                    <div className="border-t pt-2 mt-2 font-medium flex justify-between">
                      <span>Total</span>
                      <span>{formatCurrency(cronograma.reduce((sum, p) => sum + p.valor_total, 0))}</span>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            Cancelar
          </Button>
          <Button onClick={onCreate} disabled={newAcordo.titulo_ids.length === 0}>
            Criar Acordo
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface AcordoDetailsDialogProps {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  acordo: AcordoRow | null;
}
function AcordoDetailsDialog({ open, onOpenChange, acordo }: AcordoDetailsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Detalhes do Acordo</DialogTitle>
          <DialogDescription>
            Condições do acordo, parcelas e situação atual.
          </DialogDescription>
        </DialogHeader>
        {acordo && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-muted-foreground">Cliente</Label>
                <p className="font-medium">{acordo.cliente?.nome}</p>
              </div>
              <div>
                <Label className="text-muted-foreground">Status</Label>
                <div className="mt-1">
                  <StatusBadge domain="acordo" status={acordo.status} />
                </div>
              </div>
              <div>
                <Label className="text-muted-foreground">Valor Original</Label>
                <p>{formatCurrency(acordo.valor_original)}</p>
              </div>
              <div>
                <Label className="text-muted-foreground">Valor do Acordo</Label>
                <p className="font-medium">{formatCurrency(acordo.valor_acordo)}</p>
              </div>
              <div>
                <Label className="text-muted-foreground">Desconto</Label>
                <p>{acordo.desconto.toFixed(1)}%</p>
              </div>
              <div>
                <Label className="text-muted-foreground">Parcelas</Label>
                <p>{acordo.parcelas}x de {formatCurrency(acordo.valor_parcela)}</p>
              </div>
              <div>
                <Label className="text-muted-foreground">Data do Acordo</Label>
                <p>{formatDate(acordo.data_acordo)}</p>
              </div>
              <div>
                <Label className="text-muted-foreground">1ª Parcela</Label>
                <p>{formatDate(acordo.data_vencimento_primeira_parcela)}</p>
              </div>
            </div>
            {acordo.observacoes && (
              <div>
                <Label className="text-muted-foreground">Observações</Label>
                <p>{acordo.observacoes}</p>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

interface DeleteAcordoDialogProps {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onCancel: () => void;
  onConfirm: () => void;
}
function DeleteAcordoDialog({ open, onOpenChange, onCancel, onConfirm }: DeleteAcordoDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Confirmar Exclusão</DialogTitle>
          <DialogDescription>
            Tem certeza que deseja excluir este acordo? Esta ação não pode ser desfeita.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            Cancelar
          </Button>
          <Button variant="destructive" onClick={onConfirm}>
            Excluir
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function Acordos() {
  const location = useLocation();
  const preSelectedData = location.state as LocationState | null;

  // === Data via React Query ===
  const { data: acordos = [], isLoading: loading } = useAcordos();
  const createAcordoMutation = useCreateAcordo();
  const deleteAcordoMutation = useDeleteAcordo();

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [selectedAcordo, setSelectedAcordo] = useState<AcordoRow | null>(null);
  const [acordoToDelete, setAcordoToDelete] = useState<AcordoRow | null>(null);

  const [newAcordo, setNewAcordo] = useState<NovoAcordo>({
    cliente_id: '',
    titulo_ids: [],
    valor_original: 0,
    valor_acordo: 0,
    parcelas: 1,
    taxa_juros: 0,
    data_inicio: new Date().toISOString().split('T')[0],
    data_vencimento_primeira_parcela: new Date().toISOString().split('T')[0],
    observacoes: ''
  });

  const [formErrors, setFormErrors] = useState<FormErrors>({});
  const [cronograma, setCronograma] = useState<CronogramaParcela[]>([]);
  const [showCronograma, setShowCronograma] = useState(false);
  const { toast } = useToast();
  // Vendedor (e leitura) é read-only: escondemos as ações de escrita.
  const { isOperador } = useUserRole();

  const { clientes: clientesComDividas, loading: loadingTitulos, refetch: refetchTitulos } = useTitulosAgrupados();

  useEffect(() => {
    if (preSelectedData?.clienteId) {
      refetchTitulos();
      setIsCreateModalOpen(true);
    }
  }, [preSelectedData, refetchTitulos]);

  const validateForm = () => {
    const errors: FormErrors = {};
    let isValid = true;

    if (!newAcordo.cliente_id || newAcordo.titulo_ids.length === 0) {
      errors.cliente_id = 'Selecione pelo menos um título';
      isValid = false;
    }

    if (!newAcordo.valor_acordo || newAcordo.valor_acordo <= 0) {
      errors.valor_acordo = 'Valor do acordo deve ser maior que zero';
      isValid = false;
    }

    if (!newAcordo.parcelas || newAcordo.parcelas <= 0) {
      errors.parcelas = 'Número de parcelas deve ser maior que zero';
      isValid = false;
    }

    if (!newAcordo.data_vencimento_primeira_parcela) {
      errors.data_vencimento_primeira_parcela = 'Data de vencimento é obrigatória';
      isValid = false;
    }

    setFormErrors(errors);
    return isValid;
  };

  const calcularCronograma = () => {
    if (!newAcordo.valor_acordo || !newAcordo.parcelas || !newAcordo.data_vencimento_primeira_parcela) {
      return [];
    }

    const parcelas: CronogramaParcela[] = [];
    const valorBase = newAcordo.valor_acordo / newAcordo.parcelas;
    const taxaJuros = (newAcordo.taxa_juros || 0) / 100;
    const dataInicio = new Date(newAcordo.data_vencimento_primeira_parcela);

    for (let i = 0; i < newAcordo.parcelas; i++) {
      const dataVencimento = new Date(dataInicio);
      dataVencimento.setMonth(dataVencimento.getMonth() + i);
      
      const valorJuros = valorBase * taxaJuros * (i + 1);
      const valorTotal = valorBase + valorJuros;

      parcelas.push({
        numero: i + 1,
        valor: valorBase,
        valor_juros: valorJuros,
        valor_total: valorTotal,
        data_vencimento: dataVencimento.toISOString().split('T')[0],
        status: 'pendente'
      });
    }

    return parcelas;
  };

  const handleSelectionChange = useCallback((selection: SelectionData | null) => {
    if (!selection) {
      setNewAcordo(prev => ({
        ...prev,
        cliente_id: '',
        titulo_ids: [],
        valor_original: 0,
        valor_acordo: 0
      }));
      return;
    }

    setNewAcordo(prev => ({
      ...prev,
      cliente_id: selection.clienteId,
      titulo_ids: selection.tituloIds,
      valor_original: selection.valorTotal,
      valor_acordo: prev.valor_acordo === 0 || prev.valor_acordo === prev.valor_original 
        ? selection.valorTotal 
        : prev.valor_acordo
    }));
  }, []);

  const handleCreateAcordo = async () => {
    if (!validateForm()) {
      toast({
        title: "Erro",
        description: "Por favor, preencha todos os campos obrigatórios.",
        variant: "destructive",
      });
      return;
    }

    try {
      const desconto = ((newAcordo.valor_original - newAcordo.valor_acordo) / newAcordo.valor_original) * 100;
      const cronogramaParcelas = calcularCronograma();
      const valorTotalComJuros = cronogramaParcelas.reduce((sum, p) => sum + p.valor_total, 0);
      const valorParcela = valorTotalComJuros / newAcordo.parcelas;
      const tituloPrincipal = newAcordo.titulo_ids[0];

      await createAcordoMutation.mutateAsync({
        titulo_id: tituloPrincipal,
        cliente_id: newAcordo.cliente_id,
        valor_original: newAcordo.valor_original,
        valor_acordo: valorTotalComJuros,
        desconto,
        parcelas: newAcordo.parcelas,
        valor_parcela: valorParcela,
        data_vencimento_primeira_parcela: newAcordo.data_vencimento_primeira_parcela,
        observacoes: newAcordo.observacoes,
        cronograma: cronogramaParcelas.map((p) => ({
          numero_parcela: p.numero,
          valor: p.valor,
          valor_juros: p.valor_juros,
          valor_total: p.valor_total,
          data_vencimento: p.data_vencimento,
        })),
      });

      toast({
        title: "Sucesso",
        description: `Acordo criado com sucesso. ${newAcordo.titulo_ids.length} título(s) incluído(s).`,
      });

      setIsCreateModalOpen(false);
      setShowCronograma(false);
      setNewAcordo({
        cliente_id: '',
        titulo_ids: [],
        valor_original: 0,
        valor_acordo: 0,
        parcelas: 1,
        taxa_juros: 0,
        data_inicio: new Date().toISOString().split('T')[0],
        data_vencimento_primeira_parcela: new Date().toISOString().split('T')[0],
        observacoes: '',
      });

      refetchTitulos();
    } catch (error) {
      console.error('Erro ao criar acordo:', error);
      toast({
        title: "Erro",
        description: "Não foi possível criar o acordo",
        variant: "destructive",
      });
    }
  };

  const visualizarCronograma = () => {
    const cronogramaCalculado = calcularCronograma();
    setCronograma(cronogramaCalculado);
    setShowCronograma(true);
  };

  const handleDeleteAcordo = async () => {
    if (!acordoToDelete) return;

    try {
      await deleteAcordoMutation.mutateAsync(acordoToDelete.id);

      setIsDeleteModalOpen(false);
      setAcordoToDelete(null);

      toast({
        title: "Sucesso",
        description: "Acordo excluído com sucesso",
      });

      refetchTitulos();
    } catch (error) {
      console.error('Erro ao excluir acordo:', error);
      toast({
        title: "Erro",
        description: "Não foi possível excluir o acordo",
        variant: "destructive",
      });
    }
  };

  // Filter functions for acordos
  const filterFunctions = useMemo(() => createAcordosFilterFunctions(), []);

  const {
    filteredData: filteredAcordos,
    filters,
    setFilter,
    setFilters,
    clearFilter,
    clearAllFilters,
    hasActiveFilters,
    activeFiltersCount,
    resultCount,
    totalCount
  } = useGlobalFilter(acordos, filterFunctions);

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
        title="Acordos"
        description="Gestão e acompanhamento de acordos de parcelamento."
      >
        {isOperador && (
          <Button 
            onClick={() => {
              refetchTitulos();
              setIsCreateModalOpen(true);
            }}
          >
            <Plus className="h-4 w-4 mr-2" />
            Novo Acordo
          </Button>
        )}
      </PageHeader>

      <div className="grid gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="border-none shadow-card rounded-2xl overflow-hidden group">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent pointer-events-none" />
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 relative z-10">
            <CardTitle className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Total de Acordos</CardTitle>
            <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary group-hover:scale-110 transition-transform">
              <FileText className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent className="relative z-10">
            <div className="text-3xl font-black tracking-tighter">{acordos.length}</div>
            <p className="text-[10px] font-medium text-muted-foreground mt-1">Acordos registrados</p>
          </CardContent>
        </Card>

        <Card className="border-none shadow-card rounded-2xl overflow-hidden group">
          <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-transparent pointer-events-none" />
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 relative z-10">
            <CardTitle className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Acordos Ativos</CardTitle>
            <div className="h-8 w-8 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-600 group-hover:scale-110 transition-transform">
              <CheckCircle className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent className="relative z-10">
            <div className="text-3xl font-black tracking-tighter text-blue-600">
              {acordos.filter(a => a.status === 'ativo').length}
            </div>
            <p className="text-[10px] font-medium text-muted-foreground mt-1">Em andamento</p>
          </CardContent>
        </Card>

        <Card className="border-none shadow-card rounded-2xl overflow-hidden group">
          <div className="absolute inset-0 bg-gradient-to-br from-success/5 to-transparent pointer-events-none" />
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 relative z-10">
            <CardTitle className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Cumpridos</CardTitle>
            <div className="h-8 w-8 rounded-lg bg-success/10 flex items-center justify-center text-success group-hover:scale-110 transition-transform">
              <Plus className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent className="relative z-10">
            <div className="text-3xl font-black tracking-tighter text-success">
              {acordos.filter(a => a.status === 'cumprido').length}
            </div>
            <p className="text-[10px] font-medium text-muted-foreground mt-1">Finalizados com sucesso</p>
          </CardContent>
        </Card>

        <Card className="border-none shadow-card rounded-2xl overflow-hidden group">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent pointer-events-none" />
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 relative z-10">
            <CardTitle className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Valor Total</CardTitle>
            <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary group-hover:scale-110 transition-transform">
              <TrendingUp className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent className="relative z-10">
            <div className="text-3xl font-black tracking-tighter">
              {formatCurrency(acordos.reduce((sum, a) => sum + a.valor_acordo, 0))}
            </div>
            <p className="text-[10px] font-medium text-muted-foreground mt-1">Montante negociado</p>
          </CardContent>
        </Card>
      </div>

      <Card className="border-none shadow-card rounded-2xl overflow-hidden">
        <CardHeader className="pb-4 border-b border-border/50 bg-muted/20">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-xl font-bold tracking-tight">Lista de Acordos</CardTitle>
              <CardDescription className="text-xs font-medium">Total de {filteredAcordos.length} acordos encontrados</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-6">
          <GlobalFilter
            configs={acordosFilterConfig}
            filters={filters}
            onFilterChange={setFilter}
            onClearFilter={clearFilter}
            onClearAll={clearAllFilters}
            hasActiveFilters={hasActiveFilters}
            activeFiltersCount={activeFiltersCount}
            resultCount={resultCount}
            totalCount={totalCount}
            presets={acordosPresets}
            onPresetSelect={(preset) => setFilters(preset.filters)}
            collapsible={true}
            defaultOpen={false}
          />

          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cliente</TableHead>
                  <TableHead className="hidden sm:table-cell">N. Título</TableHead>
                  <TableHead className="hidden md:table-cell">Valor Original</TableHead>
                  <TableHead>Valor Acordo</TableHead>
                  <TableHead className="hidden lg:table-cell">Parcelas</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredAcordos.map((acordo) => (
                  <TableRow key={acordo.id}>
                    <TableCell>
                      <div>
                        <div className="font-medium">{acordo.cliente?.nome}</div>
                        <div className="text-xs text-muted-foreground">
                          {acordo.cliente?.cpf_cnpj}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell font-mono text-sm">
                      {acordo.titulo?.numero_documento || '-'}
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      {formatCurrency(acordo.valor_original)}
                    </TableCell>
                    <TableCell>{formatCurrency(acordo.valor_acordo)}</TableCell>
                    <TableCell className="hidden lg:table-cell">
                      {acordo.parcelas}x de {formatCurrency(acordo.valor_parcela)}
                    </TableCell>
                    <TableCell>
                      <StatusBadge domain="acordo" status={acordo.status} />
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setSelectedAcordo(acordo);
                            setIsDetailsModalOpen(true);
                          }}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        {isOperador && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setAcordoToDelete(acordo);
                              setIsDeleteModalOpen(true);
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {filteredAcordos.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      Nenhum acordo encontrado
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <NovoAcordoDialog
        open={isCreateModalOpen}
        onOpenChange={setIsCreateModalOpen}
        clientes={clientesComDividas}
        clienteIdPreSelecionado={preSelectedData?.clienteId}
        onSelectionChange={handleSelectionChange}
        newAcordo={newAcordo}
        setNewAcordo={setNewAcordo}
        formErrors={formErrors}
        showCronograma={showCronograma}
        cronograma={cronograma}
        onVisualizarCronograma={visualizarCronograma}
        onCancel={() => setIsCreateModalOpen(false)}
        onCreate={handleCreateAcordo}
      />

      <AcordoDetailsDialog
        open={isDetailsModalOpen}
        onOpenChange={setIsDetailsModalOpen}
        acordo={selectedAcordo}
      />

      <DeleteAcordoDialog
        open={isDeleteModalOpen}
        onOpenChange={setIsDeleteModalOpen}
        onCancel={() => setIsDeleteModalOpen(false)}
        onConfirm={handleDeleteAcordo}
      />
    </div>
  );
}
