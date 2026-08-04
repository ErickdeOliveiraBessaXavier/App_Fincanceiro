// Modelo de papéis do sistema — fonte única no front.
//
// Quatro papéis em DOIS eixos (ver 20260803140000_simplificar_perfis.sql):
//   plataforma: super_admin — administra tenants; o Layout o redireciona para
//               /plataforma, ele não opera dentro de nenhuma empresa.
//   empresa:    admin > operador ("cobrador") > vendedor (carteira read-only)
//
// 'financeiro' e 'leitura' saíram de circulação: nenhum gate os cita e o CHECK
// user_roles_papel_valido impede atribuí-los. O ENUM app_role ainda os contém
// porque o Postgres não remove valor de enum.

export type AppRole = 'vendedor' | 'operador' | 'admin' | 'super_admin';

// Espelha public.role_rank no banco. Só a ordem relativa importa — 'vendedor'
// fica abaixo de 'operador' para que qualquer gate >= 'operador' o exclua.
export const RANK: Record<AppRole, number> = {
  vendedor: 1,
  operador: 2,
  admin: 3,
  super_admin: 4,
};

/**
 * Filtra papéis desconhecidos. Cobre cache antigo no localStorage (com
 * 'financeiro'/'leitura') e valores de um deploy à frente: sem isto um papel sem
 * entrada em RANK contaminaria as comparações com `undefined`.
 */
export function papeisValidos(roles: unknown): AppRole[] {
  if (!Array.isArray(roles)) return [];
  return roles.filter((r): r is AppRole => typeof r === 'string' && r in RANK);
}

/** Papel de maior rank, ou null se a lista estiver vazia. */
export function papelMaisAlto(roles: AppRole[]): AppRole | null {
  if (!roles.length) return null;
  return roles.reduce((a, b) => (RANK[a] >= RANK[b] ? a : b));
}
