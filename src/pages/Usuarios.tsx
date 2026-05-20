import { useState, useEffect } from 'react';
import { Search, Edit, Shield, User, UserCog } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { EditarPapelModal } from '@/components/usuarios/EditarPapelModal';
import type { AppRole } from '@/hooks/useUserRole';

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
    if (role === 'admin') return { cls: 'bg-red-100 text-red-800', icon: <Shield className="h-4 w-4" />, label: 'admin' };
    if (role === 'gerente') return { cls: 'bg-amber-100 text-amber-800', icon: <UserCog className="h-4 w-4" />, label: 'gerente' };
    if (role === 'operador') return { cls: 'bg-blue-100 text-blue-800', icon: <User className="h-4 w-4" />, label: 'operador' };
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
      <div>
        <h1 className="text-2xl font-bold">Usuários</h1>
        <p className="text-muted-foreground">Gerencie os papéis dos usuários do sistema</p>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
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
            <CardTitle className="text-sm font-medium">Gerentes</CardTitle>
            <UserCog className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold">{count('gerente')}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Operadores</CardTitle>
            <User className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold">{count('operador')}</div></CardContent>
        </Card>
      </div>

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
    </div>
  );
}
