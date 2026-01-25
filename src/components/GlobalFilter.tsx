import React, { useState } from 'react';
import { X, Filter, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { FilterConfig, FilterValues } from '@/hooks/useGlobalFilter';
import { FilterPreset } from '@/constants/filterPresets';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

interface GlobalFilterProps {
  configs: FilterConfig[];
  filters: FilterValues;
  onFilterChange: (key: string, value: any) => void;
  onClearFilter: (key: string) => void;
  onClearAll: () => void;
  hasActiveFilters: boolean;
  activeFiltersCount?: number;
  resultCount?: number;
  totalCount?: number;
  presets?: FilterPreset[];
  onPresetSelect?: (preset: FilterPreset) => void;
  collapsible?: boolean;
  defaultOpen?: boolean;
}

export function GlobalFilter({
  configs,
  filters,
  onFilterChange,
  onClearFilter,
  onClearAll,
  hasActiveFilters,
  activeFiltersCount = 0,
  resultCount,
  totalCount,
  presets,
  onPresetSelect,
  collapsible = true,
  defaultOpen = true
}: GlobalFilterProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  const renderFilterInput = (config: FilterConfig) => {
    const value = filters[config.id] || '';

    switch (config.type) {
      case 'select':
        return (
          <select
            value={value}
            onChange={(e) => onFilterChange(config.id, e.target.value)}
            className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1"
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
            className="h-9"
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
            className="h-9"
          />
        );

      default:
        return (
          <Input
            type="text"
            value={value}
            onChange={(e) => onFilterChange(config.id, e.target.value)}
            placeholder={config.placeholder}
            className="h-9"
          />
        );
    }
  };

  const getActivePresetId = () => {
    if (!presets) return null;
    
    for (const preset of presets) {
      const presetKeys = Object.keys(preset.filters);
      const filterKeys = Object.keys(filters).filter(k => filters[k] !== '' && filters[k] !== null && filters[k] !== undefined);
      
      if (presetKeys.length === 0 && filterKeys.length === 0) {
        return preset.id;
      }
      
      if (presetKeys.length !== filterKeys.length) continue;
      
      const allMatch = presetKeys.every(key => filters[key] === preset.filters[key]);
      if (allMatch && filterKeys.every(key => preset.filters[key] !== undefined)) {
        return preset.id;
      }
    }
    return null;
  };

  const activePresetId = getActivePresetId();

  const filterContent = (
    <div className="space-y-4">
      {/* Presets */}
      {presets && presets.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {presets.map((preset) => (
            <Button
              key={preset.id}
              variant={activePresetId === preset.id ? "default" : "outline"}
              size="sm"
              onClick={() => onPresetSelect?.(preset)}
              className="h-7 text-xs"
            >
              {preset.label}
            </Button>
          ))}
        </div>
      )}

      {/* Filter Fields */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {configs.map((config) => (
          <div key={config.id} className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor={config.id} className="text-xs font-medium text-muted-foreground">
                {config.label}
              </Label>
              {filters[config.id] && filters[config.id] !== '' && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onClearFilter(config.id)}
                  className="h-5 w-5 p-0 hover:bg-muted"
                >
                  <X className="h-3 w-3" />
                </Button>
              )}
            </div>
            {renderFilterInput(config)}
          </div>
        ))}
      </div>

      {/* Footer with clear all and count */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-2 border-t">
        <div className="flex items-center gap-2">
          {hasActiveFilters && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onClearAll}
              className="h-7 text-xs text-muted-foreground hover:text-foreground"
            >
              <X className="h-3 w-3 mr-1" />
              Limpar filtros
            </Button>
          )}
        </div>
        
        {resultCount !== undefined && totalCount !== undefined && (
          <span className="text-xs text-muted-foreground">
            Mostrando <span className="font-medium text-foreground">{resultCount}</span> de{' '}
            <span className="font-medium text-foreground">{totalCount}</span> resultados
          </span>
        )}
      </div>
    </div>
  );

  if (!collapsible) {
    return (
      <div className="p-4 border rounded-lg bg-card">
        {filterContent}
      </div>
    );
  }

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <div className="border rounded-lg bg-card overflow-hidden">
        <CollapsibleTrigger asChild>
          <Button
            variant="ghost"
            className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/50 rounded-none"
          >
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4" />
              <span className="font-medium">Filtros</span>
              {activeFiltersCount > 0 && (
                <Badge variant="secondary" className="h-5 px-1.5 text-xs">
                  {activeFiltersCount}
                </Badge>
              )}
            </div>
            {isOpen ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </Button>
        </CollapsibleTrigger>
        
        <CollapsibleContent>
          <div className="p-4 border-t">
            {filterContent}
          </div>
        </CollapsibleContent>
      </div>

      {/* Active Filter Badges (shown when collapsed) */}
      {!isOpen && hasActiveFilters && (
        <div className="flex flex-wrap gap-2 mt-2">
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
              <Badge key={key} variant="secondary" className="gap-1 pr-1">
                <span className="text-xs">
                  {config.label}: {displayValue}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    onClearFilter(key);
                  }}
                  className="h-4 w-4 p-0 hover:bg-transparent ml-1"
                >
                  <X className="h-3 w-3" />
                </Button>
              </Badge>
            );
          })}
        </div>
      )}
    </Collapsible>
  );
}
