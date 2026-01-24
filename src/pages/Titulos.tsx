import React, { useState, useEffect } from 'react';
import { Plus, Search, Eye, Edit, Trash2, ChevronDown, ChevronRight } from 'lucide-react';
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
import { TituloConsolidado, Parcela, StatusUtils, FormatUtils, ParcelaUtils } from '@/utils/titulo';
import { StatusBadge } from '@/components/titulos/StatusBadge';
import { useAuth } from '@/contexts/AuthContext';

export default function Titulos() {
  const [titulos, setTitulos] = useState<TituloConsolidado[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
  const [selectedTitulo, setSelectedTitulo] = useState<TituloConsolidado | null>(null);
  const [parcelasTitulo, setParcelasTitulo] = useState<Parcela[]>([]);
  const [expandedTitulos, setExpandedTitulos] = useState<Set<string>>(new Set());
  const [clientes, setClientes] = useState<Array<{ id: string; nome: string; cpf_cnpj: string }>>([]);
  const { toast } = useToast();
  const { user } = useAuth();

  // Form state para novo título
  const [newTitulo, setNewTitulo] = useState({
    cliente_id: '',
    valor_original: 0,
    vencimento_original: new Date().toISOString().split('T')[0],
    descricao: '',
    numero_parcelas: 1,
    intervalo_dias: 30
  });

  useEffect(() => {
    fetchTitulos();
    fetchClientes();
  }, []);

  const fetchTitulos = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('vw_titulos_completos')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setTitulos((data || []) as TituloConsolidado[]);
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

  const fetchClientes = async () => {
    try {
      const { data, error } = await supabase
        .from('clientes')
        .select('id, nome, cpf_cnpj')
        .order('nome');

      if (error) throw error;
      setClientes(data || []);
    } catch (error) {
      console.error('Erro ao carregar clientes:', error);
    }
  };

  const fetchParcelasTitulo = async (tituloId: string) => {
    try {
      const { data, error } = await supabase
        .from('mv_parcelas_consolidadas')
        .select('*')
        .eq('titulo_id', tituloId)
        .order('numero_parcela');

      if (error) throw error;
      setParcelasTitulo((data || []) as Parcela[]);
    } catch (error) {
      console.error('Erro ao carregar parcelas:', error);
    }
  };

  const handleCreateTitulo = async () => {
    if (!newTitulo.cliente_id || !newTitulo.valor_original || !user) {
      toast({
        title: "Erro",
        description: "Preencha todos os campos obrigatórios",
        variant: "destructive",
      });
      return;
    }

    try {
      // Criar título
      const { data: tituloData, error: tituloError } = await supabase
        .from('titulos')
        .insert({
          cliente_id: newTitulo.cliente_id,
          valor_original: newTitulo.valor_original,
          vencimento_original: newTitulo.vencimento_original,
          descricao: newTitulo.descricao || null,
          created_by: user.id
        })
        .select()
        .single();

      if (tituloError) throw tituloError;

      // Criar parcelas
      const valorParcela = ParcelaUtils.calcularValor(newTitulo.valor_original, newTitulo.numero_parcelas);
      const datasVencimento = ParcelaUtils.calcularDatas(
        newTitulo.vencimento_original,
        newTitulo.numero_parcelas,
        newTitulo.intervalo_dias
      );

      const parcelasInsert = datasVencimento.map((data, index) => ({
        titulo_id: tituloData.id,
        numero_parcela: index + 1,
        valor_nominal: valorParcela,
        vencimento: data
      }));

      const { error: parcelasError } = await supabase
        .from('parcelas')
        .insert(parcelasInsert);

      if (parcelasError) throw parcelasError;

      // Refresh materialized view
      await supabase.rpc('refresh_mv_parcelas');

      toast({
        title: "Sucesso",
        description: "Título criado com sucesso",
      });

      setIsCreateModalOpen(false);
      setNewTitulo({
        cliente_id: '',
        valor_original: 0,
        vencimento_original: new Date().toISOString().split('T')[0],
        descricao: '',
        numero_parcelas: 1,
        intervalo_dias: 30
      });
      fetchTitulos();
    } catch (error) {
      console.error('Erro ao criar título:', error);
      toast({
        title: "Erro",
        description: "Não foi possível criar o título",
        variant: "destructive",
      });
    }
  };

  const toggleExpanded = (tituloId: string) => {
    setExpandedTitulos(prev => {
      const next = new Set(prev);
      if (next.has(tituloId)) {
        next.delete(tituloId);
      } else {
        next.add(tituloId);
        fetchParcelasTitulo(tituloId);
      }
      return next;
    });
  };

  const openDetails = async (titulo: TituloConsolidado) => {
    setSelectedTitulo(titulo);
    await fetchParcelasTitulo(titulo.id);
    setIsDetailsModalOpen(true);
  };

  // Filtrar títulos
  const filteredTitulos = titulos.filter(titulo =>
    (titulo.cliente_nome?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
    (titulo.cliente_cpf_cnpj || '').includes(searchTerm) ||
    (titulo.numero_documento || '').includes(searchTerm)
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
        <Button onClick={() => setIsCreateModalOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Novo Título
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Lista de Títulos</CardTitle>
          <CardDescription>
            Total de {filteredTitulos.length} títulos
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mb-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
              <Input
                placeholder="Buscar por cliente, CPF/CNPJ ou documento..."
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
                  <TableHead></TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead className="hidden md:table-cell">CPF/CNPJ</TableHead>
                  <TableHead>Valor</TableHead>
                  <TableHead className="hidden lg:table-cell">Parcelas</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredTitulos.map((titulo) => (
                  <React.Fragment key={titulo.id}>
                    <TableRow>
                      <TableCell>
                        {(titulo.quantidade_parcelas || 0) > 1 && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => toggleExpanded(titulo.id)}
                            className="h-6 w-6 p-0"
                          >
                            {expandedTitulos.has(titulo.id) ? (
                              <ChevronDown className="h-4 w-4" />
                            ) : (
                              <ChevronRight className="h-4 w-4" />
                            )}
                          </Button>
                        )}
                      </TableCell>
                      <TableCell>
                        <div>
                          <div className="font-medium">{titulo.cliente_nome}</div>
                          <div className="text-xs text-muted-foreground md:hidden">
                            {titulo.cliente_cpf_cnpj}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        {titulo.cliente_cpf_cnpj}
                      </TableCell>
                      <TableCell>
                        <div>
                          <div className="font-medium">{FormatUtils.currency(titulo.saldo_devedor || 0)}</div>
                          <div className="text-xs text-muted-foreground">
                            de {FormatUtils.currency(titulo.valor_original || 0)}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="hidden lg:table-cell">
                        <div className="text-sm">
                          {titulo.parcelas_pagas || 0}/{titulo.quantidade_parcelas || 1} pagas
                        </div>
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={titulo.status || 'ativo'} />
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openDetails(titulo)}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                    {/* Parcelas expandidas */}
                    {expandedTitulos.has(titulo.id) && parcelasTitulo
                      .filter(p => p.titulo_id === titulo.id)
                      .map((parcela) => (
                        <TableRow key={parcela.id} className="bg-muted/30">
                          <TableCell></TableCell>
                          <TableCell colSpan={2} className="pl-8">
                            <div className="flex items-center gap-2">
                              <span className="text-sm">↳ Parcela {parcela.numero_parcela}</span>
                              <Badge variant="outline" className="text-xs">
                                Venc: {FormatUtils.date(parcela.vencimento)}
                              </Badge>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="text-sm">
                              {FormatUtils.currency(parcela.saldo_atual || 0)}
                            </div>
                          </TableCell>
                          <TableCell className="hidden lg:table-cell">
                            {parcela.total_pago > 0 && (
                              <span className="text-xs text-green-600">
                                Pago: {FormatUtils.currency(parcela.total_pago)}
                              </span>
                            )}
                          </TableCell>
                          <TableCell>
                            <StatusBadge status={parcela.status || 'pendente'} />
                          </TableCell>
                          <TableCell></TableCell>
                        </TableRow>
                      ))}
                  </React.Fragment>
                ))}
                {filteredTitulos.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      Nenhum título encontrado
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Modal Criar Título */}
      <Dialog open={isCreateModalOpen} onOpenChange={setIsCreateModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Novo Título</DialogTitle>
            <DialogDescription>
              Crie um novo título de cobrança
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Cliente</Label>
              <select
                value={newTitulo.cliente_id}
                onChange={(e) => setNewTitulo(prev => ({ ...prev, cliente_id: e.target.value }))}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
              >
                <option value="">Selecione um cliente</option>
                {clientes.map(c => (
                  <option key={c.id} value={c.id}>{c.nome} - {c.cpf_cnpj}</option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label>Valor Total</Label>
              <Input
                type="number"
                step="0.01"
                value={newTitulo.valor_original}
                onChange={(e) => setNewTitulo(prev => ({ ...prev, valor_original: parseFloat(e.target.value) || 0 }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Data de Vencimento</Label>
              <Input
                type="date"
                value={newTitulo.vencimento_original}
                onChange={(e) => setNewTitulo(prev => ({ ...prev, vencimento_original: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Nº de Parcelas</Label>
                <Input
                  type="number"
                  min="1"
                  value={newTitulo.numero_parcelas}
                  onChange={(e) => setNewTitulo(prev => ({ ...prev, numero_parcelas: parseInt(e.target.value) || 1 }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Intervalo (dias)</Label>
                <Input
                  type="number"
                  min="1"
                  value={newTitulo.intervalo_dias}
                  onChange={(e) => setNewTitulo(prev => ({ ...prev, intervalo_dias: parseInt(e.target.value) || 30 }))}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Descrição (opcional)</Label>
              <Input
                value={newTitulo.descricao}
                onChange={(e) => setNewTitulo(prev => ({ ...prev, descricao: e.target.value }))}
              />
            </div>
            {newTitulo.numero_parcelas > 1 && newTitulo.valor_original > 0 && (
              <div className="p-3 bg-blue-50 rounded-lg text-sm">
                <p className="font-medium text-blue-800">Preview:</p>
                <p className="text-blue-700">
                  {newTitulo.numero_parcelas}x de {FormatUtils.currency(ParcelaUtils.calcularValor(newTitulo.valor_original, newTitulo.numero_parcelas))}
                </p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateModalOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleCreateTitulo}>
              Criar Título
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal Detalhes */}
      <Dialog open={isDetailsModalOpen} onOpenChange={setIsDetailsModalOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Detalhes do Título</DialogTitle>
          </DialogHeader>
          {selectedTitulo && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-muted-foreground">Cliente</Label>
                  <p className="font-medium">{selectedTitulo.cliente_nome}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">CPF/CNPJ</Label>
                  <p>{selectedTitulo.cliente_cpf_cnpj}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Valor Original</Label>
                  <p className="font-medium">{FormatUtils.currency(selectedTitulo.valor_original || 0)}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Saldo Devedor</Label>
                  <p className="font-medium text-red-600">{FormatUtils.currency(selectedTitulo.saldo_devedor || 0)}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Total Pago</Label>
                  <p className="font-medium text-green-600">{FormatUtils.currency(selectedTitulo.total_pago || 0)}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Status</Label>
                  <div className="mt-1">
                    <StatusBadge status={selectedTitulo.status || 'ativo'} />
                  </div>
                </div>
              </div>

              <div>
                <Label className="text-muted-foreground">Parcelas</Label>
                <div className="mt-2 space-y-2">
                  {parcelasTitulo.map((parcela) => (
                    <div key={parcela.id} className="flex justify-between items-center p-3 border rounded-lg">
                      <div>
                        <span className="font-medium">Parcela {parcela.numero_parcela}</span>
                        <span className="text-muted-foreground ml-2">
                          Venc: {FormatUtils.date(parcela.vencimento)}
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span>{FormatUtils.currency(parcela.saldo_atual || 0)}</span>
                        <StatusBadge status={parcela.status || 'pendente'} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
