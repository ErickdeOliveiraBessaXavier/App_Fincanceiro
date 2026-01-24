import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
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
import { CalendarIcon, Clock } from 'lucide-react';
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

  const handleSubmit = async () => {
    if (!dataAgendamento) {
      toast({
        title: "Erro",
        description: "Selecione uma data para o agendamento",
        variant: "destructive",
      });
      return;
    }

    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) throw new Error('Usuário não autenticado');

      const [hora, minuto] = horaAgendamento.split(':');
      const dataCompleta = new Date(dataAgendamento);
      dataCompleta.setHours(parseInt(hora), parseInt(minuto), 0, 0);

      const { error } = await supabase
        .from('agendamentos')
        .insert({
          cliente_id: clienteId,
          titulo_id: tituloId || null,
          acordo_id: acordoId || null,
          tipo_evento: tipoEvento,
          descricao,
          data_agendamento: dataCompleta.toISOString(),
          status: 'pendente',
          created_by: user.id
        });

      if (error) throw error;

      toast({
        title: "Sucesso",
        description: "Agendamento criado com sucesso",
      });

      // Reset form
      setTipoEvento('agendamento');
      setDescricao('');
      setDataAgendamento(undefined);
      setHoraAgendamento('09:00');
      
      onSuccess();
      onClose();
    } catch (error) {
      console.error('Erro ao criar agendamento:', error);
      toast({
        title: "Erro",
        description: "Não foi possível criar o agendamento",
        variant: "destructive",
      });
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
          <Button onClick={handleSubmit} disabled={loading}>
            {loading ? "Salvando..." : "Agendar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
