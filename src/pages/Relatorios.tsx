import { useMemo, useState } from 'react';
import { PageHeader } from '@/components/PageHeader';
import { CarregandoConteudo } from '@/components/TelaCarregamento';
import { Download, TrendingUp, TrendingDown, DollarSign, FileText, FileSpreadsheet, FileIcon, Wallet } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DatePickerWithRange } from '@/components/ui/date-picker';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line } from 'recharts';
import { exportToCSV, exportToExcel, exportToPDF } from '@/utils/export';
import { formatCpfCnpj, formatData } from '@/utils/format';
import { hojeIso } from '@/domain/telecobranca/statusCobranca';
import { useBaseMetricas } from '@/lib/queries/metricas';
import { useDescontosConcedidos, type DescontoConcedido } from '@/lib/queries/descontos';
import { DescontosConcedidos } from '@/components/relatorios/DescontosConcedidos';
import { PagamentosRecebidos } from '@/components/relatorios/PagamentosRecebidos';
import {
  ROTULO_CLASSE,
  agruparPagamentosPorCliente,
  calcularComparativos,
  calcularIndicadores,
  classificarTitulo,
  distribuicaoPorClasse,
  listarRecebimentos,
  mesesDoPeriodo,
  pagoPorTitulo,
  periodoDeIntervalo,
  prepararBase,
  restringirAoUniverso,
  serieAcordosPorVencimento,
  serieTitulosPorVencimento,
  somarRecebimentos,
  somarValorAcordado,
  ultimosMeses,
} from '@/domain/metricas';
import type { ClientePago, Periodo, RecebimentoDetalhado } from '@/domain/metricas';

/**
 * Relatórios operacionais.
 *
 * Consome exatamente a mesma base e as mesmas funções do Dashboard
 * (src/domain/metricas) — é o que garante que os dois não divirjam.
 *
 * Decisões do gestor em 2026-08-06:
 *  * O período recorta por VENCIMENTO ("o que vence no período"), não pela data
 *    de cadastro do título.
 *  * Acordo cancelado não entra em nenhum número (alinhado à página Acordos).
 */

type ExportOptions = Parameters<typeof exportToCSV>[0];
type TipoRelatorio = 'geral' | 'titulos' | 'acordos' | 'recebimentos' | 'descontos';

/** O que já foi pago, pronto para a tela e para a exportação. */
interface Pagamentos {
  recebimentos: RecebimentoDetalhado[];
  clientes: ClientePago[];
  valorTotal: number;
}

function exportarComFormato(format: 'csv' | 'excel' | 'pdf', options: ExportOptions) {
  if (format === 'csv') exportToCSV(options);
  else if (format === 'excel') exportToExcel(options);
  else exportToPDF(options);
}

const COLORS = ['#f59e0b', '#22c55e', '#ef4444', '#3b82f6', '#8b5cf6', '#64748b'];

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

const ComparisonIndicator = ({ value }: { value: number }) => {
  const isPositive = value >= 0;
  return (
    <div className={`flex items-center text-xs ${isPositive ? 'text-green-500' : 'text-destructive'}`}>
      {isPositive ? <TrendingUp className="h-3 w-3 mr-1" /> : <TrendingDown className="h-3 w-3 mr-1" />}
      {isPositive ? '+' : ''}{value.toFixed(1)}% vs mês anterior
    </div>
  );
};

interface IndicadorCardProps {
  titulo: string;
  valor: string;
  icone: typeof FileText;
  corIcone: string;
  comparacao?: number;
  /** Linha curta de escopo, para número cujo recorte não é óbvio. */
  nota?: string;
}

const IndicadorCard = ({ titulo, valor, icone: Icone, corIcone, comparacao, nota }: IndicadorCardProps) => (
  <Card className="border-none shadow-card rounded-2xl overflow-hidden group">
    <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent pointer-events-none" />
    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 relative z-10">
      <CardTitle className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">{titulo}</CardTitle>
      <div className={`h-8 w-8 rounded-lg flex items-center justify-center group-hover:scale-110 transition-transform ${corIcone}`}>
        <Icone className="h-4 w-4" />
      </div>
    </CardHeader>
    <CardContent className="relative z-10">
      <div className="text-3xl font-black tracking-tighter">{valor}</div>
      {comparacao !== undefined && (
        <div className="mt-2">
          <ComparisonIndicator value={comparacao} />
        </div>
      )}
      {nota && <p className="mt-2 text-[11px] font-medium text-muted-foreground">{nota}</p>}
    </CardContent>
  </Card>
);

const CHART_TOOLTIP = {
  backgroundColor: 'hsl(var(--card))',
  border: 'none',
  borderRadius: '12px',
  boxShadow: 'var(--shadow-card-hover)',
};

interface DadosRelatorio {
  base: ReturnType<typeof prepararBase>;
  indicadores: ReturnType<typeof calcularIndicadores>;
  valorAcordado: number;
  distribuicao: ReturnType<typeof distribuicaoPorClasse>;
  titulosPorMes: ReturnType<typeof serieTitulosPorVencimento>;
  acordosPorMes: ReturnType<typeof serieAcordosPorVencimento>;
  comparativos: ReturnType<typeof calcularComparativos>;
}

// ============== Exportação ==============

function colunasEDadosDeAcordos(dados: DadosRelatorio) {
  return {
    title: 'Relatório de Acordos',
    columns: [
      { header: 'Cliente', key: 'clienteNome' },
      { header: 'Valor Original', key: 'valorOriginal' },
      { header: 'Valor Acordo', key: 'valorAcordo' },
      { header: 'Status', key: 'status' },
      { header: 'Data Acordo', key: 'dataAcordo' },
    ],
    data: dados.base.acordos.map((a) => ({
      clienteNome: a.cliente_nome || 'N/A',
      valorOriginal: Number(a.valor_original),
      valorAcordo: Number(a.valor_acordo),
      status: a.status,
      dataAcordo: formatData(a.data_acordo ?? ''),
    })),
    totals: {
      'Total de Acordos': String(dados.base.acordos.length),
      'Valor Total Acordado': formatCurrency(dados.valorAcordado),
    },
  };
}

function colunasEDadosDeTitulos(dados: DadosRelatorio) {
  // O pago sai dos recebimentos, não de `total_pago`: aquele campo ignora o que
  // entrou por parcela de acordo e zerava o pago de todo título renegociado.
  const pago = pagoPorTitulo(dados.base.recebimentos);

  return {
    title: 'Relatório de Títulos',
    columns: [
      { header: 'Cliente', key: 'clienteNome' },
      { header: 'CPF/CNPJ', key: 'cpfCnpj' },
      { header: 'Valor Original', key: 'valor' },
      { header: 'Valor Pago', key: 'valorPago' },
      { header: 'Saldo Devedor', key: 'saldoDevedor' },
      { header: 'Situação', key: 'status' },
    ],
    data: dados.base.titulos.map((t) => ({
      clienteNome: t.cliente_nome || 'N/A',
      cpfCnpj: formatCpfCnpj(t.cliente_cpf_cnpj) || 'N/A',
      valor: Number(t.valor_original),
      valorPago: pago.get(t.id) ?? 0,
      saldoDevedor: Number(t.saldo_devedor),
      status: ROTULO_CLASSE[classificarTitulo(t)],
    })),
    totals: {
      'Total de Títulos': String(dados.indicadores.totalTitulos),
      'Valor Total': formatCurrency(dados.indicadores.valorTotal),
      'Valor Recebido': formatCurrency(dados.indicadores.valorRecuperado),
    },
  };
}

interface Blocos {
  /** Faixa de indicadores no topo — só nas visões de dívida. */
  cards: boolean;
  titulos: boolean;
  acordos: boolean;
  comparativo: boolean;
  graficoAcordos: boolean;
  recebimentos: boolean;
  descontos: boolean;
}

/**
 * Quais blocos cada tipo de relatório mostra. Tabela em vez de cadeia de
 * condições: cada visão nova é uma linha, não um `if` a mais.
 */
const BLOCOS_POR_TIPO: Record<TipoRelatorio, Blocos> = {
  geral: { cards: true, titulos: true, acordos: true, comparativo: true, graficoAcordos: false, recebimentos: false, descontos: false },
  titulos: { cards: true, titulos: true, acordos: false, comparativo: false, graficoAcordos: false, recebimentos: false, descontos: false },
  acordos: { cards: true, titulos: false, acordos: true, comparativo: false, graficoAcordos: true, recebimentos: false, descontos: false },
  recebimentos: { cards: false, titulos: false, acordos: false, comparativo: false, graficoAcordos: false, recebimentos: true, descontos: false },
  descontos: { cards: false, titulos: false, acordos: false, comparativo: false, graficoAcordos: false, recebimentos: false, descontos: true },
};

/** O período do topo recorta por vencimento, menos nos pagamentos (data do caixa). */
function rotuloPeriodo(reportType: TipoRelatorio): string {
  return reportType === 'recebimentos' || reportType === 'descontos'
    ? 'Período (por data do pagamento)'
    : 'Período (por vencimento)';
}

/** Deixa explícito no card que, com filtro, o recebido é o dos títulos do período. */
function notaDoRecebido(periodo?: Periodo): string {
  return periodo ? 'do que vence no período' : 'total pago pelos clientes';
}

function exportarPagamentos(
  format: 'csv' | 'excel' | 'pdf',
  pagamentos: Pagamentos,
  periodo?: Periodo,
) {
  exportarComFormato(format, {
    filename: `relatorio_recebimentos_${hojeIso()}`,
    title: 'Pagamentos recebidos',
    subtitle: periodo
      ? `Recebidos entre ${formatData(periodo.de)} e ${formatData(periodo.ate)}`
      : 'Todos os recebimentos',
    columns: [
      { header: 'Data', key: 'data' },
      { header: 'Cliente', key: 'cliente' },
      { header: 'Valor Pago', key: 'valor' },
      { header: 'Origem', key: 'origem' },
      { header: 'Meio', key: 'meio' },
    ],
    data: pagamentos.recebimentos.map((r) => ({
      data: formatData(r.data),
      cliente: r.clienteNome,
      valor: r.valor,
      origem: r.origem === 'acordo' ? 'Parcela de acordo' : 'Baixa de título',
      meio: r.meioPagamento ?? '',
    })),
    totals: {
      'Pagamentos': String(pagamentos.recebimentos.length),
      'Clientes que pagaram': String(pagamentos.clientes.length),
      'Valor recebido': formatCurrency(pagamentos.valorTotal),
    },
  });
  toast.success(`Relatório exportado em ${format.toUpperCase()}`);
}

function exportarDescontos(
  format: 'csv' | 'excel' | 'pdf',
  descontos: DescontoConcedido[],
  periodo?: Periodo,
) {
  const validos = descontos.filter((d) => !d.estornado);
  exportarComFormato(format, {
    filename: `relatorio_descontos_${hojeIso()}`,
    title: 'Descontos concedidos',
    subtitle: periodo
      ? `Concedidos entre ${formatData(periodo.de)} e ${formatData(periodo.ate)}`
      : 'Todos os registros',
    columns: [
      { header: 'Data', key: 'data' },
      { header: 'Cliente', key: 'cliente' },
      { header: 'Valor', key: 'valor' },
      { header: 'Acima do teto', key: 'excecao' },
      { header: 'Concedido por', key: 'por' },
      { header: 'Motivo', key: 'motivo' },
    ],
    data: descontos.map((d) => ({
      data: formatData(d.data_evento),
      cliente: d.cliente_nome || 'N/A',
      valor: Number(d.valor),
      excecao: d.excedeu_teto ? 'Sim' : 'Não',
      por: d.concedido_por || 'N/A',
      motivo: d.descricao || '',
    })),
    totals: {
      'Descontos concedidos': String(validos.length),
      'Valor total': formatCurrency(validos.reduce((s, d) => s + Number(d.valor), 0)),
      'Acima do teto': String(validos.filter((d) => d.excedeu_teto).length),
    },
  });
  toast.success(`Relatório exportado em ${format.toUpperCase()}`);
}

function exportarRelatorio(
  format: 'csv' | 'excel' | 'pdf',
  reportType: TipoRelatorio,
  dados: DadosRelatorio,
  periodo?: Periodo,
) {
  const conteudo =
    reportType === 'acordos' ? colunasEDadosDeAcordos(dados) : colunasEDadosDeTitulos(dados);

  exportarComFormato(format, {
    filename: `relatorio_${reportType}_${hojeIso()}`,
    subtitle: periodo
      ? `Vencimento entre ${formatData(periodo.de)} e ${formatData(periodo.ate)}`
      : 'Todos os registros',
    ...conteudo,
  });
  toast.success(`Relatório exportado em ${format.toUpperCase()}`);
}

// ============== Blocos da tela ==============

interface CardsProps {
  dados: DadosRelatorio;
  mostraTitulos: boolean;
  mostraAcordos: boolean;
  comparacaoVisivel: boolean;
  /** Some quando há período: o recorte do recebido não é o mesmo dos títulos. */
  notaRecebido?: string;
}

const CardsIndicadores = ({ dados, mostraTitulos, mostraAcordos, comparacaoVisivel, notaRecebido }: CardsProps) => {
  const { indicadores, comparativos, base, valorAcordado } = dados;
  const comparacao = (valor: number) => (comparacaoVisivel ? valor : undefined);

  // auto-fit em vez de 4 colunas fixas: a faixa fecha certo com 2, 3 ou 5 cards.
  return (
    <div className="grid gap-6 grid-cols-1 sm:grid-cols-[repeat(auto-fit,minmax(220px,1fr))]">
      {mostraTitulos && (
        <>
          <IndicadorCard
            titulo="Total de Títulos"
            valor={String(indicadores.totalTitulos)}
            icone={FileText}
            corIcone="bg-primary/10 text-primary"
            comparacao={comparacao(comparativos.titulos)}
          />
          <IndicadorCard
            titulo="Valor Total"
            valor={formatCurrency(indicadores.valorTotal)}
            icone={DollarSign}
            corIcone="bg-primary/10 text-primary"
            comparacao={comparacao(comparativos.valor)}
          />
          <IndicadorCard
            titulo="Já Recebido"
            valor={formatCurrency(indicadores.valorRecuperado)}
            icone={Wallet}
            corIcone="bg-success/10 text-success"
            nota={notaRecebido}
          />
        </>
      )}
      {mostraAcordos && (
        <>
          <IndicadorCard
            titulo="Total de Acordos"
            valor={String(base.acordos.length)}
            icone={FileText}
            corIcone="bg-blue-500/10 text-blue-600"
            comparacao={comparacao(comparativos.acordos)}
          />
          <IndicadorCard
            titulo="Valor Acordado"
            valor={formatCurrency(valorAcordado)}
            icone={DollarSign}
            corIcone="bg-success/10 text-success"
            comparacao={comparacao(comparativos.valorAcordos)}
          />
        </>
      )}
    </div>
  );
};

const GraficosDeTitulos = ({ dados }: { dados: DadosRelatorio }) => (
  <>
    <Card className="border-none shadow-card rounded-2xl overflow-hidden">
      <CardHeader className="pb-4 border-b border-border/50 bg-muted/20">
        <CardTitle className="text-lg font-bold tracking-tight">Títulos por Situação</CardTitle>
        <CardDescription className="text-xs font-medium">
          Acordo cumprido e quebrado aparecem separados de "Pago"
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-6">
        <ResponsiveContainer width="100%" height={320}>
          <PieChart>
            <Pie data={dados.distribuicao} cx="50%" cy="50%" innerRadius={60} outerRadius={90} paddingAngle={8} dataKey="value">
              {dados.distribuicao.map((entry, index) => (
                <Cell
                  key={entry.name}
                  fill={COLORS[index % COLORS.length]}
                  className="stroke-background hover:opacity-80 transition-opacity outline-none"
                  strokeWidth={4}
                />
              ))}
            </Pie>
            <Tooltip contentStyle={CHART_TOOLTIP} />
          </PieChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>

    <Card className="border-none shadow-card rounded-2xl overflow-hidden">
      <CardHeader className="pb-4 border-b border-border/50 bg-muted/20">
        <CardTitle className="text-lg font-bold tracking-tight">Títulos por Mês</CardTitle>
        <CardDescription className="text-xs font-medium">Títulos com parcela vencendo no mês</CardDescription>
      </CardHeader>
      <CardContent className="pt-6">
        <ResponsiveContainer width="100%" height={320}>
          <BarChart data={dados.titulosPorMes}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
            <XAxis dataKey="rotulo" fontSize={12} tickLine={false} axisLine={false} dy={10} />
            <YAxis fontSize={12} tickLine={false} axisLine={false} dx={-10} />
            <Tooltip cursor={{ fill: 'hsl(var(--muted)/0.4)' }} contentStyle={CHART_TOOLTIP} />
            <Bar dataKey="quantidade" name="Títulos" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} barSize={40} />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  </>
);

const GraficoComparativo = ({ dados }: { dados: DadosRelatorio }) => (
  <Card className="md:col-span-2 border-none shadow-card rounded-2xl overflow-hidden">
    <CardHeader className="pb-4 border-b border-border/50 bg-muted/20">
      <div className="flex items-center justify-between">
        <div>
          <CardTitle className="text-lg font-bold tracking-tight">Comparativo: Títulos vs Acordos</CardTitle>
          <CardDescription className="text-xs font-medium">
            Volume mensal por vencimento, nas duas frentes
          </CardDescription>
        </div>
        <TrendingUp className="h-5 w-5 text-primary" />
      </div>
    </CardHeader>
    <CardContent className="pt-8">
      <ResponsiveContainer width="100%" height={320}>
        <LineChart
          data={dados.titulosPorMes.map((item, index) => ({
            ...item,
            acordos: dados.acordosPorMes[index]?.quantidade ?? 0,
          }))}
        >
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
          <XAxis dataKey="rotulo" fontSize={12} tickLine={false} axisLine={false} dy={10} />
          <YAxis fontSize={12} tickLine={false} axisLine={false} dx={-10} />
          <Tooltip contentStyle={CHART_TOOLTIP} />
          <Line type="monotone" dataKey="quantidade" stroke="hsl(var(--primary))" name="Títulos" strokeWidth={4} dot={{ r: 6, fill: 'hsl(var(--primary))', stroke: '#fff', strokeWidth: 2 }} />
          <Line type="monotone" dataKey="acordos" stroke="#22c55e" name="Acordos" strokeWidth={4} dot={{ r: 6, fill: '#22c55e', stroke: '#fff', strokeWidth: 2 }} />
        </LineChart>
      </ResponsiveContainer>
    </CardContent>
  </Card>
);

const GraficoDeAcordos = ({ dados }: { dados: DadosRelatorio }) => (
  <Card className="md:col-span-2 border-none shadow-card rounded-2xl overflow-hidden">
    <CardHeader className="pb-4 border-b border-border/50 bg-muted/20">
      <CardTitle className="text-lg font-bold tracking-tight">Acordos por Mês</CardTitle>
      <CardDescription className="text-xs font-medium">Acordos com parcela vencendo no mês</CardDescription>
    </CardHeader>
    <CardContent className="pt-6">
      <ResponsiveContainer width="100%" height={320}>
        <BarChart data={dados.acordosPorMes}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
          <XAxis dataKey="rotulo" fontSize={12} tickLine={false} axisLine={false} dy={10} />
          <YAxis fontSize={12} tickLine={false} axisLine={false} dx={-10} />
          <Tooltip cursor={{ fill: 'hsl(var(--muted)/0.4)' }} contentStyle={CHART_TOOLTIP} />
          <Bar dataKey="quantidade" name="Acordos" fill="#22c55e" radius={[6, 6, 0, 0]} barSize={40} />
        </BarChart>
      </ResponsiveContainer>
    </CardContent>
  </Card>
);

interface BlocosProps {
  blocos: Blocos;
  dados: DadosRelatorio;
  pagamentos: Pagamentos;
  descontos: DescontoConcedido[];
}

/** A grade de blocos, separada da página para não somar complexidade nela. */
const BlocosDoRelatorio = ({ blocos, dados, pagamentos, descontos }: BlocosProps) => (
  <div className="grid gap-10 grid-cols-1 md:grid-cols-2">
    {blocos.titulos && <GraficosDeTitulos dados={dados} />}
    {blocos.comparativo && <GraficoComparativo dados={dados} />}
    {blocos.graficoAcordos && <GraficoDeAcordos dados={dados} />}
    {blocos.recebimentos && (
      <PagamentosRecebidos
        recebimentos={pagamentos.recebimentos}
        clientes={pagamentos.clientes}
        valorTotal={pagamentos.valorTotal}
      />
    )}
    {blocos.descontos && <DescontosConcedidos descontos={descontos} />}
  </div>
);

export default function Relatorios() {
  const [reportType, setReportType] = useState<TipoRelatorio>('geral');
  const [dateRange, setDateRange] = useState<{ from: Date; to: Date } | undefined>();
  const { data: baseBruta, isLoading, isError } = useBaseMetricas();

  const periodo: Periodo | undefined = useMemo(
    () => (dateRange?.from && dateRange?.to ? periodoDeIntervalo(dateRange.from, dateRange.to) : undefined),
    [dateRange],
  );

  const dados = useMemo(() => {
    if (!baseBruta) return null;

    const base = prepararBase(baseBruta, periodo);
    // Os meses do gráfico acompanham o filtro; sem filtro, os últimos 6.
    const meses = periodo ? mesesDoPeriodo(periodo) : ultimosMeses(6);

    return {
      base,
      indicadores: calcularIndicadores(base),
      valorAcordado: somarValorAcordado(base.acordos),
      distribuicao: distribuicaoPorClasse(base.titulos),
      titulosPorMes: serieTitulosPorVencimento(base, meses),
      acordosPorMes: serieAcordosPorVencimento(base, meses),
      // O comparativo mensal é sempre sobre o universo inteiro — comparar com o
      // "mês anterior" dentro de um período arbitrário não faria sentido.
      comparativos: calcularComparativos(restringirAoUniverso(baseBruta)),
    };
  }, [baseBruta, periodo]);

  // Os pagamentos NÃO passam por `prepararBase`: o período deles é a data do
  // recebimento, não o vencimento. E o "em aberto" de cada cliente é lido da
  // base inteira, para responder "ainda deve alguma coisa hoje?".
  const pagamentos: Pagamentos = useMemo(() => {
    if (!baseBruta) return { recebimentos: [], clientes: [], valorTotal: 0 };
    const universo = restringirAoUniverso(baseBruta);
    const recebimentos = listarRecebimentos(universo, periodo);
    return {
      recebimentos,
      clientes: agruparPagamentosPorCliente(recebimentos, universo),
      valorTotal: somarRecebimentos(recebimentos),
    };
  }, [baseBruta, periodo]);

  // A lista de descontos tem consulta própria: não sai da base de métricas,
  // que é sobre dívida, não sobre concessão.
  const { data: descontos = [] } = useDescontosConcedidos(periodo);

  const handleExport = (format: 'csv' | 'excel' | 'pdf') => {
    if (reportType === 'descontos') return exportarDescontos(format, descontos, periodo);
    if (reportType === 'recebimentos') return exportarPagamentos(format, pagamentos, periodo);
    if (dados) exportarRelatorio(format, reportType, dados, periodo);
  };

  if (isLoading) return <CarregandoConteudo />;

  if (isError || !dados) {
    return (
      <div className="py-20 text-center">
        <p className="text-sm font-medium text-muted-foreground">
          Não foi possível carregar os dados do relatório.
        </p>
      </div>
    );
  }

  const blocos = BLOCOS_POR_TIPO[reportType];
  // O comparativo é mês-a-mês; com um período arbitrário selecionado ele viraria
  // uma comparação entre bases diferentes, então some.
  const comparacaoVisivel = !periodo;

  return (
    <div className="space-y-10 animate-fade-in pb-10">
      <PageHeader title="Relatórios" description="Análise de desempenho operacional e financeiro.">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button>
              <Download className="h-4 w-4 mr-2" />
              Exportar
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="rounded-xl shadow-card border-border/40">
            <DropdownMenuItem onClick={() => handleExport('csv')} className="rounded-lg m-1 font-medium">
              <FileText className="h-4 w-4 mr-2" />
              Exportar CSV
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleExport('excel')} className="rounded-lg m-1 font-medium">
              <FileSpreadsheet className="h-4 w-4 mr-2" />
              Exportar Excel
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleExport('pdf')} className="rounded-lg m-1 font-medium">
              <FileIcon className="h-4 w-4 mr-2" />
              Exportar PDF
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </PageHeader>

      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center bg-card/50 backdrop-blur-sm p-4 rounded-2xl border border-border/50">
        <div className="flex flex-col gap-1.5 flex-1 w-full sm:w-auto">
          <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest ml-1">Tipo de Visão</label>
          <Select value={reportType} onValueChange={(v) => setReportType(v as TipoRelatorio)}>
            <SelectTrigger className="w-full sm:w-56 rounded-xl bg-background">
              <SelectValue placeholder="Tipo de relatório" />
            </SelectTrigger>
            <SelectContent className="rounded-xl">
              <SelectItem value="geral">Relatório Geral</SelectItem>
              <SelectItem value="titulos">Títulos</SelectItem>
              <SelectItem value="acordos">Acordos</SelectItem>
              <SelectItem value="recebimentos">Pagamentos recebidos</SelectItem>
              <SelectItem value="descontos">Descontos</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1.5 w-full sm:w-auto">
          <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest ml-1">
            {rotuloPeriodo(reportType)}
          </label>
          <DatePickerWithRange date={dateRange} onDateChange={setDateRange} />
        </div>
      </div>

      {blocos.cards && (
        <CardsIndicadores
          dados={dados}
          mostraTitulos={blocos.titulos}
          mostraAcordos={blocos.acordos}
          comparacaoVisivel={comparacaoVisivel}
          notaRecebido={notaDoRecebido(periodo)}
        />
      )}

      <BlocosDoRelatorio
        blocos={blocos}
        dados={dados}
        pagamentos={pagamentos}
        descontos={descontos}
      />
    </div>
  );
}
