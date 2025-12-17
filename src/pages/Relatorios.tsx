import { useState, useEffect } from 'react';
import { Calendar, Download, TrendingUp, TrendingDown, DollarSign, FileText, FileSpreadsheet, FileIcon } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DatePickerWithRange } from '@/components/ui/date-picker';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line } from 'recharts';
import { exportToCSV, exportToExcel, exportToPDF, formatCurrency as formatCurrencyUtil } from '@/utils/export';

interface ReportData {
  totalTitulos: number;
  totalValor: number;
  totalAcordos: number;
  valorAcordos: number;
  titulosPorStatus: any[];
  titulosPorMes: any[];
  acordosPorMes: any[];
  rawTitulos: any[];
  rawAcordos: any[];
  comparisons: {
    titulos: number;
    valor: number;
    acordos: number;
    valorAcordos: number;
  };
}

const COLORS = ['#f59e0b', '#22c55e', '#ef4444', '#3b82f6', '#8b5cf6'];

export default function Relatorios() {
  const [reportData, setReportData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [reportType, setReportType] = useState('geral');
  const [dateRange, setDateRange] = useState<{from: Date; to: Date} | undefined>();

  useEffect(() => {
    fetchReportData();
  }, [reportType, dateRange]);

  const fetchReportData = async () => {
    try {
      setLoading(true);

      // Buscar títulos com clientes
      let titulosQuery = supabase.from('titulos').select('*, cliente:clientes(nome, cpf_cnpj)');
      let acordosQuery = supabase.from('acordos').select('*, cliente:clientes(nome, cpf_cnpj)');

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
      const totalValor = titulos.reduce((sum, titulo) => sum + Number(titulo.valor), 0);
      const totalAcordos = acordos.length;
      const valorAcordos = acordos.reduce((sum, acordo) => sum + Number(acordo.valor_acordo), 0);

      // Calcular comparações com mês anterior
      const comparisons = calculateComparisons(titulos, acordos);

      // Títulos por status
      const statusCount = titulos.reduce((acc, titulo) => {
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

      const titulosPorStatus = Object.entries(statusCount).map(([status, count]) => ({
        name: statusLabels[status] || status,
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
        acordosPorMes,
        rawTitulos: titulos,
        rawAcordos: acordos,
        comparisons
      });

    } catch (error) {
      console.error('Erro ao carregar dados do relatório:', error);
      toast.error('Não foi possível carregar os dados do relatório');
    } finally {
      setLoading(false);
    }
  };

  const calculateComparisons = (titulos: any[], acordos: any[]) => {
    const now = new Date();
    const inicioMesAtual = new Date(now.getFullYear(), now.getMonth(), 1);
    const inicioMesAnterior = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const fimMesAnterior = new Date(now.getFullYear(), now.getMonth(), 0);

    // Filtrar por mês atual
    const titulosMesAtual = titulos.filter(t => new Date(t.created_at) >= inicioMesAtual);
    const titulosMesAnterior = titulos.filter(t => {
      const date = new Date(t.created_at);
      return date >= inicioMesAnterior && date <= fimMesAnterior;
    });

    const acordosMesAtual = acordos.filter(a => new Date(a.created_at) >= inicioMesAtual);
    const acordosMesAnterior = acordos.filter(a => {
      const date = new Date(a.created_at);
      return date >= inicioMesAnterior && date <= fimMesAnterior;
    });

    const calcPercentChange = (atual: number, anterior: number) => {
      if (anterior === 0) return atual > 0 ? 100 : 0;
      return ((atual - anterior) / anterior) * 100;
    };

    return {
      titulos: calcPercentChange(titulosMesAtual.length, titulosMesAnterior.length),
      valor: calcPercentChange(
        titulosMesAtual.reduce((s, t) => s + Number(t.valor), 0),
        titulosMesAnterior.reduce((s, t) => s + Number(t.valor), 0)
      ),
      acordos: calcPercentChange(acordosMesAtual.length, acordosMesAnterior.length),
      valorAcordos: calcPercentChange(
        acordosMesAtual.reduce((s, a) => s + Number(a.valor_acordo), 0),
        acordosMesAnterior.reduce((s, a) => s + Number(a.valor_acordo), 0)
      )
    };
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(value);
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('pt-BR');
  };

  const handleExport = (format: 'csv' | 'excel' | 'pdf') => {
    if (!reportData) return;

    const today = new Date().toISOString().split('T')[0];
    const filename = `relatorio_${reportType}_${today}`;

    if (reportType === 'titulos' || reportType === 'geral') {
      const columns = [
        { header: 'Cliente', key: 'clienteNome' },
        { header: 'CPF/CNPJ', key: 'cpfCnpj' },
        { header: 'Valor', key: 'valor' },
        { header: 'Vencimento', key: 'vencimento' },
        { header: 'Status', key: 'status' },
        { header: 'Criado em', key: 'createdAt' }
      ];

      const data = reportData.rawTitulos.map(t => ({
        clienteNome: t.cliente?.nome || 'N/A',
        cpfCnpj: t.cliente?.cpf_cnpj || 'N/A',
        valor: Number(t.valor),
        vencimento: formatDate(t.vencimento),
        status: t.status,
        createdAt: formatDate(t.created_at)
      }));

      const options = {
        filename,
        title: `Relatório de Títulos`,
        subtitle: dateRange ? `Período: ${formatDate(dateRange.from.toISOString())} a ${formatDate(dateRange.to.toISOString())}` : 'Todos os registros',
        columns,
        data,
        totals: {
          'Total de Títulos': reportData.totalTitulos.toString(),
          'Valor Total': formatCurrency(reportData.totalValor)
        }
      };

      if (format === 'csv') exportToCSV(options);
      else if (format === 'excel') exportToExcel(options);
      else exportToPDF(options);
    }

    if (reportType === 'acordos') {
      const columns = [
        { header: 'Cliente', key: 'clienteNome' },
        { header: 'Valor Original', key: 'valorOriginal' },
        { header: 'Valor Acordo', key: 'valorAcordo' },
        { header: 'Parcelas', key: 'parcelas' },
        { header: 'Status', key: 'status' },
        { header: 'Data Acordo', key: 'dataAcordo' }
      ];

      const data = reportData.rawAcordos.map(a => ({
        clienteNome: a.cliente?.nome || 'N/A',
        valorOriginal: Number(a.valor_original),
        valorAcordo: Number(a.valor_acordo),
        parcelas: a.parcelas,
        status: a.status,
        dataAcordo: formatDate(a.data_acordo)
      }));

      const options = {
        filename,
        title: `Relatório de Acordos`,
        subtitle: dateRange ? `Período: ${formatDate(dateRange.from.toISOString())} a ${formatDate(dateRange.to.toISOString())}` : 'Todos os registros',
        columns,
        data,
        totals: {
          'Total de Acordos': reportData.totalAcordos.toString(),
          'Valor Total Acordado': formatCurrency(reportData.valorAcordos)
        }
      };

      if (format === 'csv') exportToCSV(options);
      else if (format === 'excel') exportToExcel(options);
      else exportToPDF(options);
    }

    toast.success(`Relatório exportado em ${format.toUpperCase()}`);
  };

  const ComparisonIndicator = ({ value }: { value: number }) => {
    const isPositive = value >= 0;
    return (
      <div className={`flex items-center text-xs ${isPositive ? 'text-green-500' : 'text-destructive'}`}>
        {isPositive ? <TrendingUp className="h-3 w-3 mr-1" /> : <TrendingDown className="h-3 w-3 mr-1" />}
        {isPositive ? '+' : ''}{value.toFixed(1)}% vs mês anterior
      </div>
    );
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
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold">Relatórios</h1>
          <p className="text-muted-foreground">Análise de desempenho e métricas</p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button>
              <Download className="h-4 w-4 mr-2" />
              Exportar
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => handleExport('csv')}>
              <FileText className="h-4 w-4 mr-2" />
              Exportar CSV
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleExport('excel')}>
              <FileSpreadsheet className="h-4 w-4 mr-2" />
              Exportar Excel
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleExport('pdf')}>
              <FileIcon className="h-4 w-4 mr-2" />
              Exportar PDF
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
        <Select value={reportType} onValueChange={setReportType}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Tipo de relatório" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="geral">Relatório Geral</SelectItem>
            <SelectItem value="titulos">Títulos</SelectItem>
            <SelectItem value="acordos">Acordos</SelectItem>
          </SelectContent>
        </Select>

        <DatePickerWithRange 
          date={dateRange} 
          onDateChange={setDateRange}
        />
      </div>

      {reportData && (
        <>
          <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total de Títulos</CardTitle>
                <FileText className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{reportData.totalTitulos}</div>
                <ComparisonIndicator value={reportData.comparisons.titulos} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Valor Total</CardTitle>
                <DollarSign className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatCurrency(reportData.totalValor)}</div>
                <ComparisonIndicator value={reportData.comparisons.valor} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total de Acordos</CardTitle>
                <FileText className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{reportData.totalAcordos}</div>
                <ComparisonIndicator value={reportData.comparisons.acordos} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Valor Acordado</CardTitle>
                <DollarSign className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatCurrency(reportData.valorAcordos)}</div>
                <ComparisonIndicator value={reportData.comparisons.valorAcordos} />
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-6 grid-cols-1 md:grid-cols-2">
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
                    <Bar dataKey="count" fill="hsl(var(--primary))" />
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
                    <Line type="monotone" dataKey="count" stroke="hsl(var(--primary))" name="Títulos" strokeWidth={2} />
                    <Line type="monotone" dataKey="acordos" stroke="#22c55e" name="Acordos" strokeWidth={2} />
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
