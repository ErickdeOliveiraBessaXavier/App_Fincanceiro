import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { InputMoeda } from '@/components/InputMoeda';
import { useToast } from '@/hooks/use-toast';
import type { Plano } from '@/lib/queries/planos';
import { useDefinirPrecosPlano } from '@/lib/queries/assinaturas';
import { formatarNumero } from '@/domain/plano';

/**
 * Mensalidade e implantação de cada plano. Vale para as faturas emitidas daqui
 * em diante; fatura emitida guarda o valor da emissão. Empresa com mensalidade
 * negociada não é afetada.
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

function descreverLimite(p: Pick<Plano, 'limite_titulos'>): string {
  return p.limite_titulos === null ? 'sem limite' : `${formatarNumero(p.limite_titulos)} títulos`;
}

export function AbaPlanos({ planos }: { planos: Plano[] }) {
  const { toast } = useToast();
  const definir = useDefinirPrecosPlano();
  const [precos, setPrecos] = useState<Precos>({});

  useEffect(() => { setPrecos(precosDoCatalogo(planos)); }, [planos]);

  const set = (codigo: string, campo: 'mensal' | 'implantacao', valor: number) =>
    setPrecos((atual) => ({ ...atual, [codigo]: { ...atual[codigo], [campo]: valor } }));

  const mudancas = alterados(planos, precos);
  const salvar = async () => {
    try {
      for (const p of mudancas) {
        await definir.mutateAsync({
          codigo: p.codigo, valorMensal: precos[p.codigo].mensal, valorImplantacao: precos[p.codigo].implantacao,
        });
      }
      toast({ title: 'Preços atualizados' });
    } catch (e) {
      toast({ title: 'Erro', description: e instanceof Error ? e.message : 'Falha ao salvar', variant: 'destructive' });
    }
  };

  return (
    <div className="grid gap-4">
      <p className="text-sm text-muted-foreground">
        Valem para as faturas emitidas daqui em diante. Empresas com mensalidade negociada não mudam.
      </p>
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
      <div className="flex justify-end">
        <Button onClick={salvar} disabled={definir.isPending || mudancas.length === 0}>
          {definir.isPending ? 'Salvando...' : 'Salvar preços'}
        </Button>
      </div>
    </div>
  );
}
