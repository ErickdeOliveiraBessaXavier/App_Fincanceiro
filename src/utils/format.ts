// Formatação de documentos e telefone (BR). Fonte única — os dados são
// armazenados apenas com dígitos (ver queries/clientes.ts). Use estas funções
// em vez de repetir `.replace(/\D/g, '')` ou máscaras pelo app.

/** Remove tudo que não é dígito. Base para máscaras, links tel:/wa.me e imports. */
export function soDigitos(value?: unknown): string {
  return String(value ?? '').replace(/\D/g, '');
}

/**
 * Formata CPF (000.000.000-00) ou CNPJ (00.000.000/0000-00). Se não tiver
 * 11/14 dígitos, devolve o valor original (não força máscara em dado inválido).
 */
export function formatCpfCnpj(value?: string | null): string {
  if (!value) return '';
  const d = soDigitos(value);
  if (d.length === 11) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  if (d.length === 14) return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
  return value;
}

/**
 * Formata data para pt-BR (dd/mm/aaaa).
 *
 * Strings de data pura ('2026-08-15', vindas de colunas `date` do Postgres) são
 * montadas direto dos componentes, sem passar por `Date`: `new Date('2026-08-15')`
 * é lido como meia-noite UTC e, em fusos negativos como o do Brasil, imprime o
 * DIA ANTERIOR. Timestamps completos continuam pelo caminho normal.
 */
/**
 * Converte para `Date` no fuso LOCAL. Use quando precisar de um formato que o
 * `formatData` não cobre (ex.: 'dd/mmm') — nunca `new Date(str)` direto, que
 * trata data pura como UTC.
 */
export function parseDataLocal(value: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return new Date(value);
}

export function formatData(value?: string | null): string {
  if (!value) return '';
  const dataPura = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (dataPura) {
    const [, ano, mes, dia] = dataPura;
    return `${dia}/${mes}/${ano}`;
  }
  return new Date(value).toLocaleDateString('pt-BR');
}

/**
 * Formata telefone BR: (00) 00000-0000 (celular) ou (00) 0000-0000 (fixo).
 * Fora de 10/11 dígitos, devolve o valor original.
 */
export function formatTelefone(phone?: string | null): string {
  if (!phone) return '';
  const d = soDigitos(phone);
  if (d.length === 11) return d.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3');
  if (d.length === 10) return d.replace(/(\d{2})(\d{4})(\d{4})/, '($1) $2-$3');
  return phone;
}
