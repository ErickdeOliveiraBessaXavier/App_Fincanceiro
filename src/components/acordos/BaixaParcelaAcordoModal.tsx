import { useEffect, useState } from 'react';
import { AlertTriangle, Info } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { InputMoeda } from '@/components/InputMoeda';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import {
  usePagarParcelaAcordo,
  useEstornarEventoParcelaAcordo,
  useEventosParcelaAcordo,
  type ParcelaAcordoRow,
  type EventoParcelaAcordo,
} from '@/lib/queries/acordos';
import { hojeIso } from '@/domain/telecobranca/statusCobranca';
import { formatData } from '@/utils/format';
import { cn } from '@/lib/utils';
import { useUserRole } from '@/hooks/useUserRole';
import { useConfiguracaoEmpresa, tetoDescontoEmReais } from '@/lib/queries/configuracoes';

/**
 * Baixa e estorno de uma parcela de acordo.
 *
 * A baixa registra o valor RECEBIDO, não o previsto. Antes a parcela só era
 * marcada como paga e os relatórios assumiam o valor do cronograma — cliente
 * que pagava R$ 1.010 por atraso entrava no caixa como R$ 1.000.
 *
 * O estorno é de um lançamento, não da parcela: numa parcela com pagamento
 * parcial e encargo, dá para corrigir só o que foi lançado errado.
 */

export type ModoBaixa = 'pagar' | 'estornar';

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value ?? 0);

const MEIOS_PAGAMENTO = [
  { value: 'pix', label: 'PIX' },
  { value: 'dinheiro', label: 'Dinheiro' },
  { value: 'boleto', label: 'Boleto' },
  { value: 'transferencia', label: 'Transferência' },
  { value: 'cartao', label: 'Cartão' },
  { value: 'outro', label: 'Outro' },
];

const ROTULO_TIPO: Record<EventoParcelaAcordo['tipo'], string> = {
  pagamento_total: 'Pagamento',
  pagamento_parcial: 'Pagamento parcial',
  juros_aplicado: 'Encargo por atraso',
  multa_aplicada: 'Multa',
  desconto_concedido: 'Desconto',
  estorno: 'Estorno',
};

// ===================== Baixa =====================
interface FormPagamentoProps {
  parcela: ParcelaAcordoRow;
  valor: number;
  data: string;
  meio: string;
  observacao: string;
  quitarComDesconto: boolean;
  motivoDesconto: string;
  podeDarDesconto: boolean;
  tetoDesconto: number;
  onValor: (v: number) => void;
  onData: (v: string) => void;
  onMeio: (v: string) => void;
  onObservacao: (v: string) => void;
  onQuitarComDesconto: (v: boolean) => void;
  onMotivoDesconto: (v: string) => void;
}

/**
 * Por que o desconto NÃO está disponível — ou null quando está.
 *
 * Espelha as recusas de avaliar_desconto_acordo no banco, para o operador saber
 * antes de confirmar em vez de descobrir no erro. Devolve string|null em vez de
 * união discriminada porque o projeto roda com `strict: false`, onde os tipos
 * literais da união não estreitam.
 *
 * Passar do teto NÃO está aqui: é permitido ao admin e vira exceção registrada.
 */
function bloqueioDoDesconto(
  parcela: ParcelaAcordoRow, dataPagamento: string,
  podeDarDesconto: boolean, teto: number,
): string | null {
  if (!podeDarDesconto) return 'Só um administrador concede desconto.';
  if (teto <= 0) return 'Desconto desabilitado. Defina o teto em Configurações.';
  if (dataPagamento > parcela.data_vencimento) {
    return `Desconto vale só até o vencimento (${formatData(parcela.data_vencimento)}).`;
  }
  return null;
}

/**
 * O que fazer com a diferença quando o recebido é menor que o saldo.
 *
 * O desconto é DERIVADO do valor recebido, não digitado à parte: o operador
 * informa o que entrou e decide se a parcela fica aberta pelo resto ou se a
 * diferença é desconto. Pedir os dois números seria digitar o mesmo dinheiro
 * duas vezes.
 */
function DiferencaParaMenos({
  parcela, faltante, dataPagamento, quitarComDesconto, motivoDesconto,
  podeDarDesconto, teto, onQuitarComDesconto, onMotivoDesconto,
}: {
  parcela: ParcelaAcordoRow;
  faltante: number;
  dataPagamento: string;
  quitarComDesconto: boolean;
  motivoDesconto: string;
  podeDarDesconto: boolean;
  teto: number;
  onQuitarComDesconto: (v: boolean) => void;
  onMotivoDesconto: (v: string) => void;
}) {
  const bloqueio = bloqueioDoDesconto(parcela, dataPagamento, podeDarDesconto, teto);
  // Acima do teto é exceção, não impedimento: o aviso informa a consequência
  // em vez de perguntar se a pessoa está decidida. Confirmação pedida toda hora
  // vira reflexo; registro com nome e motivo, não.
  const excedeTeto = faltante > teto;

  return (
    <Alert>
      <AlertTriangle className="h-4 w-4" />
      <AlertDescription className="space-y-3">
        <p>
          Faltam <strong>{formatCurrency(faltante)}</strong> para o saldo.
          {!quitarComDesconto && ' A parcela continua em aberto por essa diferença.'}
        </p>

        {!bloqueio ? (
          <div className="space-y-3">
            <div className="flex items-start gap-2">
              <Checkbox
                id="quitar-desconto"
                checked={quitarComDesconto}
                onCheckedChange={(v) => onQuitarComDesconto(v === true)}
                className="mt-0.5"
              />
              <Label htmlFor="quitar-desconto" className="text-sm font-normal leading-snug cursor-pointer">
                Quitar a parcela com <strong>desconto de {formatCurrency(faltante)}</strong> por
                antecipação
                {excedeTeto && <span className="text-amber-700 dark:text-amber-300"> (acima do teto)</span>}
              </Label>
            </div>
            {quitarComDesconto && excedeTeto && (
              <p className="rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-800 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200">
                Acima do teto de {formatCurrency(teto)} nesta parcela. Será registrado como
                <strong> exceção</strong>, com o seu nome e o motivo, e aparecerá em
                Relatórios › Descontos.
              </p>
            )}
            {quitarComDesconto && (
              <div className="space-y-2">
                <Label htmlFor="desc-motivo">
                  Motivo do desconto (obrigatório)
                </Label>
                <Input
                  id="desc-motivo"
                  value={motivoDesconto}
                  onChange={(e) => onMotivoDesconto(e.target.value)}
                  placeholder={excedeTeto
                    ? 'Justifique a exceção — ex: proposta à vista, última chance'
                    : 'Ex: antecipou duas parcelas'}
                />
              </div>
            )}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            Para quitar por valor menor seria preciso desconto. {bloqueio}
          </p>
        )}
      </AlertDescription>
    </Alert>
  );
}

/** Recebido acima do saldo: a diferença é encargo de atraso. */
function DiferencaParaMais({ excedente }: { excedente: number }) {
  return (
    <Alert>
      <Info className="h-4 w-4" />
      <AlertDescription>
        {formatCurrency(excedente)} acima do saldo. A diferença é registrada como
        <strong> encargo por atraso</strong> e a parcela fica quitada.
      </AlertDescription>
    </Alert>
  );
}

function FormPagamento({
  parcela, valor, data, meio, observacao, quitarComDesconto, motivoDesconto,
  podeDarDesconto, tetoDesconto,
  onValor, onData, onMeio, onObservacao, onQuitarComDesconto, onMotivoDesconto,
}: FormPagamentoProps) {
  const saldo = parcela.saldo_atual;
  const diferenca = Number((valor - saldo).toFixed(2));

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>Valor recebido</Label>
          <button
            type="button"
            onClick={() => onValor(saldo)}
            className="text-xs text-primary hover:underline"
          >
            Usar o saldo ({formatCurrency(saldo)})
          </button>
        </div>
        <InputMoeda value={valor} onChange={onValor} />
      </div>

      {valor > 0 && diferenca > 0 && <DiferencaParaMais excedente={diferenca} />}
      {valor > 0 && diferenca < 0 && (
        <DiferencaParaMenos
          parcela={parcela}
          faltante={-diferenca}
          dataPagamento={data}
          quitarComDesconto={quitarComDesconto}
          motivoDesconto={motivoDesconto}
          podeDarDesconto={podeDarDesconto}
          teto={tetoDesconto}
          onQuitarComDesconto={onQuitarComDesconto}
          onMotivoDesconto={onMotivoDesconto}
        />
      )}

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="baixa-data">Data do pagamento</Label>
          <Input id="baixa-data" type="date" value={data} onChange={(e) => onData(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>Meio de pagamento</Label>
          <Select value={meio} onValueChange={onMeio}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {MEIOS_PAGAMENTO.map((m) => (
                <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="baixa-obs">Observação (opcional)</Label>
        <Input
          id="baixa-obs"
          value={observacao}
          onChange={(e) => onObservacao(e.target.value)}
          placeholder="Ex: pago no banco com juros"
        />
      </div>
    </div>
  );
}

// ===================== Estorno =====================
function LinhaLancamento({ evento, selecionado, onSelecionar }: {
  evento: EventoParcelaAcordo;
  selecionado: boolean;
  onSelecionar: () => void;
}) {
  const desabilitado = evento.estornado || evento.tipo === 'estorno';
  return (
    <button
      type="button"
      onClick={onSelecionar}
      disabled={desabilitado}
      className={cn(
        'flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left text-sm transition-colors',
        selecionado && 'border-primary bg-primary/5',
        desabilitado ? 'cursor-not-allowed opacity-50' : 'hover:bg-muted/40',
      )}
    >
      <div className="min-w-0">
        <div className="font-medium">{ROTULO_TIPO[evento.tipo]}</div>
        <div className="text-xs text-muted-foreground">{formatData(evento.data_evento)}</div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {evento.estornado && <Badge variant="outline" className="text-[10px]">Estornado</Badge>}
        <span className="font-medium tabular-nums">{formatCurrency(evento.valor)}</span>
      </div>
    </button>
  );
}

function FormEstorno({ parcelaId, eventoId, motivo, onEvento, onMotivo }: {
  parcelaId: string;
  eventoId: string | null;
  motivo: string;
  onEvento: (id: string) => void;
  onMotivo: (v: string) => void;
}) {
  const { data: eventos = [], isLoading } = useEventosParcelaAcordo(parcelaId);
  const estornaveis = eventos.filter((e) => e.tipo !== 'estorno');

  if (isLoading) return <p className="text-sm text-muted-foreground">Carregando lançamentos...</p>;
  if (estornaveis.length === 0) {
    return <p className="text-sm text-muted-foreground">Nenhum lançamento para estornar.</p>;
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Qual lançamento estornar?</Label>
        <div className="space-y-2">
          {estornaveis.map((evento) => (
            <LinhaLancamento
              key={evento.id}
              evento={evento}
              selecionado={eventoId === evento.id}
              onSelecionar={() => onEvento(evento.id)}
            />
          ))}
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="estorno-motivo">Motivo do estorno (obrigatório)</Label>
        <Textarea
          id="estorno-motivo"
          value={motivo}
          onChange={(e) => onMotivo(e.target.value)}
          placeholder="Ex: baixa lançada na parcela errada"
        />
      </div>
    </div>
  );
}

/** Escolhe o formulário conforme o modo — fora do modal, que já concentra
 *  estado, mutações e mensagens. */
interface CorpoModalProps {
  parcela: ParcelaAcordoRow;
  estornando: boolean;
  podeDarDesconto: boolean;
  tetoDesconto: number;
  estado: {
    valor: number; data: string; meio: string; observacao: string;
    quitarComDesconto: boolean; motivoDesconto: string; eventoId: string | null; motivo: string;
  };
  setters: {
    setValor: (v: number) => void; setData: (v: string) => void;
    setMeio: (v: string) => void; setObservacao: (v: string) => void;
    setQuitarComDesconto: (v: boolean) => void; setMotivoDesconto: (v: string) => void;
    setEventoId: (v: string) => void; setMotivo: (v: string) => void;
  };
}
function CorpoModal({ parcela, estornando, estado, setters, podeDarDesconto, tetoDesconto }: CorpoModalProps) {
  if (estornando) {
    return (
      <FormEstorno
        parcelaId={parcela.id}
        eventoId={estado.eventoId}
        motivo={estado.motivo}
        onEvento={setters.setEventoId}
        onMotivo={setters.setMotivo}
      />
    );
  }
  return (
    <FormPagamento
      parcela={parcela}
      valor={estado.valor}
      data={estado.data}
      meio={estado.meio}
      observacao={estado.observacao}
      quitarComDesconto={estado.quitarComDesconto}
      motivoDesconto={estado.motivoDesconto}
      podeDarDesconto={podeDarDesconto}
      tetoDesconto={tetoDesconto}
      onValor={setters.setValor}
      onData={setters.setData}
      onMeio={setters.setMeio}
      onObservacao={setters.setObservacao}
      onQuitarComDesconto={setters.setQuitarComDesconto}
      onMotivoDesconto={setters.setMotivoDesconto}
    />
  );
}

// ===================== Modal =====================
interface BaixaParcelaAcordoModalProps {
  parcela: ParcelaAcordoRow | null;
  modo: ModoBaixa;
  onFechar: () => void;
}

interface EstadoFormulario {
  valor: number;
  eventoId: string | null;
  motivo: string;
  quitarComDesconto: boolean;
  motivoDesconto: string;
}

/** O desconto é a diferença entre o saldo e o recebido, quando o admin opta por quitar. */
function descontoDerivado(parcela: ParcelaAcordoRow | null, valor: number, quitar: boolean): number {
  if (!quitar || !parcela) return 0;
  return Math.max(0, Number((parcela.saldo_atual - valor).toFixed(2)));
}

/** Se falta preencher algo para confirmar. Fora do componente por complexidade. */
function faltaPreencher(estornando: boolean, estado: EstadoFormulario): boolean {
  if (estornando) return !estado.eventoId || !estado.motivo.trim();
  if (estado.quitarComDesconto && !estado.motivoDesconto.trim()) return true;
  return estado.valor <= 0;
}

function mensagemErro(erro: unknown, estornando: boolean): string {
  if (erro instanceof Error) return erro.message;
  return estornando ? 'Não foi possível estornar o lançamento' : 'Não foi possível registrar o pagamento';
}

function rotuloConfirmar(pendente: boolean, estornando: boolean): string {
  if (pendente) return 'Processando...';
  return estornando ? 'Confirmar estorno' : 'Registrar pagamento';
}

/**
 * Estado do formulário, reiniciado a cada abertura — senão o motivo do estorno
 * anterior reaparece na próxima parcela.
 */
function useEstadoBaixa(parcela: ParcelaAcordoRow | null, modo: ModoBaixa) {
  const [valor, setValor] = useState(0);
  const [data, setData] = useState(hojeIso());
  const [meio, setMeio] = useState('pix');
  const [observacao, setObservacao] = useState('');
  const [eventoId, setEventoId] = useState<string | null>(null);
  const [motivo, setMotivo] = useState('');
  // Booleano, não valor: o desconto é a diferença entre o saldo e o recebido.
  const [quitarComDesconto, setQuitarComDesconto] = useState(false);
  const [motivoDesconto, setMotivoDesconto] = useState('');

  const saldoInicial = Math.max(0, parcela?.saldo_atual ?? 0);
  useEffect(() => {
    setValor(saldoInicial);
    setData(hojeIso());
    setMeio('pix');
    setObservacao('');
    setEventoId(null);
    setMotivo('');
    setQuitarComDesconto(false);
    setMotivoDesconto('');
  }, [parcela?.id, modo, saldoInicial]);

  return {
    valor, setValor, data, setData, meio, setMeio, observacao, setObservacao,
    eventoId, setEventoId, motivo, setMotivo,
    quitarComDesconto, setQuitarComDesconto, motivoDesconto, setMotivoDesconto,
  };
}

export function BaixaParcelaAcordoModal({ parcela, modo, onFechar }: BaixaParcelaAcordoModalProps) {
  const { toast } = useToast();
  const pagar = usePagarParcelaAcordo();
  const estornar = useEstornarEventoParcelaAcordo();

  const {
    valor, setValor, data, setData, meio, setMeio, observacao, setObservacao,
    eventoId, setEventoId, motivo, setMotivo,
    quitarComDesconto, setQuitarComDesconto, motivoDesconto, setMotivoDesconto,
  } = useEstadoBaixa(parcela, modo);

  const desconto = descontoDerivado(parcela, valor, quitarComDesconto);

  // Desconto é do admin; operador e vendedor não concedem (o banco também recusa).
  const { isAdmin } = useUserRole();
  const { data: config } = useConfiguracaoEmpresa();
  const tetoDesconto = tetoDescontoEmReais(config, parcela?.valor_total ?? 0);

  const pendente = pagar.isPending || estornar.isPending;
  const estornando = modo === 'estornar';

  const aplicar = async () => {
    if (estornando) {
      await estornar.mutateAsync({ eventoId: eventoId!, motivo: motivo.trim() });
      toast({ title: 'Lançamento estornado', description: 'O saldo da parcela foi recalculado.' });
      return;
    }
    await pagar.mutateAsync({
      parcelaAcordoId: parcela!.id,
      valor,
      dataPagamento: data || undefined,
      meioPagamento: meio,
      descricao: observacao.trim() || undefined,
      desconto: desconto > 0 ? desconto : undefined,
      motivoDesconto: desconto > 0 ? motivoDesconto.trim() : undefined,
    });
    toast({ title: 'Pagamento registrado', description: `Recebido ${formatCurrency(valor)}.` });
  };

  const confirmar = async () => {
    if (!parcela) return;
    try {
      await aplicar();
      onFechar();
    } catch (error) {
      toast({
        title: 'Erro',
        description: mensagemErro(error, estornando),
        variant: 'destructive',
      });
    }
  };

  const bloqueado = pendente
    || faltaPreencher(estornando, { valor, eventoId, motivo, quitarComDesconto, motivoDesconto });

  return (
    <Dialog open={!!parcela} onOpenChange={(aberto) => !aberto && onFechar()}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{estornando ? 'Estornar lançamento' : 'Registrar pagamento'}</DialogTitle>
          <DialogDescription>
            {parcela && (
              <>
                Parcela {parcela.numero_parcela} · venc. {formatData(parcela.data_vencimento)} ·
                {' '}saldo {formatCurrency(parcela.saldo_atual)}
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        {parcela && (
          <CorpoModal
            parcela={parcela}
            estornando={estornando}
            estado={{ valor, data, meio, observacao, quitarComDesconto, motivoDesconto, eventoId, motivo }}
            podeDarDesconto={isAdmin}
            tetoDesconto={tetoDesconto}
            setters={{
              setValor, setData, setMeio, setObservacao,
              setQuitarComDesconto, setMotivoDesconto, setEventoId, setMotivo,
            }}
          />
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onFechar} disabled={pendente}>
            Voltar
          </Button>
          <Button
            variant={estornando ? 'destructive' : 'default'}
            onClick={confirmar}
            disabled={bloqueado}
          >
            {rotuloConfirmar(pendente, estornando)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
