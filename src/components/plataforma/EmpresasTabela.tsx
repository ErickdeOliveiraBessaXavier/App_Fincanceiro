import { Search, ChevronRight } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CarregandoSecao } from '@/components/TelaCarregamento';
import { BarraDeUso } from '@/components/plano/BarraUsoPlano';
import { usePlanos } from '@/lib/queries/planos';
import type { CompanyRow, MetricaEmpresa } from '@/lib/queries/plataforma';
import { calcularUso, diasRestantes, formatarNumero } from '@/domain/plano';
import { formatarReais } from '@/domain/assinatura';
import type { FiltroEmpresas } from '@/domain/plataforma';
import { formatCpfCnpj, formatData } from '@/utils/format';
import type { CobrancaDaEmpresa } from '@/components/plataforma/cobranca/resumoPlataforma';
import { BotaoStatusEmpresa } from '@/components/plataforma/empresa/BotaoStatusEmpresa';
import { StatusEmpresaBadge } from '@/components/plataforma/empresa/StatusEmpresaBadge';

/**
 * Empresas da plataforma: busca, filtro por situação e a linha inteira
 * clicável para abrir "Gerenciar empresa".
 */

// Tempo relativo comunica churn melhor que data solta: "há 45 dias" salta aos
// olhos de um jeito que "01/06/2026" não salta.
function fmtAtividade(d: string | null): string {
  if (!d) return 'nunca';
  const dias = Math.floor((Date.now() - new Date(d).getTime()) / 86_400_000);
  if (dias <= 0) return 'hoje';
  if (dias === 1) return 'ontem';
  if (dias < 30) return `há ${dias} dias`;
  return formatData(d);
}

/** Linha de apoio sob o status: o que explica a situação em poucas palavras. */
function detalheDaSituacao(c: CompanyRow, cobranca?: CobrancaDaEmpresa): { texto: string; cor: string } | null {
  if (cobranca?.situacao === 'bloqueando') return { texto: 'Bloqueada por atraso', cor: 'text-destructive font-medium' };
  if (cobranca?.situacao === 'vencida') return { texto: 'Fatura vencida', cor: 'text-warning-strong' };
  const dias = diasRestantes(c.acesso_expira_em);
  if (dias === 0) return { texto: 'Prazo de acesso vencido', cor: 'text-destructive font-medium' };
  if (dias !== null) return { texto: `Acesso até ${formatData(c.acesso_expira_em)}`, cor: 'text-muted-foreground' };
  return null;
}

function CelulaSituacao({ c, cobranca }: { c: CompanyRow; cobranca?: CobrancaDaEmpresa }) {
  const detalhe = detalheDaSituacao(c, cobranca);
  return (
    <TableCell>
      <StatusEmpresaBadge status={c.status} />
      {detalhe && <div className={`mt-1 text-xs ${detalhe.cor}`}>{detalhe.texto}</div>}
    </TableCell>
  );
}

function CelulaPlano({ c, cobranca }: { c: CompanyRow; cobranca?: CobrancaDaEmpresa }) {
  const { data: planos = [] } = usePlanos();
  const nome = planos.find((p) => p.codigo === c.plano)?.nome ?? c.plano;
  const mensal = cobranca?.mensal;
  return (
    <TableCell>
      <div>{nome}</div>
      <div className="text-xs text-muted-foreground tabular-nums">
        {mensal != null ? `${formatarReais(mensal)}/mês` : 'sem cobrança'}
      </div>
    </TableCell>
  );
}

// Só os não cancelados contam; o total aparece no tooltip quando diverge,
// para não parecer que sumiu título.
function CelulaTitulos({ m }: { m?: MetricaEmpresa }) {
  if (!m) return <TableCell className="text-right text-muted-foreground">—</TableCell>;
  const uso = calcularUso(m.titulos_ativos, m.limite_titulos);
  const temCancelados = m.titulos_total !== m.titulos_ativos;
  return (
    <TableCell className="text-right tabular-nums"
      title={temCancelados ? `${m.titulos_total} no total (inclui cancelados)` : undefined}>
      <div>
        {formatarNumero(uso.usados)}
        {uso.limite !== null && <span className="text-muted-foreground"> / {formatarNumero(uso.limite)}</span>}
      </div>
      <BarraDeUso uso={uso} className="mt-1 ml-auto w-24" />
    </TableCell>
  );
}

interface LinhaProps {
  c: CompanyRow;
  m?: MetricaEmpresa;
  cobranca?: CobrancaDaEmpresa;
  onGerenciar: (c: CompanyRow) => void;
}

function LinhaEmpresa({ c, m, cobranca, onGerenciar }: LinhaProps) {
  return (
    <TableRow className="cursor-pointer" onClick={() => onGerenciar(c)}>
      <TableCell>
        <div className="font-medium">{c.nome}</div>
        {c.cnpj && <div className="text-xs text-muted-foreground tabular-nums">{formatCpfCnpj(c.cnpj)}</div>}
      </TableCell>
      <CelulaSituacao c={c} cobranca={cobranca} />
      <CelulaPlano c={c} cobranca={cobranca} />
      <CelulaTitulos m={m} />
      <TableCell className="hidden lg:table-cell text-muted-foreground">{fmtAtividade(m?.ultima_atividade ?? null)}</TableCell>
      <TableCell className="hidden xl:table-cell text-right tabular-nums">{m?.usuarios ?? '—'}</TableCell>
      <TableCell>
        <div className="flex items-center justify-end gap-2">
          {c.status === 'pendente' && <BotaoStatusEmpresa empresa={c} />}
          <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); onGerenciar(c); }}>
            Gerenciar <ChevronRight className="ml-1 h-4 w-4" />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}

export interface ContagemFiltros {
  todas: number;
  atencao: number;
  pendente: number;
  ativa: number;
  suspensa: number;
}

const FILTROS: { valor: FiltroEmpresas; rotulo: string }[] = [
  { valor: 'todas', rotulo: 'Todas' },
  { valor: 'atencao', rotulo: 'Precisam de atenção' },
  { valor: 'pendente', rotulo: 'Aguardando aprovação' },
  { valor: 'ativa', rotulo: 'Ativas' },
  { valor: 'suspensa', rotulo: 'Suspensas' },
];

interface Props {
  empresas: CompanyRow[];
  metricas: Map<string, MetricaEmpresa>;
  cobranca: Map<string, CobrancaDaEmpresa>;
  isLoading: boolean;
  filtro: FiltroEmpresas;
  onFiltro: (f: FiltroEmpresas) => void;
  busca: string;
  onBusca: (b: string) => void;
  contagem: ContagemFiltros;
  onGerenciar: (c: CompanyRow) => void;
}

function CorpoTabela({ empresas, metricas, cobranca, isLoading, onGerenciar }: Pick<Props, 'empresas' | 'metricas' | 'cobranca' | 'isLoading' | 'onGerenciar'>) {
  if (isLoading) return <CarregandoSecao className="h-32" />;
  if (empresas.length === 0) {
    return <p className="py-8 text-center text-muted-foreground">Nenhuma empresa encontrada com estes filtros.</p>;
  }
  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Empresa</TableHead>
            <TableHead>Situação</TableHead>
            <TableHead>Plano</TableHead>
            <TableHead className="text-right">Títulos</TableHead>
            <TableHead className="hidden lg:table-cell">Último uso</TableHead>
            <TableHead className="hidden xl:table-cell text-right">Usuários</TableHead>
            <TableHead className="text-right">Ações</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {empresas.map((c) => (
            <LinhaEmpresa key={c.id} c={c} m={metricas.get(c.id)} cobranca={cobranca.get(c.id)} onGerenciar={onGerenciar} />
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export function EmpresasTabela({ filtro, onFiltro, busca, onBusca, contagem, ...resto }: Props) {
  return (
    <Card>
      <CardHeader className="gap-3">
        <div>
          <CardTitle>Empresas</CardTitle>
          <p className="text-xs text-muted-foreground">Clique numa empresa para ver e mudar plano, cobrança e integração.</p>
        </div>
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={busca} onChange={(e) => onBusca(e.target.value)} placeholder="Buscar por nome ou CNPJ" className="pl-9" />
        </div>
        <Tabs value={filtro} onValueChange={(v) => onFiltro(v as FiltroEmpresas)}>
          <TabsList variant="pill">
            {FILTROS.map((f) => (
              <TabsTrigger key={f.valor} value={f.valor}>{f.rotulo} ({contagem[f.valor]})</TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </CardHeader>
      <CardContent>
        <CorpoTabela {...resto} />
      </CardContent>
    </Card>
  );
}
