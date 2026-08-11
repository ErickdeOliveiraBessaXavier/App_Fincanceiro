import type { LucideIcon } from 'lucide-react';
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
    <div className="flex flex-wrap items-center gap-x-8 gap-y-3 rounded-xl border border-border/50 bg-muted/10 px-5 py-3">
      {itens.map(({ rotulo, valor, icone: Icone, cor }) => (
        <div key={rotulo} className="flex items-center gap-2">
          {Icone && <Icone className={cn('h-4 w-4', cor || 'text-muted-foreground')} />}
          <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            {rotulo}
          </span>
          <span className={cn('text-lg font-black tabular-nums', cor)}>{valor}</span>
        </div>
      ))}
    </div>
  );
}
