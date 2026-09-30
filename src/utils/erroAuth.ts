/**
 * Erros do Supabase Auth em português, pelo `code` do erro (estável), com a
 * mensagem em inglês como reserva. Sem isto o login mostrava o texto cru
 * ("Email not confirmed"), e quem não tinha confirmado o e-mail não sabia o
 * que fazer.
 */

const MENSAGENS: Record<string, string> = {
  invalid_credentials: 'E-mail ou senha incorretos.',
  email_not_confirmed: 'Seu e-mail ainda não foi confirmado. Abra o link que enviamos ou peça um novo.',
  over_email_send_rate_limit: 'Muitos e-mails enviados em pouco tempo. Aguarde alguns minutos e tente de novo.',
  over_request_rate_limit: 'Muitas tentativas seguidas. Aguarde alguns minutos e tente de novo.',
  user_banned: 'Este acesso está bloqueado. Fale com o administrador da empresa.',
};

interface ErroAuth {
  code?: string;
  message?: string;
}

export function codigoErroAuth(erro: ErroAuth | null | undefined): string | undefined {
  if (!erro) return undefined;
  if (erro.code) return erro.code;
  // Versões antigas do servidor não mandam `code`.
  if (/email not confirmed/i.test(erro.message ?? '')) return 'email_not_confirmed';
  if (/invalid login credentials/i.test(erro.message ?? '')) return 'invalid_credentials';
  return undefined;
}

export function traduzirErroAuth(erro: ErroAuth | null | undefined): string {
  const codigo = codigoErroAuth(erro);
  return (codigo && MENSAGENS[codigo]) || erro?.message || 'Não foi possível concluir. Tente de novo.';
}
