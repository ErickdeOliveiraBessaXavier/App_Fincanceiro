import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CalendarClock, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { parseDataLocal } from '@/utils/format';
import type { ProximoVencimento } from '@/domain/metricas';
import { useEstadoDaFila, type EstadoFila } from '@/hooks/useFilaNavegacao';

const ITENS_VISIVEIS = 5;

/**
 * A linha inteira é o alvo do clique e leva à ficha do cliente. Sem cliente
 * (parcela órfã) não há para onde ir, então fica como linha estática.
 */
function LinhaVencimento({ clienteId, fila, className, children }: {
  clienteId: string | null;
  fila: EstadoFila;
  className: string;
  children: ReactNode;
}) {
  if (!clienteId) return <div className={className}>{children}</div>;
  return (
    <Link to={`/clientes/${clienteId}`} state={fila} className={className}>
      {children}
    </Link>
  );
}

interface ProximosVencimentosProps {
  vencimentos: ProximoVencimento[];
}

const ProximosVencimentos = ({ vencimentos }: ProximosVencimentosProps) => {
  const [expandido, setExpandido] = useState(false);
  const fila = useEstadoDaFila(
    [...new Set(vencimentos.map((v) => v.clienteId).filter((id): id is string => !!id))],
  );
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(value);
  };

  const formatDate = (date: string) => {
    // parseDataLocal: 'vencimento' é data pura; `new Date` a leria como UTC e
    // exibiria o dia anterior no Brasil.
    return parseDataLocal(date).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
  };

  const getUrgencyStyles = (dias: number) => {
    if (dias <= 1) return "border-destructive/20 bg-destructive/5 text-destructive";
    if (dias <= 3) return "border-orange-500/20 bg-orange-500/5 text-orange-600";
    return "border-border/50 bg-muted/30 text-muted-foreground";
  };

  if (vencimentos.length === 0) {
    return (
      <Card className="overflow-hidden">
        <CardHeader variant="faixa">
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
            Nenhuma parcela vencendo nos próximos 7 dias.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      <CardHeader variant="faixa">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-bold flex items-center gap-2">
            <CalendarClock className="h-5 w-5 text-primary" />
            Próximos Vencimentos
          </CardTitle>
          <Badge className="bg-primary hover:bg-primary/90 rounded-full px-3">{vencimentos.length}</Badge>
        </div>
      </CardHeader>
      <CardContent className="pt-6 space-y-4">
        {(expandido ? vencimentos : vencimentos.slice(0, ITENS_VISIVEIS)).map((item) => (
          <LinhaVencimento
            key={item.id}
            clienteId={item.clienteId}
            fila={fila}
            className={cn(
              "flex items-center justify-between gap-3 p-4 rounded-2xl border transition-colors",
              item.clienteId && "hover:border-primary/30 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              getUrgencyStyles(item.diasRestantes)
            )}
          >
            <div className="flex-1 min-w-0">
              <p className="font-bold text-sm text-foreground truncate">{item.clienteNome}</p>
              <p className="mt-1 text-xs font-bold truncate">
                <span className="uppercase tracking-wider opacity-70">Vence {formatDate(item.vencimento)}</span>
                <span className="mx-1.5 opacity-30">·</span>
                {item.diasRestantes <= 0 ? 'Vence hoje' : `Em ${item.diasRestantes} dias`}
              </p>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <span className="font-black text-sm text-foreground whitespace-nowrap">{formatCurrency(item.valor)}</span>
              {item.clienteId && (
                <div className="h-8 w-8 rounded-full bg-background/50 flex items-center justify-center text-muted-foreground border border-border/20">
                  <ArrowRight className="h-4 w-4" />
                </div>
              )}
            </div>
          </LinhaVencimento>
        ))}

        {vencimentos.length > ITENS_VISIVEIS && (
          <button
            type="button"
            onClick={() => setExpandido((v) => !v)}
            className="w-full py-3 text-xs font-bold text-primary hover:bg-primary/5 rounded-xl transition-colors uppercase tracking-widest"
          >
            {expandido ? 'Ver menos' : `Ver mais ${vencimentos.length - ITENS_VISIVEIS} parcelas`}
          </button>
        )}
      </CardContent>
    </Card>
  );
};

export default ProximosVencimentos;
