/**
 * Regras de senha em um lugar só.
 *
 * ATENÇÃO: precisam espelhar o painel do Supabase em
 * Authentication > Sign In / Providers ("Minimum password length" e
 * "Password requirements"). Quem recusa de verdade é o servidor; aqui a
 * validação existe para o usuário saber ANTES de enviar, e para a mensagem
 * sair em português — sem isso o Supabase devolve o texto cru em inglês.
 *
 * Se mudar o painel, mude aqui junto.
 */

export const SENHA_MIN = 8;

export const REGRAS_SENHA =
  'Use ao menos 8 caracteres, com letra maiúscula, minúscula, número e símbolo.';

const CLASSES: Array<{ teste: RegExp; nome: string }> = [
  { teste: /[a-z]/, nome: 'uma letra minúscula' },
  { teste: /[A-Z]/, nome: 'uma letra maiúscula' },
  { teste: /[0-9]/, nome: 'um número' },
  { teste: /[^a-zA-Z0-9]/, nome: 'um símbolo (! @ # $ ...)' },
];

/** "a, b e c" — para a mensagem dizer exatamente o que falta. */
function listar(itens: string[]): string {
  if (itens.length === 1) return itens[0];
  return `${itens.slice(0, -1).join(', ')} e ${itens[itens.length - 1]}`;
}

/** Mensagem do que impede esta senha, ou `null` quando ela serve. */
export function validarSenha(senha: string): string | null {
  if (senha.length < SENHA_MIN) {
    return `A senha precisa ter ao menos ${SENHA_MIN} caracteres.`;
  }
  const faltando = CLASSES.filter((c) => !c.teste.test(senha)).map((c) => c.nome);
  if (faltando.length === 0) return null;
  return `Falta ${listar(faltando)} na senha.`;
}

/**
 * Traduz a recusa do Supabase.
 *
 * Rede de segurança: se o painel ficar mais exigente que as regras acima, o
 * usuário ainda recebe um texto que dá para entender em vez do inglês cru.
 */
export function traduzirErroSenha(mensagem: string): string {
  if (/weak|pwned|leaked|easy to guess/i.test(mensagem)) {
    return 'Esta senha é conhecida por aparecer em vazamentos. Escolha outra.';
  }
  if (/password/i.test(mensagem) && /at least|should contain|character/i.test(mensagem)) {
    return REGRAS_SENHA;
  }
  return mensagem;
}
