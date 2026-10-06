import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { MoreHorizontal } from 'lucide-react';
import { CarregandoSecao } from '@/components/TelaCarregamento';
import { cn } from '@/lib/utils';
import { useCobrancaEmpresa } from '@/lib/queries/assinaturas';
import { usePlanos } from '@/lib/queries/planos';
import {
  TOLERANCIA_PADRAO_DIAS, descreverFatura, descreverSituacao, formatarReais, situacaoDaFatura,
  type FaturaAssinatura,
} from '@/domain/assinatura';
import { hojeIso } from '@/domain/telecobranca/statusCobranca';
import { formatData } from '@/utils/format';
import { FormAssinatura } from './FormAssinatura';
import { AcaoFaturaDialog, type AcaoFatura } from './AcaoFaturaDialog';

/**
 * Cobrança de uma empresa na Plataforma: o contrato (mensalidade, vencimento,
 * carência, tolerância) e as faturas emitidas, com as ações do dia a dia.
 */

export interface EmpresaDaCobranca {
  id: string;
  nome: string;
  plano: string;
}

const COR_SITUACAO: Record<string, string> = {
  paga: 'text-success',
  cancelada: 'text-muted-foreground line-through',
  vencida: 'text-warning-strong',
  bloqueando: 'text-destructive font-medium',
};

const ACOES_POR_STATUS: Record<FaturaAssinatura['status'], { acao: AcaoFatura; rotulo: string }[]> = {
  aberta: [
    { acao: 'pagar', rotulo: 'Registrar pagamento' },
    { acao: 'ajustar', rotulo: 'Ajustar valor' },
    { acao: 'cancelar', rotulo: 'Cancelar fatura' },
  ],
  paga: [{ acao: 'estornar', rotulo: 'Estornar pagamento' }],
  cancelada: [],
};

interface TabelaProps {
  faturas: FaturaAssinatura[];
  tolerancia: number;
  onAcao: (fatura: FaturaAssinatura, acao: AcaoFatura) => void;
}

function FaturasTabela({ faturas, tolerancia, onAcao }: TabelaProps) {
  if (faturas.length === 0) {
    return <p className="py-4 text-center text-sm text-muted-foreground">Nenhuma fatura emitida.</p>;
  }
  const hoje = hojeIso();
  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Fatura</TableHead>
            <TableHead>Vencimento</TableHead>
            <TableHead className="text-right">Valor</TableHead>
            <TableHead>Situação</TableHead>
            <TableHead className="w-10" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {faturas.map((f) => (
            <TableRow key={f.id}>
              <TableCell>
                <div>{descreverFatura(f)}</div>
                {f.observacao && <div className="text-xs text-muted-foreground">{f.observacao}</div>}
              </TableCell>
              <TableCell className="tabular-nums">{formatData(f.vencimento)}</TableCell>
              <TableCell className="text-right tabular-nums">{formatarReais(f.valor)}</TableCell>
              <TableCell className={cn('text-xs', COR_SITUACAO[situacaoDaFatura(f, tolerancia, hoje)])}>
                {descreverSituacao(f, tolerancia, hoje)}
              </TableCell>
              <TableCell>
                {ACOES_POR_STATUS[f.status].length > 0 && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button size="sm" variant="ghost" title="Ações da fatura"><MoreHorizontal className="h-4 w-4" /></Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {ACOES_POR_STATUS[f.status].map(({ acao, rotulo }) => (
                        <DropdownMenuItem key={acao} onClick={() => onAcao(f, acao)}>{rotulo}</DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function ConteudoCobranca({ empresa }: { empresa: EmpresaDaCobranca }) {
  const { data, isLoading } = useCobrancaEmpresa(empresa.id);
  const { data: planos = [] } = usePlanos();
  const [acaoAlvo, setAcaoAlvo] = useState<{ fatura: FaturaAssinatura; acao: AcaoFatura } | null>(null);

  if (isLoading || !data) return <CarregandoSecao className="h-40" />;

  const plano = planos.find((p) => p.codigo === empresa.plano);
  const implantacaoEmitida = data.faturas.some((f) => f.tipo === 'implantacao' && f.status !== 'cancelada');
  return (
    <div className="grid gap-6">
      <section className="grid gap-3">
        <h3 className="text-sm font-semibold">Contrato</h3>
        <FormAssinatura companyId={empresa.id} assinatura={data.assinatura} plano={plano}
          implantacaoEmitida={implantacaoEmitida} />
      </section>
      <section className="grid gap-3">
        <h3 className="text-sm font-semibold">Faturas</h3>
        <FaturasTabela faturas={data.faturas}
          tolerancia={data.assinatura?.dias_tolerancia ?? TOLERANCIA_PADRAO_DIAS}
          onAcao={(fatura, acao) => setAcaoAlvo({ fatura, acao })} />
        <p className="text-xs text-muted-foreground">
          As mensalidades são emitidas automaticamente 10 dias antes do vencimento.
        </p>
      </section>
      <AcaoFaturaDialog alvo={acaoAlvo} onClose={() => setAcaoAlvo(null)} />
    </div>
  );
}

interface Props {
  empresa: EmpresaDaCobranca | null;
  onClose: () => void;
}

export function CobrancaEmpresaDialog({ empresa, onClose }: Props) {
  return (
    <Dialog open={!!empresa} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Cobrança</DialogTitle>
          <DialogDescription>{empresa?.nome} · implantação e mensalidade</DialogDescription>
        </DialogHeader>
        {empresa && <ConteudoCobranca empresa={empresa} />}
      </DialogContent>
    </Dialog>
  );
}
