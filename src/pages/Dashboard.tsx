import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DollarSign, FileText, Clock, CheckCircle, TrendingUp } from 'lucide-react';

interface DashboardStats {
  totalTitulos: number;
  valorTotal: number;
  titulosVencidos: number;
  titulosPagos: number;
  valorRecuperado: number;
}

const Dashboard = () => {
  const [stats, setStats] = useState<DashboardStats>({
    totalTitulos: 0,
    valorTotal: 0,
    titulosVencidos: 0,
    titulosPagos: 0,
    valorRecuperado: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      // Buscar estatísticas dos títulos
      const { data: titulos, error } = await supabase
        .from('titulos')
        .select('valor, vencimento, status');

      if (error) throw error;

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const totalTitulos = titulos?.length || 0;
      const valorTotal = titulos?.reduce((sum, titulo) => sum + Number(titulo.valor), 0) || 0;
      const titulosVencidos = titulos?.filter(titulo => 
        new Date(titulo.vencimento) < today && titulo.status !== 'pago'
      ).length || 0;
      const titulosPagos = titulos?.filter(titulo => titulo.status === 'pago').length || 0;
      const valorRecuperado = titulos?.filter(titulo => titulo.status === 'pago')
        .reduce((sum, titulo) => sum + Number(titulo.valor), 0) || 0;

      setStats({
        totalTitulos,
        valorTotal,
        titulosVencidos,
        titulosPagos,
        valorRecuperado,
      });
    } catch (error) {
      console.error('Erro ao buscar dados do dashboard:', error);
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
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="mobile-heading font-bold">Dashboard</h1>
        <p className="text-muted-foreground mobile-text">
          Visão geral do sistema de cobrança
        </p>
      </div>

      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-5">
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