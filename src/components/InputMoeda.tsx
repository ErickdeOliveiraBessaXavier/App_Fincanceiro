import { forwardRef, type ComponentProps } from 'react';
import { Input } from '@/components/ui/input';
import { formatMoeda, parseMoeda } from '@/utils/format';

interface InputMoedaProps extends Omit<ComponentProps<'input'>, 'value' | 'onChange' | 'type'> {
  value: number;
  onChange: (valor: number) => void;
}

// O texto é sempre reconstruído a partir dos dígitos, então a digitação só faz
// sentido pela direita. Manter o cursor no fim evita que um clique no meio do
// campo insira dígito em posição que a remontagem vai deslocar.
function caretNoFim(el: HTMLInputElement) {
  requestAnimationFrame(() => {
    const fim = el.value.length;
    el.setSelectionRange(fim, fim);
  });
}

/**
 * Campo de dinheiro em pt-BR. Os dígitos entram como centavos e a máscara é
 * remontada a cada tecla: 1-5-6-0-0-2-0 vira "15.600,20". Substitui o
 * `<Input type="number">`, em que o usuário tinha de apagar o "0" default e
 * ainda esbarrava na vírgula recusada pelo campo numérico.
 */
export const InputMoeda = forwardRef<HTMLInputElement, InputMoedaProps>(
  ({ value, onChange, placeholder = '0,00', ...props }, ref) => (
    <Input
      {...props}
      ref={ref}
      type="text"
      inputMode="numeric"
      placeholder={placeholder}
      value={value ? formatMoeda(value) : ''}
      onChange={(e) => {
        onChange(parseMoeda(e.target.value));
        caretNoFim(e.currentTarget);
      }}
      onFocus={(e) => caretNoFim(e.currentTarget)}
      onClick={(e) => caretNoFim(e.currentTarget)}
    />
  ),
);
InputMoeda.displayName = 'InputMoeda';
