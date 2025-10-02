import React, { useState, useEffect } from 'react';
import { Plus, Search, Eye, Edit, Trash2, ChevronDown, ChevronRight } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { GlobalFilter } from '@/components/GlobalFilter';
import { useGlobalFilter, FilterConfig } from '@/hooks/useGlobalFilter';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

// Importar novos utilitários, hooks e componentes
import { useTitulos } from '@/hooks/useTitulos';
import { useTituloForm } from '@/hooks/useTituloForm';
import { useTituloOperations } from '@/hooks/useTituloOperations';
import { Titulo, StatusUtils, ParcelaUtils, FormatUtils } from '@/utils/titulo';
import { StatusBadge } from '@/components/titulos/StatusBadge';
import { TituloCard } from '@/components/titulos/TituloCard';
import { TituloForm } from '@/components/titulos/TituloForm';

// Configuração de filtros para a página de títulos
const titulosFilterConfig: FilterConfig[] = [
  {
    id: 'status',
    label: 'Status',
    type: 'select',
    options: [
      { value: 'em_aberto', label: 'Em Aberto', color: '#fbbf24' },
      { value: 'pago', label: 'Pago', color: '#10b981' },
      { value: 'vencido', label: 'Vencido', color: '#ef4444' },
      { value: 'acordo', label: 'Em Acordo', color: '#3b82f6' },
    ],
    placeholder: 'Todos os status'
  },
  {
    id: 'cliente',
    label: 'Cliente',
    type: 'text',
    placeholder: 'Buscar por nome ou CPF/CNPJ'
  },
  {
    id: 'vencimento_inicio',
    label: 'Vencimento (De)',
    type: 'date'
  },
  {
    id: 'vencimento_fim',
    label: 'Vencimento (Até)',
    type: 'date'
  },
  {
    id: 'valor_min',
    label: 'Valor Mínimo',
    type: 'number',
    placeholder: 'R$ 0,00'
  },
  {
    id: 'valor_max',
    label: 'Valor Máximo',
    type: 'number',
    placeholder: 'R$ 0,00'
  }
];

// Interface simplificada para edição
interface TituloEditando {
  id: string;
  cliente_id: string;
  valor: number;
  vencimento: string;
  status: 'em_aberto' | 'pago' | 'vencido' | 'acordo';
  observacoes?: string | null;
}

export default function Titulos() {
  // Usar hooks customizados
  const { titulos, loading, fetchTitulos, deleteTitulo } = useTitulos();
  const { formData: newTitulo, errors: formErrors, updateField, validate, reset } = useTituloForm();
  const { createTitulo, updateTitulo } = useTituloOperations();
  
  // Estados simplificados
  const [searchTerm, setSearchTerm] = useState('');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [selectedTitulo, setSelectedTitulo] = useState<Titulo | null>(null);
  const [tituloToDelete, setTituloToDelete] = useState<Titulo | null>(null);
  const [clientes, setClientes] = useState<Array<{ id: string; nome: string; cpf_cnpj: string }>>([]);
  const [editingTitulo, setEditingTitulo] = useState<TituloEditando>({
    id: '',
    cliente_id: '',
    valor: 0,
    vencimento: new Date().toISOString().split('T')[0],
    status: 'em_aberto',
    observacoes: ''
  });
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [showFilters, setShowFilters] = useState(false);
  const { toast } = useToast();

  // Função para agrupar títulos usando utilitários
  const agruparTitulos = (titulos: Titulo[]) => {
    const grupos: { [key: string]: { principal: Titulo | null; parcelas: Titulo[] } } = {};
    const titulosIndependentes: Titulo[] = [];

    titulos.forEach(titulo => {
      if (ParcelaUtils.isTituloPai(titulo)) {
        const grupoId = titulo.id;
        if (!grupos[grupoId]) {
          grupos[grupoId] = { principal: null, parcelas: [] };
        }
        grupos[grupoId].principal = titulo;
      } else if (ParcelaUtils.isParcela(titulo)) {
        const grupoId = titulo.titulo_pai_id || `grupo_${titulo.cliente_id}`;
        if (!grupos[grupoId]) {
          grupos[grupoId] = { principal: null, parcelas: [] };
        }
        grupos[grupoId].parcelas.push(titulo);
      } else {
        titulosIndependentes.push(titulo);
      }
    });

    return { grupos, titulosIndependentes };
  };

  const toggleGroup = (groupId: string) => {
    setExpandedGroups(prev => {
      const newSet = new Set(prev);
      if (newSet.has(groupId)) {
        newSet.delete(groupId);
      } else {
        newSet.add(groupId);
      }
      return newSet;
    });
  };

  useEffect(() => {
    fetchClientes();
  }, []);

  const fetchClientes = async () => {
    try {
      const { data, error } = await supabase
        .from('clientes')
        .select('id, nome, cpf_cnpj, status')
        .in('status', ['ativo', 'inadimplente', 'em_acordo'])
        .order('nome');

      if (error) throw error;
      setClientes(data || []);
    } catch (error) {
      console.error('Erro ao carregar clientes:', error);
      toast({
        title: "Erro",
        description: "Não foi possível carregar a lista de clientes",
        variant: "destructive",
      });
    }
  };

  // Handlers simplificados usando os novos hooks
  const handleDeleteTitulo = async () => {
    if (!tituloToDelete) return;
    await deleteTitulo(tituloToDelete);
    setTituloToDelete(null);
    setIsDeleteModalOpen(false);
    if (selectedTitulo?.id === tituloToDelete.id) {
      setSelectedTitulo(null);
      setIsDetailsModalOpen(false);
    }
  };

  const handleCreateTitulo = async () => {
    if (!validate()) {
      toast({
        title: "Erro",
        description: "Por favor, preencha todos os campos obrigatórios.",
        variant: "destructive",
      });
      return;
    }

    await createTitulo(newTitulo, async () => {
      await fetchTitulos();
      setIsCreateModalOpen(false);
      reset();
    });
  };

  const handleEditTitulo = async () => {
    await updateTitulo(editingTitulo, titulos, async () => {
      await fetchTitulos();
      setIsEditModalOpen(false);
    });
  };

  // Configurar filtros globais
  const {
    filteredData: filteredTitulos,
    filters,
    setFilter,
    clearFilter,
    clearAllFilters,
    hasActiveFilters
  } = useGlobalFilter(titulos, {
    status: (titulo, value) => titulo.status === value,
    cliente: (titulo, value) => {
      if (!value || typeof value !== 'string') return true;
      const searchTerm = value.toLowerCase();
      return titulo.cliente.nome.toLowerCase().includes(searchTerm) ||
             titulo.cliente.cpf_cnpj.toLowerCase().includes(searchTerm);
    },
    vencimento_inicio: (titulo, value) => {
      if (!value) return true;
      return titulo.vencimento >= value;
    },
    vencimento_fim: (titulo, value) => {
      if (!value) return true;
      return titulo.vencimento <= value;
    },
    valor_min: (titulo, value) => {
      if (!value || isNaN(value)) return true;
      return titulo.valor >= parseFloat(value);
    },
    valor_max: (titulo, value) => {
      if (!value || isNaN(value)) return true;
      return titulo.valor <= parseFloat(value);
    },
  });

  // Aplicar busca e filtros
  const searchFilteredTitulos = filteredTitulos.filter(titulo =>
    titulo.cliente.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
    titulo.cliente.cpf_cnpj.includes(searchTerm) ||
    titulo.status.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const titulosParaListagem = searchFilteredTitulos.filter(titulo => !ParcelaUtils.isParcela(titulo));
  const { grupos, titulosIndependentes } = agruparTitulos(titulosParaListagem);

  // Componente para renderizar linha da tabela desktop
  const renderTableRow = (groupId: string, grupo: { principal: Titulo | null; parcelas: Titulo[] }) => {
    const isExpanded = expandedGroups.has(groupId);
    const principal = grupo.principal;
    
    if (!principal) return null;

    const parcelas = ParcelaUtils.buscarParcelas(titulos, principal.id);
    const totalParcelas = parcelas.length;
    const parcelasPagas = parcelas.filter(p => p.status === 'pago').length;
    const statusTituloPai = ParcelaUtils.calcularStatusTituloPai(titulos, principal.id);

    return (
      <React.Fragment key={groupId}>
        {/* Linha Principal */}
        <TableRow className="border-b-2 border-gray-200 bg-gray-50">
          <TableCell className="font-medium">
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => toggleGroup(groupId)}
                className="h-6 w-6 p-0"
              >
                {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              </Button>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold">{principal.cliente.nome}</span>
                  <Badge variant="outline" className="text-xs bg-amber-50 text-amber-700 border-amber-200">
                    {totalParcelas} parcelas
                  </Badge>
                  {parcelasPagas > 0 && (
                    <Badge variant="outline" className="text-xs bg-green-50 text-green-700 border-green-200">
                      {parcelasPagas}/{totalParcelas} pagas
                    </Badge>
                  )}
                </div>
                <div className="text-xs text-muted-foreground md:hidden">{principal.cliente.cpf_cnpj}</div>
              </div>
            </div>
          </TableCell>
          <TableCell className="hidden md:table-cell">{principal.cliente.cpf_cnpj}</TableCell>
          <TableCell>
            <div>
              <div className="font-semibold">{FormatUtils.currency(principal.valor)}</div>
              <div className="text-xs text-muted-foreground">
                {totalParcelas}x de {FormatUtils.currency(parcelas[0]?.valor || 0)}
              </div>
              <div className="text-xs text-muted-foreground lg:hidden">
                {parcelas[0] ? FormatUtils.date(parcelas[0].vencimento) : ''}
              </div>
            </div>
          </TableCell>
          <TableCell className="hidden lg:table-cell">
            <div className="text-sm">
              {parcelas[0] ? FormatUtils.date(parcelas[0].vencimento) : ''}
              {parcelas.length > 1 && (
                <div className="text-xs text-muted-foreground">
                  até {FormatUtils.date(parcelas[parcelas.length - 1].vencimento)}
                </div>
              )}
            </div>
          </TableCell>
          <TableCell>
            <StatusBadge titulo={{ ...principal, status: statusTituloPai }} />
          </TableCell>
          <TableCell>
            <div className="flex gap-1">
              <Button variant="ghost" size="sm" onClick={() => {
                setSelectedTitulo(principal);
                setIsDetailsModalOpen(true);
              }}>
                <Eye className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="sm" onClick={() => {
                setEditingTitulo({
                  id: principal.id,
                  cliente_id: principal.cliente_id,
                  valor: principal.valor,
                  vencimento: FormatUtils.dateToInput(principal.vencimento),
                  status: principal.status,
                  observacoes: principal.observacoes || ''
                });
                setIsEditModalOpen(true);
              }}>
                <Edit className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="sm" onClick={() => {
                setTituloToDelete(principal);
                setIsDeleteModalOpen(true);
              }}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </TableCell>
        </TableRow>
        
        {/* Parcelas expandidas */}
        {isExpanded && parcelas.map((parcela) => (
          <TableRow key={parcela.id} className="bg-blue-50/30">
            <TableCell className="font-medium pl-12">
              <div className="flex items-center gap-2">
                <span className="text-sm">↳ {parcela.cliente.nome}</span>
                <Badge variant="outline" className="text-xs bg-blue-50 text-blue-700 border-blue-200">
                  {parcela.numero_parcela}/{parcela.total_parcelas}
                </Badge>
              </div>
            </TableCell>
            <TableCell className="hidden md:table-cell text-muted-foreground">
              {parcela.cliente.cpf_cnpj}
            </TableCell>
            <TableCell>
              <div>
                <div>{FormatUtils.currency(parcela.valor)}</div>
                <div className="text-xs text-muted-foreground lg:hidden">{FormatUtils.date(parcela.vencimento)}</div>
              </div>
            </TableCell>
            <TableCell className="hidden lg:table-cell">{FormatUtils.date(parcela.vencimento)}</TableCell>
            <TableCell>
              <StatusBadge titulo={parcela} />
            </TableCell>
            <TableCell>
              <div className="flex gap-1">
                <Button variant="ghost" size="sm" onClick={() => {
                  setSelectedTitulo(parcela);
                  setIsDetailsModalOpen(true);
                }}>
                  <Eye className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="sm" onClick={() => {
                  setEditingTitulo({
                    id: parcela.id,
                    cliente_id: parcela.cliente_id,
                    valor: parcela.valor,
                    vencimento: FormatUtils.dateToInput(parcela.vencimento),
                    status: parcela.status,
                    observacoes: parcela.observacoes || ''
                  });
                  setIsEditModalOpen(true);
                }}>
                  <Edit className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="sm" onClick={() => {
                  setTituloToDelete(parcela);
                  setIsDeleteModalOpen(true);
                }}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </TableCell>
          </TableRow>
        ))}
      </React.Fragment>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold">Títulos</h1>
          <p className="text-muted-foreground text-sm sm:text-base">Gerencie os títulos de cobrança</p>
        </div>
        <Button 
          onClick={() => setIsCreateModalOpen(true)} 
          className="self-start sm:self-auto"
        >
          <Plus className="h-4 w-4 mr-2" />
          <span className="hidden sm:inline">Novo Título</span>
          <span className="sm:hidden">Novo</span>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Lista de Títulos</CardTitle>
          <CardDescription>
            {(() => {
              const totalGrupos = Object.keys(grupos).length;
              const totalIndependentes = titulosIndependentes.length;
              const totalTitulos = searchFilteredTitulos.length;
              
              if (totalGrupos > 0) {
                return `${totalTitulos} títulos • ${totalGrupos} parcelamentos • ${totalIndependentes} únicos`;
              }
              return `Total de ${totalTitulos} títulos cadastrados`;
            })()}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-6 mb-6">
            {/* Busca por texto e controles principais */}
            <div className="space-y-4">
              <div className="flex flex-col lg:flex-row gap-4">
                {/* Busca por texto */}
                <div className="flex-1">
                  <Label htmlFor="search" className="text-sm font-medium text-gray-700 mb-2 block">
                    Busca rápida
                  </Label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                    <Input
                      id="search"
                      placeholder="Digite o nome do cliente, CPF/CNPJ ou status..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-10 h-10 border-gray-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                    />
                    {searchTerm && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setSearchTerm('')}
                        className="absolute right-2 top-1/2 transform -translate-y-1/2 h-6 w-6 p-0 text-gray-400 hover:text-gray-600"
                      >
                        ✕
                      </Button>
                    )}
                  </div>
                </div>

                {/* Controles de visualização */}
                <div className="flex flex-col sm:flex-row gap-3 lg:items-end">
                  <div className="space-y-2 lg:space-y-0">
                    <Label className="text-sm font-medium text-gray-700 block lg:hidden">
                      Controles
                    </Label>
                    <div className="flex gap-2">
                      {/* Botão de Filtros */}
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => setShowFilters(!showFilters)}
                        className={`h-10 border-gray-200 hover:bg-gray-50 hover:border-gray-300 ${
                          hasActiveFilters ? 'bg-blue-50 border-blue-200 text-blue-700' : ''
                        }`}
                      >
                        <Search className="h-4 w-4 mr-2" />
                        <span className="hidden sm:inline">Filtros</span>
                        <span className="sm:hidden">Filtrar</span>
                        {hasActiveFilters && (
                          <div className="ml-2 h-2 w-2 bg-blue-500 rounded-full"></div>
                        )}
                      </Button>

                      {/* Botão Expandir/Colapsar Grupos */}
                      {Object.keys(grupos).length > 0 && (
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => {
                            const allGroupIds = Object.keys(grupos);
                            if (expandedGroups.size === allGroupIds.length) {
                              setExpandedGroups(new Set());
                            } else {
                              setExpandedGroups(new Set(allGroupIds));
                            }
                          }}
                          className="h-10 border-gray-200 hover:bg-gray-50 hover:border-gray-300"
                        >
                          {expandedGroups.size === Object.keys(grupos).length ? (
                            <>
                              <ChevronDown className="h-4 w-4 mr-2" />
                              <span className="hidden sm:inline">Colapsar Todos</span>
                              <span className="sm:hidden">Colapsar</span>
                            </>
                          ) : (
                            <>
                              <ChevronRight className="h-4 w-4 mr-2" />
                              <span className="hidden sm:inline">Expandir Todos</span>
                              <span className="sm:hidden">Expandir</span>
                            </>
                          )}
                        </Button>
                      )}

                      {/* Botão Limpar Filtros */}
                      {hasActiveFilters && (
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={clearAllFilters}
                          className="h-10 text-red-600 border-red-200 hover:bg-red-50 hover:border-red-300"
                        >
                          <span className="hidden sm:inline">Limpar Filtros</span>
                          <span className="sm:hidden">Limpar</span>
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Indicadores de filtros ativos */}
              {(hasActiveFilters || searchTerm) && (
                <div className="flex flex-wrap items-center gap-2 p-3 bg-blue-50 rounded-lg border border-blue-200">
                  <span className="text-xs font-medium text-blue-700">Filtros ativos:</span>
                  
                  {searchTerm && (
                    <div className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded-md">
                      <Search className="h-3 w-3" />
                      <span>"{searchTerm}"</span>
                      <button
                        onClick={() => setSearchTerm('')}
                        className="ml-1 text-blue-600 hover:text-blue-800"
                      >
                        ✕
                      </button>
                    </div>
                  )}
                  
                  {Object.entries(filters).map(([key, value]) => {
                    if (!value) return null;
                    const config = titulosFilterConfig.find(c => c.id === key);
                    if (!config) return null;
                    
                    let displayValue = value;
                    if (config.type === 'select' && config.options) {
                      const option = config.options.find(opt => opt.value === value);
                      displayValue = option?.label || value;
                    } else if (config.type === 'date') {
                      displayValue = new Date(value as string).toLocaleDateString('pt-BR');
                    } else if (config.type === 'number') {
                      displayValue = `R$ ${parseFloat(value as string).toFixed(2).replace('.', ',')}`;
                    }
                    
                    return (
                      <div
                        key={key}
                        className="inline-flex items-center gap-1 px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded-md"
                      >
                        <span>{config.label}: {displayValue}</span>
                        <button
                          onClick={() => clearFilter(key)}
                          className="ml-1 text-gray-500 hover:text-gray-700"
                        >
                          ✕
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Filtros sempre visíveis */}
            {showFilters && (
              <GlobalFilter
                configs={titulosFilterConfig}
                filters={filters}
                onFilterChange={setFilter}
                onClearFilter={clearFilter}
                onClearAll={clearAllFilters}
                hasActiveFilters={hasActiveFilters}
              />
            )}

            {/* Resumo dos resultados */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-sm text-gray-600 pt-2 border-t border-gray-100">
              <div className="flex items-center gap-4">
                <span>
                  {(() => {
                    const totalGrupos = Object.keys(grupos).length;
                    const totalIndependentes = titulosIndependentes.length;
                    const totalTitulos = searchFilteredTitulos.length;
                    const totalOriginal = titulos.filter(t => !ParcelaUtils.isParcela(t)).length;
                    
                    if (totalTitulos !== totalOriginal) {
                      return (
                        <>
                          <span className="font-medium">{totalTitulos}</span> de {totalOriginal} títulos
                          {totalGrupos > 0 && (
                            <> • <span className="font-medium">{totalGrupos}</span> parcelamentos</>
                          )}
                        </>
                      );
                    }
                    
                    if (totalGrupos > 0) {
                      return (
                        <>
                          <span className="font-medium">{totalTitulos}</span> títulos • 
                          <span className="font-medium">{totalGrupos}</span> parcelamentos • 
                          <span className="font-medium">{totalIndependentes}</span> únicos
                        </>
                      );
                    }
                    return (
                      <>
                        Total de <span className="font-medium">{totalTitulos}</span> títulos cadastrados
                      </>
                    );
                  })()}
                </span>
              </div>
              
              {(hasActiveFilters || searchTerm) && (
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-blue-600">Filtros aplicados</span>
                  <div className="h-2 w-2 bg-blue-500 rounded-full"></div>
                </div>
              )}
            </div>
          </div>

          {/* Mobile Card View usando TituloCard */}
          <div className="block sm:hidden space-y-4">
            {/* Grupos de títulos parcelados */}
            {Object.entries(grupos).map(([groupId, grupo]) => {
              const principal = grupo.principal;
              if (!principal) return null;

              const parcelas = ParcelaUtils.buscarParcelas(titulos, principal.id);
              const isExpanded = expandedGroups.has(groupId);

              return (
                <TituloCard
                  key={groupId}
                  titulo={principal}
                  parcelas={parcelas}
                  isExpanded={isExpanded}
                  onToggleExpansion={() => toggleGroup(groupId)}
                  onView={(titulo) => {
                    setSelectedTitulo(titulo);
                    setIsDetailsModalOpen(true);
                  }}
                  onEdit={(titulo) => {
                    setEditingTitulo({
                      id: titulo.id,
                      cliente_id: titulo.cliente_id,
                      valor: titulo.valor,
                      vencimento: FormatUtils.dateToInput(titulo.vencimento),
                      status: titulo.status,
                      observacoes: titulo.observacoes || ''
                    });
                    setIsEditModalOpen(true);
                  }}
                  onDelete={(titulo) => {
                    setTituloToDelete(titulo);
                    setIsDeleteModalOpen(true);
                  }}
                />
              );
            })}

            {/* Títulos independentes */}
            {titulosIndependentes.map((titulo) => (
              <TituloCard
                key={titulo.id}
                titulo={titulo}
                onView={(titulo) => {
                  setSelectedTitulo(titulo);
                  setIsDetailsModalOpen(true);
                }}
                onEdit={(titulo) => {
                  setEditingTitulo({
                    id: titulo.id,
                    cliente_id: titulo.cliente_id,
                    valor: titulo.valor,
                    vencimento: FormatUtils.dateToInput(titulo.vencimento),
                    status: titulo.status,
                    observacoes: titulo.observacoes || ''
                  });
                  setIsEditModalOpen(true);
                }}
                onDelete={(titulo) => {
                  setTituloToDelete(titulo);
                  setIsDeleteModalOpen(true);
                }}
              />
            ))}
          </div>

          {/* Desktop Table View */}
          <div className="hidden sm:block rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cliente</TableHead>
                  <TableHead className="hidden md:table-cell">CPF/CNPJ</TableHead>
                  <TableHead>Valor</TableHead>
                  <TableHead className="hidden lg:table-cell">Vencimento</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {/* Grupos de títulos parcelados */}
                {Object.entries(grupos).map(([groupId, grupo]) => 
                  renderTableRow(groupId, grupo)
                )}
                
                {/* Títulos independentes */}
                {titulosIndependentes.map((titulo) => (
                  <TableRow key={titulo.id}>
                    <TableCell className="font-medium">
                      <div>
                        <div className="flex items-center gap-2">
                          <span>{titulo.cliente.nome}</span>
                          <Badge variant="outline" className="text-xs bg-gray-50 text-gray-700 border-gray-200">
                            Único
                          </Badge>
                        </div>
                        <div className="text-xs text-muted-foreground md:hidden">{titulo.cliente.cpf_cnpj}</div>
                      </div>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">{titulo.cliente.cpf_cnpj}</TableCell>
                    <TableCell>
                      <div>
                        <div>{FormatUtils.currency(titulo.valor)}</div>
                        <div className="text-xs text-muted-foreground lg:hidden">{FormatUtils.date(titulo.vencimento)}</div>
                      </div>
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">{FormatUtils.date(titulo.vencimento)}</TableCell>
                    <TableCell>
                      <StatusBadge titulo={titulo} />
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="sm" onClick={() => {
                          setSelectedTitulo(titulo);
                          setIsDetailsModalOpen(true);
                        }}>
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => {
                          setEditingTitulo({
                            id: titulo.id,
                            cliente_id: titulo.cliente_id,
                            valor: titulo.valor,
                            vencimento: FormatUtils.dateToInput(titulo.vencimento),
                            status: titulo.status,
                            observacoes: titulo.observacoes || ''
                          });
                          setIsEditModalOpen(true);
                        }}>
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="sm"
                          onClick={() => {
                            setTituloToDelete(titulo);
                            setIsDeleteModalOpen(true);
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Modais usando TituloForm */}
      <Dialog open={isCreateModalOpen} onOpenChange={setIsCreateModalOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Novo Título</DialogTitle>
            <DialogDescription>
              Crie um novo título para cobrança
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <TituloForm
              formData={newTitulo}
              errors={formErrors}
              clientes={clientes}
              onFieldChange={updateField}
            />
          </div>
          <DialogFooter>
            <Button onClick={handleCreateTitulo}>Criar Título</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal de Edição */}
      <Dialog open={isEditModalOpen} onOpenChange={setIsEditModalOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Editar Título</DialogTitle>
            <DialogDescription>
              {(() => {
                const tituloAtual = titulos.find(t => t.id === editingTitulo.id);
                if (!tituloAtual) {
                  return "Título não encontrado";
                }
                
                const isParcela = ParcelaUtils.isParcela(tituloAtual);
                const isTituloPai = ParcelaUtils.isTituloPai(tituloAtual);
                
                if (isParcela) {
                  return "Editando parcela - apenas status e observações podem ser alterados";
                }
                if (isTituloPai) {
                  return "Editando título parcelado - apenas observações podem ser alteradas";
                }
                return "Atualize os dados do título";
              })()}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            {(() => {
              const tituloAtual = titulos.find(t => t.id === editingTitulo.id);
              if (!tituloAtual) {
                return <div>Título não encontrado</div>;
              }
              
              const isParcela = ParcelaUtils.isParcela(tituloAtual);
              const isTituloPai = ParcelaUtils.isTituloPai(tituloAtual);
              
              if (isParcela || isTituloPai) {
                return (
                  <div className="grid gap-4">
                    <div className="grid gap-2">
                      <Label>Cliente</Label>
                      <div className="p-2 bg-muted rounded-md text-sm">
                        {tituloAtual?.cliente.nome} - {tituloAtual?.cliente.cpf_cnpj}
                      </div>
                    </div>

                    <div className="grid gap-2">
                      <Label>Valor</Label>
                      <div className="p-2 bg-muted rounded-md text-sm">
                        {FormatUtils.currency(editingTitulo.valor)}
                      </div>
                    </div>

                    <div className="grid gap-2">
                      <Label>Vencimento</Label>
                      <div className="p-2 bg-muted rounded-md text-sm">
                        {FormatUtils.date(editingTitulo.vencimento)}
                      </div>
                    </div>

                    {isParcela && (
                      <div className="grid gap-2">
                        <Label htmlFor="edit-status">Status</Label>
                        <select
                          id="edit-status"
                          value={editingTitulo.status}
                          onChange={(e) => setEditingTitulo({ 
                            ...editingTitulo, 
                            status: e.target.value as 'em_aberto' | 'pago' | 'vencido' | 'acordo' 
                          })}
                          className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
                        >
                          <option value="em_aberto">Em Aberto</option>
                          <option value="pago">Pago</option>
                          <option value="vencido">Vencido</option>
                          <option value="acordo">Em Acordo</option>
                        </select>
                      </div>
                    )}

                    <div className="grid gap-2">
                      <Label htmlFor="edit-observacoes">Observações</Label>
                      <Input
                        id="edit-observacoes"
                        value={editingTitulo.observacoes || ''}
                        onChange={(e) => setEditingTitulo({ ...editingTitulo, observacoes: e.target.value })}
                      />
                    </div>

                    {isTituloPai && (
                      <div className="p-3 bg-yellow-50 rounded-lg border border-yellow-200">
                        <p className="text-xs font-medium text-yellow-800">Aviso:</p>
                        <p className="text-xs text-yellow-700">
                          Para títulos parcelados, apenas as observações podem ser editadas. 
                          Para alterar valores ou datas, edite as parcelas individualmente.
                        </p>
                      </div>
                    )}
                  </div>
                );
              }

              // Formulário completo para títulos únicos
              return (
                <div className="grid gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="edit-cliente">Cliente</Label>
                    <select
                      id="edit-cliente"
                      value={editingTitulo.cliente_id}
                      onChange={(e) => setEditingTitulo({ ...editingTitulo, cliente_id: e.target.value })}
                      className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
                    >
                      {clientes.map((cliente) => (
                        <option key={cliente.id} value={cliente.id}>
                          {cliente.nome} - {cliente.cpf_cnpj}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="edit-valor">Valor</Label>
                    <Input
                      id="edit-valor"
                      type="number"
                      step="0.01"
                      min="0"
                      value={editingTitulo.valor}
                      onChange={(e) => setEditingTitulo({ ...editingTitulo, valor: parseFloat(e.target.value) || 0 })}
                    />
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="edit-vencimento">Data de Vencimento</Label>
                    <Input
                      id="edit-vencimento"
                      type="date"
                      value={editingTitulo.vencimento}
                      onChange={(e) => setEditingTitulo({ ...editingTitulo, vencimento: e.target.value })}
                    />
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="edit-status">Status</Label>
                    <select
                      id="edit-status"
                      value={editingTitulo.status}
                      onChange={(e) => setEditingTitulo({ 
                        ...editingTitulo, 
                        status: e.target.value as 'em_aberto' | 'pago' | 'vencido' | 'acordo' 
                      })}
                      className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
                    >
                      <option value="em_aberto">Em Aberto</option>
                      <option value="pago">Pago</option>
                      <option value="vencido">Vencido</option>
                      <option value="acordo">Em Acordo</option>
                    </select>
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="edit-observacoes">Observações</Label>
                    <Input
                      id="edit-observacoes"
                      value={editingTitulo.observacoes || ''}
                      onChange={(e) => setEditingTitulo({ ...editingTitulo, observacoes: e.target.value })}
                    />
                  </div>
                </div>
              );
            })()}
          </div>
          <DialogFooter>
            <Button onClick={handleEditTitulo}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal de Detalhes */}
      <Dialog open={isDetailsModalOpen} onOpenChange={setIsDetailsModalOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Detalhes do Título</DialogTitle>
          </DialogHeader>
          {selectedTitulo && (
            <div className="space-y-4">
              <div>
                <Label className="text-sm font-medium">Cliente</Label>
                <p className="text-sm">{selectedTitulo.cliente.nome}</p>
                <p className="text-xs text-muted-foreground">{selectedTitulo.cliente.cpf_cnpj}</p>
                
                {ParcelaUtils.isParcela(selectedTitulo) && (
                  <div className="mt-2 space-y-2">
                    <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                      Parcela {selectedTitulo.numero_parcela} de {selectedTitulo.total_parcelas}
                    </Badge>
                    <div className="p-3 bg-blue-50 rounded-lg">
                      <p className="text-xs font-medium text-blue-800">Informações do Parcelamento:</p>
                      <p className="text-xs text-blue-700">
                        Valor original da dívida: {FormatUtils.currency(selectedTitulo.valor_original || 0)}
                      </p>
                      <p className="text-xs text-blue-700">
                        ID do título principal: {selectedTitulo.titulo_pai_id}
                      </p>
                    </div>
                  </div>
                )}

                {ParcelaUtils.isTituloPai(selectedTitulo) && (
                  <div className="mt-2 space-y-2">
                    <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                      Título Principal ({selectedTitulo.total_parcelas} parcelas)
                    </Badge>
                    <div className="p-3 bg-green-50 rounded-lg">
                      <p className="text-xs font-medium text-green-800">Dívida Parcelada:</p>
                      <p className="text-xs text-green-700">
                        Total: {FormatUtils.currency(selectedTitulo.valor)} em {selectedTitulo.total_parcelas} parcelas
                      </p>
                      <p className="text-xs text-green-700">
                        Valor por parcela: {FormatUtils.currency((selectedTitulo.valor || 0) / (selectedTitulo.total_parcelas || 1))}
                      </p>
                    </div>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-sm font-medium">Valor</Label>
                  <p className="text-sm">{FormatUtils.currency(selectedTitulo.valor)}</p>
                </div>
                <div>
                  <Label className="text-sm font-medium">Vencimento</Label>
                  <p className="text-sm">{FormatUtils.date(selectedTitulo.vencimento)}</p>
                </div>
              </div>

              <div>
                <Label className="text-sm font-medium">Status</Label>
                <Badge className={StatusUtils.getColor(selectedTitulo.status)}>
                  {StatusUtils.getLabel(selectedTitulo.status)}
                </Badge>
              </div>

              {selectedTitulo.observacoes && (
                <div>
                  <Label className="text-sm font-medium">Observações</Label>
                  <p className="text-sm text-muted-foreground">{selectedTitulo.observacoes}</p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Modal de Exclusão */}
      <Dialog open={isDeleteModalOpen} onOpenChange={setIsDeleteModalOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Confirmar Exclusão</DialogTitle>
            <DialogDescription>
              {(() => {
                if (!tituloToDelete) return "Você tem certeza que deseja excluir este título?";
                
                const isTituloPai = ParcelaUtils.isTituloPai(tituloToDelete);
                
                if (isTituloPai) {
                  return (
                    <>
                      <strong>Este é um título parcelado.</strong> Excluir este título também excluirá todas as {tituloToDelete.total_parcelas} parcelas associadas.
                      <br /><br />
                      Você tem certeza que deseja continuar?
                    </>
                  );
                }
                
                return "Você tem certeza que deseja excluir este título?";
              })()}
              
              {tituloToDelete && (
                <div className="mt-4 rounded-md border bg-muted p-3 text-sm">
                  <p><span className="font-semibold">Cliente:</span> {tituloToDelete.cliente.nome}</p>
                  <p><span className="font-semibold">Valor:</span> {FormatUtils.currency(tituloToDelete.valor)}</p>
                  <p><span className="font-semibold">Vencimento:</span> {FormatUtils.date(tituloToDelete.vencimento)}</p>
                  {ParcelaUtils.isTituloPai(tituloToDelete) && (
                    <p><span className="font-semibold">Parcelas:</span> {tituloToDelete.total_parcelas}</p>
                  )}
                </div>
              )}
              Esta ação não pode ser desfeita.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setIsDeleteModalOpen(false);
              setTituloToDelete(null);
            }}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={handleDeleteTitulo}>
              Excluir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}