import React from 'react';
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useParams } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { Layout } from "@/components/Layout";
import { AdminRoute } from "@/components/AdminRoute";
import { BlockVendedorRoute } from "@/components/BlockVendedorRoute";
import { TelaCarregamento, CarregandoConteudo } from "@/components/TelaCarregamento";
import { useUserRole } from "@/hooks/useUserRole";

const Dashboard = React.lazy(() => import("./pages/Dashboard"));
const Fila = React.lazy(() => import("./pages/Fila"));
const Clientes = React.lazy(() => import("./pages/Clientes"));
const Atribuicao = React.lazy(() => import("./pages/Atribuicao"));
const Equipe = React.lazy(() => import("./pages/Equipe"));
const Configuracoes = React.lazy(() => import("./pages/Configuracoes"));
const Titulos = React.lazy(() => import("./pages/Titulos"));
const Acordos = React.lazy(() => import("./pages/Acordos"));
const Campanhas = React.lazy(() => import("./pages/Campanhas"));
const ImportarCSV = React.lazy(() => import("./pages/ImportarCSV"));
const Relatorios = React.lazy(() => import("./pages/Relatorios"));
const Telecobranca = React.lazy(() => import("./pages/Telecobranca"));
const Auth = React.lazy(() => import("./pages/Auth"));
const Convite = React.lazy(() => import("./pages/Convite"));
const SetupEmpresa = React.lazy(() => import("./pages/SetupEmpresa"));
const Plataforma = React.lazy(() => import("./pages/Plataforma"));
const PlataformaImportar = React.lazy(() => import("./pages/PlataformaImportar"));
const NotFound = React.lazy(() => import("./pages/NotFound"));

const queryClient = new QueryClient();

// Página inicial por papel:
//   vendedor  -> a própria carteira (read-only, o Dashboard de cobrança não se aplica)
//   operador  -> a fila de retornos, que é o trabalho dele ao abrir o sistema
//   admin     -> o resumo executivo
function HomeRoute() {
  const { isVendedor, isAdmin, isLoading } = useUserRole();
  // Fica dentro do Layout: o shell já está na tela, então o indicador é o de
  // conteúdo — nunca o de tela cheia, que apagaria a sidebar recém-desenhada.
  if (isLoading) return <CarregandoConteudo />;
  if (isVendedor) return <Navigate to="/clientes" replace />;
  if (!isAdmin) return <Navigate to="/fila" replace />;
  return <Dashboard />;
}

// /telecobranca/:id era uma segunda rota para a MESMA tela da ficha, e os menus
// ofereciam "Telecobrança" e "Ver Detalhes" apontando para lugares idênticos.
// A ficha agora é só /clientes/:id; esta rota sobrevive como redirect.
function RedirecionarParaFicha() {
  const { clienteId } = useParams<{ clienteId: string }>();
  return <Navigate to={`/clientes/${clienteId}`} replace />;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <AuthProvider>
        <BrowserRouter future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
          {/* Rede de segurança para as rotas sem Layout (login, convite,
              plataforma). As rotas com Layout suspendem no boundary interno
              dele, preservando o shell. */}
          <React.Suspense fallback={<TelaCarregamento />}>
            <Routes>
              <Route path="/auth" element={<Auth />} />
              <Route path="/convite" element={<Convite />} />
              <Route path="/setup-empresa" element={<SetupEmpresa />} />
              <Route path="/plataforma" element={<Plataforma />} />
              <Route path="/plataforma/importar" element={<PlataformaImportar />} />
              <Route path="/" element={<Layout><HomeRoute /></Layout>} />
              <Route path="/fila" element={<Layout><BlockVendedorRoute><Fila /></BlockVendedorRoute></Layout>} />
              <Route path="/clientes" element={<Layout><Clientes /></Layout>} />
              {/* Ficha do cliente (hub 360º): mesma tela da telecobrança, leitura liberada
                  ao vendedor; ações de escrita ficam gated por papel dentro da ficha. */}
              <Route path="/clientes/:clienteId" element={<Layout><Telecobranca /></Layout>} />
              <Route path="/equipe" element={<Layout><AdminRoute><Equipe /></AdminRoute></Layout>} />
              {/* Telas antigas da equipe. Viraram abas de /equipe; os caminhos
                  seguem válidos para links salvos. */}
              <Route path="/cobradores" element={<Navigate to="/equipe?aba=cobradores" replace />} />
              <Route path="/vendedores" element={<Navigate to="/equipe?aba=vendedores" replace />} />
              <Route path="/titulos" element={<Layout><BlockVendedorRoute><Titulos /></BlockVendedorRoute></Layout>} />
              <Route path="/acordos" element={<Layout><BlockVendedorRoute><Acordos /></BlockVendedorRoute></Layout>} />
              <Route path="/campanhas" element={<Layout><BlockVendedorRoute><Campanhas /></BlockVendedorRoute></Layout>} />
              <Route path="/importar" element={<Layout><BlockVendedorRoute><ImportarCSV /></BlockVendedorRoute></Layout>} />
              <Route path="/relatorios" element={<Layout><BlockVendedorRoute><Relatorios /></BlockVendedorRoute></Layout>} />
              <Route path="/atribuicao" element={<Layout><AdminRoute><Atribuicao /></AdminRoute></Layout>} />
              <Route path="/configuracoes" element={<Layout><AdminRoute><Configuracoes /></AdminRoute></Layout>} />
              <Route path="/usuarios" element={<Navigate to="/equipe?aba=acessos" replace />} />
              {/* Rota antiga da ficha. Mantida só como redirect: links salvos e
                  favoritos continuam funcionando, mas /clientes/:id é a canônica. */}
              <Route path="/telecobranca/:clienteId" element={<RedirecionarParaFicha />} />
              {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
              <Route path="*" element={<NotFound />} />
            </Routes>
          </React.Suspense>
        </BrowserRouter>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
