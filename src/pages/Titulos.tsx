import { PageHeader } from '@/components/PageHeader';
import { CarregandoConteudo } from '@/components/TelaCarregamento';
import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Plus, Eye, ChevronDown, ChevronRight, User, Trash2, MoreHorizontal, DollarSign, Percent, Tag, MessageSquare, Mail, XCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import {
  useTitulos,
  useClientesSelect,
  useParcelasByTitulo,
  useCreateTitulo,
  useHardDeleteTitulos,
  useCancelarTitulo,
  useEstornarPagamento,
  usePagamentosByParcelas,
  titulosKeys,
  type PagamentoEvento,
} from '@/lib/queries/titulos';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { GlobalFilter } from '@/components/GlobalFilter';
import { ConfirmarAcaoDestrutiva } from '@/components/ConfirmarAcaoDestrutiva';
import { useGlobalFilter } from '@/hooks/useGlobalFilter';
import { usePagination, PARAM_PAGINA } from '@/hooks/usePagination';
import { useAbrirFicha } from '@/hooks/useFilaNavegacao';
import { TablePagination } from '@/components/TablePagination';
import { titulosFilterConfig } from '@/constants/filterConfigs';
import { titulosPresets } from '@/constants/filterPresets';
import { createClienteAgrupadoFilterFunctions, casaTexto } from '@/utils/filterFunctions';
import { useCobradores } from '@/lib/queries/cobradores';
import { useVendedores } from '@/lib/queries/vendedores';
import { formatCpfCnpj, soDigitos } from '@/utils/format';
import { hojeIso } from '@/domain/telecobranca/statusCobranca';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { TituloConsolidado, Parcela, FormatUtils, ParcelaUtils } from '@/utils/titulo';
import { StatusBadge } from '@/components/StatusBadge';
import { SelecionarCliente } from '@/components/SelecionarCliente';
import { derivarStatusCliente, type SituacaoCliente } from '@/domain/clientes/situacao';
import { RegistrarPagamentoModal } from '@/components/titulos/RegistrarPagamentoModal';
import { AplicarEncargoModal } from '@/components/titulos/AplicarEncargoModal';
import { ConcederDescontoModal } from '@/components/titulos/ConcederDescontoModal';
import { useAuth } from '@/contexts/AuthContext';
import { useUserRole } from '@/hooks/useUserRole';

// Extrai a mensagem de um erro desconhecido, com fallback para o toast.
const msgErro = (error: unknown, fallback: string) =>
  error instanceof Error ? error.message : fallback;

interface ClienteAgrupado {
  id: string;
  nome: string;
  cpf_cnpj: string;
  telefone: string | null;
  email: string | null;
  cobrador_id: string | null;
  vendedor_id: string | null;
  titulos: TituloConsolidado[];
  totalSaldo: number;
  totalOriginal: number;
  qtdTitulos: number;
  temInadimplente: boolean;
  /** Mesma regra da tela de Clientes (domain/clientes/situacao). */
  situacao: SituacaoCliente;
}

// ===================== Agrupamento por cliente =====================
function criarClienteAgrupado(titulo: TituloConsolidado, clienteId: string): ClienteAgrupado {
  return {
    id: clienteId,
    nome: titulo.cliente_nome || '',
    cpf_cnpj: titulo.cliente_cpf_cnpj || '',
    telefone: titulo.cliente_telefone || null,
    email: titulo.cliente_email || null,
    cobrador_id: titulo.cobrador_id ?? null,
    vendedor_id: titulo.vendedor_id ?? null,
    titulos: [],
    totalSaldo: 0,
    totalOriginal: 0,
    qtdTitulos: 0,
    temInadimplente: false,
    situacao: 'ativo',
  };
}

function agruparTitulosPorCliente(titulos: TituloConsolidado[]): ClienteAgrupado[] {
  const map = new Map<string, ClienteAgrupado>();
  for (const titulo of titulos) {
    const clienteId = titulo.cliente_id;
    if (!clienteId) continue;
    if (!map.has(clienteId)) map.set(clienteId, criarClienteAgrupado(titulo, clienteId));
    const cliente = map.get(clienteId)!;
    cliente.titulos.push(titulo);
    cliente.totalSaldo += titulo.saldo_devedor || 0;
    cliente.totalOriginal += titulo.valor_original || 0;
    cliente.qtdTitulos++;
    if (titulo.status === 'vencido') cliente.temInadimplente = true;
  }
  // A situação sai da MESMA regra da tela de Clientes: antes esta tela decidia
  // só entre inadimplente/ativo e o cliente "Em Acordo" aparecia como "Ativo".
  for (const cliente of map.values()) {
    cliente.situacao = derivarStatusCliente(cliente.titulos);
  }
  return Array.from(map.values()).sort((a, b) => b.totalSaldo - a.totalSaldo);
}

// View-model do título: concentra os defaults (|| 0/1) num só lugar.
function tituloView(t: TituloConsolidado) {
  return {
    qtdParcelas: t.quantidade_parcelas || 1,
    temMultiplas: (t.quantidade_parcelas || 0) > 1,
    pagas: t.parcelas_pagas || 0,
    saldo: t.saldo_devedor || 0,
    original: t.valor_original || 0,
    status: t.status || 'a_vencer',
    descricao: t.descricao || 'Título',
  };
}

// ===================== Subcomponentes da árvore cliente/título/parcela =====================
interface TituloRowActions {
  isOperador: boolean;
  isAdmin: boolean;
  expandedTitulos: Set<string>;
  parcelasTitulo: Parcela[];
  onToggleTitulo: (id: string) => void;
  onDetails: (t: TituloConsolidado) => void;
  onPagamento: (p: Parcela) => void;
  onEncargo: (p: Parcela) => void;
  onDesconto: (p: Parcela) => void;
  onCancelarTitulo: (t: TituloConsolidado) => void;
  onHardDelete: (t: TituloConsolidado) => void;
}

function ParcelaRow({ parcela, isOperador, isAdmin, onPagamento, onEncargo, onDesconto }: {
  parcela: Parcela;
  isOperador: boolean;
  isAdmin: boolean;
  onPagamento: (p: Parcela) => void;
  onEncargo: (p: Parcela) => void;
  onDesconto: (p: Parcela) => void;
}) {
  return (
    <TableRow className="bg-muted/20">
      <TableCell></TableCell>
      <TableCell className="pl-12">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">↳</span>
          <span className="text-sm">Parcela #{parcela.numero_parcela}</span>
          <span className="text-xs text-muted-foreground font-mono">
            {FormatUtils.shortId(parcela.id)}
          </span>
          <Badge variant="outline" className="text-xs">
            Venc: {FormatUtils.date(parcela.vencimento)}
          </Badge>
        </div>
      </TableCell>
      <TableCell className="hidden md:table-cell"></TableCell>
      <TableCell>
        <div className="text-sm">
          {FormatUtils.currency(parcela.saldo_atual || 0)}
        </div>
      </TableCell>
      <TableCell className="hidden lg:table-cell">
        {parcela.total_pago > 0 && (
          <span className="text-xs text-primary">
            Pago: {FormatUtils.currency(parcela.total_pago)}
          </span>
        )}
      </TableCell>
      <TableCell>
        <StatusBadge domain="parcela" status={parcela.status || 'a_vencer'} />
      </TableCell>
      <TableCell>
        {parcela.status !== 'pago' && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>
                Parcela #{parcela.numero_parcela}
                <span className="font-mono text-muted-foreground ml-1 text-xs">
                  ({FormatUtils.shortId(parcela.id)})
                </span>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              {isOperador && (
                <DropdownMenuItem onClick={() => onPagamento(parcela)}>
                  <DollarSign className="h-4 w-4 mr-2" />
                  Registrar Pagamento
                </DropdownMenuItem>
              )}
              {isAdmin && (
                <>
                  <DropdownMenuItem onClick={() => onEncargo(parcela)}>
                    <Percent className="h-4 w-4 mr-2" />
                    Adicionar Encargo
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onDesconto(parcela)}>
                    <Tag className="h-4 w-4 mr-2" />
                    Conceder Desconto
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </TableCell>
    </TableRow>
  );
}

/**
 * Nomeia a parcela que a ação do TÍTULO vai atingir.
 *
 * O menu do título opera sobre a primeira parcela em aberto. Antes ele dizia só
 * "Registrar Pagamento" e escolhia a parcela em silêncio — origem provável de
 * baixa lançada no lugar errado, o mesmo erro que o estorno existe para desfazer.
 */
function rotuloParcela(parcela: Parcela, titulo: TituloConsolidado): string {
  const total = titulo.quantidade_parcelas || 1;
  const posicao = total > 1 ? `${parcela.numero_parcela}/${total}` : `${parcela.numero_parcela}`;
  return `parcela ${posicao} · venc. ${FormatUtils.date(parcela.vencimento)}`;
}

// Itens do menu de ação de um título quando há (ou não) parcela pendente.
function TituloPendenteItens({ titulo, actions }: { titulo: TituloConsolidado; actions: TituloRowActions }) {
  const firstParcela = actions.parcelasTitulo.find(p => p.titulo_id === titulo.id && p.status !== 'pago');
  if (!firstParcela) {
    if (!actions.expandedTitulos.has(titulo.id) && (titulo.quantidade_parcelas || 1) > 1) {
      return (
        <DropdownMenuItem onClick={() => actions.onToggleTitulo(titulo.id)}>
          <DollarSign className="h-4 w-4 mr-2" />
          Ver Parcelas
        </DropdownMenuItem>
      );
    }
    return null;
  }
  const alvo = rotuloParcela(firstParcela, titulo);
  return (
    <>
      {actions.isOperador && (
        <DropdownMenuItem onClick={() => actions.onPagamento(firstParcela)}>
          <DollarSign className="h-4 w-4 mr-2" />
          Baixar {alvo}
        </DropdownMenuItem>
      )}
      {actions.isAdmin && (
        <>
          <DropdownMenuItem onClick={() => actions.onEncargo(firstParcela)}>
            <Percent className="h-4 w-4 mr-2" />
            Encargo na {alvo}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => actions.onDesconto(firstParcela)}>
            <Tag className="h-4 w-4 mr-2" />
            Desconto na {alvo}
          </DropdownMenuItem>
        </>
      )}
      {(titulo.quantidade_parcelas || 1) > 1 && !actions.expandedTitulos.has(titulo.id) && (
        <DropdownMenuItem onClick={() => actions.onToggleTitulo(titulo.id)}>
          <ChevronDown className="h-4 w-4 mr-2" />
          Escolher outra parcela
        </DropdownMenuItem>
      )}
    </>
  );
}

function TituloAcoesMenu({ titulo, actions }: { titulo: TituloConsolidado; actions: TituloRowActions }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Ações do Título</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => actions.onDetails(titulo)}>
          <Eye className="h-4 w-4 mr-2" />
          Ver Detalhes
        </DropdownMenuItem>
        {titulo.status !== 'pago' && <TituloPendenteItens titulo={titulo} actions={actions} />}
        {actions.isAdmin && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={() => actions.onCancelarTitulo(titulo)}
            >
              <XCircle className="h-4 w-4 mr-2" />
              Cancelar título
            </DropdownMenuItem>
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={() => actions.onHardDelete(titulo)}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Excluir definitivamente
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function TituloRow({ titulo, actions }: { titulo: TituloConsolidado; actions: TituloRowActions }) {
  const v = tituloView(titulo);
  const expanded = actions.expandedTitulos.has(titulo.id);
  const parcelas = actions.parcelasTitulo.filter(p => p.titulo_id === titulo.id);
  return (
    <React.Fragment>
      <TableRow className="hover:bg-accent/50">
        <TableCell className="pl-8">
          {v.temMultiplas && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => actions.onToggleTitulo(titulo.id)}
              className="h-6 w-6 p-0"
            >
              {expanded ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
            </Button>
          )}
        </TableCell>
        <TableCell>
          <div className="pl-4">
            <div className="flex items-center gap-2">
              {titulo.numero_documento && (
                <span className="font-mono text-xs text-muted-foreground">
                  #{titulo.numero_documento}
                </span>
              )}
              <span className="text-sm">
                {v.descricao}
              </span>
            </div>
            <div className="text-xs text-muted-foreground">
              Venc: {FormatUtils.date(titulo.vencimento_original || '')}
              {v.temMultiplas && (
                <span className="ml-2">
                  ({v.pagas}/{v.qtdParcelas} parcelas pagas)
                </span>
              )}
            </div>
          </div>
        </TableCell>
        <TableCell className="hidden md:table-cell"></TableCell>
        <TableCell>
          <div>
            <div className="font-medium">{FormatUtils.currency(v.saldo)}</div>
            <div className="text-xs text-muted-foreground">
              de {FormatUtils.currency(v.original)}
            </div>
          </div>
        </TableCell>
        <TableCell className="hidden lg:table-cell">
          <div className="text-sm">
            {v.pagas}/{v.qtdParcelas}
          </div>
        </TableCell>
        <TableCell>
          <StatusBadge domain="titulo" status={v.status} />
        </TableCell>
        <TableCell>
          <TituloAcoesMenu titulo={titulo} actions={actions} />
        </TableCell>
      </TableRow>

      {expanded && parcelas.map((parcela) => (
        <ParcelaRow
          key={parcela.id}
          parcela={parcela}
          isOperador={actions.isOperador}
          isAdmin={actions.isAdmin}
          onPagamento={actions.onPagamento}
          onEncargo={actions.onEncargo}
          onDesconto={actions.onDesconto}
        />
      ))}
    </React.Fragment>
  );
}

interface ClienteRowProps {
  cliente: ClienteAgrupado;
  expanded: boolean;
  onToggleCliente: (id: string) => void;
  onOpenFicha: (id: string) => void;
  onWhatsApp: (telefone: string | null, nome: string) => void;
  onEmail: (email: string | null, nome: string) => void;
  actions: TituloRowActions;
}
function ClienteRow({ cliente, expanded, onToggleCliente, onOpenFicha, onWhatsApp, onEmail, actions }: ClienteRowProps) {
  return (
    <React.Fragment>
      <TableRow className="bg-muted/30 hover:bg-muted/50">
        <TableCell>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onToggleCliente(cliente.id)}
            className="h-6 w-6 p-0"
          >
            {expanded ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
          </Button>
        </TableCell>
        <TableCell>
          <div className="flex items-center gap-2">
            <User className="h-4 w-4 text-muted-foreground" />
            <div>
              <button
                type="button"
                onClick={() => onOpenFicha(cliente.id)}
                className="block text-left font-medium hover:text-primary hover:underline transition-colors"
              >
                {cliente.nome}
              </button>
              <div className="text-xs text-muted-foreground md:hidden">
                {formatCpfCnpj(cliente.cpf_cnpj)}
              </div>
            </div>
          </div>
        </TableCell>
        <TableCell className="hidden md:table-cell">
          {formatCpfCnpj(cliente.cpf_cnpj)}
        </TableCell>
        <TableCell>
          <div>
            <div className="font-medium">{FormatUtils.currency(cliente.totalSaldo)}</div>
            <div className="text-xs text-muted-foreground">
              de {FormatUtils.currency(cliente.totalOriginal)}
            </div>
          </div>
        </TableCell>
        <TableCell className="hidden lg:table-cell">
          <Badge variant="outline">{cliente.qtdTitulos} título(s)</Badge>
        </TableCell>
        <TableCell>
          <StatusBadge domain="cliente" status={cliente.situacao} />
        </TableCell>
        <TableCell>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Ações do Cliente</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => onOpenFicha(cliente.id)}>
                <Eye className="h-4 w-4 mr-2" />
                Abrir ficha
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onWhatsApp(cliente.telefone, cliente.nome)}>
                <MessageSquare className="h-4 w-4 mr-2" />
                WhatsApp
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onEmail(cliente.email, cliente.nome)}>
                <Mail className="h-4 w-4 mr-2" />
                E-mail
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </TableCell>
      </TableRow>

      {expanded && cliente.titulos.map((titulo) => (
        <TituloRow key={titulo.id} titulo={titulo} actions={actions} />
      ))}
    </React.Fragment>
  );
}

type NovoTituloForm = {
  cliente_id: string; valor_original: number; vencimento_original: string; descricao: string;
  numero_documento: string; numero_parcelas: number; intervalo_dias: number;
};
interface NovoTituloDialogProps {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  novoTitulo: NovoTituloForm;
  setNovoTitulo: React.Dispatch<React.SetStateAction<NovoTituloForm>>;
  clientes: { id: string; nome: string; cpf_cnpj: string }[];
  onCancel: () => void;
  onCreate: () => void;
}
function NovoTituloDialog({ open, onOpenChange, novoTitulo, setNovoTitulo, clientes, onCancel, onCreate }: NovoTituloDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Novo Título</DialogTitle>
          <DialogDescription>
            Crie um novo título de cobrança
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Cliente</Label>
            <SelecionarCliente
              clientes={clientes}
              value={novoTitulo.cliente_id}
              onChange={(id) => setNovoTitulo(prev => ({ ...prev, cliente_id: id }))}
            />
          </div>
          <div className="space-y-2">
            <Label>Código do Documento</Label>
            <Input
              placeholder="Deixe vazio para gerar automático (TIT-00001)"
              value={novoTitulo.numero_documento}
              onChange={(e) => setNovoTitulo(prev => ({ ...prev, numero_documento: e.target.value }))}
            />
            <p className="text-xs text-muted-foreground">
              Se não informado, será gerado automaticamente (TIT-XXXXX)
            </p>
          </div>
          <div className="space-y-2">
            <Label>Valor Total</Label>
            <Input
              type="number"
              step="0.01"
              value={novoTitulo.valor_original}
              onChange={(e) => setNovoTitulo(prev => ({ ...prev, valor_original: parseFloat(e.target.value) || 0 }))}
            />
          </div>
          <div className="space-y-2">
            <Label>Data de Vencimento</Label>
            <Input
              type="date"
              value={novoTitulo.vencimento_original}
              onChange={(e) => setNovoTitulo(prev => ({ ...prev, vencimento_original: e.target.value }))}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Nº de Parcelas</Label>
              <Input
                type="number"
                min="1"
                value={novoTitulo.numero_parcelas}
                onChange={(e) => setNovoTitulo(prev => ({ ...prev, numero_parcelas: parseInt(e.target.value) || 1 }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Intervalo (dias)</Label>
              <Input
                type="number"
                min="1"
                value={novoTitulo.intervalo_dias}
                onChange={(e) => setNovoTitulo(prev => ({ ...prev, intervalo_dias: parseInt(e.target.value) || 30 }))}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Descrição (opcional)</Label>
            <Input
              value={novoTitulo.descricao}
              onChange={(e) => setNovoTitulo(prev => ({ ...prev, descricao: e.target.value }))}
            />
          </div>
          {novoTitulo.numero_parcelas > 1 && novoTitulo.valor_original > 0 && (
            <div className="p-3 bg-primary/10 rounded-lg text-sm">
              <p className="font-medium text-primary">Preview:</p>
              <p className="text-primary/80">
                {novoTitulo.numero_parcelas}x de {FormatUtils.currency(ParcelaUtils.calcularValor(novoTitulo.valor_original, novoTitulo.numero_parcelas))}
              </p>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            Cancelar
          </Button>
          <Button onClick={onCreate}>
            Criar Título
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Ação por pagamento: badge "Estornado" ou botão "Estornar" (financeiro+).
function PagamentoAcao({ estornado, podeEstornar, onIniciarEstorno }: {
  estornado: boolean;
  podeEstornar: boolean;
  onIniciarEstorno: () => void;
}) {
  if (estornado) return <Badge variant="outline" className="text-xs">Estornado</Badge>;
  if (podeEstornar) {
    return (
      <Button variant="ghost" size="sm" className="h-8" onClick={onIniciarEstorno}>
        Estornar
      </Button>
    );
  }
  return null;
}

interface PagamentoItemProps {
  pagamento: PagamentoEvento;
  isAdmin: boolean;
  emEstorno: boolean;
  motivo: string;
  isPending: boolean;
  onIniciarEstorno: () => void;
  onMotivoChange: (v: string) => void;
  onConfirmar: () => void;
  onCancelar: () => void;
}
function PagamentoItem({
  pagamento, isAdmin, emEstorno, motivo, isPending,
  onIniciarEstorno, onMotivoChange, onConfirmar, onCancelar,
}: PagamentoItemProps) {
  return (
    <div className="p-3 border rounded-lg text-sm">
      <div className="flex justify-between items-center gap-3">
        <div>
          <span className="font-medium">{FormatUtils.currency(pagamento.valor)}</span>
          {pagamento.meio_pagamento && (
            <span className="text-muted-foreground ml-2">via {pagamento.meio_pagamento}</span>
          )}
          <div className="text-xs text-muted-foreground">
            Data do pagamento: {pagamento.created_at ? FormatUtils.date(pagamento.created_at) : '—'}
          </div>
        </div>
        <PagamentoAcao
          estornado={!!pagamento.estornado}
          podeEstornar={isAdmin && !emEstorno}
          onIniciarEstorno={onIniciarEstorno}
        />
      </div>
      {emEstorno && (
        <div className="mt-3 space-y-2 border-t pt-3">
          <Label className="text-xs">Motivo do estorno (obrigatório)</Label>
          <Textarea
            value={motivo}
            onChange={(e) => onMotivoChange(e.target.value)}
            placeholder="Ex: baixa lançada na parcela errada"
          />
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={onCancelar} disabled={isPending}>
              Voltar
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={onConfirmar}
              disabled={isPending || !motivo.trim()}
            >
              {isPending ? 'Estornando...' : 'Confirmar estorno'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// Histórico de baixas do título (data/valor/meio) + estorno da baixa errada.
function HistoricoPagamentos({ parcelaIds, isAdmin, onEstornado }: {
  parcelaIds: string[];
  isAdmin: boolean;
  onEstornado: () => void;
}) {
  const { data: pagamentos = [], isLoading } = usePagamentosByParcelas(parcelaIds);
  const estornar = useEstornarPagamento();
  const { toast } = useToast();
  const [alvoId, setAlvoId] = useState<string | null>(null);
  const [motivo, setMotivo] = useState('');

  const iniciarEstorno = (id: string) => { setAlvoId(id); setMotivo(''); };
  const cancelarEstorno = () => { setAlvoId(null); setMotivo(''); };

  const confirmarEstorno = async () => {
    if (!alvoId || !motivo.trim()) return;
    try {
      await estornar.mutateAsync({ eventoId: alvoId, motivo: motivo.trim() });
      toast({ title: 'Baixa estornada', description: 'O pagamento foi estornado e o saldo atualizado.' });
      cancelarEstorno();
      onEstornado();
    } catch (error) {
      toast({ title: 'Erro', description: msgErro(error, 'Não foi possível estornar a baixa'), variant: 'destructive' });
    }
  };

  if (isLoading) return <p className="text-sm text-muted-foreground">Carregando pagamentos...</p>;
  if (!pagamentos.length) return <p className="text-sm text-muted-foreground">Nenhum pagamento registrado.</p>;

  return (
    <div className="space-y-2">
      {pagamentos.map((pg) => (
        <PagamentoItem
          key={pg.id}
          pagamento={pg}
          isAdmin={isAdmin}
          emEstorno={alvoId === pg.id}
          motivo={motivo}
          isPending={estornar.isPending}
          onIniciarEstorno={() => iniciarEstorno(pg.id)}
          onMotivoChange={setMotivo}
          onConfirmar={confirmarEstorno}
          onCancelar={cancelarEstorno}
        />
      ))}
    </div>
  );
}

interface TituloDetailsDialogProps {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  titulo: TituloConsolidado | null;
  parcelasTitulo: Parcela[];
  isAdmin: boolean;
  onEstornado: () => void;
}
function TituloDetailsDialog({ open, onOpenChange, titulo, parcelasTitulo, isAdmin, onEstornado }: TituloDetailsDialogProps) {
  const parcelasDoTitulo = titulo ? parcelasTitulo.filter(p => p.titulo_id === titulo.id) : [];
  const parcelaIds = parcelasDoTitulo.map(p => p.id);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Detalhes do Título</DialogTitle>
          <DialogDescription>
            Informações do título, parcelas e histórico de pagamentos.
          </DialogDescription>
        </DialogHeader>
        {titulo && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-muted-foreground">Cliente</Label>
                <p className="font-medium">{titulo.cliente_nome}</p>
              </div>
              <div>
                <Label className="text-muted-foreground">CPF/CNPJ</Label>
                <p>{formatCpfCnpj(titulo.cliente_cpf_cnpj)}</p>
              </div>
              <div>
                <Label className="text-muted-foreground">Valor Original</Label>
                <p className="font-medium">{FormatUtils.currency(titulo.valor_original || 0)}</p>
              </div>
              <div>
                <Label className="text-muted-foreground">Saldo Devedor</Label>
                <p className="font-medium text-destructive">{FormatUtils.currency(titulo.saldo_devedor || 0)}</p>
              </div>
              <div>
                <Label className="text-muted-foreground">Total Pago</Label>
                <p className="font-medium text-primary">{FormatUtils.currency(titulo.total_pago || 0)}</p>
              </div>
              <div>
                <Label className="text-muted-foreground">Status</Label>
                <div className="mt-1">
                  <StatusBadge domain="titulo" status={titulo.status || 'a_vencer'} />
                </div>
              </div>
            </div>

            <div>
              <Label className="text-muted-foreground">Parcelas</Label>
              <div className="mt-2 space-y-2">
                {parcelasDoTitulo.map((parcela) => (
                  <div key={parcela.id} className="flex justify-between items-center p-3 border rounded-lg">
                    <div>
                      <span className="font-medium">Parcela {parcela.numero_parcela}</span>
                      <span className="text-muted-foreground ml-2">
                        Venc: {FormatUtils.date(parcela.vencimento)}
                      </span>
                      {parcela.data_ultimo_pagamento && (
                        <div className="text-xs text-primary">
                          Pago em: {FormatUtils.date(parcela.data_ultimo_pagamento)}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      <span>{FormatUtils.currency(parcela.saldo_atual || 0)}</span>
                      <StatusBadge domain="parcela" status={parcela.status || 'a_vencer'} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <Label className="text-muted-foreground">Histórico de pagamentos</Label>
              <div className="mt-2">
                <HistoricoPagamentos
                  parcelaIds={parcelaIds}
                  isAdmin={isAdmin}
                  onEstornado={onEstornado}
                />
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

interface HardDeleteTituloDialogProps {
  titulo: TituloConsolidado | null;
  isPending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}
function HardDeleteTituloDialog({ titulo, isPending, onCancel, onConfirm }: HardDeleteTituloDialogProps) {
  return (
    <ConfirmarAcaoDestrutiva
      open={!!titulo}
      onOpenChange={(o) => !o && onCancel()}
      titulo="Excluir definitivamente"
      descricao={
        <>
          <p>
            Isto <strong>apaga do banco</strong> o título{' '}
            <span className="font-medium">{titulo?.numero_documento}</span> e tudo
            vinculado a ele (parcelas, pagamentos, anexos).
          </p>
          <p><strong>Não dá para desfazer.</strong></p>
        </>
      }
      rotuloConfirmar="Excluir definitivamente"
      textoConfirmacao="EXCLUIR"
      isPending={isPending}
      onConfirm={onConfirm}
    />
  );
}

interface CancelarTituloDialogProps {
  titulo: TituloConsolidado | null;
  isPending: boolean;
  motivo: string;
  onMotivoChange: (v: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
}
function CancelarTituloDialog({ titulo, isPending, motivo, onMotivoChange, onCancel, onConfirm }: CancelarTituloDialogProps) {
  return (
    <Dialog open={!!titulo} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cancelar título</DialogTitle>
          <DialogDescription>
            O título <span className="font-medium">{titulo?.numero_documento}</span> será
            marcado como <strong>cancelado</strong> e sairá das listagens, preservando todo o
            histórico financeiro. A exclusão definitiva continua disponível depois, no mesmo menu.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label>Motivo (opcional)</Label>
          <Textarea
            value={motivo}
            onChange={(e) => onMotivoChange(e.target.value)}
            placeholder="Ex: título lançado em duplicidade"
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel} disabled={isPending}>
            Voltar
          </Button>
          <Button variant="destructive" onClick={onConfirm} disabled={isPending}>
            {isPending ? 'Cancelando...' : 'Cancelar título'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Parâmetro de URL que abre os detalhes de um título. */
const PARAM_TITULO = 'titulo';

export default function Titulos() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuth();
  const { isOperador, isAdmin } = useUserRole();

  // === Data via React Query ===
  const { data: titulos = [], isLoading: loading } = useTitulos();
  const { data: clientes = [] } = useClientesSelect();
  const { data: cobradores = [] } = useCobradores();
  const { data: vendedores = [] } = useVendedores();
  const createTituloMutation = useCreateTitulo();
  const hardDeleteMutation = useHardDeleteTitulos();
  const cancelarTituloMutation = useCancelarTitulo();

  // UI state
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
  const [selectedTitulo, setSelectedTitulo] = useState<TituloConsolidado | null>(null);
  const [tituloToHardDelete, setTituloToHardDelete] = useState<TituloConsolidado | null>(null);
  const [tituloToCancel, setTituloToCancel] = useState<TituloConsolidado | null>(null);
  const [motivoCancel, setMotivoCancel] = useState('');
  const [expandedClientes, setExpandedClientes] = useState<Set<string>>(new Set());
  const [expandedTitulos, setExpandedTitulos] = useState<Set<string>>(new Set());
  // Incrementado quando o cache de parcelas é atualizado, para forçar a
  // re-derivação de `parcelasTitulo` (que lê o cache do React Query).
  const [parcelasVersion, setParcelasVersion] = useState(0);

  // Modal states for financial actions
  const [pagamentoModal, setPagamentoModal] = useState<{
    open: boolean;
    parcelaId: string;
    parcelaNumero: number;
    saldoAtual: number;
  }>({ open: false, parcelaId: '', parcelaNumero: 0, saldoAtual: 0 });

  const [encargoModal, setEncargoModal] = useState<{
    open: boolean;
    parcelaId: string;
    parcelaNumero: number;
    saldoAtual: number;
  }>({ open: false, parcelaId: '', parcelaNumero: 0, saldoAtual: 0 });

  const [descontoModal, setDescontoModal] = useState<{
    open: boolean;
    parcelaId: string;
    parcelaNumero: number;
    saldoAtual: number;
  }>({ open: false, parcelaId: '', parcelaNumero: 0, saldoAtual: 0 });

  // Form state para novo título
  const [newTitulo, setNewTitulo] = useState({
    cliente_id: '',
    valor_original: 0,
    vencimento_original: hojeIso(),
    descricao: '',
    numero_documento: '',
    numero_parcelas: 1,
    intervalo_dias: 30
  });

  // Parcelas: prefetch+cache via React Query — agregamos os caches em uma lista plana
  // para preservar a API existente do componente (parcelasTitulo + filter por titulo_id).
  const parcelasTitulo = useMemo<Parcela[]>(() => {
    const all: Parcela[] = [];
    for (const tituloId of expandedTitulos) {
      const cached = queryClient.getQueryData<Parcela[]>(titulosKeys.parcelas(tituloId));
      if (cached) all.push(...cached);
    }
    if (selectedTitulo) {
      const cached = queryClient.getQueryData<Parcela[]>(titulosKeys.parcelas(selectedTitulo.id));
      if (cached && !expandedTitulos.has(selectedTitulo.id)) all.push(...cached);
    }
    return all;
    // queryClient is stable; depend on changing keys/versão para re-derivar
    // quando uma busca de parcelas termina e popula o cache.
  }, [expandedTitulos, selectedTitulo, queryClient, titulos, parcelasVersion]);

  const fetchParcelasTitulo = async (tituloId: string) => {
    await queryClient.fetchQuery({
      queryKey: titulosKeys.parcelas(tituloId),
      queryFn: async () => {
        const { data, error } = await supabase
          .from('vw_parcelas_consolidadas')
          .select('*')
          .eq('titulo_id', tituloId)
          .order('numero_parcela');
        if (error) throw error;
        return (data || []) as Parcela[];
      },
    });
    setParcelasVersion(v => v + 1);
  };

  const handleCreateTitulo = async () => {
    if (!newTitulo.cliente_id || !newTitulo.valor_original || !user) {
      toast({
        title: "Erro",
        description: "Preencha todos os campos obrigatórios",
        variant: "destructive",
      });
      return;
    }

    try {
      await createTituloMutation.mutateAsync({
        cliente_id: newTitulo.cliente_id,
        valor_original: newTitulo.valor_original,
        vencimento_original: newTitulo.vencimento_original,
        descricao: newTitulo.descricao || null,
        numero_documento: newTitulo.numero_documento || null,
        numero_parcelas: newTitulo.numero_parcelas,
        intervalo_dias: newTitulo.intervalo_dias,
        created_by: user.id,
      });

      toast({
        title: "Sucesso",
        description: "Título criado com sucesso",
      });

      setIsCreateModalOpen(false);
      setNewTitulo({
        cliente_id: '',
        valor_original: 0,
        vencimento_original: hojeIso(),
        descricao: '',
        numero_documento: '',
        numero_parcelas: 1,
        intervalo_dias: 30
      });
    } catch (error) {
      console.error('Erro ao criar título:', error);
      toast({
        title: "Erro",
        description: "Não foi possível criar o título",
        variant: "destructive",
      });
    }
  };

  const toggleClienteExpanded = (clienteId: string) => {
    const abrindo = !expandedClientes.has(clienteId);
    setExpandedClientes(prev => {
      const next = new Set(prev);
      if (next.has(clienteId)) {
        next.delete(clienteId);
      } else {
        next.add(clienteId);
      }
      return next;
    });

    // Cliente com um título só: abrir o cliente já mostra as parcelas. Eram três
    // níveis de expansão antes de qualquer ação, e o nível do meio não oferecia
    // escolha nenhuma quando existia um título apenas.
    if (!abrindo) return;
    const cliente = clientesAgrupados.find((c) => c.id === clienteId);
    const unico = cliente?.titulos.length === 1 ? cliente.titulos[0] : null;
    if (unico && !expandedTitulos.has(unico.id)) toggleTituloExpanded(unico.id);
  };

  const toggleTituloExpanded = (tituloId: string) => {
    const isExpanding = !expandedTitulos.has(tituloId);
    setExpandedTitulos(prev => {
      const next = new Set(prev);
      if (next.has(tituloId)) {
        next.delete(tituloId);
      } else {
        next.add(tituloId);
      }
      return next;
    });
    // Efeito fora do updater (updaters devem ser puros). A busca popula o
    // cache e bumpa parcelasVersion, re-renderizando já no primeiro clique.
    if (isExpanding) fetchParcelasTitulo(tituloId);
  };

  const openDetails = async (titulo: TituloConsolidado) => {
    // O id vai para a URL: os detalhes viram um endereço que dá para mandar
    // para outra pessoa, abrir em aba nova e recarregar sem perder o lugar —
    // o mesmo que Acordos já fazia com ?id=.
    setSearchParams((atual) => {
      const proximo = new URLSearchParams(atual);
      proximo.set(PARAM_TITULO, titulo.id);
      return proximo;
    }, { replace: true });
    setSelectedTitulo(titulo);
    await fetchParcelasTitulo(titulo.id);
    setIsDetailsModalOpen(true);
  };

  const fecharDetalhes = (aberto: boolean) => {
    setIsDetailsModalOpen(aberto);
    if (aberto) return;
    setSearchParams((atual) => {
      const proximo = new URLSearchParams(atual);
      proximo.delete(PARAM_TITULO);
      return proximo;
    }, { replace: true });
  };

  // Cancelamento (admin): soft delete reversível, preserva o histórico.
  const openCancelarTitulo = (titulo: TituloConsolidado) => {
    setMotivoCancel('');
    setTituloToCancel(titulo);
  };

  const handleCancelarTitulo = async () => {
    if (!tituloToCancel) return;
    try {
      await cancelarTituloMutation.mutateAsync({ tituloId: tituloToCancel.id, motivo: motivoCancel.trim() || undefined });
      toast({ title: 'Título cancelado', description: 'O título saiu das listagens e o histórico foi preservado.' });
      setTituloToCancel(null);
    } catch (error) {
      toast({ title: 'Erro', description: msgErro(error, 'Não foi possível cancelar o título'), variant: 'destructive' });
    }
  };

  // Após estornar uma baixa: re-busca as parcelas do título aberto e a lista.
  const handleEstornado = async () => {
    if (selectedTitulo) await fetchParcelasTitulo(selectedTitulo.id);
    await queryClient.invalidateQueries({ queryKey: titulosKeys.all });
  };

  // Exclusão DEFINITIVA (super admin): apaga fisicamente o título. Irreversível.
  const handleHardDeleteTitulo = async () => {
    if (!tituloToHardDelete) return;
    try {
      await hardDeleteMutation.mutateAsync([tituloToHardDelete.id]);
      toast({ title: 'Excluído definitivamente', description: 'O título foi removido do banco de dados.' });
      setTituloToHardDelete(null);
    } catch (error) {
      toast({ title: 'Erro', description: msgErro(error, 'Não foi possível excluir definitivamente'), variant: 'destructive' });
    }
  };

  // Agrupar títulos por cliente
  const clientesAgrupados = useMemo(() => agruparTitulosPorCliente(titulos), [titulos]);

  // Deep link ?titulo=<id>: abre os detalhes direto, sem precisar reencontrar
  // o título na árvore cliente > título.
  const tituloParam = searchParams.get(PARAM_TITULO);
  useEffect(() => {
    if (!tituloParam || titulos.length === 0 || selectedTitulo?.id === tituloParam) return;
    const alvo = titulos.find((t) => t.id === tituloParam);
    if (!alvo) return;
    setSelectedTitulo(alvo);
    void fetchParcelasTitulo(alvo.id);
    setIsDetailsModalOpen(true);
    // fetchParcelasTitulo depende do queryClient (estável); reagir ao id basta.
  }, [tituloParam, titulos, selectedTitulo?.id]);

  // Filter functions for titulos
  const filterFunctions = useMemo(() => createClienteAgrupadoFilterFunctions(), []);

  // Filtros "Cobrador"/"Vendedor" com opções dinâmicas (equipe da empresa).
  const filterConfigs = useMemo(() => [
    ...titulosFilterConfig,
    {
      id: 'cobrador',
      label: 'Cobrador',
      type: 'select' as const,
      placeholder: 'Todos',
      options: cobradores.map((c) => ({ value: c.id, label: c.nome })),
    },
    {
      id: 'vendedor',
      label: 'Vendedor',
      type: 'select' as const,
      placeholder: 'Todos',
      options: vendedores.map((v) => ({ value: v.id, label: v.nome })),
    },
  ], [cobradores, vendedores]);

  const {
    filteredData: filteredClientes,
    filters,
    setFilter,
    setFilters,
    clearFilter,
    clearAllFilters,
    hasActiveFilters,
    activeFiltersCount,
    resultCount,
    totalCount
  } = useGlobalFilter(clientesAgrupados, filterFunctions);

  // Filtrar títulos dentro de cada cliente quando há busca ativa.
  // Usa o mesmo `casaTexto` da busca das listagens, então procurar por um
  // CPF com máscara acha o cliente aqui também.
  const clientesComTitulosFiltrados = useMemo(() => {
    const busca = String(filters.search ?? '').trim();
    if (!busca) return filteredClientes;

    return filteredClientes.map((cliente) => {
      const titulosFiltrados = cliente.titulos.filter((titulo) =>
        casaTexto(titulo.numero_documento, busca)
        || casaTexto(titulo.id, busca)
        || casaTexto(titulo.descricao, busca)
      );

      // Achou títulos específicos: mostra só eles. Senão, o match pode ter sido
      // no cliente (nome/CPF) — aí mostra a carteira inteira dele.
      const clienteCasa = casaTexto(cliente.nome, busca) || casaTexto(cliente.cpf_cnpj, busca);
      const titulos = titulosFiltrados.length > 0
        ? titulosFiltrados
        : (clienteCasa ? cliente.titulos : []);

      return { ...cliente, titulos };
    }).filter((cliente) => cliente.titulos.length > 0);
  }, [filteredClientes, filters.search]);

  const pagination = usePagination(clientesComTitulosFiltrados, 25, JSON.stringify(filters), PARAM_PAGINA);

  const totalTitulos = titulos.length;

  // Helper functions for actions
  const handleRefreshData = async () => {
    await supabase.rpc('refresh_mv_parcelas');
    // Invalida titulos e todos os caches de parcelas
    await queryClient.invalidateQueries({ queryKey: titulosKeys.all });
    // Re-fetch parcelas dos titulos expandidos
    await Promise.all(
      Array.from(expandedTitulos).map((tituloId) => fetchParcelasTitulo(tituloId))
    );
  };

  // Leva a origem e a ordem dos clientes: o breadcrumb da ficha volta a ESTA
  // lista (com filtros e página) e o Próximo/Anterior segue a mesma sequência.
  const abrirFicha = useAbrirFicha(
    useMemo(() => clientesComTitulosFiltrados.map((c) => c.cliente_id), [clientesComTitulosFiltrados]),
  );

  const openWhatsApp = (telefone: string | null, nome: string) => {
    if (!telefone) {
      toast({
        title: "Telefone não cadastrado",
        description: "Este cliente não possui telefone cadastrado",
        variant: "destructive",
      });
      return;
    }
    const numero = soDigitos(telefone);
    const mensagem = encodeURIComponent(`Olá ${nome}, entramos em contato referente ao seu débito.`);
    window.open(`https://wa.me/55${numero}?text=${mensagem}`, '_blank');
  };

  const openEmail = (email: string | null, nome: string) => {
    if (!email) {
      toast({
        title: "E-mail não cadastrado",
        description: "Este cliente não possui e-mail cadastrado",
        variant: "destructive",
      });
      return;
    }
    const assunto = encodeURIComponent('Cobrança - Títulos em aberto');
    const corpo = encodeURIComponent(`Prezado(a) ${nome},\n\nEntramos em contato referente aos títulos em aberto.\n\nAtenciosamente.`);
    window.open(`mailto:${email}?subject=${assunto}&body=${corpo}`, '_blank');
  };

  const openPagamentoModal = (parcela: Parcela) => {
    setPagamentoModal({
      open: true,
      parcelaId: parcela.id,
      parcelaNumero: parcela.numero_parcela,
      saldoAtual: parcela.saldo_atual || 0
    });
  };

  const openEncargoModal = (parcela: Parcela) => {
    setEncargoModal({
      open: true,
      parcelaId: parcela.id,
      parcelaNumero: parcela.numero_parcela,
      saldoAtual: parcela.saldo_atual || 0
    });
  };

  const openDescontoModal = (parcela: Parcela) => {
    setDescontoModal({
      open: true,
      parcelaId: parcela.id,
      parcelaNumero: parcela.numero_parcela,
      saldoAtual: parcela.saldo_atual || 0
    });
  };

  const tituloActions: TituloRowActions = {
    isOperador, isAdmin,
    expandedTitulos, parcelasTitulo,
    onToggleTitulo: toggleTituloExpanded,
    onDetails: openDetails,
    onPagamento: openPagamentoModal,
    onEncargo: openEncargoModal,
    onDesconto: openDescontoModal,
    onCancelarTitulo: openCancelarTitulo,
    onHardDelete: setTituloToHardDelete,
  };

  if (loading) {
    return <CarregandoConteudo />;
  }

  return (
    <div className="space-y-10 animate-fade-in pb-10">
      <PageHeader
        title="Títulos"
        description="Gestão detalhada de faturas e parcelas de cobrança."
      >
        {isOperador && (
          <Button 
            onClick={() => setIsCreateModalOpen(true)}
          >
            <Plus className="h-4 w-4 mr-2" />
            Novo Título
          </Button>
        )}
      </PageHeader>

      <Card className="overflow-hidden">
        <CardHeader className="pb-4 border-b border-border/50 bg-muted/20">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-xl font-bold tracking-tight">Lista de Títulos</CardTitle>
              <CardDescription className="text-xs font-medium">
                {clientesComTitulosFiltrados.length} clientes, {totalTitulos} títulos sob gestão
              </CardDescription>
            </div>
          </div>
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
            presets={titulosPresets}
            onPresetSelect={(preset) => setFilters(preset.filters)}
            collapsible={true}
            defaultOpen={false}
          />

          <div className="rounded-xl border border-border/50 overflow-hidden">
            <Table>
              <TableHeader className="bg-muted/30">
                <TableRow>
                  <TableHead className="w-10"></TableHead>
                  <TableHead>Cliente / Título</TableHead>
                  <TableHead className="hidden md:table-cell">CPF/CNPJ</TableHead>
                  <TableHead>Saldo</TableHead>
                  <TableHead className="hidden lg:table-cell">Títulos</TableHead>
                  <TableHead>Situação</TableHead>
                  <TableHead>Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pagination.pageItems.map((cliente) => (
                  <ClienteRow
                    key={cliente.id}
                    cliente={cliente}
                    expanded={expandedClientes.has(cliente.id)}
                    onToggleCliente={toggleClienteExpanded}
                    onOpenFicha={abrirFicha}
                    onWhatsApp={openWhatsApp}
                    onEmail={openEmail}
                    actions={tituloActions}
                  />
                ))}
                {clientesComTitulosFiltrados.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      Nenhum título encontrado
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          <TablePagination pagination={pagination} />
        </CardContent>
      </Card>

      <NovoTituloDialog
        open={isCreateModalOpen}
        onOpenChange={setIsCreateModalOpen}
        novoTitulo={newTitulo}
        setNovoTitulo={setNewTitulo}
        clientes={clientes}
        onCancel={() => setIsCreateModalOpen(false)}
        onCreate={handleCreateTitulo}
      />

      <TituloDetailsDialog
        open={isDetailsModalOpen}
        onOpenChange={fecharDetalhes}
        titulo={selectedTitulo}
        parcelasTitulo={parcelasTitulo}
        isAdmin={isAdmin}
        onEstornado={handleEstornado}
      />

      <CancelarTituloDialog
        titulo={tituloToCancel}
        isPending={cancelarTituloMutation.isPending}
        motivo={motivoCancel}
        onMotivoChange={setMotivoCancel}
        onCancel={() => setTituloToCancel(null)}
        onConfirm={handleCancelarTitulo}
      />

      <HardDeleteTituloDialog
        titulo={tituloToHardDelete}
        isPending={hardDeleteMutation.isPending}
        onCancel={() => setTituloToHardDelete(null)}
        onConfirm={handleHardDeleteTitulo}
      />

      {/* Modals de Ações Financeiras */}
      <RegistrarPagamentoModal
        open={pagamentoModal.open}
        onOpenChange={(open) => setPagamentoModal(prev => ({ ...prev, open }))}
        parcelaId={pagamentoModal.parcelaId}
        parcelaNumero={pagamentoModal.parcelaNumero}
        saldoAtual={pagamentoModal.saldoAtual}
        onSuccess={handleRefreshData}
      />

      <AplicarEncargoModal
        open={encargoModal.open}
        onOpenChange={(open) => setEncargoModal(prev => ({ ...prev, open }))}
        parcelaId={encargoModal.parcelaId}
        parcelaNumero={encargoModal.parcelaNumero}
        saldoAtual={encargoModal.saldoAtual}
        onSuccess={handleRefreshData}
      />

      <ConcederDescontoModal
        open={descontoModal.open}
        onOpenChange={(open) => setDescontoModal(prev => ({ ...prev, open }))}
        parcelaId={descontoModal.parcelaId}
        parcelaNumero={descontoModal.parcelaNumero}
        saldoAtual={descontoModal.saldoAtual}
        onSuccess={handleRefreshData}
      />
    </div>
  );
}
