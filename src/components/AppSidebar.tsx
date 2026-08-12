import { memo } from 'react';
import {
  Home,
  FileText,
  Handshake,
  Megaphone,
  BarChart3,
  Upload,
  UserCheck,
  Users,
  Shuffle,
  ListChecks,
  Settings,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { NavLink, useLocation } from "react-router-dom";
import { useUserRole } from "@/hooks/useUserRole";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
  SidebarHeader,
} from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * Navegação agrupada por finalidade.
 *
 * Eram 11 itens numa lista plana: "Importar CSV", usado uma vez por mês, tinha
 * o mesmo peso visual que "Clientes". Os grupos separam o trabalho do dia da
 * análise e da administração.
 */

interface MenuItem {
  title: string;
  url: string;
  icon: LucideIcon;
  /** Só admin vê. */
  admin?: boolean;
}

interface MenuGrupo {
  label: string;
  itens: MenuItem[];
}

const GRUPOS: MenuGrupo[] = [
  {
    label: 'Operação',
    itens: [
      { title: "Minha fila", url: "/fila", icon: ListChecks },
      { title: "Clientes", url: "/clientes", icon: UserCheck },
      { title: "Títulos", url: "/titulos", icon: FileText },
      { title: "Acordos", url: "/acordos", icon: Handshake },
      { title: "Campanhas", url: "/campanhas", icon: Megaphone },
    ],
  },
  {
    label: 'Análise',
    itens: [
      { title: "Resumo executivo", url: "/", icon: Home },
      { title: "Relatórios", url: "/relatorios", icon: BarChart3 },
    ],
  },
  {
    label: 'Gestão',
    itens: [
      { title: "Equipe", url: "/equipe", icon: Users, admin: true },
      { title: "Atribuição", url: "/atribuicao", icon: Shuffle, admin: true },
      { title: "Importar CSV", url: "/importar", icon: Upload, admin: true },
      { title: "Configurações", url: "/configuracoes", icon: Settings, admin: true },
    ],
  },
];

// Vendedor (read-only) só precisa da própria carteira de clientes —
// o restante do menu de cobrança não se aplica a ele.
const VENDEDOR_ITENS = ["/clientes"];

// ===================== Subcomponentes =====================
const SidebarBrand = ({ isCollapsed }: { isCollapsed: boolean }) => (
  <SidebarHeader className={cn("p-4", isCollapsed && "p-2")}>
    <div className={cn(
      "flex items-center gap-3 transition-all duration-200",
      isCollapsed && "justify-center"
    )}>
      <div className={cn(
        "flex items-center justify-center rounded-xl bg-white/20 text-sidebar-foreground shadow-lg backdrop-blur-sm",
        isCollapsed ? "h-8 w-8" : "h-10 w-10"
      )}>
        <Sparkles className={cn(isCollapsed ? "h-4 w-4" : "h-5 w-5")} />
      </div>
      {!isCollapsed && (
        <div className="flex flex-col">
          <span className="font-bold text-sidebar-foreground">CobrançaPro</span>
          <span className="text-xs text-sidebar-foreground/70">Sistema de Gestão</span>
        </div>
      )}
    </div>
  </SidebarHeader>
);

const SidebarSkeletonItem = ({ isCollapsed }: { isCollapsed: boolean }) => (
  <SidebarMenuItem>
    <div className={cn(
      "flex items-center gap-3 rounded-xl px-3 py-2.5",
      isCollapsed && "justify-center px-2"
    )}>
      <Skeleton className="h-5 w-5 shrink-0 rounded-md bg-white/10" />
      {!isCollapsed && <Skeleton className="h-4 w-28 rounded bg-white/10" />}
    </div>
  </SidebarMenuItem>
);

const SidebarNavItem = ({ item, active, isCollapsed }: { item: MenuItem; active: boolean; isCollapsed: boolean }) => (
  <SidebarMenuItem>
    <SidebarMenuButton asChild>
      <NavLink
        to={item.url}
        end={item.url === '/'}
        className={cn(
          "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200",
          active
            ? "bg-white/20 text-sidebar-foreground shadow-md backdrop-blur-sm"
            : "text-sidebar-foreground/70 hover:bg-white/10 hover:text-sidebar-foreground",
          isCollapsed && "justify-center px-2"
        )}
      >
        <item.icon className={cn("h-5 w-5 shrink-0", active && "text-sidebar-foreground")} />
        {!isCollapsed && <span>{item.title}</span>}
      </NavLink>
    </SidebarMenuButton>
  </SidebarMenuItem>
);

const GrupoNav = ({ grupo, isCollapsed, isActive }: {
  grupo: MenuGrupo;
  isCollapsed: boolean;
  isActive: (path: string) => boolean;
}) => {
  if (grupo.itens.length === 0) return null;
  return (
    <SidebarGroup className={cn(isCollapsed && "!p-1")}>
      {/* Recolhida, a sidebar tem 3rem: um rótulo de grupo não caberia. */}
      {!isCollapsed && (
        <SidebarGroupLabel className="px-3 text-[10px] font-bold uppercase tracking-widest text-sidebar-foreground/50">
          {grupo.label}
        </SidebarGroupLabel>
      )}
      <SidebarGroupContent>
        <SidebarMenu className={cn("space-y-1", isCollapsed && "items-center")}>
          {grupo.itens.map((item) => (
            <SidebarNavItem
              key={item.url}
              item={item}
              active={isActive(item.url)}
              isCollapsed={isCollapsed}
            />
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
};

// ===================== Sidebar =====================
function gruposVisiveis(isVendedor: boolean, isAdmin: boolean): MenuGrupo[] {
  if (isVendedor) {
    return [{
      label: 'Operação',
      itens: GRUPOS[0].itens.filter((i) => VENDEDOR_ITENS.includes(i.url)),
    }];
  }
  return GRUPOS
    .map((g) => ({ ...g, itens: g.itens.filter((i) => !i.admin || isAdmin) }))
    .filter((g) => g.itens.length > 0);
}

export const AppSidebar = memo(() => {
  const { state } = useSidebar();
  const location = useLocation();
  const { isAdmin, isVendedor, isLoading: roleLoading } = useUserRole();
  const currentPath = location.pathname;
  const isCollapsed = state === "collapsed";

  const isActive = (path: string) => {
    if (path === '/') return currentPath === path;
    return currentPath.startsWith(path);
  };

  const grupos = gruposVisiveis(isVendedor, isAdmin);

  return (
    <Sidebar collapsible="icon" className="border-r-0">
      <SidebarBrand isCollapsed={isCollapsed} />

      {/*
        IMPORTANT: When collapsed, the base SidebarGroup has p-2 and the provider width is 3rem.
        Extra horizontal padding here can make the icon buttons overflow.

        "Sair" mudou para o menu do usuário no cabeçalho, junto do nome e do
        papel — o botão solto aqui não dizia de quem era a conta.
      */}
      <SidebarContent className={cn("px-3", isCollapsed && "px-0")}>
        {roleLoading ? (
          // Primeiro acesso (sem cache de role): placeholders para o menu não
          // "pular" quando os itens admin-only resolverem.
          <SidebarGroup className={cn(isCollapsed && "!p-1")}>
            <SidebarGroupContent>
              <SidebarMenu className={cn("space-y-1", isCollapsed && "items-center")}>
                {Array.from({ length: 8 }, (_, i) => (
                  <SidebarSkeletonItem key={i} isCollapsed={isCollapsed} />
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ) : (
          grupos.map((grupo) => (
            <GrupoNav key={grupo.label} grupo={grupo} isCollapsed={isCollapsed} isActive={isActive} />
          ))
        )}
      </SidebarContent>
    </Sidebar>
  );
});
