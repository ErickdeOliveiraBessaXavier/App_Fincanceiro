import { supabase } from '@/integrations/supabase/client';

/**
 * company_id do tenant (empresa) do usuário logado.
 *
 * Para uso fora de componentes React (ex.: funções de mutation em lib/queries).
 * É a mesma empresa que o trigger `fn_set_company_id` aplica no banco; aqui
 * passamos explicitamente nos inserts para satisfazer os tipos do Supabase.
 *
 * Em componentes, prefira `useAuth().companyId`.
 */
export async function getCurrentCompanyId(): Promise<string | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from('profiles')
    .select('company_id')
    .eq('user_id', user.id)
    .maybeSingle();

  return data?.company_id ?? null;
}
