import { useMemo, useState } from 'react';
import { PageHeader } from '@/components/PageHeader';
import { Users, X } from 'lucide-react';
import {
  useClientes,
  useAssignCobrador,
  useAssignVendedor,
  type ClienteRow,
} from '@/lib/queries/clientes';
import { useCobradores, type CobradorRow } from '@/lib/queries/cobradores';
import { useVendedores, type VendedorRow } from '@/lib/queries/vendedores';
import { useUserRole } from '@/hooks/useUserRole';
import { usePagination } from '@/hooks/usePagination';
import { TablePagination } from '@/components/TablePagination';
import { GlobalFilter } from '@/components/GlobalFilter';
import { useGlobalFilter } from '@/hooks/useGlobalFilter';
import { createAtribuicaoFilterFunctions, SEM_VINCULO } from '@/utils/filterFunctions';
import type { FilterPreset } from '@/constants/filterPresets';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { formatCpfCnpj } from '@/utils/format';

// Sentinela do Radix Select (não aceita value vazio) para "sem vínculo".
const NONE = 'none';

// Presets rápidos para os cenários comuns de distribuição.
const atribuicaoPresets: FilterPreset[] = [
  { id: 'todos', label: 'Todos', filters: {} },
  { id: 'sem_cobrador', label: 'Sem cobrador', filters: { cobrador: SEM_VINCULO } },
  { id: 'sem_vendedor', label: 'Sem vendedor', filters: { vendedor: SEM_VINCULO } },
  { id: 'inadimplentes', label: 'Inadimplentes', filters: { status: 'inadimplente' } },
];

// ===================== Select reutilizável (linha e barra em massa) =====================
interface Opcao { id: string; nome: string; }
interface AssignSelectProps {
  value: string; // '' representa "sem vínculo"
  opcoes: Opcao[];
  semLabel: string;
  onChange: (id: string | null) => void;
  disabled?: boolean;
}
function AssignSelect({ value, opcoes, semLabel, onChange, disabled }: AssignSelectProps) {
  return (
    <Select
      value={value || NONE}
      onValueChange={(v) => onChange(v === NONE ? null : v)}
      disabled={disabled}
    >
      <SelectTrigger className="h-8 text-xs"><SelectValue placeholder={semLabel} /></SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}>{semLabel}</SelectItem>
        {opcoes.map((o) => <SelectItem key={o.id} value={o.id}>{o.nome}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

// ===================== Barra de ação em massa =====================
interface BulkBarProps {
  count: number;
  cobradores: CobradorRow[];
  vendedores: VendedorRow[];
  onAtribuirCobrador: (id: string | null) => void;
  onAtribuirVendedor: (id: string | null) => void;
  onLimpar: () => void;
  pending: boolean;
}
function BulkBar({ count, cobradores, vendedores, onAtribuirCobrador, onAtribuirVendedor, onLimpar, pending }: BulkBarProps) {
  const [cob, setCob] = useState<string>('');
  const [ven, setVen] = useState<string>('');
  return (
    <div className="flex flex-wrap items-end gap-4 p-4 mb-4 rounded-xl border border-primary/30 bg-primary/5">
      <div className="text-sm font-bold">{count} selecionado{count === 1 ? '' : 's'}</div>
      <div className="flex items-end gap-2">
        <div className="space-y-1.5">
          <Label className="text-[10px] uppercase tracking-widest text-muted-foreground">Cobrador</Label>
          <div className="w-44">
            <AssignSelect value={cob} opcoes={cobradores} semLabel="Remover cobrador" onChange={(id) => setCob(id ?? '')} />
          </div>
        </div>
        <Button size="sm" disabled={pending} onClick={() => onAtribuirCobrador(cob || null)}>Atribuir</Button>
      </div>
      <div className="flex items-end gap-2">
        <div className="space-y-1.5">
          <Label className="text-[10px] uppercase tracking-widest text-muted-foreground">Vendedor</Label>
          <div className="w-44">
            <AssignSelect value={ven} opcoes={vendedores} semLabel="Remover vendedor" onChange={(id) => setVen(id ?? '')} />
          </div>
        </div>
        <Button size="sm" disabled={pending} onClick={() => onAtribuirVendedor(ven || null)}>Atribuir</Button>
      </div>
      <Button size="sm" variant="ghost" onClick={onLimpar} className="ml-auto">
        <X className="h-4 w-4 mr-1" /> Limpar seleção
      </Button>
    </div>
  );
}

// ===================== Linha =====================
interface AtribuicaoRowProps {
  cliente: ClienteRow;
  selecionado: boolean;
  cobradores: CobradorRow[];
  vendedores: VendedorRow[];
  onToggle: (id: string) => void;
  onCobrador: (id: string | null) => void;
  onVendedor: (id: string | null) => void;
  pending: boolean;
}
function AtribuicaoRow({ cliente, selecionado, cobradores, vendedores, onToggle, onCobrador, onVendedor, pending }: AtribuicaoRowProps) {
  return (
    <TableRow className="hover:bg-muted/10 transition-colors">
      <TableCell className="w-10">
        <Checkbox checked={selecionado} onCheckedChange={() => onToggle(cliente.id)} />
      </TableCell>
      <TableCell className="font-bold text-sm text-foreground">{cliente.nome}</TableCell>
      <TableCell className="text-xs font-medium text-muted-foreground">{formatCpfCnpj(cliente.cpf_cnpj)}</TableCell>
      <TableCell className="w-52">
        <AssignSelect value={cliente.cobrador_id ?? ''} opcoes={cobradores} semLabel="Sem cobrador" onChange={onCobrador} disabled={pending} />
      </TableCell>
      <TableCell className="w-52">
        <AssignSelect value={cliente.vendedor_id ?? ''} opcoes={vendedores} semLabel="Sem vendedor" onChange={onVendedor} disabled={pending} />
      </TableCell>
    </TableRow>
  );
}

// ===================== Página =====================
export default function Atribuicao() {
  const { data: clientes = [], isLoading } = useClientes();
  const { data: cobradores = [] } = useCobradores();
  const { data: vendedores = [] } = useVendedores();
  const { isAdmin, isLoading: roleLoading } = useUserRole();
  const assignCobrador = useAssignCobrador();
  const assignVendedor = useAssignVendedor();
  const { toast } = useToast();

  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());

  const filterFunctions = useMemo(() => createAtribuicaoFilterFunctions(), []);

  // Configuração dos filtros. Cobrador/Vendedor incluem a opção "Sem vínculo"
  // (para localizar clientes ainda não distribuídos) além da equipe da empresa.
  const filterConfigs = useMemo(() => [
    { id: 'search', label: 'Buscar', type: 'text' as const, placeholder: 'Nome ou CPF/CNPJ...' },
    {
      id: 'status', label: 'Situação', type: 'select' as const, placeholder: 'Todas',
      options: [
        { value: 'ativo', label: 'Ativo' },
        { value: 'inadimplente', label: 'Inadimplente' },
        { value: 'em_acordo', label: 'Em Acordo' },
        { value: 'quitado', label: 'Quitado' },
      ],
    },
    {
      id: 'cobrador', label: 'Cobrador', type: 'select' as const, placeholder: 'Todos',
      options: [{ value: SEM_VINCULO, label: 'Sem cobrador' }, ...cobradores.map((c) => ({ value: c.id, label: c.nome }))],
    },
    {
      id: 'vendedor', label: 'Vendedor', type: 'select' as const, placeholder: 'Todos',
      options: [{ value: SEM_VINCULO, label: 'Sem vendedor' }, ...vendedores.map((v) => ({ value: v.id, label: v.nome }))],
    },
    { id: 'cidade', label: 'Cidade', type: 'text' as const, placeholder: 'Filtrar por cidade...' },
    { id: 'estado', label: 'Estado', type: 'text' as const, placeholder: 'UF' },
    {
      id: 'retorno', label: 'Retorno de cobrança', type: 'select' as const, placeholder: 'Todos',
      options: [
        { value: 'atrasados', label: 'Atrasados' },
        { value: 'hoje', label: 'Hoje' },
        { value: 'proximos_7', label: 'Próximos 7 dias' },
        { value: 'com_agendamento', label: 'Com agendamento' },
        { value: 'sem_agendamento', label: 'Sem agendamento' },
      ],
    },
    { id: 'valor_min', label: 'Valor mínimo', type: 'number' as const, placeholder: 'R$ 0,00' },
    { id: 'valor_max', label: 'Valor máximo', type: 'number' as const, placeholder: 'R$ 999.999,99' },
  ], [cobradores, vendedores]);

  const {
    filteredData: filtrados,
    filters,
    setFilter,
    setFilters,
    clearFilter,
    clearAllFilters,
    hasActiveFilters,
    activeFiltersCount,
    resultCount,
    totalCount,
  } = useGlobalFilter(clientes, filterFunctions);

  const pagination = usePagination(filtrados, 25, JSON.stringify(filters));
  const pending = assignCobrador.isPending || assignVendedor.isPending;

  const toggle = (id: string) => {
    setSelecionados((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const todosFiltradosSelecionados = filtrados.length > 0 && filtrados.every((c) => selecionados.has(c.id));
  const toggleTodos = () => {
    setSelecionados(todosFiltradosSelecionados ? new Set() : new Set(filtrados.map((c) => c.id)));
  };

  const aplicar = async (
    mutate: (input: { clienteIds: string[]; targetId: string | null }) => Promise<unknown>,
    clienteIds: string[],
    targetId: string | null,
    label: string,
  ) => {
    try {
      await mutate({ clienteIds, targetId });
      toast({ title: 'Atribuição atualizada', description: `${label} aplicado a ${clienteIds.length} cliente(s).` });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Falha ao atribuir';
      toast({ title: 'Erro', description: msg, variant: 'destructive' });
    }
  };

  const selecionadosIds = () => Array.from(selecionados);

  if (roleLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary" />
      </div>
    );
  }
  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">Apenas administradores podem distribuir carteiras.</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-fade-in pb-10">
      <PageHeader
        title="Atribuição de carteiras"
        description="Distribua clientes entre cobradores e vendedores de forma centralizada."
      />

      <Card className="border-none shadow-card rounded-2xl overflow-hidden">
        <CardHeader className="pb-4 border-b border-border/50 bg-muted/20">
          <CardTitle className="text-xl font-bold tracking-tight flex items-center gap-2">
            <Users className="h-5 w-5" /> Clientes
          </CardTitle>
          <CardDescription className="text-xs font-medium">
            {filtrados.length} de {clientes.length} clientes — vendedor e cobrador são independentes.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-6">
          <GlobalFilter
            configs={filterConfigs}
            filters={filters}
            onFilterChange={setFilter}
            onClearFilter={clearFilter}
            onClearAll={clearAllFilters}
            hasActiveFilters={hasActiveFilters}
            activeFiltersCount={activeFiltersCount}
            resultCount={resultCount}
            totalCount={totalCount}
            presets={atribuicaoPresets}
            onPresetSelect={(preset) => setFilters(preset.filters)}
            collapsible
            defaultOpen
          />

          {selecionados.size > 0 && (
            <BulkBar
              count={selecionados.size}
              cobradores={cobradores}
              vendedores={vendedores}
              onAtribuirCobrador={(id) => aplicar(assignCobrador.mutateAsync, selecionadosIds(), id, 'Cobrador')}
              onAtribuirVendedor={(id) => aplicar(assignVendedor.mutateAsync, selecionadosIds(), id, 'Vendedor')}
              onLimpar={() => setSelecionados(new Set())}
              pending={pending}
            />
          )}

          {isLoading ? (
            <div className="flex h-32 items-center justify-center">
              <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary" />
            </div>
          ) : (
            <div className="rounded-xl border border-border/50 overflow-hidden">
              <Table>
                <TableHeader className="bg-muted/30">
                  <TableRow>
                    <TableHead className="w-10">
                      <Checkbox checked={todosFiltradosSelecionados} onCheckedChange={toggleTodos} />
                    </TableHead>
                    <TableHead className="text-[10px] font-bold uppercase tracking-widest">Cliente</TableHead>
                    <TableHead className="text-[10px] font-bold uppercase tracking-widest">CPF/CNPJ</TableHead>
                    <TableHead className="text-[10px] font-bold uppercase tracking-widest">Cobrador</TableHead>
                    <TableHead className="text-[10px] font-bold uppercase tracking-widest">Vendedor</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pagination.pageItems.map((cliente) => (
                    <AtribuicaoRow
                      key={cliente.id}
                      cliente={cliente}
                      selecionado={selecionados.has(cliente.id)}
                      cobradores={cobradores}
                      vendedores={vendedores}
                      onToggle={toggle}
                      onCobrador={(id) => aplicar(assignCobrador.mutateAsync, [cliente.id], id, 'Cobrador')}
                      onVendedor={(id) => aplicar(assignVendedor.mutateAsync, [cliente.id], id, 'Vendedor')}
                      pending={pending}
                    />
                  ))}
                </TableBody>
              </Table>
              <TablePagination pagination={pagination} />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
