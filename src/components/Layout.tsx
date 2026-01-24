import { ReactNode, memo } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { AppSidebar } from '@/components/AppSidebar';
import { NotificationBell } from '@/components/NotificationBell';

interface LayoutProps {
  children: ReactNode;
}

export const Layout = memo(({ children }: LayoutProps) => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
          <p className="text-sm text-muted-foreground">Carregando...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-sidebar">
        <AppSidebar />
        
        {/* Main content area with inset effect */}
        <div className="flex-1 flex flex-col m-3 ml-0 rounded-3xl bg-background shadow-xl overflow-hidden">
          <header className="sticky top-0 z-30 h-16 flex items-center justify-between bg-card/80 backdrop-blur-md px-4 sm:px-6 border-b border-border/50">
            <div className="flex items-center gap-4">
              <SidebarTrigger className="h-9 w-9 rounded-xl hover:bg-muted" />
              <div className="hidden sm:block">
                <h1 className="text-lg font-semibold text-foreground">Sistema de Cobrança</h1>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <NotificationBell />
            </div>
          </header>
          
          <main className="flex-1 p-4 sm:p-6 lg:p-8 animate-fade-in overflow-auto">
            <div className="mx-auto max-w-7xl">
              {children}
            </div>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
});