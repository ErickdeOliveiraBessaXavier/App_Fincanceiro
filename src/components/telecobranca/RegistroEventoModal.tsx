import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { useUserRole } from '@/hooks/useUserRole';
import { agoraTimestampNegocio } from '@/domain/telecobranca/statusCobranca';
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';

// Registra um evento JÁ OCORRIDO (contato, alegação, etc.) na tabela `comunicacoes`,
// alimentando o histórico do cliente. Para criar um compromisso futuro (com data,
// status e resultado), use o "Agendar Retorno" (AgendamentoModal) — fluxos separados.
interface RegistroEventoModalProps {
  isOpen: boolean;
  onClose: () => void;
  clienteId: string;
  clienteNome: string;
  onSuccess: () => void;
}

export function RegistroEventoModal({
  isOpen,
  onClose,
  clienteId,
  clienteNome,
  onSuccess
}: RegistroEventoModalProps) {
  const [tipoEvento, setTipoEvento] = useState('contato_receptivo');
  const [descricao, setDescricao] = useState('');
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const { user, companyId } = useAuth();
  const { isOperador } = useUserRole();

  const inserirComunicacao = async (userId: string) => {
    const tipoEventoInfo = TIPOS_EVENTO.find(t => t.value === tipoEvento);

    const { error } = await supabase
      .from('comunicacoes')
      .insert({
        company_id: companyId,
        cliente_id: clienteId,
        tipo: tipoEvento,
        canal: 'manual',
        assunto: tipoEventoInfo?.label || 'Contato',
        mensagem: descricao,
        data_contato: agoraTimestampNegocio(),
        created_by: userId
      });
    if (error) throw error;

    toast({ title: "Sucesso", description: "Evento registrado com sucesso" });
  };

  const resetForm = () => {
    setTipoEvento('contato_receptivo');
    setDescricao('');
  };

  const handleSubmit = async () => {
    if (!isOperador) {
      toast({ title: 'Permissão negada', description: 'Apenas operadores podem registrar eventos.', variant: 'destructive' });
      return;
    }
    if (!tipoEvento) {
      toast({ title: 'Erro', description: 'Selecione um tipo de evento.', variant: 'destructive' });
      return;
    }
    try {
      setLoading(true);
      if (!user || !companyId) throw new Error('Sessão inválida');
      await inserirComunicacao(user.id);
      resetForm();
      onSuccess();
      onClose();
    } catch (error) {
      console.error('Erro ao registrar evento:', error);
      toast({
        title: 'Erro',
        description: error instanceof Error ? error.message : 'Não foi possível registrar o evento',
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
          <DialogTitle>Registrar Evento</DialogTitle>
          <DialogDescription>
            Registre um evento administrativo ou informativo de {clienteNome}.
            Para resultados de cobrança (não atende, recado, agendamento de pagamento etc.),
            use <strong>Registrar Resultado</strong>.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Tipo de Evento *</Label>
            <Select value={tipoEvento} onValueChange={setTipoEvento}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione o tipo de evento" />
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

          <div className="space-y-2">
            <Label>Descrição</Label>
            <Textarea
              placeholder="Descreva os detalhes do contato..."
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
            {loading ? 'Salvando...' : 'Registrar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
