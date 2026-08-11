import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { CalendarIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

/** Campo de data em popover — compartilhado pelos formulários de telecobrança. */
export function DataPicker({
  value,
  onChange,
  desabilitarPassado,
}: {
  value: Date | undefined;
  onChange: (d: Date | undefined) => void;
  desabilitarPassado?: boolean;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn('w-full justify-start text-left font-normal', !value && 'text-muted-foreground')}
        >
          <CalendarIcon className="mr-2 h-4 w-4" />
          {value ? format(value, 'dd/MM/yyyy', { locale: ptBR }) : <span>Selecione</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={value}
          onSelect={onChange}
          disabled={desabilitarPassado ? (date) => date < new Date() : undefined}
          locale={ptBR}
        />
      </PopoverContent>
    </Popover>
  );
}
