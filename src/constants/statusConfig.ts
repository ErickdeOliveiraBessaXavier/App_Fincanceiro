import { Clock, CheckCircle, XCircle, type LucideIcon } from 'lucide-react';

/**
 * Fonte única de verdade para rótulos, cores e ícones de status.
 *
 * Cada domínio (titulo, parcela, cliente, acordo, agendamento, campanha) tem
 * seu próprio conjunto de valores. Use o componente <StatusBadge domain status />
 * para renderizar — não reimplemente getStatusColor/getStatusLabel localmente.
 *
 * As cores usam os `variant` semânticos do componente Badge
 * (success/warning/destructive/accent/secondary/outline/default), garantindo
 * estilo consistente entre todos os módulos.
 */

export type BadgeVariant =
  | 'default'
  | 'secondary'
  | 'destructive'
  | 'outline'
  | 'success'
  | 'warning'
  | 'accent';

export type StatusDomain =
  | 'titulo'
  | 'parcela'
  | 'cliente'
  | 'acordo'
  | 'agendamento'
  | 'status_cobranca'
  | 'campanha';

export interface StatusMeta {
  label: string;
  variant: BadgeVariant;
  icon?: LucideIcon;
}

const STATUS_CONFIG: Record<StatusDomain, Record<string, StatusMeta>> = {
  // Status consolidado do título (vw_titulos_completos.status)
  titulo: {
    pago: { label: 'Pago', variant: 'success' },
    a_vencer: { label: 'A Vencer', variant: 'warning' },
    vencido: { label: 'Vencido', variant: 'destructive' },
    // Unificado com o domínio "cliente" (era "Renegociado"): o mesmo fato —
    // existe acordo ativo — agora tem um único rótulo em todo o app.
    renegociado: { label: 'Em Acordo', variant: 'accent' },
    pendente: { label: 'A Vencer', variant: 'warning' }, // legado
  },
  // Status consolidado da parcela (vw_parcelas_consolidadas.status)
  parcela: {
    pago: { label: 'Paga', variant: 'success' },
    a_vencer: { label: 'A Vencer', variant: 'warning' },
    vencido: { label: 'Vencida', variant: 'destructive' },
    pendente: { label: 'A Vencer', variant: 'warning' }, // legado
  },
  // Status do cliente (derivado dos títulos em useClientes)
  cliente: {
    ativo: { label: 'Ativo', variant: 'success' },
    inadimplente: { label: 'Inadimplente', variant: 'destructive' },
    em_acordo: { label: 'Em Acordo', variant: 'accent' },
    // Verde (como o Título "Pago"): "dívida resolvida" tem a mesma cor em todo
    // o app — antes era cinza (secondary), quebrando a âncora visual.
    quitado: { label: 'Quitado', variant: 'success' },
  },
  // Status do acordo (acordos.status)
  acordo: {
    ativo: { label: 'Ativo', variant: 'accent' },
    cumprido: { label: 'Cumprido', variant: 'success' },
    quebrado: { label: 'Quebrado', variant: 'destructive' },
    cancelado: { label: 'Cancelado', variant: 'secondary' },
  },
  // Status do agendamento (agendamentos.status)
  agendamento: {
    pendente: { label: 'Pendente', variant: 'warning', icon: Clock },
    concluido: { label: 'Concluído', variant: 'success', icon: CheckCircle },
    cancelado: { label: 'Cancelado', variant: 'destructive', icon: XCircle },
  },
  // Status de cobrança da telecobrança (agendamentos.status_cobranca).
  // Rótulos espelham STATUS_COBRANCA em src/domain/telecobranca/statusCobranca.ts.
  status_cobranca: {
    suspeita_fraude: { label: 'Suspeita de Fraude', variant: 'destructive' },
    // "Promessa de Pagamento" (era "Agendamento de Pagamento"): evita a colisão
    // da palavra "Agendamento" (retorno agendado / tipo de evento) e descreve
    // melhor o que ocorreu — o cliente prometeu pagar.
    agendamento_pagamento: { label: 'Promessa de Pagamento', variant: 'success' },
    sem_previsao_pagamento: { label: 'Sem Previsão de Pagamento', variant: 'warning' },
    recado: { label: 'Recado', variant: 'secondary' },
    nao_atende: { label: 'Não Atende', variant: 'secondary' },
    sem_contato_incorreto: { label: 'Contato inexistente/inválido', variant: 'destructive' },
    devolucao: { label: 'Devolução', variant: 'accent' },
  },
  // Status da campanha (campanhas.status)
  campanha: {
    ativa: { label: 'Ativa', variant: 'success' },
    pausada: { label: 'Pausada', variant: 'warning' },
    finalizada: { label: 'Finalizada', variant: 'secondary' },
    rascunho: { label: 'Rascunho', variant: 'accent' },
  },
};

/** Retorna a config de um status; faz fallback seguro para valores desconhecidos. */
export function getStatusMeta(domain: StatusDomain, status: string | null | undefined): StatusMeta {
  if (!status) return { label: '—', variant: 'secondary' };
  return STATUS_CONFIG[domain]?.[status] ?? { label: status, variant: 'secondary' };
}

/** Atalho para obter apenas o rótulo (ex.: labels de gráficos). */
export function getStatusLabel(domain: StatusDomain, status: string | null | undefined): string {
  return getStatusMeta(domain, status).label;
}
