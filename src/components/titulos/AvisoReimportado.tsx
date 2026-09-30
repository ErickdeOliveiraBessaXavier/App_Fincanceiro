import { History } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useTitulosCancelados } from '@/lib/queries/titulos';
import { formatData } from '@/utils/format';

/**
 * Selo "Reimportado" (P9): existe título CANCELADO com o mesmo número. O
 * histórico dele (baixas, estornos, acordos) continua no banco, mas não
 * aparece nas telas — quem olha o título novo precisa saber disso.
 */
export function AvisoReimportado({ numeroDocumento }: { numeroDocumento?: string | null }) {
  const { data: cancelados } = useTitulosCancelados();
  const anteriores = numeroDocumento ? cancelados?.get(numeroDocumento) : undefined;
  if (!anteriores?.length) return null;

  return (
    <Tooltip>
      {/* span: o Badge não repassa ref, e o gatilho da dica precisa dela. */}
      <TooltipTrigger asChild>
        <span tabIndex={0} className="inline-flex">
          <Badge variant="outline" className="gap-1 text-xs font-normal cursor-help">
            <History className="h-3 w-3" />
            Reimportado
          </Badge>
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs space-y-1">
        <p className="font-medium">Há histórico anterior deste número</p>
        {anteriores.map((t, i) => (
          <p key={`${t.deleted_at}-${i}`} className="text-xs">
            Cancelado em {formatData(t.deleted_at)}{t.motivo ? ` — ${t.motivo}` : ''}
          </p>
        ))}
        <p className="text-xs text-muted-foreground">
          Baixas, estornos e acordos do que foi cancelado continuam registrados no sistema.
        </p>
      </TooltipContent>
    </Tooltip>
  );
}
