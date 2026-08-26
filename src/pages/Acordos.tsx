import { useState, useEffect, useMemo, type ReactNode } from 'react';
import { PageHeader } from '@/components/PageHeader';
import { CarregandoConteudo } from '@/components/TelaCarregamento';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { Plus, Eye, Ban, FileText, CheckCircle, TrendingUp, Loader2, Trash2, Banknote, Undo2 } from 'lucide-react';
import { useAcordos, useCancelAcordo, useHardDeleteAcordos, useParcelasAcordo, type AcordoRow, type ParcelaAcordoRow } from '@/lib/queries/acordos';
import { ConfirmarAcaoDestrutiva } from '@/components/ConfirmarAcaoDestrutiva';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { StatusBadge } from '@/components/StatusBadge';
import { ResumoNumeros } from '@/components/ResumoNumeros';
import { GlobalFilter } from '@/components/GlobalFilter';
import { useGlobalFilter } from '@/hooks/useGlobalFilter';
import { acordosFilterConfig } from '@/constants/filterConfigs';
import { acordosPresets } from '@/constants/filterPresets';
import { createAcordosFilterFunctions } from '@/utils/filterFunctions';
import { formatCpfCnpj, formatData, parseDataLocal } from '@/utils/format';
import { hojeIso } from '@/domain/telecobranca/statusCobranca';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useUserRole } from '@/hooks/useUserRole';
import { usePagination, PARAM_PAGINA } from '@/hooks/usePagination';
import { TablePagination } from '@/components/TablePagination';
import { NovoAcordoDialog } from '@/components/acordos/NovoAcordoDialog';
import { BaixaParcelaAcordoModal, type ModoBaixa } from '@/components/acordos/BaixaParcelaAcordoModal';
import { OrigemDoAcordo } from '@/components/acordos/OrigemDoAcordo';
import { cn } from '@/lib/utils';
import { resumoNegociacao, type TipoNegociacao } from '@/domain/acordos/negociacao';
import { codigoAcordo } from '@/domain/acordos/identificacao';
import { useAbrirFicha } from '@/hooks/useFilaNavegacao';

interface Acordo {
  id: string;
  titulo_id: string;
  cliente_id: string;
  valor_original: number;
  valor_acordo: number;
  desconto: number;
  parcelas: number;
  valor_parcela: number;
  data_acordo: string;
  data_vencimento_primeira_parcela: string;
  status: 'ativo' | 'cumprido' | 'quebrado' | 'cancelado';
  observacoes?: string;
  created_by: string;
  created_at: string;
  updated_at: string;
  titulo: {
    id: string;
    valor_original: number;
    vencimento_original: string;
    numero_documento?: string;
  };
  cliente: {
    id: string;
    nome: string;
    cpf_cnpj: string;
  };
}

interface LocationState {
  clienteId?: string;
  tituloIds?: string[];
  valorTotal?: number;
}

// ===================== Helpers puros =====================
const formatCurrency = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

/** Parâmetro de URL que abre os detalhes de um acordo. */
const PARAM_ACORDO = 'id';

// Largura dos modais de acordo. O respiro lateral no mobile vem da base
// (ui/dialog.tsx); aqui só liberamos a largura no desktop — 75vw é o token de
// "modal largo" já usado em Clientes.tsx — e apertamos o padding no celular.
const MODAL_LARGO = 'sm:max-w-[75vw] max-h-[90vh] overflow-y-auto p-4 sm:p-6';
// Detalhes do acordo: altura fixa e SEM rolagem própria — quem rola é a lista de
// parcelas, dentro do painel dela. Antes o modal inteiro rolava e o cabeçalho do
// acordo (cliente, valores) saía da tela junto com a lista.
const MODAL_DETALHES =
  'sm:max-w-[75vw] max-h-[90vh] xl:h-[90vh] p-4 sm:p-6 flex flex-col overflow-hidden';
// Modais de confirmação: não esticam no desktop.
const MODAL_ESTREITO = 'sm:max-w-md p-4 sm:p-6';

// Par rótulo/valor usado nas fichas de leitura do modal de detalhes.
function CampoDetalhe({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <div className="font-medium break-words">{children}</div>
    </div>
  );
}

function TituloSecao({ children }: { children: ReactNode }) {
  return (
    <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
      {children}
    </h4>
  );
}

/**
 * Números de documento dos títulos incluídos no acordo.
 *
 * Um acordo pode consolidar vários títulos; a coluna mostrava só o vínculo
 * legado `titulo_id`. Acima de dois, resume para não estourar a coluna.
 */
function documentosDoAcordo(acordo: AcordoRow): string[] {
  const documentos = (acordo.titulos ?? [])
    .map((t) => t.numero_documento)
    .filter((n): n is string => !!n);
  if (documentos.length > 0) return documentos;

  const legado = acordo.titulo?.numero_documento;
  return legado ? [legado] : [];
}

function DocumentosDoAcordo({ acordo }: { acordo: AcordoRow }) {
  const lista = documentosDoAcordo(acordo);

  if (lista.length === 0) return <span className="text-muted-foreground">-</span>;
  if (lista.length <= 2) return <>{lista.join(', ')}</>;

  return (
    <span title={lista.join(', ')}>
      {lista[0]} <span className="text-muted-foreground">+{lista.length - 1}</span>
    </span>
  );
}

// O status vem de vw_parcelas_acordo_consolidadas, que já deriva paga/vencida/
// pendente do saldo e da data. Antes a tela recalculava por conta porque a
// coluna `status` da tabela ficava presa em 'pendente'.
const parcelaQuitada = (p: ParcelaAcordoRow) => p.saldo_atual <= 0;

interface ResumoParcelas {
  total: number;
  pagas: number;
  valorPago: number;
  saldo: number;
  proximoVencimento: string | null;
}
function resumoParcelasAcordo(parcelas: ParcelaAcordoRow[]): ResumoParcelas {
  let pagas = 0;
  let valorPago = 0;
  let saldo = 0;
  let proximo: string | null = null;
  for (const p of parcelas) {
    // Valor RECEBIDO e saldo REAL, não o previsto no cronograma: é a diferença
    // entre relatar o que entrou e relatar o que deveria ter entrado.
    valorPago += Number(p.total_pago);
    saldo += Math.max(0, Number(p.saldo_atual));
    if (parcelaQuitada(p)) {
      pagas += 1;
    } else if (!proximo || p.data_vencimento < proximo) {
      proximo = p.data_vencimento;
    }
  }
  return { total: parcelas.length, pagas, valorPago, saldo, proximoVencimento: proximo };
}

function ResumoParcelasCards({ resumo }: { resumo: ResumoParcelas }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
      <div>
        <Label className="text-muted-foreground">Progresso</Label>
        <p className="font-medium">{resumo.pagas}/{resumo.total} pagas</p>
      </div>
      <div>
        <Label className="text-muted-foreground">Valor pago</Label>
        <p className="font-medium text-primary">{formatCurrency(resumo.valorPago)}</p>
      </div>
      <div>
        <Label className="text-muted-foreground">Saldo restante</Label>
        <p className="font-medium text-destructive">{formatCurrency(resumo.saldo)}</p>
      </div>
      <div>
        <Label className="text-muted-foreground">Próx. vencimento</Label>
        <p className="font-medium">{resumo.proximoVencimento ? formatData(resumo.proximoVencimento) : '—'}</p>
      </div>
    </div>
  );
}

interface AcaoParcela {
  parcela: ParcelaAcordoRow;
  modo: ModoBaixa;
}

interface ParcelaAcordoRowProps {
  parcela: ParcelaAcordoRow;
  podeOperar: boolean;
  podeEstornar: boolean;
  onAcao: (acao: AcaoParcela) => void;
}

/**
 * Ação disponível para a parcela: baixar o que está em aberto, ou desfazer a
 * baixa do que já foi pago. As duas abrem o mesmo modal, em modos diferentes.
 *
 * `compacto` troca o rótulo por ícone: com o texto inteiro, a coluna de ações
 * sozinha levava a tabela a ~150px além da largura do modal, e a linha só cabia
 * com rolagem horizontal. Nos cards (mobile) o texto continua.
 */
function AcoesParcelaAcordo({ parcela, podeOperar, podeEstornar, onAcao, compacto }: ParcelaAcordoRowProps & {
  compacto?: boolean;
}) {
  // Com o razão, as duas ações podem coexistir: uma parcela com pagamento
  // parcial ainda recebe baixa E já tem lançamento passível de estorno.
  const temLancamento = parcela.total_pago > 0 || parcela.encargos > 0 || parcela.descontos > 0;
  const emAberto = !parcelaQuitada(parcela);

  return (
    <div className="flex items-center justify-end gap-1">
      {podeOperar && emAberto && (
        <BotaoAcaoParcela
          compacto={compacto}
          rotulo="Registrar pagamento"
          icone={Banknote}
          variant="outline"
          onClick={() => onAcao({ parcela, modo: 'pagar' })}
        />
      )}
      {podeEstornar && temLancamento && (
        <BotaoAcaoParcela
          compacto={compacto}
          rotulo="Estornar"
          icone={Undo2}
          variant="ghost"
          onClick={() => onAcao({ parcela, modo: 'estornar' })}
        />
      )}
    </div>
  );
}

/** Botão de ação da parcela: ícone com tooltip na tabela, texto no card. */
function BotaoAcaoParcela({ compacto, rotulo, icone: Icone, variant, onClick }: {
  compacto?: boolean;
  rotulo: string;
  icone: typeof Banknote;
  variant: 'outline' | 'ghost';
  onClick: () => void;
}) {
  if (!compacto) {
    return (
      <Button size="sm" variant={variant} className="h-8" onClick={onClick}>
        {rotulo}
      </Button>
    );
  }
  return (
    <Button size="sm" variant={variant} className="h-8 w-8 p-0" title={rotulo} onClick={onClick}>
      <Icone className="h-4 w-4" />
      <span className="sr-only">{rotulo}</span>
    </Button>
  );
}

/**
 * Recebido na parcela, com o encargo de atraso explícito.
 *
 * Sem a segunda linha, uma parcela de R$ 1.000 que recebeu R$ 1.010 pareceria
 * erro de digitação — é justamente o caso que motivou o razão.
 */
function ValorRecebido({ parcela }: { parcela: ParcelaAcordoRow }) {
  if (parcela.total_pago <= 0) return <span className="text-muted-foreground">—</span>;
  return (
    <div>
      <div className="font-medium">{formatCurrency(parcela.total_pago)}</div>
      {parcela.encargos > 0 && (
        <div className="text-[11px] text-amber-600">
          inclui {formatCurrency(parcela.encargos)} de encargo
        </div>
      )}
      {parcela.descontos > 0 && (
        <div className="text-[11px] text-green-600">
          {formatCurrency(parcela.descontos)} de desconto
        </div>
      )}
    </div>
  );
}

// Forma da parcela no MOBILE: a tabela de 7 colunas não cabe em tela de celular
// sem rolagem horizontal, então lá cada parcela vira um card.
function ParcelaAcordoCard(props: ParcelaAcordoRowProps) {
  const { parcela } = props;
  return (
    <div className="rounded-lg border p-3 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium">Parcela {parcela.numero_parcela}</span>
        <StatusBadge domain="parcela_acordo" status={parcela.status} />
      </div>

      <div className="grid grid-cols-2 gap-3 text-sm">
        <CampoDetalhe label="Vencimento">{formatData(parcela.data_vencimento)}</CampoDetalhe>
        <CampoDetalhe label="Valor">{formatCurrency(parcela.valor_total)}</CampoDetalhe>
        <CampoDetalhe label="Recebido">
          <ValorRecebido parcela={parcela} />
        </CampoDetalhe>
        <CampoDetalhe label="Saldo">
          <span className={parcela.saldo_atual > 0 ? 'text-destructive' : ''}>
            {formatCurrency(Math.max(0, parcela.saldo_atual))}
          </span>
        </CampoDetalhe>
      </div>

      <div className="[&>button]:w-full">
        <AcoesParcelaAcordo {...props} />
      </div>
    </div>
  );
}

function ParcelaAcordoTableRow(props: ParcelaAcordoRowProps) {
  const { parcela, podeOperar, podeEstornar } = props;
  return (
    <TableRow className="[&>td]:whitespace-nowrap">
      <TableCell className="font-medium">{parcela.numero_parcela}</TableCell>
      <TableCell>{formatData(parcela.data_vencimento)}</TableCell>
      <TableCell>{formatCurrency(parcela.valor_total)}</TableCell>
      <TableCell><ValorRecebido parcela={parcela} /></TableCell>
      <TableCell className={parcela.saldo_atual > 0 ? 'text-destructive' : 'text-muted-foreground'}>
        {formatCurrency(Math.max(0, parcela.saldo_atual))}
      </TableCell>
      <TableCell>
        <StatusBadge domain="parcela_acordo" status={parcela.status} />
      </TableCell>
      {(podeOperar || podeEstornar) && (
        <TableCell className="text-right">
          <AcoesParcelaAcordo {...props} compacto />
        </TableCell>
      )}
    </TableRow>
  );
}

interface ParcelasAcordoListaProps {
  parcelas: ParcelaAcordoRow[];
  podeOperar: boolean;
  podeEstornar: boolean;
  onAcao: (acao: AcaoParcela) => void;
}
// Duas formas do mesmo dado: tabela a partir de md, cards abaixo disso.
function ParcelasAcordoLista({ parcelas, podeOperar, podeEstornar, onAcao }: ParcelasAcordoListaProps) {
  const comuns = (p: ParcelaAcordoRow) => ({ parcela: p, podeOperar, podeEstornar, onAcao });

  return (
    <>
      {/* A tabela só entra a partir de lg. Entre md e lg o modal tem ~530px de
          conteúdo e a tabela precisa de ~600 — ali os cards cabem melhor do que
          uma tabela com rolagem horizontal.

          A altura vai para o wrapper interno do <Table> ([&>div]), que é quem
          tem o overflow: assim a lista rola dentro do painel (um acordo de 24
          parcelas não empurra mais o modal inteiro) e o cabeçalho pode grudar.
          Em xl a altura vem do flex — a coluna ocupa o modal todo. */}
      <div className={cn(
        'hidden lg:block rounded-md border min-h-0',
        '[&>div]:max-h-[24rem] xl:flex-1 xl:[&>div]:max-h-none xl:[&>div]:h-full',
        // Padding menor que o padrão (px-4): são 7 colunas, e só o respiro das
        // células respondia por ~110px — o bastante para a tabela não caber.
        '[&_th]:px-2 [&_td]:px-2',
      )}>
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-background">
            <TableRow className="[&>th]:whitespace-nowrap">
              <TableHead>Parcela</TableHead>
              <TableHead>Vencimento</TableHead>
              <TableHead>Previsto</TableHead>
              <TableHead>Recebido</TableHead>
              <TableHead>Saldo</TableHead>
              <TableHead>Status</TableHead>
              {(podeOperar || podeEstornar) && <TableHead className="text-right">Ações</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {parcelas.map((p) => (
              <ParcelaAcordoTableRow key={p.id} {...comuns(p)} />
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="lg:hidden max-h-[24rem] overflow-y-auto space-y-2">
        {parcelas.map((p) => (
          <ParcelaAcordoCard key={p.id} {...comuns(p)} />
        ))}
      </div>
    </>
  );
}

function ParcelasAcordoSecao({ acordoId, open, acordoCancelado }: {
  acordoId: string | null;
  open: boolean;
  acordoCancelado: boolean;
}) {
  const { data: parcelas = [], isLoading } = useParcelasAcordo(acordoId, open);
  const { isOperador, isAdmin } = useUserRole();
  const [acao, setAcao] = useState<AcaoParcela | null>(null);

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Carregando parcelas...</p>;
  }
  if (parcelas.length === 0) {
    return <p className="text-sm text-muted-foreground">Nenhuma parcela cadastrada para este acordo.</p>;
  }

  return (
    // Em xl a seção herda a altura da coluna: o resumo fica parado no topo e só
    // a lista rola.
    <div className="space-y-3 xl:flex xl:h-full xl:min-h-0 xl:flex-col">
      <ResumoParcelasCards resumo={resumoParcelasAcordo(parcelas)} />
      <ParcelasAcordoLista
        parcelas={parcelas}
        podeOperar={isOperador && !acordoCancelado}
        podeEstornar={isAdmin && !acordoCancelado}
        onAcao={setAcao}
      />
      <BaixaParcelaAcordoModal
        parcela={acao?.parcela ?? null}
        modo={acao?.modo ?? 'pagar'}
        onFechar={() => setAcao(null)}
      />
    </div>
  );
}

interface AcordoDetailsDialogProps {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  acordo: AcordoRow | null;
}
// Rótulos do resumo da negociação. O caso neutro reaproveita 'Desconto' e é
// exibido como '—'.
const ROTULO_NEGOCIACAO: Record<TipoNegociacao, string> = {
  desconto: 'Desconto',
  acrescimo: 'Acréscimo',
  neutro: 'Desconto',
};

// Ficha de leitura do acordo (coluna estreita no desktop). Pares rótulo/valor
// curtos ficam em 2 colunas enquanto a ficha é larga, e empilham quando ela vira
// sidebar em lg.
function FichaAcordo({ acordo, aberto }: { acordo: AcordoRow; aberto: boolean }) {
  // Derivado dos valores gravados, e não da coluna `desconto`: ela é limitada a
  // 0..100 e não representa acordos fechados acima do débito.
  const negociacao = resumoNegociacao(acordo.valor_original, acordo.valor_acordo);

  return (
    <div className="space-y-5">
      <section className="space-y-2">
        <TituloSecao>Negociação</TituloSecao>
        <div className="grid grid-cols-2 xl:grid-cols-1 gap-3">
          <CampoDetalhe label="Valor original">{formatCurrency(acordo.valor_original)}</CampoDetalhe>
          <CampoDetalhe label="Valor do acordo">
            <span className="text-primary">{formatCurrency(acordo.valor_acordo)}</span>
          </CampoDetalhe>
          <CampoDetalhe label={ROTULO_NEGOCIACAO[negociacao.tipo]}>
            {negociacao.tipo === 'neutro'
              ? '—'
              : `${formatCurrency(negociacao.valor)} (${negociacao.percentual.toFixed(1)}%)`}
          </CampoDetalhe>
        </div>
      </section>

      <section className="space-y-2">
        <TituloSecao>Plano de pagamento</TituloSecao>
        <div className="grid grid-cols-2 xl:grid-cols-1 gap-3">
          <CampoDetalhe label="Parcelas">
            {acordo.parcelas}x de {formatCurrency(acordo.valor_parcela)}
          </CampoDetalhe>
          <CampoDetalhe label="Data do acordo">{formatData(acordo.data_acordo)}</CampoDetalhe>
          <CampoDetalhe label="1ª parcela">
            {formatData(acordo.data_vencimento_primeira_parcela)}
          </CampoDetalhe>
        </div>
      </section>

      <section className="space-y-2">
        <TituloSecao>Origem (o que foi renegociado)</TituloSecao>
        <OrigemDoAcordo
          acordoId={acordo.id}
          aberto={aberto}
          documentos={documentosDoAcordo(acordo)}
        />
      </section>

      {acordo.observacoes && (
        <section className="space-y-2">
          <TituloSecao>Observações</TituloSecao>
          <p className="text-sm break-words">{acordo.observacoes}</p>
        </section>
      )}
    </div>
  );
}

function AcordoDetailsDialog({ open, onOpenChange, acordo }: AcordoDetailsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={MODAL_DETALHES}>
        <DialogHeader>
          <DialogTitle>Detalhes do Acordo</DialogTitle>
          <DialogDescription>
            Condições do acordo, parcelas e situação atual.
          </DialogDescription>
        </DialogHeader>
        {acordo && (
          <div className="flex min-h-0 flex-1 flex-col gap-5">
            {/* Identidade do registro: de quem é e em que pé está. */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-3">
              <div className="min-w-0">
                <Label className="text-xs text-muted-foreground">Cliente</Label>
                <p className="text-base font-semibold break-words">{acordo.cliente?.nome}</p>
                {/* Código curto para citar o acordo + id completo para suporte. */}
                <p className="mt-1 font-mono text-xs text-muted-foreground break-all select-all">
                  Acordo {codigoAcordo(acordo.id)} · {acordo.id}
                </p>
              </div>
              <StatusBadge domain="acordo" status={acordo.status} />
            </div>

            {/* A ficha só vira coluna lateral em xl. Abaixo disso ela roubava
                largura da tabela de parcelas, que tem 7 colunas e é o conteúdo
                que não cabe — em lg a ficha vai para cima, em largura inteira.

                Em xl as duas colunas têm a altura do modal e cada uma cuida da
                própria rolagem; empilhado, é o corpo que rola, porque aí a ficha
                inteira em cima não caberia de jeito nenhum. */}
            <div className="grid min-h-0 flex-1 gap-6 overflow-y-auto xl:grid-cols-4 xl:overflow-visible">
              <div className="xl:col-span-1 min-w-0 xl:h-full xl:overflow-y-auto xl:pr-2">
                <FichaAcordo acordo={acordo} aberto={open} />
              </div>

              {/* min-w-0 deixa a tabela encolher dentro do grid em vez de estourar. */}
              <div className="xl:col-span-3 min-w-0 space-y-2 xl:flex xl:h-full xl:min-h-0 xl:flex-col">
                <TituloSecao>Parcelas do acordo</TituloSecao>
                <ParcelasAcordoSecao
                  acordoId={acordo.id}
                  open={open}
                  acordoCancelado={acordo.status === 'cancelado'}
                />
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

interface ConfirmAcordoActionDialogProps {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onCancel: () => void;
  onConfirm: () => void;
  isPending: boolean;
}
function CancelAcordoDialog({ open, onOpenChange, onCancel, onConfirm, isPending }: ConfirmAcordoActionDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={MODAL_ESTREITO}>
        <DialogHeader>
          <DialogTitle>Cancelar Acordo</DialogTitle>
          <DialogDescription>
            O acordo será marcado como <strong>cancelado</strong> e os títulos vinculados
            voltarão a ficar disponíveis. O registro permanece no histórico.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel} disabled={isPending}>
            Voltar
          </Button>
          <Button variant="destructive" onClick={onConfirm} disabled={isPending}>
            {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Cancelar Acordo
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function Acordos() {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const preSelectedData = location.state as LocationState | null;

  const { toast } = useToast();

  // === Data via React Query ===
  const { data: acordos = [], isLoading: loading } = useAcordos();
  const cancelAcordoMutation = useCancelAcordo();
  const hardDeleteAcordoMutation = useHardDeleteAcordos();

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
  const [selectedAcordo, setSelectedAcordo] = useState<AcordoRow | null>(null);
  const [acordoToCancel, setAcordoToCancel] = useState<AcordoRow | null>(null);
  const [acordoToHardDelete, setAcordoToHardDelete] = useState<AcordoRow | null>(null);

  // Vendedor é read-only: escondemos as ações de escrita.
  // Cancelar e excluir exigem admin (RLS acordos_update / RPCs de acordo).
  const { isOperador, isAdmin } = useUserRole();

  // Compatibilidade: a ficha do cliente hoje abre o modal no lugar, mas links
  // antigos (e o histórico do navegador) ainda podem chegar aqui com o cliente
  // no state.
  //
  // Depende do ID, não do objeto de state: `location.state` troca de identidade
  // a cada navegação (inclusive a que só mexe na query string dos filtros), e
  // isso reabriria o modal depois de o usuário fechá-lo.
  const clientePreSelecionado = preSelectedData?.clienteId;
  useEffect(() => {
    if (clientePreSelecionado) setIsCreateModalOpen(true);
  }, [clientePreSelecionado]);

  // Deep link ?id=<acordo>: abre os detalhes direto (ex.: link vindo da ficha
  // do cliente). O `id` sai da URL ao fechar — enquanto ele ficava lá, qualquer
  // mexida em filtro gerava novo searchParams, este efeito rodava de novo e o
  // modal reabria sozinho.
  const acordoParam = searchParams.get(PARAM_ACORDO);
  useEffect(() => {
    if (!acordoParam || acordos.length === 0) return;
    const alvo = acordos.find((a) => a.id === acordoParam);
    if (alvo) {
      setSelectedAcordo(alvo);
      setIsDetailsModalOpen(true);
    }
  }, [acordoParam, acordos]);

  const alterarParamAcordo = (id: string | null) => {
    setSearchParams((atual) => {
      const proximo = new URLSearchParams(atual);
      if (id) proximo.set(PARAM_ACORDO, id);
      else proximo.delete(PARAM_ACORDO);
      return proximo;
    }, { replace: true });
  };

  const abrirDetalhes = (acordo: AcordoRow) => {
    setSelectedAcordo(acordo);
    setIsDetailsModalOpen(true);
    alterarParamAcordo(acordo.id);
  };

  const fecharDetalhes = (aberto: boolean) => {
    setIsDetailsModalOpen(aberto);
    if (!aberto) alterarParamAcordo(null);
  };

  const handleHardDeleteAcordo = async () => {
    if (!acordoToHardDelete) return;
    try {
      await hardDeleteAcordoMutation.mutateAsync([acordoToHardDelete.id]);
      setAcordoToHardDelete(null);
      toast({ title: 'Sucesso', description: 'Acordo excluído definitivamente' });
    } catch (error) {
      console.error('Erro ao excluir acordo:', error);
      toast({
        title: 'Erro',
        description: error instanceof Error ? error.message : 'Não foi possível excluir o acordo',
        variant: 'destructive',
      });
    }
  };

  const handleCancelAcordo = async () => {
    if (!acordoToCancel) return;

    try {
      await cancelAcordoMutation.mutateAsync(acordoToCancel.id);

      setIsCancelModalOpen(false);
      setAcordoToCancel(null);

      toast({
        title: "Sucesso",
        description: "Acordo cancelado com sucesso",
      });

    } catch (error) {
      console.error('Erro ao cancelar acordo:', error);
      toast({
        title: "Erro",
        description: "Não foi possível cancelar o acordo",
        variant: "destructive",
      });
    }
  };

  // Filter functions for acordos
  const filterFunctions = useMemo(() => createAcordosFilterFunctions(), []);

  // Cards refletem o estado operacional: cancelados nunca entram nos totais
  // (independente do checkbox, que afeta apenas a listagem).
  const acordosNaoCancelados = useMemo(
    () => acordos.filter((a) => a.status !== 'cancelado'),
    [acordos]
  );

  const {
    filteredData: filteredAcordos,
    filters,
    setFilter,
    setFilters,
    clearFilter,
    clearAllFilters,
    hasActiveFilters,
    activeFiltersCount,
    resultCount,
    totalCount
  } = useGlobalFilter(acordos, filterFunctions);

  const pagination = usePagination(filteredAcordos, 25, JSON.stringify(filters), PARAM_PAGINA);

  // O mesmo cliente pode ter vários acordos: a fila da ficha é de clientes,
  // então cada um entra uma vez só, na ordem em que aparece na tabela.
  const abrirFicha = useAbrirFicha(
    useMemo(() => [...new Set(filteredAcordos.map((a) => a.cliente_id))], [filteredAcordos]),
  );

  if (loading) {
    return <CarregandoConteudo />;
  }

  return (
    <div className="space-y-10 animate-fade-in pb-10">
      <PageHeader
        title="Acordos"
        description="Gestão e acompanhamento de acordos de parcelamento."
      >
        {isOperador && (
          <Button 
            onClick={() => {
                      setIsCreateModalOpen(true);
            }}
          >
            <Plus className="h-4 w-4 mr-2" />
            Novo Acordo
          </Button>
        )}
      </PageHeader>

      <ResumoNumeros
        itens={[
          { rotulo: 'Acordos', valor: acordosNaoCancelados.length, icone: FileText },
          { rotulo: 'Ativos', valor: acordosNaoCancelados.filter(a => a.status === 'ativo').length, icone: CheckCircle, cor: 'text-blue-600' },
          { rotulo: 'Cumpridos', valor: acordosNaoCancelados.filter(a => a.status === 'cumprido').length, icone: CheckCircle, cor: 'text-success' },
          { rotulo: 'Valor negociado', valor: formatCurrency(acordosNaoCancelados.reduce((s, a) => s + a.valor_acordo, 0)), icone: TrendingUp },
        ]}
      />

      <Card className="overflow-hidden">
        <CardHeader className="pb-4 border-b border-border/50 bg-muted/20">
          <div>
            <CardTitle className="text-xl font-bold tracking-tight">Lista de Acordos</CardTitle>
            <CardDescription className="text-xs font-medium">
              Total de {filteredAcordos.length} acordos encontrados
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="pt-6">
          <GlobalFilter
            configs={acordosFilterConfig}
            filters={filters}
            onFilterChange={setFilter}
            onClearFilter={clearFilter}
            onClearAll={clearAllFilters}
            hasActiveFilters={hasActiveFilters}
            activeFiltersCount={activeFiltersCount}
            resultCount={resultCount}
            totalCount={totalCount}
            presets={acordosPresets}
            onPresetSelect={(preset) => setFilters(preset.filters)}
            collapsible={true}
            defaultOpen={false}
          />

          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Acordo</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead className="hidden sm:table-cell">N. Título</TableHead>
                  <TableHead className="hidden md:table-cell">Valor Original</TableHead>
                  <TableHead>Valor Acordo</TableHead>
                  <TableHead className="hidden lg:table-cell">Parcelas</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pagination.pageItems.map((acordo) => (
                  <TableRow key={acordo.id}>
                    <TableCell className="font-mono text-sm font-medium whitespace-nowrap">
                      {codigoAcordo(acordo.id)}
                    </TableCell>
                    <TableCell>
                      <div>
                        <button
                          type="button"
                          onClick={() => abrirFicha(acordo.cliente_id)}
                          className="block text-left font-medium hover:text-primary hover:underline transition-colors"
                        >
                          {acordo.cliente?.nome}
                        </button>
                        <div className="text-xs text-muted-foreground">
                          {formatCpfCnpj(acordo.cliente?.cpf_cnpj)}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell font-mono text-sm">
                      <DocumentosDoAcordo acordo={acordo} />
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      {formatCurrency(acordo.valor_original)}
                    </TableCell>
                    <TableCell>{formatCurrency(acordo.valor_acordo)}</TableCell>
                    <TableCell className="hidden lg:table-cell">
                      {acordo.parcelas}x de {formatCurrency(acordo.valor_parcela)}
                    </TableCell>
                    <TableCell>
                      <StatusBadge domain="acordo" status={acordo.status} />
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => abrirDetalhes(acordo)}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        {isAdmin && acordo.status !== 'cancelado' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            title="Cancelar acordo"
                            onClick={() => {
                              setAcordoToCancel(acordo);
                              setIsCancelModalOpen(true);
                            }}
                          >
                            <Ban className="h-4 w-4" />
                          </Button>
                        )}
                        {/* Purga só depois do cancelamento: um acordo ativo mantém as
                            parcelas do título liquidadas (novação). A RPC recusa o
                            acordo não cancelado — o botão espelha essa regra. */}
                        {isAdmin && acordo.status === 'cancelado' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            title="Excluir definitivamente"
                            onClick={() => setAcordoToHardDelete(acordo)}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {filteredAcordos.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                      Nenhum acordo encontrado
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          <TablePagination pagination={pagination} />
        </CardContent>
      </Card>

      {/* Montado só quando aberto: a busca de títulos acontece na montagem,
          então cada abertura já vem com dados frescos. */}
      {isCreateModalOpen && (
        <NovoAcordoDialog
          open
          onOpenChange={setIsCreateModalOpen}
          clienteIdPreSelecionado={preSelectedData?.clienteId}
        />
      )}

      <AcordoDetailsDialog
        open={isDetailsModalOpen}
        onOpenChange={fecharDetalhes}
        acordo={selectedAcordo}
      />

      <CancelAcordoDialog
        open={isCancelModalOpen}
        onOpenChange={setIsCancelModalOpen}
        onCancel={() => setIsCancelModalOpen(false)}
        onConfirm={handleCancelAcordo}
        isPending={cancelAcordoMutation.isPending}
      />

      <ConfirmarAcaoDestrutiva
        open={!!acordoToHardDelete}
        onOpenChange={(o) => !o && setAcordoToHardDelete(null)}
        titulo="Excluir acordo definitivamente"
        descricao={
          <>
            <p>
              Isto <strong>apaga do banco</strong> o acordo de{' '}
              <span className="font-medium">{acordoToHardDelete?.cliente?.nome}</span> e todas as
              suas parcelas, inclusive as já pagas.
            </p>
            <p>
              O acordo já está cancelado, então a dívida original do título permanece como está.
              O que se perde é o <strong>histórico da negociação</strong>.
            </p>
            <p><strong>Não dá para desfazer.</strong></p>
          </>
        }
        rotuloConfirmar="Excluir definitivamente"
        textoConfirmacao="EXCLUIR"
        isPending={hardDeleteAcordoMutation.isPending}
        onConfirm={handleHardDeleteAcordo}
      />
    </div>
  );
}
