// Identidade única do carregamento.
//
// O app passa por várias etapas antes de mostrar conteúdo (boot do HTML,
// sessão do Supabase, dados da empresa, chunk da rota). Antes cada etapa tinha
// seu próprio indicador — inclusive o `<div>Loading...</div>` cru do Suspense,
// que aparecia sem estilo no canto superior esquerdo. A troca entre desenhos
// diferentes é o que dava a sensação de piscada; repetindo o MESMO desenho, a
// sequência inteira parece uma tela só.
//
// O mesmo desenho existe em HTML/CSS puro dentro de index.html (#boot-loader),
// para a primeira pintura — antes do React montar — já ser esta tela. Ao mexer
// no visual aqui, ajuste lá também.

function Spinner() {
  return <div className="h-12 w-12 animate-spin rounded-full border-4 border-primary border-t-transparent" />;
}

function Conteudo({ mensagem }: { mensagem: string }) {
  return (
    <div className="flex flex-col items-center gap-4">
      <Spinner />
      <p className="text-sm text-muted-foreground">{mensagem}</p>
    </div>
  );
}

/** Carregamento de tela cheia: usado enquanto ainda não há shell para mostrar. */
export function TelaCarregamento({ mensagem = 'Carregando...' }: { mensagem?: string }) {
  return (
    <div
      className="flex min-h-screen items-center justify-center bg-background"
      role="status"
      aria-live="polite"
    >
      <Conteudo mensagem={mensagem} />
    </div>
  );
}

/**
 * Carregamento dentro da área de conteúdo — a sidebar e o cabeçalho continuam
 * na tela. O atraso na entrada evita o pisca-pisca quando o carregamento dura
 * poucos milissegundos (chunk já em cache): só aparece se realmente demorar.
 */
export function CarregandoConteudo({ mensagem = 'Carregando...' }: { mensagem?: string }) {
  return (
    <div
      className="flex min-h-[50vh] items-center justify-center animate-fade-in"
      style={{ animationDelay: '150ms', animationFillMode: 'both' }}
      role="status"
      aria-live="polite"
    >
      <Conteudo mensagem={mensagem} />
    </div>
  );
}
