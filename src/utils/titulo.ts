import type { Database } from '@/integrations/supabase/types';

export type TituloStatus = 'em_aberto' | 'pago' | 'vencido' | 'acordo';

export interface Titulo {
  id: string;
  cliente_id: string;
  valor: number;
  vencimento: string;
  status: TituloStatus;
  observacoes: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  titulo_pai_id?: string | null;
  numero_parcela?: number | null;
  total_parcelas?: number | null;
  valor_original?: number | null;
  cliente: {
    id: string;
    nome: string;
    cpf_cnpj: string;
    telefone?: string | null;
    email?: string | null;
  };
}

export const StatusUtils = {
  getColor: (status: TituloStatus): string => {
    switch (status) {
      case 'em_aberto': return 'bg-yellow-100 text-yellow-800';
      case 'pago': return 'bg-green-100 text-green-800';
      case 'vencido': return 'bg-red-100 text-red-800';
      case 'acordo': return 'bg-blue-100 text-blue-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  },

  getLabel: (status: TituloStatus): string => {
    return status.replace('_', ' ');
  },

  isOverdue: (vencimento: string): boolean => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const dataVencimento = new Date(vencimento);
    dataVencimento.setHours(0, 0, 0, 0);
    
    return dataVencimento < today;
  },

  calculateCorrectStatus: (titulo: Titulo): TituloStatus => {
    if (titulo.status === 'pago') {
      return 'pago';
    }
    
    if (StatusUtils.isOverdue(titulo.vencimento)) {
      return 'vencido';
    }
    
    return titulo.status;
  }
};

export const ParcelaUtils = {
  isParcela: (titulo: Titulo | undefined | null): boolean => {
    if (!titulo) return false;
    return titulo.titulo_pai_id !== null && titulo.titulo_pai_id !== undefined;
  },

  isTituloPai: (titulo: Titulo | undefined | null): boolean => {
    if (!titulo) return false;
    return titulo.total_parcelas !== null && titulo.total_parcelas !== undefined && titulo.total_parcelas > 1;
  },

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
  },

  buscarParcelas: (titulos: Titulo[], tituloPaiId: string): Titulo[] => {
    return titulos
      .filter(titulo => titulo.titulo_pai_id === tituloPaiId)
      .sort((a, b) => (a.numero_parcela || 0) - (b.numero_parcela || 0));
  },

  calcularStatusTituloPai: (titulos: Titulo[], tituloPaiId: string): TituloStatus => {
    const parcelas = ParcelaUtils.buscarParcelas(titulos, tituloPaiId);
    
    if (parcelas.length === 0) return 'em_aberto';
    
    const parcelasPagas = parcelas.filter(p => StatusUtils.calculateCorrectStatus(p) === 'pago');
    const parcelasVencidas = parcelas.filter(p => StatusUtils.calculateCorrectStatus(p) === 'vencido');
    const parcelasAcordo = parcelas.filter(p => StatusUtils.calculateCorrectStatus(p) === 'acordo');
    
    if (parcelasPagas.length === parcelas.length) {
      return 'pago';
    }
    
    if (parcelasAcordo.length > 0) {
      return 'acordo';
    }
    
    if (parcelasVencidas.length > 0) {
      return 'vencido';
    }
    
    return 'em_aberto';
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
  }
};
