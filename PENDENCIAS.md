# Pendências

Tudo o que está em aberto, num lugar só. Consolidado em **2026-09-29** a partir
de `PROXIMOS_PASSOS.md`, `PLANO_ACORDOS.md` e `analise_fila.md` (apagados; ficam
no histórico do git). Item feito sai daqui.

---

## Por onde retomar (combinado em 2026-09-29)

Ordem recomendada, da mais urgente à menos urgente. Os detalhes de cada item estão nas seções abaixo.

1. **Publicar** o commit `4421c46` (correções da Rodada 1) com `git push`. Até lá, a versão no Vercel
   falha ao cancelar acordo, conceder desconto e registrar baixa de título, porque as RPCs mudaram de assinatura.
2. **Exclusão definitiva de título com pagamento** — recomendação: *bloquear*, como já é feito
   para acordo. Dinheiro recebido não se apaga; erro se corrige com estorno, título indevido se cancela.
   A "limpar empresa" da Plataforma pode ficar só enquanto os dados forem de teste.
   *Aguardando o OK do gestor.*
3. **P8 com tolerância** — recomendação: `dias_tolerancia_quebra` configurável por empresa
   (padrão 10) em `configuracoes_empresa`; job diário via `pg_cron`; o acordo vira
   'quebrado' mas **não é cancelado sozinho** (cancelar continua sendo decisão do admin).
   *Aguardando o OK do gestor.*
4. **Rodada 3, só o truncamento** — o PostgREST corta em 1000 linhas sem avisar; as listagens
   trazem tudo para o cliente. É obrigatório resolver antes do primeiro cliente real.
5. **Rodada 2 da auditoria** — já tem um item conhecido: o status `vencido` da MV e de
   `vw_parcelas_acordo_consolidadas` usa `CURRENT_DATE` em UTC (entre 21h e meia-noite, a parcela do dia aparece vencida).
6. **Pré-lançamento** (seção abaixo): SMTP, confirmação de e-mail, hook, URLs. Billing pode esperar.
7. **P6 + P9** — aproveitar que os dados ainda são de teste (tirar a coluna agora é barato).
8. **Fila, tela de auditoria, CNAB** — quando a operação real pedir.

Também em aberto: os 4 acordos de teste com diferença de centavos (gravados antes da correção)
podem ser apagados e recriados, se o gestor quiser.

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

- **P8 — acordo nunca vira "quebrado".** A RPC
  `marcar_parcelas_acordo_vencidas()` existe, mas nada a chama. Já é segura: só mexe em acordo
  vigente e usa a data de Brasília. Hoje ela quebra com 1 dia de atraso — 17 parcelas virariam
  'quebrado' de uma vez. Proposta: ver o item 3 de "Por onde retomar".
- **Exclusão definitiva de título com pagamento** ainda apaga os pagamentos em cascata
  (a de acordo foi bloqueada). Proposta: ver o item 2 de "Por onde retomar".
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

## Auditoria

Roteiro em [`Plano_Auditoria.md`](Plano_Auditoria.md).

- **Rodada 1** (dinheiro/concorrência) feita em 2026-09-29 —
  [`AUDITORIA_RODADA_1.md`](AUDITORIA_RODADA_1.md). Os 18 achados foram
  corrigidos no mesmo dia. Com o item 8 resolvido, o P8 pode ser ligado.
- Rodadas 2 e 3: pendentes.
