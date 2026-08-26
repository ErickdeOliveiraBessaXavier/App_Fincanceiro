import { Calendar, FilePlus2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ResultadoCobrancaForm } from '@/components/telecobranca/ResultadoCobrancaForm';
import { Rotulo } from '@/components/Rotulo';

/**
 * Registro do resultado da cobrança, aberto na própria ficha.
 *
 * Registrar o resultado é o objetivo da tela e acontece dezenas de vezes por
 * dia; cada registro custava abrir um modal, preencher, salvar e fechar. Aqui o
 * formulário fica montado ao lado das parcelas: o operador digita enquanto
 * conversa e sai direto para o próximo cliente da fila.
 *
 * O evento administrativo e o agendamento avulso continuam em modal — são
 * exceções no fluxo, não a rotina.
 */

interface PainelRegistroContatoProps {
  clienteId: string;
  clienteNome: string;
  onSucesso: () => void;
  /** Só chega quando a ficha foi aberta a partir de uma fila com próximo. */
  onSalvarEProximo?: () => void;
  onEventoAdministrativo: () => void;
  onAgendarRetorno: () => void;
}

export function PainelRegistroContato({
  clienteId,
  clienteNome,
  onSucesso,
  onSalvarEProximo,
  onEventoAdministrativo,
  onAgendarRetorno,
}: PainelRegistroContatoProps) {
  // Sem cabeçalho próprio: a aba da lateral já se chama "Registrar", e o título
  // repetido custava altura num formulário que precisa caber sem rolagem.
  return (
    <div className="space-y-3">
      <Card className="border-primary/20 shadow-sm">
        <CardContent className="p-3">
          <ResultadoCobrancaForm
            variante="painel"
            clienteId={clienteId}
            clienteNome={clienteNome}
            onSucesso={onSucesso}
            onCancelar={() => undefined}
            onSalvarEProximo={onSalvarEProximo}
          />
        </CardContent>
      </Card>

      {/* Fora do card: são outros tipos de registro, não variações deste. */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-1">
        <Rotulo as="span">Outras ações</Rotulo>
        <Button variant="link" size="sm" className="h-auto gap-1 p-0 text-xs" onClick={onAgendarRetorno}>
          <Calendar className="h-3 w-3" />
          Agendar retorno
        </Button>
        <Button variant="link" size="sm" className="h-auto gap-1 p-0 text-xs" onClick={onEventoAdministrativo}>
          <FilePlus2 className="h-3 w-3" />
          Registrar evento
        </Button>
      </div>
    </div>
  );
}
