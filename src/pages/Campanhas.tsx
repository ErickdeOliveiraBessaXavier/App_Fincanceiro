import { useState, useEffect } from 'react';
import { Plus, Search, Play, Pause, Eye, Edit, Trash2, Mail, MessageSquare, Phone } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import CampanhaForm from '@/components/campanhas/CampanhaForm';
import CampanhaDetails from '@/components/campanhas/CampanhaDetails';

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
  const [searchTerm, setSearchTerm] = useState('');
  
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

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'ativa': return 'bg-green-500 hover:bg-green-600';
      case 'pausada': return 'bg-yellow-500 hover:bg-yellow-600';
      case 'finalizada': return 'bg-muted text-muted-foreground';
      case 'rascunho': return 'bg-blue-500 hover:bg-blue-600';
      default: return 'bg-muted text-muted-foreground';
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

  const filteredCampanhas = campanhas.filter(campanha =>
    campanha.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
    campanha.canal.toLowerCase().includes(searchTerm.toLowerCase()) ||
    campanha.status.toLowerCase().includes(searchTerm.toLowerCase())
  );

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
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold">Campanhas</h1>
          <p className="text-muted-foreground">Gerencie suas campanhas de cobrança</p>
        </div>
        <Button onClick={handleNewCampanha}>
          <Plus className="h-4 w-4 mr-2" />
          Nova Campanha
        </Button>
      </div>

      <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total</CardTitle>
            <MessageSquare className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{campanhas.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Ativas</CardTitle>
            <Play className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-500">
              {campanhas.filter(c => c.status === 'ativa').length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pausadas</CardTitle>
            <Pause className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-500">
              {campanhas.filter(c => c.status === 'pausada').length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Rascunhos</CardTitle>
            <Edit className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-500">
              {campanhas.filter(c => c.status === 'rascunho').length}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Lista de Campanhas</CardTitle>
          <CardDescription>
            Campanhas de cobrança configuradas
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4 mb-6">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
              <Input
                placeholder="Buscar por nome, canal ou status..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>

          {filteredCampanhas.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <MessageSquare className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Nenhuma campanha encontrada</p>
              <Button variant="outline" className="mt-4" onClick={handleNewCampanha}>
                Criar primeira campanha
              </Button>
            </div>
          ) : (
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Canal</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="hidden md:table-cell">Mensagem</TableHead>
                    <TableHead className="hidden sm:table-cell">Criada em</TableHead>
                    <TableHead>Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredCampanhas.map((campanha) => (
                    <TableRow key={campanha.id}>
                      <TableCell className="font-medium">{campanha.nome}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {getCanalIcon(campanha.canal)}
                          <span className="capitalize hidden sm:inline">{campanha.canal}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge className={getStatusColor(campanha.status)}>
                          {campanha.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="max-w-xs truncate hidden md:table-cell">
                        {campanha.mensagem}
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">{formatDate(campanha.created_at)}</TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button 
                            variant="ghost" 
                            size="sm"
                            onClick={() => toggleCampanhaStatus(campanha.id, campanha.status)}
                            title={campanha.status === 'ativa' ? 'Pausar' : 'Ativar'}
                          >
                            {campanha.status === 'ativa' ? 
                              <Pause className="h-4 w-4" /> : 
                              <Play className="h-4 w-4" />
                            }
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="sm"
                            onClick={() => handleView(campanha)}
                            title="Visualizar"
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="sm"
                            onClick={() => handleEdit(campanha)}
                            title="Editar"
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="sm"
                            onClick={() => handleDeleteClick(campanha)}
                            title="Excluir"
                            className="text-destructive hover:text-destructive"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
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
