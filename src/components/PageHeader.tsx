import { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface PageHeaderProps {
  title: string;
  description?: string;
  children?: ReactNode;
  className?: string;
}

export const PageHeader = ({ title, description, children, className }: PageHeaderProps) => {
  return (
    <div className={cn("flex flex-col sm:flex-row sm:items-end sm:justify-between gap-6 mb-10 animate-fade-in", className)}>
      <div className="space-y-2">
        <h1 className="text-4xl font-black text-foreground tracking-tighter">
          {title}
        </h1>
        {description && (
          <p className="text-muted-foreground text-base font-medium">
            {description}
          </p>
        )}
      </div>
      {children && (
        <div className="flex items-center gap-3">
          {children}
        </div>
      )}
    </div>
  );
};
