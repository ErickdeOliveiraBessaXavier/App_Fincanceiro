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
import { DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertTriangle, Info } from 'lucide-react';
import { DataPicker } from '@/components/telecobranca/DataPicker';
import { ConfirmacaoCheckbox } from '@/components/telecobranca/ConfirmacaoCheckbox';

/**
 * Resultado de um contato de cobrança.
 *
 * O operador classifica o desfecho (status de cobrança) e o sistema sugere a
 * data do próximo contato (editável). Persiste histórico + próximo contato de
 * forma atômica via RPC — o próximo contato É o agendamento.
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

export function ResultadoCobrancaForm({
  clienteId, clienteNome, tituloId, acordoId, onSucesso, onCancelar,
}: ResultadoCobrancaFormProps) {
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
      // Grava histórico (comunicacao) + próximo contato (agendamento) atômico.
      const { error } = await supabase.rpc('registrar_resultado_cobranca', {
        p_cliente_id: clienteId,
        p_status_cobranca: status,
        p_data_proximo_contato: paraTimestampNegocio(proximoContato),
        p_descricao: montarDescricao(),
        p_titulo_id: tituloId || undefined,
        p_acordo_id: acordoId || undefined,
      });
      if (error) throw error;

      toast({ title: 'Sucesso', description: 'Resultado registrado e próximo contato agendado.' });
      onSucesso();
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
      <div className="space-y-4 py-2">
        <p className="text-sm text-muted-foreground">
          Classifique o resultado do contato com <strong>{clienteNome}</strong>. O próximo contato
          é sugerido automaticamente.
        </p>

        <div className="space-y-2">
          <Label>Status de Cobrança *</Label>
          <Select value={status} onValueChange={handleStatusChange}>
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
        </div>

        <Alert variant={config.prioridade === 'alta' ? 'destructive' : 'default'}>
          {config.prioridade === 'alta' ? <AlertTriangle className="h-4 w-4" /> : <Info className="h-4 w-4" />}
          <AlertDescription>{config.orientacao}</AlertDescription>
        </Alert>

        {config.exigeDataPrevista && (
          <div className="space-y-2">
            <Label>Data Prevista de Pagamento *</Label>
            <DataPicker value={dataPrevista} onChange={setDataPrevista} desabilitarPassado />
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
          <DataPicker value={proximoContato} onChange={setProximoContato} desabilitarPassado />
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
        <Button variant="outline" onClick={onCancelar} disabled={loading}>Cancelar</Button>
        <Button onClick={handleSubmit} disabled={loading}>
          {loading ? 'Salvando...' : 'Registrar'}
        </Button>
      </DialogFooter>
    </>
  );
}
