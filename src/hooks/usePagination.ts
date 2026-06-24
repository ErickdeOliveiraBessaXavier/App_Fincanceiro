import { useState, useEffect, useMemo } from 'react';

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

/**
 * Paginação client-side reutilizável. Recebe a lista JÁ filtrada e devolve a
 * fatia da página atual + controles. Pareia com o useGlobalFilter: passe um
 * `resetSignal` derivado dos filtros (ex.: JSON.stringify(filters)) para voltar
 * à página 1 quando a filtragem muda.
 */
export function usePagination<T>(
  items: T[],
  initialPageSize: number = DEFAULT_PAGE_SIZE,
  resetSignal?: string
): PaginationState<T> {
  const [pageSize, setPageSizeState] = useState(initialPageSize);
  const [page, setPage] = useState(1);

  // Filtro mudou => volta para a primeira página.
  useEffect(() => {
    setPage(1);
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
