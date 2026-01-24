import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Mail, MessageSquare, Phone, Plus } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

interface Campanha {
  id?: string;
  nome: string;
  canal: string;
  mensagem: string;
  status: string;
  filtros?: any;
}

interface CampanhaFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  campanha?: Campanha | null;
  onSuccess: () => void;
}

const TEMPLATE_VARIABLES = [
  { key: '{nome}', label: 'Nome do Cliente' },
  { key: '{valor}', label: 'Valor do Título' },
  { key: '{vencimento}', label: 'Data de Vencimento' },
  { key: '{dias_atraso}', label: 'Dias em Atraso' },
  { key: '{cpf_cnpj}', label: 'CPF/CNPJ' },
];

const CampanhaForm = ({ open, onOpenChange, campanha, onSuccess }: CampanhaFormProps) => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [recipientCount, setRecipientCount] = useState(0);
  
  const [formData, setFormData] = useState({
    nome: '',
    canal: 'whatsapp',
    mensagem: '',
    status: 'rascunho',
    filtros: {
      status_titulo: 'todos',
      dias_atraso_min: 0,
      dias_atraso_max: 999,
      valor_min: 0,
      valor_max: 999999,
    }
  });

  useEffect(() => {
    if (campanha) {
      setFormData({
        nome: campanha.nome,
        canal: campanha.canal,
        mensagem: campanha.mensagem,
        status: campanha.status,
        filtros: campanha.filtros || {
          status_titulo: 'todos',
          dias_atraso_min: 0,
          dias_atraso_max: 999,
          valor_min: 0,
          valor_max: 999999,
        }
      });
    } else {
      setFormData({
        nome: '',
        canal: 'whatsapp',
        mensagem: '',
        status: 'rascunho',
        filtros: {
          status_titulo: 'todos',
          dias_atraso_min: 0,
          dias_atraso_max: 999,
          valor_min: 0,
          valor_max: 999999,
        }
      });
    }
  }, [campanha, open]);

  useEffect(() => {
    fetchRecipientCount();
  }, [formData.filtros, formData.canal]);

  const fetchRecipientCount = async () => {
    try {
      // Buscar da view consolidada
      let query = supabase
        .from('vw_titulos_completos')
        .select('id', { count: 'exact' });

      if (formData.filtros.status_titulo !== 'todos') {
        query = query.eq('status', formData.filtros.status_titulo);
      }

      const { count } = await query;
      setRecipientCount(count || 0);
    } catch (error) {
      console.error('Erro ao contar destinatários:', error);
    }
  };

  const insertVariable = (variable: string) => {
    setFormData(prev => ({
      ...prev,
      mensagem: prev.mensagem + variable
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.nome.trim()) {
      toast.error('Nome da campanha é obrigatório');
      return;
    }
    
    if (!formData.mensagem.trim()) {
      toast.error('Mensagem é obrigatória');
      return;
    }

    setLoading(true);
    
    try {
      if (campanha?.id) {
        const { error } = await supabase
          .from('campanhas')
          .update({
            nome: formData.nome,
            canal: formData.canal,
            mensagem: formData.mensagem,
            status: formData.status,
            filtros: formData.filtros,
            updated_at: new Date().toISOString(),
          })
          .eq('id', campanha.id);

        if (error) throw error;
        toast.success('Campanha atualizada com sucesso!');
      } else {
        const { error } = await supabase
          .from('campanhas')
          .insert({
            nome: formData.nome,
            canal: formData.canal,
            mensagem: formData.mensagem,
            status: formData.status,
            filtros: formData.filtros,
            created_by: user?.id,
          });

        if (error) throw error;
        toast.success('Campanha criada com sucesso!');
      }

      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      console.error('Erro ao salvar campanha:', error);
      toast.error(error.message || 'Erro ao salvar campanha');
    } finally {
      setLoading(false);
    }
  };

  const getCanalIcon = (canal: string) => {
    switch (canal) {
      case 'email': return <Mail className="h-4 w-4" />;
      case 'sms': return <Phone className="h-4 w-4" />;
      case 'whatsapp': return <MessageSquare className="h-4 w-4" />;
      default: return <MessageSquare className="h-4 w-4" />;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {campanha ? 'Editar Campanha' : 'Nova Campanha'}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="nome">Nome da Campanha</Label>
              <Input
                id="nome"
                value={formData.nome}
                onChange={(e) => setFormData(prev => ({ ...prev, nome: e.target.value }))}
                placeholder="Ex: Cobrança Janeiro 2025"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="canal">Canal</Label>
              <Select
                value={formData.canal}
                onValueChange={(value) => setFormData(prev => ({ ...prev, canal: value }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="whatsapp">
                    <div className="flex items-center gap-2">
                      <MessageSquare className="h-4 w-4" /> WhatsApp
                    </div>
                  </SelectItem>
                  <SelectItem value="email">
                    <div className="flex items-center gap-2">
                      <Mail className="h-4 w-4" /> E-mail
                    </div>
                  </SelectItem>
                  <SelectItem value="sms">
                    <div className="flex items-center gap-2">
                      <Phone className="h-4 w-4" /> SMS
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Filtros de Destinatários</Label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-4 border rounded-lg bg-muted/30">
              <div className="space-y-1">
                <Label className="text-xs">Status do Título</Label>
                <Select
                  value={formData.filtros.status_titulo}
                  onValueChange={(value) => setFormData(prev => ({
                    ...prev,
                    filtros: { ...prev.filtros, status_titulo: value }
                  }))}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos</SelectItem>
                    <SelectItem value="inadimplente">Inadimplentes</SelectItem>
                    <SelectItem value="ativo">Ativos</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div className="space-y-1">
                <Label className="text-xs">Dias Atraso (min)</Label>
                <Input
                  type="number"
                  className="h-9"
                  value={formData.filtros.dias_atraso_min}
                  onChange={(e) => setFormData(prev => ({
                    ...prev,
                    filtros: { ...prev.filtros, dias_atraso_min: Number(e.target.value) }
                  }))}
                />
              </div>
              
              <div className="space-y-1">
                <Label className="text-xs">Dias Atraso (max)</Label>
                <Input
                  type="number"
                  className="h-9"
                  value={formData.filtros.dias_atraso_max}
                  onChange={(e) => setFormData(prev => ({
                    ...prev,
                    filtros: { ...prev.filtros, dias_atraso_max: Number(e.target.value) }
                  }))}
                />
              </div>
            </div>
            
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              {getCanalIcon(formData.canal)}
              <span>
                Aproximadamente <strong className="text-foreground">{recipientCount}</strong> destinatários
              </span>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Mensagem</Label>
            <div className="flex flex-wrap gap-1 mb-2">
              {TEMPLATE_VARIABLES.map((variable) => (
                <Badge
                  key={variable.key}
                  variant="outline"
                  className="cursor-pointer hover:bg-primary hover:text-primary-foreground transition-colors"
                  onClick={() => insertVariable(variable.key)}
                >
                  <Plus className="h-3 w-3 mr-1" />
                  {variable.label}
                </Badge>
              ))}
            </div>
            <Textarea
              value={formData.mensagem}
              onChange={(e) => setFormData(prev => ({ ...prev, mensagem: e.target.value }))}
              placeholder="Olá {nome}, identificamos um débito no valor de {valor} com vencimento em {vencimento}..."
              rows={5}
            />
            <p className="text-xs text-muted-foreground">
              Use as variáveis acima para personalizar a mensagem para cada cliente.
            </p>
          </div>

          {formData.mensagem && (
            <div className="space-y-2">
              <Label className="text-sm text-muted-foreground">Preview da Mensagem</Label>
              <div className="p-4 rounded-lg bg-muted/50 border text-sm">
                {formData.mensagem
                  .replace('{nome}', 'João Silva')
                  .replace('{valor}', 'R$ 1.500,00')
                  .replace('{vencimento}', '15/01/2025')
                  .replace('{dias_atraso}', '30')
                  .replace('{cpf_cnpj}', '123.456.789-00')
                }
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label>Status Inicial</Label>
            <Select
              value={formData.status}
              onValueChange={(value) => setFormData(prev => ({ ...prev, status: value }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="rascunho">Rascunho</SelectItem>
                <SelectItem value="ativa">Ativa</SelectItem>
                <SelectItem value="pausada">Pausada</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex gap-3 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="flex-1"
            >
              Cancelar
            </Button>
            <Button type="submit" className="flex-1" disabled={loading}>
              {loading ? 'Salvando...' : campanha ? 'Atualizar' : 'Criar Campanha'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default CampanhaForm;
