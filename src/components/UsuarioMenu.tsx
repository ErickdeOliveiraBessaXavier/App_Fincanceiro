import { memo } from 'react';
import { LogOut, User } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useUserRole } from '@/hooks/useUserRole';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { AppRole } from '@/domain/perfis';
import { Rotulo } from '@/components/Rotulo';

/**
 * Identidade do usuário no cabeçalho.
 *
 * O shell não dizia quem estava logado nem com que papel — e como o papel muda o
 * que cada um enxerga no menu, as ausências ficavam inexplicáveis ("por que eu
 * não tenho Relatórios?"). O "Sair" também vivia solto no rodapé da sidebar, sem
 * dizer de quem.
 */

// Rótulos de tela dos papéis. 'operador' aparece como "Cobrador": é o termo que
// a empresa usa (ver a tela de Cobradores), 'operador' é nome interno.
const ROTULO_PAPEL: Record<AppRole, string> = {
  super_admin: 'Super admin',
  admin: 'Administrador',
  operador: 'Cobrador',
  vendedor: 'Vendedor',
};

const iniciais = (texto: string) =>
  texto
    .split(' ')
    .filter(Boolean)
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

/** Nome do perfil; sem ele, o prefixo do e-mail — nunca um espaço vazio. */
function nomeExibicao(nomePerfil: unknown, email?: string): string {
  const doPerfil = typeof nomePerfil === 'string' ? nomePerfil.trim() : '';
  if (doPerfil) return doPerfil;
  return email?.split('@')[0] || 'Usuário';
}

export const UsuarioMenu = memo(() => {
  const { user, signOut } = useAuth();
  const { role } = useUserRole();

  const nome = nomeExibicao(user?.user_metadata?.nome, user?.email);
  const papel = role ? ROTULO_PAPEL[role] : null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className="h-10 gap-2 rounded-xl px-2 hover:bg-muted"
          aria-label={`Conta de ${nome}`}
        >
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-[11px] font-bold text-primary">
            {iniciais(nome)}
          </span>
          <span className="hidden text-left leading-tight sm:block">
            <span className="block max-w-[140px] truncate text-xs font-semibold text-foreground">{nome}</span>
            {papel && <span className="block text-[10px] font-medium text-muted-foreground">{papel}</span>}
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60 rounded-xl">
        <DropdownMenuLabel className="font-normal">
          <span className="block text-sm font-semibold">{nome}</span>
          <span className="block truncate text-xs text-muted-foreground">{user?.email}</span>
          {papel && (
            <Rotulo as="span" className="mt-1 inline-flex items-center gap-1 text-primary">
              <User className="h-3 w-3" /> {papel}
            </Rotulo>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem className="rounded-lg m-1 font-medium" onClick={signOut}>
          <LogOut className="mr-2 h-4 w-4" />
          Sair
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
});
