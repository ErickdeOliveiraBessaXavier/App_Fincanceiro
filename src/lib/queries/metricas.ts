import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { PostgrestError } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { buscarTodas } from '@/lib/buscarTodas';
import { dividaPorCliente, restringirAoUniverso } from '@/domain/metricas';
import type { DividaCliente } from '@/domain/metricas';
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
// Da view, não da tabela: o saldo vem do razão e o status 'vencida' é calculado
// pela data (a coluna da tabela só muda quando alguém sincroniza).
const COLUNAS_PARCELA_ACORDO = 'id, acordo_id, valor_total, saldo_atual, data_vencimento, status';
const COLUNAS_RECEBIMENTO =
  'recebimento_id, origem, titulo_id, acordo_id, valor, data_recebimento, meio_pagamento, titulo_ids, titulo_pesos';

/**
 * Busca a tabela/view inteira (visível pela RLS), ordenada por uma coluna
 * única — sem isso o PostgREST corta em 1.000 linhas e os totais saem errados.
 * `filtrar` estreita a consulta (ex.: um cliente só).
 */
function todas<T>(
  origem: string,
  colunas: string,
  chave = 'id',
  filtrar: (q: Consulta) => Consulta = (q) => q,
): Promise<T[]> {
  return buscarTodas<T>((de, ate) => {
    const consulta = supabase.from(origem as never).select(colunas) as unknown as Consulta;
    return filtrar(consulta).order(chave).range(de, ate) as PromiseLike<Resposta<T>>;
  });
}

/** O pedaço do query builder que `todas` usa (as origens variam, o tipo gerado não ajuda). */
interface Consulta {
  eq(coluna: string, valor: string): Consulta;
  in(coluna: string, valores: string[]): Consulta;
  order(coluna: string): Consulta;
  range(de: number, ate: number): PromiseLike<Resposta<unknown>>;
}
interface Resposta<T> {
  data: T[] | null;
  error: PostgrestError | null;
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
 *  * `vw_parcelas_acordo_tenant` já exclui parcela apagada e traz o saldo do razão.
 *  * `titulo_ids` do recebimento liga o dinheiro de acordo a TODOS os títulos dele.
 */
export function useBaseMetricas() {
  return useQuery({
    queryKey: metricasKeys.base(),
    queryFn: async (): Promise<BaseMetricas> => {
      const [titulos, parcelas, recebimentos, acordos, parcelasAcordo] = await Promise.all([
        todas<TituloMetrica>('vw_titulos_completos', COLUNAS_TITULO),
        todas<ParcelaMetrica>('vw_parcelas_consolidadas', COLUNAS_PARCELA),
        todas<RecebimentoMetrica>('vw_recebimentos_tenant', COLUNAS_RECEBIMENTO, 'recebimento_id'),
        todas<AcordoRow>('acordos', COLUNAS_ACORDO),
        todas<ParcelaAcordoMetrica>('vw_parcelas_acordo_tenant', COLUNAS_PARCELA_ACORDO),
      ]);

      return { titulos, parcelas, recebimentos, parcelasAcordo, acordos: acordos.map(mapearAcordo) };
    },
  });
}

/**
 * Dívida viva de cada cliente, da base única.
 *
 * Existe para as telas que precisam saber "esse cliente ainda deve alguma
 * coisa?" — a fila, por exemplo. O agregado da lista de clientes soma
 * `valor_original` de TODOS os títulos (pagos inclusive) e nunca enxergou
 * parcela de acordo, então não serve para essa pergunta.
 *
 * Reaproveita a consulta do Dashboard/Relatórios pela chave de cache.
 */
export function useDividaPorCliente() {
  const { data, isLoading, isError } = useBaseMetricas();

  const divida = useMemo(
    () => (data ? dividaPorCliente(restringirAoUniverso(data)) : new Map<string, DividaCliente>()),
    [data],
  );

  return { divida, isLoading, isError, carregada: !!data };
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
      const doCliente = (q: Consulta) => q.eq('cliente_id', clienteId!);
      const [titulos, acordoRows] = await Promise.all([
        todas<TituloMetrica>('vw_titulos_completos', COLUNAS_TITULO, 'id', doCliente),
        todas<AcordoRow>('acordos', COLUNAS_ACORDO, 'id', doCliente),
      ]);
      const acordos = acordoRows.map(mapearAcordo);
      const tituloIds = titulos.map((t) => t.id);
      const acordoIds = acordos.map((a) => a.id);

      // `.in()` com lista vazia devolve tudo em alguns backends; melhor não ir.
      const [parcelas, parcelasAcordo] = await Promise.all([
        tituloIds.length
          ? todas<ParcelaMetrica>('vw_parcelas_consolidadas', COLUNAS_PARCELA, 'id', (q) => q.in('titulo_id', tituloIds))
          : Promise.resolve([]),
        acordoIds.length
          ? todas<ParcelaAcordoMetrica>('vw_parcelas_acordo_tenant', COLUNAS_PARCELA_ACORDO, 'id', (q) => q.in('acordo_id', acordoIds))
          : Promise.resolve([]),
      ]);

      return {
        titulos,
        acordos,
        parcelas,
        parcelasAcordo,
        recebimentos: [],
      };
    },
  });
}
