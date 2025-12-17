import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DollarSign, FileText, Clock, CheckCircle, TrendingUp } from 'lucide-react';
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

const COLORS = ['#f59e0b', '#22c55e', '#ef4444', '#3b82f6'];

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

  // Meta mensal configurável (pode ser alterada depois)
  const META_MENSAL = 50000;

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      // Buscar títulos com clientes
      const { data: titulos, error } = await supabase
        .from('titulos')
        .select('*, cliente:clientes(id, nome, cpf_cnpj)');

      if (error) throw error;

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const totalTitulos = titulos?.length || 0;
      const valorTotal = titulos?.reduce((sum, titulo) => sum + Number(titulo.valor), 0) || 0;
      
      // Títulos vencidos (não pagos)
      const titulosVencidosArr = titulos?.filter(titulo => 
        new Date(titulo.vencimento) < today && titulo.status !== 'pago'
      ) || [];
      const titulosVencidos = titulosVencidosArr.length;
      
      // Títulos pagos
      const titulosPagosArr = titulos?.filter(titulo => titulo.status === 'pago') || [];
      const titulosPagos = titulosPagosArr.length;
      const valorRecuperado = titulosPagosArr.reduce((sum, titulo) => sum + Number(titulo.valor), 0);

      // Valor recuperado no mês atual
      const inicioMes = new Date(today.getFullYear(), today.getMonth(), 1);
      const valorRecuperadoMes = titulosPagosArr
        .filter(t => new Date(t.updated_at) >= inicioMes)
        .reduce((sum, t) => sum + Number(t.valor), 0);

      setStats({
        totalTitulos,
        valorTotal,
        titulosVencidos,
        titulosPagos,
        valorRecuperado,
        valorRecuperadoMes,
      });

      // Aging Report - Calcular faixas de atraso
      const aging = calculateAging(titulosVencidosArr, today);
      setAgingData(aging);

      // Próximos vencimentos (7 dias)
      const seteDias = new Date(today);
      seteDias.setDate(seteDias.getDate() + 7);
      
      const proximos = titulos
        ?.filter(t => {
          const venc = new Date(t.vencimento);
          return venc >= today && venc <= seteDias && t.status !== 'pago';
        })
        .map(t => ({
          id: t.id,
          clienteNome: t.cliente?.nome || 'Desconhecido',
          valor: Number(t.valor),
          vencimento: t.vencimento,
          diasRestantes: Math.ceil((new Date(t.vencimento).getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
        }))
        .sort((a, b) => a.diasRestantes - b.diasRestantes) || [];
      
      setProximosVencimentos(proximos);

      // Top Devedores
      const devedoresMap = new Map<string, { nome: string; valor: number; count: number }>();
      titulosVencidosArr.forEach(t => {
        const clienteId = t.cliente_id;
        const clienteNome = t.cliente?.nome || 'Desconhecido';
        const existing = devedoresMap.get(clienteId);
        if (existing) {
          existing.valor += Number(t.valor);
          existing.count += 1;
        } else {
          devedoresMap.set(clienteId, { nome: clienteNome, valor: Number(t.valor), count: 1 });
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

      // Recuperação mensal (últimos 6 meses)
      const recuperacao = calculateRecuperacaoMensal(titulosPagosArr);
      setRecuperacaoMensal(recuperacao);

      // Títulos por status
      const statusCount = (titulos || []).reduce((acc, titulo) => {
        const status = titulo.status || 'em_aberto';
        acc[status] = (acc[status] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      const statusLabels: Record<string, string> = {
        'em_aberto': 'Em Aberto',
        'pago': 'Pago',
        'vencido': 'Vencido',
        'acordo': 'Acordo'
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

  const calculateAging = (titulosVencidos: any[], today: Date): AgingData[] => {
    const ranges = [
      { label: '0-30 dias', min: 0, max: 30, color: '#f59e0b' },
      { label: '31-60 dias', min: 31, max: 60, color: '#f97316' },
      { label: '61-90 dias', min: 61, max: 90, color: '#ef4444' },
      { label: '+90 dias', min: 91, max: 9999, color: '#dc2626' },
    ];

    return ranges.map(range => {
      const filtered = titulosVencidos.filter(t => {
        const diasAtraso = Math.floor((today.getTime() - new Date(t.vencimento).getTime()) / (1000 * 60 * 60 * 24));
        return diasAtraso >= range.min && diasAtraso <= range.max;
      });

      return {
        label: range.label,
        range: `${range.min}-${range.max === 9999 ? '∞' : range.max}`,
        count: filtered.length,
        value: filtered.reduce((sum, t) => sum + Number(t.valor), 0),
        color: range.color
      };
    });
  };

  const calculateRecuperacaoMensal = (titulosPagos: any[]): RecuperacaoMensal[] => {
    return Array.from({ length: 6 }, (_, i) => {
      const date = new Date();
      date.setMonth(date.getMonth() - (5 - i));
      const monthYear = date.toISOString().slice(0, 7);
      
      const valor = titulosPagos
        .filter(t => t.updated_at?.startsWith(monthYear))
        .reduce((sum, t) => sum + Number(t.valor), 0);

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
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  const totalVencido = agingData.reduce((sum, a) => sum + a.value, 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="mobile-heading font-bold">Dashboard</h1>
        <p className="text-muted-foreground mobile-text">
          Visão geral do sistema de cobrança
        </p>
      </div>

      {/* Cards principais */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-5">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs sm:text-sm font-medium">Total de Títulos</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-xl sm:text-2xl font-bold">{stats.totalTitulos}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs sm:text-sm font-medium">Valor Total</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-xl sm:text-2xl font-bold">{formatCurrency(stats.valorTotal)}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs sm:text-sm font-medium">Títulos Vencidos</CardTitle>
            <Clock className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-xl sm:text-2xl font-bold text-destructive">{stats.titulosVencidos}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs sm:text-sm font-medium">Títulos Pagos</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-xl sm:text-2xl font-bold text-green-500">{stats.titulosPagos}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs sm:text-sm font-medium">Valor Recuperado</CardTitle>
            <TrendingUp className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-xl sm:text-2xl font-bold text-green-500">{formatCurrency(stats.valorRecuperado)}</div>
          </CardContent>
        </Card>
      </div>

      {/* Aging Report + Próximos Vencimentos */}
      <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
        <AgingReport data={agingData} totalValue={totalVencido} />
        <ProximosVencimentos vencimentos={proximosVencimentos} />
      </div>

      {/* Top Devedores + Meta de Recuperação */}
      <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
        <TopDevedores devedores={topDevedores} />
        <MetaRecuperacao 
          valorRecuperado={stats.valorRecuperadoMes} 
          meta={META_MENSAL} 
          mesAtual={mesAtual}
        />
      </div>

      {/* Gráficos */}
      <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Evolução da Recuperação</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={recuperacaoMensal}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis tickFormatter={(v) => `R$ ${(v/1000).toFixed(0)}k`} />
                <Tooltip 
                  formatter={(value: number) => [formatCurrency(value), 'Recuperado']}
                />
                <Line 
                  type="monotone" 
                  dataKey="valor" 
                  stroke="hsl(var(--primary))" 
                  strokeWidth={2}
                  dot={{ fill: 'hsl(var(--primary))' }}
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Títulos por Status</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie
                  data={titulosPorStatus}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                >
                  {titulosPorStatus.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Taxas */}
      <div className="grid gap-4 grid-cols-1 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Taxa de Inadimplência</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl sm:text-3xl font-bold text-destructive">
              {stats.totalTitulos > 0 
                ? ((stats.titulosVencidos / stats.totalTitulos) * 100).toFixed(1) 
                : 0}%
            </div>
            <p className="text-sm text-muted-foreground mt-2">
              Percentual de títulos em atraso
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Taxa de Recuperação</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl sm:text-3xl font-bold text-green-500">
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
