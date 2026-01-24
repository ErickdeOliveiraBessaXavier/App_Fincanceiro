import { memo, useEffect, useState } from 'react';
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
  Phone
} from "lucide-react";
import { NavLink, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
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
  SidebarFooter,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

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

  const isActive = (path: string) => currentPath === path;
  const getNavCls = ({ isActive }: { isActive: boolean }) =>
    isActive ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium" : "hover:bg-sidebar-accent/50";

  return (
    <Sidebar collapsible="icon">
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="text-lg font-bold mb-4">
            {!isCollapsed && "Sistema de Cobrança"}
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {menuItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <NavLink 
                      to={item.url} 
                      end={item.url === '/'}
                      className={getNavCls}
                    >
                      <item.icon className="h-4 w-4" />
                      {!isCollapsed && <span>{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild>
              <Button 
                variant="ghost" 
                onClick={signOut}
                className="w-full justify-start"
              >
                <LogOut className="h-4 w-4" />
                {!isCollapsed && <span>Sair</span>}
              </Button>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
});