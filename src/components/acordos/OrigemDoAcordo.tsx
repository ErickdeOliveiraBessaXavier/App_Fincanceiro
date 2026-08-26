import { FileText } from 'lucide-react';
import { useOrigemAcordo, type TituloOrigem } from '@/lib/queries/acordos';
import { formatData } from '@/utils/format';

/**
 * De onde o acordo veio: título e parcelas que a novação liquidou.
 *
 * O modal mostrava o acordo como se ele nascesse do nada — a origem só aparecia
 * como número de documento na listagem. Quando o cliente contesta ("esse acordo
 * é de qual parcela?"), a resposta estava só no banco.
 */

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value ?? 0);

/** Rótulo do título: número do documento quando existe, id curto quando não. */
function rotuloTitulo(titulo: TituloOrigem): string {
  return titulo.numeroDocumento
    ? `Título ${titulo.numeroDocumento}`
    : `Título ${titulo.tituloId.slice(0, 8)}`;
}

function LinhaParcela({ numero, vencimento, valor }: {
  numero: number | null;
  vencimento: string | null;
  valor: number;
}) {
  return (
    <li className="flex items-baseline justify-between gap-3 text-xs">
      {/* Sem truncate: numa coluna estreita a data era a primeira a sumir, e é
          justamente ela que identifica a parcela para o cliente. */}
      <span className="min-w-0 text-muted-foreground">
        {numero ? `Parcela ${numero}` : 'Parcela'}
        {vencimento ? ` · venc. ${formatData(vencimento)}` : ''}
      </span>
      <span className="shrink-0 tabular-nums">{formatCurrency(valor)}</span>
    </li>
  );
}

function CardTituloOrigem({ titulo }: { titulo: TituloOrigem }) {
  return (
    <div className="rounded-lg border border-border/60 p-3">
      {/* Sem truncate no número do documento: numa coluna estreita ele virava
          "Título 124…", que não identifica nada. */}
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <span className="min-w-0 break-all text-sm font-medium">{rotuloTitulo(titulo)}</span>
        <span className="shrink-0 text-sm font-semibold tabular-nums">
          {formatCurrency(titulo.valorLiquidado)}
        </span>
      </div>
      <ul className="mt-2 space-y-1">
        {titulo.parcelas.map((p) => (
          <LinhaParcela
            key={p.parcelaId}
            numero={p.numeroParcela}
            vencimento={p.vencimento}
            valor={p.valorLiquidado}
          />
        ))}
      </ul>
    </div>
  );
}

/** Fallback para acordos antigos, cujo lançamento de novação não gravou o acordo. */
function OrigemSemDetalhe({ documentos }: { documentos: string[] }) {
  if (documentos.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        Não foi possível identificar as parcelas de origem deste acordo.
      </p>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <FileText className="h-4 w-4 text-muted-foreground" />
      <span className="font-medium">{documentos.join(', ')}</span>
      <span className="text-xs text-muted-foreground">(parcelas não identificadas)</span>
    </div>
  );
}

interface OrigemDoAcordoProps {
  acordoId: string;
  aberto: boolean;
  /** Documentos conhecidos pelo vínculo do acordo, usados como fallback. */
  documentos: string[];
}

export function OrigemDoAcordo({ acordoId, aberto, documentos }: OrigemDoAcordoProps) {
  const { data: origem = [], isLoading } = useOrigemAcordo(acordoId, aberto);

  if (isLoading) {
    return <p className="text-xs text-muted-foreground">Carregando origem...</p>;
  }
  if (origem.length === 0) {
    return <OrigemSemDetalhe documentos={documentos} />;
  }

  return (
    <div className="space-y-2">
      {origem.map((titulo) => (
        <CardTituloOrigem key={titulo.tituloId} titulo={titulo} />
      ))}
    </div>
  );
}
