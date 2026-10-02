import { Gauge } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { CarregandoSecao } from '@/components/TelaCarregamento';
import { BarraUsoPlano } from '@/components/plano/BarraUsoPlano';
import { useUsoDoPlano } from '@/lib/queries/planos';
import { formatData } from '@/utils/format';

/**
 * Plano da empresa, só leitura: trocar de plano é com a plataforma. Conta todo
 * título não cancelado (em aberto, vencido, pago ou em acordo).
 */
export function CardPlano() {
  const { data, isLoading } = useUsoDoPlano();

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
      </CardContent>
    </Card>
  );
}
