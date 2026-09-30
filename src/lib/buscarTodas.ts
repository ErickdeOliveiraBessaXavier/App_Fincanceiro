import type { PostgrestError } from '@supabase/supabase-js';

/**
 * Tamanho do lote. Precisa ser MENOR OU IGUAL ao `max_rows` do PostgREST do
 * projeto (painel › Settings › API; hoje 1000). Se o painel baixar o limite,
 * baixe aqui também: um lote cortado pelo servidor parece o último lote.
 */
export const LINHAS_POR_LOTE = 1000;

interface Resposta<T> {
  data: T[] | null;
  error: PostgrestError | null;
}

/**
 * Busca TODAS as linhas de uma consulta, lote a lote.
 *
 * O PostgREST corta qualquer resposta em `max_rows` sem erro e sem aviso: uma
 * listagem com 1.200 títulos mostrava 1.000 e os totais do Dashboard saíam
 * errados. Toda listagem sem limite natural (lista da empresa inteira, e não
 * "as parcelas de um título") passa por aqui.
 *
 * `lote(de, ate)` monta a consulta e aplica `.range(de, ate)`. Ela precisa de
 * ordem total — o último `.order` em coluna única (normalmente `id`) —, senão
 * uma linha pode repetir ou sumir entre um lote e outro.
 *
 * @example
 * buscarTodas((de, ate) =>
 *   supabase.from('acordos').select('*').order('created_at').order('id').range(de, ate));
 */
export async function buscarTodas<T>(
  lote: (de: number, ate: number) => PromiseLike<Resposta<T>>,
): Promise<T[]> {
  const linhas: T[] = [];
  for (let de = 0; ; de += LINHAS_POR_LOTE) {
    const { data, error } = await lote(de, de + LINHAS_POR_LOTE - 1);
    if (error) throw error;
    const recebidas = data ?? [];
    linhas.push(...recebidas);
    if (recebidas.length < LINHAS_POR_LOTE) return linhas;
  }
}
