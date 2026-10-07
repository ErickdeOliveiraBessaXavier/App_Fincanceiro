import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { usePlanos, useDefinirPlanoEmpresa, type Plano } from '@/lib/queries/planos';
import { fimDoDiaNoBrasil, formatarNumero } from '@/domain/plano';
import { isoDeData } from '@/utils/format';
import { formatarReais } from '@/domain/assinatura';
import { precoDoLimite } from '@/domain/precificacao';

/**
 * Plano, limite personalizado e prazo de acesso de uma empresa.
 *
 * É também o "desbloquear" do teste vencido: trocar para um plano pago (sem
 * prazo) ou estender a data devolve o acesso na hora.
 */

export interface EmpresaDoPlano {
  id: string;
  nome: string;
  plano: string;
  limite_titulos_personalizado: number | null;
  acesso_expira_em: string | null;
}

interface Campos {
  plano: string;
  limite: string;
  /** YYYY-MM-DD ou vazio. */
  expira: string;
}

function camposDaEmpresa(e: EmpresaDoPlano): Campos {
  return {
    plano: e.plano,
    limite: e.limite_titulos_personalizado ? String(e.limite_titulos_personalizado) : '',
    expira: e.acesso_expira_em ? isoDeData(new Date(e.acesso_expira_em)) : '',
  };
}

function descreverLimite(plano: Plano | undefined): string {
  if (!plano) return '';
  return plano.limite_titulos === null ? 'sem limite' : `${formatarNumero(plano.limite_titulos)} títulos`;
}

/** " · R$ 297,00/mês"; vazio para plano sem mensalidade (teste, cortesia). */
function descreverPreco(plano: Plano): string {
  return plano.valor_mensal > 0 ? ` · ${formatarReais(plano.valor_mensal)}/mês` : '';
}

/** Mensalidade e implantação que o limite digitado resulta, pela regra do plano. */
function descreverPrecoDoLimite(plano: Plano | undefined, limiteTexto: string): string {
  if (!plano || plano.valor_mensal === 0) return '';
  const limite = Number(limiteTexto) > 0 ? Number(limiteTexto) : null;
  const preco = precoDoLimite(plano, limite);
  const blocos = preco.blocosExcedentes > 0 ? ` (${preco.blocosExcedentes} bloco(s) de excedente)` : '';
  return `Preço: ${formatarReais(preco.mensal)}/mês + ${formatarReais(preco.implantacao)} de implantação${blocos}.`;
}

/** O que acontece com o prazo se o campo ficar vazio. */
function explicarPrazoVazio(plano: Plano | undefined): string {
  if (plano?.dias_teste) {
    return `Sem data: o teste ganha ${plano.dias_teste} dias a partir da aprovação (ou de hoje, se já aprovada).`;
  }
  return 'Sem data: acesso sem prazo.';
}

/** Mensagem do primeiro campo inválido, ou null. */
function validar(c: Campos): string | null {
  if (!c.limite) return null;
  const n = Number(c.limite);
  return Number.isInteger(n) && n > 0 ? null : 'Limite personalizado: informe um número inteiro maior que zero.';
}

interface Props {
  empresa: EmpresaDoPlano | null;
  onClose: () => void;
}

export function AlterarPlanoDialog({ empresa, onClose }: Props) {
  const { toast } = useToast();
  const { data: planos = [] } = usePlanos(!!empresa);
  const definir = useDefinirPlanoEmpresa();
  const [campos, setCampos] = useState<Campos>({ plano: '', limite: '', expira: '' });

  useEffect(() => {
    if (empresa) setCampos(camposDaEmpresa(empresa));
  }, [empresa]);

  const planoEscolhido = planos.find((p) => p.codigo === campos.plano);
  const set = (parcial: Partial<Campos>) => setCampos((c) => ({ ...c, ...parcial }));

  const salvar = async () => {
    if (!empresa) return;
    const erro = validar(campos);
    if (erro) {
      toast({ title: 'Valor inválido', description: erro, variant: 'destructive' });
      return;
    }
    try {
      await definir.mutateAsync({
        companyId: empresa.id,
        plano: campos.plano,
        limitePersonalizado: campos.limite ? Number(campos.limite) : null,
        acessoExpiraEm: campos.expira ? fimDoDiaNoBrasil(campos.expira) : null,
      });
      toast({ title: 'Plano atualizado', description: `${empresa.nome}: ${planoEscolhido?.nome ?? campos.plano}.` });
      onClose();
    } catch (e) {
      toast({
        title: 'Erro',
        description: e instanceof Error ? e.message : 'Não foi possível alterar o plano',
        variant: 'destructive',
      });
    }
  };

  return (
    <Dialog open={!!empresa} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Alterar plano</DialogTitle>
          <DialogDescription>{empresa?.nome}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-5 py-2">
          <div className="grid gap-2">
            <Label htmlFor="plano-codigo">Plano</Label>
            <select
              id="plano-codigo"
              value={campos.plano}
              // Trocar de plano zera o prazo: o do teste antigo não deve seguir
              // valendo para o plano pago (nem o contrário).
              onChange={(e) => set({ plano: e.target.value, expira: '' })}
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            >
              {planos.map((p) => (
                <option key={p.codigo} value={p.codigo}>{p.nome} — {descreverLimite(p)}{descreverPreco(p)}</option>
              ))}
            </select>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="plano-limite">Limite personalizado (opcional)</Label>
            <Input
              id="plano-limite"
              type="number"
              min="1"
              step="1"
              value={campos.limite}
              onChange={(e) => set({ limite: e.target.value })}
              placeholder={descreverLimite(planoEscolhido) || 'Limite do plano'}
            />
            <p className="text-xs text-muted-foreground">
              Vazio usa o limite do plano. Use para o Enterprise acima de 30 mil (50 mil, 100 mil…).
            </p>
            <p className="text-xs font-medium">{descreverPrecoDoLimite(planoEscolhido, campos.limite)}</p>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="plano-expira">Acesso até (opcional)</Label>
            <Input
              id="plano-expira"
              type="date"
              value={campos.expira}
              onChange={(e) => set({ expira: e.target.value })}
            />
            <p className="text-xs text-muted-foreground">
              {campos.expira
                ? 'Depois desta data a empresa fica bloqueada até você liberar aqui.'
                : explicarPrazoVazio(planoEscolhido)}
            </p>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={salvar} disabled={definir.isPending || !campos.plano}>
            {definir.isPending ? 'Salvando...' : 'Salvar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
