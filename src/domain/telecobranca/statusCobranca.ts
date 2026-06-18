/**
 * Camada de negócio única da Telecobrança — Status de Cobrança.
 *
 * Centraliza TODAS as regras dos status e o cálculo do próximo contato.
 * A UI apenas consome estas funções/configs; não reimplementa regras.
 *
 * Decisões (ver memória do projeto):
 * - Persistimos apenas o slug (sem os códigos numéricos do ERP de origem).
 * - "Próximo dia útil" na fase 1 considera apenas finais de semana
 *   (sábado/domingo). Feriados ficam para uma tabela própria no Supabase
 *   numa fase posterior — ver ajustarProximoDiaUtil().
 * - O próximo contato É o agendamento (data_agendamento); não há data
 *   redundante. Aqui calculamos a data sugerida (editável na UI).
 *
 * Mantido data-driven (lookup em STATUS_COBRANCA) para respeitar a regra de
 * complexidade ciclomática do projeto (complexity <= 10): nada de switch/if-else
 * encadeado por status.
 */

export type StatusCobrancaSlug =
  | 'suspeita_fraude'
  | 'agendamento_pagamento'
  | 'sem_previsao_pagamento'
  | 'recado'
  | 'nao_atende'
  | 'sem_contato_incorreto'
  | 'devolucao';

/** Base do cálculo do próximo contato. */
export type BaseCalculo = 'hoje' | 'data_prevista';

export interface StatusCobrancaConfig {
  slug: StatusCobrancaSlug;
  label: string;
  /** Dias corridos somados à data base para sugerir o próximo contato. */
  diasProximoContato: number;
  /** 'hoje' soma à data do contato; 'data_prevista' usa a data informada pelo operador. */
  baseCalculo: BaseCalculo;
  /** Teto, em dias corridos a partir de hoje, para o próximo contato (null = sem teto). */
  tetoDias: number | null;
  /** Exige a data prevista de pagamento no formulário. */
  exigeDataPrevista: boolean;
  /** Prioridade visual/operacional do status. */
  prioridade: 'normal' | 'alta';
  /** Orientação contextual exibida ao operador ao selecionar o status. */
  orientacao: string;
}

/**
 * Fonte única de verdade das regras por status. A ordem define a ordem de
 * exibição no seletor da UI.
 */
export const STATUS_COBRANCA: Record<StatusCobrancaSlug, StatusCobrancaConfig> = {
  suspeita_fraude: {
    slug: 'suspeita_fraude',
    label: 'Suspeita de Fraude',
    diasProximoContato: 7,
    baseCalculo: 'hoje',
    tetoDias: null,
    exigeDataPrevista: false,
    prioridade: 'alta',
    orientacao:
      'Cliente não reconhece o débito mesmo após cobrança e envio dos comprovantes de entrega. ' +
      'Encaminhe imediatamente para Gestão de Crédito, Cobrança e Diretoria.',
  },
  agendamento_pagamento: {
    slug: 'agendamento_pagamento',
    label: 'Agendamento de Pagamento',
    diasProximoContato: 1,
    baseCalculo: 'data_prevista',
    tetoDias: 7,
    exigeDataPrevista: true,
    prioridade: 'normal',
    orientacao:
      'Há contato efetivo e previsão de pagamento/acordo. Informe a data prevista de pagamento; ' +
      'o próximo contato será 1 dia após a data informada (limite de 7 dias).',
  },
  sem_previsao_pagamento: {
    slug: 'sem_previsao_pagamento',
    label: 'Sem Previsão de Pagamento',
    diasProximoContato: 7,
    baseCalculo: 'hoje',
    tetoDias: null,
    exigeDataPrevista: false,
    prioridade: 'normal',
    orientacao: 'Há contato efetivo, porém sem previsão de pagamento.',
  },
  recado: {
    slug: 'recado',
    label: 'Recado',
    diasProximoContato: 2,
    baseCalculo: 'hoje',
    tetoDias: null,
    exigeDataPrevista: false,
    prioridade: 'normal',
    orientacao: 'Contato não efetivo com o cliente; recado deixado com terceiros.',
  },
  nao_atende: {
    slug: 'nao_atende',
    label: 'Não Atende',
    diasProximoContato: 2,
    baseCalculo: 'hoje',
    tetoDias: null,
    exigeDataPrevista: false,
    prioridade: 'normal',
    orientacao:
      'Contato não efetivo (ocupado, desligado, caixa postal ou não atende). ' +
      'A partir da 3ª tentativa será exigida pesquisa de contato.',
  },
  sem_contato_incorreto: {
    slug: 'sem_contato_incorreto',
    label: 'Sem Contato ou Incorreto',
    diasProximoContato: 7,
    baseCalculo: 'hoje',
    tetoDias: null,
    exigeDataPrevista: false,
    prioridade: 'normal',
    orientacao:
      'Contato inexistente/incorreto, cliente desconhecido, mudança de endereço ou pesquisas concluídas. ' +
      'O coordenador de Crédito e Cobrança deve comunicar o supervisor de vendas para solicitar visita ao local.',
  },
  devolucao: {
    slug: 'devolucao',
    label: 'Devolução',
    diasProximoContato: 7,
    baseCalculo: 'hoje',
    tetoDias: null,
    exigeDataPrevista: false,
    prioridade: 'normal',
    orientacao:
      'Cliente informou devolução total da mercadoria, confirmada pela equipe interna. ' +
      'Inicie o tratamento da devolução.',
  },
};

/** Lista ordenada dos status para popular seletores na UI. */
export const STATUS_COBRANCA_LIST: StatusCobrancaConfig[] = Object.values(STATUS_COBRANCA);

/** Retorna a config de um status; lança erro para slug desconhecido. */
export function getStatusCobranca(slug: StatusCobrancaSlug): StatusCobrancaConfig {
  const cfg = STATUS_COBRANCA[slug];
  if (!cfg) throw new Error(`Status de cobrança desconhecido: ${slug}`);
  return cfg;
}

/**
 * Fuso de referência do negócio. O app pode rodar em servidor UTC (Vercel),
 * então todo o cálculo de "hoje", dias corridos e fim de semana é ancorado
 * em São Paulo para não escorregar um dia. O Brasil não tem horário de verão
 * desde 2019, então São Paulo é fixo em UTC-3 — usado ao montar o timestamp.
 */
export const TZ_NEGOCIO = 'America/Sao_Paulo';
const OFFSET_SP = '-03:00';

/**
 * "Hoje" no fuso do negócio, como Date ancorado ao meio-dia local. Trabalhar
 * ao meio-dia (e não à meia-noite) evita que conversões de fuso joguem a data
 * para o dia anterior/seguinte. As funções abaixo tratam o Date como data
 * civil (dia/mês/ano), ignorando a hora.
 */
export function hojeNegocio(): Date {
  // en-CA formata como YYYY-MM-DD, fácil de desmembrar.
  const [ano, mes, dia] = new Intl.DateTimeFormat('en-CA', { timeZone: TZ_NEGOCIO })
    .format(new Date())
    .split('-')
    .map(Number);
  return new Date(ano, mes - 1, dia, 12, 0, 0, 0);
}

/** Soma dias corridos a uma data, sem mutar o original. */
export function addDiasCorridos(data: Date, dias: number): Date {
  const r = new Date(data);
  r.setDate(r.getDate() + dias);
  return r;
}

/** Sábado (6) ou domingo (0). */
export function isFimDeSemana(data: Date): boolean {
  const dow = data.getDay();
  return dow === 0 || dow === 6;
}

/**
 * Ajusta para o próximo dia útil. Fase 1: pula apenas finais de semana.
 * Feriados serão tratados depois via tabela própria (Supabase), bastando
 * estender a condição de parada deste laço.
 */
export function ajustarProximoDiaUtil(data: Date): Date {
  const r = new Date(data);
  while (isFimDeSemana(r)) {
    r.setDate(r.getDate() + 1);
  }
  return r;
}

/**
 * Converte uma data civil para o instante a ser gravado em `data_agendamento`
 * (timestamptz), no horário informado, fuso do negócio. Ex.: 2026-06-19 09:00
 * vira "2026-06-19T09:00:00-03:00".
 */
export function paraTimestampNegocio(data: Date, hora = '09:00'): string {
  const ano = data.getFullYear();
  const mes = String(data.getMonth() + 1).padStart(2, '0');
  const dia = String(data.getDate()).padStart(2, '0');
  return `${ano}-${mes}-${dia}T${hora}:00${OFFSET_SP}`;
}

export interface CalculoContexto {
  /** Data do contato atual (default: agora). */
  referencia?: Date;
  /** Data prevista de pagamento (obrigatória para agendamento_pagamento). */
  dataPrevista?: Date;
}

/** Limita `proximo` a no máximo `tetoDias` corridos após a referência. */
function aplicarTeto(proximo: Date, referencia: Date, tetoDias: number | null): Date {
  if (tetoDias === null) return proximo;
  const limite = addDiasCorridos(referencia, tetoDias);
  return proximo > limite ? limite : proximo;
}

/**
 * Calcula a data sugerida do próximo contato conforme as regras do status.
 * A UI usa este valor como sugestão editável.
 *
 * Precedência teto × dia útil: aplicamos o teto primeiro e o ajuste de dia
 * útil por último. Logo, se o teto cair num fim de semana, o resultado pode
 * ultrapassar o teto em 1–2 dias — é intencional: não há como contatar no fim
 * de semana, então o dia útil prevalece sobre o limite de dias.
 */
export function calcularProximoContato(slug: StatusCobrancaSlug, ctx: CalculoContexto = {}): Date {
  const cfg = getStatusCobranca(slug);
  const referencia = ctx.referencia ?? hojeNegocio();
  const base = cfg.baseCalculo === 'data_prevista' ? ctx.dataPrevista ?? referencia : referencia;
  const proximo = addDiasCorridos(base, cfg.diasProximoContato);
  return ajustarProximoDiaUtil(aplicarTeto(proximo, referencia, cfg.tetoDias));
}

/**
 * Valida os campos obrigatórios conforme o status escolhido.
 * Retorna a mensagem de erro, ou null quando válido.
 */
export function validarStatusCobranca(slug: StatusCobrancaSlug, ctx: CalculoContexto = {}): string | null {
  const cfg = getStatusCobranca(slug);
  if (cfg.exigeDataPrevista && !ctx.dataPrevista) {
    return 'Informe a data prevista de pagamento.';
  }
  return null;
}
