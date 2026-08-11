import type { ReactNode } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';

/** Confirmação explícita exigida por certos status (pesquisa, devolução). */
export function ConfirmacaoCheckbox({
  id,
  checked,
  onChange,
  children,
}: {
  id: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  children: ReactNode;
}) {
  return (
    <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 dark:border-amber-700 dark:bg-amber-950/40">
      <Checkbox id={id} checked={checked} onCheckedChange={(v) => onChange(v === true)} className="mt-0.5" />
      <Label htmlFor={id} className="text-sm font-normal leading-snug cursor-pointer">
        {children}
      </Label>
    </div>
  );
}
