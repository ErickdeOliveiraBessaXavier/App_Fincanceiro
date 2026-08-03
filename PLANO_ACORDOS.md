# Plano — Integridade do módulo de Acordos

> Estado em **2026-08-03**. Documento de retomada: descreve o que já foi feito,
> o que falta, e como validar com Docker antes de tocar em produção.

---

## 1. Situação atual

### Banco (Supabase `cuejrnqdudadlbuiouph`)

Histórico de migrations **alinhado** (`supabase migration list --linked` sem
divergência). Aplicadas hoje:

- `20260803120000_numero_titulo_livre_apos_cancelamento.sql` — **aplicada** ✅
- `20260803130000_integridade_acordos.sql` — **escrita, NÃO aplicada** ⚠️

### Código (working tree, **nada commitado**)

| Arquivo | Mudança |
|---|---|
| `src/components/ui/dialog.tsx` | respiro lateral no mobile (desvio do upstream shadcn) |
| `src/components/ui/alert-dialog.tsx` | idem |
| `src/pages/Acordos.tsx` | modais largos, cronograma editável, layout do modal de detalhes |
| `src/components/acordos/SelecionarTitulosAcordo.tsx` | fix do 409, `Select` do sistema, `formatData` |
| `src/utils/format.ts` | `formatData` + `parseDataLocal` (novos) |
| `src/utils/format.test.ts` | novo |
| `src/utils/titulo.ts`, `src/utils/export.ts` | delegam para `formatData` |
| `src/components/telecobranca/TitulosCliente.tsx` | `formatData` |
| `src/components/dashboard/ProximosVencimentos.tsx` | `parseDataLocal` |
| `src/pages/Clientes.tsx`, `src/pages/Relatorios.tsx` | `formatData` |
| `src/domain/acordos/cronograma.ts` + `.test.ts` | novos |
| `supabase/migrations/20260803130000_*.sql` | novo |

Verificação feita: `npx tsc --noEmit` limpo, `npm test` 47/47, `npm run build` OK.
**Nenhuma mudança de layout foi validada em navegador.**

---

## 2. Próximo passo — Docker

O Docker é pré-requisito de `supabase db diff`, `db dump` e `db reset`. Sem ele
não há como validar SQL antes de produção — foi a limitação que travou a
verificação a sessão inteira.

### Instalar

1. Docker Desktop: <https://docs.docker.com/desktop/install/windows-install/>
2. Reiniciar o Windows (o WSL2 costuma exigir).
3. Conferir: `docker version` deve responder sem erro.

### Validar a migration pendente (fazer ANTES de `db push`)

```bash
supabase start          # sobe o Postgres local
supabase db reset       # aplica TODA a cadeia de migrations do zero
```

`db reset` é o teste real: se `20260803130000` tiver erro de SQL, ele falha aqui,
localmente, sem risco. Depois:

```bash
supabase db diff --linked --schema public   # drift entre repo e produção
```

Só então:

```bash
supabase db push
```

---

## 3. O que já foi feito

### 3.1 Correções pontuais

- **409 ao criar acordo** — `SelecionarTitulosAcordo.tsx` mandava o mesmo
  `titulo_id` repetido (um por parcela), estourando a UNIQUE de `acordo_titulos`.
- **Número de título queimado por cancelamento** — índice
  `idx_titulos_numero_doc` não filtrava `deleted_at`, impedindo reimportar um
  título cancelado. Corrigido e aplicado.
- **Datas exibidas um dia antes** — `new Date('2026-08-27')` é meia-noite UTC;
  formatado em fuso −3 vira 26/08. **O dado no banco sempre esteve certo.**
  Centralizado em `formatData`/`parseDataLocal` (`src/utils/format.ts`).
- **Cronograma de acordo** — datas por parcela editáveis, sugestão ancorada no
  dia da 1ª parcela, com clamp de fim de mês (31/01 + 1 mês = 28/02, não 03/03).
- **Layout** — modais de acordo largos no desktop, coluna única no mobile,
  tabela de parcelas vira cards abaixo de `md`.

### 3.2 Migration `20260803130000_integridade_acordos.sql`

| Item | O que faz |
|---|---|
| **P1** (parcial) | `vw_recebimentos` + `vw_recebimentos_tenant` unindo pagamentos de título e de acordo |
| **P2** | FK `acordos.titulo_id` de `CASCADE` → `RESTRICT`; `excluir_titulos_definitivo` recusa com mensagem; `limpar_titulos_empresa` apaga acordos antes |
| **P3** | `cancelar_titulo` recusa título com acordo ativo |
| **P4** | Trava de pagamento direto passa a usar `acordo_titulos` |
| **P5** | `eventos_parcela.acordo_id` (FK) + backfill; `cancelar_acordo` estorna só o que aquele acordo liquidou |
| **P8** | `marcar_parcelas_acordo_vencidas()` destrava o status `'quebrado'` |

---

## 4. O que falta

### P1 (metade restante) — prioridade alta

`Dashboard.tsx:103,108,215` ainda somam `total_pago` de `vw_titulos_completos`.
Repontar para `vw_recebimentos_tenant`.

**Por que importa:** `pagar_parcela_acordo` só muda `parcelas_acordo.status` —
não gera `eventos_parcela`. Logo **todo dinheiro recuperado via acordo está fora
do "valor recuperado"**. Um cliente que quitou 100% via acordo aparece com
`total_pago = 0`.

### P6 — aposentar `acordos.titulo_id`

Duas fontes de verdade para "títulos do acordo": a coluna (o "principal") e
`acordo_titulos`. A view e o cancelamento já usam a tabela; o FK ainda usa a
coluna. Fazer só depois de P4 e P5 validados.

### P7 — MV filtrar `deleted_at`

`mv_parcelas_consolidadas` (`20260531170000:808`) lê `FROM parcelas p` sem filtro,
então parcelas de títulos cancelados continuam agregadas. Hoje não vaza porque
`vw_titulos_completos` filtra `t.deleted_at IS NULL` — **proteção acidental**.

> **Risco:** exige `DROP MATERIALIZED VIEW ... CASCADE`, que derruba
> `vw_parcelas_consolidadas` e `vw_titulos_completos` junto. As três precisam ser
> recriadas na mesma migration (~200 linhas). **Só fazer com Docker**, validando
> por `db reset`.

### P8 (ligar ao app)

A RPC `marcar_parcelas_acordo_vencidas()` existe mas ninguém chama. Opções:
invocar ao abrir a tela de Acordos (como `refresh_mv_parcelas`), ou agendar.

### P9 — sinalizar reimportação na UI

Quando existir título cancelado com o mesmo `numero_documento`, mostrar
"reimportado — há histórico anterior" com link. Sem mudança de schema.

---

## 5. Riscos não verificados na migration `20260803130000`

Escrita sem Docker, **nunca executada**. Pontos específicos a conferir no
`db reset`:

1. **Nome da constraint** — o `DROP CONSTRAINT IF EXISTS acordos_titulo_id_fkey`
   assume o nome autogerado do Postgres. Se divergir, o `DROP` é silencioso e o
   `ADD` falha por duplicidade.
2. **Backfill por regex** — `substring(descricao from 'acordo ([0-9a-fA-F-]{36})')`
   depende do formato gravado por `liquidar_parcelas_titulo`. Conferir se pegou
   os eventos legados; se não, `cancelar_acordo` cai no fallback `acordo_id IS NULL`
   (comportamento antigo, sem regressão).
3. **`RESTRICT` novo** — pode travar alguma rotina de exclusão não mapeada.
   Mapeadas e tratadas: `excluir_titulos_definitivo`, `limpar_titulos_empresa`.
4. **`DROP FUNCTION liquidar_parcelas_titulo(uuid, text)`** — a assinatura muda
   para 3 argumentos; `criar_acordo` é recriada na mesma migration para
   acompanhar. Nenhum outro chamador foi encontrado.

---

## 6. Contexto arquitetural (para retomar sem reler tudo)

**Acordo = novação.** Criar um acordo LIQUIDA as parcelas originais do título
(evento `renegociacao`, efeito −1, zera o saldo) e o pagamento passa a ser
registrado em `parcelas_acordo`. Cancelar o acordo estorna esses eventos e a
dívida original volta. Pagamento direto em título renegociado é bloqueado.

**Soft delete é intencional** e vale a pena manter: há trigger
`prevent_hard_delete_financial` em `titulos`, `parcelas`, `eventos_parcela`,
`acordos` e `parcelas_acordo`. Hard delete é exclusivo do super admin.

**Cenário "título 123 → acordo → cancela → soft delete → reimporta → novo acordo":
o modelo aguenta.** Ficam dois títulos independentes com o mesmo
`numero_documento` (um cancelado, um ativo) e dois acordos separados. Não há
referência quebrada — o que falta é rastreabilidade entre as duas encarnações
(ver P9).

**Complexidade ciclomática:** regra `complexity: ["error", 10]` no ESLint,
`src/components/ui/**` isento. Ver `CLAUDE.md`.

**Baseline de lint:** `npm run lint` no projeto inteiro acusa ~138 erros
**preexistentes** (`no-explicit-any` espalhado). Lintar arquivos alterados
individualmente, não o projeto todo.
