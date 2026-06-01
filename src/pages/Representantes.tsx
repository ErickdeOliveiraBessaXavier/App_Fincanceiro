import { useState } from 'react';
import { Plus, Edit, Users, Briefcase } from 'lucide-react';
import {
  useRepresentantes,
  useCreateRepresentante,
  useUpdateRepresentante,
  type RepresentanteRow,
} from '@/lib/queries/representantes';
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

export default function Representantes() {
  const { data: representantes = [], isLoading } = useRepresentantes();
  const createMut = useCreateRepresentante();
  const updateMut = useUpdateRepresentante();
  const { toast } = useToast();

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty);
  const isEditing = !!form.id;

  const openNew = () => { setForm(empty); setOpen(true); };
  const openEdit = (r: RepresentanteRow) => {
    setForm({ id: r.id, nome: r.nome, email: r.email ?? '', telefone: r.telefone ?? '', ativo: r.ativo });
    setOpen(true);
  };

  const handleSave = async () => {
    if (form.nome.trim().length < 2) {
      toast({ title: 'Nome obrigatório', description: 'Informe o nome do representante.', variant: 'destructive' });
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
      toast({ title: 'Salvo', description: `Representante ${isEditing ? 'atualizado' : 'criado'} com sucesso.` });
      setOpen(false);
    } catch (e: any) {
      toast({ title: 'Erro', description: e.message ?? 'Falha ao salvar', variant: 'destructive' });
    }
  };

  const toggleAtivo = async (r: RepresentanteRow) => {
    try {
      await updateMut.mutateAsync({ id: r.id, ativo: !r.ativo });
    } catch (e: any) {
      toast({ title: 'Erro', description: e.message ?? 'Falha', variant: 'destructive' });
    }
  };

  const totalCarteira = representantes.reduce((s, r) => s + r.carteira, 0);
  const ativos = representantes.filter((r) => r.ativo).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Representantes</h1>
          <p className="text-muted-foreground">Funcionários e suas carteiras de cobrança</p>
        </div>
        <Button onClick={openNew}><Plus className="mr-2 h-4 w-4" /> Novo Representante</Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold">{representantes.length}</div></CardContent>
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
          <CardTitle>Lista de Representantes</CardTitle>
          <CardDescription>Cada representante administra a sua carteira de clientes</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex h-32 items-center justify-center">
              <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary" />
            </div>
          ) : representantes.length === 0 ? (
            <p className="py-8 text-center text-muted-foreground">
              Nenhum representante ainda. Crie um, ou eles são criados automaticamente na importação de CSV.
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
                  {representantes.map((r) => (
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
                        <Button variant="ghost" size="sm" onClick={() => openEdit(r)}>
                          <Edit className="h-4 w-4" />
                        </Button>
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
            <DialogTitle>{isEditing ? 'Editar representante' : 'Novo representante'}</DialogTitle>
            <DialogDescription>Dados do representante (carteira de cobrança).</DialogDescription>
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
    </div>
  );
}
