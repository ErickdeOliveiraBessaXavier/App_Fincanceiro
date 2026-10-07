/**
 * Preço de um plano para um limite de títulos: o do plano + os blocos de
 * excedente. Espelha `_valor_mensal` / `_blocos_excedentes` do banco, que é
 * quem emite as faturas; aqui é a mesma conta para simular e exibir.
 */

export interface PlanoPrecificavel {
  codigo: string;
  nome: string;
  /** null = sem limite. */
  limite_titulos: number | null;
  valor_mensal: number;
  valor_implantacao: number;
  /** null = plano sem regra de excedente. */
  excedente_bloco_titulos: number | null;
  excedente_valor_mensal: number;
  excedente_valor_implantacao: number;
}

export interface Preco {
  /** Limite efetivo contratado. */
  limite: number | null;
  blocosExcedentes: number;
  mensal: number;
  implantacao: number;
  /** Mensalidade por mil títulos do limite; null sem limite. */
  custoPorMil: number | null;
}

export function temRegraDeExcedente(p: PlanoPrecificavel): boolean {
  return p.excedente_bloco_titulos !== null && p.limite_titulos !== null;
}

/** Mesma conta de `_blocos_excedentes`: bloco cobrado inteiro. */
export function blocosExcedentes(p: PlanoPrecificavel, limite: number | null): number {
  if (!temRegraDeExcedente(p) || limite === null || limite <= p.limite_titulos!) return 0;
  return Math.ceil((limite - p.limite_titulos!) / p.excedente_bloco_titulos!);
}

function custoPorMil(mensal: number, limite: number | null): number | null {
  return limite ? (mensal / limite) * 1000 : null;
}

/** Preço do plano para um limite (o personalizado, ou o do plano quando null). */
export function precoDoLimite(p: PlanoPrecificavel, limitePersonalizado: number | null): Preco {
  const limite = limitePersonalizado ?? p.limite_titulos;
  const blocos = blocosExcedentes(p, limite);
  const mensal = p.valor_mensal + blocos * p.excedente_valor_mensal;
  return {
    limite,
    blocosExcedentes: blocos,
    mensal,
    implantacao: p.valor_implantacao + blocos * p.excedente_valor_implantacao,
    custoPorMil: custoPorMil(mensal, limite),
  };
}

/** Limite que o excedente compra para caber `titulos`: arredonda ao bloco. */
export function limiteParaCaber(p: PlanoPrecificavel, titulos: number): number | null {
  if (p.limite_titulos === null || titulos <= p.limite_titulos) return null;
  return p.limite_titulos + blocosExcedentes(p, titulos) * p.excedente_bloco_titulos!;
}

export interface Recomendacao {
  plano: PlanoPrecificavel;
  /** Limite personalizado a gravar; null = o do plano basta. */
  limitePersonalizado: number | null;
  preco: Preco;
}

/**
 * Plano mais barato que comporta `titulos` entre os pagos (os de valor zero
 * — teste e cortesia — não entram). Acima do maior, usa o excedente do plano
 * que tiver regra. null = nenhum plano comporta.
 */
export function recomendarPlano(planos: PlanoPrecificavel[], titulos: number): Recomendacao | null {
  const pagos = planos.filter((p) => p.valor_mensal > 0);
  const opcoes = pagos.flatMap((p): Recomendacao[] => {
    if (p.limite_titulos === null || titulos <= p.limite_titulos) {
      return [{ plano: p, limitePersonalizado: null, preco: precoDoLimite(p, null) }];
    }
    if (!temRegraDeExcedente(p)) return [];
    const limite = limiteParaCaber(p, titulos);
    return [{ plano: p, limitePersonalizado: limite, preco: precoDoLimite(p, limite) }];
  });
  if (opcoes.length === 0) return null;
  return opcoes.reduce((melhor, o) => (o.preco.mensal < melhor.preco.mensal ? o : melhor));
}

/** Faixas para a prévia da regra: limite do plano + 1, 2, 5 e 7 blocos. */
export function faixasDeExemplo(p: PlanoPrecificavel): number[] {
  if (!temRegraDeExcedente(p)) return [];
  return [1, 2, 5, 7].map((n) => p.limite_titulos! + n * p.excedente_bloco_titulos!);
}

/** Plano de topo: o pago de maior limite (é nele que mora o excedente). */
export function planoDeTopo<T extends PlanoPrecificavel>(planos: T[]): T | undefined {
  return planos
    .filter((p) => p.valor_mensal > 0 && p.limite_titulos !== null)
    .reduce<T | undefined>((topo, p) => (!topo || p.limite_titulos! > topo.limite_titulos! ? p : topo), undefined);
}
