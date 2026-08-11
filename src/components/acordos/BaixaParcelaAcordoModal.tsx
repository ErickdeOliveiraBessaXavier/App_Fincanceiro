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
  saldo: number;
  valor: number;
  data: string;
  meio: string;
  observacao: string;
  onValor: (v: number) => void;
  onData: (v: string) => void;
  onMeio: (v: string) => void;
  onObservacao: (v: string) => void;
}

/** Explica o efeito do valor digitado antes de confirmar. */
function EfeitoDoValor({ saldo, valor }: { saldo: number; valor: number }) {
  const diferenca = Number((valor - saldo).toFixed(2));
  if (!valor || diferenca === 0) return null;

  if (diferenca > 0) {
    return (
      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription>
          {formatCurrency(diferenca)} acima do saldo. A diferença é registrada como
          <strong> encargo por atraso</strong> e a parcela fica quitada.
        </AlertDescription>
      </Alert>
    );
  }
  return (
    <Alert>
      <AlertTriangle className="h-4 w-4" />
      <AlertDescription>
        {formatCurrency(-diferenca)} abaixo do saldo. A parcela continua
        <strong> em aberto</strong> pela diferença. Para quitar por valor menor é preciso
        desconto autorizado — ainda não disponível.
      </AlertDescription>
    </Alert>
  );
}

function FormPagamento({
  saldo, valor, data, meio, observacao, onValor, onData, onMeio, onObservacao,
}: FormPagamentoProps) {
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

      <EfeitoDoValor saldo={saldo} valor={valor} />

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

// ===================== Modal =====================
interface BaixaParcelaAcordoModalProps {
  parcela: ParcelaAcordoRow | null;
  modo: ModoBaixa;
  onFechar: () => void;
}

interface EstadoFormulario {
  valor: number;
  data: string;
  meio: string;
  observacao: string;
  eventoId: string | null;
  motivo: string;
}

/** Se falta preencher algo para confirmar. Fora do componente por complexidade. */
function faltaPreencher(estornando: boolean, estado: EstadoFormulario): boolean {
  if (estornando) return !estado.eventoId || !estado.motivo.trim();
  return estado.valor <= 0;
}

function rotuloConfirmar(pendente: boolean, estornando: boolean): string {
  if (pendente) return 'Processando...';
  return estornando ? 'Confirmar estorno' : 'Registrar pagamento';
}

export function BaixaParcelaAcordoModal({ parcela, modo, onFechar }: BaixaParcelaAcordoModalProps) {
  const { toast } = useToast();
  const pagar = usePagarParcelaAcordo();
  const estornar = useEstornarEventoParcelaAcordo();

  const [valor, setValor] = useState(0);
  const [data, setData] = useState(hojeIso());
  const [meio, setMeio] = useState('pix');
  const [observacao, setObservacao] = useState('');
  const [eventoId, setEventoId] = useState<string | null>(null);
  const [motivo, setMotivo] = useState('');

  // Cada abertura recomeça limpa — senão o motivo do estorno anterior reaparece.
  useEffect(() => {
    if (!parcela) return;
    setValor(parcela.saldo_atual > 0 ? parcela.saldo_atual : 0);
    setData(hojeIso());
    setMeio('pix');
    setObservacao('');
    setEventoId(null);
    setMotivo('');
  }, [parcela, modo]);

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
        description: error instanceof Error
          ? error.message
          : `Não foi possível ${estornando ? 'estornar o lançamento' : 'registrar o pagamento'}`,
        variant: 'destructive',
      });
    }
  };

  const bloqueado = pendente
    || faltaPreencher(estornando, { valor, data, meio, observacao, eventoId, motivo });

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

        {parcela && estornando && (
          <FormEstorno
            parcelaId={parcela.id}
            eventoId={eventoId}
            motivo={motivo}
            onEvento={setEventoId}
            onMotivo={setMotivo}
          />
        )}
        {parcela && !estornando && (
          <FormPagamento
            saldo={parcela.saldo_atual}
            valor={valor}
            data={data}
            meio={meio}
            observacao={observacao}
            onValor={setValor}
            onData={setData}
            onMeio={setMeio}
            onObservacao={setObservacao}
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
