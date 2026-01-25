import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { User, Phone, Mail, MapPin, ExternalLink } from 'lucide-react';

interface Cliente {
  id: string;
  nome: string;
  cpf_cnpj: string;
  telefone?: string | null;
  email?: string | null;
  endereco_completo?: string | null;
  cidade?: string | null;
  estado?: string | null;
  status: string;
  observacoes?: string | null;
}

interface ClienteResumoProps {
  cliente: Cliente;
}

export function ClienteResumo({ cliente }: ClienteResumoProps) {
  const formatPhone = (phone?: string | null) => {
    if (!phone) return null;
    const cleaned = phone.replace(/\D/g, '');
    if (cleaned.length === 11) {
      return cleaned.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3');
    } else if (cleaned.length === 10) {
      return cleaned.replace(/(\d{2})(\d{4})(\d{4})/, '($1) $2-$3');
    }
    return phone;
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <User className="h-4 w-4 text-muted-foreground" />
          Dados do Cliente
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1 text-sm">
        {/* Lista compacta de informações */}
        <div className="space-y-1">
          {cliente.telefone && (
            <a 
              href={`tel:${cliente.telefone}`} 
              className="flex items-center gap-2 p-2 rounded-lg hover:bg-muted transition-colors group"
            >
              <Phone className="h-4 w-4 text-muted-foreground" />
              <span className="flex-1">{formatPhone(cliente.telefone)}</span>
              <ExternalLink className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
            </a>
          )}
          
          {cliente.email && (
            <a 
              href={`mailto:${cliente.email}`} 
              className="flex items-center gap-2 p-2 rounded-lg hover:bg-muted transition-colors group"
            >
              <Mail className="h-4 w-4 text-muted-foreground" />
              <span className="flex-1 truncate">{cliente.email}</span>
              <ExternalLink className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
            </a>
          )}
          
          {(cliente.cidade || cliente.estado || cliente.endereco_completo) && (
            <div className="flex items-start gap-2 p-2">
              <MapPin className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
              <div className="min-w-0">
                {cliente.endereco_completo && (
                  <p className="truncate">{cliente.endereco_completo}</p>
                )}
                {(cliente.cidade || cliente.estado) && (
                  <p className="text-muted-foreground text-xs">
                    {[cliente.cidade, cliente.estado].filter(Boolean).join(' - ')}
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
        
        {cliente.observacoes && (
          <>
            <Separator className="my-2" />
            <div className="p-2 bg-muted/50 rounded-lg">
              <p className="text-xs text-muted-foreground mb-1">Observações</p>
              <p className="text-sm leading-relaxed">{cliente.observacoes}</p>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
