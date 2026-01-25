import React from 'react';
import { Badge } from '@/components/ui/badge';
import { StatusUtils, ParcelaStatus, TituloStatus } from '@/utils/titulo';

interface StatusBadgeProps {
  status: ParcelaStatus | TituloStatus | string;
}

const getVariant = (status: string): "default" | "secondary" | "destructive" | "outline" | "success" | "warning" | "accent" => {
  switch (status) {
    case 'pago':
      return 'success';
    case 'vencido':
      return 'destructive';
    case 'a_vencer':
      return 'warning';
    case 'renegociado':
      return 'accent';
    case 'pendente':
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