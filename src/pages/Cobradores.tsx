import { useState } from 'react';
import { Plus, Edit, Trash2, Users, Briefcase, Link2, Check, Copy, CheckCircle2 } from 'lucide-react';
import {
  useCobradores,
  useCreateCobrador,
  useUpdateCobrador,
  useDeleteCobrador,
  type CobradorRow,
} from '@/lib/queries/cobradores';
import { useGerarConvite } from '@/lib/queries/convites';
import { useUserRole } from '@/hooks/useUserRole';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';

const empty = { id: '', nome: '', email: '', telefone: '', ativo: true };

export default function Cobradores() {
  const { data: cobradores = [], isLoading } = useCobradores();
  const createMut = useCreateCobrador();
  const updateMut = useUpdateCobrador();
  const deleteMut = useDeleteCobrador();
  const gerarConvite = useGerarConvite();
  const { isAdmin, isLoading: roleLoading } = useUserRole();
  const { toast } = useToast();

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty);
  const isEditing = !!form.id;

  const [toDelete, setToDelete] = useState<CobradorRow | null>(null);

  // Link de convite gerado (para copiar e enviar ao cobrador).
  const [linkRep, setLinkRep] = useState<{ nome: string; url: string } | null>(null);
  const [copiado, setCopiado] = useState(false);

  const handleGerarLink = async (r: CobradorRow) => {
    try {
      const token = await gerarConvite.mutateAsync({ cobradorId: r.id, nomeSugerido: r.nome });
      const url = `${window.location.origin}/convite?token=${token}`;
      setCopiado(false);
      setLinkRep({ nome: r.nome, url });
    } catch (e: any) {
      toast({ title: 'Erro', description: e.message ?? 'Falha ao gerar o link', variant: 'destructive' });
    }
  };

  const copiarLink = async () => {
    if (!linkRep) return;
    try {
      await navigator.clipboard.writeText(linkRep.url);
      setCopiado(true);
    } catch {
      setCopiado(false);
    }
  };

  const openNew = () => { setForm(empty); setOpen(true); };
  const openEdit = (r: CobradorRow) => {
    setForm({ id: r.id, nome: r.nome, email: r.email ?? '', telefone: r.telefone ?? '', ativo: r.ativo });
    setOpen(true);
  };

  const handleSave = async () => {
    if (form.nome.trim().length < 2) {
      toast({ title: 'Nome obrigatório', description: 'Informe o nome do cobrador.', variant: 'destructive' });
      return;
    }
    try {
      if (isEditing) {
        await updateMut.mutateAsync({
          id: form.id, nome: form.nome.trim(),
          email: form.email.trim() || null, telefone: form.telefone.trim() || null, ativo: form.ativo,
        });
      } else {
        await createMut.mutateAsync({ nome: form.nome, email: form.email, telefone: form.telefone });
      }
      toast({ title: 'Salvo', description: `Cobrador ${isEditing ? 'atualizado' : 'criado'} com sucesso.` });
      setOpen(false);
    } catch (e: any) {
      toast({ title: 'Erro', description: e.message ?? 'Falha ao salvar', variant: 'destructive' });
    }
  };

  const toggleAtivo = async (r: CobradorRow) => {
    try {
      await updateMut.mutateAsync({ id: r.id, ativo: !r.ativo });
    } catch (e: any) {
      toast({ title: 'Erro', description: e.message ?? 'Falha', variant: 'destructive' });
    }
  };

  const handleDelete = async () => {
    if (!toDelete) return;
    try {
      // Se o cobrador tem um login vinculado, remove a conta de acesso junto —
      // senão sobraria um usuário órfão (e um operador sem carteira passa a ver
      // todos os dados da empresa pela RLS). A carteira de clientes é preservada.
      if (toDelete.user_id) {
        const { data, error } = await supabase.functions.invoke('excluir-usuario-empresa', {
          body: { user_id: toDelete.user_id },
        });
        if (error) throw error;
        if ((data as any)?.error) throw new Error((data as any).error);
      }
      await deleteMut.mutateAsync(toDelete.id);
      toast({ title: 'Excluído', description: `Cobrador ${toDelete.nome} excluído com sucesso.` });
      setToDelete(null);
    } catch (e: any) {
      toast({ title: 'Erro', description: e.message ?? 'Falha ao excluir', variant: 'destructive' });
    }
  };

  const totalCarteira = cobradores.reduce((s, r) => s + r.carteira, 0);
  const ativos = cobradores.filter((r) => r.ativo).length;

  if (roleLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary" />
      </div>
    );
  }
  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">Apenas administradores podem gerenciar cobradores.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Cobradores</h1>
          <p className="text-muted-foreground">Funcionários e suas carteiras de cobrança</p>
        </div>
        <Button onClick={openNew}><Plus className="mr-2 h-4 w-4" /> Novo Cobrador</Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold">{cobradores.length}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Ativos</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold text-green-600">{ativos}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Clientes em carteira</CardTitle>
            <Briefcase className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold">{totalCarteira}</div></CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Lista de Cobradores</CardTitle>
          <CardDescription>Cada cobrador administra a sua carteira de clientes</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex h-32 items-center justify-center">
              <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary" />
            </div>
          ) : cobradores.length === 0 ? (
            <p className="py-8 text-center text-muted-foreground">
              Nenhum cobrador ainda. Crie um, ou eles são criados automaticamente na importação de CSV.
            </p>
          ) : (
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Contato</TableHead>
                    <TableHead>Carteira</TableHead>
                    <TableHead>Ativo</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {cobradores.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">{r.nome}</TableCell>
                      <TableCell className="text-sm">
                        {r.email && <div>{r.email}</div>}
                        {r.telefone && <div className="text-muted-foreground">{r.telefone}</div>}
                        {!r.email && !r.telefone && <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">{r.carteira} cliente{r.carteira === 1 ? '' : 's'}</Badge>
                      </TableCell>
                      <TableCell>
                        <Switch checked={r.ativo} onCheckedChange={() => toggleAtivo(r)} />
                      </TableCell>
                      <TableCell className="text-right">
                        {isAdmin && (
                          r.user_id ? (
                            <Badge variant="outline" className="mr-1 gap-1 text-green-600 border-green-200">
                              <CheckCircle2 className="h-3 w-3" /> com acesso
                            </Badge>
                          ) : (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleGerarLink(r)}
                              disabled={gerarConvite.isPending}
                              title="Gerar link de acesso"
                            >
                              <Link2 className="h-4 w-4" />
                            </Button>
                          )
                        )}
                        <Button variant="ghost" size="sm" onClick={() => openEdit(r)}>
                          <Edit className="h-4 w-4" />
                        </Button>
                        {isAdmin && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive hover:text-destructive"
                            onClick={() => setToDelete(r)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{isEditing ? 'Editar cobrador' : 'Novo cobrador'}</DialogTitle>
            <DialogDescription>Dados do cobrador (carteira de cobrança).</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label htmlFor="rep-nome">Nome <span className="text-red-500">*</span></Label>
              <Input id="rep-nome" value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="rep-email">Email</Label>
                <Input id="rep-email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="rep-tel">Telefone</Label>
                <Input id="rep-tel" value={form.telefone} onChange={(e) => setForm({ ...form, telefone: e.target.value })} />
              </div>
            </div>
            {isEditing && (
              <div className="flex items-center gap-2">
                <Switch id="rep-ativo" checked={form.ativo} onCheckedChange={(v) => setForm({ ...form, ativo: v })} />
                <Label htmlFor="rep-ativo">Ativo</Label>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={createMut.isPending || updateMut.isPending}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar exclusão</DialogTitle>
            <DialogDescription>
              Tem certeza que deseja excluir o cobrador <strong>{toDelete?.nome}</strong>?
              {toDelete?.user_id && (
                <> O <strong>login de acesso</strong> vinculado a este cobrador também será excluído.</>
              )}
              {(toDelete?.carteira ?? 0) > 0 && (
                <> Os {toDelete?.carteira} cliente{toDelete?.carteira === 1 ? '' : 's'} da carteira
                  não serão apagados, apenas ficarão sem cobrador.</>
              )}
              {' '}Esta ação não pode ser desfeita.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setToDelete(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleteMut.isPending}>
              Excluir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!linkRep} onOpenChange={(o) => !o && setLinkRep(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Link de acesso gerado</DialogTitle>
            <DialogDescription>
              Envie este link para <strong>{linkRep?.nome}</strong> (WhatsApp, e-mail, etc.). Ele vai
              criar a própria senha. Depois disso, você autoriza o acesso na tela de Usuários.
              O link expira em 7 dias.
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-2">
            <Input readOnly value={linkRep?.url ?? ''} className="font-mono text-xs" onFocus={(e) => e.target.select()} />
            <Button variant="outline" size="icon" onClick={copiarLink} title="Copiar link">
              {copiado ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
            </Button>
          </div>
          <DialogFooter>
            <Button onClick={() => setLinkRep(null)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
