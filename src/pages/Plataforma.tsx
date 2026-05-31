import { Navigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Building2, ShieldCheck, LogOut, Check, Pause, Play } from 'lucide-react';

interface CompanyRow {
  id: string;
  nome: string;
  cnpj: string | null;
  status: string;
  plano: string;
  created_at: string;
}

const statusBadge: Record<string, string> = {
  pendente: 'bg-amber-100 text-amber-800',
  ativa: 'bg-green-100 text-green-800',
  suspensa: 'bg-red-100 text-red-800',
  cancelada: 'bg-gray-200 text-gray-700',
};

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

  if (loading) return null;
  if (!user) return <Navigate to="/auth" replace />;
  if (!isSuperAdmin) return <Navigate to="/" replace />;

  const companies = companiesQuery.data ?? [];
  const count = (s: string) => companies.filter((c) => c.status === s).length;
  const fmtDate = (d: string) => new Date(d).toLocaleDateString('pt-BR');

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
        <Button variant="ghost" size="sm" onClick={signOut}>
          <LogOut className="mr-2 h-4 w-4" /> Sair
        </Button>
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

        <Card>
          <CardHeader><CardTitle>Empresas cadastradas</CardTitle></CardHeader>
          <CardContent>
            {companiesQuery.isLoading ? (
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
                      <TableHead>CNPJ</TableHead>
                      <TableHead>Plano</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Cadastro</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {companies.map((c) => (
                      <TableRow key={c.id}>
                        <TableCell className="font-medium">{c.nome}</TableCell>
                        <TableCell>{c.cnpj ?? '—'}</TableCell>
                        <TableCell className="capitalize">{c.plano}</TableCell>
                        <TableCell>
                          <Badge className={statusBadge[c.status] ?? ''}>
                            <span className="capitalize">{c.status}</span>
                          </Badge>
                        </TableCell>
                        <TableCell>{fmtDate(c.created_at)}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            {c.status === 'pendente' && (
                              <Button size="sm" disabled={setStatus.isPending}
                                onClick={() => setStatus.mutate({ id: c.id, status: 'ativa' })}>
                                <Check className="mr-1 h-4 w-4" /> Aprovar
                              </Button>
                            )}
                            {c.status === 'ativa' && (
                              <Button size="sm" variant="outline" disabled={setStatus.isPending}
                                onClick={() => setStatus.mutate({ id: c.id, status: 'suspensa' })}>
                                <Pause className="mr-1 h-4 w-4" /> Suspender
                              </Button>
                            )}
                            {(c.status === 'suspensa' || c.status === 'cancelada') && (
                              <Button size="sm" variant="outline" disabled={setStatus.isPending}
                                onClick={() => setStatus.mutate({ id: c.id, status: 'ativa' })}>
                                <Play className="mr-1 h-4 w-4" /> Reativar
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
