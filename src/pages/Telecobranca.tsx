import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Phone } from 'lucide-react';
import { ClienteResumo } from '@/components/telecobranca/ClienteResumo';
import { TitulosCliente } from '@/components/telecobranca/TitulosCliente';
import { AcoesRapidas } from '@/components/telecobranca/AcoesRapidas';
import { EventoTimeline } from '@/components/telecobranca/EventoTimeline';
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
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary/10 rounded-full">
            <Phone className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold">Telecobrança</h1>
            <p className="text-sm text-muted-foreground">{cliente.nome}</p>
          </div>
        </div>
      </div>

      {/* Layout Principal */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Coluna Esquerda - Dados do Cliente e Ações */}
        <div className="space-y-6">
          <ClienteResumo cliente={cliente} />
          <AcoesRapidas 
            onNovoEvento={() => setIsEventoModalOpen(true)}
            onAgendarRetorno={() => setIsAgendamentoModalOpen(true)}
            telefone={cliente.telefone}
            email={cliente.email}
          />
        </div>

        {/* Coluna Central e Direita - Títulos e Timeline */}
        <div className="lg:col-span-2 space-y-6">
          <TitulosCliente clienteId={cliente.id} />
          <EventoTimeline clienteId={cliente.id} refreshTrigger={refreshTrigger} />
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
