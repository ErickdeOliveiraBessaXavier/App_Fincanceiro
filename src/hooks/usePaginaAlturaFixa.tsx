import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

/**
 * Uma página pode pedir a altura da área útil, em vez de crescer e rolar.
 *
 * O padrão do app é a página crescer e o <main> rolar. A ficha do cliente é o
 * contrário: cabeçalho e indicadores ficam parados e cada coluna rola por conta.
 * As duas coisas não cabem numa classe fixa no Layout — a diferença é da página,
 * e é ela que avisa aqui.
 *
 * Sem isso a alternativa seria `h-full` fixo no Layout, que vazava o conteúdo
 * das páginas altas e comia o padding de baixo (o fim da lista aparecia cortado).
 */

const AlturaFixaContext = createContext<(fixa: boolean) => void>(() => undefined);

export function ProvedorAlturaFixa({ children }: { children: (fixa: boolean) => ReactNode }) {
  const [fixa, setFixa] = useState(false);
  // O valor é a função: trocá-la a cada render remontaria o efeito das páginas.
  const definir = useMemo(() => setFixa, []);

  return (
    <AlturaFixaContext.Provider value={definir}>
      {children(fixa)}
    </AlturaFixaContext.Provider>
  );
}

/** Chame na página que ocupa a altura da tela e cuida da própria rolagem. */
export function usePaginaAlturaFixa() {
  const definir = useContext(AlturaFixaContext);

  useEffect(() => {
    definir(true);
    return () => definir(false);
  }, [definir]);
}
