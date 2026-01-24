import { useState, useEffect } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { ChevronDown, ChevronRight, AlertTriangle } from 'lucide-react';
import { format } from 'date-fns';
import { TituloAgrupado, ClienteComDividas } from '@/hooks/useTitulosAgrupados';
import { cn } from '@/lib/utils';

interface SelecionarTitulosAcordoProps {
  clientes: ClienteComDividas[];
  clienteIdPreSelecionado?: string;
  onSelectionChange: (selection: {
    clienteId: string;
    cliente: { id: string; nome: string; cpf_cnpj: string };
    tituloIds: string[];
    valorTotal: number;
    dividas: TituloAgrupado[];
  } | null) => void;
}

export function SelecionarTitulosAcordo({
  clientes,
  clienteIdPreSelecionado,
  onSelectionChange
}: SelecionarTitulosAcordoProps) {
  const [clienteSelecionado, setClienteSelecionado] = useState<string>(clienteIdPreSelecionado || '');
  const [dividasSelecionadas, setDividasSelecionadas] = useState<Set<string>>(new Set());
  const [expandedDividas, setExpandedDividas] = useState<Set<string>>(new Set());

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(value);
  };

  const clienteAtual = clientes.find(c => c.id === clienteSelecionado);

  // Atualizar seleção quando cliente muda
  useEffect(() => {
    if (clienteIdPreSelecionado && clientes.length > 0) {
      setClienteSelecionado(clienteIdPreSelecionado);
      // Auto-selecionar todas as dívidas do cliente
      const cliente = clientes.find(c => c.id === clienteIdPreSelecionado);
      if (cliente) {
        setDividasSelecionadas(new Set(cliente.dividas.map(d => d.id)));
      }
    }
  }, [clienteIdPreSelecionado, clientes]);

  // Notificar mudanças na seleção
  useEffect(() => {
    if (!clienteAtual || dividasSelecionadas.size === 0) {
      onSelectionChange(null);
      return;
    }

    const dividasEscolhidas = clienteAtual.dividas.filter(d => dividasSelecionadas.has(d.id));
    const tituloIds = dividasEscolhidas.flatMap(d => d.titulos.map(t => t.id));
    const valorTotal = dividasEscolhidas.reduce((sum, d) => sum + d.valor_total, 0);

    onSelectionChange({
      clienteId: clienteAtual.id,
      cliente: {
        id: clienteAtual.id,
        nome: clienteAtual.nome,
        cpf_cnpj: clienteAtual.cpf_cnpj
      },
      tituloIds,
      valorTotal,
      dividas: dividasEscolhidas
    });
  }, [clienteSelecionado, dividasSelecionadas, clienteAtual, onSelectionChange]);

  const handleClienteChange = (clienteId: string) => {
    setClienteSelecionado(clienteId);
    setDividasSelecionadas(new Set());
    setExpandedDividas(new Set());
  };

  const handleDividaToggle = (dividaId: string) => {
    const newSet = new Set(dividasSelecionadas);
    if (newSet.has(dividaId)) {
      newSet.delete(dividaId);
    } else {
      newSet.add(dividaId);
    }
    setDividasSelecionadas(newSet);
  };

  const toggleExpand = (dividaId: string) => {
    const newSet = new Set(expandedDividas);
    if (newSet.has(dividaId)) {
      newSet.delete(dividaId);
    } else {
      newSet.add(dividaId);
    }
    setExpandedDividas(newSet);
  };

  const handleSelectAll = () => {
    if (!clienteAtual) return;
    
    if (dividasSelecionadas.size === clienteAtual.dividas.length) {
      setDividasSelecionadas(new Set());
    } else {
      setDividasSelecionadas(new Set(clienteAtual.dividas.map(d => d.id)));
    }
  };

  return (
    <div className="space-y-4">
      {/* Seletor de Cliente */}
      <div className="space-y-2">
        <label className="text-sm font-medium">Cliente *</label>
        <select
          value={clienteSelecionado}
          onChange={(e) => handleClienteChange(e.target.value)}
          className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
        >
          <option value="">Selecione um cliente</option>
          {clientes.map((cliente) => (
            <option key={cliente.id} value={cliente.id}>
              {cliente.nome} - {cliente.cpf_cnpj} (Dívida: {formatCurrency(cliente.valor_total)})
            </option>
          ))}
        </select>
      </div>

      {/* Lista de Dívidas do Cliente */}
      {clienteAtual && clienteAtual.dividas.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium">Títulos em Aberto</label>
            <button
              type="button"
              onClick={handleSelectAll}
              className="text-xs text-primary hover:underline"
            >
              {dividasSelecionadas.size === clienteAtual.dividas.length
                ? 'Desmarcar todos'
                : 'Selecionar todos'}
            </button>
          </div>

          <div className="border rounded-lg divide-y max-h-64 overflow-y-auto">
            {clienteAtual.dividas.map((divida) => {
              const isExpanded = expandedDividas.has(divida.id);
              const isSelected = dividasSelecionadas.has(divida.id);
              const temParcelas = divida.titulos.length > 1;

              return (
                <div key={divida.id} className="bg-card">
                  {/* Header da Dívida */}
                  <div
                    className={cn(
                      "flex items-center gap-3 p-3 hover:bg-muted/50 transition-colors",
                      isSelected && "bg-primary/5"
                    )}
                  >
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={() => handleDividaToggle(divida.id)}
                    />

                    {temParcelas && (
                      <button
                        type="button"
                        onClick={() => toggleExpand(divida.id)}
                        className="p-0.5 hover:bg-muted rounded"
                      >
                        {isExpanded ? (
                          <ChevronDown className="h-4 w-4" />
                        ) : (
                          <ChevronRight className="h-4 w-4" />
                        )}
                      </button>
                    )}

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        {divida.numero_documento && (
                          <span className="text-xs text-muted-foreground font-mono">
                            #{divida.numero_documento}
                          </span>
                        )}
                        <span className="text-sm font-medium">
                          {temParcelas
                            ? `Contrato (${divida.parcelas_abertas} parcela${divida.parcelas_abertas > 1 ? 's' : ''} em aberto)`
                            : 'Título Avulso'}
                        </span>
                        {divida.tem_vencido && (
                          <Badge variant="destructive" className="text-xs">
                            <AlertTriangle className="h-3 w-3 mr-1" />
                            Vencido
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Venc: {format(new Date(divida.vencimento_mais_antigo), 'dd/MM/yyyy')}
                      </p>
                    </div>

                    <span className="font-semibold text-sm">
                      {formatCurrency(divida.valor_total)}
                    </span>
                  </div>

                  {/* Parcelas Expandidas */}
                  {temParcelas && isExpanded && (
                    <div className="pl-12 pr-3 pb-2 space-y-1 bg-muted/30">
                      {divida.titulos.map((titulo) => (
                        <div
                          key={titulo.id}
                          className="flex items-center justify-between text-xs py-1"
                        >
                          <div className="flex items-center gap-2">
                            <span className="text-muted-foreground">
                              Parcela {titulo.numero_parcela || 1}/{titulo.total_parcelas || 1}
                            </span>
                            <span>
                              Venc: {format(new Date(titulo.vencimento), 'dd/MM/yyyy')}
                            </span>
                            {titulo.status === 'vencido' && (
                              <Badge variant="destructive" className="text-xs py-0">
                                Vencido
                              </Badge>
                            )}
                          </div>
                          <span className="font-medium">
                            {formatCurrency(titulo.valor)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Resumo da Seleção */}
          {dividasSelecionadas.size > 0 && (
            <div className="flex items-center justify-between p-3 bg-primary/5 rounded-lg border border-primary/20">
              <span className="text-sm font-medium">
                {dividasSelecionadas.size} dívida{dividasSelecionadas.size > 1 ? 's' : ''} selecionada{dividasSelecionadas.size > 1 ? 's' : ''}
              </span>
              <span className="font-bold text-primary">
                {formatCurrency(
                  clienteAtual.dividas
                    .filter(d => dividasSelecionadas.has(d.id))
                    .reduce((sum, d) => sum + d.valor_total, 0)
                )}
              </span>
            </div>
          )}
        </div>
      )}

      {clienteAtual && clienteAtual.dividas.length === 0 && (
        <div className="text-center py-4 text-muted-foreground text-sm">
          Este cliente não possui títulos em aberto.
        </div>
      )}
    </div>
  );
}
