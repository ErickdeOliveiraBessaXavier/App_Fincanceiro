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

// Um desenho só — anel com o topo vazado — em três tamanhos:
//   lg  tela / página        (TelaCarregamento, CarregandoConteudo)
//   md  bloco dentro da tela (CarregandoSecao)
//   sm  dentro de botão/texto (SpinnerInline)
// Nada de anel fino `border-b-2`, ícone Loader2 ou só o texto "Carregando...":
// cada um desses era um desenho diferente para a mesma espera.
const TAMANHO_SPINNER = {
  lg: 'h-12 w-12 border-4',
  md: 'h-8 w-8 border-[3px]',
} as const;

function Spinner({ tamanho = 'lg' }: { tamanho?: keyof typeof TAMANHO_SPINNER }) {
  return (
    <div className={`${TAMANHO_SPINNER[tamanho]} animate-spin rounded-full border-primary border-t-transparent`} />
  );
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

/**
 * Carregamento de um bloco dentro da tela (aba da ficha, lista num card).
 *
 * Esses blocos tinham um anel fino próprio (`border-b-2`), copiado em 9
 * lugares e diferente do indicador do resto do app. É o mesmo desenho do
 * padrão, menor, e sem a altura de meia tela do CarregandoConteudo.
 */
export function CarregandoSecao({ className = 'py-10' }: { className?: string }) {
  return (
    <div className={`flex items-center justify-center ${className}`} role="status" aria-live="polite">
      <Spinner tamanho="md" />
      <span className="sr-only">Carregando...</span>
    </div>
  );
}

/**
 * Spinner pequeno para dentro de botão ou ao lado de um texto ("Entrando...").
 * Herda a cor do texto: branco num botão primário, cinza numa frase muted.
 * O Button já tem gap-2, então não precisa de margem.
 */
export function SpinnerInline() {
  return (
    <span
      aria-hidden="true"
      className="inline-block h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent"
    />
  );
}
