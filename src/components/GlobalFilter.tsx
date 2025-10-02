import React from 'react';
import { Filter, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { FilterConfig, FilterValues } from '@/hooks/useGlobalFilter';

interface GlobalFilterProps {
  configs: FilterConfig[];
  filters: FilterValues;
  onFilterChange: (key: string, value: any) => void;
  onClearFilter: (key: string) => void;
  onClearAll: () => void;
  hasActiveFilters: boolean;
}

export function GlobalFilter({
  configs,
  filters,
  onFilterChange,
  onClearFilter,
  onClearAll,
  hasActiveFilters
}: GlobalFilterProps) {
  const [isOpen, setIsOpen] = React.useState(false);

  const activeFiltersCount = Object.values(filters).filter(value => 
    value !== '' && value !== null && value !== undefined
  ).length;

  const renderFilterInput = (config: FilterConfig) => {
    const value = filters[config.id] || '';

    switch (config.type) {
      case 'select':
        return (
          <select
            value={value}
            onChange={(e) => onFilterChange(config.id, e.target.value)}
            className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors"
          >
            <option value="">{config.placeholder || 'Todos'}</option>
            {config.options?.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        );

      case 'date':
        return (
          <Input
            type="date"
            value={value}
            onChange={(e) => onFilterChange(config.id, e.target.value)}
            placeholder={config.placeholder}
          />
        );

      case 'number':
        return (
          <Input
            type="number"
            step="0.01"
            value={value}
            onChange={(e) => onFilterChange(config.id, e.target.value)}
            placeholder={config.placeholder}
          />
        );

      default:
        return (
          <Input
            type="text"
            value={value}
            onChange={(e) => onFilterChange(config.id, e.target.value)}
            placeholder={config.placeholder}
          />
        );
    }
  };

  return (
    <div className="space-y-4">
      {/* Trigger do filtro */}
      <div className="flex items-center justify-between">
        <Collapsible open={isOpen} onOpenChange={setIsOpen}>
          <CollapsibleTrigger asChild>
            <Button variant="outline" size="sm" className="gap-2">
              <Filter className="h-4 w-4" />
              <span>Filtros</span>
              {activeFiltersCount > 0 && (
                <Badge variant="secondary" className="ml-1 h-5 w-5 rounded-full p-0 text-xs">
                  {activeFiltersCount}
                </Badge>
              )}
            </Button>
          </CollapsibleTrigger>

          <CollapsibleContent className="mt-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-4 border rounded-lg bg-muted/50">
              {configs.map((config) => (
                <div key={config.id} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor={config.id} className="text-sm font-medium">
                      {config.label}
                    </Label>
                    {filters[config.id] && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onClearFilter(config.id)}
                        className="h-6 w-6 p-0"
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                  {renderFilterInput(config)}
                </div>
              ))}
              
              {hasActiveFilters && (
                <div className="flex items-end">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={onClearAll}
                    className="w-full"
                  >
                    Limpar Todos
                  </Button>
                </div>
              )}
            </div>
          </CollapsibleContent>
        </Collapsible>
      </div>

      {/* Badges dos filtros ativos */}
      {hasActiveFilters && (
        <div className="flex flex-wrap gap-2">
          {Object.entries(filters).map(([key, value]) => {
            if (!value || value === '') return null;
            
            const config = configs.find(c => c.id === key);
            if (!config) return null;

            let displayValue = value;
            if (config.type === 'select') {
              const option = config.options?.find(opt => opt.value === value);
              displayValue = option?.label || value;
            }

            return (
              <Badge key={key} variant="secondary" className="gap-1">
                <span className="text-xs">
                  {config.label}: {displayValue}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onClearFilter(key)}
                  className="h-4 w-4 p-0 hover:bg-transparent"
                >
                  <X className="h-3 w-3" />
                </Button>
              </Badge>
            );
          })}
        </div>
      )}
    </div>
  );
}
