import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

/**
 * Consultas e ações do painel da Plataforma (super admin). O banco confere o
 * papel em cada uma; aqui é só o acesso.
 */

export interface CompanyRow {
  id: string;
  nome: string;
  cnpj: string | null;
  status: string;
  plano: string;
  limite_titulos_personalizado: number | null;
  acesso_expira_em: string | null;
  created_at: string;
}

export interface CadastroIncompleto {
  user_id: string;
  nome: string;
  email: string;
  created_at: string;
}

export interface MetricaEmpresa {
  company_id: string;
  titulos_ativos: number;
  titulos_total: number;
  clientes: number;
  usuarios: number;
  ultima_atividade: string | null;
  /** Limite efetivo (personalizado ou do plano); null = sem limite. */
  limite_titulos: number | null;
}

export type StatusEmpresa = 'pendente' | 'ativa' | 'suspensa' | 'cancelada';

const chave = {
  companies: ['plataforma', 'companies'] as const,
  incompletos: ['plataforma', 'cadastros-incompletos'] as const,
  metricas: ['plataforma', 'metricas'] as const,
};

export function useEmpresasPlataforma(enabled: boolean) {
  return useQuery({
    queryKey: chave.companies,
    enabled,
    queryFn: async (): Promise<CompanyRow[]> => {
      const { data, error } = await supabase
        .from('companies')
        .select('id, nome, cnpj, status, plano, limite_titulos_personalizado, acesso_expira_em, created_at')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as CompanyRow[];
    },
  });
}

export function useCadastrosIncompletos(enabled: boolean) {
  return useQuery({
    queryKey: chave.incompletos,
    enabled,
    queryFn: async (): Promise<CadastroIncompleto[]> => {
      const { data, error } = await supabase.rpc('cadastros_incompletos');
      if (error) throw error;
      return (data ?? []) as CadastroIncompleto[];
    },
  });
}

export function useMetricasEmpresas(enabled: boolean) {
  return useQuery({
    queryKey: chave.metricas,
    enabled,
    queryFn: async (): Promise<MetricaEmpresa[]> => {
      const { data, error } = await supabase.rpc('metricas_empresas');
      if (error) throw error;
      return (data ?? []) as MetricaEmpresa[];
    },
  });
}

const MENSAGEM_STATUS: Record<string, string> = {
  ativa: 'Empresa liberada: os usuários já conseguem entrar.',
  suspensa: 'Empresa suspensa: os usuários não conseguem mais entrar. Os dados ficam guardados.',
};

const erroDe = (e: unknown, padrao: string) => (e instanceof Error ? e.message : padrao);

export function useAlterarStatusEmpresa() {
  const { toast } = useToast();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: StatusEmpresa }) => {
      const { error } = await supabase.from('companies').update({ status }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: (_d, { status }) => {
      toast({ title: 'Empresa atualizada', description: MENSAGEM_STATUS[status] ?? `Novo status: ${status}.` });
      qc.invalidateQueries({ queryKey: chave.companies });
    },
    onError: (e) => toast({ title: 'Erro', description: erroDe(e, 'Falha ao atualizar'), variant: 'destructive' }),
  });
}

/** Hard delete de todos os títulos da empresa (o banco confere o super admin). */
export function useLimparTitulosEmpresa() {
  const { toast } = useToast();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (companyId: string) => {
      const { data, error } = await supabase.rpc('limpar_titulos_empresa', { p_company_id: companyId });
      if (error) throw error;
      return (data as { excluidos?: number } | null)?.excluidos ?? 0;
    },
    onSuccess: (excluidos) => {
      toast({ title: 'Títulos removidos', description: `${excluidos} título(s) apagados do banco.` });
      qc.invalidateQueries({ queryKey: chave.companies });
      qc.invalidateQueries({ queryKey: chave.metricas });
    },
    onError: (e) => toast({ title: 'Erro', description: erroDe(e, 'Falha ao limpar'), variant: 'destructive' }),
  });
}

export function useDescartarCadastro() {
  const { toast } = useToast();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (userId: string) => {
      const { data, error } = await supabase.functions.invoke('excluir-cadastro-incompleto', {
        body: { user_id: userId },
      });
      if (error) throw error;
      if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error);
    },
    onSuccess: () => {
      toast({ title: 'Cadastro descartado', description: 'A conta foi removida.' });
      qc.invalidateQueries({ queryKey: chave.incompletos });
    },
    onError: (e) => toast({ title: 'Erro ao descartar', description: erroDe(e, 'Falha ao descartar'), variant: 'destructive' }),
  });
}
