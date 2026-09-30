import type { ReactNode } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Aviso } from '@/components/Aviso';

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
    <Aviso className="flex items-start gap-2 text-foreground">
      <Checkbox id={id} checked={checked} onCheckedChange={(v) => onChange(v === true)} className="mt-0.5" />
      <Label htmlFor={id} className="text-sm font-normal leading-snug cursor-pointer">
        {children}
      </Label>
    </Aviso>
  );
}
