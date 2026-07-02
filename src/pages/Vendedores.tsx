import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '@/components/PageHeader';
import { Plus, Edit, Trash2, Users, Briefcase, Link2, Check, Copy, CheckCircle2 } from 'lucide-react';
import {
  useVendedores,
  useCreateVendedor,
  useUpdateVendedor,
  useDeleteVendedor,
  type VendedorRow,
} from '@/lib/queries/vendedores';
import { useGerarConvite } from '@/lib/queries/convites';
import { useUserRole } from '@/hooks/useUserRole';
import { usePagination } from '@/hooks/usePagination';
import { TablePagination } from '@/components/TablePagination';
import { supabase } from '@/integrations/supabase/client';
import { formatTelefone } from '@/utils/format';
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

// ===================== Subcomponentes =====================
interface VendedoresTableCardProps {
  vendedores: VendedorRow[];
  isLoading: boolean;
  isAdmin: boolean;
  gerando: boolean;
  onGerarLink: (r: VendedorRow) => void;
  onEdit: (r: VendedorRow) => void;
  onDelete: (r: VendedorRow) => void;
  onToggle: (r: VendedorRow) => void;
  onVerCarteira: (r: VendedorRow) => void;
}
function VendedoresTableCard({
  vendedores, isLoading, isAdmin, gerando, onGerarLink, onEdit, onDelete, onToggle, onVerCarteira,
}: VendedoresTableCardProps) {
  const pagination = usePagination(vendedores, 25);
  return (
    <Card className="border-none shadow-card rounded-2xl overflow-hidden">
      <CardHeader className="pb-4 border-b border-border/50 bg-muted/20">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-xl font-bold tracking-tight">Lista de Vendedores</CardTitle>
            <CardDescription className="text-xs font-medium">Cada vendedor administra a sua carteira de vendas</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-6">
        {isLoading ? (
          <div className="flex h-32 items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary" />
          </div>
        ) : vendedores.length === 0 ? (
          <div className="text-center py-10 bg-muted/5 rounded-xl border border-dashed border-border/60">
            <p className="text-sm font-bold text-muted-foreground uppercase tracking-widest">Nenhum vendedor registrado</p>
            <p className="text-xs text-muted-foreground mt-1 font-medium">Eles são criados automaticamente na importação de CSV.</p>
          </div>
        ) : (
          <div className="rounded-xl border border-border/50 overflow-hidden">
            <Table>
              <TableHeader className="bg-muted/30">
                <TableRow>
                  <TableHead className="text-[10px] font-bold uppercase tracking-widest">Nome</TableHead>
                  <TableHead className="text-[10px] font-bold uppercase tracking-widest">Contato</TableHead>
                  <TableHead className="text-[10px] font-bold uppercase tracking-widest">Carteira</TableHead>
                  <TableHead className="text-[10px] font-bold uppercase tracking-widest">Ativo</TableHead>
                  <TableHead className="text-right text-[10px] font-bold uppercase tracking-widest">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pagination.pageItems.map((r) => (
                  <TableRow key={r.id} className="hover:bg-muted/10 transition-colors">
                    <TableCell className="font-bold text-sm text-foreground">{r.nome}</TableCell>
                    <TableCell>
                      <div className="text-xs space-y-1">
                        {r.email && <div className="font-bold text-foreground">{r.email}</div>}
                        {r.telefone && <div className="text-muted-foreground font-medium">{formatTelefone(r.telefone)}</div>}
                      </div>
                    </TableCell>
                    <TableCell>
                      {r.carteira > 0 ? (
                        <button
                          type="button"
                          onClick={() => onVerCarteira(r)}
                          title="Ver clientes desta carteira"
                        >
                          <Badge variant="secondary" className="rounded-lg font-bold text-[10px] uppercase tracking-wider cursor-pointer hover:bg-primary/10 transition-colors">
                            {r.carteira} clientes
                          </Badge>
                        </button>
                      ) : (
                        <Badge variant="outline" className="rounded-lg font-bold text-[10px] uppercase tracking-wider text-muted-foreground">
                          0 clientes
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <Switch checked={r.ativo} onCheckedChange={() => onToggle(r)} />
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        {isAdmin && (
                          r.user_id ? (
                            <Badge variant="outline" className="mr-1 gap-1 text-green-600 border-green-200 bg-green-50/50">
                              <CheckCircle2 className="h-3 w-3" /> com acesso
                            </Badge>
                          ) : (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => onGerarLink(r)}
                              disabled={gerando}
                              className="h-8 w-8 p-0 rounded-lg hover:bg-primary/5"
                              title="Gerar link de acesso"
                            >
                              <Link2 className="h-4 w-4" />
                            </Button>
                          )
                        )}
                        <Button variant="ghost" size="sm" onClick={() => onEdit(r)} className="h-8 w-8 p-0 rounded-lg hover:bg-primary/5">
                          <Edit className="h-4 w-4" />
                        </Button>
                        {isAdmin && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0 rounded-lg text-destructive hover:text-destructive hover:bg-destructive/5"
                            onClick={() => onDelete(r)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <TablePagination pagination={pagination} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

interface DeleteVendedorDialogProps {
  toDelete: VendedorRow | null;
  onCancel: () => void;
  onConfirm: () => void;
  isPending: boolean;
}
function DeleteVendedorDialog({ toDelete, onCancel, onConfirm, isPending }: DeleteVendedorDialogProps) {
  const carteira = toDelete?.carteira ?? 0;
  return (
    <Dialog open={!!toDelete} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Confirmar exclusão</DialogTitle>
          <DialogDescription>
            Tem certeza que deseja excluir o vendedor <strong>{toDelete?.nome}</strong>?
            {toDelete?.user_id && (
              <> O <strong>login de acesso</strong> vinculado a este vendedor também será excluído.</>
            )}
            {carteira > 0 && (
              <> Os {carteira} cliente{carteira === 1 ? '' : 's'} da carteira
                não serão apagados, apenas ficarão sem vendedor.</>
            )}
            {' '}Esta ação não pode ser desfeita.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={onCancel}>Cancelar</Button>
          <Button variant="destructive" onClick={onConfirm} disabled={isPending}>
            Excluir
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface LinkConviteDialogProps {
  linkRep: { nome: string; url: string } | null;
  copiado: boolean;
  onCopy: () => void;
  onClose: () => void;
}
function LinkConviteDialog({ linkRep, copiado, onCopy, onClose }: LinkConviteDialogProps) {
  return (
    <Dialog open={!!linkRep} onOpenChange={(o) => !o && onClose()}>
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
          <Button variant="outline" size="icon" onClick={onCopy} title="Copiar link">
            {copiado ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
          </Button>
        </div>
        <DialogFooter>
          <Button onClick={onClose}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function Vendedores() {
  const { data: vendedores = [], isLoading } = useVendedores();
  const createMut = useCreateVendedor();
  const updateMut = useUpdateVendedor();
  const deleteMut = useDeleteVendedor();
  const gerarConvite = useGerarConvite();
  const { isAdmin, isLoading: roleLoading } = useUserRole();
  const { toast } = useToast();
  const navigate = useNavigate();

  // Drill-down: abre a tela de Clientes já filtrada pela carteira do vendedor.
  const verCarteira = (r: VendedorRow) => navigate(`/clientes?vendedor=${r.id}`);

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty);
  const isEditing = !!form.id;

  const [toDelete, setToDelete] = useState<VendedorRow | null>(null);

  // Link de convite gerado (para copiar e enviar ao vendedor).
  const [linkRep, setLinkRep] = useState<{ nome: string; url: string } | null>(null);
  const [copiado, setCopiado] = useState(false);

  const handleGerarLink = async (r: VendedorRow) => {
    try {
      const token = await gerarConvite.mutateAsync({ vendedorId: r.id, nomeSugerido: r.nome });
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
  const openEdit = (r: VendedorRow) => {
    setForm({ id: r.id, nome: r.nome, email: r.email ?? '', telefone: r.telefone ?? '', ativo: r.ativo });
    setOpen(true);
  };

  const handleSave = async () => {
    if (form.nome.trim().length < 2) {
      toast({ title: 'Nome obrigatório', description: 'Informe o nome do vendedor.', variant: 'destructive' });
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
      toast({ title: 'Salvo', description: `Vendedor ${isEditing ? 'atualizado' : 'criado'} com sucesso.` });
      setOpen(false);
    } catch (e: any) {
      toast({ title: 'Erro', description: e.message ?? 'Falha ao salvar', variant: 'destructive' });
    }
  };

  const toggleAtivo = async (r: VendedorRow) => {
    try {
      await updateMut.mutateAsync({ id: r.id, ativo: !r.ativo });
    } catch (e: any) {
      toast({ title: 'Erro', description: e.message ?? 'Falha', variant: 'destructive' });
    }
  };

  const handleDelete = async () => {
    if (!toDelete) return;
    try {
      // Se o vendedor tem um login vinculado, remove a conta de acesso junto —
      // senão sobraria um usuário órfão. A carteira de clientes é preservada.
      if (toDelete.user_id) {
        const { data, error } = await supabase.functions.invoke('excluir-usuario-empresa', {
          body: { user_id: toDelete.user_id },
        });
        if (error) throw error;
        if ((data as any)?.error) throw new Error((data as any).error);
      }
      await deleteMut.mutateAsync(toDelete.id);
      toast({ title: 'Excluído', description: `Vendedor ${toDelete.nome} excluído com sucesso.` });
      setToDelete(null);
    } catch (e: any) {
      toast({ title: 'Erro', description: e.message ?? 'Falha ao excluir', variant: 'destructive' });
    }
  };

  const totalCarteira = vendedores.reduce((s, r) => s + r.carteira, 0);
  const ativos = vendedores.filter((r) => r.ativo).length;

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
        <p className="text-muted-foreground">Apenas administradores podem gerenciar vendedores.</p>
      </div>
    );
  }

  return (
    <div className="space-y-10 animate-fade-in pb-10">
      <PageHeader
        title="Vendedores"
        description="Equipe comercial e histórico de originação de vendas."
      >
        <Button 
          onClick={openNew}
        >
          <Plus className="mr-2 h-4 w-4" /> 
          Novo Vendedor
        </Button>
      </PageHeader>

      <div className="grid gap-6 grid-cols-1 sm:grid-cols-3">
        <Card className="border-none shadow-card rounded-2xl overflow-hidden group">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Total</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground group-hover:scale-110 transition-transform" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-black tracking-tighter">{vendedores.length}</div>
          </CardContent>
        </Card>
        <Card className="border-none shadow-card rounded-2xl overflow-hidden group">
          <div className="absolute inset-0 bg-gradient-to-br from-success/5 to-transparent pointer-events-none" />
          <CardHeader className="pb-2 relative z-10">
            <CardTitle className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Ativos</CardTitle>
          </CardHeader>
          <CardContent className="relative z-10">
            <div className="text-2xl font-black tracking-tighter text-success">{ativos}</div>
          </CardContent>
        </Card>
        <Card className="border-none shadow-card rounded-2xl overflow-hidden group">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent pointer-events-none" />
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 relative z-10">
            <CardTitle className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Clientes em carteira</CardTitle>
            <Briefcase className="h-4 w-4 text-primary group-hover:scale-110 transition-transform" />
          </CardHeader>
          <CardContent className="relative z-10">
            <div className="text-2xl font-black tracking-tighter">{totalCarteira}</div>
          </CardContent>
        </Card>
      </div>

      <VendedoresTableCard
        vendedores={vendedores}
        isLoading={isLoading}
        isAdmin={isAdmin}
        gerando={gerarConvite.isPending}
        onGerarLink={handleGerarLink}
        onEdit={openEdit}
        onDelete={setToDelete}
        onToggle={toggleAtivo}
        onVerCarteira={verCarteira}
      />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{isEditing ? 'Editar vendedor' : 'Novo vendedor'}</DialogTitle>
            <DialogDescription>Dados do vendedor (carteira de vendas).</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label htmlFor="vend-nome">Nome <span className="text-red-500">*</span></Label>
              <Input id="vend-nome" value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="vend-email">Email</Label>
                <Input id="vend-email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="vend-tel">Telefone</Label>
                <Input id="vend-tel" value={form.telefone} onChange={(e) => setForm({ ...form, telefone: e.target.value })} />
              </div>
            </div>
            {isEditing && (
              <div className="flex items-center gap-2">
                <Switch id="vend-ativo" checked={form.ativo} onCheckedChange={(v) => setForm({ ...form, ativo: v })} />
                <Label htmlFor="vend-ativo">Ativo</Label>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={createMut.isPending || updateMut.isPending}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <DeleteVendedorDialog
        toDelete={toDelete}
        onCancel={() => setToDelete(null)}
        onConfirm={handleDelete}
        isPending={deleteMut.isPending}
      />

      <LinkConviteDialog
        linkRep={linkRep}
        copiado={copiado}
        onCopy={copiarLink}
        onClose={() => setLinkRep(null)}
      />
    </div>
  );
}
