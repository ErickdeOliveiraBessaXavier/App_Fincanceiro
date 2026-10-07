import { useCobrancaPlataforma, type Assinatura, type FaturaDaEmpresa } from '@/lib/queries/assinaturas';
import { usePlanos, type Plano } from '@/lib/queries/planos';
import { hojeIso } from '@/domain/telecobranca/statusCobranca';
import { precoDoLimite } from '@/domain/precificacao';
import {
  TOLERANCIA_PADRAO_DIAS, resumirCobranca, valorMensalEfetivo, type ResumoCobrancaEmpresa,
} from '@/domain/assinatura';

/** Cobrança de uma empresa na tabela da Plataforma. */
export interface CobrancaDaEmpresa extends ResumoCobrancaEmpresa {
  /** Mensalidade efetiva da assinatura ativa; null = sem assinatura ativa. */
  mensal: number | null;
}

export interface ResumoPlataforma {
  porEmpresa: Map<string, CobrancaDaEmpresa>;
  /** Receita recorrente: soma das mensalidades das assinaturas ativas de empresas ativas. */
  mrr: number;
  emAtraso: number;
}

interface EmpresaBase {
  id: string;
  plano: string;
  status: string;
  limite_titulos_personalizado: number | null;
}

function agruparPorEmpresa(faturas: FaturaDaEmpresa[]): Map<string, FaturaDaEmpresa[]> {
  const mapa = new Map<string, FaturaDaEmpresa[]>();
  for (const f of faturas) mapa.set(f.company_id, [...(mapa.get(f.company_id) ?? []), f]);
  return mapa;
}

/** Mesma regra de `_valor_mensal`: negociada, ou a do plano pelo limite da empresa. */
function mensalidadeAtiva(a: Assinatura | undefined, plano: Plano | undefined, limite: number | null): number | null {
  if (!a?.ativa) return null;
  const doPlano = plano ? precoDoLimite(plano, limite).mensal : 0;
  return valorMensalEfetivo(a.valor_mensal_personalizado, doPlano);
}

export function montarResumoPlataforma(
  empresas: EmpresaBase[],
  planos: Plano[],
  assinaturas: Assinatura[],
  faturasAbertas: FaturaDaEmpresa[],
  hoje: string,
): ResumoPlataforma {
  const planoPorCodigo = new Map(planos.map((p) => [p.codigo, p]));
  const assinaturaPorEmpresa = new Map(assinaturas.map((a) => [a.company_id, a]));
  const faturasPorEmpresa = agruparPorEmpresa(faturasAbertas);
  const porEmpresa = new Map<string, CobrancaDaEmpresa>();
  let mrr = 0;
  let emAtraso = 0;

  for (const e of empresas) {
    const a = assinaturaPorEmpresa.get(e.id);
    const tolerancia = a?.dias_tolerancia ?? TOLERANCIA_PADRAO_DIAS;
    const resumo = resumirCobranca(faturasPorEmpresa.get(e.id) ?? [], tolerancia, hoje);
    const mensal = mensalidadeAtiva(a, planoPorCodigo.get(e.plano), e.limite_titulos_personalizado);
    porEmpresa.set(e.id, { ...resumo, mensal });
    if (e.status === 'ativa') mrr += mensal ?? 0;
    emAtraso += resumo.emAtraso;
  }
  return { porEmpresa, mrr, emAtraso };
}

/** Resumo da cobrança para a Plataforma (super admin). */
export function useResumoCobrancaPlataforma(
  empresas: EmpresaBase[] | undefined, enabled: boolean,
): ResumoPlataforma & { carregado: boolean } {
  const { data: planos } = usePlanos(enabled);
  const { data } = useCobrancaPlataforma(enabled);
  const resumo = montarResumoPlataforma(
    empresas ?? [], planos ?? [], data?.assinaturas ?? [], data?.faturasAbertas ?? [], hojeIso(),
  );
  // Antes de carregar, toda empresa pareceria "sem assinatura".
  return { ...resumo, carregado: !!planos && !!data };
}
