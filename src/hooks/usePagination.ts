import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';

// Controles de paginação (sem o tipo dos itens) — usado pela UI de rodapé.
export interface PaginationControls {
  page: number;
  totalPages: number;
  totalItems: number;
  pageSize: number;
  setPageSize: (size: number) => void;
  firstItem: number; // posição 1-based do primeiro item da página
  lastItem: number;  // posição 1-based do último item da página
  goTo: (p: number) => void;
  next: () => void;
  prev: () => void;
  canPrev: boolean;
  canNext: boolean;
}

export interface PaginationState<T> extends PaginationControls {
  pageItems: T[];
}

export const DEFAULT_PAGE_SIZE = 25;
export const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

/** Parâmetro de URL usado pelas listagens que preservam a página. */
export const PARAM_PAGINA = 'pagina';

/**
 * Guarda a página na query string quando `urlParam` é informado.
 *
 * Sem isso, voltar da ficha de um cliente devolvia a lista sempre na página 1 —
 * quem estava trabalhando a fila na página 3 recomeçava a rolagem toda vez.
 */
function usePaginaNaUrl(urlParam?: string): [number, (p: number) => void] {
  const [searchParams, setSearchParams] = useSearchParams();
  const [pageLocal, setPageLocal] = useState(1);

  const daUrl = Number(searchParams.get(urlParam ?? '')) || 1;

  const definir = useCallback((p: number) => {
    if (!urlParam) {
      setPageLocal(p);
      return;
    }
    setSearchParams((atual) => {
      const proximo = new URLSearchParams(atual);
      if (p <= 1) proximo.delete(urlParam);
      else proximo.set(urlParam, String(p));
      return proximo;
    }, { replace: true });
  }, [urlParam, setSearchParams]);

  return [urlParam ? daUrl : pageLocal, definir];
}

/**
 * Paginação client-side reutilizável. Recebe a lista JÁ filtrada e devolve a
 * fatia da página atual + controles. Pareia com o useGlobalFilter: passe um
 * `resetSignal` derivado dos filtros (ex.: JSON.stringify(filters)) para voltar
 * à página 1 quando a filtragem muda.
 *
 * Passe `urlParam` (use PARAM_PAGINA) nas listagens de onde o usuário navega
 * para uma ficha e volta — a página fica na URL e sobrevive ao "voltar".
 */
export function usePagination<T>(
  items: T[],
  initialPageSize: number = DEFAULT_PAGE_SIZE,
  resetSignal?: string,
  urlParam?: string
): PaginationState<T> {
  const [pageSize, setPageSizeState] = useState(initialPageSize);
  const [page, setPage] = usePaginaNaUrl(urlParam);

  // Filtro mudou => volta para a primeira página.
  //
  // A comparação com o sinal anterior é o que faz a restauração funcionar: um
  // efeito que resetasse na montagem apagaria o `?pagina=3` da URL logo ao
  // voltar da ficha — justamente o estado que queremos preservar.
  const setPageRef = useRef(setPage);
  setPageRef.current = setPage;
  const sinalAnterior = useRef(resetSignal);
  useEffect(() => {
    if (sinalAnterior.current === resetSignal) return;
    sinalAnterior.current = resetSignal;
    setPageRef.current(1);
  }, [resetSignal]);

  // Trocar a quantidade por página recomeça da primeira página.
  const setPageSize = (size: number) => {
    setPageSizeState(size);
    setPage(1);
  };

  const totalItems = items.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  // Mantém a página dentro do intervalo válido mesmo se a lista encolher.
  const current = Math.min(page, totalPages);

  const pageItems = useMemo(() => {
    const start = (current - 1) * pageSize;
    return items.slice(start, start + pageSize);
  }, [items, current, pageSize]);

  const goTo = (p: number) => setPage(Math.min(Math.max(1, p), totalPages));

  return {
    page: current,
    totalPages,
    totalItems,
    pageItems,
    pageSize,
    setPageSize,
    firstItem: totalItems === 0 ? 0 : (current - 1) * pageSize + 1,
    lastItem: Math.min(current * pageSize, totalItems),
    goTo,
    next: () => goTo(current + 1),
    prev: () => goTo(current - 1),
    canPrev: current > 1,
    canNext: current < totalPages,
  };
}
