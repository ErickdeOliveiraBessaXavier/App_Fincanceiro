import { forwardRef } from 'react';
import { Input } from '@/components/ui/input';
import { mascaraCpfCnpj, mascaraTelefone } from '@/utils/format';

/**
 * Campos que se formatam enquanto o usuário digita.
 *
 * O valor sobe já mascarado — as consultas normalizam com `soDigitos` antes de
 * gravar, então o banco continua guardando só dígitos. Digitar um caractere que
 * não é dígito simplesmente não produz efeito, em vez de sujar o campo.
 *
 * A máscara vive em utils/format.ts, junto das funções de exibição, para o que
 * se digita e o que se lê seguirem a mesma regra.
 */

type InputProps = React.ComponentPropsWithoutRef<typeof Input>;
type MascaradoProps = Omit<InputProps, 'value' | 'onChange'> & {
  value: string;
  onChange: (valor: string) => void;
};

function criarCampo(
  mascara: (v: string) => string,
  placeholderPadrao: string,
  inputMode: 'numeric' = 'numeric',
) {
  return forwardRef<HTMLInputElement, MascaradoProps>(
    ({ value, onChange, placeholder, ...props }, ref) => (
      <Input
        {...props}
        ref={ref}
        inputMode={inputMode}
        placeholder={placeholder ?? placeholderPadrao}
        value={mascara(value ?? '')}
        onChange={(e) => onChange(mascara(e.target.value))}
      />
    ),
  );
}

/** CPF até 11 dígitos, CNPJ a partir do 12º. */
export const InputDocumento = criarCampo(mascaraCpfCnpj, '000.000.000-00');
InputDocumento.displayName = 'InputDocumento';

/** Fixo até 10 dígitos, celular no 11º. */
export const InputTelefone = criarCampo(mascaraTelefone, '(00) 00000-0000');
InputTelefone.displayName = 'InputTelefone';
