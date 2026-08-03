import { useState, useEffect, useCallback, useMemo, type Dispatch, type ReactNode, type SetStateAction } from 'react';
import { PageHeader } from '@/components/PageHeader';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { Plus, Eye, Ban, FileText, CheckCircle, TrendingUp, Loader2 } from 'lucide-react';
import { useAcordos, useCreateAcordo, useCancelAcordo, useParcelasAcordo, usePagarParcelaAcordo, type AcordoRow, type ParcelaAcordoRow } from '@/lib/queries/acordos';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { StatusBadge } from '@/components/StatusBadge';
import { GlobalFilter } from '@/components/GlobalFilter';
import { useGlobalFilter } from '@/hooks/useGlobalFilter';
import { acordosFilterConfig } from '@/constants/filterConfigs';
import { acordosPresets } from '@/constants/filterPresets';
import { createAcordosFilterFunctions } from '@/utils/filterFunctions';
import { formatCpfCnpj, formatData } from '@/utils/format';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { useTitulosAgrupados, TituloAgrupado } from '@/hooks/useTitulosAgrupados';
import { useUserRole } from '@/hooks/useUserRole';
import { usePagination } from '@/hooks/usePagination';
import { TablePagination } from '@/components/TablePagination';
import { SelecionarTitulosAcordo } from '@/components/acordos/SelecionarTitulosAcordo';
import {
  gerarCronograma,
  podarDatasManuais,
  type CronogramaParcela,
  type DatasManuais,
} from '@/domain/acordos/cronograma';

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

interface NovoAcordo {
  cliente_id: string;
  titulo_ids: string[];
  valor_original: number;
  valor_acordo: number;
  parcelas: number;
  taxa_juros?: number;
  data_inicio: string;
  data_vencimento_primeira_parcela: string;
  observacoes?: string;
}

interface FormErrors {
  cliente_id?: string;
  valor_acordo?: string;
  parcelas?: string;
  data_vencimento_primeira_parcela?: string;
}

interface SelectionData {
  clienteId: string;
  cliente: { id: string; nome: string; cpf_cnpj: string };
  tituloIds: string[];
  valorTotal: number;
  dividas: TituloAgrupado[];
}

interface LocationState {
  clienteId?: string;
  tituloIds?: string[];
  valorTotal?: number;
}

// ===================== Helpers puros =====================
const formatCurrency = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

// Largura dos modais de acordo. O respiro lateral no mobile vem da base
// (ui/dialog.tsx); aqui só liberamos a largura no desktop — 75vw é o token de
// "modal largo" já usado em Clientes.tsx — e apertamos o padding no celular.
const MODAL_LARGO = 'sm:max-w-[75vw] max-h-[90vh] overflow-y-auto p-4 sm:p-6';
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

// ===================== Subcomponentes =====================
// Cronograma editável: as datas vêm sugeridas a partir da 1ª parcela, mas cada
// linha pode ser ajustada. Editar a 1ª move a âncora e re-sugere as seguintes.
interface CronogramaEditavelProps {
  cronograma: CronogramaParcela[];
  temDatasManuais: boolean;
  onDataParcelaChange: (numero: number, data: string) => void;
  onResetDatas: () => void;
}
function CronogramaEditavel({
  cronograma, temDatasManuais, onDataParcelaChange, onResetDatas,
}: CronogramaEditavelProps) {
  const total = cronograma.reduce((sum, p) => sum + p.valor_total, 0);

  return (
    <div className="p-4 bg-muted rounded-lg space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h4 className="font-medium">Cronograma de Parcelas</h4>
        {temDatasManuais && (
          <button type="button" onClick={onResetDatas} className="text-xs text-primary hover:underline">
            Restaurar sugestão
          </button>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        As datas seguem o dia da 1ª parcela nos meses seguintes. Ajuste qualquer parcela livremente.
      </p>

      <div className="space-y-1.5">
        {cronograma.map((p) => (
          <div key={p.numero} className="flex items-center gap-2">
            <span className="w-16 sm:w-20 shrink-0 text-xs sm:text-sm text-muted-foreground">
              Parcela {p.numero}
            </span>
            <Input
              type="date"
              value={p.data_vencimento}
              onChange={(e) => onDataParcelaChange(p.numero, e.target.value)}
              className="h-8 flex-1 min-w-0"
              aria-label={`Vencimento da parcela ${p.numero}`}
            />
            <span className="w-24 sm:w-28 shrink-0 text-right text-xs sm:text-sm font-medium">
              {formatCurrency(p.valor_total)}
            </span>
          </div>
        ))}
      </div>

      <div className="border-t pt-2 font-medium flex justify-between text-sm">
        <span>Total</span>
        <span>{formatCurrency(total)}</span>
      </div>
    </div>
  );
}

interface ConfiguracaoAcordoProps {
  newAcordo: NovoAcordo;
  setNewAcordo: Dispatch<SetStateAction<NovoAcordo>>;
  formErrors: FormErrors;
  cronograma: CronogramaParcela[];
  temDatasManuais: boolean;
  onDataParcelaChange: (numero: number, data: string) => void;
  onResetDatas: () => void;
}
function ConfiguracaoAcordo({
  newAcordo, setNewAcordo, formErrors, cronograma, temDatasManuais,
  onDataParcelaChange, onResetDatas,
}: ConfiguracaoAcordoProps) {
  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Valor Original</Label>
          <Input
            value={formatCurrency(newAcordo.valor_original)}
            disabled
            className="bg-muted"
          />
        </div>
        <div className="space-y-2">
          <Label>Valor do Acordo</Label>
          <Input
            type="number"
            step="0.01"
            value={newAcordo.valor_acordo}
            onChange={(e) => setNewAcordo(prev => ({ ...prev, valor_acordo: parseFloat(e.target.value) || 0 }))}
            className={formErrors.valor_acordo ? "border-red-500" : ""}
          />
          {formErrors.valor_acordo && (
            <span className="text-xs text-red-500">{formErrors.valor_acordo}</span>
          )}
        </div>
      </div>

      {/* No mobile: Parcelas e Juros lado a lado, a data em linha própria — um
          input de data em meia tela de celular fica ilegível. */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <div className="space-y-2">
          <Label>Parcelas</Label>
          <Input
            type="number"
            min="1"
            value={newAcordo.parcelas}
            onChange={(e) => setNewAcordo(prev => ({ ...prev, parcelas: parseInt(e.target.value) || 1 }))}
            className={formErrors.parcelas ? "border-red-500" : ""}
          />
        </div>
        <div className="space-y-2">
          <Label>Taxa de Juros (%)</Label>
          <Input
            type="number"
            step="0.01"
            min="0"
            value={newAcordo.taxa_juros}
            onChange={(e) => setNewAcordo(prev => ({ ...prev, taxa_juros: parseFloat(e.target.value) || 0 }))}
          />
        </div>
        <div className="space-y-2 col-span-2 sm:col-span-1">
          <Label>1ª Parcela</Label>
          <Input
            type="date"
            value={newAcordo.data_vencimento_primeira_parcela}
            onChange={(e) => setNewAcordo(prev => ({ ...prev, data_vencimento_primeira_parcela: e.target.value }))}
            className={formErrors.data_vencimento_primeira_parcela ? "border-red-500" : ""}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label>Observações</Label>
        <Input
          value={newAcordo.observacoes}
          onChange={(e) => setNewAcordo(prev => ({ ...prev, observacoes: e.target.value }))}
        />
      </div>

      {cronograma.length > 0 && (
        <CronogramaEditavel
          cronograma={cronograma}
          temDatasManuais={temDatasManuais}
          onDataParcelaChange={onDataParcelaChange}
          onResetDatas={onResetDatas}
        />
      )}
    </>
  );
}

interface NovoAcordoDialogProps {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  clientes: Parameters<typeof SelecionarTitulosAcordo>[0]['clientes'];
  clienteIdPreSelecionado?: string;
  loadingTitulos: boolean;
  isCreating: boolean;
  onSelectionChange: (selection: SelectionData | null) => void;
  newAcordo: NovoAcordo;
  setNewAcordo: Dispatch<SetStateAction<NovoAcordo>>;
  formErrors: FormErrors;
  cronograma: CronogramaParcela[];
  temDatasManuais: boolean;
  onDataParcelaChange: (numero: number, data: string) => void;
  onResetDatas: () => void;
  onCancel: () => void;
  onCreate: () => void;
}
function NovoAcordoDialog({
  open, onOpenChange, clientes, clienteIdPreSelecionado, loadingTitulos, isCreating, onSelectionChange,
  newAcordo, setNewAcordo, formErrors, cronograma, temDatasManuais,
  onDataParcelaChange, onResetDatas, onCancel, onCreate,
}: NovoAcordoDialogProps) {
  // Sem título escolhido não há o que configurar: mantém uma coluna só, para a
  // seleção não ficar espremida com metade do modal vazia ao lado.
  const mostrarConfiguracao = !loadingTitulos && newAcordo.titulo_ids.length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={MODAL_LARGO}>
        <DialogHeader>
          <DialogTitle>Novo Acordo</DialogTitle>
          <DialogDescription>
            Selecione os títulos e configure o acordo de pagamento
          </DialogDescription>
        </DialogHeader>
        <div className={`grid gap-6 ${mostrarConfiguracao ? 'lg:grid-cols-2' : ''}`}>
          <div className="min-w-0">
            <SelecionarTitulosAcordo
              clientes={clientes}
              clienteIdPreSelecionado={clienteIdPreSelecionado}
              loading={loadingTitulos}
              onSelectionChange={onSelectionChange}
            />
          </div>

          {mostrarConfiguracao && (
            <div className="min-w-0 space-y-4">
              <ConfiguracaoAcordo
                newAcordo={newAcordo}
                setNewAcordo={setNewAcordo}
                formErrors={formErrors}
                cronograma={cronograma}
                temDatasManuais={temDatasManuais}
                onDataParcelaChange={onDataParcelaChange}
                onResetDatas={onResetDatas}
              />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            Cancelar
          </Button>
          <Button onClick={onCreate} disabled={newAcordo.titulo_ids.length === 0 || isCreating}>
            {isCreating && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Criar Acordo
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Status de exibição da parcela do acordo: se não está paga, deriva vencida/pendente
// pela data — o campo `status` armazenado costuma ficar em 'pendente'.
function statusExibicaoParcela(p: ParcelaAcordoRow): 'paga' | 'vencida' | 'pendente' {
  if (p.status === 'paga' || p.data_pagamento) return 'paga';
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  return new Date(p.data_vencimento) < hoje ? 'vencida' : 'pendente';
}

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
    if (statusExibicaoParcela(p) === 'paga') {
      pagas += 1;
      valorPago += Number(p.valor_total);
    } else {
      saldo += Number(p.valor_total);
      if (!proximo || p.data_vencimento < proximo) proximo = p.data_vencimento;
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

interface ParcelaAcordoRowProps {
  parcela: ParcelaAcordoRow;
  podePagar: boolean;
  emPagamento: boolean;
  dataPagamento: string;
  isPending: boolean;
  onIniciar: (id: string) => void;
  onDataChange: (v: string) => void;
  onConfirmar: () => void;
  onCancelar: () => void;
}
// Formulário de baixa da parcela — compartilhado pela linha da tabela (desktop)
// e pelo card (mobile), para as duas formas não divergirem.
function FormPagamentoParcela({
  dataPagamento, isPending, onDataChange, onConfirmar, onCancelar,
}: Pick<ParcelaAcordoRowProps, 'dataPagamento' | 'isPending' | 'onDataChange' | 'onConfirmar' | 'onCancelar'>) {
  return (
    <div className="flex flex-wrap items-end gap-2 py-1">
      <div className="space-y-1">
        <Label className="text-xs">Data do pagamento</Label>
        <Input
          type="date"
          value={dataPagamento}
          onChange={(e) => onDataChange(e.target.value)}
          className="h-8 w-40"
        />
      </div>
      <Button size="sm" onClick={onConfirmar} disabled={isPending}>
        {isPending ? 'Registrando...' : 'Confirmar'}
      </Button>
      <Button size="sm" variant="outline" onClick={onCancelar} disabled={isPending}>
        Voltar
      </Button>
    </div>
  );
}

// Forma da parcela no MOBILE: a tabela de 7 colunas não cabe em tela de celular
// sem rolagem horizontal, então lá cada parcela vira um card.
function ParcelaAcordoCard({
  parcela, podePagar, emPagamento, dataPagamento, isPending,
  onIniciar, onDataChange, onConfirmar, onCancelar,
}: ParcelaAcordoRowProps) {
  const st = statusExibicaoParcela(parcela);
  return (
    <div className="rounded-lg border p-3 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium">Parcela {parcela.numero_parcela}</span>
        <StatusBadge domain="parcela_acordo" status={st} />
      </div>

      <div className="grid grid-cols-2 gap-3 text-sm">
        <CampoDetalhe label="Vencimento">{formatData(parcela.data_vencimento)}</CampoDetalhe>
        <CampoDetalhe label="Valor">{formatCurrency(parcela.valor_total)}</CampoDetalhe>
        <CampoDetalhe label="Juros">
          {parcela.valor_juros > 0 ? formatCurrency(parcela.valor_juros) : '—'}
        </CampoDetalhe>
        <CampoDetalhe label="Pago em">
          {parcela.data_pagamento ? formatData(parcela.data_pagamento) : '—'}
        </CampoDetalhe>
      </div>

      {podePagar && st !== 'paga' && !emPagamento && (
        <Button size="sm" variant="outline" className="h-8 w-full" onClick={() => onIniciar(parcela.id)}>
          Registrar pagamento
        </Button>
      )}
      {emPagamento && (
        <div className="rounded-md bg-muted/30 px-2">
          <FormPagamentoParcela
            dataPagamento={dataPagamento}
            isPending={isPending}
            onDataChange={onDataChange}
            onConfirmar={onConfirmar}
            onCancelar={onCancelar}
          />
        </div>
      )}
    </div>
  );
}

function ParcelaAcordoTableRow({
  parcela, podePagar, emPagamento, dataPagamento, isPending,
  onIniciar, onDataChange, onConfirmar, onCancelar,
}: ParcelaAcordoRowProps) {
  const st = statusExibicaoParcela(parcela);
  return (
    <>
      <TableRow>
        <TableCell className="font-medium">{parcela.numero_parcela}</TableCell>
        <TableCell>{formatData(parcela.data_vencimento)}</TableCell>
        <TableCell>{formatCurrency(parcela.valor_total)}</TableCell>
        <TableCell className="text-muted-foreground">
          {parcela.valor_juros > 0 ? formatCurrency(parcela.valor_juros) : '—'}
        </TableCell>
        <TableCell>
          <StatusBadge domain="parcela_acordo" status={st} />
        </TableCell>
        <TableCell>{parcela.data_pagamento ? formatData(parcela.data_pagamento) : '—'}</TableCell>
        {podePagar && (
          <TableCell className="text-right">
            {st !== 'paga' && !emPagamento && (
              <Button size="sm" variant="outline" className="h-8" onClick={() => onIniciar(parcela.id)}>
                Registrar pagamento
              </Button>
            )}
          </TableCell>
        )}
      </TableRow>
      {emPagamento && (
        <TableRow>
          <TableCell colSpan={7} className="bg-muted/30">
            <FormPagamentoParcela
              dataPagamento={dataPagamento}
              isPending={isPending}
              onDataChange={onDataChange}
              onConfirmar={onConfirmar}
              onCancelar={onCancelar}
            />
          </TableCell>
        </TableRow>
      )}
    </>
  );
}

interface ParcelasAcordoListaProps {
  parcelas: ParcelaAcordoRow[];
  podePagar: boolean;
  pagandoId: string | null;
  dataPagamento: string;
  isPending: boolean;
  onIniciar: (id: string) => void;
  onDataChange: (v: string) => void;
  onConfirmar: () => void;
  onCancelar: () => void;
}
// Duas formas do mesmo dado: tabela a partir de md, cards abaixo disso.
function ParcelasAcordoLista({
  parcelas, podePagar, pagandoId, dataPagamento, isPending,
  onIniciar, onDataChange, onConfirmar, onCancelar,
}: ParcelasAcordoListaProps) {
  const propsComuns = (p: ParcelaAcordoRow) => ({
    parcela: p,
    podePagar,
    emPagamento: pagandoId === p.id,
    dataPagamento,
    isPending,
    onIniciar,
    onDataChange,
    onConfirmar,
    onCancelar,
  });

  return (
    <>
      <div className="hidden md:block rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Parcela</TableHead>
              <TableHead>Vencimento</TableHead>
              <TableHead>Valor</TableHead>
              <TableHead>Juros</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Pago em</TableHead>
              {podePagar && <TableHead className="text-right">Ações</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {parcelas.map((p) => (
              <ParcelaAcordoTableRow key={p.id} {...propsComuns(p)} />
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="md:hidden space-y-2">
        {parcelas.map((p) => (
          <ParcelaAcordoCard key={p.id} {...propsComuns(p)} />
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
  const { isOperador } = useUserRole();
  const pagar = usePagarParcelaAcordo();
  const { toast } = useToast();
  const [pagandoId, setPagandoId] = useState<string | null>(null);
  const [dataPagamento, setDataPagamento] = useState('');

  const iniciar = (id: string) => {
    setPagandoId(id);
    setDataPagamento(new Date().toISOString().split('T')[0]);
  };

  const confirmar = async () => {
    if (!pagandoId) return;
    try {
      await pagar.mutateAsync({ parcelaAcordoId: pagandoId, dataPagamento: dataPagamento || undefined });
      toast({ title: 'Pagamento registrado', description: 'A parcela do acordo foi baixada.' });
      setPagandoId(null);
    } catch (error) {
      toast({
        title: 'Erro',
        description: error instanceof Error ? error.message : 'Não foi possível registrar o pagamento',
        variant: 'destructive',
      });
    }
  };

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Carregando parcelas...</p>;
  }
  if (parcelas.length === 0) {
    return <p className="text-sm text-muted-foreground">Nenhuma parcela cadastrada para este acordo.</p>;
  }

  return (
    <div className="space-y-3">
      <ResumoParcelasCards resumo={resumoParcelasAcordo(parcelas)} />
      <ParcelasAcordoLista
        parcelas={parcelas}
        podePagar={isOperador && !acordoCancelado}
        pagandoId={pagandoId}
        dataPagamento={dataPagamento}
        isPending={pagar.isPending}
        onIniciar={iniciar}
        onDataChange={setDataPagamento}
        onConfirmar={confirmar}
        onCancelar={() => setPagandoId(null)}
      />
    </div>
  );
}

interface AcordoDetailsDialogProps {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  acordo: AcordoRow | null;
}
// Ficha de leitura do acordo (coluna estreita no desktop). Pares rótulo/valor
// curtos ficam em 2 colunas enquanto a ficha é larga, e empilham quando ela vira
// sidebar em lg.
function FichaAcordo({ acordo }: { acordo: AcordoRow }) {
  return (
    <div className="space-y-5">
      <section className="space-y-2">
        <TituloSecao>Negociação</TituloSecao>
        <div className="grid grid-cols-2 lg:grid-cols-1 gap-3">
          <CampoDetalhe label="Valor original">{formatCurrency(acordo.valor_original)}</CampoDetalhe>
          <CampoDetalhe label="Valor do acordo">
            <span className="text-primary">{formatCurrency(acordo.valor_acordo)}</span>
          </CampoDetalhe>
          <CampoDetalhe label="Desconto">{acordo.desconto.toFixed(1)}%</CampoDetalhe>
        </div>
      </section>

      <section className="space-y-2">
        <TituloSecao>Plano de pagamento</TituloSecao>
        <div className="grid grid-cols-2 lg:grid-cols-1 gap-3">
          <CampoDetalhe label="Parcelas">
            {acordo.parcelas}x de {formatCurrency(acordo.valor_parcela)}
          </CampoDetalhe>
          <CampoDetalhe label="Data do acordo">{formatData(acordo.data_acordo)}</CampoDetalhe>
          <CampoDetalhe label="1ª parcela">
            {formatData(acordo.data_vencimento_primeira_parcela)}
          </CampoDetalhe>
        </div>
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
      <DialogContent className={MODAL_LARGO}>
        <DialogHeader>
          <DialogTitle>Detalhes do Acordo</DialogTitle>
          <DialogDescription>
            Condições do acordo, parcelas e situação atual.
          </DialogDescription>
        </DialogHeader>
        {acordo && (
          <div className="space-y-5">
            {/* Identidade do registro: de quem é e em que pé está. */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-3">
              <div className="min-w-0">
                <Label className="text-xs text-muted-foreground">Cliente</Label>
                <p className="text-base font-semibold break-words">{acordo.cliente?.nome}</p>
              </div>
              <StatusBadge domain="acordo" status={acordo.status} />
            </div>

            <div className="grid gap-6 lg:grid-cols-3">
              <div className="lg:col-span-1">
                <FichaAcordo acordo={acordo} />
              </div>

              {/* min-w-0 deixa a tabela encolher dentro do grid em vez de estourar. */}
              <div className="lg:col-span-2 min-w-0 space-y-2">
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
  const [searchParams] = useSearchParams();
  const preSelectedData = location.state as LocationState | null;

  // === Data via React Query ===
  const { data: acordos = [], isLoading: loading } = useAcordos();
  const createAcordoMutation = useCreateAcordo();
  const cancelAcordoMutation = useCancelAcordo();

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
  const [mostrarCancelados, setMostrarCancelados] = useState(false);
  const [selectedAcordo, setSelectedAcordo] = useState<AcordoRow | null>(null);
  const [acordoToCancel, setAcordoToCancel] = useState<AcordoRow | null>(null);

  const [newAcordo, setNewAcordo] = useState<NovoAcordo>({
    cliente_id: '',
    titulo_ids: [],
    valor_original: 0,
    valor_acordo: 0,
    parcelas: 1,
    taxa_juros: 0,
    data_inicio: new Date().toISOString().split('T')[0],
    data_vencimento_primeira_parcela: new Date().toISOString().split('T')[0],
    observacoes: ''
  });

  const [formErrors, setFormErrors] = useState<FormErrors>({});
  // Datas que o usuário sobrescreveu na mão, por número de parcela. O resto do
  // cronograma é sugerido a partir do vencimento da 1ª parcela.
  const [datasManuais, setDatasManuais] = useState<DatasManuais>({});
  const { toast } = useToast();

  // Ignora sobrescritas de parcelas que não existem mais (ex.: 6 -> 3 parcelas).
  const datasAtivas = useMemo(
    () => podarDatasManuais(datasManuais, newAcordo.parcelas),
    [datasManuais, newAcordo.parcelas],
  );

  const cronograma = useMemo(
    () => gerarCronograma(
      {
        valorAcordo: newAcordo.valor_acordo,
        parcelas: newAcordo.parcelas,
        taxaJuros: newAcordo.taxa_juros,
        primeiroVencimento: newAcordo.data_vencimento_primeira_parcela,
      },
      datasAtivas,
    ),
    [
      newAcordo.valor_acordo, newAcordo.parcelas, newAcordo.taxa_juros,
      newAcordo.data_vencimento_primeira_parcela, datasAtivas,
    ],
  );

  // A 1ª parcela é a âncora da sugestão: editá-la re-sugere as seguintes.
  // As demais viram sobrescrita individual e param de acompanhar a âncora.
  const handleDataParcelaChange = useCallback((numero: number, data: string) => {
    if (numero === 1) {
      setNewAcordo(prev => ({ ...prev, data_vencimento_primeira_parcela: data }));
      return;
    }
    setDatasManuais(prev => ({ ...prev, [numero]: data }));
  }, []);
  // Vendedor (e leitura) é read-only: escondemos as ações de escrita.
  // Cancelar exige financeiro+ (RLS acordos_update).
  const { isOperador, isFinanceiro } = useUserRole();

  const { clientes: clientesComDividas, loading: loadingTitulos, refetch: refetchTitulos } = useTitulosAgrupados();

  useEffect(() => {
    if (preSelectedData?.clienteId) {
      refetchTitulos();
      setIsCreateModalOpen(true);
    }
  }, [preSelectedData, refetchTitulos]);

  // Deep link ?id=<acordo>: abre os detalhes direto (ex.: link vindo da ficha do cliente).
  useEffect(() => {
    const id = searchParams.get('id');
    if (!id || acordos.length === 0) return;
    const alvo = acordos.find((a) => a.id === id);
    if (alvo) {
      setSelectedAcordo(alvo);
      setIsDetailsModalOpen(true);
    }
  }, [searchParams, acordos]);

  const validateForm = () => {
    const errors: FormErrors = {};
    let isValid = true;

    if (!newAcordo.cliente_id || newAcordo.titulo_ids.length === 0) {
      errors.cliente_id = 'Selecione pelo menos um título';
      isValid = false;
    }

    if (!newAcordo.valor_acordo || newAcordo.valor_acordo <= 0) {
      errors.valor_acordo = 'Valor do acordo deve ser maior que zero';
      isValid = false;
    }

    if (!newAcordo.parcelas || newAcordo.parcelas <= 0) {
      errors.parcelas = 'Número de parcelas deve ser maior que zero';
      isValid = false;
    }

    if (!newAcordo.data_vencimento_primeira_parcela) {
      errors.data_vencimento_primeira_parcela = 'Data de vencimento é obrigatória';
      isValid = false;
    }

    if (cronograma.some((p) => !p.data_vencimento)) {
      errors.data_vencimento_primeira_parcela = 'Preencha o vencimento de todas as parcelas';
      isValid = false;
    }

    setFormErrors(errors);
    return isValid;
  };

  const handleSelectionChange = useCallback((selection: SelectionData | null) => {
    if (!selection) {
      setNewAcordo(prev => ({
        ...prev,
        cliente_id: '',
        titulo_ids: [],
        valor_original: 0,
        valor_acordo: 0
      }));
      return;
    }

    setNewAcordo(prev => ({
      ...prev,
      cliente_id: selection.clienteId,
      titulo_ids: selection.tituloIds,
      valor_original: selection.valorTotal,
      valor_acordo: prev.valor_acordo === 0 || prev.valor_acordo === prev.valor_original 
        ? selection.valorTotal 
        : prev.valor_acordo
    }));
  }, []);

  const handleCreateAcordo = async () => {
    if (!validateForm()) {
      toast({
        title: "Erro",
        description: "Por favor, preencha todos os campos obrigatórios.",
        variant: "destructive",
      });
      return;
    }

    try {
      const desconto = ((newAcordo.valor_original - newAcordo.valor_acordo) / newAcordo.valor_original) * 100;
      // Usa o cronograma exibido — inclui as datas que o usuário ajustou na mão.
      const cronogramaParcelas = cronograma;
      const valorTotalComJuros = cronogramaParcelas.reduce((sum, p) => sum + p.valor_total, 0);
      const valorParcela = valorTotalComJuros / newAcordo.parcelas;

      await createAcordoMutation.mutateAsync({
        titulo_ids: newAcordo.titulo_ids,
        cliente_id: newAcordo.cliente_id,
        valor_original: newAcordo.valor_original,
        valor_acordo: valorTotalComJuros,
        desconto,
        parcelas: newAcordo.parcelas,
        valor_parcela: valorParcela,
        data_vencimento_primeira_parcela: newAcordo.data_vencimento_primeira_parcela,
        observacoes: newAcordo.observacoes,
        cronograma: cronogramaParcelas.map((p) => ({
          numero_parcela: p.numero,
          valor: p.valor,
          valor_juros: p.valor_juros,
          valor_total: p.valor_total,
          data_vencimento: p.data_vencimento,
        })),
      });

      toast({
        title: "Sucesso",
        description: `Acordo criado com sucesso. ${newAcordo.titulo_ids.length} título(s) incluído(s).`,
      });

      setIsCreateModalOpen(false);
      setDatasManuais({});
      setNewAcordo({
        cliente_id: '',
        titulo_ids: [],
        valor_original: 0,
        valor_acordo: 0,
        parcelas: 1,
        taxa_juros: 0,
        data_inicio: new Date().toISOString().split('T')[0],
        data_vencimento_primeira_parcela: new Date().toISOString().split('T')[0],
        observacoes: '',
      });

      refetchTitulos();
    } catch (error) {
      console.error('Erro ao criar acordo:', error);
      toast({
        title: "Erro",
        description: "Não foi possível criar o acordo",
        variant: "destructive",
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

      refetchTitulos();
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

  // Cancelados ficam ocultos por padrão para não poluir a operação do dia a dia;
  // o checkbox "Mostrar cancelados" reexibe o histórico quando necessário.
  const acordosVisiveis = useMemo(
    () => (mostrarCancelados ? acordos : acordos.filter((a) => a.status !== 'cancelado')),
    [acordos, mostrarCancelados]
  );

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
  } = useGlobalFilter(acordosVisiveis, filterFunctions);

  const pagination = usePagination(filteredAcordos, 25, JSON.stringify(filters) + mostrarCancelados);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
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
              refetchTitulos();
              setIsCreateModalOpen(true);
            }}
          >
            <Plus className="h-4 w-4 mr-2" />
            Novo Acordo
          </Button>
        )}
      </PageHeader>

      <div className="grid gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="border-none shadow-card rounded-2xl overflow-hidden group">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent pointer-events-none" />
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 relative z-10">
            <CardTitle className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Total de Acordos</CardTitle>
            <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary group-hover:scale-110 transition-transform">
              <FileText className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent className="relative z-10">
            <div className="text-3xl font-black tracking-tighter">{acordosNaoCancelados.length}</div>
            <p className="text-[10px] font-medium text-muted-foreground mt-1">Acordos registrados</p>
          </CardContent>
        </Card>

        <Card className="border-none shadow-card rounded-2xl overflow-hidden group">
          <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-transparent pointer-events-none" />
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 relative z-10">
            <CardTitle className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Acordos Ativos</CardTitle>
            <div className="h-8 w-8 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-600 group-hover:scale-110 transition-transform">
              <CheckCircle className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent className="relative z-10">
            <div className="text-3xl font-black tracking-tighter text-blue-600">
              {acordosNaoCancelados.filter(a => a.status === 'ativo').length}
            </div>
            <p className="text-[10px] font-medium text-muted-foreground mt-1">Em andamento</p>
          </CardContent>
        </Card>

        <Card className="border-none shadow-card rounded-2xl overflow-hidden group">
          <div className="absolute inset-0 bg-gradient-to-br from-success/5 to-transparent pointer-events-none" />
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 relative z-10">
            <CardTitle className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Cumpridos</CardTitle>
            <div className="h-8 w-8 rounded-lg bg-success/10 flex items-center justify-center text-success group-hover:scale-110 transition-transform">
              <Plus className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent className="relative z-10">
            <div className="text-3xl font-black tracking-tighter text-success">
              {acordosNaoCancelados.filter(a => a.status === 'cumprido').length}
            </div>
            <p className="text-[10px] font-medium text-muted-foreground mt-1">Finalizados com sucesso</p>
          </CardContent>
        </Card>

        <Card className="border-none shadow-card rounded-2xl overflow-hidden group">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent pointer-events-none" />
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 relative z-10">
            <CardTitle className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Valor Total</CardTitle>
            <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary group-hover:scale-110 transition-transform">
              <TrendingUp className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent className="relative z-10">
            <div className="text-3xl font-black tracking-tighter">
              {formatCurrency(acordosNaoCancelados.reduce((sum, a) => sum + a.valor_acordo, 0))}
            </div>
            <p className="text-[10px] font-medium text-muted-foreground mt-1">Montante negociado</p>
          </CardContent>
        </Card>
      </div>

      <Card className="border-none shadow-card rounded-2xl overflow-hidden">
        <CardHeader className="pb-4 border-b border-border/50 bg-muted/20">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <CardTitle className="text-xl font-bold tracking-tight">Lista de Acordos</CardTitle>
              <CardDescription className="text-xs font-medium">Total de {filteredAcordos.length} acordos encontrados</CardDescription>
            </div>
            <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground cursor-pointer">
              <Checkbox
                checked={mostrarCancelados}
                onCheckedChange={(checked) => setMostrarCancelados(checked === true)}
              />
              Mostrar cancelados
            </label>
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
                    <TableCell>
                      <div>
                        <button
                          type="button"
                          onClick={() => navigate(`/clientes/${acordo.cliente_id}`)}
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
                      {acordo.titulo?.numero_documento || '-'}
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
                          onClick={() => {
                            setSelectedAcordo(acordo);
                            setIsDetailsModalOpen(true);
                          }}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        {isFinanceiro && acordo.status !== 'cancelado' && (
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
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {filteredAcordos.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
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

      <NovoAcordoDialog
        open={isCreateModalOpen}
        onOpenChange={setIsCreateModalOpen}
        clientes={clientesComDividas}
        clienteIdPreSelecionado={preSelectedData?.clienteId}
        loadingTitulos={loadingTitulos}
        isCreating={createAcordoMutation.isPending}
        onSelectionChange={handleSelectionChange}
        newAcordo={newAcordo}
        setNewAcordo={setNewAcordo}
        formErrors={formErrors}
        cronograma={cronograma}
        temDatasManuais={Object.keys(datasAtivas).length > 0}
        onDataParcelaChange={handleDataParcelaChange}
        onResetDatas={() => setDatasManuais({})}
        onCancel={() => setIsCreateModalOpen(false)}
        onCreate={handleCreateAcordo}
      />

      <AcordoDetailsDialog
        open={isDetailsModalOpen}
        onOpenChange={setIsDetailsModalOpen}
        acordo={selectedAcordo}
      />

      <CancelAcordoDialog
        open={isCancelModalOpen}
        onOpenChange={setIsCancelModalOpen}
        onCancel={() => setIsCancelModalOpen(false)}
        onConfirm={handleCancelAcordo}
        isPending={cancelAcordoMutation.isPending}
      />
    </div>
  );
}
