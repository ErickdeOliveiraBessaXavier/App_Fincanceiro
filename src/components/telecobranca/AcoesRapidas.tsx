import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { 
  Plus, 
  Calendar, 
  Mail, 
  MessageSquare, 
  Phone,
  Star,
  FileText
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
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg">Ações Rápidas</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <Button 
          className="w-full justify-start" 
          onClick={onNovoEvento}
        >
          <Plus className="h-4 w-4 mr-2" />
          Novo Evento
        </Button>
        
        <Button 
          variant="outline" 
          className="w-full justify-start"
          onClick={onAgendarRetorno}
        >
          <Calendar className="h-4 w-4 mr-2" />
          Agendar Retorno
        </Button>
        
        <div className="grid grid-cols-3 gap-2 pt-2">
          <Button 
            variant="outline" 
            size="sm"
            onClick={handleLigar}
            disabled={!telefone}
            title={telefone ? "Ligar" : "Sem telefone cadastrado"}
          >
            <Phone className="h-4 w-4" />
          </Button>
          
          <Button 
            variant="outline" 
            size="sm"
            onClick={handleEmail}
            disabled={!email}
            title={email ? "Enviar E-mail" : "Sem e-mail cadastrado"}
          >
            <Mail className="h-4 w-4" />
          </Button>
          
          <Button 
            variant="outline" 
            size="sm"
            onClick={handleWhatsApp}
            disabled={!telefone}
            title={telefone ? "WhatsApp" : "Sem telefone cadastrado"}
          >
            <MessageSquare className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
