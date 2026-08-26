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
import { ArrowLeft, ChevronDown, ChevronLeft, ChevronRight, ExternalLink, Phone, FileText, Clock, Handshake } from 'lucide-react';
import { ClienteResumo } from '@/components/telecobranca/ClienteResumo';
import { TitulosCliente } from '@/components/telecobranca/TitulosCliente';
import { AcoesRapidas } from '@/components/telecobranca/AcoesRapidas';
import { EventoTimeline } from '@/components/telecobranca/EventoTimeline';
import { AgendamentoModal } from '@/components/telecobranca/AgendamentoModal';
import { RegistrarContatoModal } from '@/components/telecobranca/RegistrarContatoModal';
import { PainelLateralFicha } from '@/components/telecobranca/PainelLateralFicha';
import { NovoAcordoDialog } from '@/components/acordos/NovoAcordoDialog';
import { StatusCobrancaAtual } from '@/components/telecobranca/StatusCobrancaAtual';
import { StatusBadge } from '@/components/StatusBadge';
import { CarregandoConteudo } from '@/components/TelaCarregamento';
import { formatCpfCnpj, formatData, formatTelefone } from '@/utils/format';
import { resumoNegociacao } from '@/domain/acordos/negociacao';
import { derivarStatusCliente } from '@/domain/clientes/situacao';
import { useBaseMetricasCliente } from '@/lib/queries/metricas';
import { codigoAcordo } from '@/domain/acordos/identificacao';
import { useFilaNavegacao } from '@/hooks/useFilaNavegacao';
import { usePaginaAlturaFixa } from '@/hooks/usePaginaAlturaFixa';
import { useInvalidarEventos } from '@/lib/queries/eventos';
import { cn } from '@/lib/utils';
import { Rotulo } from '@/components/Rotulo';
import { Card } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useParcelasAcordo } from '@/lib/queries/acordos';
import { ProximoRetorno } from '@/components/telecobranca/ProximoRetorno';

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
  return derivarStatusCliente(base?.titulos ?? []);
}

/**
 * Nome da tela na aba do navegador, restaurado ao sair.
 *
 * Com várias abas abertas, a ficha só era reconhecível abrindo uma por uma —
 * todas mostravam o mesmo título do app.
 */
function useTituloDaAba(cliente: Cliente | null) {
  const nome = cliente?.nome;
  useEffect(() => {
    if (!nome) return;
    const anterior = document.title;
    document.title = `Ficha do Cliente · ${nome}`;
    return () => { document.title = anterior; };
  }, [nome]);
}

/**
 * Anterior/Próximo da fila. Some quando a ficha foi aberta fora de uma lista
 * (link direto, favorito): sem a ordem de origem não há "próximo" que faça
 * sentido para o operador.
 */
function NavegacaoFila({ fila }: { fila: ReturnType<typeof useFilaNavegacao> }) {
  if (fila.total === 0 || fila.posicao === 0) return null;

  return (
    <div className="flex items-center gap-2 shrink-0">
      <Button
        variant="outline"
        size="icon"
        className="h-8 w-8 rounded-full"
        disabled={!fila.temAnterior}
        onClick={fila.irParaAnterior}
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>
      <Rotulo as="span" className="mx-1 whitespace-nowrap">
        {fila.posicao} de {fila.total}
      </Rotulo>
      <Button
        variant="outline"
        size="icon"
        className="h-8 w-8 rounded-full"
        disabled={!fila.temProximo}
        onClick={fila.irParaProximo}
      >
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  );
}

/**
 * Coluna principal da ficha: as abas de Parcelas / Histórico / Acordos.
 *
 * Ganha a mesma moldura da coluna de ação ao lado (contorno e fundo um passo
 * mais escuro que a página): sem isso as duas colunas se liam como um bloco só.
 * Com `emColuna`, ela tem altura própria e quem rola é o conteúdo da aba — as
 * pílulas ficam paradas no topo.
 */
function ColunaPrincipal({ clienteId, aba, onAba, emColuna }: {
  clienteId: string;
  aba: string;
  onAba: (valor: string) => void;
  emColuna: boolean;
}) {
  const alturaPropria = emColuna ? 'lg:flex lg:min-h-0 lg:flex-1 lg:flex-col' : undefined;

  return (
    <div className={cn('order-2', emColuna && 'lg:order-1 lg:col-span-2 lg:h-full lg:pl-1', alturaPropria)}>
      <div className={cn('rounded-xl border border-border/60 bg-muted/30 p-4', alturaPropria)}>
        <Tabs value={aba} onValueChange={onAba} className={cn('w-full', alturaPropria)}>
          <TabsList variant="pill" className="mb-4 w-full justify-start">
            <TabsTrigger value="parcelas" className="gap-2">
              <FileText className="h-4 w-4" />
              <span className="hidden sm:inline">Parcelas</span>
            </TabsTrigger>
            <TabsTrigger value="historico" className="gap-2">
              <Clock className="h-4 w-4" />
              <span className="hidden sm:inline">Histórico</span>
            </TabsTrigger>
            <TabsTrigger value="acordos" className="gap-2">
              <Handshake className="h-4 w-4" />
              <span className="hidden sm:inline">Acordos</span>
            </TabsTrigger>
          </TabsList>

          <div className={cn(emColuna && 'lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:pb-2 lg:pr-2')}>
            <TabsContent value="parcelas" className="mt-0">
              <TitulosCliente clienteId={clienteId} />
            </TabsContent>

            <TabsContent value="historico" className="mt-0">
              <EventoTimeline clienteId={clienteId} />
            </TabsContent>

            <TabsContent value="acordos" className="mt-0">
              <AcordosCliente clienteId={clienteId} />
            </TabsContent>
          </div>
        </Tabs>
      </div>
    </div>
  );
}

export default function Telecobranca() {
  const { clienteId } = useParams<{ clienteId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  // Quem abriu a ficha manda a URL de origem (com filtros e página) e a ordem
  // dos clientes daquela tela. Sem isso — link direto, recarregar — o breadcrumb
  // cai na lista limpa e a navegação da fila simplesmente não aparece.
  const fila = useFilaNavegacao(clienteId);
  const voltarPara = fila.voltarPara;
  // Vendedor (e leitura) é read-only: escondemos as ações de escrita.
  const { isOperador } = useUserRole();

  const [cliente, setCliente] = useState<Cliente | null>(null);
  const [loading, setLoading] = useState(true);
  const [isContatoModalOpen, setIsContatoModalOpen] = useState(false);
  const [isAgendamentoModalOpen, setIsAgendamentoModalOpen] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [abaPrincipal, setAbaPrincipal] = useState('parcelas');

  const situacao = useSituacaoCliente(clienteId);
  const invalidarEventos = useInvalidarEventos();

  useEffect(() => {
    if (clienteId) {
      fetchCliente();
    }
  }, [clienteId]);

  useTituloDaAba(cliente);
  // A ficha ocupa a altura da tela: nada de rolar a página inteira.
  usePaginaAlturaFixa();

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
    void invalidarEventos(clienteId);
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
    // A ficha ocupa a área útil e NÃO rola por inteiro: cabeçalho e indicadores
    // ficam parados e cada coluna rola por conta. Rolar a página inteira tirava
    // da vista justamente o nome, a dívida e o formulário de registro.
    <div className="flex h-full min-h-0 flex-col gap-6">
      <div className="shrink-0 space-y-6">
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
            <BreadcrumbPage>Ficha do Cliente · {cliente.nome}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      {/* Header Aprimorado */}
      <div className="flex items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3 sm:gap-4 min-w-0 flex-1">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="shrink-0 mt-2 sm:mt-0">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          
          {/* Avatar com iniciais */}
          <div className="h-10 w-10 sm:h-14 sm:w-14 rounded-full bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center text-primary-foreground text-sm sm:text-xl font-bold shadow-md shrink-0 mt-2 sm:mt-0">
            {getInitials(cliente.nome)}
          </div>
          
          <div className="min-w-0 flex-1">
            {/* A tela não se apresentava: quem chegava por um clique no nome do
                cliente não sabia como ela se chama nem como voltar a ela. */}
            <Rotulo>Ficha do Cliente</Rotulo>
            <div className="flex flex-col xl:flex-row xl:items-center gap-3 min-w-0">
              {/* Quem corta o nome é o `truncate`, na largura que sobrar: um
                  corte fixo em 35 caracteres encurtava o nome até em tela larga. */}
              <h1 className="truncate text-2xl font-black tracking-tighter sm:text-3xl md:text-4xl" title={cliente.nome}>
                {cliente.nome}
              </h1>
              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <StatusBadge domain="cliente" status={situacao} />
                <StatusCobrancaAtual clienteId={cliente.id} refreshTrigger={refreshTrigger} />
                {/* O compromisso combinado fica no cabeçalho, visível em
                    qualquer aba: é o que o operador precisa ter na frente
                    enquanto negocia. */}
                <ProximoRetorno clienteId={cliente.id} />
              </div>
            </div>
            <div className="flex items-center gap-4 text-xs sm:text-sm text-muted-foreground flex-wrap mt-0.5 sm:mt-0">
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

        <NavegacaoFila fila={fila} />
      </div>

      {/* Sem ações de escrita (vendedor/leitura), a coluna lateral ficava com um
          card só e metade do espaço nobre vazia ao lado das abas de cobrança.
          Nesse caso os dados do cliente viram uma faixa de largura inteira. */}
      {!isOperador && <ClienteResumo cliente={cliente} />}
      </div>

      {/* Corpo: em telas largas cada coluna tem a própria barra de rolagem;
          empilhado (mobile/tablet) quem rola é o corpo inteiro. */}
      <div className={cn(
        'grid min-h-0 flex-1 gap-6 overflow-y-auto lg:overflow-visible',
        isOperador && 'lg:grid-cols-3',
      )}>
        {/* No celular a coluna de ação vem PRIMEIRO: com ela no fim, registrar
            uma ligação exigia rolar a ficha inteira. No desktop ela volta para a
            direita, ao lado das parcelas. */}
        {isOperador && (
          <div className="order-1 lg:order-2 lg:col-span-1 lg:h-full lg:min-h-0 lg:pr-1 flex flex-col">
            {/* Moldura dupla: p-1 = 4px, e rounded-lg (var(--radius)) é
                exatamente rounded-xl (var(--radius) + 4px) menos essa borda —
                o canto interno acompanha o externo sem número mágico. */}
            <div className="flex min-h-0 flex-1 flex-col rounded-xl border border-primary/10 bg-primary/5 p-1">
              <div className="flex min-h-0 flex-1 flex-col rounded-lg bg-background py-4 shadow-sm sm:py-5">
                <div className="flex-1 overflow-y-auto px-4 sm:px-5">
                  <PainelLateralFicha
                    cliente={cliente}
                    onSucesso={handleEventoSuccess}
                    onSalvarEProximo={fila.temProximo ? fila.irParaProximo : undefined}
                    onEventoAdministrativo={() => setIsContatoModalOpen(true)}
                    onAgendarRetorno={() => setIsAgendamentoModalOpen(true)}
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        <ColunaPrincipal
          clienteId={cliente.id}
          aba={abaPrincipal}
          onAba={setAbaPrincipal}
          emColuna={isOperador}
        />
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

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

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
      <Rotulo>{acrescimo ? 'Acréscimo' : 'Desconto'}</Rotulo>
      <p className={cn('font-bold text-base mt-1', acrescimo ? 'text-amber-600' : 'text-green-600')}>
        {percentual.toFixed(1)}%
      </p>
    </div>
  );
}

/**
 * O painel só é montado quando aberto: a busca dos títulos do cliente roda na
 * montagem, então cada abertura já traz a dívida atualizada.
 */
function PainelNovoAcordo({ clienteId, aberto, onAbertoChange, onCriado }: {
  clienteId: string;
  aberto: boolean;
  onAbertoChange: (v: boolean) => void;
  onCriado: () => void;
}) {
  if (!aberto) return null;
  return (
    <NovoAcordoDialog
      open
      apresentacao="painel"
      onOpenChange={onAbertoChange}
      clienteIdPreSelecionado={clienteId}
      onCriado={onCriado}
    />
  );
}

/**
 * Parcelas de um acordo, no mesmo desenho da expansão de um título.
 *
 * Só consulta quando o card é aberto: a aba pode listar vários acordos e
 * carregar o cronograma de todos de uma vez é trabalho jogado fora.
 */
function ParcelasDoAcordo({ acordoId }: { acordoId: string }) {
  const { data: parcelas = [], isLoading } = useParcelasAcordo(acordoId);

  if (isLoading) {
    return <p className="px-4 py-3 text-xs text-muted-foreground">Carregando parcelas...</p>;
  }
  if (parcelas.length === 0) {
    return <p className="px-4 py-3 text-xs text-muted-foreground">Nenhuma parcela neste acordo.</p>;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Parcela</TableHead>
          <TableHead>Vencimento</TableHead>
          <TableHead>Valor</TableHead>
          <TableHead>Pago</TableHead>
          <TableHead>Saldo</TableHead>
          <TableHead>Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {parcelas.map((parcela) => (
          <TableRow key={parcela.id} className="[&>td]:whitespace-nowrap">
            <TableCell className="font-medium">
              {parcela.numero_parcela}/{parcelas.length}
            </TableCell>
            <TableCell>{formatData(parcela.data_vencimento)}</TableCell>
            <TableCell>{formatCurrency(parcela.valor_total)}</TableCell>
            <TableCell>
              {parcela.total_pago > 0 ? formatCurrency(parcela.total_pago) : <span className="text-muted-foreground">—</span>}
            </TableCell>
            <TableCell className={parcela.saldo_atual > 0 ? 'text-destructive' : 'text-muted-foreground'}>
              {formatCurrency(Math.max(0, parcela.saldo_atual))}
            </TableCell>
            <TableCell>
              <StatusBadge domain="parcela_acordo" status={parcela.status} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

/**
 * Um acordo na aba: resumo clicável que abre o cronograma, como o título faz
 * com as parcelas. O card inteiro não navega mais — quem leva para a tela de
 * acordos é o botão "Abrir", senão abrir e expandir disputariam o mesmo clique.
 */
function AcordoCard({ acordo, expandido, onAlternar, onAbrir }: {
  acordo: AcordoResumo;
  expandido: boolean;
  onAlternar: () => void;
  onAbrir: () => void;
}) {
  return (
    <Card className="overflow-hidden">
      <div className="flex items-start gap-3 p-6">
        <button
          type="button"
          onClick={onAlternar}
          aria-expanded={expandido}
          className="flex min-w-0 flex-1 items-start gap-3 text-left"
        >
          <span className="mt-0.5 shrink-0 text-muted-foreground">
            {expandido ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </span>

          <div className="min-w-0 flex-1 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Handshake className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">Acordo <span className="font-mono">{codigoAcordo(acordo.id)}</span></span>
              </div>
              <StatusBadge domain="acordo" status={acordo.status} />
            </div>

            <div className="grid grid-cols-2 gap-6 md:grid-cols-4">
              <div>
                <Rotulo>Valor Original</Rotulo>
                <p className="font-bold text-base mt-1">{formatCurrency(acordo.valor_original)}</p>
              </div>
              <div>
                <Rotulo>Valor Acordo</Rotulo>
                <p className="font-bold text-lg text-primary mt-1">{formatCurrency(acordo.valor_acordo)}</p>
              </div>
              <div>
                <Rotulo>Parcelas</Rotulo>
                <p className="font-bold text-base mt-1">{acordo.parcelas}x de {formatCurrency(acordo.valor_parcela)}</p>
              </div>
              <NegociacaoResumo valorOriginal={acordo.valor_original} valorAcordo={acordo.valor_acordo} />
            </div>
          </div>
        </button>

        <Button size="sm" variant="outline" className="shrink-0 gap-1" onClick={onAbrir}>
          <ExternalLink className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Abrir</span>
        </Button>
      </div>

      {expandido && (
        <div className="mb-6 ml-9 mr-6 overflow-x-auto rounded-lg border border-l-2 border-dashed border-l-primary/40 bg-muted/30">
          <ParcelasDoAcordo acordoId={acordo.id} />
        </div>
      )}
    </Card>
  );
}

/**
 * Acordos do cliente, com a criação em painel lateral.
 *
 * "Criar novo acordo" levava para /acordos: o operador saía do atendimento no
 * meio da negociação e precisava navegar de volta. O Sheet abre por cima da
 * ficha, com a dívida e o histórico visíveis atrás.
 */
function AcordosCliente({ clienteId }: { clienteId: string }) {
  const [acordos, setAcordos] = useState<AcordoResumo[]>([]);
  const [loading, setLoading] = useState(true);
  const [novoAcordoAberto, setNovoAcordoAberto] = useState(false);
  const [expandidos, setExpandidos] = useState<Set<string>>(new Set());
  const navigate = useNavigate();

  const alternar = (acordoId: string) =>
    setExpandidos((atual) => {
      const proximo = new Set(atual);
      if (!proximo.delete(acordoId)) proximo.add(acordoId);
      return proximo;
    });

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

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (acordos.length === 0) {
    return (
      <>
        <div className="text-center py-12 bg-muted/20 rounded-2xl border-none shadow-sm">
          <Handshake className="h-12 w-12 mx-auto mb-3 text-muted-foreground/30" />
          <p className="text-sm font-medium text-muted-foreground">Nenhum acordo encontrado</p>
          <Button variant="outline" className="mt-4 rounded-full" onClick={() => setNovoAcordoAberto(true)}>
            Criar novo acordo
          </Button>
        </div>
        <PainelNovoAcordo
          clienteId={clienteId}
          aberto={novoAcordoAberto}
          onAbertoChange={setNovoAcordoAberto}
          onCriado={fetchAcordos}
        />
      </>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button size="sm" variant="outline" className="gap-2" onClick={() => setNovoAcordoAberto(true)}>
          <Handshake className="h-4 w-4" />
          Novo acordo
        </Button>
      </div>

      <PainelNovoAcordo
        clienteId={clienteId}
        aberto={novoAcordoAberto}
        onAbertoChange={setNovoAcordoAberto}
        onCriado={fetchAcordos}
      />

      {acordos.map((acordo) => (
        <AcordoCard
          key={acordo.id}
          acordo={acordo}
          expandido={expandidos.has(acordo.id)}
          onAlternar={() => alternar(acordo.id)}
          onAbrir={() => navigate(`/acordos?id=${acordo.id}`)}
        />
      ))}
    </div>
  );
}
