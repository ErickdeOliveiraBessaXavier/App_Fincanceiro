import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Clock } from 'lucide-react';

interface AgingData {
  label: string;
  range: string;
  count: number;
  value: number;
  color: string;
}

interface AgingReportProps {
  data: AgingData[];
  totalValue: number;
}

const AgingReport = ({ data, totalValue }: AgingReportProps) => {
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(value);
  };

  return (
    <Card className="border-none shadow-card overflow-hidden">
      <CardHeader className="pb-4 border-b border-border/50 bg-muted/20">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-bold flex items-center gap-2">
            <Clock className="h-5 w-5 text-primary" />
            Aging Report
          </CardTitle>
          <span className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Títulos Vencidos</span>
        </div>
      </CardHeader>
      <CardContent className="pt-6 space-y-6">
        {data.map((item, index) => {
          const percentage = totalValue > 0 ? (item.value / totalValue) * 100 : 0;
          
          return (
            <div key={index} className="space-y-3 group">
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <div 
                    className="w-3 h-3 rounded-full ring-2 ring-offset-2 ring-transparent transition-all group-hover:ring-current" 
                    style={{ backgroundColor: item.color, color: item.color }}
                  />
                  <span className="font-bold text-foreground">{item.label}</span>
                  <span className="text-muted-foreground text-xs font-medium">({item.range})</span>
                </div>
                <div className="text-right">
                  <span className="font-bold text-foreground">{item.count}</span>
                  <span className="text-muted-foreground text-xs ml-1 font-medium">títulos</span>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="flex-1 h-2.5 bg-muted rounded-full overflow-hidden">
                  <div 
                    className="h-full rounded-full transition-all duration-1000 ease-out"
                    style={{ 
                      width: `${percentage}%`,
                      backgroundColor: item.color
                    }}
                  />
                </div>
                <span className="text-sm font-bold text-foreground min-w-[100px] text-right">
                  {formatCurrency(item.value)}
                </span>
              </div>
            </div>
          );
        })}
        
        <div className="pt-4 border-t border-dashed border-border/50">
          <div className="flex justify-between items-center p-3 rounded-xl bg-destructive/5 border border-destructive/10">
            <span className="text-sm font-bold text-destructive/80 uppercase tracking-wider">Total Vencido</span>
            <span className="text-xl font-black text-destructive tracking-tight">
              {formatCurrency(totalValue)}
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default AgingReport;
