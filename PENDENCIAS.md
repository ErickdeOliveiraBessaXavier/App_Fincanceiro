# Pendências

Tudo o que está em aberto, num lugar só. Consolidado em **2026-09-29** a partir
de `PROXIMOS_PASSOS.md`, `PLANO_ACORDOS.md` e `analise_fila.md` (apagados; ficam
no histórico do git). Item feito sai daqui.

---

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
  `marcar_parcelas_acordo_vencidas()` existe, mas nada a chama. Opções: chamar
  ao abrir a tela de Acordos (como `refresh_mv_parcelas`) ou agendar via pg_cron.
  Enquanto isso, o status `quebrado` praticamente não acontece.
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

Roteiro em [`Plano_Auditoria.md`](Plano_Auditoria.md). Nenhuma das 3 rodadas
foi executada ainda — começar pela Rodada 1.
