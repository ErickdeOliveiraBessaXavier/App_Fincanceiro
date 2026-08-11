import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ResultadoCobrancaForm } from '@/components/telecobranca/ResultadoCobrancaForm';
import { EventoAdministrativoForm } from '@/components/telecobranca/EventoAdministrativoForm';

/**
 * Porta única para registrar algo que aconteceu com o cliente.
 *
 * Antes eram dois botões — "Registrar Resultado" e "Registrar Evento" — cuja
 * diferença o próprio código precisava explicar dentro do modal, e a sidebar
 * agrupava um deles sob "Controle Manual". Os dois registros continuam
 * distintos no banco (resultado de cobrança move a régua e agenda o retorno;
 * evento é administrativo), mas a escolha agora é visível no topo do formulário
 * em vez de ser uma decisão tomada antes de abrir qualquer coisa.
 */

interface RegistrarContatoModalProps {
  aberto: boolean;
  onFechar: () => void;
  clienteId: string;
  clienteNome: string;
  tituloId?: string;
  acordoId?: string;
  onSucesso: () => void;
}

type Aba = 'cobranca' | 'evento';

export function RegistrarContatoModal({
  aberto, onFechar, clienteId, clienteNome, tituloId, acordoId, onSucesso,
}: RegistrarContatoModalProps) {
  const [aba, setAba] = useState<Aba>('cobranca');

  const concluir = () => {
    onSucesso();
    onFechar();
  };

  return (
    <Dialog open={aberto} onOpenChange={(v) => !v && onFechar()}>
      <DialogContent className="sm:max-w-[540px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Registrar contato</DialogTitle>
          <DialogDescription>
            Escolha o tipo de registro. O resultado de cobrança agenda o próximo contato.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={aba} onValueChange={(v) => setAba(v as Aba)}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="cobranca">Resultado de cobrança</TabsTrigger>
            <TabsTrigger value="evento">Evento administrativo</TabsTrigger>
          </TabsList>

          <TabsContent value="cobranca" className="mt-0">
            <ResultadoCobrancaForm
              clienteId={clienteId}
              clienteNome={clienteNome}
              tituloId={tituloId}
              acordoId={acordoId}
              onSucesso={concluir}
              onCancelar={onFechar}
            />
          </TabsContent>

          <TabsContent value="evento" className="mt-0">
            <EventoAdministrativoForm
              clienteId={clienteId}
              clienteNome={clienteNome}
              onSucesso={concluir}
              onCancelar={onFechar}
            />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
