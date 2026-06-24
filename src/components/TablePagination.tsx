import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { type PaginationControls, PAGE_SIZE_OPTIONS } from '@/hooks/usePagination';

interface TablePaginationProps {
  pagination: PaginationControls;
  pageSizeOptions?: number[];
  className?: string;
}

/**
 * Rodapé de paginação reutilizável para listagens. Consome os controles do
 * usePagination. Fica sempre visível e permite escolher os itens por página.
 */
export function TablePagination({ pagination, pageSizeOptions = PAGE_SIZE_OPTIONS, className }: TablePaginationProps) {
  const { page, totalPages, totalItems, pageSize, setPageSize, firstItem, lastItem, goTo, next, prev, canPrev, canNext } = pagination;

  return (
    <div className={`flex flex-col gap-3 pt-4 sm:flex-row sm:items-center sm:justify-between ${className ?? ''}`}>
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground whitespace-nowrap">Itens por página</span>
          <Select value={String(pageSize)} onValueChange={(v) => setPageSize(Number(v))}>
            <SelectTrigger className="h-8 w-[72px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {pageSizeOptions.map((n) => (
                <SelectItem key={n} value={String(n)}>{n}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <p className="text-xs text-muted-foreground whitespace-nowrap">
          Mostrando <span className="font-medium text-foreground">{firstItem}</span>–
          <span className="font-medium text-foreground">{lastItem}</span> de{' '}
          <span className="font-medium text-foreground">{totalItems}</span>
        </p>
      </div>

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
