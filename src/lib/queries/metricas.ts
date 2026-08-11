import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type {
  AcordoMetrica,
  BaseMetricas,
  ParcelaAcordoMetrica,
  ParcelaMetrica,
  RecebimentoMetrica,
  TituloMetrica,
} from '@/domain/metricas';

export const metricasKeys = {
  all: ['metricas'] as const,
  base: () => [...metricasKeys.all, 'base'] as const,
  cliente: (clienteId: string) => [...metricasKeys.all, 'cliente', clienteId] as const,
};

const COLUNAS_TITULO =
  'id, cliente_id, cliente_nome, cliente_cpf_cnpj, valor_original, saldo_devedor, total_pago, status, acordo_status, proximo_vencimento, vencimento_original, created_at';
const COLUNAS_PARCELA = 'id, titulo_id, vencimento, valor_nominal, saldo_atual, status';
const COLUNAS_ACORDO =
  'id, status, valor_acordo, valor_original, data_acordo, created_at, cliente_id, cliente:clientes(nome)';
const COLUNAS_PARCELA_ACORDO = 'id, acordo_id, valor_total, data_vencimento, status';

/** Propaga o erro da consulta ou devolve as linhas — evita 5 `if` seguidos. */
function linhasDe<T>(resultado: { data: T[] | null; error: { message: string } | null }): T[] {
  if (resultado.error) throw resultado.error;
  return resultado.data ?? [];
}

/** `acordos` traz o nome do cliente por join; o resto vem plano. */
interface AcordoRow {
  id: string;
  status: string;
  valor_acordo: number | string | null;
  valor_original: number | string | null;
  data_acordo: string | null;
  created_at: string | null;
  cliente_id: string | null;
  cliente: { nome: string | null } | null;
}

function mapearAcordo(a: AcordoRow): AcordoMetrica {
  return {
    id: a.id,
    status: a.status,
    valor_acordo: Number(a.valor_acordo ?? 0),
    valor_original: Number(a.valor_original ?? 0),
    data_acordo: a.data_acordo,
    created_at: a.created_at,
    cliente_id: a.cliente_id,
    cliente_nome: a.cliente?.nome ?? null,
  };
}

/**
 * Carrega UMA vez a base bruta que Dashboard e Relatórios compartilham.
 *
 * As quatro consultas são as mesmas para as duas telas — é isso que garante que
 * elas não possam divergir. O recorte (universo, período) é responsabilidade do
 * módulo de domínio, não da consulta, para que a regra fique num lugar só.
 *
 * Sobre os filtros aplicados aqui:
 *  * `vw_titulos_completos` já exclui título cancelado, cliente excluído e o que
 *    está fora da carteira do cobrador/vendedor — nada a acrescentar.
 *  * `acordos` NÃO tem esse filtro, então o cancelado é descartado no domínio
 *    (`restringirAoUniverso`), junto com o cruzamento por titulo_id.
 *  * `parcelas_acordo` traz só o que não foi excluído.
 */
export function useBaseMetricas() {
  return useQuery({
    queryKey: metricasKeys.base(),
    queryFn: async (): Promise<BaseMetricas> => {
      const [titulosRes, parcelasRes, recebimentosRes, acordosRes, parcelasAcordoRes] =
        await Promise.all([
          supabase.from('vw_titulos_completos').select(COLUNAS_TITULO),
          supabase.from('vw_parcelas_consolidadas').select(COLUNAS_PARCELA),
          supabase
            .from('vw_recebimentos_tenant')
            .select('recebimento_id, origem, titulo_id, acordo_id, valor, data_recebimento'),
          supabase.from('acordos').select(COLUNAS_ACORDO),
          supabase
            .from('parcelas_acordo')
            .select(COLUNAS_PARCELA_ACORDO)
            .is('deleted_at', null),
        ]);

      return {
        titulos: linhasDe(titulosRes) as unknown as TituloMetrica[],
        parcelas: linhasDe(parcelasRes) as unknown as ParcelaMetrica[],
        recebimentos: linhasDe(recebimentosRes) as unknown as RecebimentoMetrica[],
        parcelasAcordo: linhasDe(parcelasAcordoRes) as unknown as ParcelaAcordoMetrica[],
        acordos: (linhasDe(acordosRes) as unknown as AcordoRow[]).map(mapearAcordo),
      };
    },
  });
}

/**
 * A mesma base, recortada em UM cliente — para a ficha.
 *
 * A ficha não pode carregar a carteira inteira só para somar a dívida de um
 * cliente, mas também não pode ter regra própria: as duas somas que ela exibia
 * eram códigos independentes e nenhuma enxergava parcela de acordo em atraso.
 * Aqui as consultas são estreitas e o cálculo continua sendo o de
 * `domain/metricas`.
 *
 * `recebimentos` fica vazio de propósito: a situação do cliente é sobre dívida
 * viva, e nenhuma função consumida aqui lê recebimento.
 */
export function useBaseMetricasCliente(clienteId: string | null) {
  return useQuery({
    queryKey: metricasKeys.cliente(clienteId ?? ''),
    enabled: !!clienteId,
    queryFn: async (): Promise<BaseMetricas> => {
      const [titulosRes, acordosRes] = await Promise.all([
        supabase.from('vw_titulos_completos').select(COLUNAS_TITULO).eq('cliente_id', clienteId!),
        supabase.from('acordos').select(COLUNAS_ACORDO).eq('cliente_id', clienteId!),
      ]);

      const titulos = linhasDe(titulosRes) as unknown as TituloMetrica[];
      const acordos = (linhasDe(acordosRes) as unknown as AcordoRow[]).map(mapearAcordo);
      const tituloIds = titulos.map((t) => t.id);
      const acordoIds = acordos.map((a) => a.id);

      // `.in()` com lista vazia devolve tudo em alguns backends; melhor não ir.
      const [parcelasRes, parcelasAcordoRes] = await Promise.all([
        tituloIds.length
          ? supabase.from('vw_parcelas_consolidadas').select(COLUNAS_PARCELA).in('titulo_id', tituloIds)
          : Promise.resolve({ data: [], error: null }),
        acordoIds.length
          ? supabase
              .from('parcelas_acordo')
              .select(COLUNAS_PARCELA_ACORDO)
              .in('acordo_id', acordoIds)
              .is('deleted_at', null)
          : Promise.resolve({ data: [], error: null }),
      ]);

      return {
        titulos,
        acordos,
        parcelas: linhasDe(parcelasRes) as unknown as ParcelaMetrica[],
        parcelasAcordo: linhasDe(parcelasAcordoRes) as unknown as ParcelaAcordoMetrica[],
        recebimentos: [],
      };
    },
  });
}
