// Identificação do acordo para o operador.
//
// O acordo não tem número sequencial: a chave é um UUID, que não cabe na tabela
// e ninguém dita ao telefone. Os 6 últimos caracteres são estáveis, distinguem
// os acordos de uma empresa na prática e cabem em qualquer tela. O id completo
// continua visível nos detalhes, para suporte e conferência no banco.

/** Código curto do acordo, no formato `#A1B2C3`. */
export function codigoAcordo(id?: string | null): string {
  if (!id) return '—';
  return `#${id.slice(-6).toUpperCase()}`;
}
