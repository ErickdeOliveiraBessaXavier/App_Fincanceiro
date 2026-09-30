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
import { MEIOS_PAGAMENTO } from '@/constants/meiosPagamento';
import { hojeIso } from '@/domain/telecobranca/statusCobranca';

interface RegistrarPagamentoModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  parcelaId: string;
  parcelaNumero: number;
  saldoAtual: number;
  onSuccess: () => void;
}

export function RegistrarPagamentoModal({
  open,
  onOpenChange,
  parcelaId,
  parcelaNumero,
  saldoAtual,
  onSuccess
}: RegistrarPagamentoModalProps) {
  const [valor, setValor] = useState(saldoAtual.toString());
  const [meioPagamento, setMeioPagamento] = useState('pix');
  const [descricao, setDescricao] = useState('');
  const [dataPagamento, setDataPagamento] = useState(hojeIso());
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const handleSubmit = async () => {
    // O banco grava com 2 casas: arredondar aqui evita comparar um float com o saldo.
    const valorNum = Math.round((parseFloat(valor) || 0) * 100) / 100;
    if (!valorNum || valorNum <= 0) {
      toast({
        title: "Erro",
        description: "Informe um valor válido",
        variant: "destructive",
      });
      return;
    }

    if (valorNum > saldoAtual) {
      toast({
        title: "Erro",
        description: "O valor não pode ser maior que o saldo devedor",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.rpc('registrar_pagamento_parcela', {
        p_parcela_id: parcelaId,
        p_valor: valorNum,
        p_meio_pagamento: meioPagamento,
        p_descricao: descricao || null,
        p_data_pagamento: dataPagamento,
      });

      if (error) throw error;

      toast({
        title: "Sucesso",
        description: `Pagamento de ${FormatUtils.currency(valorNum)} registrado`,
      });

      onOpenChange(false);
      onSuccess();
    } catch (error) {
      console.error('Erro ao registrar pagamento:', error);
      toast({
        title: "Erro",
        description: (error as { message?: string })?.message || "Não foi possível registrar o pagamento",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  // Reset form when modal opens
  React.useEffect(() => {
    if (open) {
      setValor(saldoAtual.toString());
      setMeioPagamento('pix');
      setDescricao('');
      setDataPagamento(hojeIso());
    }
  }, [open, saldoAtual]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Registrar Pagamento</DialogTitle>
          <DialogDescription>
            Parcela {parcelaNumero} - Saldo: {FormatUtils.currency(saldoAtual)}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Valor do Pagamento</Label>
            <Input
              type="number"
              step="0.01"
              min="0.01"
              max={saldoAtual}
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              placeholder="0,00"
            />
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setValor(saldoAtual.toString())}
              >
                Valor Total
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setValor((saldoAtual / 2).toFixed(2))}
              >
                50%
              </Button>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="pagamento-data">Data do pagamento</Label>
            <Input
              id="pagamento-data"
              type="date"
              max={hojeIso()}
              value={dataPagamento}
              onChange={(e) => setDataPagamento(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Meio de Pagamento</Label>
            <Select value={meioPagamento} onValueChange={setMeioPagamento}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MEIOS_PAGAMENTO.map((meio) => (
                  <SelectItem key={meio.value} value={meio.value}>
                    {meio.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Observação (opcional)</Label>
            <Input
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              placeholder="Ex: Pagamento via PIX"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={loading}>
            {loading ? "Registrando..." : "Registrar Pagamento"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
