import { useState } from 'react';
import { Navigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Building2, ShieldCheck, LogOut, Check, Pause, Play, Upload, Trash2, UserX, KeyRound, MoreHorizontal,
} from 'lucide-react';
import { ChavesApiDialog } from '@/components/plataforma/ChavesApiDialog';
import { ConfirmarAcaoDestrutiva } from '@/components/ConfirmarAcaoDestrutiva';

interface CompanyRow {
  id: string;
  nome: string;
  cnpj: string | null;
  status: string;
  plano: string;
  created_at: string;
}

interface CadastroIncompleto {
  user_id: string;
  nome: string;
  email: string;
  created_at: string;
}

interface MetricaEmpresa {
  company_id: string;
  titulos_ativos: number;
  titulos_total: number;
  clientes: number;
  usuarios: number;
  ultima_atividade: string | null;
}

const statusBadge: Record<string, string> = {
  pendente: 'bg-amber-100 text-amber-800',
  ativa: 'bg-green-100 text-green-800',
  suspensa: 'bg-red-100 text-red-800',
  cancelada: 'bg-gray-200 text-gray-700',
};

const fmtDate = (d: string) => new Date(d).toLocaleDateString('pt-BR');

// Tempo relativo comunica churn melhor que data solta: "há 45 dias" salta aos
// olhos de um jeito que "01/06/2026" não salta.
const fmtAtividade = (d: string | null) => {
  if (!d) return '—';
  const dias = Math.floor((Date.now() - new Date(d).getTime()) / 86_400_000);
  if (dias <= 0) return 'hoje';
  if (dias === 1) return 'ontem';
  if (dias < 30) return `há ${dias} dias`;
  return fmtDate(d);
};

// ===================== Subcomponentes =====================
// Células de uso da empresa. Quando as métricas ainda não chegaram, mostra "—"
// em vez de zero: zero seria mentira, "—" é "ainda não sei".
function MetricasCells({ m }: { m?: MetricaEmpresa }) {
  if (!m) {
    return (
      <>
        <TableCell className="text-right text-muted-foreground">—</TableCell>
        <TableCell className="hidden xl:table-cell text-right text-muted-foreground">—</TableCell>
        <TableCell className="hidden xl:table-cell text-right text-muted-foreground">—</TableCell>
        <TableCell className="text-muted-foreground">—</TableCell>
      </>
    );
  }
  // Só os ativos são faturáveis; o total aparece no tooltip quando divergem,
  // para não parecer que sumiu título.
  const temCancelados = m.titulos_total !== m.titulos_ativos;
  return (
    <>
      <TableCell
        className="text-right tabular-nums"
        title={temCancelados ? `${m.titulos_total} no total (inclui cancelados)` : undefined}
      >
        {m.titulos_ativos}
      </TableCell>
      <TableCell className="hidden xl:table-cell text-right tabular-nums">{m.clientes}</TableCell>
      <TableCell className="hidden xl:table-cell text-right tabular-nums">{m.usuarios}</TableCell>
      <TableCell className="text-muted-foreground">{fmtAtividade(m.ultima_atividade)}</TableCell>
    </>
  );
}

interface EmpresaAcoesProps {
  c: CompanyRow;
  statusPending: boolean;
  onSetStatus: (id: string, status: string) => void;
  onLimpar: (c: CompanyRow) => void;
  onIntegracao: (c: CompanyRow) => void;
}
// Mudança de status fica visível (é a decisão do dia a dia); o resto vai para o
// menu. Sem isso, cada ação nova alarga a linha e a tabela ganha scroll lateral.
function BotaoStatus({ c, statusPending, onSetStatus }: Omit<EmpresaAcoesProps, 'onLimpar' | 'onIntegracao'>) {
  if (c.status === 'pendente') {
    return (
      <Button size="sm" disabled={statusPending} onClick={() => onSetStatus(c.id, 'ativa')}>
        <Check className="mr-1 h-4 w-4" /> Aprovar
      </Button>
    );
  }
  if (c.status === 'ativa') {
    return (
      <Button size="sm" variant="outline" disabled={statusPending}
        onClick={() => onSetStatus(c.id, 'suspensa')}>
        <Pause className="mr-1 h-4 w-4" /> Suspender
      </Button>
    );
  }
  return (
    <Button size="sm" variant="outline" disabled={statusPending}
      onClick={() => onSetStatus(c.id, 'ativa')}>
      <Play className="mr-1 h-4 w-4" /> Reativar
    </Button>
  );
}

function EmpresaAcoes({ c, statusPending, onSetStatus, onLimpar, onIntegracao }: EmpresaAcoesProps) {
  return (
    <div className="flex items-center justify-end gap-2">
      <BotaoStatus c={c} statusPending={statusPending} onSetStatus={onSetStatus} />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="h-8 w-8 shrink-0 p-0" title="Mais ações">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => onIntegracao(c)}>
            <KeyRound className="mr-2 h-4 w-4" /> Integração (chaves de API)
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem className="text-destructive focus:text-destructive"
            onClick={() => onLimpar(c)}>
            <Trash2 className="mr-2 h-4 w-4" /> Limpar títulos
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

interface EmpresaRowProps extends EmpresaAcoesProps {
  m?: MetricaEmpresa;
}
function EmpresaRow({ c, m, statusPending, onSetStatus, onLimpar, onIntegracao }: EmpresaRowProps) {
  return (
    <TableRow>
      <TableCell className="font-medium">{c.nome}</TableCell>
      <TableCell className="hidden xl:table-cell">{c.cnpj ?? '—'}</TableCell>
      <TableCell className="capitalize">{c.plano}</TableCell>
      <TableCell>
        <Badge className={statusBadge[c.status] ?? ''}>
          <span className="capitalize">{c.status}</span>
        </Badge>
      </TableCell>
      <MetricasCells m={m} />
      <TableCell className="hidden xl:table-cell">{fmtDate(c.created_at)}</TableCell>
      <TableCell className="text-right">
        <EmpresaAcoes c={c} statusPending={statusPending} onSetStatus={onSetStatus}
          onLimpar={onLimpar} onIntegracao={onIntegracao} />
      </TableCell>
    </TableRow>
  );
}

interface EmpresasTableCardProps {
  companies: CompanyRow[];
  metricas: Map<string, MetricaEmpresa>;
  isLoading: boolean;
  statusPending: boolean;
  onSetStatus: (id: string, status: string) => void;
  onLimpar: (c: CompanyRow) => void;
  onIntegracao: (c: CompanyRow) => void;
}
function EmpresasTableCard({ companies, metricas, isLoading, statusPending, onSetStatus, onLimpar, onIntegracao }: EmpresasTableCardProps) {
  return (
    <Card>
      <CardHeader><CardTitle>Empresas cadastradas</CardTitle></CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex h-32 items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary" />
          </div>
        ) : companies.length === 0 ? (
          <p className="py-8 text-center text-muted-foreground">Nenhuma empresa cadastrada ainda.</p>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Empresa</TableHead>
                  <TableHead className="hidden xl:table-cell">CNPJ</TableHead>
                  <TableHead>Plano</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Títulos</TableHead>
                  <TableHead className="hidden xl:table-cell text-right">Clientes</TableHead>
                  <TableHead className="hidden xl:table-cell text-right">Usuários</TableHead>
                  <TableHead>Atividade</TableHead>
                  <TableHead className="hidden xl:table-cell">Cadastro</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {companies.map((c) => (
                  <EmpresaRow
                    key={c.id}
                    c={c}
                    m={metricas.get(c.id)}
                    statusPending={statusPending}
                    onSetStatus={onSetStatus}
                    onLimpar={onLimpar}
                    onIntegracao={onIntegracao}
                  />
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// Contas que se cadastraram e não concluíram a criação da empresa: ficam sem
// company_id e sem papel. Não são uma company, então não apareceriam na tabela
// abaixo — e é justamente aí que um cliente real trava sem ninguém notar.
interface CadastrosIncompletosCardProps {
  cadastros: CadastroIncompleto[];
  onExcluir: (c: CadastroIncompleto) => void;
}
function CadastrosIncompletosCard({ cadastros, onExcluir }: CadastrosIncompletosCardProps) {
  if (cadastros.length === 0) return null;

  const titulo = cadastros.length === 1
    ? '1 cadastro incompleto'
    : `${cadastros.length} cadastros incompletos`;

  return (
    <Card className="border-amber-300/60">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <UserX className="h-4 w-4 text-amber-600" />
          <CardTitle className="text-sm font-medium">{titulo}</CardTitle>
        </div>
        <p className="text-xs text-muted-foreground">
          Criaram a conta mas não concluíram o cadastro da empresa. Sem acesso até concluir.
        </p>
      </CardHeader>
      <CardContent>
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>E-mail</TableHead>
                <TableHead>Desde</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {cadastros.map((c) => (
                <TableRow key={c.user_id}>
                  <TableCell className="font-medium">{c.nome}</TableCell>
                  <TableCell className="break-all">{c.email}</TableCell>
                  <TableCell>{fmtDate(c.created_at)}</TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive"
                      title="Descartar este cadastro" onClick={() => onExcluir(c)}>
                      <Trash2 className="mr-1 h-4 w-4" /> Descartar
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

interface LimparTitulosDialogProps {
  alvo: CompanyRow | null;
  confirmacao: string;
  setConfirmacao: (v: string) => void;
  isPending: boolean;
  onClose: () => void;
  onConfirm: (id: string) => void;
}
function LimparTitulosDialog({ alvo, confirmacao, setConfirmacao, isPending, onClose, onConfirm }: LimparTitulosDialogProps) {
  const nome = alvo?.nome ?? '';
  return (
    <Dialog open={!!alvo} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Limpar títulos da empresa</DialogTitle>
          <DialogDescription>
            Isto <strong>apaga do banco TODOS os títulos</strong> de{' '}
            <strong>{nome}</strong> (com parcelas, pagamentos, acordos e anexos).
            Os clientes, cobradores e vendedores são mantidos. <strong>Não dá para desfazer.</strong>
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-2 py-2">
          <p className="text-sm text-muted-foreground">
            Para confirmar, digite o nome da empresa: <strong>{nome}</strong>
          </p>
          <Input value={confirmacao} onChange={(e) => setConfirmacao(e.target.value)} placeholder={nome} />
        </div>
        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button
            variant="destructive"
            disabled={isPending || confirmacao.trim() !== nome.trim()}
            onClick={() => alvo && onConfirm(alvo.id)}
          >
            {isPending ? 'Limpando...' : 'Apagar todos os títulos'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function Plataforma() {
  const { user, isSuperAdmin, loading, signOut } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();

  const companiesQuery = useQuery({
    queryKey: ['plataforma', 'companies'],
    enabled: isSuperAdmin,
    queryFn: async (): Promise<CompanyRow[]> => {
      const { data, error } = await supabase
        .from('companies')
        .select('id, nome, cnpj, status, plano, created_at')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as CompanyRow[];
    },
  });

  const incompletosQuery = useQuery({
    queryKey: ['plataforma', 'cadastros-incompletos'],
    enabled: isSuperAdmin,
    queryFn: async (): Promise<CadastroIncompleto[]> => {
      const { data, error } = await supabase.rpc('cadastros_incompletos');
      if (error) throw error;
      return (data ?? []) as CadastroIncompleto[];
    },
  });

  const metricasQuery = useQuery({
    queryKey: ['plataforma', 'metricas'],
    enabled: isSuperAdmin,
    queryFn: async (): Promise<MetricaEmpresa[]> => {
      const { data, error } = await supabase.rpc('metricas_empresas');
      if (error) throw error;
      return (data ?? []) as MetricaEmpresa[];
    },
  });

  const setStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase.from('companies').update({ status }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: (_d, { status }) => {
      toast({ title: 'Empresa atualizada', description: `Novo status: ${status}.` });
      qc.invalidateQueries({ queryKey: ['plataforma', 'companies'] });
    },
    onError: (e: any) =>
      toast({ title: 'Erro', description: e.message ?? 'Falha ao atualizar', variant: 'destructive' }),
  });

  // Chaves de API da empresa: liberar a integração é decisão de plataforma, não
  // configuração que o admin da empresa se concede.
  const [integracaoAlvo, setIntegracaoAlvo] = useState<CompanyRow | null>(null);

  // Cadastro abandonado no meio do caminho. Sem poder descartar, a lista só
  // cresce e esconde o próximo caso que realmente precisa de atenção.
  const [descartarAlvo, setDescartarAlvo] = useState<CadastroIncompleto | null>(null);
  const descartarCadastro = useMutation({
    mutationFn: async (userId: string) => {
      const { data, error } = await supabase.functions.invoke('excluir-cadastro-incompleto', {
        body: { user_id: userId },
      });
      if (error) throw error;
      if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error);
    },
    onSuccess: () => {
      toast({ title: 'Cadastro descartado', description: 'A conta foi removida.' });
      setDescartarAlvo(null);
      qc.invalidateQueries({ queryKey: ['plataforma', 'cadastros-incompletos'] });
    },
    onError: (e: Error) =>
      toast({ title: 'Erro ao descartar', description: e.message, variant: 'destructive' }),
  });

  // Limpeza de títulos de uma empresa (hard delete) — só super admin, com
  // confirmação digitando o nome da empresa.
  const [limparAlvo, setLimparAlvo] = useState<CompanyRow | null>(null);
  const [confirmacao, setConfirmacao] = useState('');
  const limparTitulos = useMutation({
    mutationFn: async (companyId: string) => {
      const { data, error } = await supabase.rpc('limpar_titulos_empresa', { p_company_id: companyId });
      if (error) throw error;
      return (data as any)?.excluidos ?? 0;
    },
    onSuccess: (excluidos) => {
      toast({ title: 'Títulos removidos', description: `${excluidos} título(s) apagados do banco.` });
      setLimparAlvo(null);
      setConfirmacao('');
      qc.invalidateQueries({ queryKey: ['plataforma', 'companies'] });
      qc.invalidateQueries({ queryKey: ['plataforma', 'metricas'] });
    },
    onError: (e: any) =>
      toast({ title: 'Erro', description: e.message ?? 'Falha ao limpar', variant: 'destructive' }),
  });

  if (loading) return null;
  if (!user) return <Navigate to="/auth" replace />;
  if (!isSuperAdmin) return <Navigate to="/" replace />;

  const companies = companiesQuery.data ?? [];
  const count = (s: string) => companies.filter((c) => c.status === s).length;
  const metricas = new Map((metricasQuery.data ?? []).map((m) => [m.company_id, m]));

  return (
    <div className="min-h-screen bg-background">
      <header className="h-16 flex items-center justify-between border-b border-border/50 bg-card/80 px-6 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10">
            <ShieldCheck className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-lg font-semibold leading-none">Painel da Plataforma</h1>
            <p className="text-xs text-muted-foreground">Administração de empresas (super admin)</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link to="/plataforma/importar"><Upload className="mr-2 h-4 w-4" /> Importar títulos</Link>
          </Button>
          <Button variant="ghost" size="sm" onClick={signOut}>
            <LogOut className="mr-2 h-4 w-4" /> Sair
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-6 p-6">
        <div className="grid gap-4 sm:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total</CardTitle>
              <Building2 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent><div className="text-2xl font-bold">{companies.length}</div></CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Pendentes</CardTitle></CardHeader>
            <CardContent><div className="text-2xl font-bold text-amber-600">{count('pendente')}</div></CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Ativas</CardTitle></CardHeader>
            <CardContent><div className="text-2xl font-bold text-green-600">{count('ativa')}</div></CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Suspensas</CardTitle></CardHeader>
            <CardContent><div className="text-2xl font-bold text-red-600">{count('suspensa')}</div></CardContent>
          </Card>
        </div>

        <CadastrosIncompletosCard
          cadastros={incompletosQuery.data ?? []}
          onExcluir={setDescartarAlvo}
        />

        <EmpresasTableCard
          companies={companies}
          metricas={metricas}
          isLoading={companiesQuery.isLoading}
          statusPending={setStatus.isPending}
          onSetStatus={(id, status) => setStatus.mutate({ id, status })}
          onLimpar={(c) => { setConfirmacao(''); setLimparAlvo(c); }}
          onIntegracao={setIntegracaoAlvo}
        />
      </main>

      <ChavesApiDialog empresa={integracaoAlvo} onClose={() => setIntegracaoAlvo(null)} />

      <ConfirmarAcaoDestrutiva
        open={!!descartarAlvo}
        onOpenChange={(o) => { if (!o) setDescartarAlvo(null); }}
        titulo="Descartar cadastro incompleto"
        descricao={
          <>
            A conta de <strong>{descartarAlvo?.nome}</strong> ({descartarAlvo?.email}) será
            removida. Ela nunca concluiu o cadastro da empresa, então não há dados de cobrança
            associados. Se a pessoa quiser voltar, basta se cadastrar de novo.
          </>
        }
        rotuloConfirmar="Descartar cadastro"
        isPending={descartarCadastro.isPending}
        onConfirm={() => descartarAlvo && descartarCadastro.mutate(descartarAlvo.user_id)}
      />

      <LimparTitulosDialog
        alvo={limparAlvo}
        confirmacao={confirmacao}
        setConfirmacao={setConfirmacao}
        isPending={limparTitulos.isPending}
        onClose={() => { setLimparAlvo(null); setConfirmacao(''); }}
        onConfirm={(id) => limparTitulos.mutate(id)}
      />
    </div>
  );
}
