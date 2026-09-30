import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Caixa de atenção: "acima do teto", "copie a chave agora", confirmação
 * exigida por um status.
 *
 * Cada tela montava a sua com âmbar cru (amber-50/300/800 + variantes dark:),
 * e o tom de "atenção" variava de uma para outra. Aqui ele sai do token
 * --warning, o mesmo do Badge "warning" e dos demais estados de alerta.
 */
export function Aviso({
  children,
  className,
  as: Tag = 'div',
}: {
  children: ReactNode;
  className?: string;
  /** `div` por padrão; `p` quando o conteúdo é só texto. */
  as?: 'div' | 'p';
}) {
  return (
    <Tag
      role="note"
      className={cn(
        'rounded-lg border border-warning/30 bg-warning/10 p-3 text-xs text-warning-strong',
        className,
      )}
    >
      {children}
    </Tag>
  );
}
