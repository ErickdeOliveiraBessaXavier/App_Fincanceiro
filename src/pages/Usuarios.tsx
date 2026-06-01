import { useState, useEffect } from 'react';
import { Search, Edit, Shield, User, UserCog, Clock, Check, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { EditarPapelModal } from '@/components/usuarios/EditarPapelModal';
import { useUserRole, type AppRole } from '@/hooks/useUserRole';
import { useRepresentantes, representantesKeys } from '@/lib/queries/representantes';
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

export default function Usuarios() {
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [editTarget, setEditTarget] = useState<Usuario | null>(null);
  const { toast } = useToast();
  const { isAdmin } = useUserRole();
  const { data: representantes = [] } = useRepresentantes();
  const { data: pendentes = [] } = usePendingConvites();
  const autorizarMut = useAutorizarConvite();
  const revogarMut = useRevogarConvite();
  const qc = useQueryClient();

  const handleAutorizar = async (c: ConvitePendente) => {
    try {
      await autorizarMut.mutateAsync(c);
      toast({ title: 'Acesso autorizado', description: `${c.nome ?? 'Representante'} já pode entrar no sistema.` });
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

  const emptyNovo = { nome: '', email: '', senha: '', tipo: 'representante' as 'representante' | 'admin', representante_id: '' };
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [novoUser, setNovoUser] = useState(emptyNovo);

  const handleCreateUser = async () => {
    if (!novoUser.nome.trim() || !novoUser.email.trim() || novoUser.senha.length < 6) {
      toast({ title: 'Dados incompletos', description: 'Preencha nome, e-mail e senha (mín. 6 caracteres).', variant: 'destructive' });
      return;
    }
    setCreating(true);
    try {
      const isRep = novoUser.tipo === 'representante';
      const { data, error } = await supabase.functions.invoke('criar-usuario-empresa', {
        body: {
          nome: novoUser.nome.trim(),
          email: novoUser.email.trim(),
          senha: novoUser.senha,
          role: isRep ? 'operador' : 'admin',
          as_representante: isRep,
          representante_id: isRep ? (novoUser.representante_id || undefined) : undefined,
        },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);

      toast({ title: 'Usuário criado', description: `${novoUser.nome} foi adicionado à empresa.` });
      setCreateOpen(false);
      setNovoUser(emptyNovo);
      fetchUsuarios();
      qc.invalidateQueries({ queryKey: representantesKeys.all });
    } catch (e: any) {
      toast({ title: 'Erro ao criar usuário', description: e.message ?? 'Falha desconhecida', variant: 'destructive' });
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
    if (role === 'operador') return { cls: 'bg-blue-100 text-blue-800', icon: <UserCog className="h-4 w-4" />, label: 'representante' };
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
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Usuários</h1>
          <p className="text-muted-foreground">Gerencie os usuários e papéis da sua empresa</p>
        </div>
        {isAdmin && (
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="mr-2 h-4 w-4" /> Novo Usuário
          </Button>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total</CardTitle>
            <User className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold">{usuarios.length}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Administradores</CardTitle>
            <Shield className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold">{count('admin')}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Representantes</CardTitle>
            <UserCog className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold">{count('operador')}</div></CardContent>
        </Card>
      </div>

      {isAdmin && pendentes.length > 0 && (
        <Card className="border-amber-200">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-amber-600" />
              Aguardando autorização
              <Badge className="bg-amber-100 text-amber-800">{pendentes.length}</Badge>
            </CardTitle>
            <CardDescription>
              Representantes que se cadastraram pelo link e precisam da sua liberação para acessar.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Carteira</TableHead>
                    <TableHead>Cadastrado em</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pendentes.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="font-medium">{c.nome ?? '—'}</TableCell>
                      <TableCell>{c.email ?? '—'}</TableCell>
                      <TableCell>{c.representante_nome ?? '—'}</TableCell>
                      <TableCell>{formatDate(c.created_at)}</TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          className="mr-2 gap-1"
                          onClick={() => handleAutorizar(c)}
                          disabled={autorizarMut.isPending || revogarMut.isPending}
                        >
                          <Check className="h-4 w-4" /> Autorizar
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="gap-1 text-destructive hover:text-destructive"
                          onClick={() => handleRecusar(c)}
                          disabled={autorizarMut.isPending || revogarMut.isPending}
                        >
                          <X className="h-4 w-4" /> Recusar
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Lista de Usuários</CardTitle>
          <CardDescription>Usuários cadastrados no sistema</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4 mb-6">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground h-4 w-4" />
              <Input
                placeholder="Buscar por nome, email ou função..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>

          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Função</TableHead>
                  <TableHead>Cadastrado em</TableHead>
                  <TableHead>Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((u) => {
                  const b = roleBadge(u.role);
                  return (
                    <TableRow key={u.id}>
                      <TableCell className="font-medium">{u.nome}</TableCell>
                      <TableCell>{u.email}</TableCell>
                      <TableCell>
                        <Badge className={b.cls}>
                          <div className="flex items-center gap-1">
                            {b.icon}
                            <span className="capitalize">{b.label}</span>
                          </div>
                        </Badge>
                      </TableCell>
                      <TableCell>{formatDate(u.created_at)}</TableCell>
                      <TableCell>
                        <Button variant="ghost" size="sm" onClick={() => setEditTarget(u)}>
                          <Edit className="h-4 w-4" />
                        </Button>
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

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo usuário</DialogTitle>
            <DialogDescription>Crie um usuário para a sua empresa e defina o papel.</DialogDescription>
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
            <div className="grid gap-2">
              <Label htmlFor="nu-tipo">Tipo de acesso</Label>
              <select
                id="nu-tipo"
                value={novoUser.tipo}
                onChange={(e) => setNovoUser({ ...novoUser, tipo: e.target.value as 'representante' | 'admin' })}
                className="px-3 py-2 border border-input rounded-md bg-background"
              >
                <option value="representante">Representante (vê só a carteira dele)</option>
                <option value="admin">Administrador (vê e gerencia tudo da empresa)</option>
              </select>
            </div>
            {novoUser.tipo === 'representante' && (
              <div className="grid gap-2">
                <Label htmlFor="nu-repsel">Carteira</Label>
                <select
                  id="nu-repsel"
                  value={novoUser.representante_id}
                  onChange={(e) => setNovoUser({ ...novoUser, representante_id: e.target.value })}
                  className="px-3 py-2 border border-input rounded-md bg-background"
                >
                  <option value="">Criar nova carteira com este nome</option>
                  {representantes.map((r) => (
                    <option key={r.id} value={r.id}>Usar carteira de {r.nome}</option>
                  ))}
                </select>
                <p className="text-xs text-muted-foreground">
                  O representante só enxerga os clientes da sua carteira.
                </p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={creating}>Cancelar</Button>
            <Button onClick={handleCreateUser} disabled={creating}>{creating ? 'Criando...' : 'Criar usuário'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
