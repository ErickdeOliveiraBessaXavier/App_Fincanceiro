import { useEffect } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import { LifeBuoy, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { MarkdownAjuda } from "@/components/ajuda/MarkdownAjuda";
import { SECOES_AJUDA, extrairTopicos, secaoPorId, type SecaoAjuda } from "@/lib/ajuda/secoes";

// Central de ajuda pública (/faq): quem lê é também a TI do cliente, que não
// tem login no sistema. Por isso fica fora do Layout e sem exigir sessão.

function Cabecalho() {
  return (
    <header className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4">
        <Link to="/faq" className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary">
            <Sparkles className="h-5 w-5 text-white" />
          </span>
          <span className="font-semibold text-foreground">CobrançaPro</span>
          <span className="hidden text-muted-foreground sm:inline">· Central de ajuda</span>
        </Link>
        <Link to="/auth" className="text-sm font-medium text-primary hover:underline">
          Entrar no sistema
        </Link>
      </div>
    </header>
  );
}

function MenuSecoes({ atual }: { atual: SecaoAjuda }) {
  return (
    <nav aria-label="Seções da ajuda" className="flex gap-2 overflow-x-auto lg:flex-col lg:overflow-visible">
      {SECOES_AJUDA.map((s) => (
        <Link
          key={s.id}
          to={`/faq?secao=${s.id}`}
          className={cn(
            "shrink-0 rounded-md px-3 py-2 text-sm font-medium transition-colors",
            s.id === atual.id ? "bg-primary text-primary-foreground" : "text-foreground hover:bg-muted",
          )}
        >
          {s.titulo}
        </Link>
      ))}
    </nav>
  );
}

function IndiceDaSecao({ secao }: { secao: SecaoAjuda }) {
  const topicos = extrairTopicos(secao.markdown);
  if (topicos.length === 0) return null;
  return (
    <nav aria-label="Nesta seção" className="hidden lg:block">
      <p className="mb-2 px-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Nesta seção</p>
      <ul className="space-y-1">
        {topicos.map((t) => (
          <li key={t.id}>
            <a href={`#${t.id}`} className="block rounded-md px-3 py-1 text-sm text-muted-foreground hover:bg-muted hover:text-foreground">
              {t.titulo}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

// Link com #topico (ex.: mandado ao cliente): o texto é montado depois do
// carregamento, então o navegador não acha o alvo sozinho na primeira vez.
function useRolarParaAncora(chave: string) {
  const { hash } = useLocation();
  useEffect(() => {
    if (!hash) {
      window.scrollTo(0, 0);
      return;
    }
    document.getElementById(decodeURIComponent(hash.slice(1)))?.scrollIntoView();
  }, [chave, hash]);
}

export default function Ajuda() {
  const [params] = useSearchParams();
  const secao = secaoPorId(params.get("secao"));
  useRolarParaAncora(secao.id);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Cabecalho />
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-8 lg:grid-cols-[260px_minmax(0,1fr)]">
        <aside className="space-y-6 lg:sticky lg:top-24 lg:max-h-[calc(100vh-7rem)] lg:self-start lg:overflow-y-auto">
          <MenuSecoes atual={secao} />
          <IndiceDaSecao secao={secao} />
        </aside>

        <main className="min-w-0">
          <h1 className="text-3xl font-bold tracking-tight">{secao.titulo}</h1>
          <p className="mt-2 text-muted-foreground">{secao.descricao}</p>
          <div className="mt-6">
            <MarkdownAjuda markdown={secao.markdown} />
          </div>

          <footer className="mt-12 flex items-start gap-3 rounded-lg border bg-muted/40 p-4 text-sm">
            <LifeBuoy className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
            <p>
              Não encontrou o que procurava? Fale com o suporte: telefone (85) 99428-3128 ·
              e-mail <a className="text-primary hover:underline" href="mailto:eobx@hotmail.com">eobx@hotmail.com</a>
            </p>
          </footer>
        </main>
      </div>
    </div>
  );
}
