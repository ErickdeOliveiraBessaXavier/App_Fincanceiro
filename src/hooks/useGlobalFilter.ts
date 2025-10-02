import { useState, useMemo } from 'react';

export interface FilterConfig {
  id: string;
  label: string;
  type: 'text' | 'select' | 'date' | 'number';
  options?: Array<{ value: string; label: string; color?: string }>;
  placeholder?: string;
}

export interface FilterFunctions<T> {
  [key: string]: (item: T, value: any) => boolean;
}

export interface FilterValues {
  [key: string]: any;
}

export function useGlobalFilter<T>(
  data: T[],
  filterFunctions: FilterFunctions<T>
) {
  const [filters, setFilters] = useState<FilterValues>({});

  const filteredData = useMemo(() => {
    return data.filter(item => {
      return Object.entries(filters).every(([key, value]) => {
        // Se o valor do filtro está vazio, não filtrar
        if (!value || value === '' || value === null || value === undefined) {
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

  const setFilter = (key: string, value: any) => {
    setFilters(prev => ({
      ...prev,
      [key]: value
    }));
  };

  const clearFilter = (key: string) => {
    setFilters(prev => {
      const newFilters = { ...prev };
      delete newFilters[key];
      return newFilters;
    });
  };

  const clearAllFilters = () => {
    setFilters({});
  };

  const hasActiveFilters = Object.values(filters).some(value => 
    value !== '' && value !== null && value !== undefined
  );

  return {
    filteredData,
    filters,
    setFilter,
    clearFilter,
    clearAllFilters,
    hasActiveFilters
  };
}
