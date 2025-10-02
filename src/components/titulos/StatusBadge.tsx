import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Titulo, StatusUtils } from '@/utils/titulo';

interface StatusBadgeProps {
  titulo: Titulo;
  showOverdueIndicator?: boolean;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ 
  titulo, 
  showOverdueIndicator = true 
}) => {
  const statusAtual = StatusUtils.calculateCorrectStatus(titulo);
  const isOverdue = StatusUtils.isOverdue(titulo.vencimento) && statusAtual !== 'pago';
  
  return (
    <div className="flex items-center gap-1">
      <Badge className={StatusUtils.getColor(statusAtual)} variant="secondary">
        {StatusUtils.getLabel(statusAtual)}
      </Badge>
      {showOverdueIndicator && isOverdue && statusAtual !== 'vencido' && (
        <span className="text-xs text-red-500 font-medium">
          (Vencido)
        </span>
      )}
    </div>
  );
};
