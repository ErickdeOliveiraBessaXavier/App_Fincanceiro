import { useCallback, useMemo, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react';
import { Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { InputMoeda } from '@/components/InputMoeda';
import { SelecionarTitulosAcordo } from '@/components/acordos/SelecionarTitulosAcordo';
import { useToast } from '@/hooks/use-toast';
import { useTitulosAgrupados, type TituloAgrupado } from '@/hooks/useTitulosAgrupados';
import { useCreateAcordo } from '@/lib/queries/acordos';
import { hojeIso } from '@/domain/telecobranca/statusCobranca';
import {
  gerarCronograma,
  podarDatasManuais,
  totalCronograma,
  type CronogramaParcela,
  type DatasManuais,
} from '@/domain/acordos/cronograma';
import { descontoPercentual, resumoNegociacao } from '@/domain/acordos/negociacao';
import { cn } from '@/lib/utils';

/**
 * Criação de acordo — autocontido.
 *
 * Vivia dentro de Acordos.tsx, então negociar a partir da ficha do cliente
 * exigia `navigate('/acordos')`: fechar o modal largava o operador em outra tela
 * no meio do atendimento. Extraído, o mesmo fluxo roda onde o operador já está.
 *
 * Monte-o condicionalmente (`{aberto && <NovoAcordoDialog .../>}`): a busca de
 * títulos acontece na montagem, e é isso que mantém os dados frescos a cada
 * abertura sem um refetch manual do lado de fora.
 */

// Largura do modal — mesmo token de "modal largo" usado em Clientes.
const MODAL_LARGO = 'sm:max-w-[75vw] max-h-[90vh] overflow-y-auto p-4 sm:p-6';
// Painel lateral: largo o bastante para as duas colunas, com o cabeçalho e o
// rodapé fixos e só o meio rolando.
const PAINEL_LARGO = 'flex w-full flex-col gap-0 p-0 sm:max-w-[min(900px,92vw)]';

/** Como o formulário aparece. 'painel' mantém a ficha do cliente visível atrás. */
export type ApresentacaoAcordo = 'modal' | 'painel';

interface MolduraProps {
  apresentacao: ApresentacaoAcordo;
  open: boolean;
  onOpenChange: (aberto: boolean) => void;
  rodape: ReactNode;
  children: ReactNode;
}

const TITULO = 'Novo Acordo';
const SUBTITULO = 'Selecione os títulos e configure o acordo de pagamento';

/**
 * Moldura do formulário: diálogo centralizado ou painel lateral.
 *
 * O conteúdo é o MESMO nos dois — só muda o recipiente. Na ficha do cliente o
 * painel deslizante é o certo: negociar sem perder de vista a dívida e o
 * histórico que estão atrás era justamente o que o redirecionamento para
 * /acordos quebrava.
 */
function MolduraNovoAcordo({ apresentacao, open, onOpenChange, rodape, children }: MolduraProps) {
  if (apresentacao === 'painel') {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className={PAINEL_LARGO}>
          <SheetHeader className="border-b p-6 pb-4">
            <SheetTitle>{TITULO}</SheetTitle>
            <SheetDescription>{SUBTITULO}</SheetDescription>
          </SheetHeader>
          <div className="min-h-0 flex-1 overflow-y-auto p-6">{children}</div>
          <SheetFooter className="gap-2 border-t p-4">{rodape}</SheetFooter>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={MODAL_LARGO}>
        <DialogHeader>
          <DialogTitle>{TITULO}</DialogTitle>
          <DialogDescription>{SUBTITULO}</DialogDescription>
        </DialogHeader>
        {children}
        <DialogFooter>{rodape}</DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

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

const acordoVazio = (): NovoAcordo => ({
  cliente_id: '',
  titulo_ids: [],
  valor_original: 0,
  valor_acordo: 0,
  parcelas: 1,
  taxa_juros: 0,
  data_inicio: hojeIso(),
  data_vencimento_primeira_parcela: hojeIso(),
  observacoes: '',
});

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
  const total = totalCronograma(cronograma);

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

// Torna explícita a diferença entre o débito e o que foi negociado — inclusive
// quando o acordo fecha ACIMA do débito, caso legítimo (juros/acréscimo).
function ResumoNegociacaoHint({ valorOriginal, valorAcordo }: { valorOriginal: number; valorAcordo: number }) {
  const resumo = resumoNegociacao(valorOriginal, valorAcordo);
  if (resumo.tipo === 'neutro') return null;

  const acrescimo = resumo.tipo === 'acrescimo';
  return (
    <span className={cn('block text-xs', acrescimo ? 'text-amber-600' : 'text-muted-foreground')}>
      {acrescimo ? 'Acréscimo' : 'Desconto'} de {formatCurrency(resumo.valor)}
      {' '}({resumo.percentual.toFixed(1)}%) sobre o débito
    </span>
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
          <Input value={formatCurrency(newAcordo.valor_original)} disabled className="bg-muted" />
        </div>
        <div className="space-y-2">
          <Label>Valor do Acordo</Label>
          <InputMoeda
            value={newAcordo.valor_acordo}
            onChange={(valor) => setNewAcordo(prev => ({ ...prev, valor_acordo: valor }))}
            className={formErrors.valor_acordo ? 'border-red-500' : ''}
          />
          {formErrors.valor_acordo ? (
            <span className="text-xs text-red-500">{formErrors.valor_acordo}</span>
          ) : (
            <ResumoNegociacaoHint
              valorOriginal={newAcordo.valor_original}
              valorAcordo={totalCronograma(cronograma) || newAcordo.valor_acordo}
            />
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
            className={formErrors.parcelas ? 'border-red-500' : ''}
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
            className={formErrors.data_vencimento_primeira_parcela ? 'border-red-500' : ''}
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

// ===================== Validação =====================
function validarAcordo(acordo: NovoAcordo, cronograma: CronogramaParcela[]): FormErrors {
  const errors: FormErrors = {};
  if (!acordo.cliente_id || acordo.titulo_ids.length === 0) {
    errors.cliente_id = 'Selecione pelo menos um título';
  }
  if (!acordo.valor_acordo || acordo.valor_acordo <= 0) {
    errors.valor_acordo = 'Valor do acordo deve ser maior que zero';
  }
  if (!acordo.parcelas || acordo.parcelas <= 0) {
    errors.parcelas = 'Número de parcelas deve ser maior que zero';
  }
  if (!acordo.data_vencimento_primeira_parcela || cronograma.some((p) => !p.data_vencimento)) {
    errors.data_vencimento_primeira_parcela = 'Preencha o vencimento de todas as parcelas';
  }
  return errors;
}

// ===================== Componente principal =====================
interface NovoAcordoDialogProps {
  open: boolean;
  onOpenChange: (aberto: boolean) => void;
  /** Fixa o cliente e já marca todos os títulos dele (abertura pela ficha). */
  clienteIdPreSelecionado?: string;
  /** Chamado após criar com sucesso — para a tela de origem se atualizar. */
  onCriado?: () => void;
  /** 'painel' abre como Sheet lateral (ficha do cliente); 'modal' é o padrão. */
  apresentacao?: ApresentacaoAcordo;
}

export function NovoAcordoDialog({
  open, onOpenChange, clienteIdPreSelecionado, onCriado, apresentacao = 'modal',
}: NovoAcordoDialogProps) {
  const { toast } = useToast();
  const createAcordo = useCreateAcordo();
  // Com cliente fixado, busca só a dívida dele — bem mais barato que a base toda.
  const { clientes, loading } = useTitulosAgrupados(clienteIdPreSelecionado);

  const [newAcordo, setNewAcordo] = useState<NovoAcordo>(acordoVazio);
  const [formErrors, setFormErrors] = useState<FormErrors>({});
  // Datas sobrescritas na mão, por número de parcela. O resto do cronograma é
  // sugerido a partir do vencimento da 1ª.
  const [datasManuais, setDatasManuais] = useState<DatasManuais>({});

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

  // A 1ª parcela é a âncora da sugestão: editá-la re-sugere as seguintes. As
  // demais viram sobrescrita individual e param de acompanhar a âncora.
  const handleDataParcelaChange = useCallback((numero: number, data: string) => {
    if (numero === 1) {
      setNewAcordo(prev => ({ ...prev, data_vencimento_primeira_parcela: data }));
      return;
    }
    setDatasManuais(prev => ({ ...prev, [numero]: data }));
  }, []);

  const handleSelectionChange = useCallback((selection: SelectionData | null) => {
    if (!selection) {
      setNewAcordo(prev => ({
        ...prev, cliente_id: '', titulo_ids: [], valor_original: 0, valor_acordo: 0,
      }));
      return;
    }
    setNewAcordo(prev => ({
      ...prev,
      cliente_id: selection.clienteId,
      titulo_ids: selection.tituloIds,
      valor_original: selection.valorTotal,
      // Só reaproveita o valor digitado se o operador realmente o alterou.
      valor_acordo: prev.valor_acordo === 0 || prev.valor_acordo === prev.valor_original
        ? selection.valorTotal
        : prev.valor_acordo,
    }));
  }, []);

  const criar = async () => {
    const erros = validarAcordo(newAcordo, cronograma);
    setFormErrors(erros);
    if (Object.keys(erros).length > 0) {
      toast({
        title: 'Erro',
        description: 'Por favor, preencha todos os campos obrigatórios.',
        variant: 'destructive',
      });
      return;
    }

    try {
      // Usa o cronograma exibido — inclui as datas ajustadas na mão.
      const valorTotalComJuros = totalCronograma(cronograma);
      // Percentual sobre o mesmo par de valores que será gravado. Acordo acima
      // do débito não tem desconto (a coluna só aceita 0..100) — a diferença
      // fica legível em valor_original x valor_acordo.
      const desconto = descontoPercentual(newAcordo.valor_original, valorTotalComJuros);

      await createAcordo.mutateAsync({
        titulo_ids: newAcordo.titulo_ids,
        cliente_id: newAcordo.cliente_id,
        valor_original: newAcordo.valor_original,
        valor_acordo: valorTotalComJuros,
        desconto,
        parcelas: newAcordo.parcelas,
        valor_parcela: valorTotalComJuros / newAcordo.parcelas,
        data_vencimento_primeira_parcela: newAcordo.data_vencimento_primeira_parcela,
        observacoes: newAcordo.observacoes,
        cronograma: cronograma.map((p) => ({
          numero_parcela: p.numero,
          valor: p.valor,
          valor_juros: p.valor_juros,
          valor_total: p.valor_total,
          data_vencimento: p.data_vencimento,
        })),
      });

      toast({
        title: 'Sucesso',
        description: `Acordo criado com sucesso. ${newAcordo.titulo_ids.length} título(s) incluído(s).`,
      });
      setNewAcordo(acordoVazio());
      setDatasManuais({});
      setFormErrors({});
      onOpenChange(false);
      onCriado?.();
    } catch (error) {
      // A mensagem do banco (constraint, permissão, título já em acordo) é mais
      // útil que um texto genérico — o operador consegue corrigir o cadastro.
      toast({
        title: 'Erro',
        description: error instanceof Error ? error.message : 'Não foi possível criar o acordo',
        variant: 'destructive',
      });
    }
  };

  // Sem título escolhido não há o que configurar: mantém uma coluna só, para a
  // seleção não ficar espremida com metade do modal vazia ao lado.
  const mostrarConfiguracao = !loading && newAcordo.titulo_ids.length > 0;

  // No painel a largura útil é menor: as duas colunas só entram a partir de xl,
  // senão a seleção de títulos e o cronograma ficam espremidos lado a lado.
  const duasColunas = mostrarConfiguracao
    ? (apresentacao === 'painel' ? 'xl:grid-cols-2' : 'lg:grid-cols-2')
    : '';

  return (
    <MolduraNovoAcordo
      apresentacao={apresentacao}
      open={open}
      onOpenChange={onOpenChange}
      rodape={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            onClick={criar}
            disabled={newAcordo.titulo_ids.length === 0 || createAcordo.isPending}
          >
            {createAcordo.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Criar Acordo
          </Button>
        </>
      }
    >
      <div className={`grid gap-6 ${duasColunas}`}>
        <div className="min-w-0">
          <SelecionarTitulosAcordo
            clientes={clientes}
            clienteIdPreSelecionado={clienteIdPreSelecionado}
            loading={loading}
            onSelectionChange={handleSelectionChange}
          />
        </div>

        {mostrarConfiguracao && (
          <div className="min-w-0 space-y-4">
            <ConfiguracaoAcordo
              newAcordo={newAcordo}
              setNewAcordo={setNewAcordo}
              formErrors={formErrors}
              cronograma={cronograma}
              temDatasManuais={Object.keys(datasAtivas).length > 0}
              onDataParcelaChange={handleDataParcelaChange}
              onResetDatas={() => setDatasManuais({})}
            />
          </div>
        )}
      </div>
    </MolduraNovoAcordo>
  );
}
