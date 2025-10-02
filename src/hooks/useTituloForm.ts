import { useState } from 'react';
import { ParcelaUtils } from '@/utils/titulo';

export interface NovoTitulo {
  cliente_id: string;
  valor: number;
  vencimento: string;
  status: 'em_aberto' | 'pago' | 'vencido' | 'acordo';
  observacoes?: string | null;
  tem_parcelas: boolean;
  total_parcelas: number;
  valor_parcela: number;
  intervalo_dias: number;
}

export interface FormErrors {
  cliente_id?: string;
  valor?: string;
  vencimento?: string;
  numero_parcelas?: string;
  intervalo_dias?: string;
}

export const useTituloForm = () => {
  const [formData, setFormData] = useState<NovoTitulo>({
    cliente_id: '',
    valor: 0,
    vencimento: new Date().toISOString().split('T')[0],
    status: 'em_aberto',
    observacoes: '',
    tem_parcelas: false,
    total_parcelas: 1,
    valor_parcela: 0,
    intervalo_dias: 30
  });

  const [errors, setErrors] = useState<FormErrors>({});

  const updateField = (field: keyof NovoTitulo, value: any) => {
    setFormData(prev => {
      const updated = { ...prev, [field]: value };
      
      // Atualizar valor da parcela quando necessário
      if ((field === 'valor' || field === 'total_parcelas') && updated.tem_parcelas) {
        updated.valor_parcela = ParcelaUtils.calcularValor(updated.valor, updated.total_parcelas);
      }
      
      return updated;
    });
  };

  const validate = (): boolean => {
    const newErrors: FormErrors = {};
    let isValid = true;

    if (!formData.cliente_id) {
      newErrors.cliente_id = 'Cliente é obrigatório';
      isValid = false;
    }

    if (!formData.valor || formData.valor <= 0) {
      newErrors.valor = 'Valor deve ser maior que zero';
      isValid = false;
    }

    if (!formData.vencimento) {
      newErrors.vencimento = 'Data de vencimento é obrigatória';
      isValid = false;
    }

    if (formData.tem_parcelas) {
      if (formData.total_parcelas < 2) {
        newErrors.numero_parcelas = 'Número de parcelas deve ser pelo menos 2';
        isValid = false;
      }

      if (formData.total_parcelas > 60) {
        newErrors.numero_parcelas = 'Número máximo de parcelas é 60';
        isValid = false;
      }

      if (formData.intervalo_dias < 1) {
        newErrors.intervalo_dias = 'Intervalo deve ser pelo menos 1 dia';
        isValid = false;
      }

      if (formData.intervalo_dias > 365) {
        newErrors.intervalo_dias = 'Intervalo máximo é 365 dias';
        isValid = false;
      }
    }

    setErrors(newErrors);
    return isValid;
  };

  const reset = () => {
    setFormData({
      cliente_id: '',
      valor: 0,
      vencimento: new Date().toISOString().split('T')[0],
      status: 'em_aberto',
      observacoes: '',
      tem_parcelas: false,
      total_parcelas: 1,
      valor_parcela: 0,
      intervalo_dias: 30
    });
    setErrors({});
  };

  return {
    formData,
    errors,
    updateField,
    validate,
    reset,
    setFormData
  };
};
