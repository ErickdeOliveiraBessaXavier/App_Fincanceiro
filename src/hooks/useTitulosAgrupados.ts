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

      // Buscar TODOS os títulos para poder agrupar corretamente
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
        .order('vencimento');

      if (clienteIdFiltro) {
        query = query.eq('cliente_id', clienteIdFiltro);
      }

      const { data: rawData, error } = await query;

      if (error) throw error;

      // Separar títulos pai, filhos e avulsos
      const parcelasFilhas = new Map<string, any[]>();
      const titulosAvulsos: any[] = [];

      // Primeiro pass: identificar todos os IDs que são pais (têm filhos)
      const idsQueSaoPais = new Set<string>();
      (rawData || []).forEach((item: any) => {
        if (item.titulo_pai_id) {
          idsQueSaoPais.add(item.titulo_pai_id);
        }
      });

      // Segundo pass: classificar cada título
      (rawData || []).forEach((item: any) => {
        // Pular títulos que são containers (são pais) - serão representados pelas parcelas
        if (idsQueSaoPais.has(item.id)) {
          return;
        }

        if (item.titulo_pai_id) {
          // É uma parcela filha
          if (!parcelasFilhas.has(item.titulo_pai_id)) {
            parcelasFilhas.set(item.titulo_pai_id, []);
          }
          parcelasFilhas.get(item.titulo_pai_id)!.push(item);
        } else {
          // Título avulso (não é pai nem filho)
          titulosAvulsos.push(item);
        }
      });

      // Agrupar por cliente e dívida
      const clientesMap = new Map<string, ClienteComDividas>();
      const dividasMap = new Map<string, TituloAgrupado>();

      // Processar parcelas filhas (agrupadas pelo titulo_pai_id)
      parcelasFilhas.forEach((parcelas, tituloPaiId) => {
        parcelas.forEach((item: any) => {
          const cliente = item.cliente;
          if (!cliente) return;

          // Só processar se status for em_aberto ou vencido
          if (item.status !== 'em_aberto' && item.status !== 'vencido') return;

          // Inicializar cliente
          if (!clientesMap.has(cliente.id)) {
            clientesMap.set(cliente.id, {
              id: cliente.id,
              nome: cliente.nome,
              cpf_cnpj: cliente.cpf_cnpj,
              dividas: [],
              valor_total: 0
            });
          }

          const dividaKey = `${cliente.id}-${tituloPaiId}`;

          if (!dividasMap.has(dividaKey)) {
            dividasMap.set(dividaKey, {
              id: tituloPaiId,
              cliente: { id: cliente.id, nome: cliente.nome, cpf_cnpj: cliente.cpf_cnpj },
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

          divida.titulos.push({
            id: item.id,
            valor: item.valor,
            vencimento: item.vencimento,
            status: item.status,
            numero_parcela: item.numero_parcela,
            total_parcelas: item.total_parcelas,
            titulo_pai_id: item.titulo_pai_id
          });

          divida.valor_total += item.valor;
          divida.parcelas_abertas++;

          if (item.status === 'vencido') {
            divida.tem_vencido = true;
          }

          if (new Date(item.vencimento) < new Date(divida.vencimento_mais_antigo)) {
            divida.vencimento_mais_antigo = item.vencimento;
          }
        });
      });

      // Processar títulos avulsos
      titulosAvulsos.forEach((item: any) => {
        const cliente = item.cliente;
        if (!cliente) return;

        // Só processar se status for em_aberto ou vencido
        if (item.status !== 'em_aberto' && item.status !== 'vencido') return;

        if (!clientesMap.has(cliente.id)) {
          clientesMap.set(cliente.id, {
            id: cliente.id,
            nome: cliente.nome,
            cpf_cnpj: cliente.cpf_cnpj,
            dividas: [],
            valor_total: 0
          });
        }

        const dividaKey = `${cliente.id}-${item.id}`;

        dividasMap.set(dividaKey, {
          id: item.id,
          cliente: { id: cliente.id, nome: cliente.nome, cpf_cnpj: cliente.cpf_cnpj },
          valor_total: item.valor,
          total_parcelas: 1,
          parcelas_abertas: 1,
          parcelas_pagas: 0,
          titulos: [{
            id: item.id,
            valor: item.valor,
            vencimento: item.vencimento,
            status: item.status,
            numero_parcela: null,
            total_parcelas: null,
            titulo_pai_id: null
          }],
          vencimento_mais_antigo: item.vencimento,
          tem_vencido: item.status === 'vencido'
        });
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
