import {
  Home,
  FileText,
  Handshake,
  Megaphone,
  BarChart3,
  Upload,
  UserCheck,
  Users,
  Shuffle,
  ListChecks,
  Settings,
  type LucideIcon,
} from 'lucide-react';

/**
 * Telas do app, agrupadas por finalidade — a fonte única do nome de cada rota.
 *
 * O menu lateral monta os grupos a partir daqui, e a ficha do cliente usa o
 * mesmo nome no breadcrumb de volta. Antes o breadcrumb tinha "Clientes" fixo
 * e, aberto a partir de Relatórios, anunciava uma tela e levava a outra.
 *
 * Eram 11 itens numa lista plana: "Importar CSV", usado uma vez por mês, tinha
 * o mesmo peso visual que "Clientes". Os grupos separam o trabalho do dia da
 * análise e da administração.
 */

export interface MenuItem {
  title: string;
  url: string;
  icon: LucideIcon;
  /** Só admin vê. */
  admin?: boolean;
}

export interface MenuGrupo {
  label: string;
  itens: MenuItem[];
}

export const GRUPOS_MENU: MenuGrupo[] = [
  {
    label: 'Operação',
    itens: [
      { title: 'Minha fila', url: '/fila', icon: ListChecks },
      { title: 'Clientes', url: '/clientes', icon: UserCheck },
      { title: 'Títulos', url: '/titulos', icon: FileText },
      { title: 'Acordos', url: '/acordos', icon: Handshake },
      { title: 'Campanhas', url: '/campanhas', icon: Megaphone },
    ],
  },
  {
    label: 'Análise',
    itens: [
      { title: 'Resumo executivo', url: '/', icon: Home },
      { title: 'Relatórios', url: '/relatorios', icon: BarChart3 },
    ],
  },
  {
    label: 'Gestão',
    itens: [
      { title: 'Equipe', url: '/equipe', icon: Users, admin: true },
      { title: 'Atribuição', url: '/atribuicao', icon: Shuffle, admin: true },
      { title: 'Importar CSV', url: '/importar', icon: Upload, admin: true },
      { title: 'Configurações', url: '/configuracoes', icon: Settings, admin: true },
    ],
  },
];

const ITENS = GRUPOS_MENU.flatMap((g) => g.itens);

/**
 * Nome da tela de um caminho ("/relatorios?periodo=..." → "Relatórios").
 * Casa pelo pathname, ignorando query e hash; "/" só casa exato.
 */
export function rotuloDaRota(caminho: string): string | null {
  const pathname = caminho.split(/[?#]/)[0] || '/';
  const item = ITENS.find((i) =>
    i.url === '/' ? pathname === '/' : pathname === i.url || pathname.startsWith(`${i.url}/`),
  );
  return item?.title ?? null;
}
