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
import { ProvedorAlturaFixa } from '@/hooks/usePaginaAlturaFixa';
import { cn } from '@/lib/utils';
import { Rotulo } from '@/components/Rotulo';
import { AvisoPlano } from '@/components/plano/AvisoPlano';
import { situacaoDeAcesso, type SituacaoDeAcesso } from '@/domain/plano';

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

const TEXTO_BLOQUEIO: Record<Exclude<SituacaoDeAcesso, 'ativa'>, { titulo: string; texto: (nome: string) => string }> = {
  pendente: {
    titulo: 'Empresa aguardando aprovação',
    texto: (nome) => `A empresa "${nome}" foi cadastrada e está aguardando aprovação. Você receberá acesso assim que for ativada.`,
  },
  suspensa: {
    titulo: 'Acesso suspenso',
    texto: () => 'O acesso da sua empresa está suspenso. Entre em contato com o suporte para regularizar.',
  },
  inadimplente: {
    titulo: 'Acesso bloqueado por pendência financeira',
    texto: () => 'Há uma fatura do sistema em aberto além do prazo de tolerância. Seus dados estão preservados: o administrador da empresa pode regularizar com o suporte e o acesso volta assim que o pagamento for registrado.',
  },
  expirada: {
    titulo: 'Período de teste encerrado',
    texto: () => 'O período de teste da sua empresa terminou. Seus dados estão preservados: entre em contato com o suporte para contratar um plano e liberar o acesso.',
  },
};

// Tela exibida quando a empresa não tem acesso: aguardando aprovação, suspensa,
// com fatura atrasada ou com o período de teste vencido.
const EmpresaInativa = ({ situacao, nome, onSignOut }: {
  situacao: Exclude<SituacaoDeAcesso, 'ativa'>; nome: string; onSignOut: () => void;
}) => {
  const pendente = situacao === 'pendente';
  const { titulo, texto } = TEXTO_BLOQUEIO[situacao];
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-md rounded-2xl border bg-card p-8 text-center shadow-sm">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
          {pendente ? <Clock className="h-7 w-7 text-primary" /> : <Ban className="h-7 w-7 text-destructive" />}
        </div>
        <h1 className="mb-2 text-xl font-bold">{titulo}</h1>
        <p className="mb-6 text-sm text-muted-foreground">{texto(nome)}</p>
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
  company: { status: string; nome: string; acesso_expira_em: string | null; inadimplente: boolean } | null;
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

  // Gate: empresa precisa estar "ativa" (aprovada pelo super_admin), em dia com
  // a mensalidade e dentro do prazo do plano. O banco já bloqueia os dados (current_company_id); aqui só
  // se explica o porquê.
  if (!ctx.company) return null;
  const situacao = situacaoDeAcesso(ctx.company);
  if (situacao === 'ativa') return null;
  return <EmpresaInativa situacao={situacao} nome={ctx.company.nome} onSignOut={ctx.signOut} />;
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
                <Rotulo>Empresa</Rotulo>
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
          <AvisoPlano />
          
          {/* Por padrão a página cresce e o <main> rola. Uma página pode pedir a
              altura da área útil (usePaginaAlturaFixa) e cuidar da própria
              rolagem — é o caso da ficha do cliente. Fixar `h-full` para todas
              vazava o conteúdo das listas e comia o padding de baixo. */}
          <ProvedorAlturaFixa>
            {(alturaFixa) => (
              <main
                className={cn(
                  'flex-1 p-4 sm:p-6 lg:p-8 animate-fade-in',
                  alturaFixa ? 'overflow-hidden' : 'overflow-y-auto',
                )}
              >
                <div
                  className={cn(
                    'mx-auto flex max-w-7xl flex-col',
                    alturaFixa ? 'h-full min-h-0' : 'min-h-full',
                  )}
                >
                  {/* Boundary da rota AQUI dentro: as páginas são lazy e, sem ele,
                      o Suspense de App.tsx trocaria o app inteiro pelo fallback —
                      a sidebar sumia e voltava a cada navegação. */}
                  <Suspense fallback={<CarregandoConteudo />}>
                    {children}
                  </Suspense>
                </div>
              </main>
            )}
          </ProvedorAlturaFixa>
        </div>
      </div>
    </SidebarProvider>
  );
});