import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { User, Phone, Mail, MapPin, FileText } from 'lucide-react';

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
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'ativo': return 'bg-green-100 text-green-800';
      case 'inadimplente': return 'bg-red-100 text-red-800';
      case 'em_acordo': return 'bg-blue-100 text-blue-800';
      case 'quitado': return 'bg-gray-100 text-gray-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'ativo': return 'Ativo';
      case 'inadimplente': return 'Inadimplente';
      case 'em_acordo': return 'Em Acordo';
      case 'quitado': return 'Quitado';
      default: return status;
    }
  };

  const formatCpfCnpj = (value: string) => {
    const cleaned = value.replace(/\D/g, '');
    if (cleaned.length === 11) {
      return cleaned.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
    } else if (cleaned.length === 14) {
      return cleaned.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
    }
    return value;
  };

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
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-full">
              <User className="h-6 w-6 text-primary" />
            </div>
            <div>
              <CardTitle className="text-lg">{cliente.nome}</CardTitle>
              <p className="text-sm text-muted-foreground">
                {formatCpfCnpj(cliente.cpf_cnpj)}
              </p>
            </div>
          </div>
          <Badge className={getStatusColor(cliente.status)}>
            {getStatusLabel(cliente.status)}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3">
          {cliente.telefone && (
            <div className="flex items-center gap-2 text-sm">
              <Phone className="h-4 w-4 text-muted-foreground" />
              <a 
                href={`tel:${cliente.telefone}`}
                className="text-primary hover:underline"
              >
                {formatPhone(cliente.telefone)}
              </a>
            </div>
          )}
          
          {cliente.email && (
            <div className="flex items-center gap-2 text-sm">
              <Mail className="h-4 w-4 text-muted-foreground" />
              <a 
                href={`mailto:${cliente.email}`}
                className="text-primary hover:underline"
              >
                {cliente.email}
              </a>
            </div>
          )}
          
          {(cliente.cidade || cliente.estado || cliente.endereco_completo) && (
            <div className="flex items-start gap-2 text-sm">
              <MapPin className="h-4 w-4 text-muted-foreground mt-0.5" />
              <div>
                {cliente.endereco_completo && (
                  <p>{cliente.endereco_completo}</p>
                )}
                {(cliente.cidade || cliente.estado) && (
                  <p className="text-muted-foreground">
                    {[cliente.cidade, cliente.estado].filter(Boolean).join(' - ')}
                  </p>
                )}
              </div>
            </div>
          )}
          
          {cliente.observacoes && (
            <div className="flex items-start gap-2 text-sm mt-2 pt-2 border-t">
              <FileText className="h-4 w-4 text-muted-foreground mt-0.5" />
              <p className="text-muted-foreground">{cliente.observacoes}</p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
