import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { soDigitos } from '@/utils/format';
import {
  Plus,
  Calendar,
  Mail,
  MessageSquare,
  Phone,
  Zap,
  ClipboardCheck
} from 'lucide-react';

interface AcoesRapidasProps {
  onAgendarRetorno: () => void;
  onRegistrarContato: () => void;
  telefone?: string | null;
  email?: string | null;
}

export function AcoesRapidas({
  onAgendarRetorno,
  onRegistrarContato,
  telefone,
  email
}: AcoesRapidasProps) {
  const { toast } = useToast();

  const handleWhatsApp = () => {
    if (telefone) {
      const cleaned = soDigitos(telefone);
      window.open(`https://wa.me/55${cleaned}`, '_blank');
    } else {
      toast({
        title: "Ação não disponível",
        description: "Este cliente não possui número de WhatsApp cadastrado.",
        variant: "default",
      });
    }
  };

  const handleEmail = () => {
    if (email) {
      window.open(`mailto:${email}`, '_blank');
    } else {
      toast({
        title: "Ação não disponível",
        description: "Este cliente não possui e-mail cadastrado.",
        variant: "default",
      });
    }
  };

  const handleLigar = () => {
    if (telefone) {
      window.open(`tel:${telefone}`, '_blank');
    } else {
      toast({
        title: "Ação não disponível",
        description: "Este cliente não possui telefone cadastrado.",
        variant: "default",
      });
    }
  };

  return (
    <Card className="border-primary/20 shadow-sm overflow-hidden">
      <CardHeader className="pb-3 bg-muted/30">
        <CardTitle className="text-sm font-bold flex items-center gap-2">
          <Zap className="h-4 w-4 text-primary fill-primary/10" />
          Ações Rápidas
        </CardTitle>
      </CardHeader>
      <CardContent className="p-3 space-y-4">
        {/* Botões de contato em destaque */}
        <div className="grid grid-cols-3 gap-2">
          <Button 
            variant="outline" 
            className={`flex-col h-16 gap-1 transition-all shadow-sm ${
              !telefone 
                ? "opacity-50 grayscale cursor-pointer" 
                : "hover:bg-green-50 hover:border-green-300 hover:text-green-700 dark:hover:bg-green-950 dark:hover:border-green-700 dark:hover:text-green-400"
            }`}
            onClick={handleLigar}
            title={telefone ? "Ligar para o cliente" : "Sem telefone cadastrado"}
          >
            <Phone className="h-5 w-5" />
            <span className="text-[10px] font-bold uppercase tracking-wider">Ligar</span>
          </Button>
          
          <Button 
            variant="outline" 
            className={`flex-col h-16 gap-1 transition-all shadow-sm ${
              !telefone 
                ? "opacity-50 grayscale cursor-pointer" 
                : "hover:bg-green-50 hover:border-green-300 hover:text-green-700 dark:hover:bg-green-950 dark:hover:border-green-700 dark:hover:text-green-400"
            }`}
            onClick={handleWhatsApp}
            title={telefone ? "Enviar WhatsApp" : "Sem telefone cadastrado"}
          >
            <MessageSquare className="h-5 w-5" />
            <span className="text-[10px] font-bold uppercase tracking-wider">WhatsApp</span>
          </Button>
          
          <Button 
            variant="outline" 
            className={`flex-col h-16 gap-1 transition-all shadow-sm ${
              !email 
                ? "opacity-50 grayscale cursor-pointer" 
                : "hover:bg-blue-50 hover:border-blue-300 hover:text-blue-700 dark:hover:bg-blue-950 dark:hover:border-blue-700 dark:hover:text-blue-400"
            }`}
            onClick={handleEmail}
            title={email ? "Enviar E-mail" : "Sem e-mail cadastrado"}
          >
            <Mail className="h-5 w-5" />
            <span className="text-[10px] font-bold uppercase tracking-wider">E-mail</span>
          </Button>
        </div>
        
        <Separator className="opacity-50" />

        {/* Porta única: o tipo de registro (cobrança ou administrativo) é
            escolhido dentro do modal. Antes eram dois botões e o operador
            precisava saber a diferença antes de clicar. */}
        <Button
          size="lg"
          className="w-full shadow-md hover:shadow-lg transition-all font-bold gap-2 bg-primary hover:bg-primary/90"
          onClick={onRegistrarContato}
        >
          <ClipboardCheck className="h-5 w-5" />
          Registrar contato
        </Button>

        <Button
          variant="outline"
          className="w-full gap-2 border-dashed hover:border-primary/50 hover:bg-primary/5"
          onClick={onAgendarRetorno}
        >
          <Calendar className="h-4 w-4 text-muted-foreground" />
          <span className="text-xs font-medium">Agendar retorno</span>
        </Button>
      </CardContent>
    </Card>
  );
}
