import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { 
  Plus, 
  Calendar, 
  Mail, 
  MessageSquare, 
  Phone,
  Zap
} from 'lucide-react';

interface AcoesRapidasProps {
  onNovoEvento: () => void;
  onAgendarRetorno: () => void;
  telefone?: string | null;
  email?: string | null;
}

export function AcoesRapidas({ 
  onNovoEvento, 
  onAgendarRetorno,
  telefone,
  email 
}: AcoesRapidasProps) {
  const handleWhatsApp = () => {
    if (telefone) {
      const cleaned = telefone.replace(/\D/g, '');
      window.open(`https://wa.me/55${cleaned}`, '_blank');
    }
  };

  const handleEmail = () => {
    if (email) {
      window.open(`mailto:${email}`, '_blank');
    }
  };

  const handleLigar = () => {
    if (telefone) {
      window.open(`tel:${telefone}`, '_blank');
    }
  };

  return (
    <Card className="border-primary/20">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Zap className="h-4 w-4 text-primary" />
          Ações Rápidas
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Botões de contato em destaque */}
        <div className="grid grid-cols-3 gap-2">
          <Button 
            variant="outline" 
            className="flex-col h-16 gap-1 hover:bg-green-50 hover:border-green-300 hover:text-green-700 dark:hover:bg-green-950 dark:hover:border-green-700 dark:hover:text-green-400 transition-all"
            onClick={handleLigar}
            disabled={!telefone}
            title={telefone ? "Ligar para o cliente" : "Sem telefone cadastrado"}
          >
            <Phone className="h-5 w-5" />
            <span className="text-xs font-medium">Ligar</span>
          </Button>
          
          <Button 
            variant="outline" 
            className="flex-col h-16 gap-1 hover:bg-green-50 hover:border-green-300 hover:text-green-700 dark:hover:bg-green-950 dark:hover:border-green-700 dark:hover:text-green-400 transition-all"
            onClick={handleWhatsApp}
            disabled={!telefone}
            title={telefone ? "Enviar WhatsApp" : "Sem telefone cadastrado"}
          >
            <MessageSquare className="h-5 w-5" />
            <span className="text-xs font-medium">WhatsApp</span>
          </Button>
          
          <Button 
            variant="outline" 
            className="flex-col h-16 gap-1 hover:bg-blue-50 hover:border-blue-300 hover:text-blue-700 dark:hover:bg-blue-950 dark:hover:border-blue-700 dark:hover:text-blue-400 transition-all"
            onClick={handleEmail}
            disabled={!email}
            title={email ? "Enviar E-mail" : "Sem e-mail cadastrado"}
          >
            <Mail className="h-5 w-5" />
            <span className="text-xs font-medium">E-mail</span>
          </Button>
        </div>
        
        <Separator />
        
        {/* Ações principais */}
        <Button 
          className="w-full" 
          onClick={onNovoEvento}
        >
          <Plus className="h-4 w-4 mr-2" />
          Registrar Evento
        </Button>
        
        <Button 
          variant="secondary" 
          className="w-full"
          onClick={onAgendarRetorno}
        >
          <Calendar className="h-4 w-4 mr-2" />
          Agendar Retorno
        </Button>
      </CardContent>
    </Card>
  );
}
