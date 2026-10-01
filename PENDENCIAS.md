# Pendências

Tudo o que está em aberto, num lugar só. Consolidado em **2026-09-29** a partir
de `PROXIMOS_PASSOS.md`, `PLANO_ACORDOS.md` e `analise_fila.md` (apagados; ficam
no histórico do git). Item feito sai daqui.

---

## Por onde retomar (atualizado em 2026-09-30)

Ordem recomendada, da mais urgente à menos urgente. Os detalhes de cada item estão nas seções abaixo.

1. **Pré-lançamento** (seção abaixo): SMTP, confirmação de e-mail, hook, URLs. Billing pode esperar.
2. **Fila, tela de auditoria, CNAB** — quando a operação real pedir.

Os 4 acordos de teste com diferença de centavos foram recriados em 2026-09-30 (mesmo valor combinado,
resíduo na última parcela, pagamentos válidos relançados com a mesma data e meio; os estornos de teste
de 13/08 não foram reproduzidos). Hoje: 14 acordos, nenhum com diferença.

Feito em 2026-09-30 (migration `20260930120000`): push da Rodada 1; exclusão definitiva de
título com lançamento **bloqueada**; **P8 ligado** com tolerância de 10 dias (ver "Acordos").
Também em 2026-09-30: **truncamento de 1000 linhas resolvido** — toda listagem sem limite
natural passa por `buscarTodas` (`src/lib/buscarTodas.ts`, espelho em `functions/_shared`).
O resto da Rodada 3 (volume) continua pendente — ver "Volume".
Também em 2026-09-30: **Rodada 2 auditada e corrigida** (migrations `20260930130000/140000/150000`).

Pequenos pendentes da Rodada 2:
- **Tela de feriados da empresa** (estadual/municipal) — a tabela `feriados` existe, sem tela.
  O gestor vai avaliar se é aplicável ao negócio.
- Resolvidos em 2026-09-30: CPF/CNPJ com dígito verificador em toda porta (cadastro, planilha, API,
  empresa), com CNPJ alfanumérico; E2E da Telecobrança reescritos para a ficha atual (15 testes, Chrome).
- **Cobrador de teste** criado pelo fluxo real de convite (empresa de teste, 2 clientes atribuídos +
  1 cadastrado por ele). Credenciais em `.env.local` (PLAYWRIGHT_COBRADOR_*); usado por
  `e2e/carteira/cobrador.spec.ts`. Fluxo convite → cadastro → autorização → carteira conferido ponta a ponta.

## Antes de lançar para cliente externo

Conferido em 2026-09-30 pela API: confirmação de e-mail **ligada**; JWT hook **habilitado**;
Site URL e Redirect = `app-fincanceiro.vercel.app`; regras de senha iguais às do app.
Feito no mesmo dia: "Reenviar e-mail de confirmação", "Esqueci minha senha", erros de login em português e
retirada dos números de modelo da tela de entrada ("98% de satisfação" etc.; ano do rodapé automático).
SMTP fica para depois (gestor, 2026-09-30).

- **SMTP próprio** — passo a passo em [`CONFIGURAR_SMTP.md`](CONFIGURAR_SMTP.md). **Bloqueado por domínio
  próprio** (decisão/compra do gestor). Até lá o envio embutido aceita 2 e-mails por hora, e
  confirmação, reenvio e redefinição de senha dividem esse limite.
- **Domínio próprio** — quando existir, trocar Site URL e Redirect URLs.
- **Billing/assinatura** das empresas (ex.: Stripe). Nada implementado.
- **Proteção contra senha vazada** — exige plano Pro do Supabase.

## Acordos

- **P8 ligado (2026-09-30).** Job `quebra-acordos-diaria` (pg_cron, 00:10 de Brasília) chama
  `_processar_quebra_acordos()`. O acordo vira 'quebrado' com parcela em aberto há mais de
  `configuracoes_empresa.dias_tolerancia_quebra` dias (padrão 10, editável em Configurações),
  volta a 'ativo' se regularizar e nunca é cancelado sozinho. Na 1ª execução, **6 dos 11 acordos
  ativos** de teste viram quebrados. A regra está só em `_status_devido_acordo`, usada pelo
  trigger e pelo job.
- **Limpar títulos da empresa** (Plataforma) ainda apaga pagamentos em cascata. Aceito só
  enquanto os dados forem de teste; rever antes do primeiro cliente real.
- **P6 (2026-09-30)** — `acordos.titulo_id` aposentada em duas etapas. Etapa 1 (`20260930160000`,
  aplicada): recebimento de acordo ganhou `titulo_pesos` (rateio pelo liquidado de cada título) e a
  exportação de Relatórios rateia em vez de pôr tudo no primeiro título. Etapa 2
  (`20260930170000`) aplicada no mesmo dia, depois de confirmar o front novo servido pelo Vercel:
  a coluna não existe mais.
- **P9 (2026-09-30)** — selo "Reimportado" em Títulos e na ficha, com data e motivo dos cancelamentos
  anteriores do mesmo número. Sem link: não existe tela para título cancelado (o histórico fica no
  banco). Se a operação pedir, fazer uma tela de consulta de cancelados.

## Fila do cobrador

Ideias que sobraram da análise da `/fila` (a tela foi refeita por outro
caminho — ver memória `fila-e-ficha-produtividade`):

- **"Iniciar atendimento"** — botão que abre a ficha do 1º cliente do bloco já
  com a fila carregada (`useFilaNavegacao`), sem escolher um por um.
- **Cancelar em lote** os retornos pendentes do bloco "Já pagaram".

## API do ERP (api-v1)

- **Nenhum ERP consome a API ainda** (confirmado pelo gestor em 2026-10-01: a
  INFARMA não iniciou a integração). As mudanças de contrato de 2026-10-01
  (`situacao` com acordo, sincronização incremental) não afetaram ninguém. A
  partir do primeiro cliente conectado: **só acréscimos na v1**.
- **Antes de entregar a chave à INFARMA:** rodar `node scripts/testar-api-v1.mjs`
  (só leitura; autenticação, situações, sincronização, paginação, título em
  acordo e isolamento entre empresas). Precisa de `API_V1_CHAVE` e
  `API_V1_CHAVE_OUTRA_EMPRESA` no `.env.local` — chaves geradas na Plataforma
  e revogadas depois.
- **Revogar a chave de teste "Erick - teste"** (`erp_live_vaJGMEpX…`, ativa
  desde 2026-08-19, empresa de teste) pela Plataforma. Os dados de teste da API
  (título `API-TESTE-1`, cliente "Teste Integracao LTDA") já estavam limpos em
  2026-10-01.
- **Volume da sincronização** — `_api_titulos_alterados` calcula a última
  mudança na leitura (agrega razão e acordos da empresa inteira a cada chamada;
  < 1 ms com 59 títulos). Se ficar lento, materializar uma coluna "alterado_em"
  por título mantida por trigger (entra na Rodada 3, "Volume").
- **Acordo não exposto** — o ERP vê o título em acordo com saldo zero; valor e
  parcelas do acordo seriam rota nova (V2).

## Produto (futuro)

- **Tela de auditoria** (`/auditoria`) — o banco já grava tudo em `audit_log`;
  falta a tela (admin vê a própria empresa, super_admin vê tudo; filtros e CSV).
  Gravar IP do autor fica junto.
- **Módulos financeiros** — contas bancárias, CNAB, remessa, conciliação, com
  processamento assíncrono.
- **Refresh da MV** — `REFRESH MATERIALIZED VIEW CONCURRENTLY` roda a cada
  operação financeira; reavaliar sob volume (entra na Rodada 3 de
  [`Plano_Auditoria.md`](Plano_Auditoria.md)).

## Volume (resto da Rodada 3)

O truncamento está resolvido, mas as telas ainda trazem a empresa inteira para o navegador
e filtram lá. Isso é correto, mas fica lento com volume. Anotado ao resolver o truncamento:

- **Paginação e agregação no servidor** — Títulos, Clientes e a base de métricas
  (Dashboard/Relatórios/Fila) baixam tudo. Exige levar os filtros do `useGlobalFilter` para o banco.
- **N+1 em `useTitulosAgrupados`** (seletor do Novo Acordo) — uma consulta de parcelas por título.
- **Atribuição em massa** — `useAssignCobrador/Vendedor` fazem `.in('id', ids)` na URL; com
  algumas centenas de clientes selecionados a URL passa do limite (erro, não corte silencioso).
  Trocar por RPC com array no corpo.
- **Nova listagem**: se não tem limite natural, use `buscarTodas` com `.order(...).order('id')`.
  Se o `max_rows` do painel (hoje 1000) baixar, baixe `LINHAS_POR_LOTE` nos dois arquivos.

## Auditoria

Roteiro em [`Plano_Auditoria.md`](Plano_Auditoria.md).

- **Rodada 1** (dinheiro/concorrência) feita em 2026-09-29 —
  [`AUDITORIA_RODADA_1.md`](AUDITORIA_RODADA_1.md). Os 18 achados foram
  corrigidos no mesmo dia. Com o item 8 resolvido, o P8 pode ser ligado.
- **Rodada 2** (regra de negócio/estados impossíveis) feita e corrigida em 2026-09-30 —
  [`AUDITORIA_RODADA_2.md`](AUDITORIA_RODADA_2.md).
- Rodada 3: truncamento resolvido; volume pendente (seção "Volume").
