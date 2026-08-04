import { useEffect, useState } from 'react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AlertTriangle } from 'lucide-react';

interface ConfirmarAcaoDestrutivaProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  titulo: string;
  /** O que exatamente vai acontecer. Seja concreto: o usuário decide por aqui. */
  descricao: React.ReactNode;
  /** Rótulo do botão que executa. Ex.: 'Excluir definitivamente'. */
  rotuloConfirmar: string;
  onConfirm: () => void;
  isPending?: boolean;
  /**
   * Exigido para o que não tem volta (hard delete, exclusão em massa): o usuário
   * precisa digitar este texto para liberar o botão. Omitir = confirmação
   * simples, suficiente para ações reversíveis como cancelamento.
   */
  textoConfirmacao?: string;
}

/**
 * Confirmação de ação destrutiva em dois níveis.
 *
 * O nível é escolhido por quem chama, via `textoConfirmacao`: sem ele o usuário
 * só clica; com ele precisa digitar o texto exato antes de o botão habilitar.
 * Use a digitação quando a ação for irreversível ou atingir vários registros.
 */
export function ConfirmarAcaoDestrutiva({
  open, onOpenChange, titulo, descricao, rotuloConfirmar, onConfirm, isPending, textoConfirmacao,
}: ConfirmarAcaoDestrutivaProps) {
  const [digitado, setDigitado] = useState('');

  // Reabrir o modal não pode herdar o texto já digitado da vez anterior, senão a
  // segunda exclusão sai com um clique só.
  useEffect(() => {
    if (open) setDigitado('');
  }, [open]);

  const precisaDigitar = !!textoConfirmacao;
  const liberado = !precisaDigitar || digitado.trim() === textoConfirmacao.trim();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            {titulo}
          </DialogTitle>
          <DialogDescription asChild>
            <div className="space-y-2">{descricao}</div>
          </DialogDescription>
        </DialogHeader>

        {precisaDigitar && (
          <div className="grid gap-2 py-2">
            <p className="text-sm text-muted-foreground">
              Para confirmar, digite <strong>{textoConfirmacao}</strong>
            </p>
            <Input
              value={digitado}
              onChange={(e) => setDigitado(e.target.value)}
              placeholder={textoConfirmacao}
              autoComplete="off"
            />
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={isPending}>
            Cancelar
          </Button>
          <Button variant="destructive" onClick={onConfirm} disabled={isPending || !liberado}>
            {isPending ? 'Processando...' : rotuloConfirmar}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default ConfirmarAcaoDestrutiva;
