import { useState, useEffect, useMemo } from 'react';
import { PageHeader } from '@/components/PageHeader';
import { Plus, Play, Pause, Eye, Edit, Trash2, Mail, MessageSquare, Phone } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/StatusBadge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import CampanhaForm from '@/components/campanhas/CampanhaForm';
import CampanhaDetails from '@/components/campanhas/CampanhaDetails';
import { GlobalFilter } from '@/components/GlobalFilter';
import { useGlobalFilter } from '@/hooks/useGlobalFilter';
import { campanhasFilterConfig } from '@/constants/filterConfigs';
import { campanhasPresets } from '@/constants/filterPresets';
import { createCampanhasFilterFunctions } from '@/utils/filterFunctions';
import { useUserRole } from '@/hooks/useUserRole';

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

export default function Campanhas() {
  const [campanhas, setCampanhas] = useState<Campanha[]>([]);
  const [loading, setLoading] = useState(true);
  // Vendedor (e leitura) é read-only: escondemos as ações de escrita.
  const { isOperador } = useUserRole();
  
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
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
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

      <div className="grid gap-6 grid-cols-2 md:grid-cols-4">
        <Card className="border-none shadow-card rounded-2xl overflow-hidden group">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Total</CardTitle>
            <MessageSquare className="h-4 w-4 text-muted-foreground group-hover:scale-110 transition-transform" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-black tracking-tighter">{campanhas.length}</div>
          </CardContent>
        </Card>
        <Card className="border-none shadow-card rounded-2xl overflow-hidden group">
          <div className="absolute inset-0 bg-gradient-to-br from-success/5 to-transparent pointer-events-none" />
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 relative z-10">
            <CardTitle className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Ativas</CardTitle>
            <Play className="h-4 w-4 text-success group-hover:scale-110 transition-transform" />
          </CardHeader>
          <CardContent className="relative z-10">
            <div className="text-2xl font-black tracking-tighter text-success">
              {campanhas.filter(c => c.status === 'ativa').length}
            </div>
          </CardContent>
        </Card>
        <Card className="border-none shadow-card rounded-2xl overflow-hidden group">
          <div className="absolute inset-0 bg-gradient-to-br from-warning/5 to-transparent pointer-events-none" />
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 relative z-10">
            <CardTitle className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Pausadas</CardTitle>
            <Pause className="h-4 w-4 text-warning group-hover:scale-110 transition-transform" />
          </CardHeader>
          <CardContent className="relative z-10">
            <div className="text-2xl font-black tracking-tighter text-warning">
              {campanhas.filter(c => c.status === 'pausada').length}
            </div>
          </CardContent>
        </Card>
        <Card className="border-none shadow-card rounded-2xl overflow-hidden group">
          <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-transparent pointer-events-none" />
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 relative z-10">
            <CardTitle className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Rascunhos</CardTitle>
            <Edit className="h-4 w-4 text-blue-500 group-hover:scale-110 transition-transform" />
          </CardHeader>
          <CardContent className="relative z-10">
            <div className="text-2xl font-black tracking-tighter text-blue-500">
              {campanhas.filter(c => c.status === 'rascunho').length}
            </div>
          </CardContent>
        </Card>
      </div>

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
                  {filteredCampanhas.map((campanha) => (
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
