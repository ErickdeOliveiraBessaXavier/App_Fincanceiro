import { Link } from 'react-router-dom';
import { AlertTriangle, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useUserRole } from '@/hooks/useUserRole';
import { useUsoDoPlano, type PlanoDaEmpresa } from '@/lib/queries/planos';
import { useSituacaoFinanceira, type SituacaoFinanceira } from '@/lib/queries/assinaturas';
import { descreverUso, diasRestantes, formatarNumero, usoMereceAviso } from '@/domain/plano';
import {
  TOLERANCIA_PADRAO_DIAS, dataDoBloqueio, descreverFatura, formatarReais, situacaoDaFatura,
} from '@/domain/assinatura';
import { hojeIso } from '@/domain/telecobranca/statusCobranca';
import { formatData } from '@/utils/format';

interface Mensagem {
  texto: string;
  urgente: boolean;
}

function textoDoPrazo(dias: number): string {
  return dias === 1 ? 'termina em 1 dia' : `termina em ${dias} dias`;
}

function mensagensDoPlano(p: PlanoDaEmpresa): Mensagem[] {
  const mensagens: Mensagem[] = [];
  const dias = diasRestantes(p.acessoExpiraEm);
  if (dias !== null && dias > 0) {
    mensagens.push({ texto: `Plano ${p.planoNome}: o acesso ${textoDoPrazo(dias)}.`, urgente: false });
  }
  if (usoMereceAviso(p)) {
    mensagens.push({ texto: textoDoUso(p), urgente: p.faixa === 'esgotado' });
  }
  return mensagens;
}

/** 80% e 90%: quanto ainda cabe. 100%: o que para e o que segue funcionando. */
function textoDoUso(p: PlanoDaEmpresa): string {
  if (p.faixa === 'esgotado') {
    return `Limite do plano atingido (${descreverUso(p)}): não é possível cadastrar ou importar títulos novos. Os já cadastrados seguem funcionando normalmente.`;
  }
  return `Uso do plano: ${descreverUso(p)}. Restam ${formatarNumero(p.restantes ?? 0)} títulos novos.`;
}

/**
 * Faturas em aberto: vencida (com a data do bloqueio) ou vencendo. A que já
 * bloqueia não aparece aqui — nesse caso o app inteiro dá lugar à tela de
 * bloqueio.
 */
function mensagensFinanceiras(f: SituacaoFinanceira | undefined): Mensagem[] {
  const tolerancia = f?.assinatura?.dias_tolerancia ?? TOLERANCIA_PADRAO_DIAS;
  const hoje = hojeIso();
  return (f?.faturas ?? [])
    .filter((fat) => fat.status === 'aberta')
    .map((fat) => {
      const nome = `${descreverFatura(fat)} (${formatarReais(fat.valor)})`;
      if (situacaoDaFatura(fat, tolerancia, hoje) === 'a_vencer') {
        return { texto: `${nome} vence em ${formatData(fat.vencimento)}.`, urgente: false };
      }
      const bloqueio = formatData(dataDoBloqueio(fat.vencimento, tolerancia));
      return { texto: `${nome} venceu em ${formatData(fat.vencimento)}; o acesso será bloqueado em ${bloqueio}.`, urgente: true };
    });
}

/**
 * Faixa no topo do app para o administrador: fatura do sistema vencendo ou
 * vencida, prazo do teste correndo e uso do limite a partir de 80%. Sem isto o
 * gestor só descobriria o problema quando o acesso fosse bloqueado ou a
 * importação começasse a ser recusada.
 */
export function AvisoPlano() {
  const { isAdmin } = useUserRole();
  const { data: plano } = useUsoDoPlano(null, isAdmin);
  const { data: financeiro } = useSituacaoFinanceira(isAdmin);
  if (!isAdmin) return null;

  const mensagens = [...mensagensFinanceiras(financeiro), ...(plano ? mensagensDoPlano(plano) : [])];
  if (mensagens.length === 0) return null;

  const urgente = mensagens.some((m) => m.urgente);
  const Icone = urgente ? AlertTriangle : Clock;
  return (
    <div
      role="status"
      className={cn(
        'flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-b px-4 py-2 text-xs sm:px-6',
        urgente
          ? 'border-destructive/20 bg-destructive/10 text-destructive'
          : 'border-warning/30 bg-warning/10 text-warning-strong',
      )}
    >
      <Icone className="h-4 w-4 shrink-0" />
      <span className="flex-1">{mensagens.map((m) => m.texto).join(' ')} Dúvidas, fale com o suporte.</span>
      <Link to="/configuracoes" className="font-medium underline underline-offset-2">
        Ver plano
      </Link>
    </div>
  );
}
