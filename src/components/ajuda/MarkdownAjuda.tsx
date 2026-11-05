import { isValidElement, useState, type ReactNode } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { Check, Copy } from "lucide-react";
import { slug } from "@/lib/ajuda/secoes";

// Texto puro de um nó React (título com `código` dentro, bloco de código).
function textoDe(no: ReactNode): string {
  if (typeof no === "string" || typeof no === "number") return String(no);
  if (Array.isArray(no)) return no.map(textoDe).join("");
  if (isValidElement<{ children?: ReactNode }>(no)) return textoDe(no.props.children);
  return "";
}

// Bloco de código com botão "Copiar": a TI cola o exemplo direto no terminal.
function BlocoCodigo({ children }: { children?: ReactNode }) {
  const [copiado, setCopiado] = useState(false);
  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(textoDe(children).replace(/\n$/, ""));
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      // Sem permissão de área de transferência: o texto continua selecionável.
    }
  };
  return (
    <div className="group relative not-prose my-4">
      <button
        type="button"
        onClick={copiar}
        className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-md border border-white/20 bg-white/10 px-2 py-1 text-xs text-slate-100 hover:bg-white/20"
      >
        {copiado ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
        {copiado ? "Copiado" : "Copiar"}
      </button>
      <pre className="overflow-x-auto rounded-lg bg-slate-900 p-4 pr-24 text-[13px] leading-relaxed text-slate-100">
        {children}
      </pre>
    </div>
  );
}

const componentes: Components = {
  // scroll-mt: o título não fica escondido atrás do cabeçalho fixo ao pular pelo índice.
  h2: ({ children }) => <h2 id={slug(textoDe(children))} className="scroll-mt-24">{children}</h2>,
  h3: ({ children }) => <h3 id={slug(textoDe(children))} className="scroll-mt-24">{children}</h3>,
  pre: ({ children }) => <BlocoCodigo>{children}</BlocoCodigo>,
  // Tabela larga (a de erros) rola de lado no celular, sem empurrar a página.
  table: ({ children }) => (
    <div className="overflow-x-auto">
      <table>{children}</table>
    </div>
  ),
};

export function MarkdownAjuda({ markdown }: { markdown: string }) {
  return (
    <article
      className="prose prose-slate max-w-none dark:prose-invert
        prose-headings:text-foreground prose-h2:mt-10 prose-h2:border-b prose-h2:pb-2
        prose-code:rounded prose-code:bg-muted prose-code:px-1 prose-code:py-0.5 prose-code:font-normal
        prose-code:before:content-none prose-code:after:content-none
        prose-table:text-sm prose-th:text-left"
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={componentes}>
        {markdown}
      </ReactMarkdown>
    </article>
  );
}
