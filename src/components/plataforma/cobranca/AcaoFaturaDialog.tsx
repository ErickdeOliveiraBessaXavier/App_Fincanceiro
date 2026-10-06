import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { InputMoeda } from '@/components/InputMoeda';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import {
  useAlterarValorFatura, useCancelarFatura, useEstornarPagamentoFatura, useRegistrarPagamentoFatura,
} from '@/lib/queries/assinaturas';
import { descreverFatura, formatarReais, type FaturaAssinatura } from '@/domain/assinatura';
import { hojeIso } from '@/domain/telecobranca/statusCobranca';

export type AcaoFatura = 'pagar' | 'ajustar' | 'cancelar' | 'estornar';

interface Campos {
  pagoEm: string;
  forma: string;
  observacao: string;
  valor: number;
  motivo: string;
}

const TITULO: Record<AcaoFatura, string> = {
  pagar: 'Registrar pagamento',
  ajustar: 'Ajustar valor',
  cancelar: 'Cancelar fatura',
  estornar: 'Estornar pagamento',
};

const EXPLICACAO: Record<AcaoFatura, string> = {
  pagar: 'Registre quando o dinheiro entrou. Se a empresa estava bloqueada por esta fatura, o acesso volta na hora.',
  ajustar: 'Desconto ou acréscimo pontual nesta fatura. As próximas seguem o valor do contrato.',
  cancelar: 'A fatura deixa de ser cobrada. Mensalidade cancelada não é emitida de novo.',
  estornar: 'Para pagamento registrado por engano: a fatura volta a ficar em aberto.',
};

/** Campos de cada ação. Só a de pagamento não exige motivo. */
function CamposDaAcao({ acao, c, set }: { acao: AcaoFatura; c: Campos; set: (p: Partial<Campos>) => void }) {
  if (acao === 'pagar') {
    return (
      <>
        <div className="grid gap-2">
          <Label htmlFor="fat-pago-em">Data do pagamento</Label>
          <Input id="fat-pago-em" type="date" max={hojeIso()} value={c.pagoEm} onChange={(e) => set({ pagoEm: e.target.value })} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="fat-forma">Forma (opcional)</Label>
          <Input id="fat-forma" value={c.forma} placeholder="PIX, boleto, transferência..." onChange={(e) => set({ forma: e.target.value })} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="fat-obs">Observação (opcional)</Label>
          <Input id="fat-obs" value={c.observacao} onChange={(e) => set({ observacao: e.target.value })} />
        </div>
      </>
    );
  }
  return (
    <>
      {acao === 'ajustar' && (
        <div className="grid gap-2">
          <Label htmlFor="fat-valor">Novo valor</Label>
          <InputMoeda id="fat-valor" value={c.valor} onChange={(v) => set({ valor: v })} />
        </div>
      )}
      <div className="grid gap-2">
        <Label htmlFor="fat-motivo">Motivo</Label>
        <Input id="fat-motivo" value={c.motivo} onChange={(e) => set({ motivo: e.target.value })} />
      </div>
    </>
  );
}

function useExecutarAcao() {
  const pagar = useRegistrarPagamentoFatura();
  const ajustar = useAlterarValorFatura();
  const cancelar = useCancelarFatura();
  const estornar = useEstornarPagamentoFatura();
  const executar: Record<AcaoFatura, (faturaId: string, c: Campos) => Promise<void>> = {
    pagar: (faturaId, c) => pagar.mutateAsync({ faturaId, pagoEm: c.pagoEm, forma: c.forma, observacao: c.observacao }),
    ajustar: (faturaId, c) => ajustar.mutateAsync({ faturaId, valor: c.valor, motivo: c.motivo }),
    cancelar: (faturaId, c) => cancelar.mutateAsync({ faturaId, motivo: c.motivo }),
    estornar: (faturaId, c) => estornar.mutateAsync({ faturaId, motivo: c.motivo }),
  };
  const pendente = pagar.isPending || ajustar.isPending || cancelar.isPending || estornar.isPending;
  return { executar, pendente };
}

interface Props {
  alvo: { fatura: FaturaAssinatura; acao: AcaoFatura } | null;
  onClose: () => void;
}

export function AcaoFaturaDialog({ alvo, onClose }: Props) {
  const { toast } = useToast();
  const { executar, pendente } = useExecutarAcao();
  const [c, setC] = useState<Campos>({ pagoEm: '', forma: '', observacao: '', valor: 0, motivo: '' });
  const set = (p: Partial<Campos>) => setC((atual) => ({ ...atual, ...p }));

  useEffect(() => {
    if (alvo) setC({ pagoEm: hojeIso(), forma: '', observacao: '', valor: alvo.fatura.valor, motivo: '' });
  }, [alvo]);

  const confirmar = async () => {
    if (!alvo) return;
    try {
      await executar[alvo.acao](alvo.fatura.id, c);
      toast({ title: TITULO[alvo.acao], description: descreverFatura(alvo.fatura) });
      onClose();
    } catch (e) {
      toast({ title: 'Erro', description: e instanceof Error ? e.message : 'Operação recusada', variant: 'destructive' });
    }
  };

  return (
    <Dialog open={!!alvo} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{alvo ? TITULO[alvo.acao] : ''}</DialogTitle>
          <DialogDescription>
            {alvo && `${descreverFatura(alvo.fatura)} · ${formatarReais(alvo.fatura.valor)}. ${EXPLICACAO[alvo.acao]}`}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          {alvo && <CamposDaAcao acao={alvo.acao} c={c} set={set} />}
        </div>
        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={onClose}>Voltar</Button>
          <Button onClick={confirmar} disabled={pendente}>{pendente ? 'Salvando...' : 'Confirmar'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
