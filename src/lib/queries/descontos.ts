import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Periodo } from '@/domain/metricas';

/**
 * Descontos concedidos.
 *
 * Existe porque o teto deixou de bloquear o administrador: ele pode ultrapassar
 * quando a negociação exigir, e a exceção fica registrada em vez de barrada.
 * Sem um lugar para ver, esse registro não controlaria nada — é aqui que ele
 * vira informação: quem concedeu, por quê, e se estourou o teto vigente na data.
 *
 * Também é o que revela quando o próprio teto está errado: exceção que virou
 * rotina não pede mais trava, pede recalibrar o percentual.
 */

export interface DescontoConcedido {
  id: string;
  data_evento: string;
  valor: number;
  descricao: string | null;
  estornado: boolean;
  origem: 'acordo' | 'titulo';
  excedeu_teto: boolean;
  teto_percentual: number | null;
  teto_valor: number | null;
  valor_parcela: number | null;
  numero_parcela: number | null;
  acordo_id: string | null;
  cliente_id: string | null;
  cliente_nome: string | null;
  concedido_por: string | null;
}

export const descontosKeys = {
  all: ['descontos'] as const,
  lista: (periodo?: Periodo) => [...descontosKeys.all, 'lista', periodo ?? null] as const,
};

export function useDescontosConcedidos(periodo?: Periodo) {
  return useQuery({
    queryKey: descontosKeys.lista(periodo),
    queryFn: async (): Promise<DescontoConcedido[]> => {
      let query = supabase
        .from('vw_descontos_concedidos_tenant')
        .select('*')
        .order('data_evento', { ascending: false });

      // Mesmo recorte por data usado nos demais relatórios.
      if (periodo) {
        query = query.gte('data_evento', periodo.de).lte('data_evento', periodo.ate);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as unknown as DescontoConcedido[];
    },
  });
}

export interface ResumoDescontos {
  total: number;
  valorTotal: number;
  excecoes: number;
  valorExcecoes: number;
}

/** Estornados ficam de fora dos totais: desconto desfeito não é desconto dado. */
export function resumirDescontos(descontos: DescontoConcedido[]): ResumoDescontos {
  const validos = descontos.filter((d) => !d.estornado);
  const excecoes = validos.filter((d) => d.excedeu_teto);
  const somar = (itens: DescontoConcedido[]) =>
    itens.reduce((total, d) => total + Number(d.valor), 0);

  return {
    total: validos.length,
    valorTotal: somar(validos),
    excecoes: excecoes.length,
    valorExcecoes: somar(excecoes),
  };
}
