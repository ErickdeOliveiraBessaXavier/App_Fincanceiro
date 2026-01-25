// Utilitários para a nova arquitetura Event Sourcing
// A lógica principal agora está no banco de dados

export type TituloStatus = 'pago' | 'pendente' | 'a_vencer' | 'vencido' | 'renegociado';
export type ParcelaStatus = 'pago' | 'pendente' | 'a_vencer' | 'vencido' | 'renegociado';

export interface Titulo {
  id: string;
  cliente_id: string;
  valor_original: number;
  vencimento_original: string;
  descricao: string | null;
  numero_documento: string | null;
  metadata: any;
  created_by: string;
  created_at: string;
  updated_at: string;
  cliente: {
    id: string;
    nome: string;
    cpf_cnpj: string;
    telefone?: string | null;
    email?: string | null;
  };
}

export interface TituloConsolidado {
  id: string;
  cliente_id: string;
  numero_documento: string | null;
  valor_original: number;
  vencimento_original: string;
  descricao: string | null;
  cliente_nome: string;
  cliente_cpf_cnpj: string;
  cliente_telefone: string | null;
  cliente_email: string | null;
  quantidade_parcelas: number;
  tipo: string;
  saldo_devedor: number;
  total_pago: number;
  total_juros: number;
  total_multa: number;
  total_descontos: number;
  parcelas_pagas: number;
  parcelas_vencidas: number;
  parcelas_pendentes: number;
  status: TituloStatus;
  proximo_vencimento: string | null;
}

export interface Parcela {
  id: string;
  titulo_id: string;
  numero_parcela: number;
  valor_nominal: number;
  vencimento: string;
  saldo_atual: number;
  total_pago: number;
  juros: number;
  multa: number;
  descontos: number;
  status: ParcelaStatus;
  data_ultimo_pagamento: string | null;
  total_eventos: number;
}

export const StatusUtils = {
  getColor: (status: TituloStatus | ParcelaStatus | string): string => {
    switch (status) {
      case 'pago': return 'bg-success/10 text-success';
      case 'pendente': return 'bg-secondary text-secondary-foreground';
      case 'a_vencer': return 'bg-warning/10 text-warning';
      case 'vencido': return 'bg-destructive/10 text-destructive';
      case 'renegociado': return 'bg-accent/10 text-accent';
      default: return 'bg-secondary text-secondary-foreground';
    }
  },

  getLabel: (status: TituloStatus | ParcelaStatus | string): string => {
    const labels: Record<string, string> = {
      'pago': 'Pago',
      'paga': 'Paga',
      'a_vencer': 'A Vencer',
      'vencido': 'Vencido',
      'vencida': 'Vencida',
      'renegociado': 'Renegociado',
      'inadimplente': 'Inadimplente',
      'ativo': 'Ativo',
      'quitado': 'Quitado',
      'sem_parcelas': 'Sem Parcelas',
      'pendente': 'A Vencer' // Fallback para dados antigos
    };
    return labels[status] || status;
  }
};

export const FormatUtils = {
  currency: (value: number): string => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(value);
  },

  date: (date: string): string => {
    return new Date(date).toLocaleDateString('pt-BR');
  },

  dateToInput: (date: string): string => {
    return new Date(date).toISOString().split('T')[0];
  },

  parcelaId: (id: string, numeroParcela: number): string => {
    const shortId = id.slice(-8);
    return `#${numeroParcela} - ${shortId}`;
  },

  shortId: (id: string): string => {
    return id.slice(-8);
  }
};

export const ParcelaUtils = {
  calcularValor: (valorTotal: number, numeroParcelas: number): number => {
    if (numeroParcelas <= 0) return 0;
    return Math.round((valorTotal / numeroParcelas) * 100) / 100;
  },

  calcularDatas: (dataInicial: string, numeroParcelas: number, intervaloDias: number): string[] => {
    const datas = [];
    const dataBase = new Date(dataInicial);
    
    for (let i = 0; i < numeroParcelas; i++) {
      const novaData = new Date(dataBase);
      novaData.setDate(dataBase.getDate() + (i * intervaloDias));
      datas.push(novaData.toISOString().split('T')[0]);
    }
    
    return datas;
  }
};
