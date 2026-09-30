# Pendências

Tudo o que está em aberto, num lugar só. Consolidado em **2026-09-29** a partir
de `PROXIMOS_PASSOS.md`, `PLANO_ACORDOS.md` e `analise_fila.md` (apagados; ficam
no histórico do git). Item feito sai daqui.

---

## Por onde retomar (atualizado em 2026-09-30)

Ordem recomendada, da mais urgente à menos urgente. Os detalhes de cada item estão nas seções abaixo.

1. **Corrigir a Rodada 2** — relatório em [`AUDITORIA_RODADA_2.md`](AUDITORIA_RODADA_2.md) (2026-09-30):
   7 achados, 4 altos (carteira do cobrador, admin por fora do razão, status 'vencido' congelado).
   Três dúvidas aguardam o gestor (fim de semana/feriado, cobrador ver fora da carteira, papel do usuário criado).
2. **Pré-lançamento** (seção abaixo): SMTP, confirmação de e-mail, hook, URLs. Billing pode esperar.
3. **P6 + P9** — aproveitar que os dados ainda são de teste (tirar a coluna agora é barato).
4. **Fila, tela de auditoria, CNAB** — quando a operação real pedir.

Também em aberto: os 4 acordos de teste com diferença de centavos (gravados antes da correção)
podem ser apagados e recriados, se o gestor quiser.

Feito em 2026-09-30 (migration `20260930120000`): push da Rodada 1; exclusão definitiva de
título com lançamento **bloqueada**; **P8 ligado** com tolerância de 10 dias (ver "Acordos").
Também em 2026-09-30: **truncamento de 1000 linhas resolvido** — toda listagem sem limite
natural passa por `buscarTodas` (`src/lib/buscarTodas.ts`, espelho em `functions/_shared`).
O resto da Rodada 3 (volume) continua pendente — ver "Volume".

## Antes de lançar para cliente externo

- **SMTP próprio** — passo a passo em [`CONFIGURAR_SMTP.md`](CONFIGURAR_SMTP.md).
- **Confirmação de e-mail ligada** no painel (Auth), se tiver sido desligada para teste.
- **JWT hook** — `custom_access_token_hook` está declarado em
  `supabase/config.toml`; confirmar que está habilitado no painel de produção
  (Auth → Hooks). O app funciona pelo fallback, mas o hook é o caminho certo.
- **URL Configuration** — Site URL e Redirect URLs com o domínio de produção.
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
- **P6 — aposentar `acordos.titulo_id`.** Duas fontes de verdade para "títulos
  do acordo": a coluna (resquício do 1:1) e `acordo_titulos` (N:N). View,
  cancelamento e trava de pagamento já usam a tabela; falta tirar a coluna.
- **P9 — sinalizar reimportação.** Quando existir título cancelado com o mesmo
  `numero_documento`, mostrar "reimportado — há histórico anterior" com link.
  Sem mudança de schema.

## Fila do cobrador

Ideias que sobraram da análise da `/fila` (a tela foi refeita por outro
caminho — ver memória `fila-e-ficha-produtividade`):

- **"Iniciar atendimento"** — botão que abre a ficha do 1º cliente do bloco já
  com a fila carregada (`useFilaNavegacao`), sem escolher um por um.
- **Cancelar em lote** os retornos pendentes do bloco "Já pagaram".

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
- **Rodada 2** (regra de negócio/estados impossíveis) feita em 2026-09-30 —
  [`AUDITORIA_RODADA_2.md`](AUDITORIA_RODADA_2.md). Correções pendentes.
- Rodada 3: truncamento resolvido; volume pendente (seção "Volume").
