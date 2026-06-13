import { Navigate } from 'react-router-dom';
import { useUserRole } from '@/hooks/useUserRole';
import { useToast } from '@/hooks/use-toast';
import { useEffect } from 'react';

// Vendedor é read-only e restrito à própria carteira: bloqueia o acesso direto
// (via URL) a páginas que não sejam "Clientes", redirecionando-o de volta.
export function BlockVendedorRoute({ children }: { children: React.ReactNode }) {
  const { isVendedor, isLoading } = useUserRole();
  const { toast } = useToast();

  useEffect(() => {
    if (!isLoading && isVendedor) {
      toast({
        title: 'Acesso restrito',
        description: 'Vendedores têm acesso apenas à carteira de clientes.',
        variant: 'destructive',
      });
    }
  }, [isLoading, isVendedor, toast]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (isVendedor) return <Navigate to="/clientes" replace />;
  return <>{children}</>;
}
