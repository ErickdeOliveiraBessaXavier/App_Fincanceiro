import { useEffect, useState, type ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import {
  GRUPOS_STATUS_COBRANCA,
  statusPorGrupo,
  getStatusCobranca,
  calcularProximoContato,
  validarStatusCobranca,
  paraTimestampNegocio,
  contarNaoAtendeConsecutivos,
  exigePesquisa,
  hojeIso,
  type StatusCobrancaConfig,
  type StatusCobrancaSlug,
} from '@/domain/telecobranca/statusCobranca';
import { diasDeAtraso } from '@/domain/metricas';
import { isoDeData } from '@/utils/format';
import { DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertTriangle, CalendarClock, Info, Pencil } from 'lucide-react';
import { DataPicker } from '@/components/telecobranca/DataPicker';
import { ConfirmacaoCheckbox } from '@/components/telecobranca/ConfirmacaoCheckbox';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

/**
 * Resultado de um contato de cobrança.
 *
 * O operador classifica o desfecho (status de cobrança) e o sistema sugere a
 * data do próximo contato (editável). Persiste histórico + próximo contato de
 * forma atômica via RPC — o próximo contato É o agendamento.
 *
 * A ordem das seções segue a ligação: primeiro o que aconteceu, depois o que
 * fica combinado, por último a anotação — que é o campo digitado enquanto se
 * conversa. O próximo contato aparece como uma frase pronta com "ajustar", e não
 * como mais um campo: na maioria dos contatos a sugestão da régua é aceita.
 *
 * Toda regra vem de src/domain/telecobranca/statusCobranca.ts.
 */

interface ResultadoCobrancaFormProps {
  clienteId: string;
  clienteNome: string;
  tituloId?: string;
  acordoId?: string;
  onSucesso: () => void;
  onCancelar: () => void;
  /**
   * 'modal' fecha ao salvar; 'painel' fica montado na ficha e se limpa para o
   * próximo registro. O formulário é o mesmo — muda o rodapé e a densidade.
   */
  variante?: 'modal' | 'painel';
  /** No painel: salva e já abre a ficha do próximo cliente da fila. */
  onSalvarEProximo?: () => void;
}

const STATUS_PADRAO: StatusCobrancaSlug = 'sem_previsao_pagamento';

// Últimos status do cliente -> quantos "Não Atende" consecutivos ele acumula
// (a regra de tentativas vive na camada de negócio).
async function carregarTentativas(clienteId: string): Promise<number> {
  const { data } = await supabase
    .from('comunicacoes')
    .select('status_cobranca')
    .eq('cliente_id', clienteId)
    .not('status_cobranca', 'is', null)
    .order('data_contato', { ascending: false })
    .limit(20);
  const historico = (data ?? []).map((r) => r.status_cobranca as StatusCobrancaSlug);
  return contarNaoAtendeConsecutivos(historico);
}

// ============== Peças do formulário ==============

/** Passo numerado. Dá ao formulário uma leitura de cima para baixo. */
function Passo({ numero, titulo, children }: { numero: number; titulo: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h4 className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
        <span className="flex h-4 w-4 items-center justify-center rounded-full bg-muted text-[10px] text-foreground">
          {numero}
        </span>
        {titulo}
      </h4>
      {children}
    </section>
  );
}

function SeletorStatus({ status, onChange }: {
  status: StatusCobrancaSlug;
  onChange: (valor: string) => void;
}) {
  return (
    <Select value={status} onValueChange={onChange}>
      <SelectTrigger><SelectValue /></SelectTrigger>
      <SelectContent>
        {GRUPOS_STATUS_COBRANCA.map((g) => (
          <SelectGroup key={g.grupo}>
            <SelectLabel>{g.label}</SelectLabel>
            {statusPorGrupo(g.grupo).map((s) => (
              <SelectItem key={s.slug} value={s.slug}>{s.label}</SelectItem>
            ))}
          </SelectGroup>
        ))}
      </SelectContent>
    </Select>
  );
}

function Orientacao({ config, compacto }: { config: StatusCobrancaConfig; compacto: boolean }) {
  const alta = config.prioridade === 'alta';
  return (
    <Alert variant={alta ? 'destructive' : 'default'} className={compacto ? 'py-2' : undefined}>
      {alta ? <AlertTriangle className="h-4 w-4" /> : <Info className="h-4 w-4" />}
      <AlertDescription className={compacto ? 'text-xs' : undefined}>
        {config.orientacao}
      </AlertDescription>
    </Alert>
  );
}

/** "em 7 dias", "amanhã", "hoje" — a distância importa mais que a data. */
function distanciaEmDias(data: Date): string {
  const dias = diasDeAtraso(hojeIso(), isoDeData(data));
  if (dias <= 0) return 'hoje';
  if (dias === 1) return 'amanhã';
  return `em ${dias} dias`;
}

/**
 * Próximo contato como frase pronta, com ajuste sob demanda.
 *
 * A data vem calculada da régua do status; abrir o calendário toda vez para
 * confirmar o que o sistema já decidiu era trabalho à toa.
 */
function ProximoContato({ valor, onChange }: {
  valor: Date | undefined;
  onChange: (d: Date | undefined) => void;
}) {
  const [ajustando, setAjustando] = useState(false);

  if (ajustando || !valor) {
    return <DataPicker value={valor} onChange={onChange} desabilitarPassado />;
  }

  return (
    <div className="flex items-center justify-between gap-2 rounded-xl border border-border/60 bg-muted/20 px-3 py-2">
      <span className="flex min-w-0 items-center gap-2 text-sm">
        <CalendarClock className="h-4 w-4 shrink-0 text-primary" />
        <span className="truncate font-medium">
          {format(valor, "EEEE, dd/MM", { locale: ptBR })}
        </span>
        <span className="shrink-0 text-xs text-muted-foreground">{distanciaEmDias(valor)}</span>
      </span>
      <Button variant="ghost" size="sm" className="h-7 gap-1 px-2" onClick={() => setAjustando(true)}>
        <Pencil className="h-3 w-3" />
        <span className="text-xs">Ajustar</span>
      </Button>
    </div>
  );
}

/** Confirmações que só existem para alguns status. */
function Confirmacoes({ config, status, precisaPesquisa, pesquisa, interna, onPesquisa, onInterna }: {
  config: StatusCobrancaConfig;
  status: StatusCobrancaSlug;
  precisaPesquisa: boolean;
  pesquisa: boolean;
  interna: boolean;
  onPesquisa: (v: boolean) => void;
  onInterna: (v: boolean) => void;
}) {
  return (
    <>
      {precisaPesquisa && (
        <ConfirmacaoCheckbox id="pesquisa" checked={pesquisa} onChange={onPesquisa}>
          Confirmo que a pesquisa de contato foi realizada.
          {status === 'nao_atende' &&
            ' Esta é a 3ª tentativa ou posterior. Se a pesquisa não localizar o cliente, selecione "Contato inexistente/inválido".'}
        </ConfirmacaoCheckbox>
      )}

      {config.exigeConfirmacaoInterna && (
        <ConfirmacaoCheckbox id="devolucao" checked={interna} onChange={onInterna}>
          Confirmo que a devolução total foi validada internamente pela equipe.
        </ConfirmacaoCheckbox>
      )}
    </>
  );
}

/**
 * Rodapé do formulário. Fora do componente principal para não somar
 * complexidade nele (regra do projeto) — e porque a diferença entre modal e
 * painel é só aqui.
 */
function RodapeResultado({ variante, loading, onCancelar, onSalvar, onSalvarEProximo }: {
  variante: 'modal' | 'painel';
  loading: boolean;
  onCancelar: () => void;
  onSalvar: () => void;
  onSalvarEProximo?: () => void;
}) {
  const salvando = loading ? 'Salvando...' : null;

  if (variante === 'modal') {
    return (
      <DialogFooter>
        <Button variant="outline" onClick={onCancelar} disabled={loading}>Cancelar</Button>
        <Button onClick={onSalvar} disabled={loading}>{salvando ?? 'Registrar'}</Button>
      </DialogFooter>
    );
  }

  return (
    <div className="flex flex-col gap-2 pt-1">
      {onSalvarEProximo && (
        <Button size="lg" onClick={onSalvarEProximo} disabled={loading}>
          {salvando ?? 'Salvar e ir para o próximo'}
        </Button>
      )}
      <Button
        variant={onSalvarEProximo ? 'outline' : 'default'}
        onClick={onSalvar}
        disabled={loading}
      >
        {salvando ?? (onSalvarEProximo ? 'Salvar e ficar aqui' : 'Salvar')}
      </Button>
    </div>
  );
}

/** O que acabou de ser gravado — o formulário limpo não contava nada. */
function ConfirmacaoRegistro({ resumo }: { resumo: string | null }) {
  if (!resumo) return null;
  return (
    <p className="rounded-lg border border-success/30 bg-success/5 px-3 py-2 text-xs font-medium text-success">
      {resumo}
    </p>
  );
}

// ============== Formulário ==============

export function ResultadoCobrancaForm({
  clienteId, clienteNome, tituloId, acordoId, onSucesso, onCancelar,
  variante = 'modal', onSalvarEProximo,
}: ResultadoCobrancaFormProps) {
  const [status, setStatus] = useState<StatusCobrancaSlug>(STATUS_PADRAO);
  const [descricao, setDescricao] = useState('');
  const [dataPrevista, setDataPrevista] = useState<Date | undefined>(undefined);
  const [proximoContato, setProximoContato] = useState<Date | undefined>(undefined);
  const [tentativasAnteriores, setTentativasAnteriores] = useState(0);
  const [pesquisaConfirmada, setPesquisaConfirmada] = useState(false);
  const [confirmacaoInterna, setConfirmacaoInterna] = useState(false);
  const [loading, setLoading] = useState(false);
  const [ultimoRegistro, setUltimoRegistro] = useState<string | null>(null);
  const { toast } = useToast();

  const painel = variante === 'painel';
  const config = getStatusCobranca(status);
  const ctx = { dataPrevista, tentativasAnteriores, pesquisaConfirmada, confirmacaoInterna };
  const precisaPesquisa = exigePesquisa(status, ctx);

  // Recalcula a sugestão do próximo contato quando o status ou a data prevista
  // mudam. A edição manual no calendário persiste até a próxima mudança destes.
  useEffect(() => {
    setProximoContato(calcularProximoContato(status, { dataPrevista }));
  }, [status, dataPrevista]);

  // Quantos "Não Atende" consecutivos o cliente já acumulou (para exigir
  // pesquisa a partir da 3ª tentativa).
  useEffect(() => {
    let cancelado = false;
    void carregarTentativas(clienteId).then((qtd) => {
      if (!cancelado) setTentativasAnteriores(qtd);
    });
    return () => { cancelado = true; };
  }, [clienteId]);

  const handleStatusChange = (valor: string) => {
    setStatus(valor as StatusCobrancaSlug);
    setPesquisaConfirmada(false);
    setConfirmacaoInterna(false);
  };

  // Registra as confirmações feitas pelo operador junto da descrição (histórico).
  const montarDescricao = () => {
    const marcas: string[] = [];
    if (pesquisaConfirmada) marcas.push('[Pesquisa de contato realizada]');
    if (confirmacaoInterna) marcas.push('[Devolução confirmada internamente]');
    return [marcas.join(' '), descricao].filter(Boolean).join(' ').trim() || undefined;
  };

  /** Deixa o formulário pronto para o próximo registro (só no painel). */
  const limpar = () => {
    setDescricao('');
    setDataPrevista(undefined);
    setPesquisaConfirmada(false);
    setConfirmacaoInterna(false);
    setStatus(STATUS_PADRAO);
  };

  const gravar = async (quando: Date) => {
    // Grava histórico (comunicacao) + próximo contato (agendamento) atômico.
    const { error } = await supabase.rpc('registrar_resultado_cobranca', {
      p_cliente_id: clienteId,
      p_status_cobranca: status,
      p_data_proximo_contato: paraTimestampNegocio(quando),
      p_descricao: montarDescricao(),
      p_titulo_id: tituloId || undefined,
      p_acordo_id: acordoId || undefined,
    });
    if (error) throw error;
  };

  const invalido = (): string | null =>
    validarStatusCobranca(status, ctx) ??
    (proximoContato ? null : 'Defina a data do próximo contato.');

  const handleSubmit = async (depois?: () => void) => {
    const erro = invalido();
    if (erro) {
      toast({ title: 'Erro', description: erro, variant: 'destructive' });
      return;
    }

    try {
      setLoading(true);
      await gravar(proximoContato!);

      const resumo = `${config.label} · próximo contato ${format(proximoContato!, 'dd/MM')}`;
      toast({ title: 'Registrado', description: resumo });
      if (painel) {
        setUltimoRegistro(`Registrado agora: ${resumo}`);
        limpar();
      }
      onSucesso();
      depois?.();
    } catch (error) {
      toast({
        title: 'Erro',
        description: error instanceof Error ? error.message : 'Não foi possível registrar o resultado',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <div className={painel ? 'space-y-4' : 'space-y-4 py-2'}>
        {painel ? (
          <ConfirmacaoRegistro resumo={ultimoRegistro} />
        ) : (
          <p className="text-sm text-muted-foreground">
            Classifique o resultado do contato com <strong>{clienteNome}</strong>. O próximo contato
            é sugerido automaticamente.
          </p>
        )}

        <Passo numero={1} titulo="O que aconteceu">
          <SeletorStatus status={status} onChange={handleStatusChange} />
          <Orientacao config={config} compacto={painel} />
          {config.exigeDataPrevista && (
            <div className="space-y-1.5 pt-1">
              <Label className="text-xs">Data prevista de pagamento *</Label>
              <DataPicker value={dataPrevista} onChange={setDataPrevista} desabilitarPassado />
            </div>
          )}
          <Confirmacoes
            config={config}
            status={status}
            precisaPesquisa={precisaPesquisa}
            pesquisa={pesquisaConfirmada}
            interna={confirmacaoInterna}
            onPesquisa={setPesquisaConfirmada}
            onInterna={setConfirmacaoInterna}
          />
        </Passo>

        <Passo numero={2} titulo="Próximo contato">
          <ProximoContato valor={proximoContato} onChange={setProximoContato} />
        </Passo>

        <Passo numero={3} titulo="Anotações do contato">
          <Textarea
            placeholder="O que o cliente disse..."
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
            rows={painel ? 3 : 4}
          />
        </Passo>
      </div>

      <RodapeResultado
        variante={variante}
        loading={loading}
        onCancelar={onCancelar}
        onSalvar={() => handleSubmit()}
        onSalvarEProximo={onSalvarEProximo && (() => handleSubmit(onSalvarEProximo))}
      />
    </>
  );
}
