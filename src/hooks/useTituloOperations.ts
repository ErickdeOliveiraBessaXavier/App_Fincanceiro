import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Titulo, ParcelaUtils, FormatUtils } from '@/utils/titulo';
import { NovoTitulo } from './useTituloForm';

export const useTituloOperations = () => {
  const { toast } = useToast();

  const createTitulo = async (formData: NovoTitulo, onSuccess: () => void) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) throw new Error('Usuário não autenticado');

      if (formData.tem_parcelas) {
        const valorPorParcela = ParcelaUtils.calcularValor(formData.valor, formData.total_parcelas);
        
        // Criar título pai primeiro
        const { data: tituloPaiData, error: tituloPaiError } = await supabase
          .from('titulos')
          .insert({
            cliente_id: formData.cliente_id,
            valor: formData.valor,
            vencimento: formData.vencimento,
            status: 'em_aberto',
            observacoes: `${formData.observacoes || ''} - Dívida parcelada em ${formData.total_parcelas}x`.trim(),
            created_by: user.id,
            total_parcelas: formData.total_parcelas,
            valor_original: formData.valor,
            titulo_pai_id: null
          })
          .select()
          .single();

        if (tituloPaiError) throw tituloPaiError;

        // Calcular datas das parcelas
        const datasParcelas = ParcelaUtils.calcularDatas(
          formData.vencimento, 
          formData.total_parcelas, 
          formData.intervalo_dias
        );

        // Criar parcelas
        const parcelasParaInserir = datasParcelas.map((data, index) => ({
          cliente_id: formData.cliente_id,
          valor: valorPorParcela,
          vencimento: data,
          status: formData.status,
          observacoes: `${formData.observacoes || ''} - Parcela ${index + 1}/${formData.total_parcelas}`.trim(),
          created_by: user.id,
          titulo_pai_id: tituloPaiData.id,
          numero_parcela: index + 1,
          total_parcelas: formData.total_parcelas,
          valor_original: formData.valor
        }));

        const { error: parcelasError } = await supabase
          .from('titulos')
          .insert(parcelasParaInserir);

        if (parcelasError) throw parcelasError;

        toast({
          title: "Sucesso",
          description: `Título parcelado criado! 1 dívida principal + ${formData.total_parcelas} parcelas de ${FormatUtils.currency(valorPorParcela)} cada`,
        });

      } else {
        // Criar título único
        const { error: insertError } = await supabase
          .from('titulos')
          .insert({
            cliente_id: formData.cliente_id,
            valor: formData.valor,
            vencimento: formData.vencimento,
            status: formData.status,
            observacoes: formData.observacoes || null,
            created_by: user.id
          });

        if (insertError) throw insertError;

        toast({
          title: "Sucesso",
          description: "Título criado com sucesso!",
        });
      }

      onSuccess();

    } catch (error) {
      console.error('Erro ao criar título:', error);
      toast({
        title: "Erro",
        description: `Não foi possível criar o título: ${error.message}`,
        variant: "destructive",
      });
    }
  };

  const updateTitulo = async (
    editingTitulo: any,
    titulos: Titulo[],
    onSuccess: () => void
  ) => {
    try {
      const tituloAtual = titulos.find(t => t.id === editingTitulo.id);
      if (!tituloAtual) {
        throw new Error('Título não encontrado');
      }
      
      const isParcela = ParcelaUtils.isParcela(tituloAtual);
      const isTituloPai = ParcelaUtils.isTituloPai(tituloAtual);
      
      if (isParcela) {
        // Para parcelas, só permitir alteração de status e observações
        const { error: updateError } = await supabase
          .from('titulos')
          .update({
            status: editingTitulo.status,
            observacoes: editingTitulo.observacoes || null
          })
          .eq('id', editingTitulo.id);

        if (updateError) throw updateError;
        
        toast({
          title: "Sucesso",
          description: "Status da parcela atualizado com sucesso",
        });

      } else if (isTituloPai) {
        // Para títulos pai, só permitir alteração de observações
        const { error: updateError } = await supabase
          .from('titulos')
          .update({
            observacoes: editingTitulo.observacoes || null
          })
          .eq('id', editingTitulo.id);

        if (updateError) throw updateError;
        
        toast({
          title: "Sucesso",
          description: "Observações do título parcelado atualizadas com sucesso",
        });

      } else {
        // Para títulos únicos, permitir todas as alterações
        const { error: updateError } = await supabase
          .from('titulos')
          .update({
            cliente_id: editingTitulo.cliente_id,
            valor: editingTitulo.valor,
            vencimento: editingTitulo.vencimento,
            status: editingTitulo.status,
            observacoes: editingTitulo.observacoes || null
          })
          .eq('id', editingTitulo.id);

        if (updateError) throw updateError;
      }

      onSuccess();
      
    } catch (error) {
      console.error('Erro ao atualizar título:', error);
      toast({
        title: "Erro",
        description: `Não foi possível atualizar o título: ${error.message}`,
        variant: "destructive",
      });
    }
  };

  return {
    createTitulo,
    updateTitulo
  };
};
