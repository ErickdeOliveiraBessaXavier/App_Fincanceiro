import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Target, TrendingUp } from 'lucide-react';

interface MetaRecuperacaoProps {
  valorRecuperado: number;
  meta: number;
  mesAtual: string;
}

const MetaRecuperacao = ({ valorRecuperado, meta, mesAtual }: MetaRecuperacaoProps) => {
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(value);
  };

  const percentual = meta > 0 ? Math.min((valorRecuperado / meta) * 100, 100) : 0;
  const atingiuMeta = valorRecuperado >= meta;

  return (
    <Card className={atingiuMeta ? 'border-green-500/50 bg-green-500/5' : ''}>
      <CardHeader className="pb-2">
        <CardTitle className="text-base sm:text-lg flex items-center gap-2">
          <Target className="h-5 w-5" />
          Meta de Recuperação
          <span className="text-xs font-normal text-muted-foreground ml-auto">
            {mesAtual}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Progresso</span>
            <span className={`font-bold ${atingiuMeta ? 'text-green-500' : ''}`}>
              {percentual.toFixed(1)}%
            </span>
          </div>
          <Progress 
            value={percentual} 
            className={`h-3 ${atingiuMeta ? '[&>div]:bg-green-500' : ''}`}
          />
        </div>
        
        <div className="grid grid-cols-2 gap-4 pt-2">
          <div className="text-center p-3 rounded-lg bg-muted/50">
            <p className="text-xs text-muted-foreground mb-1">Recuperado</p>
            <p className={`text-lg font-bold ${atingiuMeta ? 'text-green-500' : 'text-primary'}`}>
              {formatCurrency(valorRecuperado)}
            </p>
          </div>
          <div className="text-center p-3 rounded-lg bg-muted/50">
            <p className="text-xs text-muted-foreground mb-1">Meta</p>
            <p className="text-lg font-bold">
              {formatCurrency(meta)}
            </p>
          </div>
        </div>
        
        {atingiuMeta && (
          <div className="flex items-center justify-center gap-2 text-green-500 text-sm font-medium pt-2">
            <TrendingUp className="h-4 w-4" />
            Meta atingida! 🎉
          </div>
        )}
        
        {!atingiuMeta && meta > 0 && (
          <p className="text-xs text-center text-muted-foreground">
            Faltam {formatCurrency(meta - valorRecuperado)} para atingir a meta
          </p>
        )}
      </CardContent>
    </Card>
  );
};

export default MetaRecuperacao;
