import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';

export interface FilterConfig {
  id: string;
  label: string;
  type: 'text' | 'select' | 'date' | 'number' | 'dateRange' | 'numberRange' | 'multiSelect';
  options?: Array<{ value: string; label: string; color?: string }>;
  placeholder?: string;
}

export interface FilterFunctions<T> {
  [key: string]: (item: T, value: any) => boolean;
}

export interface FilterValues {
  [key: string]: any;
}

export interface UseGlobalFilterOptions {
  /** Filtros aplicados quando a URL não traz nenhum (ex.: visão padrão da tela). */
  initialFilters?: FilterValues;
}

export interface UseGlobalFilterReturn<T> {
  filteredData: T[];
  filters: FilterValues;
  setFilter: (key: string, value: any) => void;
  setFilters: (filters: FilterValues) => void;
  clearFilter: (key: string) => void;
  clearAllFilters: () => void;
  hasActiveFilters: boolean;
  activeFiltersCount: number;
  resultCount: number;
  totalCount: number;
}

const vazio = (valor: unknown) =>
  valor === '' || valor === null || valor === undefined
  || (Array.isArray(valor) && valor.length === 0);

/**
 * Filtro de listagem com estado na URL.
 *
 * Antes o estado vivia em `useState`: abrir a ficha de um cliente e voltar
 * zerava filtro, preset e busca, e o cobrador refazia isso a cada cliente da
 * fila. Com os filtros na query string, o botão "voltar" do navegador (e o
 * breadcrumb) devolvem a lista exatamente como estava — e uma visão filtrada
 * vira um link que dá para mandar para outra pessoa.
 *
 * Só as chaves declaradas em `filterFunctions` são lidas e escritas, então
 * parâmetros alheios (ex.: `?id=` que abre um acordo) passam intactos.
 */
export function useGlobalFilter<T>(
  data: T[],
  filterFunctions: FilterFunctions<T>,
  options?: UseGlobalFilterOptions
): UseGlobalFilterReturn<T> {
  const [searchParams, setSearchParams] = useSearchParams();

  const chavesDeFiltro = useMemo(
    () => Object.keys(filterFunctions),
    [filterFunctions]
  );

  const filters = useMemo(() => {
    const daUrl: FilterValues = {};
    for (const chave of chavesDeFiltro) {
      const valor = searchParams.get(chave);
      if (valor !== null && valor !== '') daUrl[chave] = valor;
    }
    // `initialFilters` é a visão padrão: só vale enquanto a URL está limpa, para
    // não reaparecer depois que o usuário limpa os filtros de propósito.
    if (Object.keys(daUrl).length === 0 && options?.initialFilters) {
      return options.initialFilters;
    }
    return daUrl;
  }, [searchParams, chavesDeFiltro, options?.initialFilters]);

  // `replace` para o histórico não encher de uma entrada por tecla digitada na
  // busca — o "voltar" continua saindo da lista, não desfazendo o filtro.
  const gravar = useCallback((novos: FilterValues) => {
    setSearchParams((atual) => {
      const proximo = new URLSearchParams(atual);
      for (const chave of chavesDeFiltro) proximo.delete(chave);
      for (const [chave, valor] of Object.entries(novos)) {
        if (!vazio(valor)) proximo.set(chave, String(valor));
      }
      return proximo;
    }, { replace: true });
  }, [setSearchParams, chavesDeFiltro]);

  const filteredData = useMemo(() => {
    return data.filter(item =>
      Object.entries(filters).every(([key, value]) => {
        if (vazio(value)) return true;
        if (!filterFunctions[key]) return true;
        try {
          return filterFunctions[key](item, value);
        } catch (error) {
          console.error(`Erro no filtro ${key}:`, error);
          return true;
        }
      })
    );
  }, [data, filters, filterFunctions]);

  const setFilter = useCallback((key: string, value: any) => {
    gravar({ ...filters, [key]: value });
  }, [gravar, filters]);

  const setFilters = useCallback((newFilters: FilterValues) => {
    gravar(newFilters);
  }, [gravar]);

  const clearFilter = useCallback((key: string) => {
    const restante = { ...filters };
    delete restante[key];
    gravar(restante);
  }, [gravar, filters]);

  const clearAllFilters = useCallback(() => {
    gravar({});
  }, [gravar]);

  const activeFiltersCount = useMemo(
    () => Object.values(filters).filter((valor) => !vazio(valor)).length,
    [filters]
  );

  return {
    filteredData,
    filters,
    setFilter,
    setFilters,
    clearFilter,
    clearAllFilters,
    hasActiveFilters: activeFiltersCount > 0,
    activeFiltersCount,
    resultCount: filteredData.length,
    totalCount: data.length
  };
}
