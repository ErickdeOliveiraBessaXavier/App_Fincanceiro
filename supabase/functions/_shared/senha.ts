// Tradução da recusa de senha do Supabase Auth, para as functions que criam
// conta. Espelha src/utils/senha.ts — não dá para importar o código do front
// aqui (runtime diferente), então a duplicação é intencional e pequena.
//
// Se as regras do painel mudarem, os dois arquivos mudam junto.

export const REGRAS_SENHA =
  'Use ao menos 8 caracteres, com letra maiúscula, minúscula, número e símbolo.';

export function traduzirErroSenha(mensagem: string): string {
  if (/weak|pwned|leaked|easy to guess/i.test(mensagem)) {
    return 'Esta senha é conhecida por aparecer em vazamentos. Escolha outra.';
  }
  if (/password/i.test(mensagem) && /at least|should contain|character/i.test(mensagem)) {
    return REGRAS_SENHA;
  }
  return mensagem;
}
