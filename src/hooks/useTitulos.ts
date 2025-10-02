import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Titulo, StatusUtils, ParcelaUtils } from '@/utils/titulo';

export const useTitulos = () => {
  const [titulos, setTitulos] = useState<Titulo[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const checkAndUpdateOverdueTitulos = async () => {
    try {
      const today = new Date().toISOString().split('T')[0];
      
      const { data: overdueData, error: overdueError } = await supabase
        .from('titulos')
        .select('id, vencimento, status')
        .lt('vencimento', today)
        .in('status', ['em_aberto', 'acordo']);

      if (overdueError) throw overdueError;

      if (overdueData && overdueData.length > 0) {
        const { error: updateError } = await supabase
          .from('titulos')
          .update({ status: 'vencido' })
          .in('id', overdueData.map(t => t.id));

        if (updateError) throw updateError;

        console.log(`${overdueData.length} títulos atualizados para status vencido`);
      }
    } catch (error) {
      console.error('Erro ao verificar títulos vencidos:', error);
    }
  };

  const fetchTitulos = async () => {
    try {
      setLoading(true);
      const { data: rawData, error } = await supabase
        .from('titulos')
        .select(`
          *,
          cliente:clientes (
            id,
            nome,
            cpf_cnpj,
            telefone,
            email
          )
        `)
        .order('vencimento', { ascending: true });

      if (error) throw error;

      const typedData = (rawData || []).map((item: any) => {
        const tituloBase: Titulo = {
          id: item.id,
          cliente_id: item.cliente_id,
          valor: item.valor,
          vencimento: item.vencimento,
          status: item.status,
          observacoes: item.observacoes || '',
          created_by: item.created_by,
          created_at: item.created_at,
          updated_at: item.updated_at,
          cliente: item.cliente || {
            id: item.cliente_id || '',
            nome: 'Cliente não encontrado',
            cpf_cnpj: '',
            telefone: '',
            email: ''
          },
          titulo_pai_id: item.titulo_pai_id,
          numero_parcela: item.numero_parcela,
          total_parcelas: item.total_parcelas,
          valor_original: item.valor_original
        };

        const statusCorreto = StatusUtils.calculateCorrectStatus(tituloBase);
        
        if (statusCorreto !== tituloBase.status && statusCorreto === 'vencido') {
          supabase
            .from('titulos')
            .update({ status: 'vencido' })
            .eq('id', item.id)
            .then(({ error }) => {
              if (error) {
                console.error('Erro ao atualizar status do título:', error);
              }
            });
        }

        return {
          ...tituloBase,
          status: statusCorreto
        };
      });

      setTitulos(typedData);
    } catch (error) {
      console.error('Erro ao carregar títulos:', error);
      toast({
        title: "Erro",
        description: `Não foi possível carregar os títulos: ${error.message}`,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const deleteTitulo = async (titulo: Titulo) => {
    try {
      const isParcela = ParcelaUtils.isParcela(titulo);
      const isTituloPai = ParcelaUtils.isTituloPai(titulo);

      if (isTituloPai) {
        const { error: parcelasError } = await supabase
          .from('titulos')
          .delete()
          .eq('titulo_pai_id', titulo.id);

        if (parcelasError) throw parcelasError;
      }

      const { error } = await supabase
        .from('titulos')
        .delete()
        .eq('id', titulo.id);

      if (error) throw error;

      await fetchTitulos();

      toast({
        title: "Sucesso",
        description: isTituloPai ? "Título parcelado e suas parcelas excluídos com sucesso" : "Título excluído com sucesso",
      });
    } catch (error) {
      console.error('Erro ao excluir título:', error);
      toast({
        title: "Erro",
        description: "Não foi possível excluir o título",
        variant: "destructive",
      });
    }
  };

  useEffect(() => {
    const loadData = async () => {
      await checkAndUpdateOverdueTitulos();
      await fetchTitulos();
    };
    loadData();
  }, []);

  return {
    titulos,
    loading,
    fetchTitulos,
    deleteTitulo
  };
};
