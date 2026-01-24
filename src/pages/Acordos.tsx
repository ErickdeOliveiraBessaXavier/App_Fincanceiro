import { useState, useEffect, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { Plus, Search, Eye, Trash2, FileText } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
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

export default function Acordos() {
  const location = useLocation();
  const preSelectedData = location.state as LocationState | null;

  const [acordos, setAcordos] = useState<Acordo[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [selectedAcordo, setSelectedAcordo] = useState<Acordo | null>(null);
  const [acordoToDelete, setAcordoToDelete] = useState<Acordo | null>(null);
  
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

  const { clientes: clientesComDividas, loading: loadingTitulos, refetch: refetchTitulos } = useTitulosAgrupados();

  useEffect(() => {
    fetchAcordos();
  }, []);

  useEffect(() => {
    if (preSelectedData?.clienteId) {
      refetchTitulos();
      setIsCreateModalOpen(true);
    }
  }, [preSelectedData, refetchTitulos]);

  const fetchAcordos = async () => {
    try {
      setLoading(true);
      const { data: rawData, error } = await supabase
        .from('acordos')
        .select(`
          id,
          titulo_id,
          cliente_id,
          valor_original,
          valor_acordo,
          desconto,
          parcelas,
          valor_parcela,
          data_acordo,
          data_vencimento_primeira_parcela,
          status,
          observacoes,
          created_by,
          created_at,
          updated_at,
          titulo:titulos (
            id,
            valor_original,
            vencimento_original,
            numero_documento
          ),
          cliente:clientes (
            id,
            nome,
            cpf_cnpj
          )
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const typedData = (rawData as any[])?.map(item => ({
        id: item.id,
        titulo_id: item.titulo_id,
        cliente_id: item.cliente_id,
        valor_original: item.valor_original,
        valor_acordo: item.valor_acordo,
        desconto: item.desconto,
        parcelas: item.parcelas,
        valor_parcela: item.valor_parcela,
        data_acordo: item.data_acordo,
        data_vencimento_primeira_parcela: item.data_vencimento_primeira_parcela,
        status: item.status,
        observacoes: item.observacoes,
        created_by: item.created_by,
        created_at: item.created_at,
        updated_at: item.updated_at,
        titulo: item.titulo,
        cliente: item.cliente
      })) || [];
      
      setAcordos(typedData);
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
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Usuário não autenticado');

      const desconto = ((newAcordo.valor_original - newAcordo.valor_acordo) / newAcordo.valor_original) * 100;
      const cronogramaParcelas = calcularCronograma();
      const valorTotalComJuros = cronogramaParcelas.reduce((sum, p) => sum + p.valor_total, 0);
      const valorParcela = valorTotalComJuros / newAcordo.parcelas;

      const tituloPrincipal = newAcordo.titulo_ids[0];

      const { data: acordoData, error: acordoError } = await supabase
        .from('acordos')
        .insert([{
          titulo_id: tituloPrincipal,
          cliente_id: newAcordo.cliente_id,
          valor_original: newAcordo.valor_original,
          valor_acordo: valorTotalComJuros,
          desconto: desconto,
          parcelas: newAcordo.parcelas,
          valor_parcela: valorParcela,
          data_acordo: new Date().toISOString().split('T')[0],
          data_vencimento_primeira_parcela: newAcordo.data_vencimento_primeira_parcela,
          status: 'ativo',
          observacoes: newAcordo.observacoes,
          created_by: user.id
        }])
        .select()
        .single();

      if (acordoError) throw acordoError;

      if (acordoData && cronogramaParcelas.length > 0) {
        const parcelasInsert = cronogramaParcelas.map(p => ({
          acordo_id: acordoData.id,
          numero_parcela: p.numero,
          valor: p.valor,
          valor_juros: p.valor_juros,
          valor_total: p.valor_total,
          data_vencimento: p.data_vencimento,
          status: 'pendente'
        }));

        const { error: parcelasError } = await supabase
          .from('parcelas_acordo')
          .insert(parcelasInsert);

        if (parcelasError) {
          console.error('Erro ao criar parcelas:', parcelasError);
        }
      }

      // Nota: Como a tabela titulos não tem mais coluna 'status', 
      // a marcação do acordo será feita via metadados ou outra tabela

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
        observacoes: ''
      });
      
      fetchAcordos();
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
      await supabase
        .from('parcelas_acordo')
        .delete()
        .eq('acordo_id', acordoToDelete.id);

      const { error } = await supabase
        .from('acordos')
        .delete()
        .eq('id', acordoToDelete.id);

      if (error) throw error;

      setAcordos(prev => prev.filter(a => a.id !== acordoToDelete.id));
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

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'ativo': return 'bg-blue-100 text-blue-800';
      case 'cumprido': return 'bg-green-100 text-green-800';
      case 'quebrado': return 'bg-red-100 text-red-800';
      case 'cancelado': return 'bg-gray-100 text-gray-800';
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

  const filteredAcordos = acordos.filter(acordo =>
    acordo.cliente?.nome?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    acordo.cliente?.cpf_cnpj?.includes(searchTerm) ||
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
        <Button onClick={() => {
          refetchTitulos();
          setIsCreateModalOpen(true);
        }}>
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
            <CardTitle className="text-sm font-medium">Acordos Ativos</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">
              {acordos.filter(a => a.status === 'ativo').length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Acordos Cumpridos</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {acordos.filter(a => a.status === 'cumprido').length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Valor Total</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatCurrency(acordos.reduce((sum, a) => sum + a.valor_acordo, 0))}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Lista de Acordos</CardTitle>
          <CardDescription>Total de {filteredAcordos.length} acordos</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mb-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
              <Input
                placeholder="Buscar por cliente..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>

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
                      <Badge className={getStatusColor(acordo.status)}>
                        {acordo.status}
                      </Badge>
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

      {/* Modal Criar Acordo */}
      <Dialog open={isCreateModalOpen} onOpenChange={setIsCreateModalOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Novo Acordo</DialogTitle>
            <DialogDescription>
              Selecione os títulos e configure o acordo de pagamento
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <SelecionarTitulosAcordo
              clientes={clientesComDividas}
              clienteIdPreSelecionado={preSelectedData?.clienteId}
              onSelectionChange={handleSelectionChange}
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

                <Button variant="outline" onClick={visualizarCronograma} className="w-full">
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
            <Button variant="outline" onClick={() => setIsCreateModalOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleCreateAcordo} disabled={newAcordo.titulo_ids.length === 0}>
              Criar Acordo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal Detalhes */}
      <Dialog open={isDetailsModalOpen} onOpenChange={setIsDetailsModalOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Detalhes do Acordo</DialogTitle>
          </DialogHeader>
          {selectedAcordo && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-muted-foreground">Cliente</Label>
                  <p className="font-medium">{selectedAcordo.cliente?.nome}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Status</Label>
                  <div className="mt-1">
                    <Badge className={getStatusColor(selectedAcordo.status)}>
                      {selectedAcordo.status}
                    </Badge>
                  </div>
                </div>
                <div>
                  <Label className="text-muted-foreground">Valor Original</Label>
                  <p>{formatCurrency(selectedAcordo.valor_original)}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Valor do Acordo</Label>
                  <p className="font-medium">{formatCurrency(selectedAcordo.valor_acordo)}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Desconto</Label>
                  <p>{selectedAcordo.desconto.toFixed(1)}%</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Parcelas</Label>
                  <p>{selectedAcordo.parcelas}x de {formatCurrency(selectedAcordo.valor_parcela)}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Data do Acordo</Label>
                  <p>{formatDate(selectedAcordo.data_acordo)}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">1ª Parcela</Label>
                  <p>{formatDate(selectedAcordo.data_vencimento_primeira_parcela)}</p>
                </div>
              </div>
              {selectedAcordo.observacoes && (
                <div>
                  <Label className="text-muted-foreground">Observações</Label>
                  <p>{selectedAcordo.observacoes}</p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Modal Delete */}
      <Dialog open={isDeleteModalOpen} onOpenChange={setIsDeleteModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar Exclusão</DialogTitle>
            <DialogDescription>
              Tem certeza que deseja excluir este acordo? Esta ação não pode ser desfeita.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDeleteModalOpen(false)}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={handleDeleteAcordo}>
              Excluir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
