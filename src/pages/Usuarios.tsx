import { useState, useEffect } from 'react';
import { PageHeader } from '@/components/PageHeader';
import { Search, Edit, Shield, User, UserCog, Clock, Check, X, Trash2, Store } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { EditarPapelModal } from '@/components/usuarios/EditarPapelModal';
import { useUserRole, type AppRole } from '@/hooks/useUserRole';
import { useAuth } from '@/contexts/AuthContext';
import { cobradoresKeys } from '@/lib/queries/cobradores';
import { usePendingConvites, useAutorizarConvite, useRevogarConvite, type ConvitePendente } from '@/lib/queries/convites';
import { useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';

interface Usuario {
  id: string;
  user_id: string;
  nome: string;
  email: string;
  created_at: string;
  role: AppRole | null;
}

// ===================== Subcomponentes =====================
interface PendingConvitesCardProps {
  isAdmin: boolean;
  pendentes: ConvitePendente[];
  busy: boolean;
  onAutorizar: (c: ConvitePendente) => void;
  onRecusar: (c: ConvitePendente) => void;
}
function PendingConvitesCard({ isAdmin, pendentes, busy, onAutorizar, onRecusar }: PendingConvitesCardProps) {
  if (!isAdmin || pendentes.length === 0) return null;
  return (
    <Card className="border-2 border-amber-500/20 bg-amber-500/5 shadow-card rounded-2xl overflow-hidden">
      <CardHeader className="pb-4 border-b border-amber-500/10 bg-amber-500/10">
        <CardTitle className="flex items-center gap-3 text-amber-700">
          <Clock className="h-5 w-5" />
          <span className="font-bold tracking-tight">Aguardando Autorização</span>
          <Badge className="bg-amber-600 text-white rounded-full px-2.5">{pendentes.length}</Badge>
        </CardTitle>
        <CardDescription className="text-amber-600/80 font-medium">
          Novos membros aguardando liberação de acesso à plataforma.
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-6">
        <div className="rounded-xl border border-amber-500/20 overflow-hidden bg-white/50">
          <Table>
            <TableHeader className="bg-amber-500/10">
              <TableRow>
                <TableHead className="text-[10px] font-bold uppercase tracking-widest text-amber-800">Nome</TableHead>
                <TableHead className="text-[10px] font-bold uppercase tracking-widest text-amber-800">Email</TableHead>
                <TableHead className="text-[10px] font-bold uppercase tracking-widest text-amber-800">Tipo</TableHead>
                <TableHead className="text-[10px] font-bold uppercase tracking-widest text-amber-800">Carteira</TableHead>
                <TableHead className="text-right text-[10px] font-bold uppercase tracking-widest text-amber-800">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pendentes.map((c) => (
                <TableRow key={c.id} className="hover:bg-amber-500/5 transition-colors">
                  <TableCell className="font-bold text-sm text-amber-900">{c.nome ?? '—'}</TableCell>
                  <TableCell className="text-xs font-medium text-amber-800/70">{c.email ?? '—'}</TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="capitalize rounded-lg font-bold text-[10px] bg-amber-200 text-amber-900">{c.tipo}</Badge>
                  </TableCell>
                  <TableCell className="text-xs font-medium text-amber-800/70">{c.carteira_nome ?? '—'}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        size="sm"
                        className="bg-amber-600 hover:bg-amber-700 text-white rounded-lg px-4 font-bold h-8"
                        onClick={() => onAutorizar(c)}
                        disabled={busy}
                      >
                        <Check className="h-4 w-4 mr-2" /> Autorizar
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:text-destructive hover:bg-destructive/5 rounded-lg h-8 px-3 font-bold"
                        onClick={() => onRecusar(c)}
                        disabled={busy}
                      >
                        <X className="h-4 w-4 mr-2" /> Recusar
                      </Button>
                    </div>
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

interface DeleteUsuarioDialogProps {
  target: Usuario | null;
  deleting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}
function DeleteUsuarioDialog({ target, deleting, onCancel, onConfirm }: DeleteUsuarioDialogProps) {
  return (
    <Dialog open={!!target} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Excluir usuário</DialogTitle>
          <DialogDescription>
            Tem certeza que deseja excluir <strong>{target?.nome}</strong> ({target?.email})?
            A conta de acesso será removida. Se for um cobrador, a carteira de clientes é
            preservada, apenas fica sem acesso. Esta ação não pode ser desfeita.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={onCancel} disabled={deleting}>Cancelar</Button>
          <Button variant="destructive" onClick={onConfirm} disabled={deleting}>
            {deleting ? 'Excluindo...' : 'Excluir'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface NovoAdminDialogProps {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  novoUser: { nome: string; email: string; senha: string };
  setNovoUser: (u: { nome: string; email: string; senha: string }) => void;
  creating: boolean;
  onCreate: () => void;
}
function NovoAdminDialog({ open, onOpenChange, novoUser, setNovoUser, creating, onCreate }: NovoAdminDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Novo administrador</DialogTitle>
          <DialogDescription>
            Cria um usuário com acesso total à empresa. Para dar acesso a um cobrador,
            use a página <strong>Cobradores</strong> (botão de link de convite).
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label htmlFor="nu-nome">Nome <span className="text-red-500">*</span></Label>
            <Input id="nu-nome" value={novoUser.nome} onChange={(e) => setNovoUser({ ...novoUser, nome: e.target.value })} />
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="nu-email">E-mail <span className="text-red-500">*</span></Label>
              <Input id="nu-email" type="email" value={novoUser.email} onChange={(e) => setNovoUser({ ...novoUser, email: e.target.value })} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="nu-senha">Senha <span className="text-red-500">*</span></Label>
              <Input id="nu-senha" type="text" value={novoUser.senha} onChange={(e) => setNovoUser({ ...novoUser, senha: e.target.value })} placeholder="mín. 6 caracteres" />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={creating}>Cancelar</Button>
          <Button onClick={onCreate} disabled={creating}>{creating ? 'Criando...' : 'Criar administrador'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function Usuarios() {
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [editTarget, setEditTarget] = useState<Usuario | null>(null);
  const { toast } = useToast();
  const { isAdmin } = useUserRole();
  const { user } = useAuth();
  const [deleteTarget, setDeleteTarget] = useState<Usuario | null>(null);
  const [deleting, setDeleting] = useState(false);
  const { data: pendentes = [] } = usePendingConvites();
  const autorizarMut = useAutorizarConvite();
  const revogarMut = useRevogarConvite();
  const qc = useQueryClient();

  const handleAutorizar = async (c: ConvitePendente) => {
    try {
      await autorizarMut.mutateAsync(c);
      const papel = c.tipo === 'vendedor' ? 'Vendedor' : 'Cobrador';
      toast({ title: 'Acesso autorizado', description: `${c.nome ?? papel} já pode entrar no sistema.` });
      fetchUsuarios();
    } catch (e: any) {
      toast({ title: 'Erro', description: e.message ?? 'Falha ao autorizar', variant: 'destructive' });
    }
  };

  const handleRecusar = async (c: ConvitePendente) => {
    try {
      await revogarMut.mutateAsync(c.id);
      toast({ title: 'Cadastro recusado', description: 'O convite foi cancelado.' });
    } catch (e: any) {
      toast({ title: 'Erro', description: e.message ?? 'Falha ao recusar', variant: 'destructive' });
    }
  };

  const handleExcluir = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const { data, error } = await supabase.functions.invoke('excluir-usuario-empresa', {
        body: { user_id: deleteTarget.user_id },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      toast({ title: 'Usuário excluído', description: `${deleteTarget.nome} foi removido do sistema.` });
      setDeleteTarget(null);
      fetchUsuarios();
      // A carteira do cobrador pode ter perdido o vínculo de acesso (user_id -> NULL).
      qc.invalidateQueries({ queryKey: cobradoresKeys.all });
    } catch (e: any) {
      toast({ title: 'Erro ao excluir', description: e.message ?? 'Falha desconhecida', variant: 'destructive' });
    } finally {
      setDeleting(false);
    }
  };

  const emptyNovo = { nome: '', email: '', senha: '' };
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [novoUser, setNovoUser] = useState(emptyNovo);

  // Esta tela cria apenas ADMINISTRADORES. O acesso de um cobrador é concedido
  // na página Cobradores (link de convite) — um único caminho para evitar duplicidade.
  const handleCreateUser = async () => {
    if (!novoUser.nome.trim() || !novoUser.email.trim() || novoUser.senha.length < 6) {
      toast({ title: 'Dados incompletos', description: 'Preencha nome, e-mail e senha (mín. 6 caracteres).', variant: 'destructive' });
      return;
    }
    setCreating(true);
    try {
      const { data, error } = await supabase.functions.invoke('criar-usuario-empresa', {
        body: {
          nome: novoUser.nome.trim(),
          email: novoUser.email.trim(),
          senha: novoUser.senha,
          role: 'admin',
        },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);

      toast({ title: 'Administrador criado', description: `${novoUser.nome} foi adicionado à empresa.` });
      setCreateOpen(false);
      setNovoUser(emptyNovo);
      fetchUsuarios();
    } catch (e: any) {
      toast({ title: 'Erro ao criar administrador', description: e.message ?? 'Falha desconhecida', variant: 'destructive' });
    } finally {
      setCreating(false);
    }
  };

  useEffect(() => { fetchUsuarios(); }, []);

  const fetchUsuarios = async () => {
    setLoading(true);
    try {
      const [{ data: profilesData, error: pErr }, { data: rolesData, error: rErr }] = await Promise.all([
        supabase.from('profiles').select('*').order('created_at', { ascending: false }),
        supabase.from('user_roles').select('user_id, role'),
      ]);
      if (pErr) throw pErr;
      if (rErr) throw rErr;

      setUsuarios((profilesData ?? []).map((p: any) => ({
        ...p,
        role: (rolesData?.find((r: any) => r.user_id === p.user_id)?.role ?? null) as AppRole | null,
      })));
    } catch (error: any) {
      console.error(error);
      toast({ title: 'Erro', description: 'Não foi possível carregar os usuários', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const roleBadge = (role: AppRole | null) => {
    if (role === 'super_admin') return { cls: 'bg-purple-100 text-purple-800', icon: <Shield className="h-4 w-4" />, label: 'admin mestre' };
    if (role === 'admin') return { cls: 'bg-red-100 text-red-800', icon: <Shield className="h-4 w-4" />, label: 'admin' };
    if (role === 'operador') return { cls: 'bg-blue-100 text-blue-800', icon: <UserCog className="h-4 w-4" />, label: 'cobrador' };
    if (role === 'vendedor') return { cls: 'bg-teal-100 text-teal-800', icon: <Store className="h-4 w-4" />, label: 'vendedor' };
    // papéis legados (não usados no modelo de 3 níveis)
    if (role === 'financeiro') return { cls: 'bg-amber-100 text-amber-800', icon: <UserCog className="h-4 w-4" />, label: 'financeiro' };
    if (role === 'leitura') return { cls: 'bg-slate-100 text-slate-800', icon: <User className="h-4 w-4" />, label: 'leitura' };
    return { cls: 'bg-gray-100 text-gray-800', icon: <User className="h-4 w-4" />, label: 'sem papel' };
  };

  const formatDate = (date: string) => new Date(date).toLocaleDateString('pt-BR');

  const filtered = usuarios.filter(u =>
    u.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
    u.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (u.role ?? '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  const count = (r: AppRole) => usuarios.filter(u => u.role === r).length;

  return (
    <div className="space-y-10 animate-fade-in pb-10">
      <PageHeader
        title="Usuários"
        description="Gestão de acessos, papéis e autorizações da plataforma."
      >
        {isAdmin && (
          <Button 
            onClick={() => setCreateOpen(true)}
          >
            <Plus className="mr-2 h-4 w-4" /> Novo Administrador
          </Button>
        )}
      </PageHeader>

      <div className="grid gap-6 grid-cols-1 sm:grid-cols-3">
        <Card className="border-none shadow-card rounded-2xl overflow-hidden group">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Total de Usuários</CardTitle>
            <User className="h-4 w-4 text-muted-foreground group-hover:scale-110 transition-transform" />
          </CardHeader>
          <CardContent><div className="text-2xl font-black tracking-tighter">{usuarios.length}</div></CardContent>
        </Card>
        <Card className="border-none shadow-card rounded-2xl overflow-hidden group">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent pointer-events-none" />
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 relative z-10">
            <CardTitle className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Administradores</CardTitle>
            <Shield className="h-4 w-4 text-primary group-hover:scale-110 transition-transform" />
          </CardHeader>
          <CardContent className="relative z-10"><div className="text-2xl font-black tracking-tighter text-primary">{count('admin')}</div></CardContent>
        </Card>
        <Card className="border-none shadow-card rounded-2xl overflow-hidden group">
          <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-transparent pointer-events-none" />
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 relative z-10">
            <CardTitle className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Cobradores</CardTitle>
            <UserCog className="h-4 w-4 text-blue-600 group-hover:scale-110 transition-transform" />
          </CardHeader>
          <CardContent className="relative z-10"><div className="text-2xl font-black tracking-tighter text-blue-600">{count('operador')}</div></CardContent>
        </Card>
      </div>

      <PendingConvitesCard
        isAdmin={isAdmin}
        pendentes={pendentes}
        busy={autorizarMut.isPending || revogarMut.isPending}
        onAutorizar={handleAutorizar}
        onRecusar={handleRecusar}
      />

      <Card className="border-none shadow-card rounded-2xl overflow-hidden">
        <CardHeader className="pb-4 border-b border-border/50 bg-muted/20">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-xl font-bold tracking-tight">Lista de Usuários</CardTitle>
              <CardDescription className="text-xs font-medium">Controle de acesso e atribuição de responsabilidades</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-6">
          <div className="flex gap-4 mb-8">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground h-4 w-4" />
              <Input
                placeholder="Buscar por nome, email ou função..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 rounded-xl bg-muted/20 border-border/40"
              />
            </div>
          </div>

          <div className="rounded-xl border border-border/50 overflow-hidden">
            <Table>
              <TableHeader className="bg-muted/30">
                <TableRow>
                  <TableHead className="text-[10px] font-bold uppercase tracking-widest">Nome</TableHead>
                  <TableHead className="text-[10px] font-bold uppercase tracking-widest">Email</TableHead>
                  <TableHead className="text-[10px] font-bold uppercase tracking-widest">Função</TableHead>
                  <TableHead className="text-[10px] font-bold uppercase tracking-widest">Cadastro</TableHead>
                  <TableHead className="text-right text-[10px] font-bold uppercase tracking-widest">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((u) => {
                  const b = roleBadge(u.role);
                  return (
                    <TableRow key={u.id} className="hover:bg-muted/10 transition-colors">
                      <TableCell className="font-bold text-sm text-foreground">{u.nome}</TableCell>
                      <TableCell className="text-xs font-medium text-muted-foreground">{u.email}</TableCell>
                      <TableCell>
                        <Badge className={`${b.cls} rounded-lg border-none font-bold text-[10px] uppercase tracking-wider py-1`}>
                          <div className="flex items-center gap-1.5">
                            {b.icon}
                            <span>{b.label}</span>
                          </div>
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs font-medium text-muted-foreground">{formatDate(u.created_at)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="sm" onClick={() => setEditTarget(u)} className="h-8 w-8 p-0 rounded-lg hover:bg-primary/5">
                            <Edit className="h-4 w-4" />
                          </Button>
                          {u.user_id !== user?.id && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0 rounded-lg text-destructive hover:text-destructive hover:bg-destructive/5"
                              onClick={() => setDeleteTarget(u)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {editTarget && (
        <EditarPapelModal
          open={!!editTarget}
          onOpenChange={(o) => !o && setEditTarget(null)}
          usuario={editTarget}
          onSaved={fetchUsuarios}
        />
      )}

      <DeleteUsuarioDialog
        target={deleteTarget}
        deleting={deleting}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={handleExcluir}
      />

      <NovoAdminDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        novoUser={novoUser}
        setNovoUser={setNovoUser}
        creating={creating}
        onCreate={handleCreateUser}
      />
    </div>
  );
}
