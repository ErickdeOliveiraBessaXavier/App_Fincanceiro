import { useEffect, useState } from 'react';
import { MessageSquare, CheckCircle2, AlertTriangle } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { useIntegracaoWhatsApp, useSalvarIntegracaoWhatsApp } from '@/lib/queries/integracoes';

/**
 * Configuração do canal de WhatsApp (Z-API).
 *
 * As campanhas cadastravam e pausavam, mas não tinham por onde sair. Este painel
 * é o lugar da credencial; enquanto ela não existir, o disparo fica desabilitado
 * dizendo o que falta, em vez de falhar silenciosamente.
 *
 * O token é write-only: a tela mostra se ele está preenchido, nunca o valor.
 */

function SituacaoBadge({ pronto }: { pronto: boolean }) {
  if (pronto) {
    return (
      <Badge variant="outline" className="gap-1 border-green-200 bg-green-50/50 text-green-700">
        <CheckCircle2 className="h-3 w-3" /> Conectado
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="gap-1 border-amber-300 bg-amber-50/60 text-amber-700">
      <AlertTriangle className="h-3 w-3" /> Não configurado
    </Badge>
  );
}

interface CamposCredencialProps {
  instanceId: string;
  token: string;
  clientToken: string;
  ativo: boolean;
  tokenJaConfigurado: boolean;
  clientTokenJaConfigurado: boolean;
  onInstanceId: (v: string) => void;
  onToken: (v: string) => void;
  onClientToken: (v: string) => void;
  onAtivo: (v: boolean) => void;
}

/** Rótulo e placeholder de um segredo que a tela nunca exibe de volta. */
function textosSegredo(jaConfigurado: boolean, obrigatorio: boolean) {
  return {
    sufixo: jaConfigurado ? '(já configurado)' : (obrigatorio ? '*' : '(opcional)'),
    placeholder: jaConfigurado ? 'Deixe vazio para manter' : 'Cole o valor',
  };
}

function CamposCredencial({
  instanceId, token, clientToken, ativo,
  tokenJaConfigurado, clientTokenJaConfigurado,
  onInstanceId, onToken, onClientToken, onAtivo,
}: CamposCredencialProps) {
  const textoToken = textosSegredo(tokenJaConfigurado, true);
  const textoClient = textosSegredo(clientTokenJaConfigurado, false);

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="zapi-instancia">ID da instância *</Label>
        <Input
          id="zapi-instancia"
          value={instanceId}
          onChange={(e) => onInstanceId(e.target.value)}
          placeholder="3AB1C2..."
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="zapi-token">Token da instância {textoToken.sufixo}</Label>
        <Input
          id="zapi-token"
          type="password"
          value={token}
          onChange={(e) => onToken(e.target.value)}
          placeholder={textoToken.placeholder}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="zapi-client-token">Client-Token da conta {textoClient.sufixo}</Label>
        <Input
          id="zapi-client-token"
          type="password"
          value={clientToken}
          onChange={(e) => onClientToken(e.target.value)}
          placeholder={textoClient.placeholder}
        />
      </div>
      <div className="flex items-center gap-2">
        <Switch id="zapi-ativo" checked={ativo} onCheckedChange={onAtivo} />
        <Label htmlFor="zapi-ativo">Canal ativo</Label>
      </div>
    </div>
  );
}

/** O canal só está pronto quando ativo, com instância e com token gravado. */
function canalPronto(integracao: { ativo: boolean; instance_id: string | null; token_configurado: boolean } | null) {
  return !!integracao?.ativo && !!integracao.instance_id && integracao.token_configurado;
}

export function IntegracaoWhatsApp() {
  const { data: integracao, isLoading } = useIntegracaoWhatsApp();
  const salvar = useSalvarIntegracaoWhatsApp();
  const { toast } = useToast();

  const [aberto, setAberto] = useState(false);
  const [instanceId, setInstanceId] = useState('');
  const [token, setToken] = useState('');
  const [clientToken, setClientToken] = useState('');
  const [ativo, setAtivo] = useState(false);

  // Ao abrir, recarrega o que está gravado. Os segredos entram em branco de
  // propósito: em branco = manter o que já existe.
  useEffect(() => {
    if (!aberto) return;
    setInstanceId(integracao?.instance_id ?? '');
    setToken('');
    setClientToken('');
    setAtivo(integracao?.ativo ?? false);
  }, [aberto, integracao]);

  const pronto = canalPronto(integracao ?? null);

  const confirmar = async () => {
    if (!instanceId.trim()) {
      toast({ title: 'Instância obrigatória', description: 'Informe o ID da instância do Z-API.', variant: 'destructive' });
      return;
    }
    if (!integracao?.token_configurado && !token.trim()) {
      toast({ title: 'Token obrigatório', description: 'Informe o token da instância na primeira configuração.', variant: 'destructive' });
      return;
    }
    try {
      await salvar.mutateAsync({ instanceId, token, clientToken, ativo });
      toast({ title: 'Integração salva', description: 'As credenciais do WhatsApp foram atualizadas.' });
      setAberto(false);
    } catch (e) {
      toast({
        title: 'Erro',
        description: e instanceof Error ? e.message : 'Não foi possível salvar a integração',
        variant: 'destructive',
      });
    }
  };

  return (
    <>
      <Card className="border-none shadow-card rounded-2xl overflow-hidden">
        <CardHeader className="pb-4 border-b border-border/50 bg-muted/20">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-green-500/10 text-green-600">
                <MessageSquare className="h-4 w-4" />
              </div>
              <div>
                <CardTitle className="text-lg font-bold tracking-tight">Canal de WhatsApp</CardTitle>
                <CardDescription className="text-xs font-medium">
                  Provedor Z-API — necessário para disparar campanhas
                </CardDescription>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {!isLoading && <SituacaoBadge pronto={pronto} />}
              <Button variant="outline" size="sm" onClick={() => setAberto(true)}>
                {integracao ? 'Editar' : 'Configurar'}
              </Button>
            </div>
          </div>
        </CardHeader>
        {!pronto && !isLoading && (
          <CardContent className="pt-4">
            <p className="text-sm text-muted-foreground">
              Enquanto o canal não estiver conectado, as campanhas podem ser criadas e
              editadas, mas o disparo fica indisponível.
            </p>
          </CardContent>
        )}
      </Card>

      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Configurar WhatsApp (Z-API)</DialogTitle>
            <DialogDescription>
              Os dados ficam no painel do Z-API, em Instâncias. O token é gravado de forma
              segura e não volta a ser exibido.
            </DialogDescription>
          </DialogHeader>

          <CamposCredencial
            instanceId={instanceId}
            token={token}
            clientToken={clientToken}
            ativo={ativo}
            tokenJaConfigurado={!!integracao?.token_configurado}
            clientTokenJaConfigurado={!!integracao?.client_token_configurado}
            onInstanceId={setInstanceId}
            onToken={setToken}
            onClientToken={setClientToken}
            onAtivo={setAtivo}
          />

          <DialogFooter>
            <Button variant="outline" onClick={() => setAberto(false)}>Cancelar</Button>
            <Button onClick={confirmar} disabled={salvar.isPending}>
              {salvar.isPending ? 'Salvando...' : 'Salvar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
