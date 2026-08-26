import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { EventoAdministrativoForm } from '@/components/telecobranca/EventoAdministrativoForm';

/**
 * Registro de um evento administrativo (contato receptivo, e-mail, reabertura…).
 *
 * Antes este modal tinha duas abas e a primeira era o resultado de cobrança. Com
 * o resultado virando formulário fixo na ficha, a aba duplicava o mesmo
 * formulário em dois lugares — dava para registrar a mesma coisa por dois
 * caminhos, com estados diferentes. Ficou uma porta por tipo de registro:
 * resultado de cobrança na lateral, evento administrativo aqui.
 */

interface RegistrarEventoModalProps {
  aberto: boolean;
  onFechar: () => void;
  clienteId: string;
  clienteNome: string;
  onSucesso: () => void;
}

export function RegistrarContatoModal({
  aberto, onFechar, clienteId, clienteNome, onSucesso,
}: RegistrarEventoModalProps) {
  const concluir = () => {
    onSucesso();
    onFechar();
  };

  return (
    <Dialog open={aberto} onOpenChange={(v) => !v && onFechar()}>
      <DialogContent className="sm:max-w-[480px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Registrar evento</DialogTitle>
          <DialogDescription>
            Só entra no histórico do cliente. Para mover a régua de cobrança, use
            "Registrar" na coluna ao lado.
          </DialogDescription>
        </DialogHeader>

        <EventoAdministrativoForm
          clienteId={clienteId}
          clienteNome={clienteNome}
          onSucesso={concluir}
          onCancelar={onFechar}
        />
      </DialogContent>
    </Dialog>
  );
}
