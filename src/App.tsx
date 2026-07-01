import React from 'react';
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { Layout } from "@/components/Layout";
import { AdminRoute } from "@/components/AdminRoute";
import { BlockVendedorRoute } from "@/components/BlockVendedorRoute";
import { useUserRole } from "@/hooks/useUserRole";

const Dashboard = React.lazy(() => import("./pages/Dashboard"));
const Clientes = React.lazy(() => import("./pages/Clientes"));
const Atribuicao = React.lazy(() => import("./pages/Atribuicao"));
const Cobradores = React.lazy(() => import("./pages/Cobradores"));
const Vendedores = React.lazy(() => import("./pages/Vendedores"));
const Titulos = React.lazy(() => import("./pages/Titulos"));
const Acordos = React.lazy(() => import("./pages/Acordos"));
const Campanhas = React.lazy(() => import("./pages/Campanhas"));
const ImportarCSV = React.lazy(() => import("./pages/ImportarCSV"));
const Relatorios = React.lazy(() => import("./pages/Relatorios"));
const Usuarios = React.lazy(() => import("./pages/Usuarios"));
const Telecobranca = React.lazy(() => import("./pages/Telecobranca"));
const Auth = React.lazy(() => import("./pages/Auth"));
const Convite = React.lazy(() => import("./pages/Convite"));
const SetupEmpresa = React.lazy(() => import("./pages/SetupEmpresa"));
const Plataforma = React.lazy(() => import("./pages/Plataforma"));
const PlataformaImportar = React.lazy(() => import("./pages/PlataformaImportar"));
const NotFound = React.lazy(() => import("./pages/NotFound"));

const queryClient = new QueryClient();

// Página inicial: o Dashboard é de cobrança e não se aplica ao vendedor
// (read-only, escopo só da carteira), então ele cai direto nos clientes.
function HomeRoute() {
  const { isVendedor, isLoading } = useUserRole();
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }
  if (isVendedor) return <Navigate to="/clientes" replace />;
  return <Dashboard />;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <AuthProvider>
        <BrowserRouter future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
          <React.Suspense fallback={<div>Loading...</div>}>
            <Routes>
              <Route path="/auth" element={<Auth />} />
              <Route path="/convite" element={<Convite />} />
              <Route path="/setup-empresa" element={<SetupEmpresa />} />
              <Route path="/plataforma" element={<Plataforma />} />
              <Route path="/plataforma/importar" element={<PlataformaImportar />} />
              <Route path="/" element={<Layout><HomeRoute /></Layout>} />
              <Route path="/clientes" element={<Layout><Clientes /></Layout>} />
              <Route path="/cobradores" element={<Layout><BlockVendedorRoute><Cobradores /></BlockVendedorRoute></Layout>} />
              <Route path="/vendedores" element={<Layout><BlockVendedorRoute><Vendedores /></BlockVendedorRoute></Layout>} />
              <Route path="/titulos" element={<Layout><BlockVendedorRoute><Titulos /></BlockVendedorRoute></Layout>} />
              <Route path="/acordos" element={<Layout><BlockVendedorRoute><Acordos /></BlockVendedorRoute></Layout>} />
              <Route path="/campanhas" element={<Layout><BlockVendedorRoute><Campanhas /></BlockVendedorRoute></Layout>} />
              <Route path="/importar" element={<Layout><BlockVendedorRoute><ImportarCSV /></BlockVendedorRoute></Layout>} />
              <Route path="/relatorios" element={<Layout><BlockVendedorRoute><Relatorios /></BlockVendedorRoute></Layout>} />
              <Route path="/atribuicao" element={<Layout><AdminRoute><Atribuicao /></AdminRoute></Layout>} />
              <Route path="/usuarios" element={<Layout><AdminRoute><Usuarios /></AdminRoute></Layout>} />
              <Route path="/telecobranca/:clienteId" element={<Layout><BlockVendedorRoute><Telecobranca /></BlockVendedorRoute></Layout>} />
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
