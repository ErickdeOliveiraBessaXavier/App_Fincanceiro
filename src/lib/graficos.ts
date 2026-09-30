import type { CSSProperties } from 'react';

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
 * Séries categóricas (pizza por situação). A ordem acompanha a das classes da
 * distribuição; azul, violeta e cinza ainda não têm token próprio.
 */
export const CORES_SERIES = [
  COR_GRAFICO.alerta,
  COR_GRAFICO.sucesso,
  COR_GRAFICO.perigo,
  '#3b82f6',
  '#8b5cf6',
  '#64748b',
];

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
