import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Aviso } from '@/components/Aviso';
import { useToast } from '@/hooks/use-toast';
import { useDefinirPlanoEmpresa, type Plano } from '@/lib/queries/planos';
import { formatarNumero } from '@/domain/plano';
import { CARENCIA_PADRAO_DIAS, formatarReais } from '@/domain/assinatura';
import {
  limiteParaCaber, precoDoLimite, recomendarPlano, temRegraDeExcedente, type Preco, type Recomendacao,
} from '@/domain/precificacao';

/**
 * Simulador de preço: quantos títulos a empresa tem (ou vai ter) → qual plano
 * cabe, quanto custa e quanto sai cada mil títulos. Dá para aplicar o
 * resultado a uma empresa direto daqui.
 */

export interface EmpresaSimulavel {
  id: string;
  nome: string;
}

interface Opcao {
  plano: Plano;
  /** null = não comporta a quantidade. */
  preco: Preco | null;
}

function opcaoDoPlano(p: Plano, titulos: number): Opcao {
  if (p.limite_titulos === null || titulos <= p.limite_titulos) return { plano: p, preco: precoDoLimite(p, null) };
  if (!temRegraDeExcedente(p)) return { plano: p, preco: null };
  return { plano: p, preco: precoDoLimite(p, limiteParaCaber(p, titulos)) };
}

function ResultadoRecomendado({ r, titulos }: { r: Recomendacao; titulos: number }) {
  const limite = r.preco.limite === null ? 'sem limite' : `${formatarNumero(r.preco.limite)} títulos`;
  return (
    <div className="grid gap-3 rounded-lg border bg-muted/30 p-4 sm:grid-cols-4">
      <div className="sm:col-span-4">
        <div className="text-xs text-muted-foreground">Para {formatarNumero(titulos)} títulos</div>
        <div className="text-lg font-semibold">
          {r.plano.nome}{r.limitePersonalizado !== null && ` · limite de ${limite}`}
        </div>
      </div>
      <Valor rotulo="Mensalidade" valor={formatarReais(r.preco.mensal)} />
      <Valor rotulo="Implantação" valor={formatarReais(r.preco.implantacao)} />
      <Valor rotulo="Por mil títulos" valor={r.preco.custoPorMil === null ? '—' : formatarReais(r.preco.custoPorMil)} />
      <Valor rotulo="1º ano" valor={formatarReais(r.preco.implantacao + r.preco.mensal * 10)}
        dica={`Implantação + 10 mensalidades (os ${CARENCIA_PADRAO_DIAS} dias de carência isentam 2)`} />
    </div>
  );
}

function Valor({ rotulo, valor, dica }: { rotulo: string; valor: string; dica?: string }) {
  return (
    <div title={dica}>
      <div className="text-xs text-muted-foreground">{rotulo}</div>
      <div className="font-semibold tabular-nums">{valor}</div>
    </div>
  );
}

function TabelaComparacao({ opcoes, recomendado }: { opcoes: Opcao[]; recomendado: string | undefined }) {
  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Plano</TableHead>
            <TableHead className="text-right">Mensalidade</TableHead>
            <TableHead className="text-right">Implantação</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {opcoes.map(({ plano, preco }) => (
            <TableRow key={plano.codigo} className={preco ? '' : 'text-muted-foreground'}>
              <TableCell>
                {plano.nome}
                {plano.codigo === recomendado && <Badge variant="secondary" className="ml-2">Recomendado</Badge>}
              </TableCell>
              <TableCell className="text-right tabular-nums">{preco ? formatarReais(preco.mensal) : 'não comporta'}</TableCell>
              <TableCell className="text-right tabular-nums">{preco ? formatarReais(preco.implantacao) : '—'}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function AplicarAEmpresa({ r, empresas }: { r: Recomendacao; empresas: EmpresaSimulavel[] }) {
  const { toast } = useToast();
  const definir = useDefinirPlanoEmpresa();
  const [empresaId, setEmpresaId] = useState('');

  const aplicar = async () => {
    const empresa = empresas.find((e) => e.id === empresaId);
    if (!empresa) return;
    try {
      await definir.mutateAsync({
        companyId: empresa.id, plano: r.plano.codigo, limitePersonalizado: r.limitePersonalizado, acessoExpiraEm: null,
      });
      toast({ title: 'Plano aplicado', description: `${empresa.nome}: ${r.plano.nome}, ${formatarReais(r.preco.mensal)}/mês.` });
    } catch (e) {
      toast({ title: 'Erro', description: e instanceof Error ? e.message : 'Falha ao aplicar', variant: 'destructive' });
    }
  };

  return (
    <div className="grid gap-2 rounded-md border p-3">
      <Label htmlFor="sim-empresa">Aplicar a uma empresa</Label>
      <div className="flex flex-wrap gap-2">
        <select id="sim-empresa" value={empresaId} onChange={(e) => setEmpresaId(e.target.value)}
          className="h-10 min-w-0 flex-1 rounded-md border border-input bg-background px-3 text-sm">
          <option value="">Escolha a empresa…</option>
          {empresas.map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}
        </select>
        <Button onClick={aplicar} disabled={!empresaId || definir.isPending}>
          {definir.isPending ? 'Aplicando...' : 'Aplicar plano'}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Troca o plano e o limite da empresa. A mensalidade sai da regra, a menos que a empresa tenha valor
        negociado em Cobrança. A implantação é emitida ao contratar em Cobrança.
      </p>
    </div>
  );
}

export function AbaSimulador({ planos, empresas }: { planos: Plano[]; empresas: EmpresaSimulavel[] }) {
  const [texto, setTexto] = useState('42000');
  const titulos = Math.max(0, Math.floor(Number(texto) || 0));
  const pagos = planos.filter((p) => p.valor_mensal > 0);
  const r = titulos > 0 ? recomendarPlano(pagos, titulos) : null;

  return (
    <div className="grid gap-4">
      <div className="grid max-w-xs gap-2">
        <Label htmlFor="sim-titulos">Quantidade de títulos</Label>
        <Input id="sim-titulos" type="number" min="1" step="1000" value={texto} onChange={(e) => setTexto(e.target.value)} />
        <p className="text-xs text-muted-foreground">Conta todo título não cancelado (em aberto, pago, em acordo).</p>
      </div>
      {titulos > 0 && !r && (
        <Aviso className="p-3 text-xs">Nenhum plano comporta essa quantidade. Defina a regra em “Acima do Enterprise”.</Aviso>
      )}
      {r && <ResultadoRecomendado r={r} titulos={titulos} />}
      {titulos > 0 && <TabelaComparacao opcoes={pagos.map((p) => opcaoDoPlano(p, titulos))} recomendado={r?.plano.codigo} />}
      {r && <AplicarAEmpresa r={r} empresas={empresas} />}
    </div>
  );
}
