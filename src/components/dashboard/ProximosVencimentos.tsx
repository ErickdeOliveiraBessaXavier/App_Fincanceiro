import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CalendarClock, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Vencimento {
  id: string;
  clienteNome: string;
  valor: number;
  vencimento: string;
  diasRestantes: number;
}

interface ProximosVencimentosProps {
  vencimentos: Vencimento[];
}

const ProximosVencimentos = ({ vencimentos }: ProximosVencimentosProps) => {
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(value);
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
  };

  const getUrgencyStyles = (dias: number) => {
    if (dias <= 1) return "border-destructive/20 bg-destructive/5 text-destructive";
    if (dias <= 3) return "border-orange-500/20 bg-orange-500/5 text-orange-600";
    return "border-border/50 bg-muted/30 text-muted-foreground";
  };

  if (vencimentos.length === 0) {
    return (
      <Card className="border-none shadow-card overflow-hidden">
        <CardHeader className="pb-4 border-b border-border/50 bg-muted/20">
          <CardTitle className="text-lg font-bold flex items-center gap-2">
            <CalendarClock className="h-5 w-5 text-primary" />
            Próximos Vencimentos
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center mb-4">
            <CalendarClock className="h-6 w-6 text-muted-foreground" />
          </div>
          <p className="text-sm font-medium text-muted-foreground text-center">
            Nenhum título vencendo nos próximos 7 dias.
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
            <CalendarClock className="h-5 w-5 text-primary" />
            Próximos Vencimentos
          </CardTitle>
          <Badge className="bg-primary hover:bg-primary/90 rounded-full px-3">{vencimentos.length}</Badge>
        </div>
      </CardHeader>
      <CardContent className="pt-6 space-y-4">
        {vencimentos.slice(0, 5).map((item) => (
          <div 
            key={item.id} 
            className={cn(
              "flex items-center justify-between p-4 rounded-2xl border transition-all hover:scale-[1.02] active:scale-[0.98] cursor-default",
              getUrgencyStyles(item.diasRestantes)
            )}
          >
            <div className="flex-1 min-w-0">
              <p className="font-bold text-sm text-foreground truncate">{item.clienteNome}</p>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-xs font-bold uppercase tracking-wider opacity-70">
                  Vence {formatDate(item.vencimento)}
                </span>
                <span className="h-1 w-1 rounded-full bg-current opacity-30" />
                <span className="text-xs font-bold">
                  {item.diasRestantes <= 0 ? 'Vence hoje' : `Em ${item.diasRestantes} dias`}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-3 ml-4">
              <span className="font-black text-sm text-foreground">{formatCurrency(item.valor)}</span>
              <div className="h-8 w-8 rounded-full bg-background/50 flex items-center justify-center text-muted-foreground border border-border/20">
                <ArrowRight className="h-4 w-4" />
              </div>
            </div>
          </div>
        ))}
        
        {vencimentos.length > 5 && (
          <button className="w-full py-3 text-xs font-bold text-primary hover:bg-primary/5 rounded-xl transition-colors uppercase tracking-widest">
            Ver mais {vencimentos.length - 5} títulos
          </button>
        )}
      </CardContent>
    </Card>
  );
};

export default ProximosVencimentos;
