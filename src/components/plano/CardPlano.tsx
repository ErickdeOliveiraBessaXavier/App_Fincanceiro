import { Gauge } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { CarregandoSecao } from '@/components/TelaCarregamento';
import { BarraUsoPlano } from '@/components/plano/BarraUsoPlano';
import { useUsoDoPlano } from '@/lib/queries/planos';
import { useSituacaoFinanceira, type SituacaoFinanceira } from '@/lib/queries/assinaturas';
import {
  TOLERANCIA_PADRAO_DIAS, descreverFatura, descreverSituacao, formatarReais, primeiroVencimento, situacaoDaFatura,
} from '@/domain/assinatura';
import { hojeIso } from '@/domain/telecobranca/statusCobranca';
import { cn } from '@/lib/utils';
import { formatData } from '@/utils/format';

const COR_SITUACAO: Record<string, string> = {
  paga: 'text-success',
  vencida: 'text-destructive',
  bloqueando: 'text-destructive',
};

/** Mensalidade e últimas faturas. Só o admin recebe estes dados do banco. */
function ResumoCobranca({ financeiro }: { financeiro: SituacaoFinanceira }) {
  const { assinatura, faturas = [] } = financeiro;
  if (!assinatura && faturas.length === 0) return null;
  const hoje = hojeIso();
  const tolerancia = assinatura?.dias_tolerancia ?? TOLERANCIA_PADRAO_DIAS;
  const carenciaCorrendo = assinatura && assinatura.inicio_cobranca > hoje;

  return (
    <div className="space-y-2 border-t pt-4">
      {assinatura && (
        <p className="text-sm">
          Mensalidade: <strong>{formatarReais(assinatura.valor_mensal)}</strong>, vencimento todo dia{' '}
          {assinatura.dia_vencimento}.
          {carenciaCorrendo && (
            <span className="text-muted-foreground">
              {' '}Primeira mensalidade em {formatData(primeiroVencimento(assinatura.inicio_cobranca, assinatura.dia_vencimento))}.
            </span>
          )}
        </p>
      )}
      {faturas.length > 0 && (
        <ul className="divide-y rounded-md border text-sm">
          {faturas.map((f) => (
            <li key={f.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-3 py-2">
              <span>{descreverFatura(f)}</span>
              <span className="tabular-nums">{formatarReais(f.valor)}</span>
              <span className={cn('text-xs', COR_SITUACAO[situacaoDaFatura(f, tolerancia, hoje)] ?? 'text-muted-foreground')}>
                {descreverSituacao(f, tolerancia, hoje)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Plano da empresa, só leitura: trocar de plano é com a plataforma. Conta todo
 * título não cancelado (em aberto, vencido, pago ou em acordo).
 */
export function CardPlano() {
  const { data, isLoading } = useUsoDoPlano();
  const { data: financeiro } = useSituacaoFinanceira();

  return (
    <Card>
      <CardHeader variant="faixa">
        <CardTitle className="flex items-center gap-2 text-lg font-semibold tracking-tight">
          <Gauge className="h-5 w-5 text-primary" />
          Plano {data ? `· ${data.planoNome}` : ''}
        </CardTitle>
        <CardDescription className="text-xs font-medium">
          Conta todo título cadastrado, exceto os cancelados: em aberto, vencido, pago ou em acordo.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 pt-6">
        {isLoading && <CarregandoSecao className="h-16" />}
        {data && <BarraUsoPlano uso={data} />}
        {data?.acessoExpiraEm && (
          <p className="text-xs text-muted-foreground">
            Acesso válido até <strong>{formatData(data.acessoExpiraEm)}</strong>.
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          Ao atingir o limite, só a inclusão de títulos novos é recusada. Consultas, baixas,
          acordos e a atualização dos títulos já cadastrados continuam normalmente. Para mudar de
          plano, fale com o suporte.
        </p>
        {financeiro && <ResumoCobranca financeiro={financeiro} />}
      </CardContent>
    </Card>
  );
}
