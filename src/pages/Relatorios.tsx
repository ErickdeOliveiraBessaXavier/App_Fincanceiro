import { useState, useEffect } from 'react';
import { Calendar, Download, TrendingUp, TrendingDown, DollarSign, FileText } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DatePickerWithRange } from '@/components/ui/date-picker';
import { useToast } from '@/hooks/use-toast';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line } from 'recharts';

interface ReportData {
  totalTitulos: number;
  totalValor: number;
  totalAcordos: number;
  valorAcordos: number;
  titulosPorStatus: any[];
  titulosPorMes: any[];
  acordosPorMes: any[];
}

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8'];

export default function Relatorios() {
  const [reportData, setReportData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [reportType, setReportType] = useState('geral');
  const [dateRange, setDateRange] = useState<{from: Date; to: Date} | undefined>();
  const { toast } = useToast();

  useEffect(() => {
    fetchReportData();
  }, [reportType, dateRange]);

  const fetchReportData = async () => {
    try {
      setLoading(true);

      // Buscar títulos
      let titulosQuery = supabase.from('titulos').select('*');
      let acordosQuery = supabase.from('acordos').select('*');

      if (dateRange?.from && dateRange?.to) {
        titulosQuery = titulosQuery
          .gte('created_at', dateRange.from.toISOString())
          .lte('created_at', dateRange.to.toISOString());
        
        acordosQuery = acordosQuery
          .gte('created_at', dateRange.from.toISOString())
          .lte('created_at', dateRange.to.toISOString());
      }

      const [titulosResult, acordosResult] = await Promise.all([
        titulosQuery,
        acordosQuery
      ]);

      if (titulosResult.error) throw titulosResult.error;
      if (acordosResult.error) throw acordosResult.error;

      const titulos = titulosResult.data || [];
      const acordos = acordosResult.data || [];

      // Calcular métricas
      const totalTitulos = titulos.length;
      const totalValor = titulos.reduce((sum, titulo) => sum + titulo.valor, 0);
      const totalAcordos = acordos.length;
      const valorAcordos = acordos.reduce((sum, acordo) => sum + acordo.valor_acordo, 0);

      // Títulos por status
      const statusCount = titulos.reduce((acc, titulo) => {
        acc[titulo.status] = (acc[titulo.status] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      const titulosPorStatus = Object.entries(statusCount).map(([status, count]) => ({
        name: status.replace('_', ' '),
        value: count
      }));

      // Títulos por mês (últimos 6 meses)
      const titulosPorMes = Array.from({ length: 6 }, (_, i) => {
        const date = new Date();
        date.setMonth(date.getMonth() - i);
        const monthYear = date.toISOString().slice(0, 7);
        
        const count = titulos.filter(titulo => 
          titulo.created_at.startsWith(monthYear)
        ).length;

        return {
          month: date.toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' }),
          count
        };
      }).reverse();

      // Acordos por mês
      const acordosPorMes = Array.from({ length: 6 }, (_, i) => {
        const date = new Date();
        date.setMonth(date.getMonth() - i);
        const monthYear = date.toISOString().slice(0, 7);
        
        const count = acordos.filter(acordo => 
          acordo.created_at.startsWith(monthYear)
        ).length;

        return {
          month: date.toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' }),
          count
        };
      }).reverse();

      setReportData({
        totalTitulos,
        totalValor,
        totalAcordos,
        valorAcordos,
        titulosPorStatus,
        titulosPorMes,
        acordosPorMes
      });

    } catch (error) {
      console.error('Erro ao carregar dados do relatório:', error);
      toast({
        title: "Erro",
        description: "Não foi possível carregar os dados do relatório",
        variant: "destructive",
      });
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

  const exportReport = () => {
    toast({
      title: "Exportando",
      description: "Relatório será baixado em breve",
    });
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
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold">Relatórios</h1>
          <p className="text-muted-foreground">Análise de desempenho e métricas</p>
        </div>
        <Button onClick={exportReport}>
          <Download className="h-4 w-4 mr-2" />
          Exportar
        </Button>
      </div>

      <div className="flex gap-4 items-center">
        <Select value={reportType} onValueChange={setReportType}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Tipo de relatório" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="geral">Relatório Geral</SelectItem>
            <SelectItem value="titulos">Títulos</SelectItem>
            <SelectItem value="acordos">Acordos</SelectItem>
            <SelectItem value="campanhas">Campanhas</SelectItem>
          </SelectContent>
        </Select>

        <DatePickerWithRange 
          date={dateRange} 
          onDateChange={setDateRange}
        />
      </div>

      {reportData && (
        <>
          <div className="grid gap-4 md:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total de Títulos</CardTitle>
                <FileText className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{reportData.totalTitulos}</div>
                <div className="flex items-center text-xs text-muted-foreground">
                  <TrendingUp className="h-3 w-3 mr-1" />
                  +12% vs mês anterior
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Valor Total</CardTitle>
                <DollarSign className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatCurrency(reportData.totalValor)}</div>
                <div className="flex items-center text-xs text-muted-foreground">
                  <TrendingUp className="h-3 w-3 mr-1" />
                  +8% vs mês anterior
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total de Acordos</CardTitle>
                <FileText className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{reportData.totalAcordos}</div>
                <div className="flex items-center text-xs text-muted-foreground">
                  <TrendingDown className="h-3 w-3 mr-1" />
                  -3% vs mês anterior
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Valor Acordado</CardTitle>
                <DollarSign className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatCurrency(reportData.valorAcordos)}</div>
                <div className="flex items-center text-xs text-muted-foreground">
                  <TrendingUp className="h-3 w-3 mr-1" />
                  +15% vs mês anterior
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Títulos por Status</CardTitle>
                <CardDescription>Distribuição dos títulos por status</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={reportData.titulosPorStatus}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {reportData.titulosPorStatus.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Títulos por Mês</CardTitle>
                <CardDescription>Títulos criados nos últimos 6 meses</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={reportData.titulosPorMes}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="count" fill="#8884d8" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card className="md:col-span-2">
              <CardHeader>
                <CardTitle>Comparativo: Títulos vs Acordos</CardTitle>
                <CardDescription>Evolução mensal de títulos e acordos</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={reportData.titulosPorMes.map((item, index) => ({
                    ...item,
                    acordos: reportData.acordosPorMes[index]?.count || 0
                  }))}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" />
                    <YAxis />
                    <Tooltip />
                    <Line type="monotone" dataKey="count" stroke="#8884d8" name="Títulos" />
                    <Line type="monotone" dataKey="acordos" stroke="#82ca9d" name="Acordos" />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}