import { useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AlertTriangle, CalendarClock, CalendarDays, Phone, CheckCircle2 } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { CarregandoConteudo } from '@/components/TelaCarregamento';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/StatusBadge';
import { useClientes, type ClienteRow } from '@/lib/queries/clientes';
import { hojeIso } from '@/domain/telecobranca/statusCobranca';
import { formatCpfCnpj, formatData, formatTelefone } from '@/utils/format';
import { cn } from '@/lib/utils';

/**
 * Fila de retornos do dia.
 *
 * A agenda do cobrador existia só como preset de filtro dentro de Clientes, e a
 * ordenação por urgência só ligava junto com o filtro — a pergunta que abre o
 * dia ("o que eu faço agora?") não tinha destino. Esta tela é uma leitura da
 * MESMA base (useClientes já traz `proximo_retorno`), sem consulta nova.
 */

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
    .format(value || 0);

type ChaveBloco = 'atrasados' | 'hoje' | 'proximos';

interface Bloco {
  chave: ChaveBloco;
  titulo: string;
  descricao: string;
  clientes: ClienteRow[];
}

const soData = (valor?: string | null) => (valor ? String(valor).slice(0, 10) : null);

const porDataCrescente = (a: ClienteRow, b: ClienteRow) =>
  (soData(a.proximo_retorno) ?? '').localeCompare(soData(b.proximo_retorno) ?? '');

/**
 * Separa a carteira em atrasado / hoje / próximos 7 dias.
 *
 * Retornos com data acima de 7 dias ficam de fora de propósito: a fila é o
 * trabalho do dia, não a agenda inteira.
 */
function montarBlocos(clientes: ClienteRow[], hoje: string, limite: string): Bloco[] {
  const atrasados: ClienteRow[] = [];
  const deHoje: ClienteRow[] = [];
  const proximos: ClienteRow[] = [];

  for (const cliente of clientes) {
    const data = soData(cliente.proximo_retorno);
    if (!data) continue;
    if (data < hoje) atrasados.push(cliente);
    else if (data === hoje) deHoje.push(cliente);
    else if (data <= limite) proximos.push(cliente);
  }

  return [
    {
      chave: 'atrasados',
      titulo: 'Atrasados',
      descricao: 'Retornos que já passaram da data combinada',
      clientes: atrasados.sort(porDataCrescente),
    },
    {
      chave: 'hoje',
      titulo: 'Para hoje',
      descricao: 'Combinados para hoje',
      clientes: deHoje.sort(porDataCrescente),
    },
    {
      chave: 'proximos',
      titulo: 'Próximos 7 dias',
      descricao: 'Já agendados para os próximos dias',
      clientes: proximos.sort(porDataCrescente),
    },
  ];
}

const ESTILO_BLOCO: Record<ChaveBloco, { icone: typeof AlertTriangle; cor: string; borda: string }> = {
  atrasados: { icone: AlertTriangle, cor: 'text-destructive', borda: 'border-destructive/30' },
  hoje: { icone: CalendarClock, cor: 'text-primary', borda: 'border-primary/30' },
  proximos: { icone: CalendarDays, cor: 'text-muted-foreground', borda: 'border-border/60' },
};

function LinhaCliente({ cliente, atrasado, onAbrir }: {
  cliente: ClienteRow;
  atrasado: boolean;
  onAbrir: (c: ClienteRow) => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/40 px-4 py-3 last:border-0 hover:bg-muted/20">
      <div className="min-w-0 flex-1">
        <button
          type="button"
          onClick={() => onAbrir(cliente)}
          className="block max-w-full truncate text-left text-sm font-bold hover:text-primary hover:underline"
        >
          {cliente.nome}
        </button>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span>{formatCpfCnpj(cliente.cpf_cnpj)}</span>
          {cliente.telefone && (
            <span className="flex items-center gap-1">
              <Phone className="h-3 w-3" />
              {formatTelefone(cliente.telefone)}
            </span>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {cliente.retorno_status_cobranca && (
          <StatusBadge domain="status_cobranca" status={cliente.retorno_status_cobranca} />
        )}
        <Badge variant={atrasado ? 'destructive' : 'secondary'} className="text-[11px]">
          {formatData(soData(cliente.proximo_retorno) ?? '')}
        </Badge>
        <span className="w-24 text-right text-sm font-black text-primary">
          {formatCurrency(cliente.total_valor || 0)}
        </span>
        <Button size="sm" variant="outline" className="h-8" onClick={() => onAbrir(cliente)}>
          Atender
        </Button>
      </div>
    </div>
  );
}

function BlocoFila({ bloco, onAbrir }: { bloco: Bloco; onAbrir: (c: ClienteRow) => void }) {
  const { icone: Icone, cor, borda } = ESTILO_BLOCO[bloco.chave];
  return (
    <Card className={cn('overflow-hidden rounded-2xl border shadow-card', borda)}>
      <CardHeader className="border-b border-border/50 bg-muted/20 pb-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Icone className={cn('h-5 w-5', cor)} />
            <div>
              <CardTitle className="text-lg font-bold tracking-tight">{bloco.titulo}</CardTitle>
              <CardDescription className="text-xs font-medium">{bloco.descricao}</CardDescription>
            </div>
          </div>
          <span className={cn('text-2xl font-black tabular-nums', cor)}>{bloco.clientes.length}</span>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {bloco.clientes.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-muted-foreground">Nada por aqui.</p>
        ) : (
          bloco.clientes.map((cliente) => (
            <LinhaCliente
              key={cliente.id}
              cliente={cliente}
              atrasado={bloco.chave === 'atrasados'}
              onAbrir={onAbrir}
            />
          ))
        )}
      </CardContent>
    </Card>
  );
}

export default function Fila() {
  const navigate = useNavigate();
  const location = useLocation();
  const { data: clientes = [], isLoading } = useClientes();

  const blocos = useMemo(() => {
    const hoje = hojeIso();
    const limite = new Date(`${hoje}T00:00:00`);
    limite.setDate(limite.getDate() + 7);
    return montarBlocos(clientes, hoje, limite.toISOString().slice(0, 10));
  }, [clientes]);

  const total = blocos.reduce((soma, b) => soma + b.clientes.length, 0);

  const abrirFicha = (cliente: ClienteRow) =>
    navigate(`/clientes/${cliente.id}`, { state: { from: location.pathname + location.search } });

  if (isLoading) return <CarregandoConteudo />;

  return (
    <div className="space-y-8 animate-fade-in pb-10">
      <PageHeader
        title="Minha fila"
        description="Retornos combinados com os clientes, do mais urgente ao mais distante."
      />

      {total === 0 ? (
        <Card className="rounded-2xl border-none shadow-card">
          <CardContent className="py-16 text-center">
            <CheckCircle2 className="mx-auto mb-3 h-12 w-12 text-success/50" />
            <p className="text-sm font-bold uppercase tracking-widest text-muted-foreground">
              Nenhum retorno para os próximos dias
            </p>
            <Button variant="outline" className="mt-4" onClick={() => navigate('/clientes')}>
              Ver todos os clientes
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {blocos.map((bloco) => (
            <BlocoFila key={bloco.chave} bloco={bloco} onAbrir={abrirFicha} />
          ))}
        </div>
      )}
    </div>
  );
}
