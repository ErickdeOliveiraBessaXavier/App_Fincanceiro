// Utility function to get nested values from an object
export const getNestedValue = (obj: any, path: string): any => {
  return path.split('.').reduce((acc, part) => acc?.[part], obj);
};

// Common filter functions that can be reused across pages
export const commonFilterFunctions = {
  // Search across multiple fields
  search: <T extends Record<string, any>>(
    item: T, 
    value: string, 
    fields: string[]
  ): boolean => {
    if (!value || value.trim() === '') return true;
    
    const searchLower = value.toLowerCase().trim();
    return fields.some(field => {
      const fieldValue = getNestedValue(item, field);
      return fieldValue?.toString().toLowerCase().includes(searchLower);
    });
  },

  // Exact match filter (for status, type, etc.)
  exactMatch: <T extends Record<string, any>>(
    item: T, 
    value: string, 
    field: string
  ): boolean => {
    if (!value || value === '') return true;
    return getNestedValue(item, field) === value;
  },

  // Contains filter (partial match)
  contains: <T extends Record<string, any>>(
    item: T, 
    value: string, 
    field: string
  ): boolean => {
    if (!value || value === '') return true;
    const fieldValue = getNestedValue(item, field);
    return fieldValue?.toString().toLowerCase().includes(value.toLowerCase());
  },

  // Date range filter
  dateRange: <T extends Record<string, any>>(
    item: T, 
    range: { from?: Date | string; to?: Date | string }, 
    field: string
  ): boolean => {
    const itemDate = new Date(getNestedValue(item, field));
    if (isNaN(itemDate.getTime())) return true;
    
    if (range.from) {
      const fromDate = new Date(range.from);
      if (itemDate < fromDate) return false;
    }
    if (range.to) {
      const toDate = new Date(range.to);
      if (itemDate > toDate) return false;
    }
    return true;
  },

  // Date after filter
  dateAfter: <T extends Record<string, any>>(
    item: T, 
    date: Date | string, 
    field: string
  ): boolean => {
    if (!date) return true;
    const itemDate = new Date(getNestedValue(item, field));
    const compareDate = new Date(date);
    if (isNaN(itemDate.getTime()) || isNaN(compareDate.getTime())) return true;
    return itemDate >= compareDate;
  },

  // Date before filter
  dateBefore: <T extends Record<string, any>>(
    item: T, 
    date: Date | string, 
    field: string
  ): boolean => {
    if (!date) return true;
    const itemDate = new Date(getNestedValue(item, field));
    const compareDate = new Date(date);
    if (isNaN(itemDate.getTime()) || isNaN(compareDate.getTime())) return true;
    return itemDate <= compareDate;
  },

  // Number range filter
  numberRange: <T extends Record<string, any>>(
    item: T, 
    range: { min?: number; max?: number }, 
    field: string
  ): boolean => {
    const value = Number(getNestedValue(item, field));
    if (isNaN(value)) return true;
    
    if (range.min !== undefined && !isNaN(range.min) && value < range.min) return false;
    if (range.max !== undefined && !isNaN(range.max) && value > range.max) return false;
    return true;
  },

  // Number greater than filter
  numberGreaterThan: <T extends Record<string, any>>(
    item: T, 
    min: number | string, 
    field: string
  ): boolean => {
    if (min === undefined || min === '' || min === null) return true;
    const value = Number(getNestedValue(item, field));
    const minValue = Number(min);
    if (isNaN(value) || isNaN(minValue)) return true;
    return value >= minValue;
  },

  // Number less than filter
  numberLessThan: <T extends Record<string, any>>(
    item: T, 
    max: number | string, 
    field: string
  ): boolean => {
    if (max === undefined || max === '' || max === null) return true;
    const value = Number(getNestedValue(item, field));
    const maxValue = Number(max);
    if (isNaN(value) || isNaN(maxValue)) return true;
    return value <= maxValue;
  },

  // Multi-select filter (array of values)
  multiSelect: <T extends Record<string, any>>(
    item: T, 
    values: string[], 
    field: string
  ): boolean => {
    if (!values || values.length === 0) return true;
    const itemValue = getNestedValue(item, field);
    return values.includes(itemValue);
  },

  // Boolean filter
  boolean: <T extends Record<string, any>>(
    item: T, 
    value: boolean | string, 
    field: string
  ): boolean => {
    if (value === '' || value === undefined || value === null) return true;
    const boolValue = value === true || value === 'true';
    return getNestedValue(item, field) === boolValue;
  },
};

// Factory functions to create filter functions for specific pages

export const createTitulosFilterFunctions = () => ({
  search: (item: any, value: string) => 
    commonFilterFunctions.search(item, value, ['cliente_nome', 'cliente_cpf_cnpj', 'numero_documento', 'descricao']),
  status: (item: any, value: string) => 
    commonFilterFunctions.exactMatch(item, value, 'status'),
  vencimento_de: (item: any, value: string) => 
    commonFilterFunctions.dateAfter(item, value, 'proximo_vencimento'),
  vencimento_ate: (item: any, value: string) => 
    commonFilterFunctions.dateBefore(item, value, 'proximo_vencimento'),
  valor_min: (item: any, value: string) => 
    commonFilterFunctions.numberGreaterThan(item, value, 'saldo_devedor'),
  valor_max: (item: any, value: string) => 
    commonFilterFunctions.numberLessThan(item, value, 'saldo_devedor'),
});

export const createClientesFilterFunctions = () => ({
  search: (item: any, value: string) => 
    commonFilterFunctions.search(item, value, ['nome', 'cpf_cnpj', 'email', 'telefone']),
  status: (item: any, value: string) => 
    commonFilterFunctions.exactMatch(item, value, 'status'),
  cidade: (item: any, value: string) => 
    commonFilterFunctions.contains(item, value, 'cidade'),
  estado: (item: any, value: string) => 
    commonFilterFunctions.contains(item, value, 'estado'),
});

export const createAcordosFilterFunctions = () => ({
  search: (item: any, value: string) => 
    commonFilterFunctions.search(item, value, ['cliente.nome', 'cliente.cpf_cnpj', 'observacoes']),
  status: (item: any, value: string) => 
    commonFilterFunctions.exactMatch(item, value, 'status'),
  data_acordo_de: (item: any, value: string) => 
    commonFilterFunctions.dateAfter(item, value, 'data_acordo'),
  data_acordo_ate: (item: any, value: string) => 
    commonFilterFunctions.dateBefore(item, value, 'data_acordo'),
  valor_min: (item: any, value: string) => 
    commonFilterFunctions.numberGreaterThan(item, value, 'valor_acordo'),
  valor_max: (item: any, value: string) => 
    commonFilterFunctions.numberLessThan(item, value, 'valor_acordo'),
});

export const createCampanhasFilterFunctions = () => ({
  search: (item: any, value: string) => 
    commonFilterFunctions.search(item, value, ['nome', 'canal', 'status', 'mensagem']),
  status: (item: any, value: string) => 
    commonFilterFunctions.exactMatch(item, value, 'status'),
  canal: (item: any, value: string) => 
    commonFilterFunctions.exactMatch(item, value, 'canal'),
});

// For grouped data (like ClienteAgrupado)
export const createClienteAgrupadoFilterFunctions = () => ({
  search: (item: any, value: string) => 
    commonFilterFunctions.search(item, value, ['nome', 'cpf_cnpj']),
  status: (item: any, value: string) => {
    if (!value || value === '') return true;
    // Filter by titulo status - show client if has any titulo with that status
    return item.titulos?.some((t: any) => t.status === value) ?? false;
  },
  vencimento_de: (item: any, value: string) => {
    if (!value) return true;
    return item.titulos?.some((t: any) => 
      commonFilterFunctions.dateAfter(t, value, 'proximo_vencimento')
    ) ?? true;
  },
  vencimento_ate: (item: any, value: string) => {
    if (!value) return true;
    return item.titulos?.some((t: any) => 
      commonFilterFunctions.dateBefore(t, value, 'proximo_vencimento')
    ) ?? true;
  },
  valor_min: (item: any, value: string) => 
    commonFilterFunctions.numberGreaterThan(item, value, 'totalSaldo'),
  valor_max: (item: any, value: string) => 
    commonFilterFunctions.numberLessThan(item, value, 'totalSaldo'),
});
