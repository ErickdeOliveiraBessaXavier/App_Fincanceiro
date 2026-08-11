import { useState, useEffect, useMemo } from 'react';
import { PageHeader } from '@/components/PageHeader';
import { CarregandoConteudo } from '@/components/TelaCarregamento';
import { Plus, Play, Pause, Eye, Edit, Trash2, Mail, MessageSquare, Phone, Send } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/StatusBadge';
import { ResumoNumeros } from '@/components/ResumoNumeros';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import CampanhaForm from '@/components/campanhas/CampanhaForm';
import CampanhaDetails from '@/components/campanhas/CampanhaDetails';
import { GlobalFilter } from '@/components/GlobalFilter';
import { useGlobalFilter } from '@/hooks/useGlobalFilter';
import { usePagination, PARAM_PAGINA } from '@/hooks/usePagination';
import { TablePagination } from '@/components/TablePagination';
import { campanhasFilterConfig } from '@/constants/filterConfigs';
import { campanhasPresets } from '@/constants/filterPresets';
import { createCampanhasFilterFunctions } from '@/utils/filterFunctions';
import { useUserRole } from '@/hooks/useUserRole';
import { IntegracaoWhatsApp } from '@/components/campanhas/IntegracaoWhatsApp';
import { useIntegracaoWhatsApp, useDispararCampanha } from '@/lib/queries/integracoes';

interface Campanha {
  id: string;
  nome: string;
  canal: string;
  mensagem: string;
  status: string;
  filtros?: any;
  created_at: string;
  updated_at: string;
}

/**
 * Disparo de campanha + situação do canal.
 *
 * Fora do componente da página para ele não acumular a lógica de envio junto da
 * de listagem — o limite de complexidade do projeto é por função.
 */
function useDisparoCampanha() {
  const { data: integracao } = useIntegracaoWhatsApp();
  const mutation = useDispararCampanha();

  // Sem canal conectado o disparo nem aparece habilitado: o botão explica o
  // que falta em vez de falhar depois do clique.
  const canalPronto = !!integracao?.ativo && !!integracao.instance_id && integracao.token_configurado;

  const disparar = async (campanhaId: string) => {
    try {
      const r = await mutation.mutateAsync(campanhaId);
      toast.success(`Campanha disparada: ${r.enviados} enviados, ${r.falhas} falhas.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Não foi possível disparar a campanha');
    }
  };

  return { canalPronto, disparando: mutation.isPending, disparar };
}

export default function Campanhas() {
  const [campanhas, setCampanhas] = useState<Campanha[]>([]);
  const [loading, setLoading] = useState(true);
  // Vendedor (e leitura) é read-only: escondemos as ações de escrita.
  const { isOperador, isAdmin } = useUserRole();
  const { canalPronto, disparando, disparar } = useDisparoCampanha();
  
  // Modais
  const [formOpen, setFormOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [selectedCampanha, setSelectedCampanha] = useState<Campanha | null>(null);

  useEffect(() => {
    fetchCampanhas();
  }, []);

  const fetchCampanhas = async () => {
    try {
      const { data, error } = await supabase
        .from('campanhas')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setCampanhas(data || []);
    } catch (error) {
      console.error('Erro ao carregar campanhas:', error);
      toast.error('Não foi possível carregar as campanhas');
    } finally {
      setLoading(false);
    }
  };

  const getCanalIcon = (canal: string) => {
    switch (canal) {
      case 'email': return <Mail className="h-4 w-4" />;
      case 'sms': return <Phone className="h-4 w-4" />;
      case 'whatsapp': return <MessageSquare className="h-4 w-4" />;
      default: return <Mail className="h-4 w-4" />;
    }
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('pt-BR');
  };

  // Filter functions for campanhas
  const filterFunctions = useMemo(() => createCampanhasFilterFunctions(), []);

  const {
    filteredData: filteredCampanhas,
    filters,
    setFilter,
    setFilters,
    clearFilter,
    clearAllFilters,
    hasActiveFilters,
    activeFiltersCount,
    resultCount,
    totalCount
  } = useGlobalFilter(campanhas, filterFunctions);

  const pagination = usePagination(filteredCampanhas, 25, JSON.stringify(filters), PARAM_PAGINA);

  const toggleCampanhaStatus = async (id: string, currentStatus: string) => {
    try {
      const newStatus = currentStatus === 'ativa' ? 'pausada' : 'ativa';
      
      const { error } = await supabase
        .from('campanhas')
        .update({ status: newStatus })
        .eq('id', id);

      if (error) throw error;

      setCampanhas(prev => prev.map(campanha => 
        campanha.id === id ? { ...campanha, status: newStatus } : campanha
      ));

      toast.success(`Campanha ${newStatus === 'ativa' ? 'ativada' : 'pausada'} com sucesso`);
    } catch (error) {
      console.error('Erro ao alterar status da campanha:', error);
      toast.error('Não foi possível alterar o status da campanha');
    }
  };

  const handleEdit = (campanha: Campanha) => {
    setSelectedCampanha(campanha);
    setFormOpen(true);
  };

  const handleView = (campanha: Campanha) => {
    setSelectedCampanha(campanha);
    setDetailsOpen(true);
  };

  const handleDeleteClick = (campanha: Campanha) => {
    setSelectedCampanha(campanha);
    setDeleteOpen(true);
  };

  const handleDelete = async () => {
    if (!selectedCampanha) return;

    try {
      const { error } = await supabase
        .from('campanhas')
        .delete()
        .eq('id', selectedCampanha.id);

      if (error) throw error;

      setCampanhas(prev => prev.filter(c => c.id !== selectedCampanha.id));
      toast.success('Campanha excluída com sucesso');
    } catch (error: any) {
      console.error('Erro ao excluir campanha:', error);
      toast.error(error.message || 'Não foi possível excluir a campanha');
    } finally {
      setDeleteOpen(false);
      setSelectedCampanha(null);
    }
  };

  const handleNewCampanha = () => {
    setSelectedCampanha(null);
    setFormOpen(true);
  };

  if (loading) {
    return <CarregandoConteudo />;
  }

  return (
    <div className="space-y-10 animate-fade-in pb-10">
      <PageHeader
        title="Campanhas"
        description="Gestão de réguas de cobrança e comunicações automáticas."
      >
        {isOperador && (
          <Button onClick={handleNewCampanha}>
            <Plus className="h-4 w-4 mr-2" />
            Nova Campanha
          </Button>
        )}
      </PageHeader>

      <ResumoNumeros
        itens={[
          { rotulo: 'Total', valor: campanhas.length, icone: MessageSquare },
          { rotulo: 'Ativas', valor: campanhas.filter(c => c.status === 'ativa').length, icone: Play, cor: 'text-success' },
          { rotulo: 'Pausadas', valor: campanhas.filter(c => c.status === 'pausada').length, icone: Pause, cor: 'text-warning' },
          { rotulo: 'Rascunhos', valor: campanhas.filter(c => c.status === 'rascunho').length, icone: Edit, cor: 'text-blue-500' },
        ]}
      />

      {isAdmin && <IntegracaoWhatsApp />}

      <Card className="border-none shadow-card rounded-2xl overflow-hidden">
        <CardHeader className="pb-4 border-b border-border/50 bg-muted/20">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-xl font-bold tracking-tight">Lista de Campanhas</CardTitle>
              <CardDescription className="text-xs font-medium">
                Campanhas de cobrança configuradas no sistema
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-6">
          <GlobalFilter
            configs={campanhasFilterConfig}
            filters={filters}
            onFilterChange={setFilter}
            onClearFilter={clearFilter}
            onClearAll={clearAllFilters}
            hasActiveFilters={hasActiveFilters}
            activeFiltersCount={activeFiltersCount}
            resultCount={resultCount}
            totalCount={totalCount}
            presets={campanhasPresets}
            onPresetSelect={(preset) => setFilters(preset.filters)}
            collapsible={true}
            defaultOpen={false}
          />

          {filteredCampanhas.length === 0 ? (
            <div className="text-center py-20 bg-muted/5 rounded-xl border border-dashed border-border/60">
              <div className="h-16 w-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
                <MessageSquare className="h-8 w-8 text-muted-foreground/40" />
              </div>
              <p className="text-sm font-bold text-muted-foreground uppercase tracking-widest">Nenhuma campanha encontrada</p>
              {isOperador && (
                <Button variant="outline" className="mt-4 rounded-xl font-bold" onClick={handleNewCampanha}>
                  Criar primeira campanha
                </Button>
              )}
            </div>
          ) : (
            <div className="rounded-xl border border-border/50 overflow-hidden">
              <Table>
                <TableHeader className="bg-muted/30">
                  <TableRow>
                    <TableHead className="text-[10px] font-bold uppercase tracking-widest">Nome</TableHead>
                    <TableHead className="text-[10px] font-bold uppercase tracking-widest">Canal</TableHead>
                    <TableHead className="text-[10px] font-bold uppercase tracking-widest">Status</TableHead>
                    <TableHead className="hidden md:table-cell text-[10px] font-bold uppercase tracking-widest">Mensagem</TableHead>
                    <TableHead className="hidden sm:table-cell text-[10px] font-bold uppercase tracking-widest">Criada em</TableHead>
                    <TableHead className="text-[10px] font-bold uppercase tracking-widest text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pagination.pageItems.map((campanha) => (
                    <TableRow key={campanha.id} className="hover:bg-muted/10 transition-colors">
                      <TableCell className="font-bold text-sm text-foreground">{campanha.nome}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className="h-7 w-7 rounded-lg bg-muted flex items-center justify-center">
                            {getCanalIcon(campanha.canal)}
                          </div>
                          <span className="capitalize text-xs font-medium text-muted-foreground hidden sm:inline">{campanha.canal}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <StatusBadge domain="campanha" status={campanha.status} />
                      </TableCell>
                      <TableCell className="max-w-xs truncate hidden md:table-cell text-xs font-medium text-muted-foreground">
                        {campanha.mensagem}
                      </TableCell>
                      <TableCell className="hidden sm:table-cell text-xs font-medium text-muted-foreground">{formatDate(campanha.created_at)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          {isOperador && campanha.canal === 'whatsapp' && campanha.status === 'ativa' && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => disparar(campanha.id)}
                              disabled={!canalPronto || disparando}
                              title={canalPronto ? 'Disparar campanha' : 'Conecte o canal de WhatsApp para disparar'}
                              className="h-8 w-8 p-0 rounded-lg hover:bg-primary/5"
                            >
                              <Send className="h-4 w-4" />
                            </Button>
                          )}
                          {isOperador && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => toggleCampanhaStatus(campanha.id, campanha.status)}
                              title={campanha.status === 'ativa' ? 'Pausar' : 'Ativar'}
                              className="h-8 w-8 p-0 rounded-lg hover:bg-primary/5"
                            >
                              {campanha.status === 'ativa' ?
                                <Pause className="h-4 w-4" /> :
                                <Play className="h-4 w-4" />
                              }
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleView(campanha)}
                            title="Visualizar"
                            className="h-8 w-8 p-0 rounded-lg hover:bg-primary/5"
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          {isOperador && (
                            <>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleEdit(campanha)}
                                title="Editar"
                                className="h-8 w-8 p-0 rounded-lg hover:bg-primary/5"
                              >
                                <Edit className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleDeleteClick(campanha)}
                                title="Excluir"
                                className="h-8 w-8 p-0 rounded-lg text-destructive hover:text-destructive hover:bg-destructive/5"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          <TablePagination pagination={pagination} />
        </CardContent>
      </Card>

      {/* Modal de Criação/Edição */}
      <CampanhaForm 
        open={formOpen}
        onOpenChange={setFormOpen}
        campanha={selectedCampanha}
        onSuccess={fetchCampanhas}
      />

      {/* Modal de Detalhes */}
      <CampanhaDetails
        open={detailsOpen}
        onOpenChange={setDetailsOpen}
        campanha={selectedCampanha}
      />

      {/* Dialog de Confirmação de Exclusão */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir a campanha "{selectedCampanha?.nome}"? 
              Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive hover:bg-destructive/90">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
