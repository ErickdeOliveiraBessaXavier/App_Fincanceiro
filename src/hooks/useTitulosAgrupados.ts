import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface TituloItem {
  id: string;
  parcela_id: string;
  valor: number;
  vencimento: string;
  status: string;
  numero_parcela: number;
  total_parcelas?: number;
  saldo_atual: number;
}

export interface TituloAgrupado {
  id: string; // titulo_id
  numero_documento?: string;
  cliente: {
    id: string;
    nome: string;
    cpf_cnpj: string;
  };
  valor_total: number; // soma de saldos em aberto
  total_parcelas: number;
  parcelas_abertas: number;
  parcelas_pagas: number;
  titulos: TituloItem[]; // lista de parcelas
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

      // Buscar da view consolidada
      let query = supabase
        .from('vw_titulos_completos')
        .select('*')
        .in('status', ['ativo', 'inadimplente']);

      if (clienteIdFiltro) {
        query = query.eq('cliente_id', clienteIdFiltro);
      }

      const { data: titulos, error } = await query;

      if (error) throw error;

      // Para cada título, buscar suas parcelas pendentes
      const clientesMap = new Map<string, ClienteComDividas>();

      for (const titulo of titulos || []) {
        const clienteId = titulo.cliente_id;
        if (!clienteId) continue;

        // Buscar parcelas do título
        const { data: parcelas } = await supabase
          .from('mv_parcelas_consolidadas')
          .select('*')
          .eq('titulo_id', titulo.id)
          .in('status', ['pendente', 'vencida'])
          .order('numero_parcela');

        if (!parcelas || parcelas.length === 0) continue;

        // Inicializar cliente
        if (!clientesMap.has(clienteId)) {
          clientesMap.set(clienteId, {
            id: clienteId,
            nome: titulo.cliente_nome || '',
            cpf_cnpj: titulo.cliente_cpf_cnpj || '',
            dividas: [],
            valor_total: 0
          });
        }

        const cliente = clientesMap.get(clienteId)!;

        const divida: TituloAgrupado = {
          id: titulo.id!,
          numero_documento: titulo.numero_documento || undefined,
          cliente: {
            id: clienteId,
            nome: titulo.cliente_nome || '',
            cpf_cnpj: titulo.cliente_cpf_cnpj || ''
          },
          valor_total: parcelas.reduce((sum, p) => sum + (p.saldo_atual || 0), 0),
          total_parcelas: titulo.quantidade_parcelas || 1,
          parcelas_abertas: parcelas.length,
          parcelas_pagas: titulo.parcelas_pagas || 0,
          titulos: parcelas.map(p => ({
            id: titulo.id!,
            parcela_id: p.id!,
            valor: p.valor_nominal || 0,
            vencimento: p.vencimento || '',
            status: p.status || 'pendente',
            numero_parcela: p.numero_parcela || 1,
            saldo_atual: p.saldo_atual || 0
          })),
          vencimento_mais_antigo: parcelas[0]?.vencimento || titulo.vencimento_original || '',
          tem_vencido: parcelas.some(p => p.status === 'vencida')
        };

        cliente.dividas.push(divida);
        cliente.valor_total += divida.valor_total;
      }

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
