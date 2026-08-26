import { useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AlertTriangle, CalendarClock, CalendarDays, CalendarX2, Phone, CheckCircle2 } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { CarregandoConteudo } from '@/components/TelaCarregamento';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/StatusBadge';
import { TablePagination } from '@/components/TablePagination';
import { usePagination, type PaginationControls } from '@/hooks/usePagination';
import { estadoDaFila } from '@/hooks/useFilaNavegacao';
import { useClientes, type ClienteRow } from '@/lib/queries/clientes';
import { useDividaPorCliente } from '@/lib/queries/metricas';
import type { DividaCliente } from '@/domain/metricas';
import { hojeIso } from '@/domain/telecobranca/statusCobranca';
import { formatCpfCnpj, formatData, formatTelefone, isoDeData } from '@/utils/format';
import { cn } from '@/lib/utils';

/**
 * Fila de retornos do dia.
 *
 * A agenda do cobrador existia só como preset de filtro dentro de Clientes, e a
 * ordenação por urgência só ligava junto com o filtro — a pergunta que abre o
 * dia ("o que eu faço agora?") não tinha destino.
 *
 * Duas coisas que a fila NÃO acertava e agora acerta:
 *  * Quem pagou continuava na fila. Pagar não cancela o retorno agendado, e a
 *    fila só olhava o agendamento — o cobrador ligava para cobrar quem já tinha
 *    quitado. Quem está sem saldo em aberto sai dos blocos de trabalho e fica
 *    numa lista à parte, que dá para abrir.
 *  * O valor exibido era `valor_original` de TODOS os títulos, pagos inclusive,
 *    e ignorava acordo. Agora é a dívida viva (vencido + a vencer, título e
 *    parcela de acordo), pela mesma regra do Dashboard.
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

const SEM_DIVIDA: DividaCliente = { emAberto: 0, vencido: 0, parcelasVencidas: 0, maiorAtraso: 0 };

type Dividas = Map<string, DividaCliente>;

const dividaDe = (dividas: Dividas, clienteId: string): DividaCliente =>
  dividas.get(clienteId) ?? SEM_DIVIDA;

/** Retorno dentro da janela da fila (atrasado, hoje ou até o limite). */
function naJanela(data: string, hoje: string, limite: string): boolean {
  return data < hoje || data <= limite;
}

interface FilaMontada {
  blocos: Bloco[];
  /** Com retorno agendado, mas sem nada a cobrar — já pagaram. */
  quitados: ClienteRow[];
}

/**
 * Separa a carteira em atrasado / hoje / próximos 7 dias, tirando quem não deve.
 *
 * Retornos com data acima de 7 dias ficam de fora de propósito: a fila é o
 * trabalho do dia, não a agenda inteira.
 */
function montarBlocos(
  clientes: ClienteRow[],
  hoje: string,
  limite: string,
  dividas: Dividas,
  /** Falso quando a dívida não pôde ser lida: aí ninguém sai da fila. */
  filtrarQuitados: boolean,
): FilaMontada {
  const atrasados: ClienteRow[] = [];
  const deHoje: ClienteRow[] = [];
  const proximos: ClienteRow[] = [];
  const quitados: ClienteRow[] = [];

  for (const cliente of clientes) {
    const data = soData(cliente.proximo_retorno);
    if (!data || !naJanela(data, hoje, limite)) continue;
    if (filtrarQuitados && dividaDe(dividas, cliente.id).emAberto <= 0) quitados.push(cliente);
    else if (data < hoje) atrasados.push(cliente);
    else if (data === hoje) deHoje.push(cliente);
    else proximos.push(cliente);
  }

  return { quitados: quitados.sort(porDataCrescente), blocos: [
    {
      chave: 'atrasados',
      titulo: 'Retornos atrasados',
      descricao: 'A data combinada com o cliente já passou',
      clientes: atrasados.sort(porDataCrescente),
    },
    {
      chave: 'hoje',
      titulo: 'Retornos de hoje',
      descricao: 'Combinados para hoje',
      clientes: deHoje.sort(porDataCrescente),
    },
    {
      chave: 'proximos',
      titulo: 'Próximos 7 dias',
      descricao: 'Retornos já agendados para os próximos dias',
      clientes: proximos.sort(porDataCrescente),
    },
  ] };
}

/**
 * Rótulo que separa as duas perguntas da tela.
 *
 * Com "Atrasados" (retorno fora da data) e "Em atraso" (dívida vencida) na
 * mesma página, o mesmo adjetivo nomeava coisas diferentes. Agora agenda fala em
 * RETORNO ATRASADO e dinheiro fala em DÍVIDA VENCIDA, cada um sob seu título.
 */
function TituloSecao({ children, descricao }: { children: string; descricao: string }) {
  return (
    <div className="space-y-0.5">
      <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
        {children}
      </h2>
      <p className="text-xs text-muted-foreground/80">{descricao}</p>
    </div>
  );
}

const ESTILO_BLOCO: Record<ChaveBloco, { icone: typeof AlertTriangle; cor: string; borda: string }> = {
  atrasados: { icone: CalendarX2, cor: 'text-destructive', borda: 'border-destructive/30' },
  hoje: { icone: CalendarClock, cor: 'text-primary', borda: 'border-primary/30' },
  proximos: { icone: CalendarDays, cor: 'text-muted-foreground', borda: 'border-border/60' },
};

function LinhaCliente({ cliente, atrasado, divida, onAbrir }: {
  cliente: ClienteRow;
  atrasado: boolean;
  divida: DividaCliente;
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
        {/* Zerado aqui só acontece quando a dívida não pôde ser lida — quem
            realmente zerou já saiu para o bloco "Já pagaram". */}
        <span className="w-28 text-right">
          <span className="block text-sm font-black text-primary">
            {divida.emAberto > 0 ? formatCurrency(divida.emAberto) : '—'}
          </span>
          <span className="block text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            {divida.vencido > 0 ? `${formatCurrency(divida.vencido)} vencido` : 'em aberto'}
          </span>
        </span>
        <Button size="sm" variant="outline" className="h-8" onClick={() => onAbrir(cliente)}>
          Atender
        </Button>
      </div>
    </div>
  );
}

interface BlocoFilaProps {
  bloco: Bloco;
  dividas: Dividas;
  onAbrir: (c: ClienteRow) => void;
}

function BlocoFila({ bloco, dividas, onAbrir }: BlocoFilaProps) {
  const { icone: Icone, cor, borda } = ESTILO_BLOCO[bloco.chave];
  const pagina = usePagination(bloco.clientes, TAMANHO_PAGINA, String(bloco.clientes.length));
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
          <>
            {pagina.pageItems.map((cliente) => (
              <LinhaCliente
                key={cliente.id}
                cliente={cliente}
                atrasado={bloco.chave === 'atrasados'}
                divida={dividaDe(dividas, cliente.id)}
                onAbrir={onAbrir}
              />
            ))}
            <RodapePaginacao pagina={pagina} />
          </>
        )}
      </CardContent>
    </Card>
  );
}

/** Cliente em atraso, já com a dívida ao lado, pronto para ordenar. */
interface EmAtraso {
  cliente: ClienteRow;
  divida: DividaCliente;
  /** Data do retorno agendado, quando existe. */
  retorno: string | null;
}

/**
 * Quem está com título ou parcela de acordo vencida, tenha retorno ou não.
 *
 * A fila responde "com quem eu falo hoje"; este painel responde a outra
 * pergunta, que ficava sem dono: "quem está atrasado e ninguém está tratando".
 * Por isso quem NÃO tem retorno agendado vem primeiro — é o risco de o cliente
 * ficar esquecido — e dentro de cada grupo ordena pelo maior atraso.
 */
function montarEmAtraso(clientes: ClienteRow[], dividas: Dividas): EmAtraso[] {
  return clientes
    .map((cliente) => ({
      cliente,
      divida: dividaDe(dividas, cliente.id),
      retorno: soData(cliente.proximo_retorno),
    }))
    .filter((item) => item.divida.vencido > 0)
    .sort((a, b) => {
      // Sem retorno agendado primeiro: é dívida que ninguém está tratando.
      // Dentro de cada grupo, o maior valor vencido — é onde o esforço rende.
      if (!a.retorno !== !b.retorno) return a.retorno ? 1 : -1;
      return b.divida.vencido - a.divida.vencido;
    });
}

const plural = (n: number, singular: string, prural: string) => (n === 1 ? singular : prural);

function LinhaEmAtraso({ item, onAbrir }: { item: EmAtraso; onAbrir: (c: ClienteRow) => void }) {
  const { cliente, divida, retorno } = item;
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
          <span>
            {divida.parcelasVencidas} {plural(divida.parcelasVencidas, 'parcela vencida', 'parcelas vencidas')}
          </span>
          <span>
            {divida.maiorAtraso} {plural(divida.maiorAtraso, 'dia', 'dias')} de atraso
          </span>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {retorno ? (
          <Badge variant="secondary" className="text-[11px]">
            Retorno {formatData(retorno)}
          </Badge>
        ) : (
          <Badge variant="warning" className="text-[11px]">Sem retorno</Badge>
        )}
        <span className="w-28 text-right">
          <span className="block text-sm font-black text-destructive">
            {formatCurrency(divida.vencido)}
          </span>
          <span className="block text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            vencido
          </span>
        </span>
        <Button size="sm" variant="outline" className="h-8" onClick={() => onAbrir(cliente)}>
          Abrir
        </Button>
      </div>
    </div>
  );
}

/**
 * Página curta de propósito: são até quatro listas na mesma tela, e uma carteira
 * grande (milhares de retornos, milhares de vencidos) tornaria a rolagem
 * impraticável. O rodapé deixa escolher 25/50/100 quando o operador quiser
 * varrer tudo. A paginação é client-side, como nas demais listagens; quando o
 * volume exigir, o corte passa a ser feito na consulta sem mudar esta UI.
 */
const TAMANHO_PAGINA = 10;

/** Rodapé só aparece quando há mais de uma página — lista curta fica limpa. */
function RodapePaginacao({ pagina }: { pagina: PaginationControls }) {
  if (pagina.totalItems <= TAMANHO_PAGINA) return null;
  return (
    <div className="border-t border-border/40 px-4">
      <TablePagination pagination={pagina} className="pb-3" />
    </div>
  );
}

/** Painel de inadimplência da carteira, abaixo da agenda do dia. */
function PainelEmAtraso({ itens, onAbrir }: {
  itens: EmAtraso[];
  onAbrir: (c: ClienteRow) => void;
}) {
  const pagina = usePagination(itens, TAMANHO_PAGINA, String(itens.length));

  if (itens.length === 0) return null;

  const semRetorno = itens.filter((i) => !i.retorno).length;
  const total = itens.reduce((soma, i) => soma + i.divida.vencido, 0);

  return (
    <Card className="overflow-hidden rounded-2xl border border-destructive/30 shadow-card">
      <CardHeader className="border-b border-border/50 bg-destructive/5 pb-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            <div>
              <CardTitle className="text-lg font-bold tracking-tight">Dívida vencida</CardTitle>
              <CardDescription className="text-xs font-medium">
                Quem está devendo hoje — título ou parcela de acordo
                {semRetorno > 0 && ` · ${semRetorno} sem retorno agendado`}
              </CardDescription>
            </div>
          </div>
          <div className="text-right">
            <span className="block text-2xl font-black tabular-nums text-destructive">
              {formatCurrency(total)}
            </span>
            <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
              {itens.length} {plural(itens.length, 'cliente', 'clientes')}
            </span>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {pagina.pageItems.map((item) => (
          <LinhaEmAtraso key={item.cliente.id} item={item} onAbrir={onAbrir} />
        ))}
        <RodapePaginacao pagina={pagina} />
      </CardContent>
    </Card>
  );
}

/**
 * Os que saíram da fila por já terem pagado.
 *
 * Ficam visíveis, e não simplesmente sumidos: o retorno foi combinado com
 * alguém e some da fila sem explicação seria pior do que a cobrança indevida.
 */
function QuitadosDaFila({ clientes, onAbrir }: {
  clientes: ClienteRow[];
  onAbrir: (c: ClienteRow) => void;
}) {
  const [aberto, setAberto] = useState(false);

  if (clientes.length === 0) return null;

  return (
    <Card className="rounded-2xl border border-success/30 shadow-card">
      <CardHeader className="border-b border-border/50 bg-success/5 pb-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-success" />
            <div>
              <CardTitle className="text-lg font-bold tracking-tight">Já pagaram</CardTitle>
              <CardDescription className="text-xs font-medium">
                {clientes.length === 1
                  ? '1 retorno agendado para quem não tem mais saldo em aberto'
                  : `${clientes.length} retornos agendados para quem não tem mais saldo em aberto`}
              </CardDescription>
            </div>
          </div>
          <Button size="sm" variant="outline" className="h-8" onClick={() => setAberto(!aberto)}>
            {aberto ? 'Ocultar' : 'Ver quem'}
          </Button>
        </div>
      </CardHeader>
      {aberto && (
        <CardContent className="p-0">
          {clientes.map((cliente) => (
            <div
              key={cliente.id}
              className="flex flex-wrap items-center justify-between gap-3 border-b border-border/40 px-4 py-3 last:border-0 hover:bg-muted/20"
            >
              <button
                type="button"
                onClick={() => onAbrir(cliente)}
                className="max-w-full truncate text-left text-sm font-bold hover:text-primary hover:underline"
              >
                {cliente.nome}
              </button>
              <div className="flex items-center gap-2">
                <Badge variant="success">Quitado</Badge>
                <Badge variant="secondary" className="text-[11px]">
                  {formatData(soData(cliente.proximo_retorno) ?? '')}
                </Badge>
              </div>
            </div>
          ))}
        </CardContent>
      )}
    </Card>
  );
}

export default function Fila() {
  const navigate = useNavigate();
  const location = useLocation();
  const { data: clientes = [], isLoading } = useClientes();
  // A dívida vem da base única (títulos + acordos). Sem ela não dá para dizer
  // quem já pagou, então a tela espera as duas consultas.
  const { divida, isLoading: carregandoDivida, isError: erroDivida } = useDividaPorCliente();

  const { blocos, quitados } = useMemo(() => {
    const hoje = hojeIso();
    const limite = new Date(`${hoje}T00:00:00`);
    limite.setDate(limite.getDate() + 7);
    return montarBlocos(clientes, hoje, isoDeData(limite), divida, !erroDivida);
  }, [clientes, divida, erroDivida]);

  const emAtraso = useMemo(() => montarEmAtraso(clientes, divida), [clientes, divida]);

  // Ordem de importância da tela: primeiro o que já venceu ou é de hoje, depois
  // a inadimplência sem dono, e só então o que está agendado para frente.
  const agora = blocos.filter((b) => b.chave !== 'proximos');
  const programado = blocos.filter((b) => b.chave === 'proximos' && b.clientes.length > 0);

  const total = blocos.reduce((soma, b) => soma + b.clientes.length, 0);

  // A ordem da fila é a ordem da tela: retornos atrasados, de hoje, dívida
  // vencida e por fim o programado. É nessa sequência que o Próximo/Anterior da
  // ficha caminha, sem repetir cliente.
  const ordemDaFila = useMemo(() => {
    const ids = [
      ...agora.flatMap((b) => b.clientes.map((c) => c.id)),
      ...emAtraso.map((i) => i.cliente.id),
      ...programado.flatMap((b) => b.clientes.map((c) => c.id)),
    ];
    return [...new Set(ids)];
  }, [agora, emAtraso, programado]);

  const abrirFicha = (cliente: ClienteRow) =>
    navigate(`/clientes/${cliente.id}`, {
      state: estadoDaFila(location.pathname + location.search, ordemDaFila),
    });

  if (isLoading || carregandoDivida) return <CarregandoConteudo />;

  return (
    <div className="space-y-8 animate-fade-in pb-10">
      <PageHeader
        title="Minha fila"
        description="Do mais urgente para o mais distante: compromissos de hoje, inadimplência sem dono e o que já está agendado."
      />

      {erroDivida && (
        <Card className="rounded-2xl border border-warning/40 shadow-card">
          <CardContent className="py-4 text-sm">
            Não foi possível calcular o saldo dos clientes agora. A fila está mostrando
            todos os retornos — inclusive de quem já pagou.
          </CardContent>
        </Card>
      )}

      {total === 0 ? (
        <Card className="rounded-2xl border-none shadow-card">
          <CardContent className="py-16 text-center">
            <CheckCircle2 className="mx-auto mb-3 h-12 w-12 text-success/50" />
            <p className="text-sm font-bold uppercase tracking-widest text-muted-foreground">
              {quitados.length > 0
                ? 'Nada a cobrar: os retornos dos próximos dias já foram pagos'
                : 'Nenhum retorno para os próximos dias'}
            </p>
            <Button variant="outline" className="mt-4" onClick={() => navigate('/clientes')}>
              Ver todos os clientes
            </Button>
          </CardContent>
        </Card>
      ) : (
        <section className="space-y-4">
          <TituloSecao descricao="Compromissos vencidos e de hoje — comece por aqui">
            Para agora
          </TituloSecao>
          {agora.map((bloco) => (
            <BlocoFila key={bloco.chave} bloco={bloco} dividas={divida} onAbrir={abrirFicha} />
          ))}
        </section>
      )}

      {emAtraso.length > 0 && (
        <section className="space-y-4">
          <TituloSecao descricao="Independe de agenda: é a inadimplência da carteira, com os sem retorno na frente">
            Cobrança em aberto
          </TituloSecao>
          <PainelEmAtraso itens={emAtraso} onAbrir={abrirFicha} />
        </section>
      )}

      {programado.length > 0 && (
        <section className="space-y-4">
          <TituloSecao descricao="Já combinado para os próximos dias">
            Programado
          </TituloSecao>
          {programado.map((bloco) => (
            <BlocoFila key={bloco.chave} bloco={bloco} dividas={divida} onAbrir={abrirFicha} />
          ))}
        </section>
      )}

      <QuitadosDaFila clientes={quitados} onAbrir={abrirFicha} />
    </div>
  );
}
