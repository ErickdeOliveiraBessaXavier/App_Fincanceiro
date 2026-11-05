# Pendências

Tudo o que está em aberto, num lugar só. **Item feito sai daqui** — o registro do
que foi feito fica nos commits, nas migrations e em [`docs/`](docs/).

Revisado em **2026-10-19**.

---

## Por onde retomar

1. **Pré-lançamento** (abaixo): contas e infraestrutura, na ordem listada. Billing pode esperar.
2. **API do ERP**: aguardando a INFARMA responder as três perguntas (qual ERP e
   quem programa; frequência; se querem aviso automático). Texto pronto em
   [`docs/api/PERGUNTAS-FREQUENTES.md`](docs/api/PERGUNTAS-FREQUENTES.md).
   Roteiro completo de implantação de um cliente novo (com checklist):
   [`docs/IMPLANTACAO_CLIENTE.md`](docs/IMPLANTACAO_CLIENTE.md).
3. **Volume, tela de auditoria, CNAB** — quando a operação real pedir.

## Antes de lançar para cliente externo

Já conferido: confirmação de e-mail ligada, JWT hook, URLs de redirecionamento,
regras de senha, "Esqueci minha senha" e reenvio de confirmação.

### Contas e infraestrutura

Passo a passo, por importância e urgência, em
[`docs/GUIA_LANCAMENTO.md`](docs/GUIA_LANCAMENTO.md). Resumo:

1. **Agora:** Supabase Pro (backup diário), decidir o nome, revisar
   "Limpar títulos da empresa" (item abaixo).
2. **Com o nome:** marca no INPI, domínio, site no Cloudflare Pages (o Vercel
   Hobby proíbe uso comercial), SMTP pelo Resend (hoje são 2 e-mails/hora),
   Google Workspace.
3. **Depois:** Termos de Uso e Política de Privacidade (LGPD).

### Outros itens
- **Limpar títulos da empresa** (Plataforma) apaga pagamentos em cascata. Aceito
  só enquanto os dados forem de teste; rever antes do primeiro cliente real.
- **Cobrança da plataforma**: implantação + mensalidade com controle manual
  (Plataforma › Cobrança), bloqueio após a tolerância. Falta: gateway (boleto/PIX
  automático, ex.: Asaas) e aviso por e-mail antes do vencimento (depende do SMTP).
  Preços iniciais são referência de mercado — validar com os parceiros.
- **Proteção contra senha vazada** — exige plano Pro do Supabase (passo 1 do guia).

## API do ERP (api-v1)

Nenhum ERP consome a API ainda. A partir do primeiro cliente conectado: **só
acréscimos na v1**; mudança incompatível vai para a v2.

- **Antes de entregar uma chave:** rodar `node scripts/testar-api-v1.mjs` (só
  leitura). Precisa de `API_V1_CHAVE` e `API_V1_CHAVE_OUTRA_EMPRESA` no
  `.env.local` — chaves geradas na Plataforma e **revogadas depois**. Último
  resultado: 14/14 em 2026-11-05 (Teste × TS Distribuidora). **Revogar a chave
  da TS Distribuidora** usada no teste; na entrega, gerar uma nova.
- **E-mail do suporte provisório** — eobx@hotmail.com em dois lugares:
  `docs/api/README.md` e o rodapé de `src/pages/Ajuda.tsx` (/faq). Trocar pelo
  e-mail com o domínio da empresa quando existir.
- **Depois de mudar a API:** rodar também `node scripts/testar-api-v1-escrita.mjs`
  (grava dados; usa `API_V1_CHAVE_TESTE_ESCRITA`, hoje a chave da Empresa Teste
  Erick). Último resultado: 20/20 em 2026-11-05, com lote, pagamento e
  cancelamento publicados.
- **Acordo não exposto** — o ERP vê o título em acordo com saldo zero; valor e
  parcelas do acordo seriam rota nova.
- **Avisos automáticos (webhooks)** — se a INFARMA quiser ser avisada.
- **Volume da sincronização** — `_api_titulos_alterados` calcula a última
  mudança na leitura (< 1 ms com 59 títulos). Se ficar lento, materializar uma
  coluna "alterado_em" por título mantida por trigger.

## Produto

- **Senha em outras ações sensíveis** — cancelar título já exige a senha do
  admin, conferida no banco (`executarComSenha` + `_senha_confirmada_recentemente`).
  Avaliar com o gestor estender a cancelar acordo, estornar e excluir cliente:
  é o mesmo mecanismo, uma linha na RPC e um campo no diálogo.

- **Tela de feriados da empresa** (estadual/municipal) — a tabela `feriados`
  existe, sem tela. O gestor vai avaliar se é aplicável ao negócio.
- **Tela de auditoria** (`/auditoria`) — o banco já grava tudo em `audit_log`;
  falta a tela (admin vê a própria empresa, super_admin vê tudo; filtros e CSV).
  Gravar IP do autor fica junto.
- **Consulta de títulos cancelados** — o selo "Reimportado" mostra data e motivo,
  mas não há tela para o título cancelado. Só se a operação pedir.
- **Módulos financeiros** — contas bancárias, CNAB, remessa, conciliação, com
  processamento assíncrono.

## Fila do cobrador

- **"Iniciar atendimento"** — botão que abre a ficha do 1º cliente do bloco já
  com a fila carregada (`useFilaNavegacao`), sem escolher um por um.
- **Cancelar em lote** os retornos pendentes do bloco "Já pagaram".

## Volume (Rodada 3 da auditoria)

Roteiro em [`docs/auditoria/PLANO.md`](docs/auditoria/PLANO.md). Rodadas 1 e 2
feitas e corrigidas (relatórios em [`docs/auditoria/`](docs/auditoria/));
truncamento de 1000 linhas resolvido. As telas ainda trazem a empresa inteira
para o navegador e filtram lá — correto, mas lento com volume:

- **Paginação e agregação no servidor** — Títulos, Clientes e a base de métricas
  (Dashboard/Relatórios/Fila) baixam tudo. Exige levar os filtros do
  `useGlobalFilter` para o banco.
- **N+1 em `useTitulosAgrupados`** (seletor do Novo Acordo) — uma consulta de
  parcelas por título.
- **Atribuição em massa** — `useAssignCobrador/Vendedor` fazem `.in('id', ids)`
  na URL; com algumas centenas de clientes selecionados a URL passa do limite
  (erro, não corte silencioso). Trocar por RPC com array no corpo.
- **Refresh da MV** — `REFRESH MATERIALIZED VIEW CONCURRENTLY` roda a cada
  operação financeira; reavaliar sob volume.
- **Nova listagem**: se não tem limite natural, use `buscarTodas` com
  `.order(...).order('id')`. Se o `max_rows` do painel (hoje 1000) baixar,
  baixe `LINHAS_POR_LOTE` em `src/lib/buscarTodas.ts` e no espelho em
  `supabase/functions/_shared/`.
