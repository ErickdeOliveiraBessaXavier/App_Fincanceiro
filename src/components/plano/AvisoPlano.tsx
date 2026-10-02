import { Link } from 'react-router-dom';
import { AlertTriangle, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useUserRole } from '@/hooks/useUserRole';
import { useUsoDoPlano, type PlanoDaEmpresa } from '@/lib/queries/planos';
import { descreverUso, diasRestantes, usoMereceAviso } from '@/domain/plano';

function textoDoPrazo(dias: number): string {
  return dias === 1 ? 'termina em 1 dia' : `termina em ${dias} dias`;
}

/** Mensagens a mostrar, na ordem de importância. Vazio = nada a avisar. */
function mensagensDoPlano(p: PlanoDaEmpresa): string[] {
  const mensagens: string[] = [];
  const dias = diasRestantes(p.acessoExpiraEm);
  if (dias !== null && dias > 0) {
    mensagens.push(`Plano ${p.planoNome}: o acesso ${textoDoPrazo(dias)}.`);
  }
  if (usoMereceAviso(p)) {
    mensagens.push(`Uso do plano: ${descreverUso(p)}.`);
  }
  return mensagens;
}

/**
 * Faixa no topo do app para o administrador: prazo do teste correndo e uso do
 * limite a partir de 80%. Sem isto o gestor só descobriria o limite quando a
 * importação (ou o ERP) começasse a ser recusada.
 */
export function AvisoPlano() {
  const { isAdmin } = useUserRole();
  const { data } = useUsoDoPlano(null, isAdmin);
  if (!isAdmin || !data) return null;

  const mensagens = mensagensDoPlano(data);
  if (mensagens.length === 0) return null;

  const esgotado = data.faixa === 'esgotado';
  const Icone = esgotado ? AlertTriangle : Clock;
  return (
    <div
      role="status"
      className={cn(
        'flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-b px-4 py-2 text-xs sm:px-6',
        esgotado
          ? 'border-destructive/20 bg-destructive/10 text-destructive'
          : 'border-warning/30 bg-warning/10 text-warning-strong',
      )}
    >
      <Icone className="h-4 w-4 shrink-0" />
      <span className="flex-1">{mensagens.join(' ')} Para mudar de plano, fale com o suporte.</span>
      <Link to="/configuracoes" className="font-medium underline underline-offset-2">
        Ver plano
      </Link>
    </div>
  );
}
