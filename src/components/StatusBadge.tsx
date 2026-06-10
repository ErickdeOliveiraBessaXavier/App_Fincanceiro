import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { getStatusMeta, type StatusDomain } from '@/constants/statusConfig';

interface StatusBadgeProps {
  /** Domínio do status (titulo, parcela, cliente, acordo, agendamento, campanha). */
  domain: StatusDomain;
  status: string | null | undefined;
  /** Exibe o ícone do status quando houver (padrão: false). */
  showIcon?: boolean;
  className?: string;
}

/**
 * Badge de status unificado. Rótulo, cor e ícone vêm de
 * `src/constants/statusConfig.ts` — fonte única de verdade.
 */
export function StatusBadge({ domain, status, showIcon = false, className }: StatusBadgeProps) {
  const meta = getStatusMeta(domain, status);
  const Icon = meta.icon;

  return (
    <Badge variant={meta.variant} className={className}>
      {showIcon && Icon && <Icon className={cn('h-3 w-3', meta.label && 'mr-1')} />}
      {meta.label}
    </Badge>
  );
}
