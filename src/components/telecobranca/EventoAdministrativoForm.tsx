import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { useUserRole } from '@/hooks/useUserRole';
import { agoraTimestampNegocio } from '@/domain/telecobranca/statusCobranca';
import { TIPOS_EVENTO } from '@/constants/tiposEvento';
import { DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';

/**
 * Evento administrativo/informativo já ocorrido (anexo, cobrança externa, acesso
 * ao portal…). Alimenta `comunicacoes` sem status de cobrança.
 *
 * A separação em relação ao resultado de cobrança é deliberada — ver
 * constants/tiposEvento.ts. O que mudou é a porta: as duas coisas entram pelo
 * mesmo botão, e a escolha fica visível no topo do formulário em vez de ser uma
 * decisão entre dois botões cuja diferença precisava ser explicada.
 */

interface EventoAdministrativoFormProps {
  clienteId: string;
  clienteNome: string;
  onSucesso: () => void;
  onCancelar: () => void;
}

export function EventoAdministrativoForm({
  clienteId, clienteNome, onSucesso, onCancelar,
}: EventoAdministrativoFormProps) {
  const [tipoEvento, setTipoEvento] = useState('contato_receptivo');
  const [descricao, setDescricao] = useState('');
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const { user, companyId } = useAuth();
  const { isOperador } = useUserRole();

  const handleSubmit = async () => {
    if (!isOperador) {
      toast({ title: 'Permissão negada', description: 'Apenas operadores podem registrar eventos.', variant: 'destructive' });
      return;
    }
    try {
      setLoading(true);
      if (!user || !companyId) throw new Error('Sessão inválida');

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
          created_by: user.id,
        });
      if (error) throw error;

      toast({ title: 'Sucesso', description: 'Evento registrado com sucesso' });
      onSucesso();
    } catch (error) {
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
    <>
      <div className="space-y-4 py-2">
        <p className="text-sm text-muted-foreground">
          Registro administrativo ou informativo de <strong>{clienteNome}</strong>. Não altera o
          status de cobrança nem agenda retorno.
        </p>

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
                      <Icon className={cn('h-4 w-4', tipo.color)} />
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
            placeholder="Descreva os detalhes do evento..."
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
            rows={4}
          />
        </div>
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onCancelar} disabled={loading}>Cancelar</Button>
        <Button onClick={handleSubmit} disabled={loading || !isOperador}>
          {loading ? 'Salvando...' : 'Registrar'}
        </Button>
      </DialogFooter>
    </>
  );
}
