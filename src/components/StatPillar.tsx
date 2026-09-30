import { Card, CardContent } from '@/components/ui/card';
import { LucideIcon, TrendingUp, TrendingDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { rotuloClasses } from '@/components/Rotulo';
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
    <Card className={cn("overflow-hidden", className)}>
      <CardContent className="p-6">
        <div className="flex justify-between items-start mb-3">
          <div className={cn("h-10 w-10 rounded-xl flex items-center justify-center", iconStyles[variant])}>
            <Icon className="h-5 w-5" />
          </div>
          {trend && (
            <div className={cn(
              "flex items-center text-xs font-medium px-2 py-1 rounded-full",
              trend.isPositive ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"
            )}>
              {trend.isPositive ? <TrendingUp className="h-3 w-3 mr-1" /> : <TrendingDown className="h-3 w-3 mr-1" />}
              {trend.value}%
            </div>
          )}
        </div>

        <div className="space-y-1">
          <p className={rotuloClasses}>{title}</p>
          <div className="flex items-baseline gap-2">
            <p className="text-3xl font-bold tracking-tight tabular-nums">{mainValue}</p>
            {subValue && (
              <span className="text-sm text-muted-foreground">{subValue}</span>
            )}
          </div>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>

        {progress && (
          <div className="mt-5 space-y-2">
            <div className="flex justify-between text-xs font-medium">
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
