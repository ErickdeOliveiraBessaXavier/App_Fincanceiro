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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface AplicarEncargoModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  parcelaId: string;
  parcelaNumero: number;
  saldoAtual: number;
  onSuccess: () => void;
}

const TIPOS_ENCARGO = [
  { value: 'juros', label: 'Juros' },
  { value: 'multa', label: 'Multa' },
];

export function AplicarEncargoModal({
  open,
  onOpenChange,
  parcelaId,
  parcelaNumero,
  saldoAtual,
  onSuccess
}: AplicarEncargoModalProps) {
  const [tipo, setTipo] = useState('juros');
  const [modoValor, setModoValor] = useState<'valor' | 'percentual'>('percentual');
  const [valor, setValor] = useState('');
  const [percentual, setPercentual] = useState('2');
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
        description: "Informe um valor válido para o encargo",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.rpc('aplicar_encargo_parcela', {
        p_parcela_id: parcelaId,
        p_tipo: tipo,
        p_valor: valorCalculado,
        p_descricao: descricao || `${tipo === 'juros' ? 'Juros' : 'Multa'} aplicado(a)`
      });

      if (error) throw error;

      toast({
        title: "Sucesso",
        description: `${tipo === 'juros' ? 'Juros' : 'Multa'} de ${FormatUtils.currency(valorCalculado)} aplicado(a)`,
      });

      onOpenChange(false);
      onSuccess();
    } catch (error: any) {
      console.error('Erro ao aplicar encargo:', error);
      toast({
        title: "Erro",
        description: error.message || "Não foi possível aplicar o encargo",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  // Reset form when modal opens
  React.useEffect(() => {
    if (open) {
      setTipo('juros');
      setModoValor('percentual');
      setValor('');
      setPercentual('2');
      setDescricao('');
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Aplicar Encargo</DialogTitle>
          <DialogDescription>
            Parcela {parcelaNumero} - Saldo: {FormatUtils.currency(saldoAtual)}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Tipo de Encargo</Label>
            <Select value={tipo} onValueChange={setTipo}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TIPOS_ENCARGO.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

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
                value={percentual}
                onChange={(e) => setPercentual(e.target.value)}
                placeholder="2"
              />
              <div className="flex gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => setPercentual('1')}>1%</Button>
                <Button type="button" variant="outline" size="sm" onClick={() => setPercentual('2')}>2%</Button>
                <Button type="button" variant="outline" size="sm" onClick={() => setPercentual('5')}>5%</Button>
                <Button type="button" variant="outline" size="sm" onClick={() => setPercentual('10')}>10%</Button>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <Label>Valor</Label>
              <Input
                type="number"
                step="0.01"
                min="0.01"
                value={valor}
                onChange={(e) => setValor(e.target.value)}
                placeholder="0,00"
              />
            </div>
          )}

          {valorCalculado > 0 && (
            <div className="p-3 bg-muted rounded-lg">
              <p className="text-sm">
                <span className="text-muted-foreground">Valor do encargo:</span>{' '}
                <span className="font-medium">{FormatUtils.currency(valorCalculado)}</span>
              </p>
              <p className="text-sm">
                <span className="text-muted-foreground">Novo saldo:</span>{' '}
                <span className="font-medium">{FormatUtils.currency(saldoAtual + valorCalculado)}</span>
              </p>
            </div>
          )}

          <div className="space-y-2">
            <Label>Observação (opcional)</Label>
            <Input
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              placeholder="Ex: Juros de mora por atraso"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={loading}>
            {loading ? "Aplicando..." : "Aplicar Encargo"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
