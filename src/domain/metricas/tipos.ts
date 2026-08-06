/**
 * Formatos da base única de métricas (Dashboard + Relatórios).
 *
 * São subconjuntos das views/tabelas do banco, declarados aqui para que a regra
 * de negócio não dependa dos tipos gerados — e para deixar explícito qual campo
 * cada indicador realmente usa.
 */

/** Linha de `vw_titulos_completos` (já sem cancelados e sem cliente excluído). */
export interface TituloMetrica {
  id: string;
  cliente_id: string | null;
  cliente_nome: string | null;
  cliente_cpf_cnpj: string | null;
  valor_original: number;
  saldo_devedor: number;
  total_pago: number;
  /** Status financeiro derivado do saldo (a_vencer/vencido/pago/renegociado). */
  status: string;
  /** Estado do acordo não cancelado mais recente, ou null. */
  acordo_status: string | null;
  proximo_vencimento: string | null;
  vencimento_original: string | null;
  created_at: string | null;
}

/** Linha de `vw_parcelas_consolidadas`. */
export interface ParcelaMetrica {
  id: string;
  titulo_id: string;
  vencimento: string;
  valor_nominal: number;
  saldo_atual: number;
  status: string;
}

/**
 * Linha de `vw_recebimentos_tenant` — a ÚNICA fonte de "dinheiro que entrou".
 * Une as duas origens (baixa de parcela do título e parcela de acordo) e traz a
 * data real do recebimento, não o `updated_at` do título.
 */
export interface RecebimentoMetrica {
  recebimento_id: string;
  origem: string;
  titulo_id: string | null;
  acordo_id: string | null;
  valor: number;
  data_recebimento: string | null;
}

/** Linha de `acordos`. */
export interface AcordoMetrica {
  id: string;
  status: string;
  valor_acordo: number;
  valor_original: number;
  data_acordo: string | null;
  created_at: string | null;
  cliente_id: string | null;
  cliente_nome: string | null;
}

/** Linha de `parcelas_acordo` — o saldo vivo de um título renegociado. */
export interface ParcelaAcordoMetrica {
  id: string;
  acordo_id: string;
  valor_total: number;
  data_vencimento: string;
  status: string;
}

export interface BaseMetricas {
  titulos: TituloMetrica[];
  parcelas: ParcelaMetrica[];
  recebimentos: RecebimentoMetrica[];
  acordos: AcordoMetrica[];
  parcelasAcordo: ParcelaAcordoMetrica[];
}

/** Intervalo inclusivo em datas puras 'YYYY-MM-DD' (calendário local). */
export interface Periodo {
  de: string;
  ate: string;
}

/**
 * Classificação única de um título, combinando o status financeiro com o estado
 * do acordo. Existe porque a novação zera o saldo do título: sem olhar o acordo,
 * um acordo QUEBRADO (dívida real, não paga) apareceria como "pago".
 */
export type ClasseTitulo =
  | 'em_acordo'
  | 'acordo_quebrado'
  | 'acordo_cumprido'
  | 'pago'
  | 'vencido'
  | 'a_vencer';

/** Item vencido normalizado — vem tanto de parcela de título quanto de acordo. */
export interface ItemVencido {
  clienteId: string | null;
  clienteNome: string;
  vencimento: string;
  valor: number;
  origem: 'titulo' | 'acordo';
}

/** Item a vencer normalizado — parcela de título ou parcela de acordo. */
export interface ProximoVencimento {
  id: string;
  clienteNome: string;
  valor: number;
  vencimento: string;
  origem: 'titulo' | 'acordo';
  diasRestantes: number;
}

export interface FaixaAging {
  label: string;
  range: string;
  count: number;
  value: number;
  color: string;
}

export interface PontoMensal {
  mes: string;
  rotulo: string;
  valor: number;
}

export interface ContagemMensal {
  mes: string;
  rotulo: string;
  quantidade: number;
}

export interface Devedor {
  clienteId: string;
  clienteNome: string;
  totalValor: number;
  totalItens: number;
}

export interface IndicadoresCarteira {
  totalTitulos: number;
  valorTotal: number;
  titulosVencidos: number;
  titulosPagos: number;
  titulosEmAcordo: number;
  /** Vencido de verdade: parcelas de título + parcelas de acordo em atraso. */
  valorVencido: number;
  valorAVencer: number;
  /** valorVencido + valorAVencer (títulos e acordos). Denominador da inadimplência. */
  valorEmAberto: number;
  valorRecuperado: number;
  valorRecuperadoMes: number;
  /** % do valor em aberto que está vencido. */
  taxaInadimplencia: number;
  /** % recuperado sobre tudo que passou pela cobrança (recuperado + em aberto). */
  taxaRecuperacao: number;
}
