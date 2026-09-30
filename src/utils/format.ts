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
  const d = normalizarDocumento(value);
  if (d.length === 11) return aplicarMascara(d, MASCARA_CPF);
  if (d.length === 14) return aplicarMascara(d, MASCARA_CNPJ);
  return value;
}

/**
 * CPF/CNPJ só com os caracteres que contam: dígitos e, no CNPJ alfanumérico,
 * letras maiúsculas. É assim que o documento é gravado.
 *
 * Desde julho de 2026 a Receita emite CNPJ com letras nas 12 primeiras
 * posições (IN RFB 2.229/2024). `soDigitos` apagaria as letras e corromperia
 * o documento — por isso documento não passa por ele.
 */
export function normalizarDocumento(value?: unknown): string {
  return String(value ?? '').toUpperCase().replace(/[^0-9A-Z]/g, '');
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

/**
 * `Date` -> 'YYYY-MM-DD' pelos componentes LOCAIS (formato do `<input type="date">`).
 *
 * Inverso de `parseDataLocal`. Use no lugar de `toISOString().split('T')[0]`:
 * o ISO converte para UTC, então à noite no Brasil (UTC-3) ele devolve o dia
 * SEGUINTE — era assim que a data sugerida saía como "amanhã".
 */
export function isoDeData(data: Date): string {
  const mes = String(data.getMonth() + 1).padStart(2, '0');
  const dia = String(data.getDate()).padStart(2, '0');
  return `${data.getFullYear()}-${mes}-${dia}`;
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
 * Valor monetário para digitação: "15.600,20" (sem o símbolo, que ocuparia
 * espaço dentro do campo). Para exibir texto pronto use `Intl` com
 * `style: 'currency'` como no resto do app.
 */
export function formatMoeda(valor: number): string {
  return new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(valor || 0);
}

/**
 * Texto digitado -> número em reais. Só os dígitos importam e os dois últimos
 * são os centavos ("1560020" -> 15600.20), então o usuário nunca precisa
 * digitar ponto ou vírgula e não sobra zero à esquerda. O corte em 15 dígitos
 * mantém o resultado dentro do inteiro seguro do JS.
 */
export function parseMoeda(texto: string): number {
  const digitos = soDigitos(texto).slice(0, 15);
  return digitos ? Number(digitos) / 100 : 0;
}

// Quando os dois separadores aparecem, o último é o decimal: "1.234,56" e
// "1,234.56" viram 1234.56.
function comDoisSeparadores(s: string): string {
  const decimalEhVirgula = s.lastIndexOf(',') > s.lastIndexOf('.');
  return decimalEhVirgula ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
}

// Só vírgula: uma é decimal ("1500,50"); várias são milhar ("1,234,567").
function soVirgula(s: string): string {
  return (s.match(/,/g) ?? []).length > 1 ? s.replace(/,/g, '') : s.replace(',', '.');
}

// Só ponto: vários são milhar ("1.234.567"); um só com exatamente 3 dígitos
// depois é milhar no padrão brasileiro ("1.500"); fora isso é decimal ("12.5").
function soPonto(s: string): string {
  if ((s.match(/\./g) ?? []).length > 1) return s.replace(/\./g, '');
  return /\.\d{3}$/.test(s) ? s.replace('.', '') : s;
}

function normalizarSeparadores(s: string): string {
  const temVirgula = s.includes(',');
  const temPonto = s.includes('.');
  if (temVirgula && temPonto) return comDoisSeparadores(s);
  if (temVirgula) return soVirgula(s);
  if (temPonto) return soPonto(s);
  return s;
}

/**
 * Valor monetário lido de planilha ou CSV -> número, ou `null` se ilegível.
 *
 * Célula numérica do Excel já chega como número. Texto chega como o usuário
 * escreveu, e no Brasil o ponto é milhar: o parser antigo lia "1.500" como
 * 1,5 e a dívida entrava mil vezes menor, sem aviso nenhum.
 */
export function parseValorPlanilha(valor: unknown): number | null {
  if (valor === null || valor === undefined || valor === '') return null;
  if (typeof valor === 'number') return Number.isFinite(valor) ? valor : null;

  const limpo = String(valor).trim().replace(/[^\d.,-]/g, '');
  if (!/\d/.test(limpo)) return null;
  const numero = Number(normalizarSeparadores(limpo));
  return Number.isFinite(numero) ? numero : null;
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

/**
 * Aplica um padrão de máscara a uma sequência de dígitos.
 *
 * '#' marca a posição de um dígito; o resto é separador. Para de escrever
 * quando os dígitos acabam, então o separador só aparece depois que existe
 * dígito para ele — digitar "000" mostra "000", não "000.".
 */
function aplicarMascara(digitos: string, padrao: string): string {
  let saida = '';
  let i = 0;
  for (const caractere of padrao) {
    if (i >= digitos.length) break;
    if (caractere === '#') {
      saida += digitos[i];
      i += 1;
    } else {
      saida += caractere;
    }
  }
  return saida;
}

const MASCARA_CPF = '###.###.###-##';
const MASCARA_CNPJ = '##.###.###/####-##';
const MASCARA_FIXO = '(##) ####-####';
const MASCARA_CELULAR = '(##) #####-####';

/**
 * Máscara de CPF/CNPJ para digitação.
 *
 * Até 11 dígitos assume CPF; do 12º em diante vira CNPJ e a formatação se
 * reorganiza sozinha. Corta em 14 — digitar além disso não faz nada em vez de
 * gerar um documento inválido.
 */
export function mascaraCpfCnpj(valor: string): string {
  const doc = normalizarDocumento(valor).slice(0, 14);
  // Letra só existe no CNPJ alfanumérico: já formata como CNPJ.
  const ehCnpj = doc.length > 11 || /[A-Z]/.test(doc);
  return aplicarMascara(doc, ehCnpj ? MASCARA_CNPJ : MASCARA_CPF);
}

const PESOS_CPF = [11, 10, 9, 8, 7, 6, 5, 4, 3, 2];
const PESOS_CNPJ = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

/**
 * Dígito verificador (módulo 11) dos `n` primeiros caracteres, com os últimos
 * `n` pesos. Cada caractere vale o código ASCII menos 48: '0'..'9' valem 0..9
 * e 'A'..'Z' valem 17..42 — a regra do CNPJ alfanumérico, que para documento
 * só de dígitos dá exatamente o cálculo de sempre.
 */
function digitoVerificador(doc: string, n: number, pesos: number[]): number {
  const usados = pesos.slice(pesos.length - n);
  const soma = usados.reduce((total, peso, i) => total + (doc.charCodeAt(i) - 48) * peso, 0);
  const resto = soma % 11;
  return resto < 2 ? 0 : 11 - resto;
}

/** 'cpf', 'cnpj' ou null pelo formato: CPF só dígitos; CNPJ com 12 alfanuméricos + 2 dígitos. */
function tipoDocumento(doc: string): 'cpf' | 'cnpj' | null {
  if (/^\d{11}$/.test(doc)) return 'cpf';
  if (/^[0-9A-Z]{12}\d{2}$/.test(doc)) return 'cnpj';
  return null;
}

function dvConfere(digitos: string, pesos: number[]): boolean {
  const base = digitos.length - 2;
  return digitoVerificador(digitos, base, pesos) === Number(digitos[base])
    && digitoVerificador(digitos, base + 1, pesos) === Number(digitos[base + 1]);
}

/**
 * Motivo de o CPF/CNPJ ser inválido, ou null se estiver certo (aceita com ou
 * sem máscara, e o CNPJ alfanumérico). Confere formato e dígitos
 * verificadores, e recusa sequência repetida ("111.111.111-11"), que passa no
 * cálculo mas não existe.
 *
 * Vale em toda porta de entrada (cadastro, planilha, API) — decisão do gestor
 * de 2026-09-30. O banco confere a mesma regra (public.cpf_cnpj_valido).
 */
export function erroCpfCnpj(valor: string): string | null {
  const doc = normalizarDocumento(valor);
  if (!doc) return 'CPF/CNPJ é obrigatório';
  const tipo = tipoDocumento(doc);
  if (!tipo) return 'CPF tem 11 dígitos; CNPJ, 14 caracteres';
  if (/^(.)\1+$/.test(doc)) return 'CPF/CNPJ inválido';
  return dvConfere(doc, tipo === 'cpf' ? PESOS_CPF : PESOS_CNPJ) ? null : 'CPF/CNPJ inválido: confira os dígitos';
}

/**
 * Máscara de telefone para digitação.
 *
 * Até 10 dígitos formata como fixo; o 11º dígito é o 9 do celular e a máscara
 * se ajusta. Corta em 11.
 */
export function mascaraTelefone(valor: string): string {
  const digitos = soDigitos(valor).slice(0, 11);
  return aplicarMascara(digitos, digitos.length <= 10 ? MASCARA_FIXO : MASCARA_CELULAR);
}
