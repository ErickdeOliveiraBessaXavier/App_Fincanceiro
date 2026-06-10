import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { cobradoresKeys } from './cobradores';

// A tabela `convites` foi adicionada por migration; o types.ts gerado ainda não
// a conhece, então acessamos via cliente sem tipagem forte para esta tabela.
const db = supabase as any;

export interface ConvitePendente {
  id: string;
  company_id: string;
  cobrador_id: string | null;
  cobrador_nome: string | null;
  used_by: string | null;
  created_at: string;
  /** Nome/e-mail informados pelo cobrador no cadastro. */
  nome: string | null;
  email: string | null;
}

export const convitesKeys = {
  all: ['convites'] as const,
  pendentes: () => [...convitesKeys.all, 'pendentes'] as const,
};

/** Gera um convite para um cobrador e devolve o token (para montar o link). */
export function useGerarConvite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { cobradorId: string; nomeSugerido?: string }): Promise<string> => {
      const token = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '');
      const { error } = await db.from('convites').insert({
        cobrador_id: input.cobradorId,
        nome_sugerido: input.nomeSugerido ?? null,
        token,
      });
      if (error) throw error;
      return token;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: convitesKeys.all });
      qc.invalidateQueries({ queryKey: cobradoresKeys.all });
    },
  });
}

/** Lista cadastros que aguardam autorização do admin. */
export function usePendingConvites() {
  return useQuery({
    queryKey: convitesKeys.pendentes(),
    queryFn: async (): Promise<ConvitePendente[]> => {
      const { data, error } = await db
        .from('convites')
        .select('id, company_id, cobrador_id, used_by, created_at, cobradores(nome)')
        .eq('status', 'aguardando')
        .order('created_at', { ascending: false });
      if (error) throw error;
      const rows = (data ?? []) as any[];

      // Busca nome/e-mail dos perfis que se cadastraram (FK é para auth.users, não dá join direto).
      const userIds = rows.map((r) => r.used_by).filter(Boolean);
      let profilesById: Record<string, { nome: string; email: string }> = {};
      if (userIds.length) {
        const { data: profs } = await db
          .from('profiles')
          .select('user_id, nome, email')
          .in('user_id', userIds);
        profilesById = Object.fromEntries((profs ?? []).map((p: any) => [p.user_id, p]));
      }

      return rows.map((r) => ({
        id: r.id,
        company_id: r.company_id,
        cobrador_id: r.cobrador_id,
        cobrador_nome: r.cobradores?.nome ?? null,
        used_by: r.used_by,
        created_at: r.created_at,
        nome: r.used_by ? profilesById[r.used_by]?.nome ?? null : null,
        email: r.used_by ? profilesById[r.used_by]?.email ?? null : null,
      }));
    },
  });
}

/** Autoriza o cadastro: atribui papel 'operador' e vincula o cobrador. */
export function useAutorizarConvite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (convite: ConvitePendente) => {
      if (!convite.used_by) throw new Error('Convite sem usuário cadastrado');

      // 1) Concede acesso (papel operador). Ignora conflito se já tiver o papel.
      const { error: roleErr } = await db.from('user_roles').insert({
        user_id: convite.used_by,
        company_id: convite.company_id,
        role: 'operador',
      });
      if (roleErr && !/duplicate|unique/i.test(roleErr.message ?? '')) throw roleErr;

      // 2) Vincula o login à carteira do cobrador.
      if (convite.cobrador_id) {
        const { error: repErr } = await db.from('cobradores')
          .update({ user_id: convite.used_by, ativo: true, email: convite.email })
          .eq('id', convite.cobrador_id);
        if (repErr) throw repErr;
      }

      // 3) Fecha o convite.
      const { error: cErr } = await db.from('convites')
        .update({ status: 'aprovado' })
        .eq('id', convite.id);
      if (cErr) throw cErr;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: convitesKeys.all });
      qc.invalidateQueries({ queryKey: cobradoresKeys.all });
    },
  });
}

/** Recusa/cancela um convite (cadastro não ganha acesso). */
export function useRevogarConvite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (conviteId: string) => {
      const { error } = await db.from('convites').update({ status: 'revogado' }).eq('id', conviteId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: convitesKeys.all }),
  });
}
