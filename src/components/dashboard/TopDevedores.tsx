import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { TrendingDown, User, ArrowUpRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Devedor {
  clienteId: string;
  clienteNome: string;
  totalValor: number;
  totalTitulos: number;
}

interface TopDevedoresProps {
  devedores: Devedor[];
}

const TopDevedores = ({ devedores }: TopDevedoresProps) => {
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(value);
  };

  const maxValue = devedores.length > 0 ? devedores[0].totalValor : 0;

  if (devedores.length === 0) {
    return (
      <Card className="border-none shadow-card overflow-hidden">
        <CardHeader className="pb-4 border-b border-border/50 bg-muted/20">
          <CardTitle className="text-lg font-bold flex items-center gap-2">
            <TrendingDown className="h-5 w-5 text-destructive" />
            Maiores Devedores
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center mb-4">
            <TrendingDown className="h-6 w-6 text-muted-foreground" />
          </div>
          <p className="text-sm font-medium text-muted-foreground text-center">
            Nenhum devedor registrado no momento.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-none shadow-card overflow-hidden">
      <CardHeader className="pb-4 border-b border-border/50 bg-muted/20">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-bold flex items-center gap-2">
            <TrendingDown className="h-5 w-5 text-destructive" />
            Top 5 Devedores
          </CardTitle>
          <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest bg-muted px-2 py-1 rounded-md">Por Volume</span>
        </div>
      </CardHeader>
      <CardContent className="pt-6 space-y-6">
        {devedores.slice(0, 5).map((devedor, index) => {
          const percentage = maxValue > 0 ? (devedor.totalValor / maxValue) * 100 : 0;
          
          return (
            <div key={devedor.clienteId} className="space-y-3 group cursor-default">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className="relative">
                    <div className="h-10 w-10 rounded-2xl bg-muted flex items-center justify-center border border-border/50 group-hover:bg-destructive/5 group-hover:border-destructive/20 transition-colors">
                      <User className="h-5 w-5 text-muted-foreground group-hover:text-destructive transition-colors" />
                    </div>
                    <span className="absolute -top-1 -left-1 h-5 w-5 rounded-full bg-foreground text-background text-[10px] font-black flex items-center justify-center border-2 border-background">
                      {index + 1}
                    </span>
                  </div>
                  <div className="flex flex-col min-w-0">
                    <span className="font-bold text-sm text-foreground truncate group-hover:text-destructive transition-colors">
                      {devedor.clienteNome}
                    </span>
                    <span className="text-xs font-medium text-muted-foreground">
                      {devedor.totalTitulos} {devedor.totalTitulos === 1 ? 'título pendente' : 'títulos pendentes'}
                    </span>
                  </div>
                </div>
                <div className="text-right flex flex-col items-end">
                  <span className="text-sm font-black text-destructive tracking-tight">
                    {formatCurrency(devedor.totalValor)}
                  </span>
                  <div className="flex items-center gap-1 text-[10px] font-bold text-muted-foreground uppercase tracking-widest mt-0.5">
                    Detalhes <ArrowUpRight className="h-2.5 w-2.5" />
                  </div>
                </div>
              </div>
              <div className="pl-[52px]">
                <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-destructive rounded-full transition-all duration-1000 ease-out shadow-[0_0_8px_rgba(var(--destructive),0.4)]"
                    style={{ width: `${percentage}%` }}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
};

export default TopDevedores;
