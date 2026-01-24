import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DollarSign, FileText, Clock, CheckCircle, TrendingUp, AlertTriangle } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import AgingReport from '@/components/dashboard/AgingReport';
import ProximosVencimentos from '@/components/dashboard/ProximosVencimentos';
import TopDevedores from '@/components/dashboard/TopDevedores';
import MetaRecuperacao from '@/components/dashboard/MetaRecuperacao';

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

interface TituloPorStatus {
  name: string;
  value: number;
}

interface TituloConsolidado {
  id: string;
  cliente_id: string;
  valor_original: number;
  vencimento_original: string;
  cliente_nome: string;
  cliente_cpf_cnpj: string;
  quantidade_parcelas: number;
  tipo: string;
  saldo_devedor: number;
  total_pago: number;
  parcelas_pagas: number;
  parcelas_vencidas: number;
  parcelas_pendentes: number;
  status: string;
  proximo_vencimento: string | null;
  updated_at: string;
}

const COLORS = ['hsl(262, 83%, 58%)', 'hsl(142, 71%, 45%)', 'hsl(0, 84%, 60%)', 'hsl(25, 95%, 53%)'];

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
  const [titulosPorStatus, setTitulosPorStatus] = useState<TituloPorStatus[]>([]);
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
      
      const titulosVencidosArr = titulosData.filter(t => t.status === 'inadimplente');
      const titulosVencidos = titulosVencidosArr.length;
      
      const titulosPagosArr = titulosData.filter(t => t.status === 'quitado');
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
        .from('mv_parcelas_consolidadas')
        .select('*')
        .eq('status', 'vencida');

      const parcelasVencidas = parcelasData || [];
      const aging = calculateAging(parcelasVencidas, today);
      setAgingData(aging);

      const seteDias = new Date(today);
      seteDias.setDate(seteDias.getDate() + 7);
      
      const proximos = titulosData
        .filter(t => {
          if (!t.proximo_vencimento) return false;
          const venc = new Date(t.proximo_vencimento);
          return venc >= today && venc <= seteDias && t.status === 'ativo';
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

      const statusCount = titulosData.reduce((acc, titulo) => {
        const status = titulo.status || 'ativo';
        acc[status] = (acc[status] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      const statusLabels: Record<string, string> = {
        'ativo': 'Ativo',
        'quitado': 'Quitado',
        'inadimplente': 'Inadimplente',
        'sem_parcelas': 'Sem Parcelas'
      };

      setTitulosPorStatus(
        Object.entries(statusCount).map(([status, count]) => ({
          name: statusLabels[status] || status,
          value: count
        }))
      );

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

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(value);
  };

  const mesAtual = new Date().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex flex-col items-center gap-4">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
          <p className="text-sm text-muted-foreground">Carregando dados...</p>
        </div>
      </div>
    );
  }

  const totalVencido = agingData.reduce((sum, a) => sum + a.value, 0);

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Dashboard</h1>
          <p className="text-muted-foreground mt-1">
            Visão geral do sistema de cobrança
          </p>
        </div>
        <div className="text-sm text-muted-foreground bg-muted px-4 py-2 rounded-xl">
          {new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-5">
        <Card className="relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent pointer-events-none" />
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground">Total de Títulos</CardTitle>
            <div className="h-8 w-8 rounded-xl bg-primary/10 flex items-center justify-center">
              <FileText className="h-4 w-4 text-primary" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl sm:text-3xl font-bold">{stats.totalTitulos}</div>
            <p className="text-xs text-muted-foreground mt-1">títulos cadastrados</p>
          </CardContent>
        </Card>

        <Card className="relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent pointer-events-none" />
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground">Valor Total</CardTitle>
            <div className="h-8 w-8 rounded-xl bg-primary/10 flex items-center justify-center">
              <DollarSign className="h-4 w-4 text-primary" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-xl sm:text-2xl font-bold">{formatCurrency(stats.valorTotal)}</div>
            <p className="text-xs text-muted-foreground mt-1">em carteira</p>
          </CardContent>
        </Card>

        <Card className="relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-destructive/5 to-transparent pointer-events-none" />
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground">Inadimplentes</CardTitle>
            <div className="h-8 w-8 rounded-xl bg-destructive/10 flex items-center justify-center">
              <AlertTriangle className="h-4 w-4 text-destructive" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl sm:text-3xl font-bold text-destructive">{stats.titulosVencidos}</div>
            <p className="text-xs text-muted-foreground mt-1">requerem atenção</p>
          </CardContent>
        </Card>

        <Card className="relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-success/5 to-transparent pointer-events-none" />
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground">Quitados</CardTitle>
            <div className="h-8 w-8 rounded-xl bg-success/10 flex items-center justify-center">
              <CheckCircle className="h-4 w-4 text-success" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl sm:text-3xl font-bold text-success">{stats.titulosPagos}</div>
            <p className="text-xs text-muted-foreground mt-1">pagamentos recebidos</p>
          </CardContent>
        </Card>

        <Card className="relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-success/5 to-transparent pointer-events-none" />
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground">Valor Recuperado</CardTitle>
            <div className="h-8 w-8 rounded-xl bg-success/10 flex items-center justify-center">
              <TrendingUp className="h-4 w-4 text-success" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-xl sm:text-2xl font-bold text-success">{formatCurrency(stats.valorRecuperado)}</div>
            <p className="text-xs text-muted-foreground mt-1">total recuperado</p>
          </CardContent>
        </Card>
      </div>

      {/* Aging Report + Próximos Vencimentos */}
      <div className="grid gap-6 grid-cols-1 lg:grid-cols-2">
        <AgingReport data={agingData} totalValue={totalVencido} />
        <ProximosVencimentos vencimentos={proximosVencimentos} />
      </div>

      {/* Top Devedores + Meta de Recuperação */}
      <div className="grid gap-6 grid-cols-1 lg:grid-cols-2">
        <TopDevedores devedores={topDevedores} />
        <MetaRecuperacao 
          valorRecuperado={stats.valorRecuperadoMes} 
          meta={META_MENSAL} 
          mesAtual={mesAtual}
        />
      </div>

      {/* Gráficos */}
      <div className="grid gap-6 grid-cols-1 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg font-semibold">Evolução da Recuperação</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={recuperacaoMensal}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="month" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                <YAxis tickFormatter={(v) => `R$ ${(v/1000).toFixed(0)}k`} stroke="hsl(var(--muted-foreground))" fontSize={12} />
                <Tooltip 
                  formatter={(value: number) => [formatCurrency(value), 'Recuperado']}
                  contentStyle={{
                    backgroundColor: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '12px',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
                  }}
                />
                <Line 
                  type="monotone" 
                  dataKey="valor" 
                  stroke="hsl(262, 83%, 58%)" 
                  strokeWidth={3}
                  dot={{ fill: 'hsl(262, 83%, 58%)', strokeWidth: 2, r: 5 }}
                  activeDot={{ r: 7, fill: 'hsl(262, 83%, 58%)' }}
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg font-semibold">Títulos por Status</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie
                  data={titulosPorStatus}
                  cx="50%"
                  cy="50%"
                  innerRadius={70}
                  outerRadius={100}
                  paddingAngle={4}
                  dataKey="value"
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  labelLine={{ stroke: 'hsl(var(--muted-foreground))' }}
                >
                  {titulosPorStatus.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip 
                  contentStyle={{
                    backgroundColor: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '12px'
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Taxas */}
      <div className="grid gap-6 grid-cols-1 md:grid-cols-2">
        <Card className="relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-destructive/5 to-transparent pointer-events-none" />
          <CardHeader>
            <CardTitle className="text-lg font-semibold">Taxa de Inadimplência</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold text-destructive">
              {stats.totalTitulos > 0 
                ? ((stats.titulosVencidos / stats.totalTitulos) * 100).toFixed(1) 
                : 0}%
            </div>
            <p className="text-sm text-muted-foreground mt-2">
              Percentual de títulos inadimplentes
            </p>
          </CardContent>
        </Card>

        <Card className="relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-success/5 to-transparent pointer-events-none" />
          <CardHeader>
            <CardTitle className="text-lg font-semibold">Taxa de Recuperação</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold text-success">
              {stats.valorTotal > 0 
                ? ((stats.valorRecuperado / stats.valorTotal) * 100).toFixed(1) 
                : 0}%
            </div>
            <p className="text-sm text-muted-foreground mt-2">
              Percentual do valor total recuperado
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Dashboard;