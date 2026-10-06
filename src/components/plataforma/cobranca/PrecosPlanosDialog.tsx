import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { InputMoeda } from '@/components/InputMoeda';
import { useToast } from '@/hooks/use-toast';
import { usePlanos, type Plano } from '@/lib/queries/planos';
import { useDefinirPrecosPlano } from '@/lib/queries/assinaturas';
import { formatarNumero } from '@/domain/plano';

/**
 * Preços do catálogo: mensalidade e implantação de cada plano. Mudar aqui vale
 * para as faturas emitidas daqui em diante; fatura já emitida guarda o valor da
 * emissão. Empresa com mensalidade negociada não é afetada.
 */

type Precos = Record<string, { mensal: number; implantacao: number }>;

function precosDoCatalogo(planos: Plano[]): Precos {
  return Object.fromEntries(planos.map((p) => [p.codigo, { mensal: p.valor_mensal, implantacao: p.valor_implantacao }]));
}

function alterados(planos: Plano[], precos: Precos): Plano[] {
  return planos.filter((p) => {
    const novo = precos[p.codigo];
    return novo && (novo.mensal !== p.valor_mensal || novo.implantacao !== p.valor_implantacao);
  });
}

function descreverLimite(p: Plano): string {
  return p.limite_titulos === null ? 'sem limite' : `${formatarNumero(p.limite_titulos)} títulos`;
}

export function PrecosPlanosDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { toast } = useToast();
  const { data } = usePlanos(open);
  const planos = data ?? [];
  const definir = useDefinirPrecosPlano();
  const [precos, setPrecos] = useState<Precos>({});

  // Depende de `data`, não de `planos`: o `?? []` cria um array novo a cada render.
  useEffect(() => { if (open && data) setPrecos(precosDoCatalogo(data)); }, [open, data]);

  const set = (codigo: string, campo: 'mensal' | 'implantacao', valor: number) =>
    setPrecos((atual) => ({ ...atual, [codigo]: { ...atual[codigo], [campo]: valor } }));

  const salvar = async () => {
    try {
      for (const p of alterados(planos, precos)) {
        await definir.mutateAsync({
          codigo: p.codigo, valorMensal: precos[p.codigo].mensal, valorImplantacao: precos[p.codigo].implantacao,
        });
      }
      toast({ title: 'Preços atualizados' });
      onClose();
    } catch (e) {
      toast({ title: 'Erro', description: e instanceof Error ? e.message : 'Falha ao salvar', variant: 'destructive' });
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Preços dos planos</DialogTitle>
          <DialogDescription>
            Valem para as faturas emitidas daqui em diante. Empresas com mensalidade negociada não mudam.
          </DialogDescription>
        </DialogHeader>
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Plano</TableHead>
                <TableHead>Mensalidade</TableHead>
                <TableHead>Implantação</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {planos.map((p) => (
                <TableRow key={p.codigo}>
                  <TableCell>
                    <div className="font-medium">{p.nome}</div>
                    <div className="text-xs text-muted-foreground">{descreverLimite(p)}</div>
                  </TableCell>
                  <TableCell>
                    <InputMoeda aria-label={`Mensalidade ${p.nome}`} value={precos[p.codigo]?.mensal ?? 0}
                      onChange={(v) => set(p.codigo, 'mensal', v)} />
                  </TableCell>
                  <TableCell>
                    <InputMoeda aria-label={`Implantação ${p.nome}`} value={precos[p.codigo]?.implantacao ?? 0}
                      onChange={(v) => set(p.codigo, 'implantacao', v)} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={salvar} disabled={definir.isPending}>{definir.isPending ? 'Salvando...' : 'Salvar'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
