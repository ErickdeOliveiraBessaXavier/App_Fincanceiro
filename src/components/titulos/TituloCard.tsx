import React from 'react';
import { Eye, Edit, Trash2, ChevronDown, ChevronRight } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Titulo, ParcelaUtils, FormatUtils } from '@/utils/titulo';
import { StatusBadge } from './StatusBadge';

interface TituloCardProps {
  titulo: Titulo;
  parcelas?: Titulo[];
  isExpanded?: boolean;
  onToggleExpansion?: () => void;
  onView: (titulo: Titulo) => void;
  onEdit: (titulo: Titulo) => void;
  onDelete: (titulo: Titulo) => void;
}

export const TituloCard: React.FC<TituloCardProps> = ({
  titulo,
  parcelas = [],
  isExpanded = false,
  onToggleExpansion,
  onView,
  onEdit,
  onDelete
}) => {
  const isTituloPai = ParcelaUtils.isTituloPai(titulo);
  const isParcela = ParcelaUtils.isParcela(titulo);
  
  if (isParcela) {
    // Renderizar parcela individual
    return (
      <Card className="p-3 bg-blue-50/30 border-blue-200">
        <div className="flex justify-between items-start mb-2">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h4 className="text-sm">↳ Parcela {titulo.numero_parcela}</h4>
              <StatusBadge titulo={titulo} />
            </div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 text-xs mb-3">
          <div>
            <span className="text-muted-foreground">Valor: </span>
            <span className="font-medium">{FormatUtils.currency(titulo.valor)}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Vencimento: </span>
            <span className="font-medium">{FormatUtils.date(titulo.vencimento)}</span>
          </div>
        </div>
        <div className="flex gap-1 justify-end">
          <Button variant="ghost" size="sm" onClick={() => onView(titulo)}>
            <Eye className="h-3 w-3" />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => onEdit(titulo)}>
            <Edit className="h-3 w-3" />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => onDelete(titulo)}>
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      </Card>
    );
  }

  if (isTituloPai) {
    // Renderizar título pai com parcelas
    const totalParcelas = parcelas.length;
    const parcelasPagas = parcelas.filter(p => p.status === 'pago').length;

    return (
      <div>
        {/* Card Principal */}
        <Card className="p-4 border-2 border-amber-200 bg-amber-50/30">
          <div className="flex justify-between items-start mb-2">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <h3 className="font-medium text-sm">{titulo.cliente.nome}</h3>
                <Badge variant="outline" className="text-xs bg-amber-50 text-amber-700 border-amber-200">
                  {totalParcelas} parcelas
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">{titulo.cliente.cpf_cnpj}</p>
            </div>
            <div className="flex flex-col items-end gap-2">
              <StatusBadge titulo={titulo} />
              {onToggleExpansion && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onToggleExpansion}
                  className="h-6 w-6 p-0"
                >
                  {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                </Button>
              )}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs mb-3">
            <div>
              <span className="text-muted-foreground">Total: </span>
              <span className="font-medium">{FormatUtils.currency(titulo.valor)}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Parcelas: </span>
              <span className="font-medium">{totalParcelas}x de {FormatUtils.currency(parcelas[0]?.valor || 0)}</span>
            </div>
          </div>
          {parcelasPagas > 0 && (
            <div className="mb-2">
              <Badge variant="outline" className="text-xs bg-green-50 text-green-700 border-green-200">
                {parcelasPagas}/{totalParcelas} pagas
              </Badge>
            </div>
          )}
          <div className="flex gap-1 justify-end">
            <Button variant="ghost" size="sm" onClick={() => onView(titulo)}>
              <Eye className="h-3 w-3" />
            </Button>
            <Button variant="ghost" size="sm" onClick={() => onEdit(titulo)}>
              <Edit className="h-3 w-3" />
            </Button>
            <Button variant="ghost" size="sm" onClick={() => onDelete(titulo)}>
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        </Card>

        {/* Parcelas expandidas */}
        {isExpanded && (
          <div className="ml-4 space-y-2 mt-2">
            {parcelas.map((parcela) => (
              <TituloCard
                key={parcela.id}
                titulo={parcela}
                onView={onView}
                onEdit={onEdit}
                onDelete={onDelete}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  // Título único/independente
  return (
    <Card className="p-4">
      <div className="flex justify-between items-start mb-2">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h3 className="font-medium text-sm">{titulo.cliente.nome}</h3>
            <Badge variant="outline" className="text-xs bg-gray-50 text-gray-700 border-gray-200">
              Único
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground">{titulo.cliente.cpf_cnpj}</p>
        </div>
        <StatusBadge titulo={titulo} />
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs mb-3">
        <div>
          <span className="text-muted-foreground">Valor: </span>
          <span className="font-medium">{FormatUtils.currency(titulo.valor)}</span>
        </div>
        <div>
          <span className="text-muted-foreground">Vencimento: </span>
          <span className="font-medium">{FormatUtils.date(titulo.vencimento)}</span>
        </div>
      </div>
      <div className="flex gap-1 justify-end">
        <Button variant="ghost" size="sm" onClick={() => onView(titulo)}>
          <Eye className="h-3 w-3" />
        </Button>
        <Button variant="ghost" size="sm" onClick={() => onEdit(titulo)}>
          <Edit className="h-3 w-3" />
        </Button>
        <Button variant="ghost" size="sm" onClick={() => onDelete(titulo)}>
          <Trash2 className="h-3 w-3" />
        </Button>
      </div>
    </Card>
  );
};
