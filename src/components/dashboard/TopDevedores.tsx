import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Users, TrendingDown } from 'lucide-react';

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
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base sm:text-lg flex items-center gap-2">
            <TrendingDown className="h-5 w-5" />
            Top Devedores
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground text-center py-4">
            Nenhum devedor encontrado
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base sm:text-lg flex items-center gap-2">
          <TrendingDown className="h-5 w-5" />
          Top 5 Devedores
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {devedores.slice(0, 5).map((devedor, index) => {
          const percentage = maxValue > 0 ? (devedor.totalValor / maxValue) * 100 : 0;
          
          return (
            <div key={devedor.clienteId} className="space-y-1">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold">
                    {index + 1}
                  </span>
                  <span className="font-medium text-sm truncate">{devedor.clienteNome}</span>
                </div>
                <Badge variant="outline" className="text-xs ml-2">
                  {devedor.totalTitulos} {devedor.totalTitulos === 1 ? 'título' : 'títulos'}
                </Badge>
              </div>
              <div className="flex items-center gap-2 pl-8">
                <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-destructive rounded-full transition-all"
                    style={{ width: `${percentage}%` }}
                  />
                </div>
                <span className="text-sm font-semibold text-destructive min-w-[90px] text-right">
                  {formatCurrency(devedor.totalValor)}
                </span>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
};

export default TopDevedores;
