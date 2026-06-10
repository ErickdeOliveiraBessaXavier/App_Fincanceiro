import { useEffect, useState } from 'react';
import { PageHeader } from '@/components/PageHeader';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DollarSign, CheckCircle, TrendingUp, AlertTriangle, Wallet, LayoutGrid } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import AgingReport from '@/components/dashboard/AgingReport';
import ProximosVencimentos from '@/components/dashboard/ProximosVencimentos';
import TopDevedores from '@/components/dashboard/TopDevedores';
import StatPillar from '@/components/StatPillar';
import DashboardSkeleton from '@/components/dashboard/DashboardSkeleton';

interface DashboardStats {
  totalTitulos: number;
  valorTotal: number;
  titulosVencidos: number;
  titulosPagos: number;
  valorRecuperado: number;
  valorRecuperadoMes: number;
}

interface AgingData {
  label: string;
  range: string;
  count: number;
  value: number;
  color: string;
}

interface Vencimento {
  id: string;
  clienteNome: string;
  valor: number;
  vencimento: string;
  diasRestantes: number;
}

interface Devedor {
  clienteId: string;
  clienteNome: string;
  totalValor: number;
  totalTitulos: number;
}

interface RecuperacaoMensal {
  month: string;
  valor: number;
}

interface TituloConsolidado {
  id: string;
  valor_original: number;
  saldo_devedor: number;
  total_pago: number;
  status: string;
  proximo_vencimento: string | null;
  updated_at: string;
  cliente_nome: string;
  cliente_id: string;
}

const Dashboard = () => {
  const [stats, setStats] = useState<DashboardStats>({
    totalTitulos: 0,
    valorTotal: 0,
    titulosVencidos: 0,
    titulosPagos: 0,
    valorRecuperado: 0,
    valorRecuperadoMes: 0,
  });
  const [agingData, setAgingData] = useState<AgingData[]>([]);
  const [proximosVencimentos, setProximosVencimentos] = useState<Vencimento[]>([]);
  const [topDevedores, setTopDevedores] = useState<Devedor[]>([]);
  const [recuperacaoMensal, setRecuperacaoMensal] = useState<RecuperacaoMensal[]>([]);
  const [loading, setLoading] = useState(true);

  const META_MENSAL = 50000;

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      const { data: titulos, error } = await supabase
        .from('vw_titulos_completos')
        .select('*');

      if (error) throw error;

      const titulosData = (titulos || []) as TituloConsolidado[];
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const totalTitulos = titulosData.length;
      const valorTotal = titulosData.reduce((sum, t) => sum + Number(t.valor_original), 0);
      
      const titulosVencidosArr = titulosData.filter(t => t.status === 'vencido');
      const titulosVencidos = titulosVencidosArr.length;

      const titulosPagosArr = titulosData.filter(t => t.status === 'pago');
      const titulosPagos = titulosPagosArr.length;
      const valorRecuperado = titulosPagosArr.reduce((sum, t) => sum + Number(t.total_pago), 0);

      const inicioMes = new Date(today.getFullYear(), today.getMonth(), 1);
      const valorRecuperadoMes = titulosPagosArr
        .filter(t => new Date(t.updated_at) >= inicioMes)
        .reduce((sum, t) => sum + Number(t.total_pago), 0);

      setStats({
        totalTitulos,
        valorTotal,
        titulosVencidos,
        titulosPagos,
        valorRecuperado,
        valorRecuperadoMes,
      });

      const { data: parcelasData } = await supabase
        .from('vw_parcelas_consolidadas')
        .select('*')
        .eq('status', 'vencido');

      const parcelasVencidas = parcelasData || [];
      const aging = calculateAging(parcelasVencidas, today);
      setAgingData(aging);

      const seteDias = new Date(today);
      seteDias.setDate(seteDias.getDate() + 7);
      
      const proximos = titulosData
        .filter(t => {
          if (!t.proximo_vencimento) return false;
          const venc = new Date(t.proximo_vencimento);
          return venc >= today && venc <= seteDias && t.status === 'a_vencer';
        })
        .map(t => ({
          id: t.id,
          clienteNome: t.cliente_nome || 'Desconhecido',
          valor: Number(t.saldo_devedor),
          vencimento: t.proximo_vencimento!,
          diasRestantes: Math.ceil((new Date(t.proximo_vencimento!).getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
        }))
        .sort((a, b) => a.diasRestantes - b.diasRestantes);
      
      setProximosVencimentos(proximos);

      const devedoresMap = new Map<string, { nome: string; valor: number; count: number }>();
      titulosVencidosArr.forEach(t => {
        const clienteId = t.cliente_id;
        const clienteNome = t.cliente_nome || 'Desconhecido';
        const existing = devedoresMap.get(clienteId);
        if (existing) {
          existing.valor += Number(t.saldo_devedor);
          existing.count += 1;
        } else {
          devedoresMap.set(clienteId, { nome: clienteNome, valor: Number(t.saldo_devedor), count: 1 });
        }
      });

      const devedores = Array.from(devedoresMap.entries())
        .map(([id, data]) => ({
          clienteId: id,
          clienteNome: data.nome,
          totalValor: data.valor,
          totalTitulos: data.count
        }))
        .sort((a, b) => b.totalValor - a.totalValor)
        .slice(0, 5);

      setTopDevedores(devedores);

      const recuperacao = calculateRecuperacaoMensal(titulosPagosArr);
      setRecuperacaoMensal(recuperacao);

    } catch (error) {
      console.error('Erro ao buscar dados do dashboard:', error);
    } finally {
      setLoading(false);
    }
  };

  const calculateAging = (parcelasVencidas: any[], today: Date): AgingData[] => {
    const ranges = [
      { label: '0-30 dias', min: 0, max: 30, color: 'hsl(38, 92%, 50%)' },
      { label: '31-60 dias', min: 31, max: 60, color: 'hsl(25, 95%, 53%)' },
      { label: '61-90 dias', min: 61, max: 90, color: 'hsl(0, 84%, 60%)' },
      { label: '+90 dias', min: 91, max: 9999, color: 'hsl(0, 72%, 51%)' },
    ];

    return ranges.map(range => {
      const filtered = parcelasVencidas.filter(p => {
        const diasAtraso = Math.floor((today.getTime() - new Date(p.vencimento).getTime()) / (1000 * 60 * 60 * 24));
        return diasAtraso >= range.min && diasAtraso <= range.max;
      });

      return {
        label: range.label,
        range: `${range.min}-${range.max === 9999 ? '∞' : range.max}`,
        count: filtered.length,
        value: filtered.reduce((sum, p) => sum + Number(p.saldo_atual), 0),
        color: range.color
      };
    });
  };

  const calculateRecuperacaoMensal = (titulosPagos: TituloConsolidado[]): RecuperacaoMensal[] => {
    return Array.from({ length: 6 }, (_, i) => {
      const date = new Date();
      date.setMonth(date.getMonth() - (5 - i));
      const monthYear = date.toISOString().slice(0, 7);
      
      const valor = titulosPagos
        .filter(t => t.updated_at?.startsWith(monthYear))
        .reduce((sum, t) => sum + Number(t.total_pago), 0);

      return {
        month: date.toLocaleDateString('pt-BR', { month: 'short' }),
        valor
      };
    });
  };

  const formatCurrency = (value: number, compact = false) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
      maximumFractionDigits: compact ? 1 : 0,
      notation: compact ? 'compact' : 'standard',
    }).format(value);
  };

  if (loading) return <DashboardSkeleton />;

  const totalVencido = agingData.reduce((sum, a) => sum + a.value, 0);
  const taxaInadimplencia = stats.totalTitulos > 0 ? (stats.titulosVencidos / stats.totalTitulos) * 100 : 0;
  const taxaRecuperacao = stats.valorTotal > 0 ? (stats.valorRecuperado / stats.valorTotal) * 100 : 0;
  const progressoMeta = (stats.valorRecuperadoMes / META_MENSAL) * 100;

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
          mainValue={formatCurrency(stats.valorTotal, stats.valorTotal > 999999)}
          subValue={`${stats.totalTitulos} títulos`}
          description="Volume total de ativos sob gestão"
          icon={Wallet}
          variant="default"
        />
        <StatPillar
          title="Situação de Risco"
          mainValue={taxaInadimplencia.toFixed(1) + '%'}
          subValue={formatCurrency(totalVencido, true)}
          description="Inadimplência sobre a base total"
          icon={AlertTriangle}
          variant="destructive"
          progress={{ value: taxaInadimplencia, label: "Exposição ao Risco" }}
        />
        <StatPillar
          title="Eficiência de Recuperação"
          mainValue={taxaRecuperacao.toFixed(1) + '%'}
          subValue={formatCurrency(stats.valorRecuperado, true)}
          description="Performance global de cobrança"
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
                  <p className="text-xs text-muted-foreground font-medium mt-1">Tendência de recebimento nos últimos 6 meses</p>
                </div>
                <TrendingUp className="h-5 w-5 text-success" />
              </div>
            </CardHeader>
            <CardContent className="pt-8">
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={recuperacaoMensal}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="month" stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} dy={10} />
                  <YAxis tickFormatter={(v) => `R$ ${(v/1000).toFixed(0)}k`} stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} dx={-10} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: 'hsl(var(--card))', border: 'none', borderRadius: '16px', boxShadow: 'var(--shadow-card-hover)' }}
                    formatter={(v: any) => [formatCurrency(v), 'Recuperado']}
                  />
                  <Line type="monotone" dataKey="valor" stroke="hsl(var(--primary))" strokeWidth={4} dot={{ r: 6, fill: 'hsl(var(--primary))', strokeWidth: 2, stroke: '#fff' }} />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <AgingReport data={agingData} totalValue={totalVencido} />
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
