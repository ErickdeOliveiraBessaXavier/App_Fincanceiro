// Busca todas as linhas de uma consulta, lote a lote. Espelha
// src/lib/buscarTodas.ts — não dá para importar o código do front aqui
// (runtime diferente), então a duplicação é intencional e pequena.
//
// O PostgREST corta qualquer resposta em `max_rows` (hoje 1000) sem erro,
// inclusive com service role. LINHAS_POR_LOTE precisa ser <= max_rows.
// A consulta precisa terminar o `.order` numa coluna única.

export const LINHAS_POR_LOTE = 1000;

interface Resposta<T> {
  data: T[] | null;
  error: { message: string } | null;
}

export async function buscarTodas<T>(
  lote: (de: number, ate: number) => PromiseLike<Resposta<T>>,
): Promise<T[]> {
  const linhas: T[] = [];
  for (let de = 0; ; de += LINHAS_POR_LOTE) {
    const { data, error } = await lote(de, de + LINHAS_POR_LOTE - 1);
    if (error) throw new Error(error.message);
    const recebidas = data ?? [];
    linhas.push(...recebidas);
    if (recebidas.length < LINHAS_POR_LOTE) return linhas;
  }
}
