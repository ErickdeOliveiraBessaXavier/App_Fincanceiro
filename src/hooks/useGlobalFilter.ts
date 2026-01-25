import { useState, useMemo, useCallback } from 'react';

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

export function useGlobalFilter<T>(
  data: T[],
  filterFunctions: FilterFunctions<T>,
  options?: UseGlobalFilterOptions
): UseGlobalFilterReturn<T> {
  const [filters, setFiltersState] = useState<FilterValues>(options?.initialFilters || {});

  const filteredData = useMemo(() => {
    return data.filter(item => {
      return Object.entries(filters).every(([key, value]) => {
        // Se o valor do filtro está vazio, não filtrar
        if (value === '' || value === null || value === undefined) {
          return true;
        }
        
        // Para arrays vazios
        if (Array.isArray(value) && value.length === 0) {
          return true;
        }

        // Se não existe função de filtro para esta chave, passar
        if (!filterFunctions[key]) {
          return true;
        }

        try {
          return filterFunctions[key](item, value);
        } catch (error) {
          console.error(`Erro no filtro ${key}:`, error);
          return true;
        }
      });
    });
  }, [data, filters, filterFunctions]);

  const setFilter = useCallback((key: string, value: any) => {
    setFiltersState(prev => ({
      ...prev,
      [key]: value
    }));
  }, []);

  const setFilters = useCallback((newFilters: FilterValues) => {
    setFiltersState(newFilters);
  }, []);

  const clearFilter = useCallback((key: string) => {
    setFiltersState(prev => {
      const newFilters = { ...prev };
      delete newFilters[key];
      return newFilters;
    });
  }, []);

  const clearAllFilters = useCallback(() => {
    setFiltersState({});
  }, []);

  const activeFiltersCount = useMemo(() => {
    return Object.values(filters).filter(value => {
      if (value === '' || value === null || value === undefined) return false;
      if (Array.isArray(value) && value.length === 0) return false;
      return true;
    }).length;
  }, [filters]);

  const hasActiveFilters = activeFiltersCount > 0;

  return {
    filteredData,
    filters,
    setFilter,
    setFilters,
    clearFilter,
    clearAllFilters,
    hasActiveFilters,
    activeFiltersCount,
    resultCount: filteredData.length,
    totalCount: data.length
  };
}
