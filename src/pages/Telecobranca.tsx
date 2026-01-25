import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArrowLeft, Phone, FileText, Clock, Handshake } from 'lucide-react';
import { ClienteResumo } from '@/components/telecobranca/ClienteResumo';
import { TitulosCliente } from '@/components/telecobranca/TitulosCliente';
import { AcoesRapidas } from '@/components/telecobranca/AcoesRapidas';
import { EventoTimeline } from '@/components/telecobranca/EventoTimeline';
import { MetricasCliente } from '@/components/telecobranca/MetricasCliente';
import { RegistroEventoModal } from '@/components/telecobranca/RegistroEventoModal';
import { AgendamentoModal } from '@/components/telecobranca/AgendamentoModal';

interface Cliente {
  id: string;
  nome: string;
  cpf_cnpj: string;
  telefone?: string | null;
  email?: string | null;
  endereco_completo?: string | null;
  cidade?: string | null;
  estado?: string | null;
  status: string;
  observacoes?: string | null;
}

export default function Telecobranca() {
  const { clienteId } = useParams<{ clienteId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const [cliente, setCliente] = useState<Cliente | null>(null);
  const [loading, setLoading] = useState(true);
  const [isEventoModalOpen, setIsEventoModalOpen] = useState(false);
  const [isAgendamentoModalOpen, setIsAgendamentoModalOpen] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  useEffect(() => {
    if (clienteId) {
      fetchCliente();
    }
  }, [clienteId]);

  const fetchCliente = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('clientes')
        .select('*')
        .eq('id', clienteId)
        .single();

      if (error) throw error;
      setCliente(data);
    } catch (error) {
      console.error('Erro ao carregar cliente:', error);
      toast({
        title: "Erro",
        description: "Não foi possível carregar os dados do cliente",
        variant: "destructive",
      });
      navigate('/clientes');
    } finally {
      setLoading(false);
    }
  };

  const handleEventoSuccess = () => {
    setRefreshTrigger(prev => prev + 1);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'ativo': return 'bg-green-100 text-green-800';
      case 'inadimplente': return 'bg-red-100 text-red-800';
      case 'em_acordo': return 'bg-blue-100 text-blue-800';
      case 'quitado': return 'bg-gray-100 text-gray-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'ativo': return 'Ativo';
      case 'inadimplente': return 'Inadimplente';
      case 'em_acordo': return 'Em Acordo';
      case 'quitado': return 'Quitado';
      default: return status;
    }
  };

  const formatCpfCnpj = (value: string) => {
    const cleaned = value.replace(/\D/g, '');
    if (cleaned.length === 11) {
      return cleaned.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
    } else if (cleaned.length === 14) {
      return cleaned.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
    }
    return value;
  };

  const formatPhone = (phone?: string | null) => {
    if (!phone) return null;
    const cleaned = phone.replace(/\D/g, '');
    if (cleaned.length === 11) {
      return cleaned.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3');
    } else if (cleaned.length === 10) {
      return cleaned.replace(/(\d{2})(\d{4})(\d{4})/, '($1) $2-$3');
    }
    return phone;
  };

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(n => n[0])
      .slice(0, 2)
      .join('')
      .toUpperCase();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!cliente) {
    return (
      <div className="text-center py-8">
        <p className="text-muted-foreground">Cliente não encontrado</p>
        <Button variant="link" onClick={() => navigate('/clientes')}>
          Voltar para Clientes
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header Aprimorado */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          
          {/* Avatar com iniciais */}
          <div className="h-14 w-14 rounded-full bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center text-primary-foreground text-xl font-bold shadow-md">
            {getInitials(cliente.nome)}
          </div>
          
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl md:text-2xl font-bold">{cliente.nome}</h1>
              <Badge className={getStatusColor(cliente.status)}>
                {getStatusLabel(cliente.status)}
              </Badge>
            </div>
            <div className="flex items-center gap-4 text-sm text-muted-foreground flex-wrap">
              <span className="font-mono">{formatCpfCnpj(cliente.cpf_cnpj)}</span>
              {cliente.telefone && (
                <span className="flex items-center gap-1">
                  <Phone className="h-3 w-3" />
                  {formatPhone(cliente.telefone)}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Cards de Métricas */}
      <MetricasCliente clienteId={cliente.id} />

      {/* Layout Principal */}
      <div className="grid gap-6 lg:grid-cols-4">
        {/* Coluna Esquerda - Sticky Sidebar */}
        <div className="lg:sticky lg:top-6 space-y-4 lg:self-start order-2 lg:order-1">
          <AcoesRapidas 
            onNovoEvento={() => setIsEventoModalOpen(true)}
            onAgendarRetorno={() => setIsAgendamentoModalOpen(true)}
            telefone={cliente.telefone}
            email={cliente.email}
          />
          <ClienteResumo cliente={cliente} />
        </div>

        {/* Coluna Principal com Tabs */}
        <div className="lg:col-span-3 order-1 lg:order-2">
          <Tabs defaultValue="parcelas" className="w-full">
            <TabsList className="w-full justify-start mb-4 h-auto flex-wrap">
              <TabsTrigger value="parcelas" className="flex items-center gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                <FileText className="h-4 w-4" />
                <span className="hidden sm:inline">Parcelas</span>
              </TabsTrigger>
              <TabsTrigger value="historico" className="flex items-center gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                <Clock className="h-4 w-4" />
                <span className="hidden sm:inline">Histórico</span>
              </TabsTrigger>
              <TabsTrigger value="acordos" className="flex items-center gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                <Handshake className="h-4 w-4" />
                <span className="hidden sm:inline">Acordos</span>
              </TabsTrigger>
            </TabsList>
            
            <TabsContent value="parcelas" className="mt-0">
              <TitulosCliente clienteId={cliente.id} />
            </TabsContent>
            
            <TabsContent value="historico" className="mt-0">
              <EventoTimeline clienteId={cliente.id} refreshTrigger={refreshTrigger} />
            </TabsContent>
            
            <TabsContent value="acordos" className="mt-0">
              <AcordosCliente clienteId={cliente.id} />
            </TabsContent>
          </Tabs>
        </div>
      </div>

      {/* Modais */}
      <RegistroEventoModal
        isOpen={isEventoModalOpen}
        onClose={() => setIsEventoModalOpen(false)}
        clienteId={cliente.id}
        clienteNome={cliente.nome}
        onSuccess={handleEventoSuccess}
      />

      <AgendamentoModal
        isOpen={isAgendamentoModalOpen}
        onClose={() => setIsAgendamentoModalOpen(false)}
        clienteId={cliente.id}
        clienteNome={cliente.nome}
        onSuccess={handleEventoSuccess}
      />
    </div>
  );
}

// Componente interno para lista de acordos do cliente
function AcordosCliente({ clienteId }: { clienteId: string }) {
  const [acordos, setAcordos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    fetchAcordos();
  }, [clienteId]);

  const fetchAcordos = async () => {
    try {
      const { data, error } = await supabase
        .from('acordos')
        .select('*')
        .eq('cliente_id', clienteId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setAcordos(data || []);
    } catch (error) {
      console.error('Erro ao carregar acordos:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(value);
  };

  const getStatusBadge = (status: string) => {
    const configs: Record<string, { label: string; className: string }> = {
      ativo: { label: 'Ativo', className: 'bg-green-100 text-green-800' },
      quitado: { label: 'Quitado', className: 'bg-blue-100 text-blue-800' },
      cancelado: { label: 'Cancelado', className: 'bg-red-100 text-red-800' },
      inadimplente: { label: 'Inadimplente', className: 'bg-yellow-100 text-yellow-800' },
    };
    const config = configs[status] || { label: status, className: 'bg-gray-100 text-gray-800' };
    return <Badge className={config.className}>{config.label}</Badge>;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (acordos.length === 0) {
    return (
      <div className="text-center py-12 bg-muted/30 rounded-lg border border-dashed">
        <Handshake className="h-12 w-12 mx-auto mb-3 text-muted-foreground/50" />
        <p className="text-muted-foreground">Nenhum acordo encontrado</p>
        <Button 
          variant="link" 
          className="mt-2"
          onClick={() => navigate('/acordos')}
        >
          Criar novo acordo
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {acordos.map((acordo) => (
        <div
          key={acordo.id}
          className="p-4 border rounded-lg bg-card hover:shadow-md transition-shadow cursor-pointer"
          onClick={() => navigate(`/acordos?id=${acordo.id}`)}
        >
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Handshake className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium">Acordo #{acordo.id.slice(-6)}</span>
            </div>
            {getStatusBadge(acordo.status)}
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <p className="text-muted-foreground">Valor Original</p>
              <p className="font-medium">{formatCurrency(acordo.valor_original)}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Valor Acordo</p>
              <p className="font-medium text-primary">{formatCurrency(acordo.valor_acordo)}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Parcelas</p>
              <p className="font-medium">{acordo.parcelas}x de {formatCurrency(acordo.valor_parcela)}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Desconto</p>
              <p className="font-medium text-green-600">{acordo.desconto}%</p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
