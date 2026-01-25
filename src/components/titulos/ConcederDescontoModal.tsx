import React, { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { FormatUtils } from '@/utils/titulo';

interface ConcederDescontoModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  parcelaId: string;
  parcelaNumero: number;
  saldoAtual: number;
  onSuccess: () => void;
}

export function ConcederDescontoModal({
  open,
  onOpenChange,
  parcelaId,
  parcelaNumero,
  saldoAtual,
  onSuccess
}: ConcederDescontoModalProps) {
  const [modoValor, setModoValor] = useState<'valor' | 'percentual'>('percentual');
  const [valor, setValor] = useState('');
  const [percentual, setPercentual] = useState('10');
  const [descricao, setDescricao] = useState('');
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const valorCalculado = modoValor === 'percentual'
    ? (saldoAtual * (parseFloat(percentual) || 0)) / 100
    : parseFloat(valor) || 0;

  const handleSubmit = async () => {
    if (valorCalculado <= 0) {
      toast({
        title: "Erro",
        description: "Informe um valor válido para o desconto",
        variant: "destructive",
      });
      return;
    }

    if (valorCalculado > saldoAtual) {
      toast({
        title: "Erro",
        description: "O desconto não pode ser maior que o saldo devedor",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.rpc('conceder_desconto_parcela', {
        p_parcela_id: parcelaId,
        p_valor: valorCalculado,
        p_descricao: descricao || 'Desconto concedido'
      });

      if (error) throw error;

      toast({
        title: "Sucesso",
        description: `Desconto de ${FormatUtils.currency(valorCalculado)} concedido`,
      });

      onOpenChange(false);
      onSuccess();
    } catch (error: any) {
      console.error('Erro ao conceder desconto:', error);
      toast({
        title: "Erro",
        description: error.message || "Não foi possível conceder o desconto",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  // Reset form when modal opens
  React.useEffect(() => {
    if (open) {
      setModoValor('percentual');
      setValor('');
      setPercentual('10');
      setDescricao('');
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Conceder Desconto</DialogTitle>
          <DialogDescription>
            Parcela {parcelaNumero} - Saldo: {FormatUtils.currency(saldoAtual)}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Modo de Cálculo</Label>
            <div className="flex gap-2">
              <Button
                type="button"
                variant={modoValor === 'percentual' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setModoValor('percentual')}
              >
                Percentual
              </Button>
              <Button
                type="button"
                variant={modoValor === 'valor' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setModoValor('valor')}
              >
                Valor Fixo
              </Button>
            </div>
          </div>

          {modoValor === 'percentual' ? (
            <div className="space-y-2">
              <Label>Percentual (%)</Label>
              <Input
                type="number"
                step="0.1"
                min="0.1"
                max="100"
                value={percentual}
                onChange={(e) => setPercentual(e.target.value)}
                placeholder="10"
              />
              <div className="flex gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => setPercentual('5')}>5%</Button>
                <Button type="button" variant="outline" size="sm" onClick={() => setPercentual('10')}>10%</Button>
                <Button type="button" variant="outline" size="sm" onClick={() => setPercentual('15')}>15%</Button>
                <Button type="button" variant="outline" size="sm" onClick={() => setPercentual('20')}>20%</Button>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <Label>Valor</Label>
              <Input
                type="number"
                step="0.01"
                min="0.01"
                max={saldoAtual}
                value={valor}
                onChange={(e) => setValor(e.target.value)}
                placeholder="0,00"
              />
            </div>
          )}

          {valorCalculado > 0 && (
            <div className="p-3 bg-muted rounded-lg">
              <p className="text-sm">
                <span className="text-muted-foreground">Valor do desconto:</span>{' '}
                <span className="font-medium text-primary">{FormatUtils.currency(valorCalculado)}</span>
              </p>
              <p className="text-sm">
                <span className="text-muted-foreground">Novo saldo:</span>{' '}
                <span className="font-medium">{FormatUtils.currency(Math.max(0, saldoAtual - valorCalculado))}</span>
              </p>
            </div>
          )}

          <div className="space-y-2">
            <Label>Motivo do Desconto</Label>
            <Input
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              placeholder="Ex: Desconto para pagamento à vista"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={loading}>
            {loading ? "Concedendo..." : "Conceder Desconto"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
