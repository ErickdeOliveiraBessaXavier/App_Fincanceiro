import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { StatusBadge } from '@/components/StatusBadge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Handshake, AlertTriangle, FileText, ChevronDown, ChevronRight } from 'lucide-react';
import { format, differenceInDays } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';

interface Parcela {
  id: string;
  titulo_id: string;
  numero_parcela: number;
  valor_nominal: number;
  vencimento: string;
  saldo_atual: number;
  total_pago: number;
  status: string;
}

interface TituloMeta {
  numero_documento?: string;
  quantidade_parcelas?: number;
}

interface TituloGrupo {
  tituloId: string;
  numeroDocumento?: string;
  totalParcelas: number;
  parcelas: Parcela[];
  valorTotal: number;
  valorEmAberto: number;
  parcelasAbertas: number;
  temVencido: boolean;
}

interface TitulosClienteProps {
  clienteId: string;
}

// ===================== Helpers puros =====================
const formatCurrency = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

const calcularAtraso = (vencimento: string) => {
  const dias = differenceInDays(new Date(), new Date(vencimento));
  return dias > 0 ? dias : 0;
};

const isAberta = (status: string) => status === 'a_vencer' || status === 'vencido';

function situacaoTitulo(grupo: TituloGrupo): { label: string; variant: 'destructive' | 'secondary' | 'outline' } {
  if (grupo.temVencido) return { label: 'Vencido', variant: 'destructive' };
  if (grupo.parcelasAbertas === 0) return { label: 'Quitado', variant: 'outline' };
  return { label: 'Em dia', variant: 'secondary' };
}

function ordenarGrupos(grupos: TituloGrupo[]): TituloGrupo[] {
  return grupos.sort((a, b) => {
    if (a.temVencido !== b.temVencido) return a.temVencido ? -1 : 1;
    return b.valorEmAberto - a.valorEmAberto;
  });
}

// Agrupa as parcelas por título, mesclando os metadados do título (nº doc, qtd parcelas).
function agruparPorTitulo(parcelas: Parcela[], meta: Map<string, TituloMeta>): TituloGrupo[] {
  const grupos = new Map<string, TituloGrupo>();

  for (const parcela of parcelas) {
    let grupo = grupos.get(parcela.titulo_id);
    if (!grupo) {
      const m = meta.get(parcela.titulo_id);
      grupo = {
        tituloId: parcela.titulo_id,
        numeroDocumento: m?.numero_documento,
        totalParcelas: m?.quantidade_parcelas || 0,
        parcelas: [],
        valorTotal: 0,
        valorEmAberto: 0,
        parcelasAbertas: 0,
        temVencido: false,
      };
      grupos.set(parcela.titulo_id, grupo);
    }

    grupo.parcelas.push(parcela);
    grupo.valorTotal += Number(parcela.valor_nominal);
    if (isAberta(parcela.status)) {
      grupo.valorEmAberto += Number(parcela.saldo_atual);
      grupo.parcelasAbertas += 1;
    }
    if (parcela.status === 'vencido') grupo.temVencido = true;
  }

  return ordenarGrupos(Array.from(grupos.values()));
}

// ===================== Subcomponentes =====================
function ResumoItem({ label, valor, destaque }: { label: string; valor: string; destaque?: boolean }) {
  return (
    <div className="min-w-0">
      <p className="text-muted-foreground">{label}</p>
      <p className={cn('font-medium truncate', destaque && 'text-destructive font-bold')}>{valor}</p>
    </div>
  );
}

function ParcelaRow({ parcela, totalParcelas }: { parcela: Parcela; totalParcelas: number }) {
  const atraso = calcularAtraso(parcela.vencimento);
  const isVencida = parcela.status === 'vencido';

  return (
    <TableRow>
      <TableCell className="font-medium">
        {parcela.numero_parcela}{totalParcelas > 1 ? `/${totalParcelas}` : ''}
      </TableCell>
      <TableCell>{format(new Date(parcela.vencimento), 'dd/MM/yyyy')}</TableCell>
      <TableCell>{formatCurrency(parcela.valor_nominal)}</TableCell>
      <TableCell className="font-medium">{formatCurrency(parcela.saldo_atual)}</TableCell>
      <TableCell>
        {isVencida ? (
          <span className="flex items-center gap-1 text-destructive">
            <AlertTriangle className="h-3 w-3" />
            {atraso} dias
          </span>
        ) : (
          <span className="text-muted-foreground">-</span>
        )}
      </TableCell>
      <TableCell>
        <StatusBadge domain="parcela" status={parcela.status} />
      </TableCell>
    </TableRow>
  );
}

interface TituloGrupoCardProps {
  grupo: TituloGrupo;
  isExpanded: boolean;
  onToggle: () => void;
  onAcordo: () => void;
}
function TituloGrupoCard({ grupo, isExpanded, onToggle, onAcordo }: TituloGrupoCardProps) {
  const situacao = situacaoTitulo(grupo);
  const totalParcelas = grupo.totalParcelas || grupo.parcelas.length;

  return (
    <div className="bg-card">
      <div className="flex items-start gap-3 p-3">
        <button
          type="button"
          onClick={onToggle}
          className="flex flex-1 items-start gap-3 text-left min-w-0"
          aria-expanded={isExpanded}
        >
          <span className="mt-0.5 text-muted-foreground shrink-0">
            {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </span>

          <div className="flex-1 min-w-0 space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="text-sm font-semibold">
                Título {grupo.numeroDocumento ? `#${grupo.numeroDocumento}` : 'avulso'}
              </span>
              <Badge variant={situacao.variant} className="text-xs">
                {grupo.temVencido && <AlertTriangle className="h-3 w-3 mr-1" />}
                {situacao.label}
              </Badge>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-1.5 text-xs">
              <ResumoItem label="Parcelas" valor={`${grupo.parcelasAbertas} de ${totalParcelas}`} />
              <ResumoItem label="Valor total" valor={formatCurrency(grupo.valorTotal)} />
              <ResumoItem label="Em aberto" valor={formatCurrency(grupo.valorEmAberto)} destaque />
              <ResumoItem
                label="Situação"
                valor={grupo.parcelasAbertas > 0 ? `${grupo.parcelasAbertas} em aberto` : 'Sem pendências'}
              />
            </div>
          </div>
        </button>

        {grupo.parcelasAbertas > 0 && (
          <Button size="sm" variant="outline" className="shrink-0" onClick={onAcordo}>
            <Handshake className="h-4 w-4 mr-1" />
            Acordo
          </Button>
        )}
      </div>

      {isExpanded && (
        <div className="ml-9 mr-3 mb-3 rounded-lg border border-l-2 border-dashed border-l-primary/40 bg-muted/30 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Parcela</TableHead>
                <TableHead>Vencimento</TableHead>
                <TableHead>Valor Original</TableHead>
                <TableHead>Saldo</TableHead>
                <TableHead>Atraso</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {grupo.parcelas.map((parcela) => (
                <ParcelaRow key={parcela.id} parcela={parcela} totalParcelas={totalParcelas} />
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

// ===================== Componente principal =====================
export function TitulosCliente({ clienteId }: TitulosClienteProps) {
  const [grupos, setGrupos] = useState<TituloGrupo[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandidos, setExpandidos] = useState<Set<string>>(new Set());
  const navigate = useNavigate();

  useEffect(() => {
    fetchParcelas();
  }, [clienteId]);

  const fetchParcelas = async () => {
    try {
      setLoading(true);

      const { data: titulos, error: titulosError } = await supabase
        .from('vw_titulos_completos')
        .select('id, numero_documento, quantidade_parcelas')
        .eq('cliente_id', clienteId);

      if (titulosError) throw titulosError;

      if (!titulos || titulos.length === 0) {
        setGrupos([]);
        return;
      }

      const meta = new Map<string, TituloMeta>(
        titulos.map((t) => [
          t.id as string,
          { numero_documento: t.numero_documento || undefined, quantidade_parcelas: t.quantidade_parcelas || undefined },
        ])
      );

      const { data: parcelasData, error: parcelasError } = await supabase
        .from('vw_parcelas_consolidadas')
        .select('*')
        .in('titulo_id', Array.from(meta.keys()))
        .order('numero_parcela', { ascending: true });

      if (parcelasError) throw parcelasError;

      setGrupos(agruparPorTitulo(parcelasData || [], meta));
    } catch (error) {
      console.error('Erro ao carregar parcelas:', error);
    } finally {
      setLoading(false);
    }
  };

  const toggleExpand = (tituloId: string) => {
    const novo = new Set(expandidos);
    if (novo.has(tituloId)) {
      novo.delete(tituloId);
    } else {
      novo.add(tituloId);
    }
    setExpandidos(novo);
  };

  const totalEmAberto = grupos.reduce((sum, g) => sum + g.valorEmAberto, 0);

  const irParaAcordo = (tituloId: string) => {
    navigate('/acordos', {
      state: { clienteId, tituloIds: [tituloId], valorTotal: totalEmAberto },
    });
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="py-8">
          <div className="flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Títulos e Parcelas
          </CardTitle>
          <div className="text-right">
            <p className="text-sm text-muted-foreground">Total em Aberto</p>
            <p className="text-xl font-bold text-destructive">{formatCurrency(totalEmAberto)}</p>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {grupos.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <FileText className="h-12 w-12 mx-auto mb-2 opacity-50" />
            <p>Nenhum título encontrado</p>
          </div>
        ) : (
          <div className="border rounded-lg divide-y">
            {grupos.map((grupo) => (
              <TituloGrupoCard
                key={grupo.tituloId}
                grupo={grupo}
                isExpanded={expandidos.has(grupo.tituloId)}
                onToggle={() => toggleExpand(grupo.tituloId)}
                onAcordo={() => irParaAcordo(grupo.tituloId)}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
