// Central de ajuda (/faq): cada seção é um arquivo .md de docs/. A página lê o
// MESMO arquivo que vai para o cliente — não existe uma cópia do texto em JSX
// que poderia ficar diferente da documentação.
import referenciaApi from "../../../docs/api/README.md?raw";
import perguntasIntegracao from "../../../docs/ajuda/integracao-perguntas.md?raw";

export type SecaoAjuda = {
  id: string;
  titulo: string;
  descricao: string;
  markdown: string;
};

export type Topico = { id: string; titulo: string };

// O título da seção já aparece no topo da página; o "# Título" do arquivo
// repetiria a mesma linha logo abaixo.
function semTituloPrincipal(markdown: string): string {
  return markdown.replace(/^\s*# .*\r?\n/, "");
}

export const SECOES_AJUDA: SecaoAjuda[] = [
  {
    id: "integracao",
    titulo: "Integração com o ERP",
    descricao: "Como funciona, o que precisamos saber da sua empresa, segurança e prazos.",
    markdown: perguntasIntegracao,
  },
  {
    id: "api",
    titulo: "API — referência técnica",
    descricao: "Endereço, autenticação, rotas, exemplos e erros, para a equipe de TI.",
    markdown: semTituloPrincipal(referenciaApi),
  },
];

export function secaoPorId(id: string | null): SecaoAjuda {
  return SECOES_AJUDA.find((s) => s.id === id) ?? SECOES_AJUDA[0];
}

// Mesmo identificador para o índice (lido do markdown) e para o título
// renderizado (lido do texto na tela): os dois passam por aqui.
export function slug(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// Texto visível do título: tira a crase de `código`, que não aparece na tela.
function textoDoTitulo(linha: string): string {
  return linha.replace(/^##\s+/, "").replace(/`/g, "").trim();
}

// Títulos "## " fora de bloco de código viram o índice da seção.
export function extrairTopicos(markdown: string): Topico[] {
  const topicos: Topico[] = [];
  let dentroDeCodigo = false;
  for (const linha of markdown.split(/\r?\n/)) {
    if (linha.startsWith("```")) dentroDeCodigo = !dentroDeCodigo;
    if (dentroDeCodigo || !linha.startsWith("## ")) continue;
    const titulo = textoDoTitulo(linha);
    topicos.push({ id: slug(titulo), titulo });
  }
  return topicos;
}
