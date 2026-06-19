import {
  Calendar,
  DollarSign,
  Paperclip,
  AlertTriangle,
  UserX,
  ExternalLink,
  Phone,
  Users,
  PhoneIncoming,
  RotateCcw,
  RefreshCw,
  Globe,
  XCircle,
  MessageSquare,
  Mail,
  FileText
} from 'lucide-react';

/**
 * Separa os tipos em duas categorias:
 * - 'resultado_cobranca': contatos que exigem classificação de status — devem
 *   usar Registrar Resultado para acionar as regras de negócio.
 * - 'administrativo': eventos informativos sem status de cobrança equivalente —
 *   podem ser registrados via Registrar Evento.
 */
export type CategoriaEvento = 'administrativo' | 'resultado_cobranca';

export const TIPOS_EVENTO = [
  { value: 'agendamento',           label: 'Agendamento',           icon: Calendar,     color: 'text-yellow-600',      bg: 'bg-yellow-100', categoria: 'resultado_cobranca' as CategoriaEvento },
  { value: 'alega_pagamento',       label: 'Alega Pagamento',       icon: DollarSign,   color: 'text-green-600',       bg: 'bg-green-100',  categoria: 'resultado_cobranca' as CategoriaEvento },
  { value: 'anexar_arquivo',        label: 'Anexar Arquivo',        icon: Paperclip,    color: 'text-muted-foreground', bg: 'bg-muted',     categoria: 'administrativo'     as CategoriaEvento },
  { value: 'cadastro_insuficiente', label: 'Cadastro Insuficiente', icon: AlertTriangle,color: 'text-orange-600',      bg: 'bg-orange-100', categoria: 'resultado_cobranca' as CategoriaEvento },
  { value: 'cliente_desconhecido',  label: 'Cliente Desconhecido',  icon: UserX,        color: 'text-destructive',     bg: 'bg-red-100',    categoria: 'resultado_cobranca' as CategoriaEvento },
  { value: 'cobranca_externa',      label: 'Cobrança Externa',      icon: ExternalLink, color: 'text-purple-600',      bg: 'bg-purple-100', categoria: 'resultado_cobranca' as CategoriaEvento },
  { value: 'contato_cliente',       label: 'Contato Com Cliente',   icon: Phone,        color: 'text-blue-600',        bg: 'bg-blue-100',   categoria: 'resultado_cobranca' as CategoriaEvento },
  { value: 'contato_analista',      label: 'Contato com Analista',  icon: Users,        color: 'text-blue-600',        bg: 'bg-blue-100',   categoria: 'administrativo'     as CategoriaEvento },
  { value: 'contato_receptivo',     label: 'Contato Receptivo',     icon: PhoneIncoming,color: 'text-green-600',       bg: 'bg-green-100',  categoria: 'administrativo'     as CategoriaEvento },
  { value: 'devolucao',             label: 'Devolução',             icon: RotateCcw,    color: 'text-destructive',     bg: 'bg-red-100',    categoria: 'resultado_cobranca' as CategoriaEvento },
  { value: 'reabertura',            label: 'Reabertura',            icon: RefreshCw,    color: 'text-blue-600',        bg: 'bg-blue-100',   categoria: 'administrativo'     as CategoriaEvento },
  { value: 'acesso_portal',         label: 'Acesso ao Portal',      icon: Globe,        color: 'text-muted-foreground', bg: 'bg-muted',     categoria: 'administrativo'     as CategoriaEvento },
  { value: 'venda_cancelada',       label: 'VENDA CANCELADA',       icon: XCircle,      color: 'text-destructive',     bg: 'bg-red-100',    categoria: 'administrativo'     as CategoriaEvento },
  { value: 'whatsapp',              label: 'WhatsApp',              icon: MessageSquare,color: 'text-green-600',       bg: 'bg-green-100',  categoria: 'administrativo'     as CategoriaEvento },
  { value: 'email',                 label: 'E-mail',                icon: Mail,         color: 'text-blue-600',        bg: 'bg-blue-100',   categoria: 'administrativo'     as CategoriaEvento },
  { value: 'ligacao',               label: 'Ligação',               icon: Phone,        color: 'text-blue-600',        bg: 'bg-blue-100',   categoria: 'resultado_cobranca' as CategoriaEvento },
  { value: 'outro',                 label: 'Outro',                 icon: FileText,     color: 'text-muted-foreground', bg: 'bg-muted',     categoria: 'administrativo'     as CategoriaEvento },
] as const;

export type TipoEvento = typeof TIPOS_EVENTO[number]['value'];

export const getTipoEvento = (value: string) => {
  return TIPOS_EVENTO.find(t => t.value === value) || TIPOS_EVENTO[TIPOS_EVENTO.length - 1];
};

/** Tipos disponíveis em Registrar Evento (administrativos/informativos).
 *  Tipos de resultado de cobrança exigem Registrar Resultado. */
export const TIPOS_EVENTO_ADMINISTRATIVO = TIPOS_EVENTO.filter(
  t => t.categoria === 'administrativo'
);
