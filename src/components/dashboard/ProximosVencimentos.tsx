import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CalendarClock, AlertTriangle } from 'lucide-react';

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
    return new Date(date).toLocaleDateString('pt-BR');
  };

  const getUrgencyBadge = (dias: number) => {
    if (dias <= 1) {
      return <Badge variant="destructive" className="text-xs">Amanhã</Badge>;
    }
    if (dias <= 3) {
      return <Badge className="bg-orange-500 hover:bg-orange-600 text-xs">{dias} dias</Badge>;
    }
    return <Badge variant="secondary" className="text-xs">{dias} dias</Badge>;
  };

  if (vencimentos.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base sm:text-lg flex items-center gap-2">
            <CalendarClock className="h-5 w-5" />
            Próximos Vencimentos
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground text-center py-4">
            Nenhum título vencendo nos próximos 7 dias
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base sm:text-lg flex items-center gap-2">
          <CalendarClock className="h-5 w-5" />
          Próximos Vencimentos
          <Badge variant="outline" className="ml-auto">{vencimentos.length}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {vencimentos.slice(0, 5).map((item) => (
          <div 
            key={item.id} 
            className="flex items-center justify-between p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
          >
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm truncate">{item.clienteNome}</p>
              <p className="text-xs text-muted-foreground">
                Vence em {formatDate(item.vencimento)}
              </p>
            </div>
            <div className="flex items-center gap-2 ml-2">
              <span className="font-semibold text-sm">{formatCurrency(item.valor)}</span>
              {getUrgencyBadge(item.diasRestantes)}
            </div>
          </div>
        ))}
        
        {vencimentos.length > 5 && (
          <p className="text-xs text-center text-muted-foreground pt-2">
            +{vencimentos.length - 5} títulos a vencer
          </p>
        )}
      </CardContent>
    </Card>
  );
};

export default ProximosVencimentos;
