import { FilterValues } from '@/hooks/useGlobalFilter';

export interface FilterPreset {
  id: string;
  label: string;
  filters: FilterValues;
}

export const titulosPresets: FilterPreset[] = [
  { id: 'todos', label: 'Todos', filters: {} },
  { id: 'vencidos', label: 'Vencidos', filters: { status: 'vencido' } },
  { id: 'a_vencer', label: 'A Vencer', filters: { status: 'a_vencer' } },
  { id: 'pagos', label: 'Pagos', filters: { status: 'pago' } },
  { id: 'renegociados', label: 'Renegociados', filters: { status: 'renegociado' } },
];

export const clientesPresets: FilterPreset[] = [
  { id: 'todos', label: 'Todos', filters: {} },
  { id: 'ativos', label: 'Ativos', filters: { status: 'ativo' } },
  { id: 'inadimplentes', label: 'Inadimplentes', filters: { status: 'inadimplente' } },
  { id: 'em_acordo', label: 'Em Acordo', filters: { status: 'em_acordo' } },
  { id: 'quitados', label: 'Quitados', filters: { status: 'quitado' } },
];

export const acordosPresets: FilterPreset[] = [
  { id: 'todos', label: 'Todos', filters: {} },
  { id: 'ativos', label: 'Ativos', filters: { status: 'ativo' } },
  { id: 'cumpridos', label: 'Cumpridos', filters: { status: 'cumprido' } },
  { id: 'quebrados', label: 'Quebrados', filters: { status: 'quebrado' } },
  { id: 'cancelados', label: 'Cancelados', filters: { status: 'cancelado' } },
];

export const campanhasPresets: FilterPreset[] = [
  { id: 'todos', label: 'Todos', filters: {} },
  { id: 'ativas', label: 'Ativas', filters: { status: 'ativa' } },
  { id: 'pausadas', label: 'Pausadas', filters: { status: 'pausada' } },
  { id: 'rascunhos', label: 'Rascunhos', filters: { status: 'rascunho' } },
];
