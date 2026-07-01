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
 * Tipos de evento = registros administrativos/canais no histórico do cliente
 * (Registrar Evento / Agendar Retorno). NÃO representam o "resultado da
 * cobrança" — isso é responsabilidade única dos Status de Cobrança
 * (src/domain/telecobranca/statusCobranca.ts, via Registrar Resultado).
 *
 * A antiga categoria `resultado_cobranca` foi removida: os tipos que eram
 * desfecho de cobrança viraram Status de Cobrança (cadastro insuficiente e
 * cliente desconhecido -> "Contato inexistente/inválido"; devolução já existe
 * como status). Ver TIPOS_EVENTO_LEGADOS abaixo para exibição do histórico.
 */
export const TIPOS_EVENTO = [
  { value: 'agendamento',       label: 'Agendamento',          icon: Calendar,     color: 'text-yellow-600',       bg: 'bg-yellow-100' },
  { value: 'anexar_arquivo',    label: 'Anexar Arquivo',       icon: Paperclip,    color: 'text-muted-foreground', bg: 'bg-muted'      },
  { value: 'cobranca_externa',  label: 'Cobrança Externa',     icon: ExternalLink, color: 'text-purple-600',       bg: 'bg-purple-100' },
  { value: 'contato_cliente',   label: 'Contato Com Cliente',  icon: Phone,        color: 'text-blue-600',         bg: 'bg-blue-100'   },
  { value: 'contato_analista',  label: 'Contato com Analista', icon: Users,        color: 'text-blue-600',         bg: 'bg-blue-100'   },
  { value: 'contato_receptivo', label: 'Contato Receptivo',    icon: PhoneIncoming,color: 'text-green-600',        bg: 'bg-green-100'  },
  { value: 'reabertura',        label: 'Reabertura',           icon: RefreshCw,    color: 'text-blue-600',         bg: 'bg-blue-100'   },
  { value: 'acesso_portal',     label: 'Acesso ao Portal',     icon: Globe,        color: 'text-muted-foreground', bg: 'bg-muted'      },
  { value: 'venda_cancelada',   label: 'Venda Cancelada',      icon: XCircle,      color: 'text-destructive',      bg: 'bg-red-100'    },
  { value: 'whatsapp',          label: 'WhatsApp',             icon: MessageSquare,color: 'text-green-600',        bg: 'bg-green-100'  },
  { value: 'email',             label: 'E-mail',               icon: Mail,         color: 'text-blue-600',         bg: 'bg-blue-100'   },
  { value: 'ligacao',           label: 'Ligação',              icon: Phone,        color: 'text-blue-600',         bg: 'bg-blue-100'   },
  { value: 'outro',             label: 'Outro',                icon: FileText,     color: 'text-muted-foreground', bg: 'bg-muted'      },
] as const;

export type TipoEvento = typeof TIPOS_EVENTO[number]['value'];

/**
 * Tipos aposentados do seletor (convertidos em Status de Cobrança). Mantidos
 * apenas para RÓTULO no histórico — registros antigos migrados não devem cair
 * no fallback "Outro". Nunca oferecidos para novos registros.
 */
export const TIPOS_EVENTO_LEGADOS = [
  { value: 'cadastro_insuficiente', label: 'Cadastro Insuficiente', icon: AlertTriangle, color: 'text-orange-600',  bg: 'bg-orange-100' },
  { value: 'cliente_desconhecido',  label: 'Cliente Desconhecido',  icon: UserX,         color: 'text-destructive', bg: 'bg-red-100'    },
  { value: 'devolucao',             label: 'Devolução',             icon: RotateCcw,     color: 'text-destructive', bg: 'bg-red-100'    },
  { value: 'alega_pagamento',       label: 'Alega Pagamento',       icon: DollarSign,    color: 'text-green-600',   bg: 'bg-green-100'  },
] as const;

const FALLBACK_EVENTO = TIPOS_EVENTO[TIPOS_EVENTO.length - 1]; // 'outro'

/** Resolve o rótulo/ícone de um tipo, cobrindo os aposentados (histórico). */
export const getTipoEvento = (value: string) => {
  return TIPOS_EVENTO.find(t => t.value === value)
    ?? TIPOS_EVENTO_LEGADOS.find(t => t.value === value)
    ?? FALLBACK_EVENTO;
};
