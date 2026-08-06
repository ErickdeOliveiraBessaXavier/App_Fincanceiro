import { Navigate } from 'react-router-dom';
import { useUserRole } from '@/hooks/useUserRole';
import { useToast } from '@/hooks/use-toast';
import { CarregandoConteudo } from '@/components/TelaCarregamento';
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

  // Mesmo indicador do restante da área de conteúdo — o gate de papel é só mais
  // uma etapa da mesma espera, não um estado visualmente diferente.
  if (isLoading) return <CarregandoConteudo />;

  if (isVendedor) return <Navigate to="/clientes" replace />;
  return <>{children}</>;
}
