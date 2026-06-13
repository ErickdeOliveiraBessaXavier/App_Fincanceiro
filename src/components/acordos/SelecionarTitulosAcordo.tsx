import { useState, useEffect } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusBadge } from '@/components/StatusBadge';
import { ChevronDown, ChevronRight, AlertTriangle, FileText, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { TituloAgrupado, TituloItem, ClienteComDividas } from '@/hooks/useTitulosAgrupados';
import { cn } from '@/lib/utils';

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

const formatDate = (value: string) => format(new Date(value), 'dd/MM/yyyy');

interface SelecionarTitulosAcordoProps {
  clientes: ClienteComDividas[];
  clienteIdPreSelecionado?: string;
  loading?: boolean;
  onSelectionChange: (selection: {
    clienteId: string;
    cliente: { id: string; nome: string; cpf_cnpj: string };
    tituloIds: string[];
    valorTotal: number;
    dividas: TituloAgrupado[];
  } | null) => void;
}

// ===================== Subcomponentes de apresentação =====================

// Feedback imediato enquanto os títulos/parcelas do cliente são buscados.
function SelecaoSkeleton() {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Buscando títulos e parcelas do cliente...
      </div>
      <Skeleton className="h-9 w-full" />
      <div className="space-y-2">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-24 w-full rounded-lg" />
        ))}
      </div>
    </div>
  );
}

function ClienteSelect({
  clientes,
  value,
  onChange,
}: {
  clientes: ClienteComDividas[];
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="space-y-2">
      <label className="text-sm font-medium">Cliente *</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
      >
        <option value="">Selecione um cliente</option>
        {clientes.map((cliente) => (
          <option key={cliente.id} value={cliente.id}>
            {cliente.nome} - {cliente.cpf_cnpj} (Dívida: {formatCurrency(cliente.valor_total)})
          </option>
        ))}
      </select>
    </div>
  );
}

// Item de resumo (rótulo + valor) usado no cabeçalho de cada título.
function ResumoItem({ label, valor, destaque }: { label: string; valor: string; destaque?: boolean }) {
  return (
    <div className="min-w-0">
      <p className="text-muted-foreground">{label}</p>
      <p className={cn('font-medium truncate', destaque && 'text-primary font-bold')}>{valor}</p>
    </div>
  );
}

function ParcelaLinha({ titulo, totalParcelas }: { titulo: TituloItem; totalParcelas: number }) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-md bg-background/70 px-3 py-2 text-xs">
      <div className="flex items-center gap-2 min-w-0 flex-wrap">
        <span className="font-medium whitespace-nowrap">
          Parcela {titulo.numero_parcela}{totalParcelas > 1 ? `/${totalParcelas}` : ''}
        </span>
        <span className="text-muted-foreground whitespace-nowrap">
          Venc: {formatDate(titulo.vencimento)}
        </span>
        <StatusBadge domain="parcela" status={titulo.status} />
      </div>
      <span className="font-semibold whitespace-nowrap">{formatCurrency(titulo.saldo_atual)}</span>
    </div>
  );
}

interface DividaCardProps {
  divida: TituloAgrupado;
  isSelected: boolean;
  isExpanded: boolean;
  onToggleSelect: () => void;
  onToggleExpand: () => void;
}
function DividaCard({ divida, isSelected, isExpanded, onToggleSelect, onToggleExpand }: DividaCardProps) {
  const valorOriginal = divida.titulos.reduce((sum, t) => sum + t.valor, 0);
  const situacao = divida.tem_vencido
    ? { label: 'Vencido', variant: 'destructive' as const }
    : { label: 'Em dia', variant: 'secondary' as const };

  return (
    <div className={cn('bg-card', isSelected && 'bg-primary/5')}>
      <div className="flex items-start gap-3 p-3">
        <Checkbox
          checked={isSelected}
          onCheckedChange={onToggleSelect}
          className="mt-1"
          aria-label="Selecionar título"
        />

        <button
          type="button"
          onClick={onToggleExpand}
          className="flex flex-1 items-start gap-3 text-left min-w-0"
          aria-expanded={isExpanded}
        >
          <span className="mt-0.5 text-muted-foreground shrink-0">
            {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </span>

          <div className="flex-1 min-w-0 space-y-2">
            {/* Identificação do título */}
            <div className="flex items-center gap-2 flex-wrap">
              <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="text-sm font-semibold">
                Título {divida.numero_documento ? `#${divida.numero_documento}` : 'avulso'}
              </span>
              <Badge variant={situacao.variant} className="text-xs">
                {divida.tem_vencido && <AlertTriangle className="h-3 w-3 mr-1" />}
                {situacao.label}
              </Badge>
            </div>

            {/* Resumo do título */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-1.5 text-xs">
              <ResumoItem label="Parcelas" valor={`${divida.parcelas_abertas} de ${divida.total_parcelas}`} />
              <ResumoItem label="Valor total" valor={formatCurrency(valorOriginal)} />
              <ResumoItem label="Em aberto" valor={formatCurrency(divida.valor_total)} destaque />
              <ResumoItem label="Venc. mais antigo" valor={formatDate(divida.vencimento_mais_antigo)} />
            </div>
          </div>
        </button>
      </div>

      {/* Parcelas vinculadas ao título */}
      {isExpanded && (
        <div className="ml-12 mr-3 mb-3 space-y-1 rounded-lg border border-l-2 border-dashed border-l-primary/40 bg-muted/30 p-2">
          <p className="px-1 pb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Parcelas vinculadas
          </p>
          {divida.titulos.map((titulo) => (
            <ParcelaLinha key={titulo.parcela_id} titulo={titulo} totalParcelas={divida.total_parcelas} />
          ))}
        </div>
      )}
    </div>
  );
}

function ResumoSelecao({ quantidade, valor }: { quantidade: number; valor: number }) {
  const plural = quantidade > 1 ? 's' : '';
  return (
    <div className="flex items-center justify-between p-3 bg-primary/5 rounded-lg border border-primary/20">
      <span className="text-sm font-medium">
        {quantidade} título{plural} selecionado{plural}
      </span>
      <span className="font-bold text-primary">{formatCurrency(valor)}</span>
    </div>
  );
}

interface DividasSectionProps {
  cliente: ClienteComDividas;
  selecionadas: Set<string>;
  expandidas: Set<string>;
  onToggleSelect: (id: string) => void;
  onToggleExpand: (id: string) => void;
  onSelectAll: () => void;
}
function DividasSection({
  cliente,
  selecionadas,
  expandidas,
  onToggleSelect,
  onToggleExpand,
  onSelectAll,
}: DividasSectionProps) {
  if (cliente.dividas.length === 0) {
    return (
      <div className="text-center py-4 text-muted-foreground text-sm">
        Este cliente não possui títulos em aberto.
      </div>
    );
  }

  const todasSelecionadas = selecionadas.size === cliente.dividas.length;
  const valorSelecionado = cliente.dividas
    .filter((d) => selecionadas.has(d.id))
    .reduce((sum, d) => sum + d.valor_total, 0);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium">Títulos em Aberto</label>
        <button type="button" onClick={onSelectAll} className="text-xs text-primary hover:underline">
          {todasSelecionadas ? 'Desmarcar todos' : 'Selecionar todos'}
        </button>
      </div>

      <div className="border rounded-lg divide-y max-h-72 overflow-y-auto">
        {cliente.dividas.map((divida) => (
          <DividaCard
            key={divida.id}
            divida={divida}
            isSelected={selecionadas.has(divida.id)}
            isExpanded={expandidas.has(divida.id)}
            onToggleSelect={() => onToggleSelect(divida.id)}
            onToggleExpand={() => onToggleExpand(divida.id)}
          />
        ))}
      </div>

      {selecionadas.size > 0 && <ResumoSelecao quantidade={selecionadas.size} valor={valorSelecionado} />}
    </div>
  );
}

// ===================== Componente principal =====================

export function SelecionarTitulosAcordo({
  clientes,
  clienteIdPreSelecionado,
  loading = false,
  onSelectionChange,
}: SelecionarTitulosAcordoProps) {
  const [clienteSelecionado, setClienteSelecionado] = useState<string>(clienteIdPreSelecionado || '');
  const [dividasSelecionadas, setDividasSelecionadas] = useState<Set<string>>(new Set());
  const [expandedDividas, setExpandedDividas] = useState<Set<string>>(new Set());

  const clienteAtual = clientes.find((c) => c.id === clienteSelecionado);

  // Atualizar seleção quando cliente pré-selecionado é carregado
  useEffect(() => {
    if (clienteIdPreSelecionado && clientes.length > 0) {
      setClienteSelecionado(clienteIdPreSelecionado);
      const cliente = clientes.find((c) => c.id === clienteIdPreSelecionado);
      if (cliente) {
        setDividasSelecionadas(new Set(cliente.dividas.map((d) => d.id)));
      }
    }
  }, [clienteIdPreSelecionado, clientes]);

  // Notificar mudanças na seleção
  useEffect(() => {
    if (!clienteAtual || dividasSelecionadas.size === 0) {
      onSelectionChange(null);
      return;
    }

    const dividasEscolhidas = clienteAtual.dividas.filter((d) => dividasSelecionadas.has(d.id));
    const tituloIds = dividasEscolhidas.flatMap((d) => d.titulos.map((t) => t.id));
    const valorTotal = dividasEscolhidas.reduce((sum, d) => sum + d.valor_total, 0);

    onSelectionChange({
      clienteId: clienteAtual.id,
      cliente: {
        id: clienteAtual.id,
        nome: clienteAtual.nome,
        cpf_cnpj: clienteAtual.cpf_cnpj,
      },
      tituloIds,
      valorTotal,
      dividas: dividasEscolhidas,
    });
  }, [clienteSelecionado, dividasSelecionadas, clienteAtual, onSelectionChange]);

  const handleClienteChange = (clienteId: string) => {
    setClienteSelecionado(clienteId);
    setDividasSelecionadas(new Set());
    setExpandedDividas(new Set());
  };

  const handleDividaToggle = (dividaId: string) => {
    const newSet = new Set(dividasSelecionadas);
    if (newSet.has(dividaId)) {
      newSet.delete(dividaId);
    } else {
      newSet.add(dividaId);
    }
    setDividasSelecionadas(newSet);
  };

  const toggleExpand = (dividaId: string) => {
    const newSet = new Set(expandedDividas);
    if (newSet.has(dividaId)) {
      newSet.delete(dividaId);
    } else {
      newSet.add(dividaId);
    }
    setExpandedDividas(newSet);
  };

  const handleSelectAll = () => {
    if (!clienteAtual) return;

    if (dividasSelecionadas.size === clienteAtual.dividas.length) {
      setDividasSelecionadas(new Set());
    } else {
      setDividasSelecionadas(new Set(clienteAtual.dividas.map((d) => d.id)));
    }
  };

  if (loading) {
    return <SelecaoSkeleton />;
  }

  return (
    <div className="space-y-4">
      <ClienteSelect clientes={clientes} value={clienteSelecionado} onChange={handleClienteChange} />

      {clienteAtual && (
        <DividasSection
          cliente={clienteAtual}
          selecionadas={dividasSelecionadas}
          expandidas={expandedDividas}
          onToggleSelect={handleDividaToggle}
          onToggleExpand={toggleExpand}
          onSelectAll={handleSelectAll}
        />
      )}
    </div>
  );
}
