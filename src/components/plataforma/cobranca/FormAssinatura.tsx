import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { InputMoeda } from '@/components/InputMoeda';
import { Aviso } from '@/components/Aviso';
import { useToast } from '@/hooks/use-toast';
import {
  useEncerrarAssinatura, useSalvarAssinatura, type Assinatura,
} from '@/lib/queries/assinaturas';
import type { Plano } from '@/lib/queries/planos';
import {
  CARENCIA_PADRAO_DIAS, TOLERANCIA_PADRAO_DIAS, formatarReais, inicioCobrancaPadrao, primeiroVencimento,
  valorMensalEfetivo,
} from '@/domain/assinatura';
import { hojeIso } from '@/domain/telecobranca/statusCobranca';
import { formatData } from '@/utils/format';
import { precoDoLimite, type Preco } from '@/domain/precificacao';

/**
 * Contrato de cobrança de uma empresa: mensalidade (do plano ou negociada),
 * dia de vencimento, início da cobrança (contratação + carência) e tolerância
 * até o bloqueio. Na primeira gravação emite também a fatura de implantação.
 */

interface Campos {
  /** 0 = usar a mensalidade do plano. */
  mensalPersonalizada: number;
  dia: string;
  inicio: string;
  tolerancia: string;
  implantacao: number;
  vencimentoImplantacao: string;
}

type SetCampos = (parcial: Partial<Campos>) => void;

const DIA_VENCIMENTO_PADRAO = 10;

function camposIniciais(a: Assinatura | null, preco: Preco | null): Campos {
  const hoje = hojeIso();
  const contrato = a ?? {
    valor_mensal_personalizado: null,
    dia_vencimento: DIA_VENCIMENTO_PADRAO,
    inicio_cobranca: inicioCobrancaPadrao(hoje),
    dias_tolerancia: TOLERANCIA_PADRAO_DIAS,
  };
  return {
    mensalPersonalizada: contrato.valor_mensal_personalizado ?? 0,
    dia: String(contrato.dia_vencimento),
    inicio: contrato.inicio_cobranca,
    tolerancia: String(contrato.dias_tolerancia),
    implantacao: preco?.implantacao ?? 0,
    vencimentoImplantacao: hoje,
  };
}

function inteiroEntre(valor: string, min: number, max: number): boolean {
  const n = Number(valor);
  return Number.isInteger(n) && n >= min && n <= max;
}

function validar(c: Campos): string | null {
  if (!inteiroEntre(c.dia, 1, 28)) return 'Dia de vencimento: de 1 a 28 (existe em todo mês).';
  if (!c.inicio) return 'Informe o início da cobrança.';
  if (!inteiroEntre(c.tolerancia, 0, 60)) return 'Tolerância: de 0 a 60 dias.';
  return null;
}

function mensagemDeErro(e: unknown, padrao: string): string {
  return e instanceof Error ? e.message : padrao;
}

function useAcoesAssinatura(companyId: string, implantacaoEmitida: boolean) {
  const { toast } = useToast();
  const salvar = useSalvarAssinatura();
  const encerrar = useEncerrarAssinatura();

  const onSalvar = async (c: Campos) => {
    const erro = validar(c);
    if (erro) {
      toast({ title: 'Valor inválido', description: erro, variant: 'destructive' });
      return;
    }
    try {
      await salvar.mutateAsync({
        companyId,
        diaVencimento: Number(c.dia),
        inicioCobranca: c.inicio,
        valorMensalPersonalizado: c.mensalPersonalizada || null,
        diasTolerancia: Number(c.tolerancia),
        valorImplantacao: implantacaoEmitida ? 0 : c.implantacao,
        vencimentoImplantacao: c.vencimentoImplantacao || null,
      });
      toast({ title: 'Cobrança salva' });
    } catch (e) {
      toast({ title: 'Erro', description: mensagemDeErro(e, 'Falha ao salvar'), variant: 'destructive' });
    }
  };

  const onEncerrar = async () => {
    try {
      await encerrar.mutateAsync(companyId);
      toast({ title: 'Assinatura encerrada', description: 'Nenhuma mensalidade nova será emitida.' });
    } catch (e) {
      toast({ title: 'Erro', description: mensagemDeErro(e, 'Falha ao encerrar'), variant: 'destructive' });
    }
  };

  return { onSalvar, onEncerrar, salvando: salvar.isPending, encerrando: encerrar.isPending };
}

// ===================== Partes do formulário =====================

function AvisosAssinatura({ assinatura, mensal, nomePlano }: {
  assinatura: Assinatura | null; mensal: number; nomePlano: string;
}) {
  return (
    <>
      {assinatura && !assinatura.ativa && (
        <Aviso className="p-3 text-xs">Assinatura encerrada: nenhuma mensalidade nova é emitida. Salvar reativa.</Aviso>
      )}
      {mensal === 0 && (
        <Aviso className="p-3 text-xs">
          O plano {nomePlano} não tem mensalidade. Sem um valor negociado, nenhuma mensalidade será emitida.
        </Aviso>
      )}
    </>
  );
}

function textoPrimeiraMensalidade(c: Campos): string {
  if (!c.inicio || !inteiroEntre(c.dia, 1, 28)) return '';
  return ` 1ª mensalidade em ${formatData(primeiroVencimento(c.inicio, Number(c.dia)))}.`;
}

function CamposContrato({ c, set, mensalDoPlano }: { c: Campos; set: SetCampos; mensalDoPlano: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="grid content-start gap-2">
        <Label htmlFor="ass-mensal">Mensalidade negociada</Label>
        <InputMoeda id="ass-mensal" value={c.mensalPersonalizada}
          onChange={(v) => set({ mensalPersonalizada: v })}
          placeholder={`${formatarReais(mensalDoPlano)} (plano)`} />
        <p className="text-xs text-muted-foreground">Opcional. Vazio usa a do plano; vale para as próximas faturas.</p>
      </div>
      <div className="grid content-start gap-2">
        <Label htmlFor="ass-dia">Dia de vencimento</Label>
        <Input id="ass-dia" type="number" min="1" max="28" value={c.dia} onChange={(e) => set({ dia: e.target.value })} />
        <p className="text-xs text-muted-foreground">De 1 a 28, para existir em todo mês.</p>
      </div>
      <div className="grid content-start gap-2">
        <Label htmlFor="ass-inicio">Cobrança a partir de</Label>
        <Input id="ass-inicio" type="date" value={c.inicio} onChange={(e) => set({ inicio: e.target.value })} />
        <p className="text-xs text-muted-foreground">
          Sugestão: hoje + {CARENCIA_PADRAO_DIAS} dias de carência.{textoPrimeiraMensalidade(c)}
        </p>
      </div>
      <div className="grid content-start gap-2">
        <Label htmlFor="ass-tol">Tolerância (dias)</Label>
        <Input id="ass-tol" type="number" min="0" max="60" value={c.tolerancia}
          onChange={(e) => set({ tolerancia: e.target.value })} />
        <p className="text-xs text-muted-foreground">Dias após o vencimento até bloquear o acesso.</p>
      </div>
    </div>
  );
}

function CamposImplantacao({ c, set }: { c: Campos; set: SetCampos }) {
  return (
    <div className="grid gap-4 rounded-md border p-3 sm:grid-cols-2">
      <div className="grid content-start gap-2">
        <Label htmlFor="ass-impl">Implantação</Label>
        <InputMoeda id="ass-impl" value={c.implantacao} onChange={(v) => set({ implantacao: v })} />
        <p className="text-xs text-muted-foreground">Emitida uma vez, ao salvar. Zero = sem implantação.</p>
      </div>
      <div className="grid content-start gap-2">
        <Label htmlFor="ass-impl-venc">Vencimento da implantação</Label>
        <Input id="ass-impl-venc" type="date" value={c.vencimentoImplantacao}
          onChange={(e) => set({ vencimentoImplantacao: e.target.value })} />
      </div>
    </div>
  );
}

function rotuloSalvar(salvando: boolean, temContrato: boolean): string {
  if (salvando) return 'Salvando...';
  return temContrato ? 'Salvar contrato' : 'Contratar';
}

function BotoesAssinatura({ assinatura, acoes, onSalvar }: {
  assinatura: Assinatura | null;
  acoes: ReturnType<typeof useAcoesAssinatura>;
  onSalvar: () => void;
}) {
  return (
    <div className="flex flex-wrap justify-end gap-2">
      {assinatura?.ativa && (
        <Button variant="ghost" className="text-destructive hover:text-destructive"
          disabled={acoes.encerrando} onClick={acoes.onEncerrar}>
          Encerrar assinatura
        </Button>
      )}
      <Button onClick={onSalvar} disabled={acoes.salvando}>{rotuloSalvar(acoes.salvando, !!assinatura)}</Button>
    </div>
  );
}

// ===================== Formulário =====================

interface Props {
  companyId: string;
  assinatura: Assinatura | null;
  plano: Plano | undefined;
  /** Limite personalizado da empresa: entra no preço pela regra de excedente. */
  limite: number | null;
  /** Já existe implantação emitida (não cancelada): não oferece outra. */
  implantacaoEmitida: boolean;
}

export function FormAssinatura({ companyId, assinatura, plano, limite, implantacaoEmitida }: Props) {
  const acoes = useAcoesAssinatura(companyId, implantacaoEmitida);
  const preco = useMemo(() => (plano ? precoDoLimite(plano, limite) : null), [plano, limite]);
  const [c, setC] = useState<Campos>(() => camposIniciais(assinatura, preco));
  const set: SetCampos = (parcial) => setC((atual) => ({ ...atual, ...parcial }));

  useEffect(() => { setC(camposIniciais(assinatura, preco)); }, [assinatura, preco]);

  const mensalDoPlano = preco?.mensal ?? 0;
  const mensal = valorMensalEfetivo(c.mensalPersonalizada || null, mensalDoPlano);

  return (
    <div className="grid gap-4">
      <AvisosAssinatura assinatura={assinatura} mensal={mensal} nomePlano={plano?.nome ?? ''} />
      <CamposContrato c={c} set={set} mensalDoPlano={mensalDoPlano} />
      {!implantacaoEmitida && <CamposImplantacao c={c} set={set} />}

      <BotoesAssinatura assinatura={assinatura} acoes={acoes} onSalvar={() => acoes.onSalvar(c)} />
    </div>
  );
}
