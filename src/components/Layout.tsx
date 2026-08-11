import { type ReactNode, Suspense, memo } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useCurrentCompany } from '@/hooks/useCurrentCompany';
import { SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { AppSidebar } from '@/components/AppSidebar';
import { NotificationBell } from '@/components/NotificationBell';
import { UsuarioMenu } from '@/components/UsuarioMenu';
import { TelaCarregamento, CarregandoConteudo } from '@/components/TelaCarregamento';
import { Button } from '@/components/ui/button';
import { Clock, Ban } from 'lucide-react';

interface LayoutProps {
  children: ReactNode;
}

// Tela exibida quando o cadastro por convite ainda aguarda autorização do admin.
const AguardandoAutorizacao = ({ onSignOut }: { onSignOut: () => void }) => (
  <div className="flex min-h-screen items-center justify-center bg-background p-6">
    <div className="w-full max-w-md rounded-2xl border bg-card p-8 text-center shadow-sm">
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
        <Clock className="h-7 w-7 text-primary" />
      </div>
      <h1 className="mb-2 text-xl font-bold">Conta aguardando autorização</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Seu cadastro foi recebido e está aguardando a liberação do administrador da empresa.
        Assim que seu acesso for autorizado, entre novamente.
      </p>
      <Button variant="outline" className="w-full" onClick={onSignOut}>Sair</Button>
    </div>
  </div>
);

// Tela exibida quando a empresa não está "ativa" (aguardando aprovação ou suspensa).
const EmpresaInativa = ({ status, nome, onSignOut }: { status: string; nome: string; onSignOut: () => void }) => {
  const suspensa = status === 'suspensa' || status === 'cancelada';
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-md rounded-2xl border bg-card p-8 text-center shadow-sm">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
          {suspensa ? <Ban className="h-7 w-7 text-destructive" /> : <Clock className="h-7 w-7 text-primary" />}
        </div>
        <h1 className="mb-2 text-xl font-bold">
          {suspensa ? 'Acesso suspenso' : 'Empresa aguardando aprovação'}
        </h1>
        <p className="mb-6 text-sm text-muted-foreground">
          {suspensa
            ? 'O acesso da sua empresa está suspenso. Entre em contato com o suporte para regularizar.'
            : `A empresa "${nome}" foi cadastrada e está aguardando aprovação. Você receberá acesso assim que for ativada.`}
        </p>
        <Button variant="outline" className="w-full" onClick={onSignOut}>Sair</Button>
      </div>
    </div>
  );
};

interface ContextoAcesso {
  loading: boolean;
  user: unknown;
  isSuperAdmin: boolean;
  companyId: string | null;
  role: string | null;
  companyLoading: boolean;
  company: { status: string; nome: string } | null;
  signOut: () => void;
}

/**
 * Portões de entrada no shell, em ordem. Devolve o que renderizar no lugar do
 * app, ou null quando o acesso está liberado.
 *
 * Vive fora do componente para o Layout ficar com uma decisão só — a cadeia de
 * sete `if` somada ao JSX estourava o limite de complexidade do projeto.
 */
function bloqueioDeAcesso(ctx: ContextoAcesso): ReactNode | null {
  // Mesma tela do #boot-loader do index.html: a passagem do HTML estático para
  // o React acontece sem troca visível de indicador.
  if (ctx.loading) return <TelaCarregamento />;
  if (!ctx.user) return <Navigate to="/auth" replace />;
  // super_admin tem área própria (administra a plataforma, não opera dentro de uma empresa).
  if (ctx.isSuperAdmin) return <Navigate to="/plataforma" replace />;
  // Usuário sem empresa precisa configurá-la.
  if (!ctx.companyId) return <Navigate to="/setup-empresa" replace />;

  // Gate: cadastro por convite que ainda não foi autorizado pelo admin.
  // Tem empresa (vinculada no convite) mas nenhum papel atribuído => sem acesso.
  if (!ctx.role) return <AguardandoAutorizacao onSignOut={ctx.signOut} />;

  // Aguarda os dados da empresa para decidir o gate de acesso. Continua sendo
  // a mesma tela da etapa anterior — para o usuário, uma espera só.
  if (ctx.companyLoading) return <TelaCarregamento />;

  // Gate: empresa precisa estar "ativa" (aprovada pelo super_admin) para acessar.
  if (ctx.company && ctx.company.status !== 'ativa') {
    return <EmpresaInativa status={ctx.company.status} nome={ctx.company.nome} onSignOut={ctx.signOut} />;
  }
  return null;
}

export const Layout = memo(({ children }: LayoutProps) => {
  const { user, loading, companyId, role, isSuperAdmin, signOut } = useAuth();
  const { company, isLoading: companyLoading } = useCurrentCompany();

  const bloqueio = bloqueioDeAcesso({
    loading, user, isSuperAdmin, companyId, role, companyLoading, company, signOut,
  });
  if (bloqueio) return <>{bloqueio}</>;

  return (
    <SidebarProvider>
      <div className="flex h-screen w-full overflow-hidden bg-background sm:bg-sidebar">
        <AppSidebar />
        
        {/* Main content area with inset effect */}
        <div className="flex-1 flex flex-col sm:m-3 sm:ml-0 sm:rounded-3xl bg-background overflow-hidden animate-scale-in">
          <header className="shrink-0 h-16 flex items-center justify-between bg-card/80 backdrop-blur-md px-4 sm:px-6 border-b border-border/50">
            <div className="flex min-w-0 items-center gap-4">
              <SidebarTrigger className="h-9 w-9 rounded-xl hover:bg-muted" />
              {/* Num produto multi-tenant o cabeçalho trazia um título fixo: o
                  operador não via em qual empresa estava lançando. */}
              <div className="hidden min-w-0 sm:block">
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Empresa</p>
                <h1 className="truncate text-base font-semibold leading-tight text-foreground">
                  {company?.nome ?? '—'}
                </h1>
              </div>
            </div>
            <div className="flex items-center gap-1 sm:gap-3">
              <NotificationBell />
              <UsuarioMenu />
            </div>
          </header>
          
          <main className="flex-1 p-4 sm:p-6 lg:p-8 animate-fade-in overflow-y-auto">
            <div className="mx-auto max-w-7xl">
              {/* Boundary da rota AQUI dentro: as páginas são lazy e, sem ele,
                  o Suspense de App.tsx trocaria o app inteiro pelo fallback —
                  a sidebar sumia e voltava a cada navegação. */}
              <Suspense fallback={<CarregandoConteudo />}>
                {children}
              </Suspense>
            </div>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
});