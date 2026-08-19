import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { Copy, KeyRound, Ban } from 'lucide-react';
import {
  useChavesApi, useCriarChaveApi, useRevogarChaveApi, type ChaveApi, type ChaveGerada,
} from '@/lib/queries/chavesApi';

/**
 * Chaves de API de uma empresa: gerar, ver quais existem e revogar.
 *
 * A chave em claro aparece uma única vez, logo após a geração. Depois disso a
 * tela só mostra o prefixo — não é limitação da interface, é o banco que não
 * guarda a chave inteira.
 */

const ENDPOINT_BASE = `${import.meta.env.VITE_SUPABASE_URL?.trim() ?? ''}/functions/v1/api-v1`;

const fmtQuando = (d: string | null) =>
  d ? new Date(d).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—';

// ===================== Subcomponentes =====================

function BlocoCopiavel({ valor, rotulo }: { valor: string; rotulo: string }) {
  const { toast } = useToast();
  const copiar = async () => {
    await navigator.clipboard.writeText(valor);
    toast({ title: `${rotulo} copiado` });
  };
  // A chave é uma única "palavra" de ~50 caracteres. Mantê-la numa linha só
  // (com scroll) empurra a largura do diálogo, porque o DialogContent é um grid
  // e o item herda a largura mínima do conteúdo. `break-all` deixa a quebra
  // acontecer em qualquer caractere: a largura mínima vira um caractere e o
  // vazamento deixa de ser possível — e de quebra a chave aparece inteira, que
  // é o que alguém quer ao conferir uma credencial antes de colar.
  return (
    <div className="flex items-start gap-2">
      <code className="min-w-0 flex-1 break-all rounded border bg-muted px-3 py-2 text-xs leading-relaxed">
        {valor}
      </code>
      <Button size="sm" variant="outline" className="shrink-0" onClick={copiar}
        title={`Copiar ${rotulo.toLowerCase()}`}>
        <Copy className="h-4 w-4" />
      </Button>
    </div>
  );
}

// A chave recém-criada, com o aviso de que é a única vez que ela aparece.
function ChaveRecemGerada({ chave }: { chave: ChaveGerada }) {
  return (
    <div className="min-w-0 space-y-3 rounded-md border border-amber-300 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/40">
      <div>
        <p className="text-sm font-semibold">Copie a chave agora</p>
        <p className="text-xs text-muted-foreground">
          Ela não volta a ser exibida. Se perder, gere outra e revogue esta.
        </p>
      </div>
      <BlocoCopiavel valor={chave.chave} rotulo="Chave" />
      <div>
        <p className="mb-1 text-xs font-medium text-muted-foreground">Endereço da API</p>
        <BlocoCopiavel valor={ENDPOINT_BASE} rotulo="Endereço" />
      </div>
    </div>
  );
}

interface LinhaChaveProps {
  chave: ChaveApi;
  revogando: boolean;
  onRevogar: (id: string) => void;
}
function LinhaChave({ chave, revogando, onRevogar }: LinhaChaveProps) {
  return (
    <div className="flex items-center justify-between gap-3 border-b py-3 last:border-b-0">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium">{chave.nome}</span>
          {chave.ativa
            ? <Badge className="bg-green-100 text-green-800">ativa</Badge>
            : <Badge variant="secondary">revogada</Badge>}
        </div>
        <p className="truncate font-mono text-xs text-muted-foreground">{chave.key_prefix}…</p>
        <p className="text-xs text-muted-foreground">
          Criada em {fmtQuando(chave.created_at)} · Último uso: {fmtQuando(chave.last_used_at)}
        </p>
      </div>
      {chave.ativa && (
        <Button size="sm" variant="ghost" className="shrink-0 text-destructive hover:text-destructive"
          disabled={revogando} onClick={() => onRevogar(chave.id)}>
          <Ban className="mr-1 h-4 w-4" /> Revogar
        </Button>
      )}
    </div>
  );
}

interface ListaChavesProps {
  chaves: ChaveApi[];
  carregando: boolean;
  revogando: boolean;
  onRevogar: (id: string) => void;
}

/**
 * A lista mostra só as chaves ativas. As revogadas continuam guardadas — são o
 * registro de quem teve acesso, até quando e qual foi o último uso, que é
 * exatamente o que se procura ao investigar um acesso indevido — mas ficam fora
 * do caminho, senão a tela vira um histórico onde deveria ser um painel.
 */
function ListaChaves({ chaves, carregando, revogando, onRevogar }: ListaChavesProps) {
  const [mostrarRevogadas, setMostrarRevogadas] = useState(false);

  const ativas = chaves.filter((c) => c.ativa);
  const revogadas = chaves.filter((c) => !c.ativa);
  const visiveis = mostrarRevogadas ? chaves : ativas;

  if (carregando) return <p className="py-4 text-sm text-muted-foreground">Carregando chaves…</p>;

  return (
    <div className="min-w-0 space-y-2">
      {visiveis.length === 0 ? (
        <p className="py-4 text-sm text-muted-foreground">
          {chaves.length === 0
            ? 'Nenhuma chave ainda. Gere uma para liberar a integração do ERP deste cliente.'
            : 'Nenhuma chave ativa. Gere uma nova para restabelecer a integração.'}
        </p>
      ) : (
        <div className="max-h-64 min-w-0 overflow-y-auto">
          {visiveis.map((c) => (
            <LinhaChave key={c.id} chave={c} revogando={revogando} onRevogar={onRevogar} />
          ))}
        </div>
      )}

      {revogadas.length > 0 && (
        <button
          type="button"
          className="text-xs text-muted-foreground underline-offset-2 hover:underline"
          onClick={() => setMostrarRevogadas((v) => !v)}
        >
          {mostrarRevogadas
            ? 'Ocultar revogadas'
            : `Mostrar ${revogadas.length} revogada${revogadas.length > 1 ? 's' : ''}`}
        </button>
      )}
    </div>
  );
}

// ===================== Diálogo =====================

interface ChavesApiDialogProps {
  empresa: { id: string; nome: string } | null;
  onClose: () => void;
}

export function ChavesApiDialog({ empresa, onClose }: ChavesApiDialogProps) {
  const { toast } = useToast();
  const [nome, setNome] = useState('');
  const [gerada, setGerada] = useState<ChaveGerada | null>(null);

  const chavesQuery = useChavesApi(empresa?.id ?? null);
  const criar = useCriarChaveApi();
  const revogar = useRevogarChaveApi();

  const fechar = () => {
    setNome('');
    setGerada(null);
    onClose();
  };

  const gerar = () => {
    if (!empresa || !nome.trim()) return;
    criar.mutate({ companyId: empresa.id, nome: nome.trim() }, {
      onSuccess: (chave) => {
        setGerada(chave);
        setNome('');
      },
      onError: (e: Error) =>
        toast({ title: 'Erro ao gerar chave', description: e.message, variant: 'destructive' }),
    });
  };

  const revogarChave = (id: string) => {
    if (!empresa) return;
    revogar.mutate({ id, companyId: empresa.id }, {
      onSuccess: () => toast({ title: 'Chave revogada', description: 'O ERP perde o acesso imediatamente.' }),
      onError: (e: Error) =>
        toast({ title: 'Erro ao revogar', description: e.message, variant: 'destructive' }),
    });
  };

  return (
    <Dialog open={!!empresa} onOpenChange={(o) => { if (!o) fechar(); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="h-5 w-5" /> Integração de {empresa?.nome}
          </DialogTitle>
          <DialogDescription>
            Chaves que o ERP deste cliente usa para enviar títulos e consultar saldos.
            O acesso é limitado a esta empresa.
          </DialogDescription>
        </DialogHeader>

        {gerada && <ChaveRecemGerada chave={gerada} />}

        <div className="flex gap-2">
          <Input
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder="Nome da chave (ex.: ERP do cliente)"
            onKeyDown={(e) => { if (e.key === 'Enter') gerar(); }}
          />
          <Button className="shrink-0" disabled={criar.isPending || !nome.trim()} onClick={gerar}>
            {criar.isPending ? 'Gerando…' : 'Gerar chave'}
          </Button>
        </div>

        <ListaChaves
          chaves={chavesQuery.data ?? []}
          carregando={chavesQuery.isLoading}
          revogando={revogar.isPending}
          onRevogar={revogarChave}
        />

        <DialogFooter>
          <Button variant="ghost" onClick={fechar}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
