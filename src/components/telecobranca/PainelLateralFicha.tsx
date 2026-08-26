import { useState } from 'react';
import { ClipboardCheck, Phone, User } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AcoesRapidas } from '@/components/telecobranca/AcoesRapidas';
import { ClienteResumo } from '@/components/telecobranca/ClienteResumo';
import { PainelRegistroContato } from '@/components/telecobranca/PainelRegistroContato';
import type { ComponentProps } from 'react';

/**
 * Coluna de trabalho do operador, em abas.
 *
 * Empilhados, os três blocos (canais, formulário de registro e dados
 * cadastrais) passavam da altura da tela e obrigavam a rolar a coluna toda para
 * chegar aos botões de salvar. Em abas, cada assunto cabe inteiro.
 *
 * A aba começa em "Falar" — a primeira coisa que se faz é ligar — e pula sozinha
 * para "Registrar" assim que o operador dispara um canal: é a sequência real do
 * atendimento, sem um clique a mais no meio da ligação.
 */

type AbaLateral = 'falar' | 'registrar' | 'dados';

/** O mesmo cliente que a aba "Dados" já sabe exibir — sem um tipo paralelo. */
type Cliente = ComponentProps<typeof ClienteResumo>['cliente'];

interface PainelLateralFichaProps {
  cliente: Cliente;
  onSucesso: () => void;
  onSalvarEProximo?: () => void;
  onEventoAdministrativo: () => void;
  onAgendarRetorno: () => void;
}

const GATILHO = 'flex items-center gap-1.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground';

export function PainelLateralFicha({
  cliente,
  onSucesso,
  onSalvarEProximo,
  onEventoAdministrativo,
  onAgendarRetorno,
}: PainelLateralFichaProps) {
  const [aba, setAba] = useState<AbaLateral>('falar');

  return (
    <Tabs value={aba} onValueChange={(v) => setAba(v as AbaLateral)}>
      <TabsList className="grid w-full grid-cols-3">
        <TabsTrigger value="falar" className={GATILHO}>
          <Phone className="h-4 w-4" />
          <span className="text-xs">Falar</span>
        </TabsTrigger>
        <TabsTrigger value="registrar" className={GATILHO}>
          <ClipboardCheck className="h-4 w-4" />
          <span className="text-xs">Registrar</span>
        </TabsTrigger>
        <TabsTrigger value="dados" className={GATILHO}>
          <User className="h-4 w-4" />
          <span className="text-xs">Dados</span>
        </TabsTrigger>
      </TabsList>

      <TabsContent value="falar" className="mt-4">
        <AcoesRapidas
          telefone={cliente.telefone}
          email={cliente.email}
          onContatoIniciado={() => setAba('registrar')}
        />
      </TabsContent>

      <TabsContent value="registrar" className="mt-4">
        <PainelRegistroContato
          clienteId={cliente.id}
          clienteNome={cliente.nome}
          onSucesso={onSucesso}
          onSalvarEProximo={onSalvarEProximo}
          onEventoAdministrativo={onEventoAdministrativo}
          onAgendarRetorno={onAgendarRetorno}
        />
      </TabsContent>

      <TabsContent value="dados" className="mt-4">
        <ClienteResumo cliente={cliente} />
      </TabsContent>
    </Tabs>
  );
}
