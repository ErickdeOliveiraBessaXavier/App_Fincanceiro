import { useMemo } from 'react';
import { PageHeader } from '@/components/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CheckCircle, TrendingUp, AlertTriangle, Wallet, LayoutGrid } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import AgingReport from '@/components/dashboard/AgingReport';
import ProximosVencimentos from '@/components/dashboard/ProximosVencimentos';
import TopDevedores from '@/components/dashboard/TopDevedores';
import StatPillar from '@/components/StatPillar';
import DashboardSkeleton from '@/components/dashboard/DashboardSkeleton';
import { useBaseMetricas } from '@/lib/queries/metricas';
import {
  calcularAging,
  calcularIndicadores,
  calcularTopDevedores,
  listarItensVencidos,
  listarProximosVencimentos,
  prepararBase,
  serieRecuperacaoMensal,
  ultimosMeses,
} from '@/domain/metricas';

/**
 * Resumo executivo da carteira.
 *
 * Todo o cálculo vem de src/domain/metricas — a tela só formata. É o que impede
 * o Dashboard de divergir de Relatórios, que consome exatamente a mesma base.
 */

// TODO(gestor): meta de recuperação ainda é global e fixa. Quando houver a
// definição por empresa, ler de companies em vez desta constante.
const META_MENSAL = 50000;

const formatCurrency = (value: number, compact = false) =>
  new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: compact ? 1 : 0,
    notation: compact ? 'compact' : 'standard',
  }).format(value);

const Dashboard = () => {
  const { data: baseBruta, isLoading, isError } = useBaseMetricas();

  const metricas = useMemo(() => {
    if (!baseBruta) return null;

    // Sem período: o Dashboard é sempre a foto da carteira inteira de hoje.
    const base = prepararBase(baseBruta);
    const itensVencidos = listarItensVencidos(base);

    return {
      indicadores: calcularIndicadores(base),
      // Aging e top devedores saem da MESMA lista de itens vencidos, então os
      // totais das duas seções fecham por construção.
      aging: calcularAging(itensVencidos),
      topDevedores: calcularTopDevedores(itensVencidos),
      // Contagem de PARCELAS vencidas — casa com o valor em R$ ao lado. Contar
      // títulos aqui daria "0 títulos" ao lado de "R$ 1 mil" quando o atraso
      // vem de parcela de acordo, que não deixa o título vencido.
      qtdItensVencidos: itensVencidos.length,
      proximosVencimentos: listarProximosVencimentos(base),
      recuperacaoMensal: serieRecuperacaoMensal(base.recebimentos, ultimosMeses(6)),
    };
  }, [baseBruta]);

  if (isLoading) return <DashboardSkeleton />;

  if (isError || !metricas) {
    return (
      <div className="py-20 text-center">
        <p className="text-sm font-medium text-muted-foreground">
          Não foi possível carregar os indicadores.
        </p>
      </div>
    );
  }

  const { indicadores, aging, topDevedores, proximosVencimentos, recuperacaoMensal, qtdItensVencidos } = metricas;
  const progressoMeta = (indicadores.valorRecuperadoMes / META_MENSAL) * 100;

  return (
    <div className="space-y-10 animate-fade-in pb-10">
      <PageHeader
        title="Resumo Executivo"
        description="Monitoramento de performance e risco da carteira."
      >
        <div className="flex items-center gap-4 bg-card px-6 py-3 rounded-2xl shadow-card border border-border/40">
          <div className="flex flex-col items-end">
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Atualizado em</span>
            <span className="text-sm font-black text-foreground">
              {new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}
            </span>
          </div>
          <div className="h-10 w-[1px] bg-border/60" />
          <LayoutGrid className="h-5 w-5 text-primary" />
        </div>
      </PageHeader>

      {/* 3 Pilares Executivos */}
      <div className="grid gap-6 grid-cols-1 lg:grid-cols-3">
        <StatPillar
          title="Visão da Carteira"
          mainValue={formatCurrency(indicadores.valorTotal, indicadores.valorTotal > 999999)}
          subValue={`${indicadores.totalTitulos} títulos`}
          description="Volume total de ativos sob gestão"
          icon={Wallet}
          variant="default"
        />
        {/* A % e o valor em R$ vêm da MESMA base (valor vencido / valor em
            aberto). Antes a % contava títulos e o R$ somava parcelas. */}
        <StatPillar
          title="Situação de Risco"
          mainValue={indicadores.taxaInadimplencia.toFixed(1) + '%'}
          subValue={formatCurrency(indicadores.valorVencido, true)}
          description={`Vencido sobre a carteira em aberto · ${qtdItensVencidos} ${qtdItensVencidos === 1 ? 'parcela' : 'parcelas'}`}
          icon={AlertTriangle}
          variant="destructive"
          progress={{ value: indicadores.taxaInadimplencia, label: "Exposição ao Risco" }}
        />
        <StatPillar
          title="Eficiência de Recuperação"
          mainValue={indicadores.taxaRecuperacao.toFixed(1) + '%'}
          subValue={formatCurrency(indicadores.valorRecuperado, true)}
          description="Recebido sobre o total que passou pela cobrança"
          icon={CheckCircle}
          variant="success"
          progress={{ value: progressoMeta, label: "Meta Mensal" }}
        />
      </div>

      <div className="grid gap-10 grid-cols-1 xl:grid-cols-12">
        {/* Lado Esquerdo: Saúde e Tendência */}
        <div className="xl:col-span-8 space-y-10">
          <Card className="border-none shadow-card overflow-hidden">
            <CardHeader className="pb-4 border-b border-border/50 bg-muted/20">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-xl font-bold tracking-tight">Evolução da Recuperação</CardTitle>
                  <p className="text-xs text-muted-foreground font-medium mt-1">
                    Recebimentos de títulos e acordos nos últimos 6 meses
                  </p>
                </div>
                <TrendingUp className="h-5 w-5 text-success" />
              </div>
            </CardHeader>
            <CardContent className="pt-8">
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={recuperacaoMensal}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="rotulo" stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} dy={10} />
                  <YAxis tickFormatter={(v) => `R$ ${(v/1000).toFixed(0)}k`} stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} dx={-10} />
                  <Tooltip
                    contentStyle={{ backgroundColor: 'hsl(var(--card))', border: 'none', borderRadius: '16px', boxShadow: 'var(--shadow-card-hover)' }}
                    formatter={(v: number) => [formatCurrency(v), 'Recuperado']}
                  />
                  <Line type="monotone" dataKey="valor" stroke="hsl(var(--primary))" strokeWidth={4} dot={{ r: 6, fill: 'hsl(var(--primary))', strokeWidth: 2, stroke: '#fff' }} />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <AgingReport data={aging} totalValue={indicadores.valorVencido} />
        </div>

        {/* Lado Direito: Centro de Ação Prioritária */}
        <div className="xl:col-span-4 space-y-8">
          <div className="bg-primary/5 rounded-3xl p-1 border border-primary/10">
            <div className="bg-background rounded-[calc(1.5rem-2px)] p-6 space-y-8">
              <div>
                <h3 className="text-lg font-black tracking-tight mb-1">Prioridades de Hoje</h3>
                <p className="text-xs text-muted-foreground font-medium">Ações imediatas para redução de risco</p>
              </div>

              <div className="space-y-10">
                <ProximosVencimentos vencimentos={proximosVencimentos} />
                <div className="h-[1px] bg-border/60 mx-4" />
                <TopDevedores devedores={topDevedores} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
