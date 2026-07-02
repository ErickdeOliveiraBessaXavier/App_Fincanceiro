// Formatação de documentos e telefone (BR). Fonte única para exibição —
// os dados são armazenados apenas com dígitos (ver queries/clientes.ts).

/**
 * Formata CPF (000.000.000-00) ou CNPJ (00.000.000/0000-00). Se não tiver
 * 11/14 dígitos, devolve o valor original (não força máscara em dado inválido).
 */
export function formatCpfCnpj(value?: string | null): string {
  if (!value) return '';
  const d = value.replace(/\D/g, '');
  if (d.length === 11) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  if (d.length === 14) return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
  return value;
}

/**
 * Formata telefone BR: (00) 00000-0000 (celular) ou (00) 0000-0000 (fixo).
 * Fora de 10/11 dígitos, devolve o valor original.
 */
export function formatTelefone(phone?: string | null): string {
  if (!phone) return '';
  const d = phone.replace(/\D/g, '');
  if (d.length === 11) return d.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3');
  if (d.length === 10) return d.replace(/(\d{2})(\d{4})(\d{4})/, '($1) $2-$3');
  return phone;
}
