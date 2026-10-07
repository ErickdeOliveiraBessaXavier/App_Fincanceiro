import { Badge } from '@/components/ui/badge';

/** Status da empresa em linguagem de gente, com a cor de cada um. */
const STATUS: Record<string, { rotulo: string; cor: string }> = {
  pendente: { rotulo: 'Aguardando aprovação', cor: 'bg-warning/15 text-warning-strong' },
  ativa: { rotulo: 'Ativa', cor: 'bg-success/10 text-success' },
  suspensa: { rotulo: 'Suspensa', cor: 'bg-destructive/10 text-destructive' },
  cancelada: { rotulo: 'Cancelada', cor: 'bg-muted text-muted-foreground' },
};

export function StatusEmpresaBadge({ status }: { status: string }) {
  const s = STATUS[status] ?? { rotulo: status, cor: '' };
  return <Badge className={s.cor}>{s.rotulo}</Badge>;
}
