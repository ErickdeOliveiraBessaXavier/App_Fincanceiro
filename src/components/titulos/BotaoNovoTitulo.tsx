import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useUsoDoPlano } from '@/lib/queries/planos';
import { formatarNumero } from '@/domain/plano';

/**
 * "Novo Título", travado quando o plano chega a 100%. Quem recusa de verdade
 * é a trigger do banco; aqui só se evita abrir um formulário que não vai
 * salvar. Os títulos já cadastrados seguem com baixa, acordo e edição.
 */
export function BotaoNovoTitulo({ onClick }: { onClick: () => void }) {
  const { data: uso } = useUsoDoPlano();
  const esgotado = uso?.faixa === 'esgotado';
  return (
    <div className="flex flex-col items-end gap-1">
      <Button onClick={onClick} disabled={esgotado}>
        <Plus className="h-4 w-4 mr-2" />
        Novo Título
      </Button>
      {esgotado && uso.limite !== null && (
        <p className="text-xs text-destructive">
          Limite de {formatarNumero(uso.limite)} títulos do plano atingido.
        </p>
      )}
    </div>
  );
}
