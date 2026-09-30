import type { ClasseTitulo, FatiaSituacao } from '@/domain/metricas';
import { COR_SITUACAO } from '@/lib/graficos';
import { rotuloClasses } from '@/components/Rotulo';

/**
 * Títulos por situação, como lista de barras.
 *
 * Substitui uma rosca sem legenda nem rótulos, colorida pela posição no
 * ranking. Aqui cada linha diz o nome, a quantidade e o percentual; a cor é
 * do estado (a mesma família dos badges) e só reforça o que o texto já diz.
 * As situações se agrupam na pergunta que o gestor faz: quanto ainda é dívida
 * e quanto já foi resolvido.
 */

const GRUPOS: { titulo: string; classes: ClasseTitulo[] }[] = [
  { titulo: 'Em aberto', classes: ['vencido', 'acordo_quebrado', 'em_acordo', 'a_vencer'] },
  { titulo: 'Resolvido', classes: ['pago', 'acordo_cumprido'] },
];

const pct = (parte: number, total: number) => (total > 0 ? (parte / total) * 100 : 0);
const fmtPct = (v: number) => `${v.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;

function LinhaSituacao({ fatia, total }: { fatia: FatiaSituacao; total: number }) {
  const p = pct(fatia.value, total);
  return (
    <li
      className="space-y-1.5"
      title={`${fatia.name}: ${fatia.value} ${fatia.value === 1 ? 'título' : 'títulos'} (${fmtPct(p)})`}
    >
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="flex min-w-0 items-center gap-2">
          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: COR_SITUACAO[fatia.classe] }} />
          <span className="truncate">{fatia.name}</span>
        </span>
        <span className="shrink-0 tabular-nums">
          <span className="font-semibold text-foreground">{fatia.value}</span>
          <span className="ml-2 inline-block w-12 text-right text-xs text-muted-foreground">{fmtPct(p)}</span>
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full transition-[width] duration-500"
          style={{ width: `${p}%`, backgroundColor: COR_SITUACAO[fatia.classe] }}
        />
      </div>
    </li>
  );
}

export function SituacaoTitulos({ distribuicao }: { distribuicao: FatiaSituacao[] }) {
  const total = distribuicao.reduce((s, f) => s + f.value, 0);
  if (total === 0) {
    return <p className="py-12 text-center text-sm text-muted-foreground">Nenhum título no período.</p>;
  }
  const porClasse = new Map(distribuicao.map((f) => [f.classe, f]));

  return (
    <div className="space-y-6">
      {GRUPOS.map((grupo) => {
        const fatias = grupo.classes.map((c) => porClasse.get(c)).filter((f): f is FatiaSituacao => !!f);
        const soma = fatias.reduce((s, f) => s + f.value, 0);
        return (
          <section key={grupo.titulo} className="space-y-3">
            <div className="flex items-baseline justify-between border-b border-border/60 pb-2">
              <h4 className={rotuloClasses}>{grupo.titulo}</h4>
              <span className="text-sm tabular-nums text-muted-foreground">
                <span className="font-semibold text-foreground">{soma}</span> · {fmtPct(pct(soma, total))}
              </span>
            </div>
            <ul className="space-y-3">
              {fatias.map((f) => <LinhaSituacao key={f.classe} fatia={f} total={total} />)}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
