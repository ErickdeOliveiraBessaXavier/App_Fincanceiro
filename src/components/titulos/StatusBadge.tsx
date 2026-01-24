import React from 'react';
import { Badge } from '@/components/ui/badge';
import { StatusUtils, ParcelaStatus, TituloStatus } from '@/utils/titulo';

interface StatusBadgeProps {
  status: ParcelaStatus | TituloStatus | string;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status }) => {
  return (
    <Badge className={StatusUtils.getColor(status)} variant="secondary">
      {StatusUtils.getLabel(status)}
    </Badge>
  );
};
