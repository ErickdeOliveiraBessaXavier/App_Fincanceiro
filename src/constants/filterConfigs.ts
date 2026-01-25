import { FilterConfig } from '@/hooks/useGlobalFilter';

export const titulosFilterConfig: FilterConfig[] = [
  { 
    id: 'search', 
    label: 'Buscar', 
    type: 'text', 
    placeholder: 'Cliente, CPF/CNPJ, documento...' 
  },
  { 
    id: 'status', 
    label: 'Status', 
    type: 'select', 
    options: [
      { value: 'pago', label: 'Pago', color: 'green' },
      { value: 'a_vencer', label: 'A Vencer', color: 'yellow' },
      { value: 'vencido', label: 'Vencido', color: 'red' },
      { value: 'renegociado', label: 'Renegociado', color: 'purple' },
    ]
  },
  { 
    id: 'vencimento_de', 
    label: 'Vencimento De', 
    type: 'date' 
  },
  { 
    id: 'vencimento_ate', 
    label: 'Vencimento Até', 
    type: 'date' 
  },
  { 
    id: 'valor_min', 
    label: 'Valor Mínimo', 
    type: 'number', 
    placeholder: 'R$ 0,00' 
  },
  { 
    id: 'valor_max', 
    label: 'Valor Máximo', 
    type: 'number', 
    placeholder: 'R$ 999.999,99' 
  },
];

export const clientesFilterConfig: FilterConfig[] = [
  { 
    id: 'search', 
    label: 'Buscar', 
    type: 'text', 
    placeholder: 'Nome, CPF/CNPJ, email, telefone...' 
  },
  { 
    id: 'status', 
    label: 'Status', 
    type: 'select', 
    options: [
      { value: 'ativo', label: 'Ativo', color: 'green' },
      { value: 'inadimplente', label: 'Inadimplente', color: 'red' },
      { value: 'em_acordo', label: 'Em Acordo', color: 'blue' },
      { value: 'quitado', label: 'Quitado', color: 'gray' },
    ]
  },
  { 
    id: 'cidade', 
    label: 'Cidade', 
    type: 'text', 
    placeholder: 'Filtrar por cidade...' 
  },
  { 
    id: 'estado', 
    label: 'Estado', 
    type: 'text', 
    placeholder: 'UF' 
  },
];

export const acordosFilterConfig: FilterConfig[] = [
  { 
    id: 'search', 
    label: 'Buscar', 
    type: 'text', 
    placeholder: 'Cliente, CPF/CNPJ, observações...' 
  },
  { 
    id: 'status', 
    label: 'Status', 
    type: 'select', 
    options: [
      { value: 'ativo', label: 'Ativo', color: 'blue' },
      { value: 'cumprido', label: 'Cumprido', color: 'green' },
      { value: 'quebrado', label: 'Quebrado', color: 'red' },
      { value: 'cancelado', label: 'Cancelado', color: 'gray' },
    ]
  },
  { 
    id: 'data_acordo_de', 
    label: 'Data Acordo De', 
    type: 'date' 
  },
  { 
    id: 'data_acordo_ate', 
    label: 'Data Acordo Até', 
    type: 'date' 
  },
  { 
    id: 'valor_min', 
    label: 'Valor Mínimo', 
    type: 'number', 
    placeholder: 'R$ 0,00' 
  },
  { 
    id: 'valor_max', 
    label: 'Valor Máximo', 
    type: 'number', 
    placeholder: 'R$ 999.999,99' 
  },
];

export const campanhasFilterConfig: FilterConfig[] = [
  { 
    id: 'search', 
    label: 'Buscar', 
    type: 'text', 
    placeholder: 'Nome, canal ou status...' 
  },
  { 
    id: 'status', 
    label: 'Status', 
    type: 'select', 
    options: [
      { value: 'ativa', label: 'Ativa', color: 'green' },
      { value: 'pausada', label: 'Pausada', color: 'yellow' },
      { value: 'finalizada', label: 'Finalizada', color: 'gray' },
      { value: 'rascunho', label: 'Rascunho', color: 'blue' },
    ]
  },
  { 
    id: 'canal', 
    label: 'Canal', 
    type: 'select', 
    options: [
      { value: 'email', label: 'E-mail' },
      { value: 'sms', label: 'SMS' },
      { value: 'whatsapp', label: 'WhatsApp' },
    ]
  },
];
