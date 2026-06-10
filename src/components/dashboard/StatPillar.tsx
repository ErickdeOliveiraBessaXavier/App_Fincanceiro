import { type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

type StatPillarVariant = 'default' | 'destructive' | 'success';

interface StatPillarProps {
  title: string;
  mainValue: string;
  subValue?: string;
  description?: string;
  icon: LucideIcon;
  variant?: StatPillarVariant;
  progress?: { value: number; label: string };
}

const VARIANT_STYLES: Record<StatPillarVariant, { text: string; bg: string; bar: string }> = {
  default: { text: 'text-primary', bg: 'bg-primary/10', bar: 'bg-primary' },
  destructive: { text: 'text-destructive', bg: 'bg-destructive/10', bar: 'bg-destructive' },
  success: { text: 'text-success', bg: 'bg-success/10', bar: 'bg-success' },
};

/**
 * Card de KPI executivo usado no Dashboard. Mostra um valor principal,
 * valor secundário, descrição, ícone com cor por variante e, opcionalmente,
 * uma barra de progresso.
 */
export default function StatPillar({
  title,
  mainValue,
  subValue,
  description,
  icon: Icon,
  variant = 'default',
  progress,
}: StatPillarProps) {
  const styles = VARIANT_STYLES[variant];
  const progressValue = progress ? Math.min(Math.max(progress.value, 0), 100) : 0;

  return (
    <div className="relative flex flex-col gap-4 bg-card rounded-3xl p-6 shadow-card border border-border/40 overflow-hidden">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
          {title}
        </span>
        <div className={cn('h-10 w-10 rounded-xl flex items-center justify-center', styles.bg)}>
          <Icon className={cn('h-5 w-5', styles.text)} />
        </div>
      </div>

      <div>
        <div className={cn('text-3xl font-black tracking-tighter', variant !== 'default' && styles.text)}>
          {mainValue}
        </div>
        {subValue && (
          <div className="text-sm font-bold text-muted-foreground mt-1">{subValue}</div>
        )}
      </div>

      {description && (
        <p className="text-xs text-muted-foreground font-medium">{description}</p>
      )}

      {progress && (
        <div className="mt-auto space-y-1.5 pt-2">
          <div className="flex justify-between text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            <span>{progress.label}</span>
            <span>{progressValue.toFixed(0)}%</span>
          </div>
          <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
            <div
              className={cn('h-full rounded-full transition-all', styles.bar)}
              style={{ width: `${progressValue}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
