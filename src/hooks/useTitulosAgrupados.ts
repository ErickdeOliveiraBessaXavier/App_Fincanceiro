import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface TituloItem {
  id: string;
  valor: number;
  vencimento: string;
  status: string;
  numero_parcela?: number | null;
  total_parcelas?: number | null;
  titulo_pai_id?: string | null;
}

export interface TituloAgrupado {
  id: string; // titulo_pai_id ou próprio id para títulos avulsos
  cliente: {
    id: string;
    nome: string;
    cpf_cnpj: string;
  };
  valor_total: number; // soma de todas as parcelas em aberto
  total_parcelas: number;
  parcelas_abertas: number;
  parcelas_pagas: number;
  titulos: TituloItem[]; // lista de títulos/parcelas deste grupo
  vencimento_mais_antigo: string;
  tem_vencido: boolean;
}

export interface ClienteComDividas {
  id: string;
  nome: string;
  cpf_cnpj: string;
  dividas: TituloAgrupado[];
  valor_total: number;
}

export const useTitulosAgrupados = (clienteIdFiltro?: string) => {
  const [clientes, setClientes] = useState<ClienteComDividas[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchTitulosAgrupados = useCallback(async () => {
    try {
      setLoading(true);

      let query = supabase
        .from('titulos')
        .select(`
          id,
          valor,
          vencimento,
          status,
          numero_parcela,
          total_parcelas,
          titulo_pai_id,
          cliente:clientes (
            id,
            nome,
            cpf_cnpj
          )
        `)
        .in('status', ['em_aberto', 'vencido'])
        .order('vencimento');

      if (clienteIdFiltro) {
        query = query.eq('cliente_id', clienteIdFiltro);
      }

      const { data: rawData, error } = await query;

      if (error) throw error;

      // Agrupar por cliente e depois por dívida (titulo_pai_id)
      const clientesMap = new Map<string, ClienteComDividas>();
      const dividasMap = new Map<string, TituloAgrupado>();

      (rawData || []).forEach((item: any) => {
        const cliente = item.cliente;
        if (!cliente) return;

        // Determinar o ID do grupo (titulo_pai_id ou próprio id para avulsos)
        const grupoId = item.titulo_pai_id || item.id;
        const isParcelaFilha = item.titulo_pai_id !== null;

        // Inicializar cliente se não existir
        if (!clientesMap.has(cliente.id)) {
          clientesMap.set(cliente.id, {
            id: cliente.id,
            nome: cliente.nome,
            cpf_cnpj: cliente.cpf_cnpj,
            dividas: [],
            valor_total: 0
          });
        }

        // Chave única para a dívida (cliente + grupo)
        const dividaKey = `${cliente.id}-${grupoId}`;

        // Inicializar dívida se não existir
        if (!dividasMap.has(dividaKey)) {
          dividasMap.set(dividaKey, {
            id: grupoId,
            cliente: {
              id: cliente.id,
              nome: cliente.nome,
              cpf_cnpj: cliente.cpf_cnpj
            },
            valor_total: 0,
            total_parcelas: item.total_parcelas || 1,
            parcelas_abertas: 0,
            parcelas_pagas: 0,
            titulos: [],
            vencimento_mais_antigo: item.vencimento,
            tem_vencido: false
          });
        }

        const divida = dividasMap.get(dividaKey)!;

        // Adicionar título à lista
        divida.titulos.push({
          id: item.id,
          valor: item.valor,
          vencimento: item.vencimento,
          status: item.status,
          numero_parcela: item.numero_parcela,
          total_parcelas: item.total_parcelas,
          titulo_pai_id: item.titulo_pai_id
        });

        // Atualizar valores
        if (item.status === 'em_aberto' || item.status === 'vencido') {
          divida.valor_total += item.valor;
          divida.parcelas_abertas++;
        }

        if (item.status === 'vencido') {
          divida.tem_vencido = true;
        }

        // Atualizar vencimento mais antigo
        if (new Date(item.vencimento) < new Date(divida.vencimento_mais_antigo)) {
          divida.vencimento_mais_antigo = item.vencimento;
        }
      });

      // Associar dívidas aos clientes
      dividasMap.forEach((divida, key) => {
        const clienteId = key.split('-')[0];
        const cliente = clientesMap.get(clienteId);
        if (cliente) {
          // Ordenar títulos por número de parcela
          divida.titulos.sort((a, b) => (a.numero_parcela || 0) - (b.numero_parcela || 0));
          cliente.dividas.push(divida);
          cliente.valor_total += divida.valor_total;
        }
      });

      // Converter para array e ordenar por valor total
      const clientesArray = Array.from(clientesMap.values())
        .filter(c => c.dividas.length > 0)
        .sort((a, b) => b.valor_total - a.valor_total);

      setClientes(clientesArray);
    } catch (error) {
      console.error('Erro ao carregar títulos agrupados:', error);
    } finally {
      setLoading(false);
    }
  }, [clienteIdFiltro]);

  useEffect(() => {
    fetchTitulosAgrupados();
  }, [fetchTitulosAgrupados]);

  return {
    clientes,
    loading,
    refetch: fetchTitulosAgrupados
  };
};
