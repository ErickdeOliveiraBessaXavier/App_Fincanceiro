import React from 'react';
import { Badge } from '@/components/ui/badge';
import { StatusUtils, ParcelaStatus, TituloStatus } from '@/utils/titulo';

interface StatusBadgeProps {
  status: ParcelaStatus | TituloStatus | string;
}

const getVariant = (status: string): "default" | "secondary" | "destructive" | "outline" | "success" | "warning" | "accent" => {
  switch (status) {
    case 'quitado':
    case 'paga':
      return 'success';
    case 'inadimplente':
    case 'vencida':
      return 'destructive';
    case 'pendente':
      return 'warning';
    case 'ativo':
      return 'default';
    default:
      return 'secondary';
  }
};

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status }) => {
  return (
    <Badge variant={getVariant(status)}>
      {StatusUtils.getLabel(status)}
    </Badge>
  );
};