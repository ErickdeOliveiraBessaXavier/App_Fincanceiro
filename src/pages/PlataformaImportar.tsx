import { Navigate, Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import ImportarCSV from './ImportarCSV';

// Importação acessível ao super_admin (admin mestre), fora do layout da empresa.
export default function PlataformaImportar() {
  const { user, isSuperAdmin, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/auth" replace />;
  if (!isSuperAdmin) return <Navigate to="/" replace />;

  return (
    <div className="min-h-screen bg-background">
      <header className="flex h-16 items-center gap-3 border-b border-border/50 bg-card/80 px-6 backdrop-blur-md">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/plataforma"><ArrowLeft className="mr-2 h-4 w-4" /> Voltar</Link>
        </Button>
        <h1 className="text-lg font-semibold">Importar títulos</h1>
      </header>
      <main className="mx-auto max-w-6xl p-6">
        <ImportarCSV />
      </main>
    </div>
  );
}
