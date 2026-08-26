import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Rótulo curto que apresenta um valor logo abaixo ("Total em Aberto", "Valor
 * Acordo", "Empresa"...).
 *
 * A mesma combinação de classes estava copiada em dezenas de telas: mexer no
 * tamanho ou no espaçamento do rótulo deixava metade do app para trás. Aqui
 * ela tem um lugar só. Para cabeçalho de tabela não use este componente — o
 * `TableHead` já nasce com o mesmo padrão.
 */
/**
 * As mesmas classes para quando o elemento já é dado por outro componente
 * (`CardTitle`, `Label`, `SidebarGroupLabel`) e `<Rotulo>` não cabe.
 */
export const rotuloClasses = 'text-[10px] font-bold uppercase tracking-widest text-muted-foreground';

export function Rotulo({
  children,
  className,
  as: Tag = 'p',
}: {
  children: ReactNode;
  className?: string;
  /** `p` por padrão; use `span` quando estiver dentro de um bloco de texto. */
  as?: 'p' | 'span';
}) {
  return (
    <Tag className={cn(rotuloClasses, className)}>
      {children}
    </Tag>
  );
}
