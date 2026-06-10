import { useState, useEffect } from 'react';
import { PageHeader } from '@/components/PageHeader';
import { Calendar, Download, TrendingUp, TrendingDown, DollarSign, FileText, FileSpreadsheet, FileIcon } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DatePickerWithRange } from '@/components/ui/date-picker';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line } from 'recharts';
import { exportToCSV, exportToExcel, exportToPDF } from '@/utils/export';
import { getStatusLabel } from '@/constants/statusConfig';

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

      // Buscar títulos da view consolidada
      let titulosQuery = supabase.from('vw_titulos_completos').select('*');
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

      // Calcular métricas usando valor_original
      const totalTitulos = titulos.length;
      const totalValor = titulos.reduce((sum, titulo) => sum + Number(titulo.valor_original || 0), 0);
      const totalAcordos = acordos.length;
      const valorAcordos = acordos.reduce((sum, acordo) => sum + Number(acordo.valor_acordo), 0);

      // Calcular comparações com mês anterior
      const comparisons = calculateComparisons(titulos, acordos);

      // Títulos por status
      const statusCount = titulos.reduce((acc, titulo) => {
        const status = titulo.status || 'ativo';
        acc[status] = (acc[status] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      const titulosPorStatus = Object.entries(statusCount).map(([status, count]) => ({
        name: getStatusLabel('titulo', status),
        value: count
      }));

      // Títulos por mês (últimos 6 meses)
      const titulosPorMes = Array.from({ length: 6 }, (_, i) => {
        const date = new Date();
        date.setMonth(date.getMonth() - i);
        const monthYear = date.toISOString().slice(0, 7);
        
        const count = titulos.filter(titulo => 
          (titulo.created_at || '').startsWith(monthYear)
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
    const titulosMesAtual = titulos.filter(t => new Date(t.created_at || '') >= inicioMesAtual);
    const titulosMesAnterior = titulos.filter(t => {
      const date = new Date(t.created_at || '');
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
        titulosMesAtual.reduce((s, t) => s + Number(t.valor_original || 0), 0),
        titulosMesAnterior.reduce((s, t) => s + Number(t.valor_original || 0), 0)
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
        { header: 'Valor Original', key: 'valor' },
        { header: 'Saldo Devedor', key: 'saldoDevedor' },
        { header: 'Status', key: 'status' },
        { header: 'Criado em', key: 'createdAt' }
      ];

      const data = reportData.rawTitulos.map(t => ({
        clienteNome: t.cliente_nome || 'N/A',
        cpfCnpj: t.cliente_cpf_cnpj || 'N/A',
        valor: Number(t.valor_original || 0),
        saldoDevedor: Number(t.saldo_devedor || 0),
        status: getStatusLabel('titulo', t.status),
        createdAt: formatDate(t.created_at || '')
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
        status: getStatusLabel('acordo', a.status),
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
    <div className="space-y-10 animate-fade-in pb-10">
      <PageHeader
        title="Relatórios"
        description="Análise de desempenho operacional e financeiro."
      >
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
          <Select value={reportType} onValueChange={setReportType}>
            <SelectTrigger className="w-full sm:w-48 rounded-xl bg-background">
              <SelectValue placeholder="Tipo de relatório" />
            </SelectTrigger>
            <SelectContent className="rounded-xl">
              <SelectItem value="geral">Relatório Geral</SelectItem>
              <SelectItem value="titulos">Títulos</SelectItem>
              <SelectItem value="acordos">Acordos</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1.5 w-full sm:w-auto">
          <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest ml-1">Período</label>
          <DatePickerWithRange 
            date={dateRange} 
            onDateChange={setDateRange}
          />
        </div>
      </div>

      {reportData && (
        <>
          <div className="grid gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
            <Card className="border-none shadow-card rounded-2xl overflow-hidden group">
              <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent pointer-events-none" />
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 relative z-10">
                <CardTitle className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Total de Títulos</CardTitle>
                <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary group-hover:scale-110 transition-transform">
                  <FileText className="h-4 w-4" />
                </div>
              </CardHeader>
              <CardContent className="relative z-10">
                <div className="text-3xl font-black tracking-tighter">{reportData.totalTitulos}</div>
                <div className="mt-2">
                  <ComparisonIndicator value={reportData.comparisons.titulos} />
                </div>
              </CardContent>
            </Card>

            <Card className="border-none shadow-card rounded-2xl overflow-hidden group">
              <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent pointer-events-none" />
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 relative z-10">
                <CardTitle className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Valor Total</CardTitle>
                <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary group-hover:scale-110 transition-transform">
                  <DollarSign className="h-4 w-4" />
                </div>
              </CardHeader>
              <CardContent className="relative z-10">
                <div className="text-3xl font-black tracking-tighter">{formatCurrency(reportData.totalValor)}</div>
                <div className="mt-2">
                  <ComparisonIndicator value={reportData.comparisons.valor} />
                </div>
              </CardContent>
            </Card>

            <Card className="border-none shadow-card rounded-2xl overflow-hidden group">
              <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-transparent pointer-events-none" />
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 relative z-10">
                <CardTitle className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Total de Acordos</CardTitle>
                <div className="h-8 w-8 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-600 group-hover:scale-110 transition-transform">
                  <FileText className="h-4 w-4" />
                </div>
              </CardHeader>
              <CardContent className="relative z-10">
                <div className="text-3xl font-black tracking-tighter">{reportData.totalAcordos}</div>
                <div className="mt-2">
                  <ComparisonIndicator value={reportData.comparisons.acordos} />
                </div>
              </CardContent>
            </Card>

            <Card className="border-none shadow-card rounded-2xl overflow-hidden group">
              <div className="absolute inset-0 bg-gradient-to-br from-success/5 to-transparent pointer-events-none" />
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 relative z-10">
                <CardTitle className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Valor Acordado</CardTitle>
                <div className="h-8 w-8 rounded-lg bg-success/10 flex items-center justify-center text-success group-hover:scale-110 transition-transform">
                  <DollarSign className="h-4 w-4" />
                </div>
              </CardHeader>
              <CardContent className="relative z-10">
                <div className="text-3xl font-black tracking-tighter">{formatCurrency(reportData.valorAcordos)}</div>
                <div className="mt-2">
                  <ComparisonIndicator value={reportData.comparisons.valorAcordos} />
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-10 grid-cols-1 md:grid-cols-2">
            <Card className="border-none shadow-card rounded-2xl overflow-hidden">
              <CardHeader className="pb-4 border-b border-border/50 bg-muted/20">
                <CardTitle className="text-lg font-bold tracking-tight">Títulos por Status</CardTitle>
                <CardDescription className="text-xs font-medium">Distribuição percentual da base</CardDescription>
              </CardHeader>
              <CardContent className="pt-6">
                <ResponsiveContainer width="100%" height={320}>
                  <PieChart>
                    <Pie
                      data={reportData.titulosPorStatus}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={90}
                      paddingAngle={8}
                      dataKey="value"
                    >
                      {reportData.titulosPorStatus.map((entry, index) => (
                        <Cell 
                          key={`cell-${index}`} 
                          fill={COLORS[index % COLORS.length]} 
                          className="stroke-background hover:opacity-80 transition-opacity outline-none"
                          strokeWidth={4}
                        />
                      ))}
                    </Pie>
                    <Tooltip 
                      contentStyle={{ backgroundColor: 'hsl(var(--card))', border: 'none', borderRadius: '12px', boxShadow: 'var(--shadow-card-hover)' }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card className="border-none shadow-card rounded-2xl overflow-hidden">
              <CardHeader className="pb-4 border-b border-border/50 bg-muted/20">
                <CardTitle className="text-lg font-bold tracking-tight">Títulos por Mês</CardTitle>
                <CardDescription className="text-xs font-medium">Volume de novos títulos (semestral)</CardDescription>
              </CardHeader>
              <CardContent className="pt-6">
                <ResponsiveContainer width="100%" height={320}>
                  <BarChart data={reportData.titulosPorMes}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                    <XAxis dataKey="month" fontSize={12} tickLine={false} axisLine={false} dy={10} />
                    <YAxis fontSize={12} tickLine={false} axisLine={false} dx={-10} />
                    <Tooltip 
                      cursor={{ fill: 'hsl(var(--muted)/0.4)' }}
                      contentStyle={{ backgroundColor: 'hsl(var(--card))', border: 'none', borderRadius: '12px', boxShadow: 'var(--shadow-card-hover)' }}
                    />
                    <Bar dataKey="count" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} barSize={40} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card className="md:col-span-2 border-none shadow-card rounded-2xl overflow-hidden">
              <CardHeader className="pb-4 border-b border-border/50 bg-muted/20">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-lg font-bold tracking-tight">Comparativo: Títulos vs Acordos</CardTitle>
                    <CardDescription className="text-xs font-medium">Evolução mensal de conversão em acordos</CardDescription>
                  </div>
                  <TrendingUp className="h-5 w-5 text-primary" />
                </div>
              </CardHeader>
              <CardContent className="pt-8">
                <ResponsiveContainer width="100%" height={320}>
                  <LineChart data={reportData.titulosPorMes.map((item, index) => ({
                    ...item,
                    acordos: reportData.acordosPorMes[index]?.count || 0
                  }))}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                    <XAxis dataKey="month" fontSize={12} tickLine={false} axisLine={false} dy={10} />
                    <YAxis fontSize={12} tickLine={false} axisLine={false} dx={-10} />
                    <Tooltip 
                      contentStyle={{ backgroundColor: 'hsl(var(--card))', border: 'none', borderRadius: '12px', boxShadow: 'var(--shadow-card-hover)' }}
                    />
                    <Line type="monotone" dataKey="count" stroke="hsl(var(--primary))" name="Títulos" strokeWidth={4} dot={{ r: 6, fill: 'hsl(var(--primary))', stroke: '#fff', strokeWidth: 2 }} />
                    <Line type="monotone" dataKey="acordos" stroke="#22c55e" name="Acordos" strokeWidth={4} dot={{ r: 6, fill: '#22c55e', stroke: '#fff', strokeWidth: 2 }} />
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
