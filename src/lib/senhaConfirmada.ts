import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';
import { supabase, SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from '@/integrations/supabase/client';

/**
 * Ação sensível com a senha do usuário conferida no BANCO.
 *
 * Faz um login à parte, num cliente descartável (sem gravar sessão nem mexer na
 * sessão aberta do app), e executa a ação com esse token novo. A RPC confere o
 * claim `amr` do token: só aceita se houve login por senha há poucos minutos
 * (`_senha_confirmada_recentemente`). Pedir a senha só na tela não protegeria
 * nada — quem tem a sessão aberta chamaria a RPC direto.
 *
 * A senha vai direto ao Supabase Auth; não passa por código nosso no servidor.
 */
export async function executarComSenha<T>(
  senha: string,
  acao: (cliente: typeof supabase) => Promise<T>,
): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const email = data.session?.user.email;
  if (!email) throw new Error('Sessão expirada. Entre novamente.');

  const cliente = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
      storageKey: 'confirmacao-de-senha',
    },
  });

  const { error } = await cliente.auth.signInWithPassword({ email, password: senha });
  if (error) throw new Error(error.status === 400 ? 'Senha incorreta.' : error.message);

  try {
    return await acao(cliente);
  } finally {
    // Encerra só esta sessão descartável; a do app continua.
    await cliente.auth.signOut({ scope: 'local' });
  }
}
