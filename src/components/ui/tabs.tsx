import * as React from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";

import { cn } from "@/lib/utils";

/**
 * `default` é a caixa cinza do shadcn. `pill` é o padrão do app para abas que
 * comandam a tela (ficha do cliente, equipe, login): pílulas soltas, ativa em
 * primary.
 *
 * A variante vive aqui porque a mesma sequência de classes estava copiada em
 * cada `TabsTrigger` — mudar o formato exigia caçar todas as telas.
 */
type VarianteTabs = "default" | "pill";

const LISTA: Record<VarianteTabs, string> = {
  default: "inline-flex h-10 items-center justify-center rounded-md bg-muted p-1 text-muted-foreground",
  pill: "inline-flex h-auto flex-wrap items-center gap-2 bg-transparent p-0 text-muted-foreground",
};

const GATILHO: Record<VarianteTabs, string> = {
  default:
    "rounded-sm px-3 py-1.5 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm",
  pill:
    "rounded-full px-5 py-2.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=inactive]:bg-muted/50 data-[state=inactive]:hover:bg-muted",
};

const GATILHO_BASE =
  "inline-flex items-center justify-center whitespace-nowrap text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50";

/** Definida pelo `TabsList`; cada gatilho não precisa repetir a variante. */
const VarianteContext = React.createContext<VarianteTabs>("default");

const Tabs = TabsPrimitive.Root;

const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List> & { variant?: VarianteTabs }
>(({ className, variant = "default", ...props }, ref) => (
  <VarianteContext.Provider value={variant}>
    <TabsPrimitive.List ref={ref} className={cn(LISTA[variant], className)} {...props} />
  </VarianteContext.Provider>
));
TabsList.displayName = TabsPrimitive.List.displayName;

const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger> & { variant?: VarianteTabs }
>(({ className, variant, ...props }, ref) => {
  const daLista = React.useContext(VarianteContext);
  const usada = variant ?? daLista;
  return (
    <TabsPrimitive.Trigger
      ref={ref}
      className={cn(GATILHO_BASE, GATILHO[usada], className)}
      {...props}
    />
  );
});
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName;

const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn(
      "mt-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
      className,
    )}
    {...props}
  />
));
TabsContent.displayName = TabsPrimitive.Content.displayName;

export { Tabs, TabsContent, TabsList, TabsTrigger };
