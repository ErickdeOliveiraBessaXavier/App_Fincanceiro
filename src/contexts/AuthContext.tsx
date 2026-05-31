import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import type { AppRole } from '@/hooks/useUserRole';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  /** Empresa (tenant) do usuário, lida do claim do JWT. null = ainda sem empresa. */
  companyId: string | null;
  /** Papel principal do usuário, lido do claim do JWT. */
  role: AppRole | null;
  isSuperAdmin: boolean;
  signUp: (email: string, password: string, nome: string) => Promise<{ error: any }>;
  signIn: (email: string, password: string) => Promise<{ error: any }>;
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
    role: (claims?.user_role as AppRole) ?? null,
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
      const ranks: Record<string, number> = { leitura: 1, operador: 2, financeiro: 3, admin: 4, super_admin: 5 };
      const roles = (rolesData ?? []).map((r: any) => r.role as AppRole);
      const highest = roles.length
        ? roles.reduce((a, b) => (ranks[a] >= ranks[b] ? a : b))
        : null;
      if (profile?.company_id) setCompanyId(profile.company_id);
      if (highest) setRole(highest);
    })();
    return () => { active = false; };
  }, [user?.id, companyId]);

  const signUp = async (email: string, password: string, nome: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { nome } },
    });

    if (error) {
      toast({ title: 'Erro no cadastro', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Cadastro realizado', description: 'Login automático em andamento...' });
      await signIn(email, password);
    }

    return { error };
  };

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      toast({ title: 'Erro no login', description: error.message, variant: 'destructive' });
    }
    return { error };
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
    signOut,
    refreshClaims,
    loading,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
