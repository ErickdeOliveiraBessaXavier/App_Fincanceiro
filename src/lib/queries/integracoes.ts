import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { getCurrentCompanyId } from '@/lib/currentCompany';

/**
 * Integração de WhatsApp da empresa (provedor Z-API).
 *
 * O token NUNCA volta para o navegador: a leitura passa por
 * `vw_integracoes_whatsapp`, que devolve só se ele está preenchido. Quem usa o
 * segredo é a Edge Function `enviar-campanha`, com service_role.
 */

export interface IntegracaoWhatsApp {
  id: string;
  provider: string;
  instance_id: string | null;
  ativo: boolean;
  token_configurado: boolean;
  client_token_configurado: boolean;
  updated_at: string;
}

export const integracoesKeys = {
  all: ['integracoes'] as const,
  whatsapp: () => [...integracoesKeys.all, 'whatsapp'] as const,
};

export function useIntegracaoWhatsApp() {
  return useQuery({
    queryKey: integracoesKeys.whatsapp(),
    queryFn: async (): Promise<IntegracaoWhatsApp | null> => {
      const { data, error } = await supabase
        .from('vw_integracoes_whatsapp')
        .select('*')
        .maybeSingle();
      if (error) throw error;
      return (data as IntegracaoWhatsApp | null) ?? null;
    },
  });
}

export interface SalvarIntegracaoInput {
  instanceId: string;
  /** Vazio = manter o token já gravado (a tela nunca o recebe de volta). */
  token?: string;
  clientToken?: string;
  ativo: boolean;
}

export function useSalvarIntegracaoWhatsApp() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: SalvarIntegracaoInput) => {
      const companyId = await getCurrentCompanyId();
      if (!companyId) throw new Error('Empresa não identificada');

      // Campo em branco não apaga o segredo existente: quem edita a instância
      // não precisa redigitar o token que nunca viu.
      const token = input.token?.trim();
      const clientToken = input.clientToken?.trim();

      const { error } = await supabase
        .from('integracoes_whatsapp')
        .upsert({
          company_id: companyId,
          provider: 'z-api',
          instance_id: input.instanceId.trim() || null,
          ativo: input.ativo,
          ...(token ? { token } : {}),
          ...(clientToken ? { client_token: clientToken } : {}),
        }, { onConflict: 'company_id,provider' });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: integracoesKeys.all }),
  });
}

export interface ResultadoDisparo {
  enviados: number;
  falhas: number;
  total: number;
}

/** Dispara a campanha pela Edge Function. */
export function useDispararCampanha() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (campanhaId: string): Promise<ResultadoDisparo> => {
      const { data, error } = await supabase.functions.invoke('enviar-campanha', {
        body: { campanha_id: campanhaId },
      });
      if (error) throw error;
      const corpo = data as { error?: string } & ResultadoDisparo;
      // A função responde 4xx com { error }: sem isto o erro viraria "sucesso".
      if (corpo?.error) throw new Error(corpo.error);
      return corpo;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: integracoesKeys.all }),
  });
}
