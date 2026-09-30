import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

// leading-4 fixo: text-[10px] não traz line-height, e o badge herdava o do
// pai — 15px ao lado de texto xs, 20px numa célula de tabela (21px × 26px).
const badgeVariants = cva(
  "inline-flex items-center whitespace-nowrap rounded-full border border-transparent px-2 py-0.5 text-[10px] leading-4 font-semibold uppercase tracking-wider transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground",
        secondary: "bg-secondary text-secondary-foreground",
        destructive: "bg-destructive/10 text-destructive",
        outline: "text-foreground border-border",
        success: "bg-success/10 text-success",
        warning: "bg-warning/15 text-warning-strong",
        destaque: "bg-destaque/10 text-destaque",
        // Violeta da marca para "em andamento/sendo tratado" (ex.: Em Acordo).
        primaria: "bg-primary/10 text-primary",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };