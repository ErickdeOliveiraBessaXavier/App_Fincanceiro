import { useSearchParams } from 'react-router-dom';
import { PageHeader } from '@/components/PageHeader';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CarteiraPessoas, type CarteiraConfig } from '@/components/equipe/CarteiraPessoas';
import Usuarios from '@/pages/Usuarios';
import { useUserRole } from '@/hooks/useUserRole';
import {
  useCobradores, useCreateCobrador, useUpdateCobrador, useDeleteCobrador,
} from '@/lib/queries/cobradores';
import {
  useVendedores, useCreateVendedor, useUpdateVendedor, useDeleteVendedor,
} from '@/lib/queries/vendedores';

/**
 * Equipe: cobradores, vendedores e acessos num lugar só.
 *
 * Eram três entradas de menu para um conceito único — "pessoas da empresa" —
 * sendo que duas delas (Cobradores e Vendedores) eram o mesmo arquivo
 * duplicado. A aba vive na URL (?aba=), então dá para linkar direto.
 */

type Aba = 'cobradores' | 'vendedores' | 'acessos';
const ABAS: Aba[] = ['cobradores', 'vendedores', 'acessos'];

function useCarteiraCobradores(): CarteiraConfig {
  const { data: pessoas = [], isLoading } = useCobradores();
  return {
    termo: 'cobrador',
    titulo: 'Cobradores',
    descricao: 'Cada cobrador administra a sua carteira de clientes',
    vazio: 'Nenhum cobrador registrado',
    campoConvite: 'cobradorId',
    pessoas,
    isLoading,
    criar: useCreateCobrador(),
    atualizar: useUpdateCobrador(),
    excluir: useDeleteCobrador(),
    rotaCarteira: (id) => `/clientes?cobrador=${id}`,
  };
}

function useCarteiraVendedores(): CarteiraConfig {
  const { data: pessoas = [], isLoading } = useVendedores();
  return {
    termo: 'vendedor',
    titulo: 'Vendedores',
    descricao: 'Cada vendedor administra a sua carteira de vendas',
    vazio: 'Nenhum vendedor registrado',
    campoConvite: 'vendedorId',
    pessoas,
    isLoading,
    criar: useCreateVendedor(),
    atualizar: useUpdateVendedor(),
    excluir: useDeleteVendedor(),
    rotaCarteira: (id) => `/clientes?vendedor=${id}`,
  };
}

export default function Equipe() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { isAdmin, isLoading: roleLoading } = useUserRole();

  // Os dois hooks rodam sempre (regra dos hooks); a consulta é leve e o cache
  // do React Query evita refetch ao alternar as abas.
  const cobradores = useCarteiraCobradores();
  const vendedores = useCarteiraVendedores();

  const param = searchParams.get('aba') as Aba | null;
  const aba: Aba = param && ABAS.includes(param) ? param : 'cobradores';

  const trocarAba = (valor: string) => {
    setSearchParams((atual) => {
      const proximo = new URLSearchParams(atual);
      proximo.set('aba', valor);
      // A paginação é por aba; carregar a aba nova na página 3 não faz sentido.
      proximo.delete('pagina');
      return proximo;
    }, { replace: true });
  };

  if (roleLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary" />
      </div>
    );
  }
  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">Apenas administradores podem gerenciar a equipe.</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-fade-in pb-10">
      <PageHeader
        title="Equipe"
        description="Cobradores, vendedores e quem tem acesso ao sistema."
      />

      <Tabs value={aba} onValueChange={trocarAba}>
        <TabsList className="mb-6">
          <TabsTrigger value="cobradores">Cobradores</TabsTrigger>
          <TabsTrigger value="vendedores">Vendedores</TabsTrigger>
          <TabsTrigger value="acessos">Acessos</TabsTrigger>
        </TabsList>

        <TabsContent value="cobradores" className="mt-0">
          <CarteiraPessoas config={cobradores} isAdmin={isAdmin} />
        </TabsContent>

        <TabsContent value="vendedores" className="mt-0">
          <CarteiraPessoas config={vendedores} isAdmin={isAdmin} />
        </TabsContent>

        <TabsContent value="acessos" className="mt-0">
          <Usuarios embutido />
        </TabsContent>
      </Tabs>
    </div>
  );
}
