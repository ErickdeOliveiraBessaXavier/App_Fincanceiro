import { useState } from 'react';
import { AlertTriangle, CheckCircle2, Clock } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { AbaEmpresa, Pendencia } from '@/domain/plataforma';
import type { CompanyRow } from '@/lib/queries/plataforma';
import { BotaoStatusEmpresa } from '@/components/plataforma/empresa/BotaoStatusEmpresa';

/**
 * Lista do que fazer hoje, com o botão que resolve ao lado de cada item. É a
 * porta de entrada do painel: quem não conhece a tela começa por aqui.
 */

const VISIVEIS = 6;

interface Props {
  pendencias: Pendencia[];
  empresas: Map<string, CompanyRow>;
  onAbrir: (companyId: string, aba: AbaEmpresa) => void;
}

function AcaoDaPendencia({ p, empresas, onAbrir }: { p: Pendencia } & Omit<Props, 'pendencias'>) {
  const empresa = empresas.get(p.companyId);
  if (p.acao === 'aprovar') return empresa ? <BotaoStatusEmpresa empresa={empresa} /> : null;
  const aba = p.acao;
  return <Button size="sm" variant="outline" onClick={() => onAbrir(p.companyId, aba)}>{p.rotuloAcao}</Button>;
}

function LinhaPendencia({ p, empresas, onAbrir }: { p: Pendencia } & Omit<Props, 'pendencias'>) {
  const Icone = p.gravidade === 'alta' ? AlertTriangle : Clock;
  return (
    <li className="flex flex-wrap items-center gap-3 py-2.5">
      <Icone className={cn('h-4 w-4 shrink-0', p.gravidade === 'alta' ? 'text-destructive' : 'text-warning-strong')} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{p.empresa}</p>
        <p className="text-xs text-muted-foreground">{p.texto}</p>
      </div>
      <AcaoDaPendencia p={p} empresas={empresas} onAbrir={onAbrir} />
    </li>
  );
}

export function PrecisaAtencaoCard({ pendencias, empresas, onAbrir }: Props) {
  const [todas, setTodas] = useState(false);

  if (pendencias.length === 0) {
    return (
      <Card>
        <CardContent className="flex items-center gap-3 py-5">
          <CheckCircle2 className="h-5 w-5 text-success" />
          <p className="text-sm">Tudo em dia: nenhuma empresa precisa de ação agora.</p>
        </CardContent>
      </Card>
    );
  }

  const visiveis = todas ? pendencias : pendencias.slice(0, VISIVEIS);
  return (
    <Card className="border border-warning/40">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Precisa da sua atenção ({pendencias.length})</CardTitle>
        <p className="text-xs text-muted-foreground">Os mais urgentes primeiro. O botão ao lado de cada item leva direto aonde resolver.</p>
      </CardHeader>
      <CardContent>
        <ul className="divide-y">
          {visiveis.map((p) => (
            <LinhaPendencia key={`${p.companyId}-${p.texto}`} p={p} empresas={empresas} onAbrir={onAbrir} />
          ))}
        </ul>
        {pendencias.length > VISIVEIS && (
          <Button variant="link" size="sm" className="px-0" onClick={() => setTodas((v) => !v)}>
            {todas ? 'Mostrar menos' : `Mostrar todas (${pendencias.length})`}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
