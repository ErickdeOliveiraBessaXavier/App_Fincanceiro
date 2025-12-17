import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';

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
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base sm:text-lg">Aging Report - Títulos Vencidos</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {data.map((item, index) => {
          const percentage = totalValue > 0 ? (item.value / totalValue) * 100 : 0;
          
          return (
            <div key={index} className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <div 
                    className="w-3 h-3 rounded-full" 
                    style={{ backgroundColor: item.color }}
                  />
                  <span className="font-medium">{item.label}</span>
                  <span className="text-muted-foreground text-xs">({item.range})</span>
                </div>
                <div className="text-right">
                  <span className="font-semibold">{item.count}</span>
                  <span className="text-muted-foreground text-xs ml-1">títulos</span>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Progress 
                  value={percentage} 
                  className="h-2 flex-1"
                  style={{ 
                    ['--progress-background' as any]: item.color 
                  }}
                />
                <span className="text-sm font-medium min-w-[100px] text-right">
                  {formatCurrency(item.value)}
                </span>
              </div>
            </div>
          );
        })}
        
        <div className="pt-3 border-t">
          <div className="flex justify-between items-center">
            <span className="text-sm font-medium text-muted-foreground">Total Vencido</span>
            <span className="text-lg font-bold text-destructive">
              {formatCurrency(totalValue)}
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default AgingReport;
