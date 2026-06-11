import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { cobradoresKeys } from './cobradores';
import { vendedoresKeys } from './vendedores';
import { getCurrentCompanyId } from '@/lib/currentCompany';

/** Tipo de carteira do convite: cobrança (cobrador) ou vendas (vendedor). */
export type ConviteTipo = 'cobrador' | 'vendedor';

export interface ConvitePendente {
  id: string;
  company_id: string;
  cobrador_id: string | null;
  vendedor_id: string | null;
  /** 'cobrador' | 'vendedor', conforme qual carteira o convite vincula. */
  tipo: ConviteTipo;
  /** Nome da carteira (cobrador ou vendedor) vinculada ao convite. */
  carteira_nome: string | null;
  used_by: string | null;
  created_at: string;
  /** Nome/e-mail informados pela pessoa no cadastro. */
  nome: string | null;
  email: string | null;
}

export const convitesKeys = {
  all: ['convites'] as const,
  pendentes: () => [...convitesKeys.all, 'pendentes'] as const,
};

type PerfilLite = { nome: string; email: string };

// Nome/e-mail do perfil que se cadastrou (ou nulls se ainda não há cadastro).
function nomeEmailDoPerfil(usedBy: string | null, profilesById: Record<string, PerfilLite>) {
  const perfil = usedBy ? profilesById[usedBy] : undefined;
  return { nome: perfil?.nome ?? null, email: perfil?.email ?? null };
}

// Nome da carteira (vendedor ou cobrador) vinculada ao convite.
type CarteiraJoin = { vendedores?: { nome: string } | null; cobradores?: { nome: string } | null };
function carteiraNomeConvite(tipo: ConviteTipo, r: CarteiraJoin): string | null {
  return (tipo === 'vendedor' ? r.vendedores?.nome : r.cobradores?.nome) ?? null;
}

/**
 * Gera um convite para um cobrador OU um vendedor e devolve o token (link).
 * Passe exatamente um dos dois ids conforme a carteira.
 */
export function useGerarConvite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      input: { cobradorId?: string; vendedorId?: string; nomeSugerido?: string },
    ): Promise<string> => {
      const token = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '');
      const companyId = await getCurrentCompanyId();
      if (!companyId) throw new Error('Empresa não identificada');
      const { error } = await supabase.from('convites').insert({
        company_id: companyId,
        cobrador_id: input.cobradorId ?? null,
        vendedor_id: input.vendedorId ?? null,
        nome_sugerido: input.nomeSugerido ?? null,
        token,
      });
      if (error) throw error;
      return token;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: convitesKeys.all });
      qc.invalidateQueries({ queryKey: cobradoresKeys.all });
      qc.invalidateQueries({ queryKey: vendedoresKeys.all });
    },
  });
}

/** Lista cadastros que aguardam autorização do admin. */
export function usePendingConvites() {
  return useQuery({
    queryKey: convitesKeys.pendentes(),
    queryFn: async (): Promise<ConvitePendente[]> => {
      const { data, error } = await supabase
        .from('convites')
        .select('id, company_id, cobrador_id, vendedor_id, used_by, created_at, cobradores(nome), vendedores(nome)')
        .eq('status', 'aguardando')
        .order('created_at', { ascending: false });
      if (error) throw error;
      const rows = (data ?? []) as any[];

      // Busca nome/e-mail dos perfis que se cadastraram (FK é para auth.users, não dá join direto).
      const userIds = rows.map((r) => r.used_by).filter(Boolean);
      let profilesById: Record<string, { nome: string; email: string }> = {};
      if (userIds.length) {
        const { data: profs } = await supabase
          .from('profiles')
          .select('user_id, nome, email')
          .in('user_id', userIds);
        profilesById = Object.fromEntries((profs ?? []).map((p: any) => [p.user_id, p]));
      }

      return rows.map((r) => {
        const tipo: ConviteTipo = r.vendedor_id ? 'vendedor' : 'cobrador';
        const { nome, email } = nomeEmailDoPerfil(r.used_by, profilesById);
        return {
          id: r.id,
          company_id: r.company_id,
          cobrador_id: r.cobrador_id,
          vendedor_id: r.vendedor_id,
          tipo,
          carteira_nome: carteiraNomeConvite(tipo, r),
          used_by: r.used_by,
          created_at: r.created_at,
          nome,
          email,
        };
      });
    },
  });
}

/**
 * Autoriza o cadastro: atribui o papel da carteira e vincula o login.
 *   - cobrador -> papel 'operador' (pode operar a própria carteira de cobrança).
 *   - vendedor -> papel 'vendedor' (read-only, escopado à carteira de vendas).
 */
// Concede o papel ao usuário. Ignora conflito se ele já tiver o papel.
async function concederPapel(convite: ConvitePendente, role: 'vendedor' | 'operador') {
  const { error } = await supabase.from('user_roles').insert({
    user_id: convite.used_by,
    company_id: convite.company_id,
    role,
  });
  if (error && !/duplicate|unique/i.test(error.message ?? '')) throw error;
}

// Vincula o login à carteira correspondente (tabela explícita p/ tipagem).
async function vincularCarteira(convite: ConvitePendente, vinculo: { user_id: string; ativo: boolean; email: string | null }) {
  if (convite.tipo === 'vendedor' && convite.vendedor_id) {
    const { error } = await supabase.from('vendedores').update(vinculo).eq('id', convite.vendedor_id);
    if (error) throw error;
  } else if (convite.cobrador_id) {
    const { error } = await supabase.from('cobradores').update(vinculo).eq('id', convite.cobrador_id);
    if (error) throw error;
  }
}

export function useAutorizarConvite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (convite: ConvitePendente) => {
      if (!convite.used_by) throw new Error('Convite sem usuário cadastrado');

      const role = convite.tipo === 'vendedor' ? 'vendedor' : 'operador';

      // 1) Concede acesso.
      await concederPapel(convite, role);

      // 2) Vincula o login à carteira.
      const vinculo = { user_id: convite.used_by, ativo: true, email: convite.email };
      await vincularCarteira(convite, vinculo);

      // 3) Fecha o convite.
      const { error: cErr } = await supabase.from('convites')
        .update({ status: 'aprovado' })
        .eq('id', convite.id);
      if (cErr) throw cErr;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: convitesKeys.all });
      qc.invalidateQueries({ queryKey: cobradoresKeys.all });
      qc.invalidateQueries({ queryKey: vendedoresKeys.all });
    },
  });
}

/** Recusa/cancela um convite (cadastro não ganha acesso). */
export function useRevogarConvite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (conviteId: string) => {
      const { error } = await supabase.from('convites').update({ status: 'revogado' }).eq('id', conviteId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: convitesKeys.all }),
  });
}
