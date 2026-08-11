import { useMemo, useState } from 'react';
import { Check, ChevronsUpDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { casaTexto } from '@/utils/filterFunctions';
import { formatCpfCnpj } from '@/utils/format';
import { cn } from '@/lib/utils';

/**
 * Seletor de cliente com busca por digitação.
 *
 * Substitui os dois seletores que rolavam a base inteira sem filtro (o Select do
 * Novo Acordo e o <select> nativo do Novo Título). A busca passa por `casaTexto`,
 * então o CPF encontrado é o mesmo que a tela exibe — com ou sem máscara.
 */

export interface ClienteOpcao {
  id: string;
  nome: string;
  cpf_cnpj: string;
  /** Linha auxiliar à direita (ex.: total em aberto). */
  detalhe?: string;
}

interface SelecionarClienteProps {
  clientes: ClienteOpcao[];
  value: string;
  onChange: (clienteId: string) => void;
  placeholder?: string;
  /** Teto de itens renderizados por vez — a lista completa continua pesquisável. */
  limite?: number;
  disabled?: boolean;
}

// Renderizar milhares de linhas trava o popover. Como a busca reduz a lista a
// poucos itens, um teto alto é invisível na prática e protege a base grande.
const LIMITE_PADRAO = 100;

function ClienteLinha({ cliente, selecionado, onSelect }: {
  cliente: ClienteOpcao;
  selecionado: boolean;
  onSelect: () => void;
}) {
  return (
    <CommandItem value={cliente.id} onSelect={onSelect} className="gap-2">
      <Check className={cn('h-4 w-4 shrink-0', selecionado ? 'opacity-100' : 'opacity-0')} />
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium">{cliente.nome}</div>
        <div className="text-xs text-muted-foreground">{formatCpfCnpj(cliente.cpf_cnpj)}</div>
      </div>
      {cliente.detalhe && (
        <span className="shrink-0 text-xs font-medium text-primary">{cliente.detalhe}</span>
      )}
    </CommandItem>
  );
}

export function SelecionarCliente({
  clientes,
  value,
  onChange,
  placeholder = 'Selecione um cliente',
  limite = LIMITE_PADRAO,
  disabled,
}: SelecionarClienteProps) {
  const [open, setOpen] = useState(false);
  const [busca, setBusca] = useState('');

  const selecionado = clientes.find((c) => c.id === value);

  // Filtro próprio (Command entra com shouldFilter={false}): o embutido do cmdk
  // compara só o `value` do item e não conhece a máscara do documento.
  const visiveis = useMemo(() => {
    const termo = busca.trim();
    const base = termo
      ? clientes.filter((c) => casaTexto(c.nome, termo) || casaTexto(c.cpf_cnpj, termo))
      : clientes;
    return base.slice(0, limite);
  }, [clientes, busca, limite]);

  const escolher = (clienteId: string) => {
    onChange(clienteId);
    setOpen(false);
    setBusca('');
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className="w-full justify-between font-normal"
        >
          <span className={cn('truncate', !selecionado && 'text-muted-foreground')}>
            {selecionado
              ? `${selecionado.nome} — ${formatCpfCnpj(selecionado.cpf_cnpj)}`
              : placeholder}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Buscar por nome ou CPF/CNPJ..."
            value={busca}
            onValueChange={setBusca}
          />
          <CommandList>
            <CommandEmpty>Nenhum cliente encontrado.</CommandEmpty>
            {visiveis.map((cliente) => (
              <ClienteLinha
                key={cliente.id}
                cliente={cliente}
                selecionado={cliente.id === value}
                onSelect={() => escolher(cliente.id)}
              />
            ))}
            {clientes.length > visiveis.length && (
              <p className="px-3 py-2 text-xs text-muted-foreground">
                Mostrando {visiveis.length} de {clientes.length}. Digite para refinar.
              </p>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
