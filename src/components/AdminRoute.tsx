import { Navigate } from 'react-router-dom';
import { useUserRole } from '@/hooks/useUserRole';
import { useToast } from '@/hooks/use-toast';
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

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (!isAdmin) return <Navigate to="/" replace />;
  return <>{children}</>;
}
