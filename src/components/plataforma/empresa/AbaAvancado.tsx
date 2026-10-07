import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ConfirmarAcaoDestrutiva } from '@/components/ConfirmarAcaoDestrutiva';
import { useLimparTitulosEmpresa } from '@/lib/queries/plataforma';

/**
 * Ações raras e sem volta, separadas das do dia a dia para ninguém clicar sem
 * querer. Hoje só "limpar títulos" (recomeçar uma importação do zero).
 */
export function AbaAvancado({ empresa }: { empresa: { id: string; nome: string } }) {
  const limpar = useLimparTitulosEmpresa();
  const [confirmando, setConfirmando] = useState(false);

  return (
    <div className="grid gap-4">
      <div className="rounded-lg border border-destructive/30 p-4">
        <h3 className="text-sm font-semibold text-destructive">Apagar todos os títulos</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Use só para recomeçar uma importação que deu errado. Apaga todos os títulos desta empresa, com parcelas,
          pagamentos, acordos e anexos. Clientes, cobradores e vendedores continuam. <strong>Não dá para desfazer.</strong>
        </p>
        <Button variant="destructive" size="sm" className="mt-3" onClick={() => setConfirmando(true)}>
          <Trash2 className="mr-1 h-4 w-4" /> Apagar todos os títulos
        </Button>
      </div>

      <ConfirmarAcaoDestrutiva
        open={confirmando}
        onOpenChange={setConfirmando}
        titulo="Apagar todos os títulos"
        descricao={<>Todos os títulos de <strong>{empresa.nome}</strong> serão apagados do banco, sem volta.</>}
        textoConfirmacao={empresa.nome}
        rotuloConfirmar="Apagar todos os títulos"
        isPending={limpar.isPending}
        onConfirm={() => limpar.mutate(empresa.id, { onSuccess: () => setConfirmando(false) })}
      />
    </div>
  );
}
