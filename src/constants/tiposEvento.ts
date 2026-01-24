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

export const TIPOS_EVENTO = [
  { value: 'agendamento', label: 'Agendamento', icon: Calendar, color: 'text-yellow-600', bg: 'bg-yellow-100' },
  { value: 'alega_pagamento', label: 'Alega Pagamento', icon: DollarSign, color: 'text-green-600', bg: 'bg-green-100' },
  { value: 'anexar_arquivo', label: 'Anexar Arquivo', icon: Paperclip, color: 'text-muted-foreground', bg: 'bg-muted' },
  { value: 'cadastro_insuficiente', label: 'Cadastro Insuficiente', icon: AlertTriangle, color: 'text-orange-600', bg: 'bg-orange-100' },
  { value: 'cliente_desconhecido', label: 'Cliente Desconhecido', icon: UserX, color: 'text-destructive', bg: 'bg-red-100' },
  { value: 'cobranca_externa', label: 'Cobrança Externa', icon: ExternalLink, color: 'text-purple-600', bg: 'bg-purple-100' },
  { value: 'contato_cliente', label: 'Contato Com Cliente', icon: Phone, color: 'text-blue-600', bg: 'bg-blue-100' },
  { value: 'contato_analista', label: 'Contato com Analista', icon: Users, color: 'text-blue-600', bg: 'bg-blue-100' },
  { value: 'contato_receptivo', label: 'Contato Receptivo', icon: PhoneIncoming, color: 'text-green-600', bg: 'bg-green-100' },
  { value: 'devolucao', label: 'Devolução', icon: RotateCcw, color: 'text-destructive', bg: 'bg-red-100' },
  { value: 'reabertura', label: 'Reabertura', icon: RefreshCw, color: 'text-blue-600', bg: 'bg-blue-100' },
  { value: 'acesso_portal', label: 'Acesso ao Portal', icon: Globe, color: 'text-muted-foreground', bg: 'bg-muted' },
  { value: 'venda_cancelada', label: 'VENDA CANCELADA', icon: XCircle, color: 'text-destructive', bg: 'bg-red-100' },
  { value: 'whatsapp', label: 'WhatsApp', icon: MessageSquare, color: 'text-green-600', bg: 'bg-green-100' },
  { value: 'email', label: 'E-mail', icon: Mail, color: 'text-blue-600', bg: 'bg-blue-100' },
  { value: 'ligacao', label: 'Ligação', icon: Phone, color: 'text-blue-600', bg: 'bg-blue-100' },
  { value: 'outro', label: 'Outro', icon: FileText, color: 'text-muted-foreground', bg: 'bg-muted' },
] as const;

export type TipoEvento = typeof TIPOS_EVENTO[number]['value'];

export const getTipoEvento = (value: string) => {
  return TIPOS_EVENTO.find(t => t.value === value) || TIPOS_EVENTO[TIPOS_EVENTO.length - 1];
};
