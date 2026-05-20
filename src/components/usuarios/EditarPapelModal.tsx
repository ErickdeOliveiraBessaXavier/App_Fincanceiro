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
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { useQueryClient } from '@tanstack/react-query';
import type { AppRole } from '@/hooks/useUserRole';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  usuario: { user_id: string; nome: string; email: string; role: AppRole | null };
  onSaved: () => void;
}

export function EditarPapelModal({ open, onOpenChange, usuario, onSaved }: Props) {
  const [novoPapel, setNovoPapel] = useState<AppRole>(usuario.role ?? 'operador');
  const [saving, setSaving] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const { toast } = useToast();
  const { user } = useAuth();
  const qc = useQueryClient();

  const isSelf = user?.id === usuario.user_id;
  const reduzindoSelf = isSelf && usuario.role === 'admin' && novoPapel !== 'admin';

  const handleSave = async () => {
    setSaving(true);
    try {
      const { error: delErr } = await supabase
        .from('user_roles').delete().eq('user_id', usuario.user_id);
      if (delErr) throw delErr;
      const { error: insErr } = await supabase
        .from('user_roles').insert({ user_id: usuario.user_id, role: novoPapel });
      if (insErr) throw insErr;

      toast({ title: 'Papel atualizado', description: `${usuario.nome} agora é ${novoPapel}.` });
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
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Alterar papel do usuário</DialogTitle>
            <DialogDescription>
              {usuario.nome} ({usuario.email})
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Label>Papel</Label>
            <Select value={novoPapel} onValueChange={(v) => setNovoPapel(v as AppRole)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="operador">Operador</SelectItem>
                <SelectItem value="gerente">Gerente</SelectItem>
                <SelectItem value="admin">Administrador</SelectItem>
              </SelectContent>
            </Select>
            {reduzindoSelf && (
              <p className="text-sm text-destructive">
                Você não pode reduzir seu próprio papel de administrador.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button
              onClick={() => setConfirmOpen(true)}
              disabled={saving || reduzindoSelf || novoPapel === usuario.role}
            >
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar alteração de papel</AlertDialogTitle>
            <AlertDialogDescription>
              Alterar papel de <strong>{usuario.nome}</strong> de{' '}
              <strong>{usuario.role ?? 'sem papel'}</strong> para <strong>{novoPapel}</strong>?
              Esta ação será registrada no log de auditoria.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleSave} disabled={saving}>
              {saving ? 'Salvando...' : 'Confirmar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
