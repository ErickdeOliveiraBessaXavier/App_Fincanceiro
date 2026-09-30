import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { papeisValidos, papelMaisAlto, type AppRole } from '@/domain/perfis';
import { traduzirErroSenha } from '@/utils/senha';
import { codigoErroAuth, traduzirErroAuth } from '@/utils/erroAuth';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  /** Empresa (tenant) do usuário, lida do claim do JWT. null = ainda sem empresa. */
  companyId: string | null;
  /** Papel principal do usuário, lido do claim do JWT. */
  role: AppRole | null;
  isSuperAdmin: boolean;
  signUp: (email: string, password: string, nome: string) => Promise<{ error: any; needsConfirmation: boolean }>;
  /** `naoConfirmado`: a conta existe, mas o e-mail ainda não foi confirmado. */
  signIn: (email: string, password: string) => Promise<{ error: any; naoConfirmado: boolean }>;
  /** Reenvia o link de confirmação do cadastro. Devolve true se enviou. */
  reenviarConfirmacao: (email: string) => Promise<boolean>;
  /** Manda o link de redefinição de senha. Devolve true se o pedido foi aceito. */
  enviarRedefinicaoSenha: (email: string) => Promise<boolean>;
  signOut: () => Promise<void>;
  /** Renova o token para recarregar os claims (ex.: após criar a empresa). */
  refreshClaims: () => Promise<void>;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

/** Decodifica o payload de um JWT (sem validar assinatura — só leitura de claims). */
function parseJwt(token: string | undefined): Record<string, any> | null {
  if (!token) return null;
  try {
    const payload = token.split('.')[1];
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(json);
  } catch {
    return null;
  }
}

interface TenantClaims {
  companyId: string | null;
  role: AppRole | null;
}

function readClaims(session: Session | null): TenantClaims {
  const claims = parseJwt(session?.access_token);
  return {
    companyId: (claims?.company_id as string) ?? null,
    // Token emitido antes de 20260803140000 pode trazer 'financeiro'/'leitura';
    // o filtro os descarta e o fallback abaixo relê o papel válido do banco.
    role: papeisValidos([claims?.user_role])[0] ?? null,
  };
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const applySession = (newSession: Session | null) => {
    setSession(newSession);
    setUser(newSession?.user ?? null);
    const { companyId, role } = readClaims(newSession);
    setCompanyId(companyId);
    setRole(role);
  };

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      applySession(session);
      setLoading(false);
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      applySession(session);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Fallback: se o claim do JWT não trouxe company_id/role (ex.: hook ainda não
  // habilitado, ou logo após criar a empresa), busca do banco. RLS isola o tenant.
  useEffect(() => {
    if (!user || companyId) return;
    let active = true;
    (async () => {
      const [{ data: profile }, { data: rolesData }] = await Promise.all([
        supabase.from('profiles').select('company_id').eq('user_id', user.id).maybeSingle(),
        supabase.from('user_roles').select('role').eq('user_id', user.id),
      ]);
      if (!active) return;
      const highest = papelMaisAlto(papeisValidos((rolesData ?? []).map((r) => r.role)));
      if (profile?.company_id) setCompanyId(profile.company_id);
      if (highest) setRole(highest);
    })();
    return () => { active = false; };
  }, [user?.id, companyId]);

  const signUp = async (email: string, password: string, nome: string) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { nome } },
    });

    if (error) {
      toast({ title: 'Erro no cadastro', description: traduzirErroSenha(error.message), variant: 'destructive' });
      return { error, needsConfirmation: false };
    }

    // Sem sessão na resposta => confirmação de e-mail está ativada.
    const needsConfirmation = !data.session;
    return { error: null, needsConfirmation };
  };

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      toast({ title: 'Erro no login', description: traduzirErroAuth(error), variant: 'destructive' });
    }
    return { error, naoConfirmado: codigoErroAuth(error) === 'email_not_confirmed' };
  };

  // Sem isto, quem não recebia (ou perdia) o e-mail de confirmação ficava sem
  // acesso e sem saída: não havia como pedir outro link.
  const reenviarConfirmacao = async (email: string) => {
    // Sem emailRedirectTo, como o signUp: o link leva à Site URL do projeto.
    const { error } = await supabase.auth.resend({ type: 'signup', email });
    if (error) {
      toast({ title: 'Não foi possível reenviar', description: traduzirErroAuth(error), variant: 'destructive' });
      return false;
    }
    toast({ title: 'E-mail reenviado', description: `Enviamos um novo link para ${email}. Confira também o spam.` });
    return true;
  };

  // O Supabase responde igual exista ou não a conta (não revela quem é
  // cadastrado); a mensagem de sucesso também não afirma que ela existe.
  const enviarRedefinicaoSenha = async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/redefinir-senha`,
    });
    if (error) {
      toast({ title: 'Não foi possível enviar', description: traduzirErroAuth(error), variant: 'destructive' });
      return false;
    }
    return true;
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      toast({ title: 'Erro ao sair', description: error.message, variant: 'destructive' });
      return;
    }
    // Limpa todo o cache para não vazar dados de um tenant para o próximo login.
    queryClient.clear();
  };

  const refreshClaims = async () => {
    const { data, error } = await supabase.auth.refreshSession();
    if (!error) applySession(data.session);
  };

  const value: AuthContextType = {
    user,
    session,
    companyId,
    role,
    isSuperAdmin: role === 'super_admin',
    signUp,
    signIn,
    reenviarConfirmacao,
    enviarRedefinicaoSenha,
    signOut,
    refreshClaims,
    loading,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
