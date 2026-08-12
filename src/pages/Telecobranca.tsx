import { useEffect, useState } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useUserRole } from '@/hooks/useUserRole';
import { Button } from '@/components/ui/button';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Link } from 'react-router-dom';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArrowLeft, Phone, FileText, Clock, Handshake } from 'lucide-react';
import { ClienteResumo } from '@/components/telecobranca/ClienteResumo';
import { TitulosCliente } from '@/components/telecobranca/TitulosCliente';
import { AcoesRapidas } from '@/components/telecobranca/AcoesRapidas';
import { EventoTimeline } from '@/components/telecobranca/EventoTimeline';
import { MetricasCliente } from '@/components/telecobranca/MetricasCliente';
import { AgendamentoModal } from '@/components/telecobranca/AgendamentoModal';
import { RegistrarContatoModal } from '@/components/telecobranca/RegistrarContatoModal';
import { StatusCobrancaAtual } from '@/components/telecobranca/StatusCobrancaAtual';
import { StatusBadge } from '@/components/StatusBadge';
import { CarregandoConteudo } from '@/components/TelaCarregamento';
import { formatCpfCnpj, formatTelefone } from '@/utils/format';
import { resumoNegociacao } from '@/domain/acordos/negociacao';
import { derivarStatusCliente } from '@/domain/clientes/situacao';
import { useBaseMetricasCliente } from '@/lib/queries/metricas';
import { codigoAcordo } from '@/domain/acordos/identificacao';
import { cn } from '@/lib/utils';

interface Cliente {
  id: string;
  nome: string;
  cpf_cnpj: string;
  telefone?: string | null;
  email?: string | null;
  endereco_completo?: string | null;
  cidade?: string | null;
  estado?: string | null;
  observacoes?: string | null;
}

/**
 * Situação do cliente derivada dos títulos, como na lista de Clientes.
 *
 * A ficha lia `clientes.status` — coluna que nascia 'ativo' e nunca mudava,
 * então cliente inadimplente aparecia aqui como "Ativo". React Query reaproveita
 * a consulta que os cards de métrica e a lista de títulos já fazem.
 */
function useSituacaoCliente(clienteId?: string) {
  const { data: base } = useBaseMetricasCliente(clienteId ?? null);
  return derivarStatusCliente((base?.titulos ?? []).map((t) => t.status));
}

export default function Telecobranca() {
  const { clienteId } = useParams<{ clienteId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  // Quem abriu a ficha manda a URL de origem (com filtros e página). Sem ela —
  // link direto, recarregar — o breadcrumb cai na lista limpa.
  const voltarPara = (location.state as { from?: string } | null)?.from ?? '/clientes';
  // Vendedor (e leitura) é read-only: escondemos as ações de escrita.
  const { isOperador } = useUserRole();

  const [cliente, setCliente] = useState<Cliente | null>(null);
  const [loading, setLoading] = useState(true);
  const [isContatoModalOpen, setIsContatoModalOpen] = useState(false);
  const [isAgendamentoModalOpen, setIsAgendamentoModalOpen] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const situacao = useSituacaoCliente(clienteId);

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

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(n => n[0])
      .slice(0, 2)
      .join('')
      .toUpperCase();
  };

  if (loading) return <CarregandoConteudo />;

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
      {/* Breadcrumbs: orienta e dá volta em 1 clique para a lista de clientes. */}
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link to={voltarPara}>Clientes</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{cliente.nome}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

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
              <StatusBadge domain="cliente" status={situacao} />
              <StatusCobrancaAtual clienteId={cliente.id} refreshTrigger={refreshTrigger} />
            </div>
            <div className="flex items-center gap-4 text-sm text-muted-foreground flex-wrap">
              <span className="font-mono">{formatCpfCnpj(cliente.cpf_cnpj)}</span>
              {cliente.telefone && (
                <span className="flex items-center gap-1">
                  <Phone className="h-3 w-3" />
                  {formatTelefone(cliente.telefone)}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Cards de Métricas */}
      <MetricasCliente clienteId={cliente.id} refreshTrigger={refreshTrigger} />

      {/* Sem ações de escrita (vendedor/leitura), a coluna lateral ficava com um
          card só e metade do espaço nobre vazia ao lado das abas de cobrança.
          Nesse caso os dados do cliente viram uma faixa de largura inteira. */}
      {!isOperador && <ClienteResumo cliente={cliente} />}

      {/* Layout Principal */}
      <div className={cn('grid gap-6', isOperador && 'lg:grid-cols-4')}>
        {isOperador && (
          <div className="lg:sticky lg:top-6 space-y-4 lg:self-start order-2 lg:order-1">
            <AcoesRapidas
              onRegistrarContato={() => setIsContatoModalOpen(true)}
              onAgendarRetorno={() => setIsAgendamentoModalOpen(true)}
              telefone={cliente.telefone}
              email={cliente.email}
            />
            <ClienteResumo cliente={cliente} />
          </div>
        )}

        {/* Coluna Principal com Tabs */}
        <div className={cn(isOperador && 'lg:col-span-3 order-1 lg:order-2')}>
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
      <RegistrarContatoModal
        aberto={isContatoModalOpen}
        onFechar={() => setIsContatoModalOpen(false)}
        clienteId={cliente.id}
        clienteNome={cliente.nome}
        onSucesso={handleEventoSuccess}
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

interface AcordoResumo {
  id: string;
  status: string;
  valor_original: number;
  valor_acordo: number;
  parcelas: number;
  valor_parcela: number;
  desconto: number;
}

// Diferença entre o débito e o valor fechado. Derivada dos valores gravados, e
// não da coluna `desconto`: ela é limitada a 0..100 e não representa acordo
// fechado acima do débito (juros/acréscimo).
function NegociacaoResumo({ valorOriginal, valorAcordo }: { valorOriginal: number; valorAcordo: number }) {
  const { tipo, percentual } = resumoNegociacao(valorOriginal, valorAcordo);
  const acrescimo = tipo === 'acrescimo';

  return (
    <div>
      <p className="text-muted-foreground">{acrescimo ? 'Acréscimo' : 'Desconto'}</p>
      <p className={cn('font-medium', acrescimo ? 'text-amber-600' : 'text-green-600')}>
        {percentual.toFixed(1)}%
      </p>
    </div>
  );
}

// Componente interno para lista de acordos do cliente
function AcordosCliente({ clienteId }: { clienteId: string }) {
  const [acordos, setAcordos] = useState<AcordoResumo[]>([]);
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
              <span className="font-medium">Acordo <span className="font-mono">{codigoAcordo(acordo.id)}</span></span>
            </div>
            <StatusBadge domain="acordo" status={acordo.status} />
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
            <NegociacaoResumo valorOriginal={acordo.valor_original} valorAcordo={acordo.valor_acordo} />
          </div>
        </div>
      ))}
    </div>
  );
}
