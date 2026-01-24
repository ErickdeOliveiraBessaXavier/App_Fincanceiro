import { memo } from 'react';
import { 
  Home, 
  FileText, 
  Handshake, 
  Megaphone, 
  Users, 
  BarChart3, 
  Upload,
  LogOut,
  UserCheck,
  Sparkles
} from "lucide-react";
import { NavLink, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
  SidebarFooter,
  SidebarHeader,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const menuItems = [
  { title: "Dashboard", url: "/", icon: Home },
  { title: "Clientes", url: "/clientes", icon: UserCheck },
  { title: "Títulos", url: "/titulos", icon: FileText },
  { title: "Acordos", url: "/acordos", icon: Handshake },
  { title: "Campanhas", url: "/campanhas", icon: Megaphone },
  { title: "Importar CSV", url: "/importar", icon: Upload },
  { title: "Relatórios", url: "/relatorios", icon: BarChart3 },
  { title: "Usuários", url: "/usuarios", icon: Users },
];

export const AppSidebar = memo(() => {
  const { state } = useSidebar();
  const location = useLocation();
  const { signOut } = useAuth();
  const currentPath = location.pathname;
  const isCollapsed = state === "collapsed";

  const isActive = (path: string) => {
    if (path === '/') return currentPath === path;
    return currentPath.startsWith(path);
  };

  return (
    <Sidebar collapsible="icon" className="border-r-0">
      <SidebarHeader className="p-4">
        <div className={cn(
          "flex items-center gap-3 transition-all duration-200",
          isCollapsed && "justify-center"
        )}>
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-lg">
            <Sparkles className="h-5 w-5" />
          </div>
          {!isCollapsed && (
            <div className="flex flex-col">
              <span className="font-bold text-foreground">CobrançaPro</span>
              <span className="text-xs text-muted-foreground">Sistema de Gestão</span>
            </div>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent className="px-3">
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu className="space-y-1">
              {menuItems.map((item) => {
                const active = isActive(item.url);
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild>
                      <NavLink 
                        to={item.url} 
                        end={item.url === '/'}
                        className={cn(
                          "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200",
                          active 
                            ? "bg-primary text-primary-foreground shadow-md" 
                            : "text-muted-foreground hover:bg-muted hover:text-foreground",
                          isCollapsed && "justify-center px-2"
                        )}
                      >
                        <item.icon className={cn(
                          "h-5 w-5 shrink-0",
                          active && "text-primary-foreground"
                        )} />
                        {!isCollapsed && <span>{item.title}</span>}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Pro Card - Only show when expanded */}
        {!isCollapsed && (
          <div className="mt-6 mx-1 p-4 rounded-2xl bg-gradient-to-br from-primary to-primary/80 text-primary-foreground">
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="h-4 w-4" />
              <span className="text-xs font-semibold uppercase tracking-wide opacity-90">Pro</span>
            </div>
            <p className="text-sm font-semibold mb-1">Atualize seu plano</p>
            <p className="text-xs opacity-80 mb-3">Acesse recursos avançados e relatórios detalhados.</p>
            <Button 
              size="sm" 
              variant="secondary"
              className="w-full bg-white/20 hover:bg-white/30 text-white border-0 backdrop-blur-sm"
            >
              Atualizar Agora
            </Button>
          </div>
        )}
      </SidebarContent>
      
      <SidebarFooter className="p-3">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild>
              <Button 
                variant="ghost" 
                onClick={signOut}
                className={cn(
                  "w-full justify-start gap-3 rounded-xl text-muted-foreground hover:bg-destructive/10 hover:text-destructive",
                  isCollapsed && "justify-center px-2"
                )}
              >
                <LogOut className="h-5 w-5 shrink-0" />
                {!isCollapsed && <span>Sair</span>}
              </Button>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
});