import { Navigate } from 'react-router-dom';
import { useUserRole } from '@/hooks/useUserRole';
import { useToast } from '@/hooks/use-toast';
import { CarregandoConteudo } from '@/components/TelaCarregamento';
import { useEffect } from 'react';

export function AdminRoute({ children }: { children: React.ReactNode }) {
  const { isAdmin, isLoading } = useUserRole();
  const { toast } = useToast();

  useEffect(() => {
    if (!isLoading && !isAdmin) {
      toast({
        title: 'Acesso restrito',
        description: 'Apenas administradores podem acessar esta página.',
        variant: 'destructive',
      });
    }
  }, [isLoading, isAdmin, toast]);

  // Mesmo indicador do restante da área de conteúdo (ver BlockVendedorRoute).
  if (isLoading) return <CarregandoConteudo />;

  if (!isAdmin) return <Navigate to="/" replace />;
  return <>{children}</>;
}
