# Guia de lançamento — contas e infraestrutura

O que fazer para o app operar com cliente pagante, **por ordem de importância e
urgência**. Os custos estão em `PRECIFICACAO_E_CUSTOS.txt`, seção 1.

Escrito em 2026-10-19. Item concluído sai daqui e de `PENDENCIAS.md`.

## Visão geral

| # | Passo | Por que agora | Depende de | Quem | Custo |
|---|---|---|---|---|---|
| 1 | Assinar o Supabase Pro | Sem backup diário, perder dados de cliente não tem volta | nada | Você | R$ 130/mês |
| 2 | Decidir o nome | Trava domínio, e-mail e marca | nada | Equipe | — |
| 3 | Pedir a marca no INPI | No Brasil a marca é de quem pede primeiro | 2 | Você | R$ 440 a R$ 1.100 |
| 4 | Comprar o domínio | Trava e-mail e a saída do Vercel | 2 | Você | R$ 40/ano |
| 5 | Mudar o site para o Cloudflare | O Vercel grátis proíbe uso comercial | 4 | Claude | grátis |
| 6 | E-mails automáticos (Resend) | Hoje só saem 2 e-mails de login por hora | 4 | Você + Claude | grátis |
| 7 | E-mail da equipe (Google Workspace) | Contato profissional com o cliente | 4 | Você | R$ 70/mês |
| 8 | Termos de Uso e Privacidade (LGPD) | Exigência legal: guardamos CPF e dívidas | 2 | Advogado + Claude | R$ 500 a R$ 2.000 |
| 9 | Revisar "Limpar títulos da empresa" | Apaga pagamentos em cascata | nada | Claude | — |
| 10 | Domínio .com (opcional) | Só protege o nome | 4 | Você | R$ 70/ano |

**Esta semana:** passos 1, 2 e 9, que não dependem de nada, e a parte do
passo 5 que dá para adiantar (site no Cloudflare num endereço provisório).
**Quando o nome sair:** 3 e 4 no mesmo dia; de 5 a 7 logo em seguida.
**Nas semanas seguintes:** 8.

---

## Fase 1 — Agora, sem depender de nada

### 1. Assinar o Supabase Pro · ~15 min

O plano grátis **não faz backup diário** e pausa o projeto que fica parado.
Com dados reais de cliente, esse é o maior risco que existe hoje.

- [ ] Supabase › projeto `cuejrnqdudadlbuiouph` › **Billing** › assinar o **Pro** (cartão).
- [ ] Depois de assinar: em **Authentication**, nas configurações de senha,
      ligar **"Leaked password protection"** (bloqueia senha que já vazou na
      internet; só existe no Pro).
- [ ] Conferir em **Database › Backups** que o backup diário apareceu.

### 2. Decidir o nome · depende da equipe

Hoje o app se chama **CobrançaPro**. Antes de comprar qualquer coisa, confira:

- [ ] **INPI:** busca gratuita em [busca.inpi.gov.br](https://busca.inpi.gov.br/pePI/)
      › Marca › pesquisar o nome. Olhe a **classe 42** (software) e a **classe 36**
      (serviços financeiros/cobrança). Se já existe marca igual ou parecida
      nessas classes, troque o nome.
- [ ] **Registro.br:** veja se o `.com.br` está livre em [registro.br](https://registro.br).
- [ ] Só com as duas respostas positivas, fechar o nome com a equipe.

### 9. Revisar "Limpar títulos da empresa" · Claude

O botão da Plataforma apaga títulos **e os pagamentos junto**. Foi aceito só
enquanto os dados eram de teste. Com cliente real, isso apaga histórico
financeiro sem volta. Peça ao Claude para avaliar e travar antes do primeiro
cliente real.

---

## Fase 2 — Logo que o nome for decidido

### 3. Pedir a marca no INPI · ~1 h

No Brasil, a marca fica com **quem pede primeiro**, não com quem usa primeiro.
Por isso esse passo vem logo depois de decidir o nome.

- [ ] Criar cadastro no e-INPI e emitir a GRU (taxa do pedido).
- [ ] Se a empresa for **ME, MEI ou EPP**, pedir o desconto: a taxa cai bastante.
- [ ] Protocolar na classe 42 (e na 36, se quiser proteção maior; cada classe é
      uma taxa).
- [ ] O processo leva de 1 a 2 anos. A proteção vale **desde a data do pedido**.

### 4. Comprar o domínio · ~30 min

- [ ] Registro.br › comprar o `.com.br` (precisa de CPF ou CNPJ; prefira o CNPJ
      da empresa).
- [ ] No **Cloudflare** (a conta já existe): **Add a site** › informar o domínio
      › plano Free. Ele mostra dois "nameservers".
- [ ] No Registro.br › domínio › **DNS** › trocar pelos dois nameservers do
      Cloudflare. A troca leva de minutos a algumas horas.
- [ ] Opcional: o `.com` no próprio Cloudflare (passo 10).

A partir daqui, **todo registro de DNS é feito no Cloudflare**, não no Registro.br.

### 5. Mudar o site para o Cloudflare Pages · Claude, ~1 h

O Claude faz; você só precisa estar logado no Cloudflare e no Vercel.

**Dá para adiantar antes do domínio.** O site sobe num endereço `*.pages.dev`
em paralelo, enquanto os usuários continuam no Vercel. Quando o domínio chegar,
falta só ligá-lo. Os itens marcados com (A) podem ser feitos já.

- [ ] (A) Cloudflare › **Workers & Pages › Create › Pages › conectar o GitHub** ›
      repositório `App_Fincanceiro`, branch `main`.
- [ ] (A) Build: comando `npm ci && npm run build`, pasta `dist`, e a variável
      `SKIP_DEPENDENCY_INSTALL=1`. **Atenção:** o repositório tem `bun.lock`,
      `bun.lockb` e `package-lock.json`. Sem essa variável, o Cloudflare pode
      instalar com o bun e montar dependências diferentes das do Vercel.
- [ ] (A) Copiar do Vercel as três variáveis `VITE_SUPABASE_URL`,
      `VITE_SUPABASE_PUBLISHABLE_KEY` e `VITE_SUPABASE_PROJECT_ID`.
- [ ] (A) Supabase › **Authentication › URL Configuration** › **acrescentar** o
      endereço `*.pages.dev` nas Redirect URLs, sem tirar o do Vercel, para o
      login e o "esqueci minha senha" funcionarem no teste.
- [ ] (A) Testar o endereço `*.pages.dev` (login, ficha, telecobrança).
- [ ] **Custom domains** › ligar o domínio próprio.
- [ ] Supabase › **Authentication › URL Configuration** › trocar Site URL e
      Redirect URLs para o domínio novo.
- [ ] Avisar os usuários do endereço novo. **Só então** desligar o projeto no Vercel.

### 6. E-mails automáticos do sistema (Resend) · ~1 h

Libera confirmação de cadastro e "esqueci minha senha", que hoje param no
limite de 2 por hora. Passo a passo completo em
[`CONFIGURAR_SMTP.md`](CONFIGURAR_SMTP.md).

- [ ] Criar conta no Resend e adicionar o domínio.
- [ ] Copiar os registros DNS que o Resend mostrar para o **Cloudflare**
      (deixar a nuvem laranja **desligada** nesses registros).
- [ ] Gerar a chave de API e colar no Supabase › SMTP.
- [ ] Testar: cadastro novo e "Esqueci minha senha".

### 7. E-mail da equipe (Google Workspace) · ~1 h

- [ ] Assinar o Business Starter com o domínio novo.
- [ ] Copiar os registros que o Google pedir (MX e verificação) para o **Cloudflare**.
- [ ] Criar as contas (ex.: `erick@`) e os apelidos gratuitos `contato@`,
      `suporte@` e `financeiro@`.
- [ ] Ligar o **DKIM** no painel do Google (evita cair no spam).

O Resend e o Google convivem no mesmo domínio sem conflito: um envia os
e-mails automáticos, o outro é a caixa da equipe.

---

## Fase 3 — Nas semanas seguintes

### 8. Termos de Uso e Política de Privacidade (LGPD) · advogado

O app guarda CPF, telefone e dívidas de pessoas que não são nossos clientes
diretos. Na LGPD, **a empresa cliente é a controladora** dos dados e **nós somos
os operadores**. O advogado precisa entregar:

- [ ] **Termos de Uso** (contrato de uso da plataforma).
- [ ] **Política de Privacidade**.
- [ ] **Acordo de tratamento de dados** com cada empresa cliente (pode ser uma
      cláusula do contrato).

Com os textos prontos, o Claude coloca os links no cadastro e no login, com o
aceite registrado.

### 10. Domínio .com (opcional)

Só para ninguém registrar o mesmo nome em `.com`. Compra direto no Cloudflare,
que vende a preço de custo.

---

## Pode esperar

- **Cobrança automática da plataforma** (boleto/PIX via Asaas): o controle
  manual atende enquanto forem poucos clientes.
- **PITR** (restaurar o banco em qualquer minuto, ~US$ 100/mês): o backup
  diário do Pro basta por enquanto.
- **Máquina maior no Supabase:** só com dezenas de usuários ao mesmo tempo.
