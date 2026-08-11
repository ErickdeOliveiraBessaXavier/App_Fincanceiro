/**
 * Regra de negócio ÚNICA dos indicadores (Dashboard e Relatórios).
 *
 * Antes cada tela reimplementava o cálculo e chegava a números diferentes para o
 * mesmo fato. As decisões que este módulo fixa:
 *
 *  * Universo = o que `vw_titulos_completos` devolve. A view já exclui título
 *    cancelado (deleted_at), cliente excluído e o que está fora da carteira do
 *    cobrador/vendedor. Nada é recontado no cliente.
 *  * `vw_parcelas_consolidadas` e `vw_recebimentos_tenant` isolam por EMPRESA,
 *    mas não por carteira. Por isso tudo é cruzado por `titulo_id` contra o
 *    universo antes de virar indicador (`restringirAoUniverso`).
 *  * "Vencido" tem UMA definição: soma dos itens em atraso — parcelas de título
 *    e parcelas de acordo. Aging, card de risco e top devedores saem todos dela,
 *    então não podem divergir entre si.
 *  * "Recuperado" vem de `vw_recebimentos_tenant`, com a data real do
 *    recebimento. O campo antigo (`titulos.updated_at`) nunca foi tocado por
 *    pagamento — `registrar_pagamento_parcela` só escreve em `eventos_parcela`.
 *  * Acordo cancelado nunca entra em nada.
 */

import { hojeIso } from '@/domain/telecobranca/statusCobranca';
import {
  dentroDoPeriodo,
  inicioDoMesAtual,
  mesDe,
  periodoDoMes,
  rotuloMes,
  ultimosMeses,
} from './periodo';
import type {
  AcordoMetrica,
  BaseMetricas,
  ClasseTitulo,
  ContagemMensal,
  Devedor,
  FaixaAging,
  IndicadoresCarteira,
  ItemVencido,
  ParcelaAcordoMetrica,
  ParcelaMetrica,
  Periodo,
  PontoMensal,
  ProximoVencimento,
  RecebimentoMetrica,
  TituloMetrica,
} from './tipos';

const soma = (valores: number[]): number => valores.reduce((total, v) => total + v, 0);

// ============== Classificação ==============

// Data-driven para não virar cadeia de if/else (regra de complexidade do projeto).
const CLASSE_POR_ACORDO: Record<string, ClasseTitulo> = {
  ativo: 'em_acordo',
  quebrado: 'acordo_quebrado',
  cumprido: 'acordo_cumprido',
};

const CLASSE_POR_STATUS: Record<string, ClasseTitulo> = {
  pago: 'pago',
  vencido: 'vencido',
  a_vencer: 'a_vencer',
  renegociado: 'em_acordo',
  pendente: 'a_vencer', // legado
};

/**
 * O estado do acordo manda sobre o saldo: a novação zera as parcelas originais,
 * então sem esta precedência um acordo QUEBRADO apareceria como título "pago".
 */
export function classificarTitulo(titulo: TituloMetrica): ClasseTitulo {
  const porAcordo = titulo.acordo_status ? CLASSE_POR_ACORDO[titulo.acordo_status] : undefined;
  return porAcordo ?? CLASSE_POR_STATUS[titulo.status] ?? 'a_vencer';
}

/** Dívida ainda não resolvida (o oposto de 'pago' e 'acordo_cumprido'). */
export function estaEmAberto(titulo: TituloMetrica): boolean {
  const classe = classificarTitulo(titulo);
  return classe !== 'pago' && classe !== 'acordo_cumprido';
}

// ============== Recortes ==============

/**
 * Cruza parcelas, recebimentos e acordos contra o universo de títulos e descarta
 * acordo cancelado. É o passo que impede o vazamento entre carteiras e o que
 * tirava do Dashboard as parcelas de títulos que a view já havia excluído.
 */
export function restringirAoUniverso(base: BaseMetricas): BaseMetricas {
  const titulosValidos = new Set(base.titulos.map((t) => t.id));
  const acordos = base.acordos.filter((a) => a.status !== 'cancelado');
  const acordosValidos = new Set(acordos.map((a) => a.id));

  return {
    titulos: base.titulos,
    acordos,
    parcelas: base.parcelas.filter((p) => titulosValidos.has(p.titulo_id)),
    parcelasAcordo: base.parcelasAcordo.filter((p) => acordosValidos.has(p.acordo_id)),
    recebimentos: base.recebimentos.filter((r) => !!r.titulo_id && titulosValidos.has(r.titulo_id)),
  };
}

/**
 * Recorta a base por VENCIMENTO (decisão do gestor em 2026-08-06): o relatório
 * responde "o que vence no período", não "o que foi cadastrado no período".
 *
 * O recorte é feito na parcela, que é onde o vencimento existe; o título entra
 * se tiver ao menos uma parcela no intervalo. Os recebimentos acompanham os
 * títulos selecionados — ou seja, "quanto já foi recuperado do que vence aqui".
 */
export function recortarPorVencimento(base: BaseMetricas, periodo?: Periodo): BaseMetricas {
  if (!periodo) return base;

  const parcelas = base.parcelas.filter((p) => dentroDoPeriodo(p.vencimento, periodo));
  const titulosNoPeriodo = new Set(parcelas.map((p) => p.titulo_id));
  const parcelasAcordo = base.parcelasAcordo.filter((p) => dentroDoPeriodo(p.data_vencimento, periodo));
  const acordosNoPeriodo = new Set(parcelasAcordo.map((p) => p.acordo_id));

  return {
    parcelas,
    parcelasAcordo,
    titulos: base.titulos.filter((t) => titulosNoPeriodo.has(t.id)),
    acordos: base.acordos.filter((a) => acordosNoPeriodo.has(a.id)),
    recebimentos: base.recebimentos.filter((r) => !!r.titulo_id && titulosNoPeriodo.has(r.titulo_id)),
  };
}

/** Universo + período, na ordem correta. Ponto de entrada das telas. */
export function prepararBase(base: BaseMetricas, periodo?: Periodo): BaseMetricas {
  return recortarPorVencimento(restringirAoUniverso(base), periodo);
}

// ============== Itens vencidos (fonte única do "vencido") ==============

function itensVencidosDeTitulos(titulos: TituloMetrica[], parcelas: ParcelaMetrica[]): ItemVencido[] {
  const porTitulo = new Map(titulos.map((t) => [t.id, t]));
  return parcelas
    .filter((p) => p.status === 'vencido')
    .map((p) => {
      const titulo = porTitulo.get(p.titulo_id);
      return {
        clienteId: titulo?.cliente_id ?? null,
        clienteNome: titulo?.cliente_nome || 'Desconhecido',
        vencimento: p.vencimento,
        valor: Number(p.saldo_atual),
        origem: 'titulo' as const,
      };
    });
}

/**
 * Parcela de acordo em atraso também é inadimplência — e era invisível: o
 * título fica com saldo zerado pela novação, então nada dele aparecia vencido.
 */
function itensVencidosDeAcordos(
  acordos: AcordoMetrica[],
  parcelasAcordo: ParcelaAcordoMetrica[],
  hoje: string,
): ItemVencido[] {
  const porAcordo = new Map(acordos.map((a) => [a.id, a]));
  return parcelasAcordo
    .filter((p) => p.status !== 'paga' && p.data_vencimento < hoje)
    .map((p) => {
      const acordo = porAcordo.get(p.acordo_id);
      return {
        clienteId: acordo?.cliente_id ?? null,
        clienteNome: acordo?.cliente_nome || 'Desconhecido',
        vencimento: p.data_vencimento,
        valor: Number(p.valor_total),
        origem: 'acordo' as const,
      };
    });
}

export function listarItensVencidos(base: BaseMetricas, hoje: string = hojeIso()): ItemVencido[] {
  return [
    ...itensVencidosDeTitulos(base.titulos, base.parcelas),
    ...itensVencidosDeAcordos(base.acordos, base.parcelasAcordo, hoje),
  ];
}

// ============== Próximos vencimentos ==============

/**
 * TUDO que ainda vai vencer, das duas origens. Antes saía de
 * `vw_titulos_completos.proximo_vencimento`, então uma parcela de acordo a
 * vencer nunca aparecia — o título renegociado tem saldo zerado e some da lista.
 */
export function listarAVencer(
  base: BaseMetricas,
  hoje: string = hojeIso(),
): ProximoVencimento[] {
  const porTitulo = new Map(base.titulos.map((t) => [t.id, t]));
  const porAcordo = new Map(base.acordos.map((a) => [a.id, a]));

  const deTitulos = base.parcelas
    .filter((p) => p.status === 'a_vencer')
    .map((p) => ({
      id: p.id,
      clienteId: porTitulo.get(p.titulo_id)?.cliente_id ?? null,
      clienteNome: porTitulo.get(p.titulo_id)?.cliente_nome || 'Desconhecido',
      valor: Number(p.saldo_atual),
      vencimento: p.vencimento,
      origem: 'titulo' as const,
    }));

  const deAcordos = base.parcelasAcordo
    .filter((p) => p.status !== 'paga' && p.data_vencimento >= hoje)
    .map((p) => ({
      id: p.id,
      clienteId: porAcordo.get(p.acordo_id)?.cliente_id ?? null,
      clienteNome: porAcordo.get(p.acordo_id)?.cliente_nome || 'Desconhecido',
      valor: Number(p.valor_total),
      vencimento: p.data_vencimento,
      origem: 'acordo' as const,
    }));

  return [...deTitulos, ...deAcordos]
    .map((item) => ({ ...item, diasRestantes: -diasDeAtraso(item.vencimento, hoje) }))
    .filter((item) => item.diasRestantes >= 0)
    .sort((a, b) => a.diasRestantes - b.diasRestantes);
}

/** Recorte de `listarAVencer` para a janela do Dashboard. */
export function listarProximosVencimentos(
  base: BaseMetricas,
  dias = 7,
  hoje: string = hojeIso(),
): ProximoVencimento[] {
  return listarAVencer(base, hoje).filter((item) => item.diasRestantes <= dias);
}

// ============== Situação financeira de UM cliente ==============

export interface SituacaoFinanceiraCliente {
  /** Dívida viva: vencido + a vencer, somando título e acordo. */
  emAberto: number;
  vencido: number;
  aVencer: number;
  /** Quantidade de parcelas em atraso (título + acordo). */
  parcelasVencidas: number;
  /** Maior atraso em dias entre as parcelas vencidas; 0 se não houver. */
  maiorAtraso: number;
}

/**
 * A dívida de um cliente pela MESMA regra do Dashboard.
 *
 * A ficha calculava isso em dois lugares independentes ("Dívida Total" no card e
 * "Total em Aberto" na lista de títulos), nenhum dos dois enxergando parcela de
 * acordo em atraso — um cliente com acordo quebrado aparecia devendo zero.
 * Passe uma base já restrita ao cliente (useBaseMetricasCliente).
 */
export function situacaoFinanceiraCliente(
  base: BaseMetricas,
  clienteId: string,
  hoje: string = hojeIso(),
): SituacaoFinanceiraCliente {
  const doCliente = <T extends { clienteId: string | null }>(itens: T[]) =>
    itens.filter((i) => i.clienteId === clienteId);

  const vencidos = doCliente(listarItensVencidos(base, hoje));
  const aVencerItens = doCliente(listarAVencer(base, hoje));

  const somar = (itens: Array<{ valor: number }>) =>
    itens.reduce((total, i) => total + i.valor, 0);

  const vencido = somar(vencidos);
  const aVencer = somar(aVencerItens);
  const maiorAtraso = vencidos.reduce(
    (maior, i) => Math.max(maior, diasDeAtraso(i.vencimento, hoje)),
    0,
  );

  return {
    emAberto: vencido + aVencer,
    vencido,
    aVencer,
    parcelasVencidas: vencidos.length,
    maiorAtraso,
  };
}

// ============== Aging ==============

const FAIXAS_AGING = [
  { label: '0-30 dias', min: 0, max: 30, color: 'hsl(38, 92%, 50%)' },
  { label: '31-60 dias', min: 31, max: 60, color: 'hsl(25, 95%, 53%)' },
  { label: '61-90 dias', min: 61, max: 90, color: 'hsl(0, 84%, 60%)' },
  { label: '+90 dias', min: 91, max: Number.POSITIVE_INFINITY, color: 'hsl(0, 72%, 51%)' },
];

const MS_POR_DIA = 1000 * 60 * 60 * 24;

/** Dias de atraso entre duas datas puras, sem passar por fuso. */
export function diasDeAtraso(vencimento: string, hoje: string): number {
  const [av, mv, dv] = vencimento.slice(0, 10).split('-').map(Number);
  const [ah, mh, dh] = hoje.split('-').map(Number);
  return Math.floor((Date.UTC(ah, mh - 1, dh) - Date.UTC(av, mv - 1, dv)) / MS_POR_DIA);
}

export function calcularAging(itens: ItemVencido[], hoje: string = hojeIso()): FaixaAging[] {
  return FAIXAS_AGING.map((faixa) => {
    const naFaixa = itens.filter((item) => {
      const atraso = diasDeAtraso(item.vencimento, hoje);
      return atraso >= faixa.min && atraso <= faixa.max;
    });
    return {
      label: faixa.label,
      range: `${faixa.min}-${Number.isFinite(faixa.max) ? faixa.max : '∞'}`,
      count: naFaixa.length,
      value: soma(naFaixa.map((i) => i.valor)),
      color: faixa.color,
    };
  });
}

// ============== Top devedores ==============

/** Sai dos MESMOS itens vencidos do aging, então os dois totais sempre fecham. */
export function calcularTopDevedores(itens: ItemVencido[], limite = 5): Devedor[] {
  const porCliente = new Map<string, Devedor>();
  itens.forEach((item) => {
    if (!item.clienteId) return;
    const atual = porCliente.get(item.clienteId) ?? {
      clienteId: item.clienteId,
      clienteNome: item.clienteNome,
      totalValor: 0,
      totalItens: 0,
    };
    atual.totalValor += item.valor;
    atual.totalItens += 1;
    porCliente.set(item.clienteId, atual);
  });

  return Array.from(porCliente.values())
    .sort((a, b) => b.totalValor - a.totalValor)
    .slice(0, limite);
}

// ============== Séries mensais ==============

function agruparPorMes(entradas: Array<{ data: string | null; valor: number }>): Map<string, number> {
  const porMes = new Map<string, number>();
  entradas.forEach(({ data, valor }) => {
    if (!data) return;
    const mes = mesDe(data);
    porMes.set(mes, (porMes.get(mes) ?? 0) + valor);
  });
  return porMes;
}

export function serieValorMensal(
  entradas: Array<{ data: string | null; valor: number }>,
  meses: string[],
): PontoMensal[] {
  const porMes = agruparPorMes(entradas);
  return meses.map((mes) => ({ mes, rotulo: rotuloMes(mes), valor: porMes.get(mes) ?? 0 }));
}

export function serieContagemMensal(datas: Array<string | null>, meses: string[]): ContagemMensal[] {
  const porMes = agruparPorMes(datas.map((data) => ({ data, valor: 1 })));
  return meses.map((mes) => ({ mes, rotulo: rotuloMes(mes), quantidade: porMes.get(mes) ?? 0 }));
}

export function serieRecuperacaoMensal(
  recebimentos: RecebimentoMetrica[],
  meses: string[],
): PontoMensal[] {
  return serieValorMensal(
    recebimentos.map((r) => ({ data: r.data_recebimento, valor: Number(r.valor) })),
    meses,
  );
}

/** Conta entidades DISTINTAS por mês (um título com 3 parcelas no mês conta 1). */
function contarDistintosPorMes(
  itens: Array<{ data: string; id: string }>,
  meses: string[],
): ContagemMensal[] {
  const porMes = new Map<string, Set<string>>();
  itens.forEach(({ data, id }) => {
    const mes = mesDe(data);
    const atual = porMes.get(mes) ?? new Set<string>();
    atual.add(id);
    porMes.set(mes, atual);
  });
  return meses.map((mes) => ({
    mes,
    rotulo: rotuloMes(mes),
    quantidade: porMes.get(mes)?.size ?? 0,
  }));
}

/** Títulos que têm parcela vencendo em cada mês. */
export function serieTitulosPorVencimento(base: BaseMetricas, meses: string[]): ContagemMensal[] {
  return contarDistintosPorMes(
    base.parcelas.map((p) => ({ data: p.vencimento, id: p.titulo_id })),
    meses,
  );
}

/** Acordos que têm parcela vencendo em cada mês. */
export function serieAcordosPorVencimento(base: BaseMetricas, meses: string[]): ContagemMensal[] {
  return contarDistintosPorMes(
    base.parcelasAcordo.map((p) => ({ data: p.data_vencimento, id: p.acordo_id })),
    meses,
  );
}

// ============== Distribuição e comparativos ==============

export const ROTULO_CLASSE: Record<ClasseTitulo, string> = {
  a_vencer: 'A Vencer',
  vencido: 'Vencido',
  pago: 'Pago',
  em_acordo: 'Em Acordo',
  acordo_cumprido: 'Acordo Cumprido',
  acordo_quebrado: 'Acordo Quebrado',
};

/**
 * Distribuição dos títulos pela classificação única. Substitui a contagem por
 * `titulo.status` crua, que juntava num só "Pago" a dívida realmente quitada e
 * a que só está zerada por causa da novação.
 */
export function distribuicaoPorClasse(titulos: TituloMetrica[]): Array<{ name: string; value: number }> {
  const porClasse = new Map<ClasseTitulo, number>();
  titulos.forEach((t) => {
    const classe = classificarTitulo(t);
    porClasse.set(classe, (porClasse.get(classe) ?? 0) + 1);
  });

  return Array.from(porClasse.entries())
    .map(([classe, value]) => ({ name: ROTULO_CLASSE[classe], value }))
    .sort((a, b) => b.value - a.value);
}

export interface Comparativos {
  titulos: number;
  valor: number;
  acordos: number;
  valorAcordos: number;
}

function variacao(atual: number, anterior: number): number {
  if (anterior === 0) return atual > 0 ? 100 : 0;
  return ((atual - anterior) / anterior) * 100;
}

/**
 * Mês corrente contra o anterior, sempre por VENCIMENTO e sobre o universo
 * inteiro — independe do período escolhido na tela, que tem outro recorte.
 */
export function calcularComparativos(base: BaseMetricas): Comparativos {
  const [mesAnterior, mesAtual] = ultimosMeses(2);
  const atual = recortarPorVencimento(base, periodoDoMes(mesAtual));
  const anterior = recortarPorVencimento(base, periodoDoMes(mesAnterior));

  const valorTitulos = (b: BaseMetricas) => soma(b.titulos.map((t) => Number(t.valor_original)));
  const valorAcordos = (b: BaseMetricas) => soma(b.acordos.map((a) => Number(a.valor_acordo)));

  return {
    titulos: variacao(atual.titulos.length, anterior.titulos.length),
    valor: variacao(valorTitulos(atual), valorTitulos(anterior)),
    acordos: variacao(atual.acordos.length, anterior.acordos.length),
    valorAcordos: variacao(valorAcordos(atual), valorAcordos(anterior)),
  };
}

/** Soma acordada dos acordos em escopo (cancelados já foram removidos). */
export function somarValorAcordado(acordos: AcordoMetrica[]): number {
  return soma(acordos.map((a) => Number(a.valor_acordo)));
}

// ============== Indicadores ==============

/** Tudo que ainda se deve num título: parcela não quitada, vencida ou não. */
function saldoTitulosEmAberto(parcelas: ParcelaMetrica[]): number {
  return soma(parcelas.filter((p) => p.status !== 'pago').map((p) => Number(p.saldo_atual)));
}

function saldoAcordosEmAberto(parcelasAcordo: ParcelaAcordoMetrica[]): number {
  return soma(parcelasAcordo.filter((p) => p.status !== 'paga').map((p) => Number(p.valor_total)));
}

function contarClasse(titulos: TituloMetrica[], classe: ClasseTitulo): number {
  return titulos.filter((t) => classificarTitulo(t) === classe).length;
}

const percentual = (parte: number, todo: number): number => (todo > 0 ? (parte / todo) * 100 : 0);

export function calcularIndicadores(
  base: BaseMetricas,
  hoje: string = hojeIso(),
): IndicadoresCarteira {
  const itensVencidos = listarItensVencidos(base, hoje);
  const valorVencido = soma(itensVencidos.map((i) => i.valor));

  // valorVencido é um SUBCONJUNTO do que está em aberto (parcela vencida também
  // é saldo devido), então o "a vencer" é a diferença — somar os dois duplicaria.
  const valorEmAberto =
    saldoTitulosEmAberto(base.parcelas) + saldoAcordosEmAberto(base.parcelasAcordo);
  const valorAVencer = Math.max(valorEmAberto - valorVencido, 0);

  const valorRecuperado = soma(base.recebimentos.map((r) => Number(r.valor)));
  const inicioMes = inicioDoMesAtual();
  const valorRecuperadoMes = soma(
    base.recebimentos
      .filter((r) => !!r.data_recebimento && r.data_recebimento.slice(0, 10) >= inicioMes)
      .map((r) => Number(r.valor)),
  );

  return {
    totalTitulos: base.titulos.length,
    valorTotal: soma(base.titulos.map((t) => Number(t.valor_original))),
    titulosVencidos: contarClasse(base.titulos, 'vencido') + contarClasse(base.titulos, 'acordo_quebrado'),
    titulosPagos: contarClasse(base.titulos, 'pago') + contarClasse(base.titulos, 'acordo_cumprido'),
    titulosEmAcordo: contarClasse(base.titulos, 'em_acordo'),
    valorVencido,
    valorAVencer,
    valorEmAberto,
    valorRecuperado,
    valorRecuperadoMes,
    taxaInadimplencia: percentual(valorVencido, valorEmAberto),
    taxaRecuperacao: percentual(valorRecuperado, valorRecuperado + valorEmAberto),
  };
}
