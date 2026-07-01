import { useEffect, useState } from 'react';
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
  type StatusCobrancaSlug,
} from '@/domain/telecobranca/statusCobranca';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Checkbox } from '@/components/ui/checkbox';
import { CalendarIcon, AlertTriangle, Info } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';

// Fluxo "Registrar Resultado": o operador classifica o resultado do contato
// (status de cobrança) e o sistema sugere automaticamente a data do próximo
// contato (editável). Persiste em `agendamentos` (ação futura) — o próximo
// contato É o agendamento; comunicacoes guarda o histórico (fluxos separados).
// Toda regra vem de src/domain/telecobranca/statusCobranca.ts.

interface RegistrarResultadoModalProps {
  isOpen: boolean;
  onClose: () => void;
  clienteId: string;
  clienteNome: string;
  tituloId?: string;
  acordoId?: string;
  onSuccess: () => void;
}

const STATUS_PADRAO: StatusCobrancaSlug = 'sem_previsao_pagamento';

// Busca os últimos status de cobrança do cliente e conta os "Não Atende"
// consecutivos (regra de tentativas vive na camada de negócio).
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

function DatePicker({
  value,
  onChange,
  desabilitarPassado,
}: {
  value: Date | undefined;
  onChange: (d: Date | undefined) => void;
  desabilitarPassado?: boolean;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn('w-full justify-start text-left font-normal', !value && 'text-muted-foreground')}
        >
          <CalendarIcon className="mr-2 h-4 w-4" />
          {value ? format(value, 'dd/MM/yyyy', { locale: ptBR }) : <span>Selecione</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={value}
          onSelect={onChange}
          disabled={desabilitarPassado ? (date) => date < new Date() : undefined}
          locale={ptBR}
        />
      </PopoverContent>
    </Popover>
  );
}

function ConfirmacaoCheckbox({
  id,
  checked,
  onChange,
  children,
}: {
  id: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 dark:border-amber-700 dark:bg-amber-950/40">
      <Checkbox id={id} checked={checked} onCheckedChange={(v) => onChange(v === true)} className="mt-0.5" />
      <Label htmlFor={id} className="text-sm font-normal leading-snug cursor-pointer">
        {children}
      </Label>
    </div>
  );
}

export function RegistrarResultadoModal({
  isOpen,
  onClose,
  clienteId,
  clienteNome,
  tituloId,
  acordoId,
  onSuccess,
}: RegistrarResultadoModalProps) {
  const [status, setStatus] = useState<StatusCobrancaSlug>(STATUS_PADRAO);
  const [descricao, setDescricao] = useState('');
  const [dataPrevista, setDataPrevista] = useState<Date | undefined>(undefined);
  const [proximoContato, setProximoContato] = useState<Date | undefined>(undefined);
  const [tentativasAnteriores, setTentativasAnteriores] = useState(0);
  const [pesquisaConfirmada, setPesquisaConfirmada] = useState(false);
  const [confirmacaoInterna, setConfirmacaoInterna] = useState(false);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const config = getStatusCobranca(status);
  const ctx = { dataPrevista, tentativasAnteriores, pesquisaConfirmada, confirmacaoInterna };
  const precisaPesquisa = exigePesquisa(status, ctx);

  // Recalcula a sugestão do próximo contato quando o status ou a data prevista
  // mudam. A edição manual no calendário persiste até a próxima mudança destes.
  useEffect(() => {
    setProximoContato(calcularProximoContato(status, { dataPrevista }));
  }, [status, dataPrevista]);

  // Ao abrir, calcula quantas tentativas de "Não Atende" consecutivas o cliente
  // já acumulou (para exigir pesquisa a partir da 3ª).
  useEffect(() => {
    if (!isOpen) return;
    let cancelado = false;
    void carregarTentativas(clienteId).then((qtd) => {
      if (!cancelado) setTentativasAnteriores(qtd);
    });
    return () => {
      cancelado = true;
    };
  }, [isOpen, clienteId]);

  const handleStatusChange = (valor: string) => {
    setStatus(valor as StatusCobrancaSlug);
    setPesquisaConfirmada(false);
    setConfirmacaoInterna(false);
  };

  const resetForm = () => {
    setStatus(STATUS_PADRAO);
    setDescricao('');
    setDataPrevista(undefined);
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

  // Grava histórico (comunicacao) + próximo contato (agendamento) atômico via RPC.
  const registrar = async (proximo: Date) => {
    const { error } = await supabase.rpc('registrar_resultado_cobranca', {
      p_cliente_id: clienteId,
      p_status_cobranca: status,
      p_data_proximo_contato: paraTimestampNegocio(proximo),
      p_descricao: montarDescricao(),
      p_titulo_id: tituloId || undefined,
      p_acordo_id: acordoId || undefined,
    });
    if (error) throw error;
  };

  const handleSubmit = async () => {
    const erroValidacao = validarStatusCobranca(status, ctx);
    if (erroValidacao) {
      toast({ title: 'Erro', description: erroValidacao, variant: 'destructive' });
      return;
    }
    if (!proximoContato) {
      toast({ title: 'Erro', description: 'Defina a data do próximo contato.', variant: 'destructive' });
      return;
    }

    try {
      setLoading(true);
      await registrar(proximoContato);

      toast({ title: 'Sucesso', description: 'Resultado registrado e próximo contato agendado.' });
      resetForm();
      onSuccess();
      onClose();
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
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Registrar Resultado</DialogTitle>
          <DialogDescription>
            Classifique o resultado do contato com {clienteNome}. O próximo contato é sugerido automaticamente.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Status de Cobrança *</Label>
            <Select value={status} onValueChange={handleStatusChange}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {GRUPOS_STATUS_COBRANCA.map((g) => (
                  <SelectGroup key={g.grupo}>
                    <SelectLabel>{g.label}</SelectLabel>
                    {statusPorGrupo(g.grupo).map((s) => (
                      <SelectItem key={s.slug} value={s.slug}>
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                ))}
              </SelectContent>
            </Select>
          </div>

          {config.prioridade === 'alta' && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>{config.orientacao}</AlertDescription>
            </Alert>
          )}

          {config.prioridade !== 'alta' && (
            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription>{config.orientacao}</AlertDescription>
            </Alert>
          )}

          {config.exigeDataPrevista && (
            <div className="space-y-2">
              <Label>Data Prevista de Pagamento *</Label>
              <DatePicker value={dataPrevista} onChange={setDataPrevista} desabilitarPassado />
            </div>
          )}

          {precisaPesquisa && (
            <ConfirmacaoCheckbox id="pesquisa" checked={pesquisaConfirmada} onChange={setPesquisaConfirmada}>
              Confirmo que a pesquisa de contato foi realizada.
              {status === 'nao_atende' &&
                ' Esta é a 3ª tentativa ou posterior. Se a pesquisa não localizar o cliente, selecione "Contato inexistente/inválido".'}
            </ConfirmacaoCheckbox>
          )}

          {config.exigeConfirmacaoInterna && (
            <ConfirmacaoCheckbox id="devolucao" checked={confirmacaoInterna} onChange={setConfirmacaoInterna}>
              Confirmo que a devolução total foi validada internamente pela equipe.
            </ConfirmacaoCheckbox>
          )}

          <div className="space-y-2">
            <Label>Próximo Contato *</Label>
            <DatePicker value={proximoContato} onChange={setProximoContato} desabilitarPassado />
            <p className="text-xs text-muted-foreground">
              Sugerido automaticamente conforme o status. Ajuste manualmente se necessário.
            </p>
          </div>

          <div className="space-y-2">
            <Label>Descrição / Observações</Label>
            <Textarea
              placeholder="Descreva os detalhes do contato..."
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={loading}>
            {loading ? 'Salvando...' : 'Registrar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
