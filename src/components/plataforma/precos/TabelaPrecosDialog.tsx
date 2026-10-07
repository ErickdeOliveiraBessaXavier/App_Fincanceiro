import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CarregandoSecao } from '@/components/TelaCarregamento';
import { usePlanos } from '@/lib/queries/planos';
import { AbaPlanos } from './AbaPlanos';
import { AbaExcedente } from './AbaExcedente';
import { planoDeTopo } from '@/domain/precificacao';
import { AbaSimulador, type EmpresaSimulavel } from './AbaSimulador';

/**
 * Central de preços da plataforma: preço de cada plano, regra acima do plano
 * de topo e simulador (com "aplicar à empresa").
 */
interface Props {
  open: boolean;
  onClose: () => void;
  empresas: EmpresaSimulavel[];
}

export function TabelaPrecosDialog({ open, onClose, empresas }: Props) {
  // `data` direto (não `?? []`): as abas sincronizam estado a partir dele, e um
  // array novo a cada render as faria resetar o que está sendo digitado.
  const { data: planos } = usePlanos(open);
  const topo = planos ? planoDeTopo(planos) : undefined;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Preços dos planos</DialogTitle>
          <DialogDescription>Ajuste os valores, a regra acima do limite e simule o preço de um cliente.</DialogDescription>
        </DialogHeader>
        {!planos ? (
          <CarregandoSecao className="h-40" />
        ) : (
          <Tabs defaultValue="simulador" className="min-w-0">
            <TabsList variant="pill">
              <TabsTrigger value="simulador">Simulador</TabsTrigger>
              <TabsTrigger value="planos">Planos</TabsTrigger>
              <TabsTrigger value="excedente">Acima do {topo?.nome ?? 'limite'}</TabsTrigger>
            </TabsList>
            <TabsContent value="simulador" className="pt-4">
              <AbaSimulador planos={planos} empresas={empresas} />
            </TabsContent>
            <TabsContent value="planos" className="pt-4">
              <AbaPlanos planos={planos} />
            </TabsContent>
            <TabsContent value="excedente" className="pt-4">
              <AbaExcedente planos={planos} />
            </TabsContent>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
}
