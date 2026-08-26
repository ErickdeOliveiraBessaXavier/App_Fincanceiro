import type { LucideIcon } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Rotulo } from '@/components/Rotulo';
import { cn } from '@/lib/utils';

/**
 * Faixa compacta de contagens no topo de uma listagem.
 *
 * Cada lista abria com 3 a 5 cartões altos repetindo números que o Resumo
 * executivo já dá — e empurrava a tabela, que é o conteúdo procurado, para
 * baixo da primeira tela. Aqui os mesmos números ocupam uma linha.
 */

export interface NumeroResumo {
  rotulo: string;
  valor: string | number;
  icone?: LucideIcon;
  /** Classe de cor do valor (ex.: 'text-destructive'). */
  cor?: string;
}

export function ResumoNumeros({ itens }: { itens: NumeroResumo[] }) {
  return (
    // As telas passam de 3 a 5 números. Uma grade de colunas fixas deixava
    // célula vazia com 3 e uma linha órfã com 5 — e, no celular, o `divide-x`
    // desenhava traço vertical na borda externa a cada quebra de linha.
    // Empilhado (divisor horizontal) até `md`; de `md` para cima, uma linha só
    // com colunas iguais, quantos itens forem.
    <Card className="grid grid-cols-1 divide-y divide-border/40 overflow-hidden md:grid-cols-none md:grid-flow-col md:auto-cols-fr md:divide-x md:divide-y-0">
      {itens.map(({ rotulo, valor, icone: Icone, cor }) => (
        <div key={rotulo} className="flex flex-col justify-center p-5">
          <div className="mb-1.5 flex items-center gap-1.5">
            {Icone && <Icone className={cn('h-3.5 w-3.5', cor || 'text-muted-foreground')} />}
            <Rotulo as="span" className="line-clamp-1">{rotulo}</Rotulo>
          </div>
          <span className={cn('text-2xl font-black tabular-nums tracking-tight', cor)}>{valor}</span>
        </div>
      ))}
    </Card>
  );
}
