import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import {
  STATUS_COBRANCA_LIST,
  getStatusCobranca,
  calcularProximoContato,
  validarStatusCobranca,
  paraTimestampNegocio,
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
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
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const config = getStatusCobranca(status);

  // Recalcula a sugestão do próximo contato quando o status ou a data prevista
  // mudam. A edição manual no calendário persiste até a próxima mudança destes.
  useEffect(() => {
    setProximoContato(calcularProximoContato(status, { dataPrevista }));
  }, [status, dataPrevista]);

  const resetForm = () => {
    setStatus(STATUS_PADRAO);
    setDescricao('');
    setDataPrevista(undefined);
  };

  // Grava histórico (comunicacao) + próximo contato (agendamento) atômico via RPC.
  const registrar = async (proximo: Date) => {
    const { error } = await supabase.rpc('registrar_resultado_cobranca', {
      p_cliente_id: clienteId,
      p_status_cobranca: status,
      p_data_proximo_contato: paraTimestampNegocio(proximo),
      p_descricao: descricao || undefined,
      p_titulo_id: tituloId || undefined,
      p_acordo_id: acordoId || undefined,
    });
    if (error) throw error;
  };

  const handleSubmit = async () => {
    const erroValidacao = validarStatusCobranca(status, { dataPrevista });
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
            <Select value={status} onValueChange={(v) => setStatus(v as StatusCobrancaSlug)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_COBRANCA_LIST.map((s) => (
                  <SelectItem key={s.slug} value={s.slug}>
                    {s.label}
                  </SelectItem>
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
