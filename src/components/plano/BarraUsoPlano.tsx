import { cn } from '@/lib/utils';
import { descreverUso, formatarNumero, type FaixaDeUso, type UsoDoPlano } from '@/domain/plano';

const COR_DA_FAIXA: Record<FaixaDeUso, string> = {
  ilimitado: 'bg-primary',
  normal: 'bg-primary',
  atencao: 'bg-warning',
  critico: 'bg-warning',
  esgotado: 'bg-destructive',
};

/** Só a barra: usada na tabela da Plataforma, onde o texto vai ao lado. */
export function BarraDeUso({ uso, className }: { uso: UsoDoPlano; className?: string }) {
  if (uso.percentual === null) return null;
  return (
    <div
      className={cn('h-1.5 w-full overflow-hidden rounded-full bg-secondary', className)}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.min(uso.percentual, 100)}
    >
      <div
        className={cn('h-full transition-all', COR_DA_FAIXA[uso.faixa])}
        style={{ width: `${Math.min(uso.percentual, 100)}%` }}
      />
    </div>
  );
}

function legendaDaFaixa(uso: UsoDoPlano): string | null {
  if (uso.faixa === 'esgotado') {
    return 'Limite atingido: títulos novos são recusados. Os já cadastrados seguem funcionando normalmente.';
  }
  if (uso.faixa === 'critico' || uso.faixa === 'atencao') {
    return `Restam ${formatarNumero(uso.restantes ?? 0)} títulos novos antes do limite.`;
  }
  return null;
}

/** "7.842 de 10.000 títulos — 78%" com a barra e, perto do limite, o que falta. */
export function BarraUsoPlano({ uso }: { uso: UsoDoPlano }) {
  const legenda = legendaDaFaixa(uso);
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium tabular-nums">{descreverUso(uso)}</p>
      <BarraDeUso uso={uso} className="h-2" />
      {legenda && (
        <p className={cn('text-xs', uso.faixa === 'esgotado' ? 'text-destructive' : 'text-warning-strong')}>
          {legenda}
        </p>
      )}
    </div>
  );
}
