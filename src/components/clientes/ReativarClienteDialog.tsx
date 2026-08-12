import { Archive, FileText, Handshake } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { formatCpfCnpj, formatData } from '@/utils/format';
import type { ClienteArquivado } from '@/lib/queries/clientes';

/**
 * Oferta de reativação quando o CPF/CNPJ já pertence a um cadastro arquivado.
 *
 * Antes esse caminho terminava num 409 sem explicação: a exclusão mantinha o
 * registro ocupando a chave única, e a RLS o escondia até da consulta de
 * checagem. Mesmo CPF na mesma empresa é a mesma pessoa — reativar devolve o
 * cadastro e o histórico em vez de criar um segundo registro, que deixaria a
 * dívida antiga pendurada num cliente invisível.
 */

interface ReativarClienteDialogProps {
  arquivado: ClienteArquivado | null;
  podeReativar: boolean;
  isPending: boolean;
  onCancelar: () => void;
  onConfirmar: () => void;
}

function ResumoHistorico({ arquivado }: { arquivado: ClienteArquivado }) {
  const itens = [
    { rotulo: 'títulos', valor: arquivado.titulos, icone: FileText },
    { rotulo: 'acordos', valor: arquivado.acordos, icone: Handshake },
  ].filter((i) => i.valor > 0);

  if (itens.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {itens.map(({ rotulo, valor, icone: Icone }) => (
        <Badge key={rotulo} variant="secondary" className="gap-1">
          <Icone className="h-3 w-3" />
          {valor} {rotulo}
        </Badge>
      ))}
    </div>
  );
}

export function ReativarClienteDialog({
  arquivado, podeReativar, isPending, onCancelar, onConfirmar,
}: ReativarClienteDialogProps) {
  return (
    <Dialog open={!!arquivado} onOpenChange={(aberto) => !aberto && onCancelar()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Archive className="h-5 w-5 text-muted-foreground" />
            Cadastro arquivado
          </DialogTitle>
          <DialogDescription>
            {arquivado && (
              <>
                Já existe um cadastro para {formatCpfCnpj(arquivado.cpf_cnpj)}, excluído em{' '}
                {formatData(arquivado.deleted_at)}.
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        {arquivado && (
          <div className="space-y-3">
            <div className="rounded-lg border bg-muted/30 p-3">
              <p className="font-medium">{arquivado.nome}</p>
              <p className="text-xs text-muted-foreground">{formatCpfCnpj(arquivado.cpf_cnpj)}</p>
            </div>

            <ResumoHistorico arquivado={arquivado} />

            {podeReativar ? (
              <p className="text-sm text-muted-foreground">
                Reativar devolve este cadastro com todo o histórico, aplicando os dados que
                você acabou de preencher. Campos deixados em branco mantêm o valor anterior.
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">
                A exclusão foi feita por um administrador, e só um administrador pode
                desfazê-la. Peça a reativação deste cadastro.
              </p>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onCancelar} disabled={isPending}>
            {podeReativar ? 'Cancelar' : 'Entendi'}
          </Button>
          {podeReativar && (
            <Button onClick={onConfirmar} disabled={isPending}>
              {isPending ? 'Reativando...' : 'Reativar cadastro'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
