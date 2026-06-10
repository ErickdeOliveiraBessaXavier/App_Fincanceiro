import { Card, CardContent } from '@/components/ui/card';
import { LucideIcon, TrendingUp, TrendingDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Progress } from '@/components/ui/progress';

interface StatPillarProps {
  title: string;
  mainValue: string | number;
  subValue?: string;
  description: string;
  icon: LucideIcon;
  variant?: 'default' | 'destructive' | 'success';
  trend?: {
    value: number;
    isPositive: boolean;
  };
  progress?: {
    value: number;
    label: string;
  };
  className?: string;
}

const StatPillar = ({
  title,
  mainValue,
  subValue,
  description,
  icon: Icon,
  variant = 'default',
  trend,
  progress,
  className,
}: StatPillarProps) => {
  const variantStyles = {
    default: 'text-primary border-primary/10 bg-primary/5',
    destructive: 'text-destructive border-destructive/10 bg-destructive/5',
    success: 'text-success border-success/10 bg-success/5',
  };

  const iconStyles = {
    default: 'bg-primary/10 text-primary',
    destructive: 'bg-destructive/10 text-destructive',
    success: 'bg-success/10 text-success',
  };

  return (
    <Card className={cn("border-none shadow-card overflow-hidden group", className)}>
      <CardContent className="p-6">
        <div className="flex justify-between items-start mb-4">
          <div className={cn("h-12 w-12 rounded-2xl flex items-center justify-center transition-transform group-hover:scale-110", iconStyles[variant])}>
            <Icon className="h-6 w-6" />
          </div>
          {trend && (
            <div className={cn(
              "flex items-center text-xs font-bold px-2 py-1 rounded-full",
              trend.isPositive ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"
            )}>
              {trend.isPositive ? <TrendingUp className="h-3 w-3 mr-1" /> : <TrendingDown className="h-3 w-3 mr-1" />}
              {trend.value}%
            </div>
          )}
        </div>

        <div className="space-y-1">
          <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">{title}</p>
          <div className="flex items-baseline gap-2">
            <h2 className="text-3xl font-black tracking-tighter">{mainValue}</h2>
            {subValue && (
              <span className="text-sm font-bold text-muted-foreground/70">{subValue}</span>
            )}
          </div>
          <p className="text-xs font-medium text-muted-foreground">{description}</p>
        </div>

        {progress && (
          <div className="mt-6 space-y-2">
            <div className="flex justify-between text-[10px] font-bold uppercase tracking-tighter">
              <span className="text-muted-foreground">{progress.label}</span>
              <span className={variantStyles[variant].split(' ')[0]}>{progress.value.toFixed(1)}%</span>
            </div>
            <div className="h-1.5 bg-muted rounded-full overflow-hidden">
              <div 
                className={cn("h-full transition-all duration-1000", 
                  variant === 'success' ? "bg-success" : 
                  variant === 'destructive' ? "bg-destructive" : "bg-primary"
                )}
                style={{ width: `${progress.value}%` }}
              />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default StatPillar;
