import { AlertTriangle, Tag } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ResumoNumeros } from '@/components/ResumoNumeros';
import { usePagination, PARAM_PAGINA } from '@/hooks/usePagination';
import { TablePagination } from '@/components/TablePagination';
import { formatData } from '@/utils/format';
import { resumirDescontos, type DescontoConcedido } from '@/lib/queries/descontos';
import { cn } from '@/lib/utils';

/**
 * Descontos concedidos, com destaque para os que passaram do teto.
 *
 * É a contrapartida de permitir que o administrador ultrapasse o limite: a
 * exceção não é barrada, é registrada e mostrada aqui com nome e motivo.
 */

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value ?? 0);

function LinhaDesconto({ desconto }: { desconto: DescontoConcedido }) {
  return (
    <TableRow className={cn(desconto.estornado && 'opacity-50')}>
      <TableCell className="whitespace-nowrap">{formatData(desconto.data_evento)}</TableCell>
      <TableCell>
        <div className="font-medium">{desconto.cliente_nome ?? '—'}</div>
        <div className="text-xs text-muted-foreground">
          {desconto.origem === 'acordo' ? 'Parcela de acordo' : 'Parcela de título'}
          {desconto.numero_parcela ? ` · nº ${desconto.numero_parcela}` : ''}
        </div>
      </TableCell>
      <TableCell className="whitespace-nowrap font-medium tabular-nums">
        {formatCurrency(desconto.valor)}
      </TableCell>
      <TableCell className="hidden md:table-cell">
        {desconto.excedeu_teto ? (
          <Badge variant="warning" className="gap-1">
            <AlertTriangle className="h-3 w-3" />
            Acima do teto
          </Badge>
        ) : (
          <span className="text-xs text-muted-foreground">
            {desconto.teto_percentual ? `dentro do teto (${desconto.teto_percentual}%)` : '—'}
          </span>
        )}
      </TableCell>
      <TableCell className="hidden lg:table-cell text-xs">{desconto.concedido_por ?? '—'}</TableCell>
      <TableCell className="hidden xl:table-cell max-w-xs truncate text-xs text-muted-foreground">
        {desconto.descricao ?? '—'}
      </TableCell>
      <TableCell>
        {desconto.estornado && <Badge variant="outline" className="text-[10px]">Estornado</Badge>}
      </TableCell>
    </TableRow>
  );
}

export function DescontosConcedidos({ descontos }: { descontos: DescontoConcedido[] }) {
  const resumo = resumirDescontos(descontos);
  const pagination = usePagination(descontos, 25, String(descontos.length), PARAM_PAGINA);

  return (
    <div className="space-y-6 md:col-span-2">
      <ResumoNumeros
        itens={[
          { rotulo: 'Descontos', valor: resumo.total, icone: Tag },
          { rotulo: 'Valor concedido', valor: formatCurrency(resumo.valorTotal), icone: Tag },
          {
            rotulo: 'Acima do teto',
            valor: resumo.excecoes,
            icone: AlertTriangle,
            cor: resumo.excecoes > 0 ? 'text-amber-600' : undefined,
          },
          {
            rotulo: 'Valor das exceções',
            valor: formatCurrency(resumo.valorExcecoes),
            icone: AlertTriangle,
            cor: resumo.excecoes > 0 ? 'text-amber-600' : undefined,
          },
        ]}
      />

      <Card className="overflow-hidden">
        <CardHeader className="border-b border-border/50 bg-muted/20 pb-4">
          <CardTitle className="text-lg font-bold tracking-tight">Descontos concedidos</CardTitle>
          <CardDescription className="text-xs font-medium">
            Exceção que vira rotina não pede trava mais apertada — pede recalibrar o teto.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-6">
          {descontos.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border/60 bg-muted/5 py-10 text-center">
              <p className="text-sm font-bold uppercase tracking-widest text-muted-foreground">
                Nenhum desconto no período
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-border/50">
              <Table>
                <TableHeader className="bg-muted/30">
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Valor</TableHead>
                    <TableHead className="hidden md:table-cell">Limite</TableHead>
                    <TableHead className="hidden lg:table-cell">Concedido por</TableHead>
                    <TableHead className="hidden xl:table-cell">Motivo</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pagination.pageItems.map((desconto) => (
                    <LinhaDesconto key={desconto.id} desconto={desconto} />
                  ))}
                </TableBody>
              </Table>
              <TablePagination pagination={pagination} />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
