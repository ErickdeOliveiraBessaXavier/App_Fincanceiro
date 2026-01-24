import React from 'react';
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { Layout } from "@/components/Layout";

const Dashboard = React.lazy(() => import("./pages/Dashboard"));
const Clientes = React.lazy(() => import("./pages/Clientes"));
const Titulos = React.lazy(() => import("./pages/Titulos"));
const Acordos = React.lazy(() => import("./pages/Acordos"));
const Campanhas = React.lazy(() => import("./pages/Campanhas"));
const ImportarCSV = React.lazy(() => import("./pages/ImportarCSV"));
const Relatorios = React.lazy(() => import("./pages/Relatorios"));
const Usuarios = React.lazy(() => import("./pages/Usuarios"));
const Telecobranca = React.lazy(() => import("./pages/Telecobranca"));
const Auth = React.lazy(() => import("./pages/Auth"));
const NotFound = React.lazy(() => import("./pages/NotFound"));

const queryClient = new QueryClient();

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
              <Route path="/" element={<Layout><Dashboard /></Layout>} />
              <Route path="/clientes" element={<Layout><Clientes /></Layout>} />
              <Route path="/titulos" element={<Layout><Titulos /></Layout>} />
              <Route path="/acordos" element={<Layout><Acordos /></Layout>} />
              <Route path="/campanhas" element={<Layout><Campanhas /></Layout>} />
              <Route path="/importar" element={<Layout><ImportarCSV /></Layout>} />
              <Route path="/relatorios" element={<Layout><Relatorios /></Layout>} />
              <Route path="/usuarios" element={<Layout><Usuarios /></Layout>} />
              <Route path="/telecobranca/:clienteId" element={<Layout><Telecobranca /></Layout>} />
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
