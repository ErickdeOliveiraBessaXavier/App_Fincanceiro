import { FilterConfig } from '@/hooks/useGlobalFilter';
import { ORDEM_CLASSE, ROTULO_CLASSE, type ClasseTitulo } from '@/domain/metricas';

// No filtro, "Vencido" fica ao lado de "Em atraso", que o contém: o rótulo diz
// que é só a parte sem acordo. Na linha e no gráfico o selo segue "Vencido".
const ROTULO_FILTRO_CLASSE: Partial<Record<ClasseTitulo, string>> = {
  vencido: 'Vencido sem acordo',
};

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
    // Situação do título, a mesma do selo da linha (classificarTitulo): com
    // acordo, vale o estado do acordo — a novação zera o saldo do título.
    // "Em atraso" junta as duas dívidas atrasadas; as demais são uma por classe.
    options: [
      { value: 'em_atraso', label: 'Em atraso (vencido + acordo quebrado)' },
      ...ORDEM_CLASSE.map((classe) => ({ value: classe, label: ROTULO_FILTRO_CLASSE[classe] ?? ROTULO_CLASSE[classe] })),
    ],
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
  {
    id: 'retorno',
    label: 'Retorno de cobrança',
    type: 'select',
    placeholder: 'Todos',
    options: [
      { value: 'atrasados', label: 'Atrasados', color: 'red' },
      { value: 'hoje', label: 'Hoje', color: 'yellow' },
      { value: 'proximos_7', label: 'Próximos 7 dias', color: 'blue' },
      { value: 'com_agendamento', label: 'Com agendamento' },
      { value: 'sem_agendamento', label: 'Sem agendamento' },
    ],
  },
];

export const acordosFilterConfig: FilterConfig[] = [
  { 
    id: 'search', 
    label: 'Buscar', 
    type: 'text', 
    placeholder: 'Cliente, CPF/CNPJ, observações...' 
  },
  // Cancelados ficam fora por padrão para não poluir a operação do dia a dia.
  // Era um checkbox solto no cabeçalho do card, fora do painel de filtros.
  {
    id: 'cancelados',
    label: 'Cancelados',
    type: 'select',
    placeholder: 'Ocultos',
    options: [{ value: 'incluir', label: 'Mostrar cancelados' }],
  },
  { 
    id: 'status', 
    label: 'Status', 
    type: 'select', 
    options: [
      { value: 'ativo', label: 'Ativo', color: 'blue' },
      { value: 'cumprido', label: 'Cumprido', color: 'green' },
      { value: 'quebrado', label: 'Quebrado', color: 'red' },
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
