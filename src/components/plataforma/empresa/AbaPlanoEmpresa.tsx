import { useEffect, useState } from 'react';
import { Minus, Plus, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { usePlanos, useDefinirPlanoEmpresa, type Plano } from '@/lib/queries/planos';
import { diasRestantes, fimDoDiaNoBrasil, formatarNumero } from '@/domain/plano';
import { formatarReais, somarDias } from '@/domain/assinatura';
import { blocosExcedentes, precoDoLimite, temRegraDeExcedente } from '@/domain/precificacao';
import { hojeIso } from '@/domain/telecobranca/statusCobranca';
import { formatData, isoDeData } from '@/utils/format';

/**
 * Plano, pacotes extras de títulos e prazo de acesso de uma empresa.
 *
 * É também o "liberar acesso" do teste vencido: trocar para um plano pago (sem
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
  /** Pacotes extras acima do limite do plano (só em plano com regra de excedente). */
  pacotes: number;
  /** YYYY-MM-DD ou vazio (sem prazo). */
  expira: string;
}

function camposDaEmpresa(e: EmpresaDoPlano, planos: Plano[]): Campos {
  const plano = planos.find((p) => p.codigo === e.plano);
  return {
    plano: e.plano,
    pacotes: plano ? blocosExcedentes(plano, e.limite_titulos_personalizado) : 0,
    expira: e.acesso_expira_em ? isoDeData(new Date(e.acesso_expira_em)) : '',
  };
}

/** Limite personalizado a gravar: o do plano + os pacotes; null = o do plano. */
function limiteDosPacotes(plano: Plano | undefined, pacotes: number): number | null {
  if (!plano || !temRegraDeExcedente(plano) || pacotes === 0) return null;
  return plano.limite_titulos! + pacotes * plano.excedente_bloco_titulos!;
}

/**
 * Sem mexer em plano nem pacotes, mantém o limite que a empresa já tinha: um
 * limite antigo fora do tamanho do pacote não pode mudar só porque alguém
 * estendeu o prazo.
 */
function limiteASalvar(c: Campos, inicial: Campos, plano: Plano | undefined, original: number | null): number | null {
  if (c.plano === inicial.plano && c.pacotes === inicial.pacotes) return original;
  return limiteDosPacotes(plano, c.pacotes);
}

const textoLimite = (limite: number | null) => (limite === null ? 'Sem limite de títulos' : `Até ${formatarNumero(limite)} títulos`);

// ===================== Partes =====================

function CartaoPlano({ plano, ativo, onClick }: { plano: Plano; ativo: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={ativo}
      className={cn(
        'relative grid gap-1 rounded-lg border p-3 text-left transition-colors',
        ativo ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'hover:bg-secondary/40',
      )}
    >
      {ativo && <Check className="absolute right-2 top-2 h-4 w-4 text-primary" />}
      <span className="text-sm font-semibold">{plano.nome}</span>
      <span className="text-xs text-muted-foreground">{textoLimite(plano.limite_titulos)}</span>
      <span className="text-xs font-medium tabular-nums">
        {plano.valor_mensal > 0 ? `${formatarReais(plano.valor_mensal)}/mês` : 'Gratuito'}
      </span>
    </button>
  );
}

function EscolhaDoPlano({ planos, valor, onChange }: { planos: Plano[]; valor: string; onChange: (codigo: string) => void }) {
  return (
    <div className="grid gap-2">
      <Label>1. Escolha o plano</Label>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {planos.map((p) => (
          <CartaoPlano key={p.codigo} plano={p} ativo={p.codigo === valor} onClick={() => onChange(p.codigo)} />
        ))}
      </div>
    </div>
  );
}

function PacotesExtras({ plano, pacotes, onChange }: { plano: Plano; pacotes: number; onChange: (n: number) => void }) {
  const bloco = formatarNumero(plano.excedente_bloco_titulos!);
  return (
    <div className="grid gap-2">
      <Label>2. Pacotes extras de {bloco} títulos (opcional)</Label>
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1">
          <Button type="button" size="icon" variant="outline" aria-label="Tirar um pacote"
            disabled={pacotes === 0} onClick={() => onChange(pacotes - 1)}>
            <Minus className="h-4 w-4" />
          </Button>
          <span className="w-10 text-center text-lg font-semibold tabular-nums" aria-live="polite">{pacotes}</span>
          <Button type="button" size="icon" variant="outline" aria-label="Somar um pacote" onClick={() => onChange(pacotes + 1)}>
            <Plus className="h-4 w-4" />
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Cada pacote soma {bloco} títulos e {formatarReais(plano.excedente_valor_mensal)} na mensalidade.
        </p>
      </div>
    </div>
  );
}

interface PrazoProps {
  expira: string;
  onChange: (v: string) => void;
  passo: number;
  /** Plano de teste: sem data, o banco dá estes dias a partir da aprovação. */
  diasTeste: number | null;
}

function explicarPrazo(expira: string, diasTeste: number | null): string {
  if (expira) return `Depois de ${formatData(expira)} a empresa fica bloqueada até alguém liberar aqui.`;
  if (diasTeste) return `Sem data: o teste ganha ${diasTeste} dias a partir da aprovação (ou de hoje, se já aprovada).`;
  return 'Sem prazo: o acesso só para se a empresa for suspensa ou atrasar a mensalidade.';
}

function PrazoDeAcesso({ expira, onChange, passo, diasTeste }: PrazoProps) {
  const hoje = hojeIso();
  // Estender conta a partir do prazo atual, se ainda não venceu; senão, de hoje.
  const base = expira && expira > hoje ? expira : hoje;
  return (
    <div className="grid gap-2">
      <Label htmlFor="plano-expira">{passo}. Até quando a empresa tem acesso?</Label>
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" variant={expira ? 'outline' : 'default'} onClick={() => onChange('')}>
          {diasTeste ? `Padrão (${diasTeste} dias)` : 'Sem prazo'}
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={() => onChange(somarDias(base, 7))}>+7 dias</Button>
        <Button type="button" size="sm" variant="outline" onClick={() => onChange(somarDias(base, 30))}>+30 dias</Button>
        <Input id="plano-expira" type="date" className="h-9 w-auto" value={expira} onChange={(e) => onChange(e.target.value)} />
      </div>
      <p className="text-xs text-muted-foreground">{explicarPrazo(expira, diasTeste)}</p>
    </div>
  );
}

function textoPrazo(expira: string, diasTeste: number | null): string {
  if (!expira) return diasTeste ? `teste de ${diasTeste} dias` : 'acesso sem prazo';
  return diasRestantes(fimDoDiaNoBrasil(expira)) === 0 ? `acesso VENCIDO em ${formatData(expira)}` : `acesso até ${formatData(expira)}`;
}

function ResumoDaEscolha({ plano, pacotes, expira }: { plano: Plano; pacotes: number; expira: string }) {
  const preco = precoDoLimite(plano, limiteDosPacotes(plano, pacotes));
  return (
    <div className="rounded-lg border bg-secondary/30 p-3 text-sm">
      <p className="font-medium">
        {plano.nome} · {textoLimite(preco.limite).toLowerCase()} · {preco.mensal > 0 ? `${formatarReais(preco.mensal)}/mês` : 'gratuito'} · {textoPrazo(expira, plano.dias_teste)}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        As próximas mensalidades seguem este valor, a menos que haja um valor negociado na aba Cobrança.
      </p>
    </div>
  );
}

// ===================== Aba =====================

const camposMudaram = (a: Campos, b: Campos) => a.plano !== b.plano || a.pacotes !== b.pacotes || a.expira !== b.expira;

const mensagemDeErro = (e: unknown) => (e instanceof Error ? e.message : 'Não foi possível salvar o plano');

/** Campos da empresa (recarregados quando ela muda) e o salvar. */
function useFormPlano(empresa: EmpresaDoPlano) {
  const { toast } = useToast();
  const { data: planos } = usePlanos();
  const definir = useDefinirPlanoEmpresa();
  const [inicial, setInicial] = useState<Campos | null>(null);
  const [c, setC] = useState<Campos | null>(null);

  useEffect(() => {
    if (!planos) return;
    const campos = camposDaEmpresa(empresa, planos);
    setInicial(campos);
    setC(campos);
  }, [empresa, planos]);

  const salvar = async (campos: Campos, antes: Campos, plano: Plano | undefined) => {
    try {
      await definir.mutateAsync({
        companyId: empresa.id,
        plano: campos.plano,
        limitePersonalizado: limiteASalvar(campos, antes, plano, empresa.limite_titulos_personalizado),
        acessoExpiraEm: campos.expira ? fimDoDiaNoBrasil(campos.expira) : null,
      });
      toast({ title: 'Plano salvo', description: `${empresa.nome}: ${plano?.nome ?? campos.plano}.` });
    } catch (e) {
      toast({ title: 'Erro', description: mensagemDeErro(e), variant: 'destructive' });
    }
  };

  return { planos, inicial, c, setC, salvar, salvando: definir.isPending };
}

interface FormularioProps {
  planos: Plano[];
  inicial: Campos;
  c: Campos;
  setC: (c: Campos) => void;
  salvar: (c: Campos, inicial: Campos, plano: Plano | undefined) => void;
  salvando: boolean;
}

function FormularioPlano({ planos, inicial, c, setC, salvar, salvando }: FormularioProps) {
  const plano = planos.find((p) => p.codigo === c.plano);
  const comPacotes = !!plano && temRegraDeExcedente(plano);
  const mudou = camposMudaram(c, inicial);
  return (
    <div className="grid gap-5">
      {/* Trocar de plano zera pacotes e prazo: os do plano antigo não valem para o novo. */}
      <EscolhaDoPlano planos={planos} valor={c.plano} onChange={(codigo) => setC({ plano: codigo, pacotes: 0, expira: '' })} />
      {comPacotes && <PacotesExtras plano={plano} pacotes={c.pacotes} onChange={(pacotes) => setC({ ...c, pacotes })} />}
      <PrazoDeAcesso expira={c.expira} onChange={(expira) => setC({ ...c, expira })} passo={comPacotes ? 3 : 2}
        diasTeste={plano?.dias_teste ?? null} />
      {plano && <ResumoDaEscolha plano={plano} pacotes={c.pacotes} expira={c.expira} />}
      <div className="flex justify-end gap-2">
        {mudou && <Button variant="ghost" onClick={() => setC(inicial)}>Desfazer</Button>}
        <Button onClick={() => salvar(c, inicial, plano)} disabled={salvando || !mudou}>
          {salvando ? 'Salvando...' : 'Salvar plano'}
        </Button>
      </div>
    </div>
  );
}

export function AbaPlanoEmpresa({ empresa }: { empresa: EmpresaDoPlano }) {
  const { planos, inicial, c, setC, salvar, salvando } = useFormPlano(empresa);
  if (!planos || !c || !inicial) return null;
  return <FormularioPlano planos={planos} inicial={inicial} c={c} setC={setC} salvar={salvar} salvando={salvando} />;
}
