import { useEffect, useState } from 'react';
import { Percent, Target } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { CarregandoConteudo } from '@/components/TelaCarregamento';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { InputMoeda } from '@/components/InputMoeda';
import { useToast } from '@/hooks/use-toast';
import { useUserRole } from '@/hooks/useUserRole';
import { useConfiguracaoEmpresa, useSalvarConfiguracaoEmpresa } from '@/lib/queries/configuracoes';

/**
 * Parâmetros de negócio da empresa.
 *
 * Duas regras que estavam sem lugar: o teto de desconto (que o gestor precisa
 * autorizar previamente) e a meta mensal de recuperação, que era uma constante
 * fixa no código do Dashboard.
 */

function CampoTetoDesconto({ valor, onChange }: { valor: string; onChange: (v: string) => void }) {
  const numero = Number(valor) || 0;
  return (
    <div className="space-y-2">
      <Label htmlFor="teto-desconto">Teto de desconto (%)</Label>
      <div className="flex items-center gap-2">
        <Input
          id="teto-desconto"
          type="number"
          min="0"
          max="100"
          step="0.5"
          value={valor}
          onChange={(e) => onChange(e.target.value)}
          className="max-w-[140px]"
        />
        <Percent className="h-4 w-4 text-muted-foreground" />
      </div>
      {numero > 0 ? (
        <div className="space-y-1 text-xs text-muted-foreground">
          <p>
            Limite normal do desconto: <strong>{numero}%</strong> sobre o valor da parcela.
            Só administrador concede, e só em pagamento feito <strong>até a data de
            vencimento</strong> — operador e vendedor não concedem.
          </p>
          <p>
            O administrador pode <strong>ultrapassar este limite</strong> quando a
            negociação exigir. Nesse caso o desconto é registrado como exceção, com o nome
            de quem concedeu e o motivo, e aparece em Relatórios › Descontos.
          </p>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          Zero desabilita o desconto por completo: ninguém consegue conceder, nem
          administrador. É o padrão até que a empresa autorize um percentual.
        </p>
      )}
    </div>
  );
}

function CampoMeta({ valor, onChange }: { valor: number; onChange: (v: number) => void }) {
  return (
    <div className="space-y-2">
      <Label>Meta mensal de recuperação</Label>
      <div className="max-w-[220px]">
        <InputMoeda value={valor} onChange={onChange} />
      </div>
      <p className="text-xs text-muted-foreground">
        {valor > 0
          ? 'Alimenta a barra de progresso do Resumo executivo.'
          : 'Zero esconde a barra de progresso do Resumo executivo.'}
      </p>
    </div>
  );
}

function CampoToleranciaQuebra({ valor, onChange }: { valor: string; onChange: (v: string) => void }) {
  const numero = Number(valor) || 0;
  return (
    <div className="space-y-2">
      <Label htmlFor="tolerancia-quebra">Tolerância para quebra de acordo (dias)</Label>
      <Input
        id="tolerancia-quebra"
        type="number"
        min="0"
        max="90"
        step="1"
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        className="max-w-[140px]"
      />
      <p className="text-xs text-muted-foreground">
        {numero > 0
          ? <>O acordo vira <strong>quebrado</strong> quando uma parcela passa de <strong>{numero} dias</strong> de atraso.</>
          : <>O acordo vira <strong>quebrado</strong> no primeiro dia de atraso de qualquer parcela.</>}
        {' '}Ele volta a ativo se o cliente regularizar e nunca é cancelado sozinho: cancelar
        continua sendo decisão do administrador. A verificação roda todo dia à meia-noite.
      </p>
    </div>
  );
}

/** Mensagem do primeiro campo inválido, ou null. */
function validarParametros(percentual: number, tolerancia: number): string | null {
  if (Number.isNaN(percentual) || percentual < 0 || percentual > 100) {
    return 'Teto de desconto: informe um valor entre 0 e 100.';
  }
  if (!Number.isInteger(tolerancia) || tolerancia < 0 || tolerancia > 90) {
    return 'Tolerância: informe um número inteiro de dias entre 0 e 90.';
  }
  return null;
}

export default function Configuracoes() {
  const { isAdmin, isLoading: roleLoading } = useUserRole();
  const { data: config, isLoading } = useConfiguracaoEmpresa();
  const salvar = useSalvarConfiguracaoEmpresa();
  const { toast } = useToast();

  const [teto, setTeto] = useState('0');
  const [meta, setMeta] = useState(0);
  const [tolerancia, setTolerancia] = useState('10');

  useEffect(() => {
    if (!config) return;
    setTeto(String(config.desconto_maximo_percentual ?? 0));
    setMeta(Number(config.meta_recuperacao_mensal ?? 0));
    setTolerancia(String(config.dias_tolerancia_quebra ?? 10));
  }, [config]);

  const confirmar = async () => {
    const percentual = Number(teto);
    const dias = Number(tolerancia);
    const erro = validarParametros(percentual, dias);
    if (erro) {
      toast({ title: 'Valor inválido', description: erro, variant: 'destructive' });
      return;
    }
    try {
      await salvar.mutateAsync({
        descontoMaximoPercentual: percentual,
        metaRecuperacaoMensal: meta,
        diasToleranciaQuebra: dias,
      });
      toast({ title: 'Configurações salvas', description: 'Os novos parâmetros já valem para a empresa.' });
    } catch (e) {
      toast({
        title: 'Erro',
        description: e instanceof Error ? e.message : 'Não foi possível salvar',
        variant: 'destructive',
      });
    }
  };

  if (roleLoading || isLoading) return <CarregandoConteudo />;

  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">Apenas administradores podem alterar as configurações.</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-fade-in pb-10">
      <PageHeader
        title="Configurações"
        description="Parâmetros de negócio que valem para toda a empresa."
      />

      <Card>
        <CardHeader variant="faixa">
          <CardTitle className="flex items-center gap-2 text-lg font-bold tracking-tight">
            <Target className="h-5 w-5 text-primary" />
            Política de cobrança
          </CardTitle>
          <CardDescription className="text-xs font-medium">
            Alterações passam a valer imediatamente para toda a equipe.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6 pt-6">
          {/* Uma coluna até xl; a partir daí os três parâmetros lado a lado, para
              não deixar a metade direita da tela vazia. */}
          <div className="grid gap-8 xl:grid-cols-3">
            <CampoTetoDesconto valor={teto} onChange={setTeto} />
            <CampoMeta valor={meta} onChange={setMeta} />
            <CampoToleranciaQuebra valor={tolerancia} onChange={setTolerancia} />
          </div>

          <div className="flex justify-end border-t border-border/50 pt-4">
            <Button onClick={confirmar} disabled={salvar.isPending}>
              {salvar.isPending ? 'Salvando...' : 'Salvar'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
