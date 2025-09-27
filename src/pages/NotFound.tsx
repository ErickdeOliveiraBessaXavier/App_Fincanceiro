import { useLocation } from "react-router-dom";
import { useEffect } from "react";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 mobile-padding">
      <div className="text-center max-w-md mx-auto">
        <h1 className="mb-4 text-4xl sm:text-6xl font-bold">404</h1>
        <p className="mb-6 text-lg sm:text-xl text-muted-foreground">Oops! Página não encontrada</p>
        <a 
          href="/" 
          className="inline-flex items-center justify-center rounded-md text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 py-2 transition-colors"
        >
          Voltar ao Início
        </a>
      </div>
    </div>
  );
};

export default NotFound;
