import { useState } from 'react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { AppRole } from '@/hooks/useUserRole';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  usuario: { user_id: string; nome: string; email: string; role: AppRole | null };
  onSaved: () => void;
}

// Este modal só PROMOVE/REBAIXA administrador. O vínculo de cobrador/vendedor
// vem exclusivamente do convite por link (páginas Cobradores/Vendedores), então
// não atribuímos um papel de carteira a quem não tem carteira — isso evitaria um
// usuário órfão que, pela RLS, enxergaria todos os dados da empresa.

type Carteira = { cobrador: boolean; vendedor: boolean };

// Papel/rótulo de carteira para onde o usuário volta ao perder o admin.
function carteiraInfo(carteira: Carteira | undefined) {
  const baseRole: AppRole = carteira?.vendedor ? 'vendedor' : 'operador';
  const baseLabel = carteira?.vendedor ? 'vendedor' : 'cobrador';
  const temCarteira = carteira ? carteira.cobrador || carteira.vendedor : undefined;
  return { baseRole, baseLabel, temCarteira };
}

interface EditarPapelDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  usuario: Props['usuario'];
  baseLabel: string;
  admin: boolean;
  setAdmin: (v: boolean) => void;
  saving: boolean;
  reduzindoSelf: boolean;
  rebaixandoSemCarteira: boolean;
  semMudanca: boolean;
  onSaveClick: () => void;
}
function EditarPapelDialog({
  open, onOpenChange, usuario, baseLabel, admin, setAdmin,
  saving, reduzindoSelf, rebaixandoSemCarteira, semMudanca, onSaveClick,
}: EditarPapelDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Permissão de administrador</DialogTitle>
          <DialogDescription>
            {usuario.nome} ({usuario.email})
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="flex items-center justify-between gap-4 rounded-lg border p-3">
            <div>
              <Label htmlFor="ep-admin">Administrador da empresa</Label>
              <p className="text-xs text-muted-foreground">
                Admin vê e gerencia tudo. Sem isso, atua como {baseLabel} (só a carteira dele).
              </p>
            </div>
            <Switch
              id="ep-admin"
              checked={admin}
              onCheckedChange={setAdmin}
              disabled={saving || reduzindoSelf}
            />
          </div>
          {reduzindoSelf && (
            <p className="text-sm text-destructive">
              Você não pode remover o seu próprio acesso de administrador.
            </p>
          )}
          {rebaixandoSemCarteira && (
            <p className="text-sm text-destructive">
              Este usuário não tem carteira de cobrador nem de vendedor, então não pode ser rebaixado aqui.
              Para remover o acesso dele, exclua o usuário.
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button
            onClick={onSaveClick}
            disabled={saving || reduzindoSelf || rebaixandoSemCarteira || semMudanca}
          >
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface ConfirmarPapelDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  admin: boolean;
  usuario: Props['usuario'];
  baseLabel: string;
  saving: boolean;
  onConfirm: () => void;
}
function ConfirmarPapelDialog({ open, onOpenChange, admin, usuario, baseLabel, saving, onConfirm }: ConfirmarPapelDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Confirmar alteração</AlertDialogTitle>
          <AlertDialogDescription>
            {admin
              ? <>Tornar <strong>{usuario.nome}</strong> administrador (acesso total à empresa)?</>
              : <>Remover o acesso de administrador de <strong>{usuario.nome}</strong>? Ele voltará a atuar como {baseLabel}, vendo apenas a carteira dele.</>}
            {' '}Esta ação será registrada no log de auditoria.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={saving}>Cancelar</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm} disabled={saving}>
            {saving ? 'Salvando...' : 'Confirmar'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function EditarPapelModal({ open, onOpenChange, usuario, onSaved }: Props) {
  const [admin, setAdmin] = useState(usuario.role === 'admin');
  const [saving, setSaving] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const { toast } = useToast();
  const { user, companyId } = useAuth();
  const qc = useQueryClient();

  // O usuário tem carteira (cobrança ou vendas) vinculada? Se não tiver, não pode
  // ser rebaixado para um papel de carteira (viraria órfão) — nesse caso, exclua-o.
  // O tipo da carteira define para qual papel ele volta ao perder o admin.
  const { data: carteira } = useQuery({
    queryKey: ['carteira-by-user', usuario.user_id],
    enabled: open,
    queryFn: async () => {
      const [{ count: cobCount }, { count: venCount }] = await Promise.all([
        supabase.from('cobradores').select('id', { count: 'exact', head: true })
          .eq('user_id', usuario.user_id).is('deleted_at', null),
        supabase.from('vendedores').select('id', { count: 'exact', head: true })
          .eq('user_id', usuario.user_id).is('deleted_at', null),
      ]);
      return { cobrador: (cobCount ?? 0) > 0, vendedor: (venCount ?? 0) > 0 };
    },
  });

  // Papel de carteira para onde o usuário volta ao perder o admin.
  const { baseRole, baseLabel, temCarteira } = carteiraInfo(carteira);

  const isSelf = user?.id === usuario.user_id;
  const novoPapel: AppRole = admin ? 'admin' : baseRole;
  const reduzindoSelf = isSelf && usuario.role === 'admin' && !admin;
  const rebaixandoSemCarteira = usuario.role === 'admin' && !admin && temCarteira === false;
  const semMudanca = novoPapel === usuario.role;

  const handleSave = async () => {
    setSaving(true);
    try {
      const { error: delErr } = await supabase
        .from('user_roles').delete().eq('user_id', usuario.user_id);
      if (delErr) throw delErr;
      const { error: insErr } = await supabase
        .from('user_roles').insert({ user_id: usuario.user_id, role: novoPapel, company_id: companyId });
      if (insErr) throw insErr;

      toast({
        title: 'Permissão atualizada',
        description: admin
          ? `${usuario.nome} agora é administrador.`
          : `${usuario.nome} voltou a ser ${baseLabel}.`,
      });
      qc.invalidateQueries({ queryKey: ['user-roles', usuario.user_id] });
      onSaved();
      onOpenChange(false);
    } catch (e: any) {
      toast({
        title: 'Erro ao atualizar',
        description: e.message ?? 'Falha desconhecida',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
      setConfirmOpen(false);
    }
  };

  return (
    <>
      <EditarPapelDialog
        open={open}
        onOpenChange={onOpenChange}
        usuario={usuario}
        baseLabel={baseLabel}
        admin={admin}
        setAdmin={setAdmin}
        saving={saving}
        reduzindoSelf={reduzindoSelf}
        rebaixandoSemCarteira={rebaixandoSemCarteira}
        semMudanca={semMudanca}
        onSaveClick={() => setConfirmOpen(true)}
      />

      <ConfirmarPapelDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        admin={admin}
        usuario={usuario}
        baseLabel={baseLabel}
        saving={saving}
        onConfirm={handleSave}
      />
    </>
  );
}
