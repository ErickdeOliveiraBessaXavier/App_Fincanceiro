import { useState } from 'react';
import { Check, Pause, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ConfirmarAcaoDestrutiva } from '@/components/ConfirmarAcaoDestrutiva';
import { useAlterarStatusEmpresa, type StatusEmpresa } from '@/lib/queries/plataforma';

/**
 * Aprovar, suspender ou reativar, conforme o status atual. Aprovar e reativar
 * só devolvem acesso, então vão direto; suspender tira todo mundo do sistema e
 * pede confirmação.
 */
interface Props {
  empresa: { id: string; nome: string; status: string };
  size?: 'sm' | 'default';
}

const ACAO: Record<string, { para: StatusEmpresa; rotulo: string; Icone: typeof Check; variante: 'default' | 'outline' }> = {
  pendente: { para: 'ativa', rotulo: 'Aprovar', Icone: Check, variante: 'default' },
  ativa: { para: 'suspensa', rotulo: 'Suspender', Icone: Pause, variante: 'outline' },
};
const REATIVAR = { para: 'ativa' as StatusEmpresa, rotulo: 'Reativar', Icone: Play, variante: 'outline' as const };

export function BotaoStatusEmpresa({ empresa, size = 'sm' }: Props) {
  const alterar = useAlterarStatusEmpresa();
  const [confirmando, setConfirmando] = useState(false);
  const acao = ACAO[empresa.status] ?? REATIVAR;

  const executar = () =>
    alterar.mutate({ id: empresa.id, status: acao.para }, { onSuccess: () => setConfirmando(false) });

  return (
    // Dentro de linha clicável: clique aqui (inclusive no diálogo, que o React
    // propaga pelo portal) não abre a empresa.
    <span className="contents" onClick={(e) => e.stopPropagation()}>
      <Button size={size} variant={acao.variante} disabled={alterar.isPending}
        onClick={() => (acao.para === 'suspensa' ? setConfirmando(true) : executar())}>
        <acao.Icone className="mr-1 h-4 w-4" /> {acao.rotulo}
      </Button>
      <ConfirmarAcaoDestrutiva
        open={confirmando}
        onOpenChange={setConfirmando}
        titulo={`Suspender ${empresa.nome}?`}
        descricao={
          <>
            <p>Ninguém desta empresa consegue mais entrar no sistema, e a integração com o ERP para.</p>
            <p>Os dados ficam guardados. Para voltar, é só clicar em <strong>Reativar</strong>.</p>
          </>
        }
        rotuloConfirmar="Suspender empresa"
        isPending={alterar.isPending}
        onConfirm={executar}
      />
    </span>
  );
}
