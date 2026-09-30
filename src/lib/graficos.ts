import type { CSSProperties } from 'react';
import type { ClasseTitulo } from '@/domain/metricas';

/**
 * Aparência compartilhada dos gráficos (recharts).
 *
 * O recharts recebe cor e estilo por prop, fora do Tailwind, então cada tela
 * escrevia o próprio hex e o próprio tooltip — Dashboard e Relatórios já
 * tinham divergido no raio. As cores saem dos tokens do index.css: trocar a
 * cor de sucesso lá também troca a série de "Acordos" aqui.
 */

const token = (nome: string) => `hsl(var(--${nome}))`;

export const COR_GRAFICO = {
  primaria: token('primary'),
  sucesso: token('success'),
  alerta: token('warning'),
  perigo: token('destructive'),
  grade: token('border'),
  eixo: token('muted-foreground'),
  /** Contorno do ponto da linha: a cor do fundo do cartão, que o separa da linha. */
  contornoPonto: token('card'),
} as const;

/**
 * Cor de cada situação do título. Presa ao ESTADO, nunca à posição no ranking
 * — a pizza antiga pintava pela ordem de tamanho, e "Pago" podia sair vermelho.
 *
 * Pares da mesma família (vencido/quebrado, pago/cumprido) se separam pelo tom
 * escuro. "Em acordo" é o violeta da marca (dívida sendo tratada); "a vencer"
 * é azul-céu (informativo, sem urgência). Validada com o validate_palette do
 * guia de dataviz: passa CVD e o piso de visão normal; o verde fica abaixo de
 * 3:1 contra o fundo, por isso o rótulo e o número são sempre visíveis.
 */
export const COR_SITUACAO: Record<ClasseTitulo, string> = {
  vencido: COR_GRAFICO.perigo,
  acordo_quebrado: '#991b1b',
  em_acordo: COR_GRAFICO.primaria,
  a_vencer: '#0284c7',
  pago: COR_GRAFICO.sucesso,
  acordo_cumprido: '#15803d',
};

/** Tooltip com a cara de um cartão: mesmo fundo, raio e sombra do <Card>. */
export const TOOLTIP_GRAFICO: CSSProperties = {
  backgroundColor: token('card'),
  border: 'none',
  borderRadius: 'calc(var(--radius) + 4px)',
  boxShadow: 'var(--shadow-card-hover)',
};

/** Cursor de hover das barras. */
export const CURSOR_BARRA = { fill: 'hsl(var(--muted) / 0.4)' };

/** Ponto padrão das linhas de tendência, na cor da série. */
export const pontoDaLinha = (cor: string) => ({
  r: 6,
  fill: cor,
  stroke: COR_GRAFICO.contornoPonto,
  strokeWidth: 2,
});
