import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { useUserRole } from '@/hooks/useUserRole';
import { paraTimestampNegocio } from '@/domain/telecobranca/statusCobranca';
import { TIPOS_EVENTO } from '@/constants/tiposEvento';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CalendarIcon, Clock, Info } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { formatData } from '@/utils/format';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';

interface AgendamentoModalProps {
  isOpen: boolean;
  onClose: () => void;
  clienteId: string;
  clienteNome: string;
  tituloId?: string;
  acordoId?: string;
  onSuccess: () => void;
}

/**
 * Retorno pendente que o cliente já tem, se houver.
 *
 * "Registrar contato" também cria agendamento (o próximo contato). Mostrar o
 * que já está marcado evita o operador remarcar sem perceber que havia um
 * compromisso combinado — a substituição em si é automática desde a migration
 * 20260826130000 (um retorno pendente por cliente).
 */
function useRetornoPendente(clienteId: string, ativo: boolean) {
  const [retorno, setRetorno] = useState<string | null>(null);

  useEffect(() => {
    if (!ativo) return;
    let vivo = true;
    (async () => {
      const { data } = await supabase
        .from('agendamentos')
        .select('data_agendamento')
        .eq('cliente_id', clienteId)
        .eq('status', 'pendente')
        .is('deleted_at', null)
        .order('data_agendamento', { ascending: true })
        .limit(1);
      if (vivo) setRetorno(data?.[0]?.data_agendamento ?? null);
    })();
    return () => { vivo = false; };
  }, [clienteId, ativo]);

  return retorno;
}

export function AgendamentoModal({
  isOpen,
  onClose,
  clienteId,
  clienteNome,
  tituloId,
  acordoId,
  onSuccess
}: AgendamentoModalProps) {
  const [tipoEvento, setTipoEvento] = useState('agendamento');
  const [descricao, setDescricao] = useState('');
  const [dataAgendamento, setDataAgendamento] = useState<Date | undefined>(undefined);
  const [horaAgendamento, setHoraAgendamento] = useState('09:00');
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const { user, companyId } = useAuth();
  const { isOperador } = useUserRole();
  const retornoPendente = useRetornoPendente(clienteId, isOpen);

  const resetForm = () => {
    setTipoEvento('agendamento');
    setDescricao('');
    setDataAgendamento(undefined);
    setHoraAgendamento('09:00');
  };

  const handleSubmit = async () => {
    if (!isOperador) {
      toast({ title: 'Permissão negada', description: 'Apenas operadores podem criar agendamentos.', variant: 'destructive' });
      return;
    }
    if (!dataAgendamento) {
      toast({ title: 'Erro', description: 'Selecione uma data para o agendamento.', variant: 'destructive' });
      return;
    }
    try {
      setLoading(true);
      if (!user || !companyId) throw new Error('Sessão inválida');

      // Escrita via RPC, não INSERT direto: agendar retorno é evento de
      // domínio e precisa de um lugar só onde as regras valham. O INSERT cru
      // daqui era a segunda porta, que furava a validação da RPC de registro
      // de contato (ver migration 20260826120000).
      const { error } = await supabase.rpc('agendar_retorno', {
        p_cliente_id: clienteId,
        p_data_agendamento: paraTimestampNegocio(dataAgendamento, horaAgendamento),
        p_tipo_evento: tipoEvento,
        p_descricao: descricao || null,
        p_titulo_id: tituloId || null,
        p_acordo_id: acordoId || null,
      });

      if (error) throw error;

      toast({ title: 'Sucesso', description: 'Agendamento criado com sucesso.' });
      resetForm();
      onSuccess();
      onClose();
    } catch (error) {
      console.error('Erro ao criar agendamento:', error);
      toast({ title: 'Erro', description: 'Não foi possível criar o agendamento.', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarIcon className="h-5 w-5" />
            Agendar Retorno
          </DialogTitle>
          <DialogDescription>
            Agendar retorno para {clienteNome}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {retornoPendente && (
            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription>
                Este cliente já tem um retorno pendente para{' '}
                <strong>{formatData(retornoPendente)}</strong>. Salvar aqui <strong>remarca</strong>:
                o anterior é fechado como Remarcado e continua no histórico.
              </AlertDescription>
            </Alert>
          )}

          <div className="space-y-2">
            <Label>Tipo de Evento</Label>
            <Select value={tipoEvento} onValueChange={setTipoEvento}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione o tipo" />
              </SelectTrigger>
              <SelectContent>
                {TIPOS_EVENTO.map((tipo) => {
                  const Icon = tipo.icon;
                  return (
                    <SelectItem key={tipo.value} value={tipo.value}>
                      <div className="flex items-center gap-2">
                        <Icon className={cn("h-4 w-4", tipo.color)} />
                        <span>{tipo.label}</span>
                      </div>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Data *</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !dataAgendamento && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {dataAgendamento ? (
                      format(dataAgendamento, "dd/MM/yyyy", { locale: ptBR })
                    ) : (
                      <span>Selecione</span>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={dataAgendamento}
                    onSelect={setDataAgendamento}
                    disabled={(date) => date < new Date()}
                    locale={ptBR}
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div className="space-y-2">
              <Label>Hora *</Label>
              <Select value={horaAgendamento} onValueChange={setHoraAgendamento}>
                <SelectTrigger>
                  <Clock className="mr-2 h-4 w-4" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 24 }, (_, i) => i).map((hora) => (
                    <div key={hora}>
                      <SelectItem value={`${String(hora).padStart(2, '0')}:00`}>
                        {String(hora).padStart(2, '0')}:00
                      </SelectItem>
                      <SelectItem value={`${String(hora).padStart(2, '0')}:30`}>
                        {String(hora).padStart(2, '0')}:30
                      </SelectItem>
                    </div>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Descrição / Observações</Label>
            <Textarea
              placeholder="Descreva o motivo do agendamento..."
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              rows={4}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={loading || !isOperador}>
            {loading ? 'Salvando...' : 'Agendar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
