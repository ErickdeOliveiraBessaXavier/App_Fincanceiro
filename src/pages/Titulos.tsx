import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Eye, ChevronDown, ChevronRight, User, Trash2, MoreHorizontal, DollarSign, Percent, Tag, MessageSquare, Mail, Phone } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { GlobalFilter } from '@/components/GlobalFilter';
import { useGlobalFilter } from '@/hooks/useGlobalFilter';
import { titulosFilterConfig } from '@/constants/filterConfigs';
import { titulosPresets } from '@/constants/filterPresets';
import { createClienteAgrupadoFilterFunctions } from '@/utils/filterFunctions';
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
import { TituloConsolidado, Parcela, FormatUtils, ParcelaUtils } from '@/utils/titulo';
import { StatusBadge } from '@/components/titulos/StatusBadge';
import { RegistrarPagamentoModal } from '@/components/titulos/RegistrarPagamentoModal';
import { AplicarEncargoModal } from '@/components/titulos/AplicarEncargoModal';
import { ConcederDescontoModal } from '@/components/titulos/ConcederDescontoModal';
import { useAuth } from '@/contexts/AuthContext';

interface ClienteAgrupado {
  id: string;
  nome: string;
  cpf_cnpj: string;
  telefone: string | null;
  email: string | null;
  titulos: TituloConsolidado[];
  totalSaldo: number;
  totalOriginal: number;
  qtdTitulos: number;
  temInadimplente: boolean;
}

export default function Titulos() {
  const navigate = useNavigate();
  const [titulos, setTitulos] = useState<TituloConsolidado[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [selectedTitulo, setSelectedTitulo] = useState<TituloConsolidado | null>(null);
  const [tituloToDelete, setTituloToDelete] = useState<TituloConsolidado | null>(null);
  const [parcelasTitulo, setParcelasTitulo] = useState<Parcela[]>([]);
  const [expandedClientes, setExpandedClientes] = useState<Set<string>>(new Set());
  const [expandedTitulos, setExpandedTitulos] = useState<Set<string>>(new Set());
  const [clientes, setClientes] = useState<Array<{ id: string; nome: string; cpf_cnpj: string }>>([]);
  const { toast } = useToast();
  const { user } = useAuth();

  // Modal states for financial actions
  const [pagamentoModal, setPagamentoModal] = useState<{
    open: boolean;
    parcelaId: string;
    parcelaNumero: number;
    saldoAtual: number;
  }>({ open: false, parcelaId: '', parcelaNumero: 0, saldoAtual: 0 });

  const [encargoModal, setEncargoModal] = useState<{
    open: boolean;
    parcelaId: string;
    parcelaNumero: number;
    saldoAtual: number;
  }>({ open: false, parcelaId: '', parcelaNumero: 0, saldoAtual: 0 });

  const [descontoModal, setDescontoModal] = useState<{
    open: boolean;
    parcelaId: string;
    parcelaNumero: number;
    saldoAtual: number;
  }>({ open: false, parcelaId: '', parcelaNumero: 0, saldoAtual: 0 });

  // Form state para novo título
  const [newTitulo, setNewTitulo] = useState({
    cliente_id: '',
    valor_original: 0,
    vencimento_original: new Date().toISOString().split('T')[0],
    descricao: '',
    numero_documento: '',
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
      setParcelasTitulo(prev => {
        // Merge parcelas, replacing existing ones for this titulo
        const otherParcelas = prev.filter(p => p.titulo_id !== tituloId);
        return [...otherParcelas, ...(data || []) as Parcela[]];
      });
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
          numero_documento: newTitulo.numero_documento || null,
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
        numero_documento: '',
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

  const toggleClienteExpanded = (clienteId: string) => {
    setExpandedClientes(prev => {
      const next = new Set(prev);
      if (next.has(clienteId)) {
        next.delete(clienteId);
      } else {
        next.add(clienteId);
      }
      return next;
    });
  };

  const toggleTituloExpanded = (tituloId: string) => {
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

  const handleDeleteTitulo = async () => {
    if (!tituloToDelete) return;

    try {
      // Primeiro deletar eventos das parcelas
      const { data: parcelas } = await supabase
        .from('parcelas')
        .select('id')
        .eq('titulo_id', tituloToDelete.id);

      if (parcelas && parcelas.length > 0) {
        const parcelaIds = parcelas.map(p => p.id);
        await supabase
          .from('eventos_parcela')
          .delete()
          .in('parcela_id', parcelaIds);
      }

      // Deletar parcelas
      await supabase
        .from('parcelas')
        .delete()
        .eq('titulo_id', tituloToDelete.id);

      // Deletar título
      const { error } = await supabase
        .from('titulos')
        .delete()
        .eq('id', tituloToDelete.id);

      if (error) throw error;

      // Refresh materialized view
      await supabase.rpc('refresh_mv_parcelas');

      toast({
        title: "Sucesso",
        description: "Título excluído com sucesso",
      });

      setIsDeleteModalOpen(false);
      setTituloToDelete(null);
      fetchTitulos();
    } catch (error) {
      console.error('Erro ao excluir título:', error);
      toast({
        title: "Erro",
        description: "Não foi possível excluir o título",
        variant: "destructive",
      });
    }
  };

  // Agrupar títulos por cliente
  const clientesAgrupados = useMemo((): ClienteAgrupado[] => {
    const map = new Map<string, ClienteAgrupado>();
    
    for (const titulo of titulos) {
      const clienteId = titulo.cliente_id;
      if (!clienteId) continue;

      if (!map.has(clienteId)) {
        map.set(clienteId, {
          id: clienteId,
          nome: titulo.cliente_nome || '',
          cpf_cnpj: titulo.cliente_cpf_cnpj || '',
          telefone: titulo.cliente_telefone || null,
          email: titulo.cliente_email || null,
          titulos: [],
          totalSaldo: 0,
          totalOriginal: 0,
          qtdTitulos: 0,
          temInadimplente: false
        });
      }

      const cliente = map.get(clienteId)!;
      cliente.titulos.push(titulo);
      cliente.totalSaldo += titulo.saldo_devedor || 0;
      cliente.totalOriginal += titulo.valor_original || 0;
      cliente.qtdTitulos++;
      if (titulo.status === 'vencido') {
        cliente.temInadimplente = true;
      }
    }

    return Array.from(map.values()).sort((a, b) => b.totalSaldo - a.totalSaldo);
  }, [titulos]);

  // Filter functions for titulos
  const filterFunctions = useMemo(() => createClienteAgrupadoFilterFunctions(), []);

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
  } = useGlobalFilter(clientesAgrupados, filterFunctions);

  const totalTitulos = titulos.length;

  // Helper functions for actions
  const handleRefreshData = async () => {
    await supabase.rpc('refresh_mv_parcelas');
    await fetchTitulos();
    // Refresh parcelas for expanded titles
    for (const tituloId of expandedTitulos) {
      await fetchParcelasTitulo(tituloId);
    }
  };

  const openWhatsApp = (telefone: string | null, nome: string) => {
    if (!telefone) {
      toast({
        title: "Telefone não cadastrado",
        description: "Este cliente não possui telefone cadastrado",
        variant: "destructive",
      });
      return;
    }
    const numero = telefone.replace(/\D/g, '');
    const mensagem = encodeURIComponent(`Olá ${nome}, entramos em contato referente ao seu débito.`);
    window.open(`https://wa.me/55${numero}?text=${mensagem}`, '_blank');
  };

  const openEmail = (email: string | null, nome: string) => {
    if (!email) {
      toast({
        title: "E-mail não cadastrado",
        description: "Este cliente não possui e-mail cadastrado",
        variant: "destructive",
      });
      return;
    }
    const assunto = encodeURIComponent('Cobrança - Títulos em aberto');
    const corpo = encodeURIComponent(`Prezado(a) ${nome},\n\nEntramos em contato referente aos títulos em aberto.\n\nAtenciosamente.`);
    window.open(`mailto:${email}?subject=${assunto}&body=${corpo}`, '_blank');
  };

  const openPagamentoModal = (parcela: Parcela) => {
    setPagamentoModal({
      open: true,
      parcelaId: parcela.id,
      parcelaNumero: parcela.numero_parcela,
      saldoAtual: parcela.saldo_atual || 0
    });
  };

  const openEncargoModal = (parcela: Parcela) => {
    setEncargoModal({
      open: true,
      parcelaId: parcela.id,
      parcelaNumero: parcela.numero_parcela,
      saldoAtual: parcela.saldo_atual || 0
    });
  };

  const openDescontoModal = (parcela: Parcela) => {
    setDescontoModal({
      open: true,
      parcelaId: parcela.id,
      parcelaNumero: parcela.numero_parcela,
      saldoAtual: parcela.saldo_atual || 0
    });
  };

  // Get first pending parcela for a titulo
  const getFirstPendingParcela = (tituloId: string): Parcela | null => {
    const parcelas = parcelasTitulo.filter(p => p.titulo_id === tituloId && p.status !== 'pago');
    return parcelas.length > 0 ? parcelas[0] : null;
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
            {filteredClientes.length} clientes, {totalTitulos} títulos
          </CardDescription>
        </CardHeader>
        <CardContent>
          <GlobalFilter
            configs={titulosFilterConfig}
            filters={filters}
            onFilterChange={setFilter}
            onClearFilter={clearFilter}
            onClearAll={clearAllFilters}
            hasActiveFilters={hasActiveFilters}
            activeFiltersCount={activeFiltersCount}
            resultCount={resultCount}
            totalCount={totalCount}
            presets={titulosPresets}
            onPresetSelect={(preset) => setFilters(preset.filters)}
            collapsible={true}
            defaultOpen={false}
          />

          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10"></TableHead>
                  <TableHead>Cliente / Título</TableHead>
                  <TableHead className="hidden md:table-cell">CPF/CNPJ</TableHead>
                  <TableHead>Saldo</TableHead>
                  <TableHead className="hidden lg:table-cell">Títulos</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredClientes.map((cliente) => (
                  <React.Fragment key={cliente.id}>
                    {/* Linha do Cliente */}
                    <TableRow className="bg-muted/30 hover:bg-muted/50">
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => toggleClienteExpanded(cliente.id)}
                          className="h-6 w-6 p-0"
                        >
                          {expandedClientes.has(cliente.id) ? (
                            <ChevronDown className="h-4 w-4" />
                          ) : (
                            <ChevronRight className="h-4 w-4" />
                          )}
                        </Button>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <User className="h-4 w-4 text-muted-foreground" />
                          <div>
                            <div className="font-medium">{cliente.nome}</div>
                            <div className="text-xs text-muted-foreground md:hidden">
                              {cliente.cpf_cnpj}
                            </div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        {cliente.cpf_cnpj}
                      </TableCell>
                      <TableCell>
                        <div>
                          <div className="font-medium">{FormatUtils.currency(cliente.totalSaldo)}</div>
                          <div className="text-xs text-muted-foreground">
                            de {FormatUtils.currency(cliente.totalOriginal)}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="hidden lg:table-cell">
                        <Badge variant="outline">{cliente.qtdTitulos} título(s)</Badge>
                      </TableCell>
                      <TableCell>
                        {cliente.temInadimplente ? (
                          <StatusBadge status="inadimplente" />
                        ) : (
                          <StatusBadge status="ativo" />
                        )}
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuLabel>Ações do Cliente</DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => navigate(`/telecobranca?cliente=${cliente.id}`)}>
                              <Phone className="h-4 w-4 mr-2" />
                              Telecobrança
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => openWhatsApp(cliente.telefone, cliente.nome)}>
                              <MessageSquare className="h-4 w-4 mr-2" />
                              WhatsApp
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => openEmail(cliente.email, cliente.nome)}>
                              <Mail className="h-4 w-4 mr-2" />
                              E-mail
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>

                    {/* Títulos do Cliente (expandidos) */}
                    {expandedClientes.has(cliente.id) && cliente.titulos.map((titulo) => (
                      <React.Fragment key={titulo.id}>
                        <TableRow className="hover:bg-accent/50">
                          <TableCell className="pl-8">
                            {(titulo.quantidade_parcelas || 0) > 1 && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => toggleTituloExpanded(titulo.id)}
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
                            <div className="pl-4">
                              <div className="flex items-center gap-2">
                                {titulo.numero_documento && (
                                  <span className="font-mono text-xs text-muted-foreground">
                                    #{titulo.numero_documento}
                                  </span>
                                )}
                                <span className="text-sm">
                                  {titulo.descricao || 'Título'}
                                </span>
                              </div>
                              <div className="text-xs text-muted-foreground">
                                Venc: {FormatUtils.date(titulo.vencimento_original || '')}
                                {(titulo.quantidade_parcelas || 1) > 1 && (
                                  <span className="ml-2">
                                    ({titulo.parcelas_pagas || 0}/{titulo.quantidade_parcelas} parcelas pagas)
                                  </span>
                                )}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="hidden md:table-cell"></TableCell>
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
                              {titulo.parcelas_pagas || 0}/{titulo.quantidade_parcelas || 1}
                            </div>
                          </TableCell>
                          <TableCell>
                            <StatusBadge status={titulo.status || 'ativo'} />
                          </TableCell>
                          <TableCell>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuLabel>Ações do Título</DropdownMenuLabel>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onClick={() => openDetails(titulo)}>
                                  <Eye className="h-4 w-4 mr-2" />
                                  Ver Detalhes
                                </DropdownMenuItem>
                                {titulo.status !== 'pago' && (() => {
                                  // Fetch first pending parcela for this titulo
                                  const firstParcela = parcelasTitulo.find(p => p.titulo_id === titulo.id && p.status !== 'pago');
                                  if (!firstParcela) {
                                    // If we haven't loaded parcelas yet, expand the titulo first
                                    // Only show "Ver Parcelas" if titulo has more than 1 parcela
                                    if (!expandedTitulos.has(titulo.id) && (titulo.quantidade_parcelas || 1) > 1) {
                                      return (
                                        <DropdownMenuItem onClick={() => toggleTituloExpanded(titulo.id)}>
                                          <DollarSign className="h-4 w-4 mr-2" />
                                          Ver Parcelas
                                        </DropdownMenuItem>
                                      );
                                    }
                                    return null;
                                  }
                                  return (
                                    <>
                                      <DropdownMenuItem onClick={() => openPagamentoModal(firstParcela)}>
                                        <DollarSign className="h-4 w-4 mr-2" />
                                        Registrar Pagamento
                                      </DropdownMenuItem>
                                      <DropdownMenuItem onClick={() => openEncargoModal(firstParcela)}>
                                        <Percent className="h-4 w-4 mr-2" />
                                        Adicionar Encargo
                                      </DropdownMenuItem>
                                      <DropdownMenuItem onClick={() => openDescontoModal(firstParcela)}>
                                        <Tag className="h-4 w-4 mr-2" />
                                        Conceder Desconto
                                      </DropdownMenuItem>
                                    </>
                                  );
                                })()}
                                <DropdownMenuSeparator />
                                <DropdownMenuItem 
                                  className="text-destructive focus:text-destructive"
                                  onClick={() => {
                                    setTituloToDelete(titulo);
                                    setIsDeleteModalOpen(true);
                                  }}
                                >
                                  <Trash2 className="h-4 w-4 mr-2" />
                                  Excluir
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>

                        {/* Parcelas do Título (expandidas) */}
                        {expandedTitulos.has(titulo.id) && parcelasTitulo
                          .filter(p => p.titulo_id === titulo.id)
                          .map((parcela) => (
                            <TableRow key={parcela.id} className="bg-muted/20">
                              <TableCell></TableCell>
                              <TableCell className="pl-12">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm text-muted-foreground">↳</span>
                                  <span className="text-sm">Parcela {parcela.numero_parcela}</span>
                                  <Badge variant="outline" className="text-xs">
                                    Venc: {FormatUtils.date(parcela.vencimento)}
                                  </Badge>
                                </div>
                              </TableCell>
                              <TableCell className="hidden md:table-cell"></TableCell>
                              <TableCell>
                                <div className="text-sm">
                                  {FormatUtils.currency(parcela.saldo_atual || 0)}
                                </div>
                              </TableCell>
                              <TableCell className="hidden lg:table-cell">
                                {parcela.total_pago > 0 && (
                                  <span className="text-xs text-primary">
                                    Pago: {FormatUtils.currency(parcela.total_pago)}
                                  </span>
                                )}
                              </TableCell>
                              <TableCell>
                                <StatusBadge status={parcela.status || 'pendente'} />
                              </TableCell>
                              <TableCell>
                                {parcela.status !== 'pago' && (
                                  <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                                        <MoreHorizontal className="h-4 w-4" />
                                      </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end">
                                      <DropdownMenuLabel>Parcela {parcela.numero_parcela}</DropdownMenuLabel>
                                      <DropdownMenuSeparator />
                                      <DropdownMenuItem onClick={() => openPagamentoModal(parcela)}>
                                        <DollarSign className="h-4 w-4 mr-2" />
                                        Registrar Pagamento
                                      </DropdownMenuItem>
                                      <DropdownMenuItem onClick={() => openEncargoModal(parcela)}>
                                        <Percent className="h-4 w-4 mr-2" />
                                        Adicionar Encargo
                                      </DropdownMenuItem>
                                      <DropdownMenuItem onClick={() => openDescontoModal(parcela)}>
                                        <Tag className="h-4 w-4 mr-2" />
                                        Conceder Desconto
                                      </DropdownMenuItem>
                                    </DropdownMenuContent>
                                  </DropdownMenu>
                                )}
                              </TableCell>
                            </TableRow>
                          ))}
                      </React.Fragment>
                    ))}
                  </React.Fragment>
                ))}
                {filteredClientes.length === 0 && (
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
              <Label>Código do Documento</Label>
              <Input
                placeholder="Deixe vazio para gerar automático (TIT-00001)"
                value={newTitulo.numero_documento}
                onChange={(e) => setNewTitulo(prev => ({ ...prev, numero_documento: e.target.value }))}
              />
              <p className="text-xs text-muted-foreground">
                Se não informado, será gerado automaticamente (TIT-XXXXX)
              </p>
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
              <div className="p-3 bg-primary/10 rounded-lg text-sm">
                <p className="font-medium text-primary">Preview:</p>
                <p className="text-primary/80">
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
                  <p className="font-medium text-destructive">{FormatUtils.currency(selectedTitulo.saldo_devedor || 0)}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Total Pago</Label>
                  <p className="font-medium text-primary">{FormatUtils.currency(selectedTitulo.total_pago || 0)}</p>
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
                  {parcelasTitulo
                    .filter(p => p.titulo_id === selectedTitulo.id)
                    .map((parcela) => (
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

      {/* Modal Confirmar Exclusão */}
      <Dialog open={isDeleteModalOpen} onOpenChange={setIsDeleteModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar Exclusão</DialogTitle>
            <DialogDescription>
              Tem certeza que deseja excluir o título{' '}
              <span className="font-medium">{tituloToDelete?.numero_documento}</span>?
              Esta ação não pode ser desfeita.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDeleteModalOpen(false)}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={handleDeleteTitulo}>
              Excluir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modals de Ações Financeiras */}
      <RegistrarPagamentoModal
        open={pagamentoModal.open}
        onOpenChange={(open) => setPagamentoModal(prev => ({ ...prev, open }))}
        parcelaId={pagamentoModal.parcelaId}
        parcelaNumero={pagamentoModal.parcelaNumero}
        saldoAtual={pagamentoModal.saldoAtual}
        onSuccess={handleRefreshData}
      />

      <AplicarEncargoModal
        open={encargoModal.open}
        onOpenChange={(open) => setEncargoModal(prev => ({ ...prev, open }))}
        parcelaId={encargoModal.parcelaId}
        parcelaNumero={encargoModal.parcelaNumero}
        saldoAtual={encargoModal.saldoAtual}
        onSuccess={handleRefreshData}
      />

      <ConcederDescontoModal
        open={descontoModal.open}
        onOpenChange={(open) => setDescontoModal(prev => ({ ...prev, open }))}
        parcelaId={descontoModal.parcelaId}
        parcelaNumero={descontoModal.parcelaNumero}
        saldoAtual={descontoModal.saldoAtual}
        onSuccess={handleRefreshData}
      />
    </div>
  );
}
