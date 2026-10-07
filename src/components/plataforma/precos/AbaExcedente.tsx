import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { InputMoeda } from '@/components/InputMoeda';
import { Aviso } from '@/components/Aviso';
import { useToast } from '@/hooks/use-toast';
import type { Plano } from '@/lib/queries/planos';
import { useDefinirExcedentePlano } from '@/lib/queries/assinaturas';
import { formatarNumero } from '@/domain/plano';
import { formatarReais } from '@/domain/assinatura';
import { faixasDeExemplo, planoDeTopo, precoDoLimite, type PlanoPrecificavel } from '@/domain/precificacao';

/**
 * Regra de preço acima do limite do plano de topo: a cada bloco de títulos,
 * um acréscimo na mensalidade e na implantação. A prévia usa os valores que
 * estão sendo digitados, antes de salvar.
 */

interface Campos {
  bloco: string;
  mensal: number;
  implantacao: number;
}

function camposDoPlano(p: Plano): Campos {
  return {
    bloco: p.excedente_bloco_titulos ? String(p.excedente_bloco_titulos) : '',
    mensal: p.excedente_valor_mensal,
    implantacao: p.excedente_valor_implantacao,
  };
}

/** O plano com a regra que está na tela, para a prévia. */
function planoComRegra(p: Plano, c: Campos): PlanoPrecificavel {
  const bloco = Number(c.bloco);
  return {
    ...p,
    excedente_bloco_titulos: Number.isInteger(bloco) && bloco > 0 ? bloco : null,
    excedente_valor_mensal: c.mensal,
    excedente_valor_implantacao: c.implantacao,
  };
}

function formatarCustoPorMil(valor: number | null): string {
  return valor === null ? '—' : formatarReais(valor);
}

function PreviaExcedente({ plano }: { plano: PlanoPrecificavel }) {
  const faixas = [plano.limite_titulos!, ...faixasDeExemplo(plano)];
  if (faixas.length === 1) {
    return <Aviso className="p-3 text-xs">Sem bloco definido: o plano não aceita limite acima de {formatarNumero(plano.limite_titulos!)}.</Aviso>;
  }
  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Títulos</TableHead>
            <TableHead className="text-right">Mensalidade</TableHead>
            <TableHead className="text-right">Implantação</TableHead>
            <TableHead className="text-right">Por mil títulos</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {faixas.map((limite) => {
            const preco = precoDoLimite(plano, limite);
            return (
              <TableRow key={limite}>
                <TableCell className="tabular-nums">{formatarNumero(limite)}</TableCell>
                <TableCell className="text-right tabular-nums">{formatarReais(preco.mensal)}</TableCell>
                <TableCell className="text-right tabular-nums">{formatarReais(preco.implantacao)}</TableCell>
                <TableCell className="text-right tabular-nums text-muted-foreground">{formatarCustoPorMil(preco.custoPorMil)}</TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

export function AbaExcedente({ planos }: { planos: Plano[] }) {
  const { toast } = useToast();
  const definir = useDefinirExcedentePlano();
  const topo = planoDeTopo(planos);
  const [c, setC] = useState<Campos>({ bloco: '', mensal: 0, implantacao: 0 });
  const set = (p: Partial<Campos>) => setC((atual) => ({ ...atual, ...p }));

  useEffect(() => { if (topo) setC(camposDoPlano(topo)); }, [topo]);

  if (!topo) return <p className="text-sm text-muted-foreground">Nenhum plano pago com limite no catálogo.</p>;
  const previa = planoComRegra(topo, c);

  const salvar = async () => {
    try {
      await definir.mutateAsync({
        codigo: topo.codigo,
        blocoTitulos: previa.excedente_bloco_titulos,
        valorMensal: c.mensal,
        valorImplantacao: c.implantacao,
      });
      toast({ title: 'Regra salva', description: 'As próximas mensalidades seguem a regra nova.' });
    } catch (e) {
      toast({ title: 'Erro', description: e instanceof Error ? e.message : 'Falha ao salvar', variant: 'destructive' });
    }
  };

  return (
    <div className="grid gap-4">
      <p className="text-sm text-muted-foreground">
        Empresas com mais de {formatarNumero(topo.limite_titulos!)} títulos ficam no {topo.nome} com limite
        maior. Cada bloco a mais soma na mensalidade (o bloco é cobrado inteiro). A implantação do bloco
        fica em zero, salvo quando o aumento exigir migração de dados.
      </p>
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="grid content-start gap-2">
          <Label htmlFor="exc-bloco">A cada (títulos)</Label>
          <Input id="exc-bloco" type="number" min="1" step="1000" value={c.bloco}
            onChange={(e) => set({ bloco: e.target.value })} placeholder="10000" />
          <p className="text-xs text-muted-foreground">Vazio desliga a regra.</p>
        </div>
        <div className="grid content-start gap-2">
          <Label htmlFor="exc-mensal">+ na mensalidade</Label>
          <InputMoeda id="exc-mensal" value={c.mensal} onChange={(v) => set({ mensal: v })} />
        </div>
        <div className="grid content-start gap-2">
          <Label htmlFor="exc-impl">+ na implantação</Label>
          <InputMoeda id="exc-impl" value={c.implantacao} onChange={(v) => set({ implantacao: v })} />
        </div>
      </div>
      <PreviaExcedente plano={previa} />
      <p className="text-xs text-muted-foreground">
        Mudar a regra muda as próximas mensalidades de quem já está acima do limite (faturas emitidas não mudam).
        Mensalidade negociada continua prevalecendo.
      </p>
      <div className="flex justify-end">
        <Button onClick={salvar} disabled={definir.isPending}>{definir.isPending ? 'Salvando...' : 'Salvar regra'}</Button>
      </div>
    </div>
  );
}
