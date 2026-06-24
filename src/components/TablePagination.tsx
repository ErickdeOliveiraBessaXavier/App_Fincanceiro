import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { PaginationControls } from '@/hooks/usePagination';

interface TablePaginationProps {
  pagination: PaginationControls;
  className?: string;
}

/**
 * Rodapé de paginação reutilizável para listagens. Consome os controles do
 * usePagination. Esconde-se sozinho quando há no máximo uma página.
 */
export function TablePagination({ pagination, className }: TablePaginationProps) {
  const { page, totalPages, totalItems, firstItem, lastItem, goTo, next, prev, canPrev, canNext } = pagination;

  if (totalItems === 0 || totalPages <= 1) return null;

  return (
    <div className={`flex flex-col sm:flex-row items-center justify-between gap-3 pt-4 ${className ?? ''}`}>
      <p className="text-xs text-muted-foreground">
        Mostrando <span className="font-medium text-foreground">{firstItem}</span>–
        <span className="font-medium text-foreground">{lastItem}</span> de{' '}
        <span className="font-medium text-foreground">{totalItems}</span>
      </p>
      <div className="flex items-center gap-1">
        <Button variant="outline" size="sm" className="h-8 w-8 p-0" onClick={() => goTo(1)} disabled={!canPrev} aria-label="Primeira página">
          <ChevronsLeft className="h-4 w-4" />
        </Button>
        <Button variant="outline" size="sm" className="h-8 w-8 p-0" onClick={prev} disabled={!canPrev} aria-label="Página anterior">
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="px-2 text-xs font-medium whitespace-nowrap">
          Página {page} de {totalPages}
        </span>
        <Button variant="outline" size="sm" className="h-8 w-8 p-0" onClick={next} disabled={!canNext} aria-label="Próxima página">
          <ChevronRight className="h-4 w-4" />
        </Button>
        <Button variant="outline" size="sm" className="h-8 w-8 p-0" onClick={() => goTo(totalPages)} disabled={!canNext} aria-label="Última página">
          <ChevronsRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
