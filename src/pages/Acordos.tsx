import { useState, useEffect } from 'react';
import { Plus, Search, Eye, Edit, FileText, Trash2 } from 'lucide-react';
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
  // Dados relacionados
  titulo: {
    id: string;
    valor: number;
    vencimento: string;
  };
  cliente: {
    id: string;
    nome: string;
    cpf_cnpj: string;
  };
}

interface NovoAcordo {
  titulo_id: string;
  cliente_id: string;
  valor_original: number;
  valor_acordo: number;
  parcelas: number;
  taxa_juros?: number; // Adicionar taxa de juros
  data_inicio: string; // Data de início do acordo
  data_vencimento_primeira_parcela: string;
  observacoes?: string;
}

// Nova interface para cronograma
interface CronogramaParcela {
  numero: number;
  valor: number;
  valor_juros: number;
  valor_total: number;
  data_vencimento: string;
  status: 'pendente' | 'paga' | 'vencida';
  data_pagamento?: string;
}

interface FormErrors {
  titulo_id?: string;
  valor_acordo?: string;
  parcelas?: string;
  data_vencimento_primeira_parcela?: string;
}

export default function Acordos() {
  const [acordos, setAcordos] = useState<Acordo[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [selectedAcordo, setSelectedAcordo] = useState<Acordo | null>(null);
  const [acordoToDelete, setAcordoToDelete] = useState<Acordo | null>(null);
  const [titulos, setTitulos] = useState<Array<{ 
    id: string; 
    valor: number; 
    vencimento: string;
    cliente: { 
      id: string;
      nome: string; 
      cpf_cnpj: string;
    }; 
  }>>([]);
  const [newAcordo, setNewAcordo] = useState<NovoAcordo>({
    titulo_id: '',
    cliente_id: '',
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

  useEffect(() => {
    fetchAcordos();
  }, []);

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
            valor,
            vencimento
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

  const fetchTitulos = async () => {
    try {
      const { data: rawData, error } = await supabase
        .from('titulos')
        .select(`
          id,
          valor,
          vencimento,
          cliente:clientes (
            id,
            nome,
            cpf_cnpj
          )
        `)
        .eq('status', 'em_aberto')
        .order('vencimento');

      if (error) throw error;

      // Type the data properly
      const typedData = (rawData as any[])?.map(item => ({
        id: item.id,
        valor: item.valor,
        vencimento: item.vencimento,
        cliente: {
          id: item.cliente.id,
          nome: item.cliente.nome,
          cpf_cnpj: item.cliente.cpf_cnpj
        }
      })) || [];

      setTitulos(typedData);
    } catch (error) {
      console.error('Erro ao carregar títulos:', error);
    }
  };

  const validateForm = () => {
    const errors: FormErrors = {};
    let isValid = true;

    if (!newAcordo.titulo_id) {
      errors.titulo_id = 'Título é obrigatório';
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
      
      const valorJuros = valorBase * taxaJuros * (i + 1); // Juros cumulativos
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

      // Criar o acordo (sem as parcelas separadas por enquanto)
      const { data: acordoData, error: acordoError } = await supabase
        .from('acordos')
        .insert([{
          titulo_id: newAcordo.titulo_id,
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

      // Por enquanto, não criamos parcelas separadas
      // TODO: Implementar após criar a tabela parcelas_acordo no Supabase
      
      // Atualizar status do título para 'acordo'
      await supabase
        .from('titulos')
        .update({ status: 'acordo' })
        .eq('id', newAcordo.titulo_id);

      toast({
        title: "Sucesso",
        description: "Acordo criado com sucesso",
      });
      setIsCreateModalOpen(false);
      setShowCronograma(false);
      setNewAcordo({
        titulo_id: '',
        cliente_id: '',
        valor_original: 0,
        valor_acordo: 0,
        parcelas: 1,
        taxa_juros: 0,
        data_inicio: new Date().toISOString().split('T')[0],
        data_vencimento_primeira_parcela: new Date().toISOString().split('T')[0],
        observacoes: ''
      });
      fetchAcordos();
    } catch (error) {
      console.error('Erro ao criar acordo:', error);
      toast({
        title: "Erro",
        description: "Não foi possível criar o acordo",
        variant: "destructive",
      });
    }
  };

  // Nova função para visualizar cronograma
  const visualizarCronograma = () => {
    const cronogramaCalculado = calcularCronograma();
    setCronograma(cronogramaCalculado);
    setShowCronograma(true);
  };

  const handleDeleteAcordo = async () => {
    if (!acordoToDelete) return;

    try {
      const { error } = await supabase
        .from('acordos')
        .delete()
        .eq('id', acordoToDelete.id);

      if (error) throw error;

      // Restore titulo status to 'em_aberto'
      await supabase
        .from('titulos')
        .update({ status: 'em_aberto' })
        .eq('id', acordoToDelete.titulo_id);

      setAcordos(prev => prev.filter(a => a.id !== acordoToDelete.id));
      setIsDeleteModalOpen(false);
      setAcordoToDelete(null);

      toast({
        title: "Sucesso",
        description: "Acordo excluído com sucesso",
      });
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
    acordo.cliente.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
    acordo.cliente.cpf_cnpj.includes(searchTerm) ||
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
          fetchTitulos();
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
                  <TableHead>Status</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead>Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredAcordos.map((acordo) => (
                  <TableRow key={acordo.id}>
                    <TableCell className="font-medium">{acordo.cliente.nome}</TableCell>
                    <TableCell>{acordo.cliente.cpf_cnpj}</TableCell>
                    <TableCell>{formatCurrency(acordo.valor_original)}</TableCell>
                    <TableCell>{formatCurrency(acordo.valor_acordo)}</TableCell>
                    <TableCell className="text-green-600 font-medium">
                      {acordo.desconto.toFixed(1)}%
                    </TableCell>
                    <TableCell>{acordo.parcelas}x de {formatCurrency(acordo.valor_parcela)}</TableCell>
                    <TableCell>
                      <Badge className={getStatusColor(acordo.status)}>
                        {acordo.status}
                      </Badge>
                    </TableCell>
                    <TableCell>{formatDate(acordo.data_acordo)}</TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button variant="ghost" size="sm"
                          onClick={() => {
                            setSelectedAcordo(acordo);
                            setIsDetailsModalOpen(true);
                          }}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="sm"
                          onClick={() => {
                            setAcordoToDelete(acordo);
                            setIsDeleteModalOpen(true);
                          }}
                        >
                          <Trash2 className="h-4 w-4 text-red-500" />
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

      {/* Create Modal - Updated */}
      <Dialog open={isCreateModalOpen} onOpenChange={setIsCreateModalOpen}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>Novo Acordo de Pagamento</DialogTitle>
            <DialogDescription>
              Crie um novo acordo de renegociação de dívida
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="titulo">Título</Label>
              <select
                id="titulo"
                value={newAcordo.titulo_id}
                onChange={(e) => {
                  const selectedTitulo = titulos.find(t => t.id === e.target.value);
                  setNewAcordo({
                    ...newAcordo,
                    titulo_id: e.target.value,
                    cliente_id: selectedTitulo?.cliente.id || '',
                    valor_original: selectedTitulo?.valor || 0
                  });
                }}
                className={`flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm ${formErrors.titulo_id ? 'border-red-500' : ''}`}
              >
                <option value="">Selecione um título</option>
                {titulos.map((titulo) => (
                  <option key={titulo.id} value={titulo.id}>
                    {titulo.cliente.nome} - {formatCurrency(titulo.valor)} - Venc: {formatDate(titulo.vencimento)}
                  </option>
                ))}
              </select>
              {formErrors.titulo_id && (
                <span className="text-xs text-red-500">{formErrors.titulo_id}</span>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Valor Original</Label>
                <Input
                  type="number"
                  value={newAcordo.valor_original}
                  disabled
                  className="bg-muted"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="valor-acordo">Valor do Acordo</Label>
                <Input
                  id="valor-acordo"
                  type="number"
                  step="0.01"
                  min="0"
                  value={newAcordo.valor_acordo}
                  onChange={(e) => setNewAcordo({ ...newAcordo, valor_acordo: parseFloat(e.target.value) || 0 })}
                  className={formErrors.valor_acordo ? "border-red-500" : ""}
                />
                {formErrors.valor_acordo && (
                  <span className="text-xs text-red-500">{formErrors.valor_acordo}</span>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="parcelas">Parcelas</Label>
                <Input
                  id="parcelas"
                  type="number"
                  min="1"
                  value={newAcordo.parcelas}
                  onChange={(e) => setNewAcordo({ ...newAcordo, parcelas: parseInt(e.target.value) || 1 })}
                  className={formErrors.parcelas ? "border-red-500" : ""}
                />
                {formErrors.parcelas && (
                  <span className="text-xs text-red-500">{formErrors.parcelas}</span>
                )}
              </div>
              <div className="grid gap-2">
                <Label>Valor da Parcela</Label>
                <Input
                  type="text"
                  value={formatCurrency(newAcordo.valor_acordo / newAcordo.parcelas)}
                  disabled
                  className="bg-muted"
                />
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="vencimento">Data Vencimento 1ª Parcela</Label>
              <Input
                id="vencimento"
                type="date"
                value={newAcordo.data_vencimento_primeira_parcela}
                onChange={(e) => setNewAcordo({ ...newAcordo, data_vencimento_primeira_parcela: e.target.value })}
                className={formErrors.data_vencimento_primeira_parcela ? "border-red-500" : ""}
              />
              {formErrors.data_vencimento_primeira_parcela && (
                <span className="text-xs text-red-500">{formErrors.data_vencimento_primeira_parcela}</span>
              )}
            </div>

            <div className="grid gap-2">
              <Label htmlFor="observacoes">Observações</Label>
              <Input
                id="observacoes"
                value={newAcordo.observacoes}
                onChange={(e) => setNewAcordo({ ...newAcordo, observacoes: e.target.value })}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="data-inicio">Data de Início</Label>
                <Input
                  id="data-inicio"
                  type="date"
                  value={newAcordo.data_inicio || new Date().toISOString().split('T')[0]}
                  onChange={(e) => setNewAcordo({ ...newAcordo, data_inicio: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="taxa-juros">Taxa de Juros (%)</Label>
                <Input
                  id="taxa-juros"
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  value={newAcordo.taxa_juros || 0}
                  onChange={(e) => setNewAcordo({ ...newAcordo, taxa_juros: parseFloat(e.target.value) || 0 })}
                />
              </div>
            </div>

            <div className="flex gap-2">
              <Button 
                type="button" 
                variant="outline" 
                onClick={visualizarCronograma}
                disabled={!newAcordo.valor_acordo || !newAcordo.parcelas || !newAcordo.data_vencimento_primeira_parcela}
              >
                Visualizar Cronograma
              </Button>
            </div>

            {/* Cronograma Preview */}
            {showCronograma && cronograma.length > 0 && (
              <div className="border rounded-lg p-4 max-h-60 overflow-y-auto">
                <h4 className="font-medium mb-3">Cronograma de Pagamentos</h4>
                <div className="space-y-2">
                  {cronograma.map((parcela) => (
                    <div key={parcela.numero} className="flex justify-between text-sm">
                      <span>Parcela {parcela.numero}</span>
                      <span>{formatDate(parcela.data_vencimento)}</span>
                      <span className="font-medium">{formatCurrency(parcela.valor_total)}</span>
                    </div>
                  ))}
                  <div className="border-t pt-2 flex justify-between font-medium">
                    <span>Total Geral:</span>
                    <span>{formatCurrency(cronograma.reduce((sum, p) => sum + p.valor_total, 0))}</span>
                  </div>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button onClick={handleCreateAcordo}>Criar Acordo</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Details Modal */}
      <Dialog open={isDetailsModalOpen} onOpenChange={setIsDetailsModalOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Detalhes do Acordo</DialogTitle>
          </DialogHeader>
          {selectedAcordo && (
            <div className="space-y-4">
              <div>
                <Label className="text-sm font-medium">Cliente</Label>
                <p className="text-sm">{selectedAcordo.cliente.nome}</p>
                <p className="text-xs text-muted-foreground">{selectedAcordo.cliente.cpf_cnpj}</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-sm font-medium">Valor Original</Label>
                  <p className="text-sm">{formatCurrency(selectedAcordo.valor_original)}</p>
                </div>
                <div>
                  <Label className="text-sm font-medium">Valor do Acordo</Label>
                  <p className="text-sm">{formatCurrency(selectedAcordo.valor_acordo)}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-sm font-medium">Desconto</Label>
                  <p className="text-sm text-green-600 font-medium">{selectedAcordo.desconto.toFixed(1)}%</p>
                </div>
                <div>
                  <Label className="text-sm font-medium">Status</Label>
                  <Badge className={getStatusColor(selectedAcordo.status)}>
                    {selectedAcordo.status}
                  </Badge>
                </div>
              </div>

              <div>
                <Label className="text-sm font-medium">Parcelamento</Label>
                <p className="text-sm">{selectedAcordo.parcelas}x de {formatCurrency(selectedAcordo.valor_parcela)}</p>
              </div>

              {selectedAcordo.observacoes && (
                <div>
                  <Label className="text-sm font-medium">Observações</Label>
                  <p className="text-sm text-muted-foreground">{selectedAcordo.observacoes}</p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Modal */}
      <Dialog open={isDeleteModalOpen} onOpenChange={setIsDeleteModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar Exclusão</DialogTitle>
            <DialogDescription>
              Tem certeza que deseja excluir este acordo? Esta ação não pode ser desfeita.
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
              onClick={handleDeleteAcordo}
            >
              Excluir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}