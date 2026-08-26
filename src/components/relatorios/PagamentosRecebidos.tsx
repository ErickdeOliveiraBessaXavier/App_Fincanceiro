import { Link } from 'react-router-dom';
import { CheckCircle2, HandCoins, Users, Wallet } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ResumoNumeros } from '@/components/ResumoNumeros';
import { TablePagination } from '@/components/TablePagination';
import { usePagination, PARAM_PAGINA } from '@/hooks/usePagination';
import { formatData } from '@/utils/format';
import type { ClientePago, RecebimentoDetalhado } from '@/domain/metricas';

/**
 * O que já foi pago — por cliente e pagamento a pagamento.
 *
 * Os relatórios só mostravam dívida (títulos, acordos, aging): o dinheiro que
 * entrou existia como um total no Dashboard, mas não havia nenhuma tela que
 * respondesse "quem pagou e quanto". É o que este bloco preenche.
 */

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value ?? 0);

const ROTULO_ORIGEM: Record<RecebimentoDetalhado['origem'], string> = {
  titulo: 'Baixa de título',
  acordo: 'Parcela de acordo',
};

const CABECALHO = 'text-[10px] font-bold uppercase tracking-widest';

function NomeDoCliente({ id, nome }: { id: string | null; nome: string }) {
  if (!id) return <span className="font-medium">{nome}</span>;
  return (
    <Link to={`/clientes/${id}`} className="font-medium hover:text-primary hover:underline">
      {nome}
    </Link>
  );
}

function ListaVazia({ mensagem }: { mensagem: string }) {
  return (
    <div className="rounded-xl border border-dashed border-border/60 bg-muted/5 py-10 text-center">
      <p className={`${CABECALHO} text-muted-foreground`}>{mensagem}</p>
    </div>
  );
}

function LinhaCliente({ cliente }: { cliente: ClientePago }) {
  const quitado = cliente.emAberto <= 0;
  return (
    <TableRow>
      <TableCell>
        <NomeDoCliente id={cliente.clienteId} nome={cliente.clienteNome} />
      </TableCell>
      <TableCell className="whitespace-nowrap font-bold tabular-nums text-success">
        {formatCurrency(cliente.valorPago)}
      </TableCell>
      <TableCell className="hidden md:table-cell whitespace-nowrap tabular-nums">
        {cliente.emAberto > 0 ? formatCurrency(cliente.emAberto) : '—'}
      </TableCell>
      <TableCell className="hidden lg:table-cell tabular-nums">{cliente.quantidade}</TableCell>
      <TableCell className="hidden lg:table-cell whitespace-nowrap">
        {formatData(cliente.ultimoPagamento) || '—'}
      </TableCell>
      <TableCell>
        {quitado ? (
          <Badge variant="success" className="gap-1 whitespace-nowrap">
            <CheckCircle2 className="h-3 w-3" />
            Quitado
          </Badge>
        ) : (
          <Badge variant="outline" className="whitespace-nowrap">Parcial</Badge>
        )}
      </TableCell>
    </TableRow>
  );
}

function LinhaPagamento({ recebimento }: { recebimento: RecebimentoDetalhado }) {
  return (
    <TableRow>
      <TableCell className="whitespace-nowrap">{formatData(recebimento.data) || '—'}</TableCell>
      <TableCell>
        <NomeDoCliente id={recebimento.clienteId} nome={recebimento.clienteNome} />
      </TableCell>
      <TableCell className="whitespace-nowrap font-bold tabular-nums text-success">
        {formatCurrency(recebimento.valor)}
      </TableCell>
      <TableCell className="hidden md:table-cell text-xs text-muted-foreground">
        {ROTULO_ORIGEM[recebimento.origem]}
      </TableCell>
      <TableCell className="hidden lg:table-cell text-xs text-muted-foreground">
        {recebimento.meioPagamento ?? '—'}
      </TableCell>
    </TableRow>
  );
}

function ClientesQuePagaram({ clientes }: { clientes: ClientePago[] }) {
  const pagination = usePagination(clientes, 25, String(clientes.length), PARAM_PAGINA);

  return (
    <Card className="overflow-hidden rounded-2xl border-none shadow-card">
      <CardHeader className="border-b border-border/50 bg-muted/20 pb-4">
        <CardTitle className="text-lg font-bold tracking-tight">Clientes que pagaram</CardTitle>
        <CardDescription className="text-xs font-medium">
          Quanto cada cliente já pagou no período e o que dele ainda está em aberto hoje
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-6">
        {clientes.length === 0 ? (
          <ListaVazia mensagem="Nenhum pagamento no período" />
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border/50">
            <Table>
              <TableHeader className="bg-muted/30">
                <TableRow>
                  <TableHead className={CABECALHO}>Cliente</TableHead>
                  <TableHead className={CABECALHO}>Valor pago</TableHead>
                  <TableHead className={`hidden md:table-cell ${CABECALHO}`}>Em aberto</TableHead>
                  <TableHead className={`hidden lg:table-cell ${CABECALHO}`}>Pagamentos</TableHead>
                  <TableHead className={`hidden lg:table-cell ${CABECALHO}`}>Último</TableHead>
                  <TableHead className={CABECALHO}>Situação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pagination.pageItems.map((cliente) => (
                  <LinhaCliente key={cliente.clienteId ?? cliente.clienteNome} cliente={cliente} />
                ))}
              </TableBody>
            </Table>
            <TablePagination pagination={pagination} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function PagamentoAPagamento({ recebimentos }: { recebimentos: RecebimentoDetalhado[] }) {
  const pagination = usePagination(recebimentos, 25, String(recebimentos.length));

  if (recebimentos.length === 0) return null;

  return (
    <Card className="overflow-hidden rounded-2xl border-none shadow-card">
      <CardHeader className="border-b border-border/50 bg-muted/20 pb-4">
        <CardTitle className="text-lg font-bold tracking-tight">Pagamentos recebidos</CardTitle>
        <CardDescription className="text-xs font-medium">
          Baixa de parcela de título e parcela de acordo, na data real do recebimento
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-6">
        <div className="overflow-x-auto rounded-xl border border-border/50">
          <Table>
            <TableHeader className="bg-muted/30">
              <TableRow>
                <TableHead className={CABECALHO}>Data</TableHead>
                <TableHead className={CABECALHO}>Cliente</TableHead>
                <TableHead className={CABECALHO}>Valor</TableHead>
                <TableHead className={`hidden md:table-cell ${CABECALHO}`}>Origem</TableHead>
                <TableHead className={`hidden lg:table-cell ${CABECALHO}`}>Meio</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pagination.pageItems.map((recebimento) => (
                <LinhaPagamento key={recebimento.id} recebimento={recebimento} />
              ))}
            </TableBody>
          </Table>
          <TablePagination pagination={pagination} />
        </div>
      </CardContent>
    </Card>
  );
}

interface PagamentosRecebidosProps {
  recebimentos: RecebimentoDetalhado[];
  clientes: ClientePago[];
  valorTotal: number;
}

export function PagamentosRecebidos({ recebimentos, clientes, valorTotal }: PagamentosRecebidosProps) {
  const quitados = clientes.filter((c) => c.emAberto <= 0).length;

  return (
    <div className="space-y-6 md:col-span-2">
      <ResumoNumeros
        itens={[
          { rotulo: 'Valor recebido', valor: formatCurrency(valorTotal), icone: Wallet, cor: 'text-success' },
          { rotulo: 'Pagamentos', valor: recebimentos.length, icone: HandCoins },
          { rotulo: 'Clientes que pagaram', valor: clientes.length, icone: Users },
          { rotulo: 'Sem saldo em aberto', valor: quitados, icone: CheckCircle2, cor: 'text-success' },
        ]}
      />

      <ClientesQuePagaram clientes={clientes} />
      <PagamentoAPagamento recebimentos={recebimentos} />
    </div>
  );
}
