# Configurar SMTP próprio (Supabase)

> Status: **pendente**. Não é urgente enquanto não houver cliente real, mas
> precisa estar pronto **antes do primeiro cadastro externo**.

## Por que isso importa

Hoje o app manda um único tipo de e-mail: a **confirmação de cadastro**
(`supabase.auth.signUp` em `src/contexts/AuthContext.tsx`). Volume é irrelevante
— alguns por mês.

O problema não é volume, é **entregabilidade**. O serviço embutido da Supabase:

- envia de um remetente compartilhado, sem SPF/DKIM no seu domínio → cai em spam;
- é limitado a poucos envios por hora;
- a própria documentação diz que **não é para produção**.

E o fluxo do app não perdoa falha de entrega: com "Confirm email" ligado, quem
se cadastra **não consegue logar** até clicar no link. Se o e-mail não chega, o
usuário fica preso — e **não existe tela de reenviar confirmação**. Ele desiste e
você não fica sabendo.

Evidência real (consultada em 15/07/2026):

| Conta | Confirmado | Confirmação enviada |
|---|---|---|
| `eobx@hotmail.com` | sim | 31/05 |
| `ana.clara@tsdistribuidora.com.br` | **não** | 15/07 19:54 |

A segunda conta está exatamente no estado de "softlock": e-mail enviado, nunca
confirmado, usuário sem acesso.

---

## Pré-requisito que trava tudo: domínio próprio

Provedor de e-mail sério exige **verificar o domínio por DNS**. O app hoje está
em `app-fincanceiro.vercel.app` — subdomínio da Vercel, que você não controla e
**não pode verificar**.

- [ ] Registrar o domínio `.br` no [registro.br](https://registro.br) (~R$40/ano)

Sem isso, nada abaixo funciona. Como propagação de DNS leva tempo, é o passo que
vale começar cedo.

---

## Passo a passo

### 1. Criar conta no Resend

- [ ] Criar conta em [resend.com](https://resend.com)

**Por que Resend:** é o que a própria Supabase recomenda, a faixa gratuita
(~3.000 e-mails/mês) cobre você por muito tempo, e a configuração é simples.
Alternativa mais barata em escala é o **Amazon SES** (centavos por mil e-mails),
mas dá bem mais trabalho e você não precisa disso agora.

> Confirme os limites da faixa gratuita no site — mudam com o tempo.

### 2. Verificar o domínio no Resend

- [ ] No Resend: **Domains → Add Domain** → informar seu domínio
- [ ] Ele mostra registros **SPF** e **DKIM** (tipo TXT)
- [ ] Cadastrar esses registros no **Registro.br** (painel de DNS do domínio)
- [ ] Aguardar o Resend marcar o domínio como **Verified** (minutos a horas)

> **Atenção:** sem domínio verificado, o Resend só envia para o e-mail da sua
> própria conta. Funciona no seu teste e falha com cliente real — o pior tipo de
> falha, porque parece que está tudo certo.

### 3. Gerar a credencial

- [ ] No Resend: **API Keys → Create API Key** → copiar a chave
- [ ] Guardar em lugar seguro. **Nunca commitar no repositório.**

### 4. Configurar no Supabase

Dashboard → **Project Settings → Authentication → SMTP Settings** → ativar
*Enable Custom SMTP*:

| Campo | Valor |
|---|---|
| Host | `smtp.resend.com` |
| Porta | `465` |
| Usuário | `resend` |
| Senha | a API key do passo 3 |
| Sender email | `nao-responda@seudominio.com.br` |
| Sender name | nome que aparece pro usuário |

- [ ] Salvar

> Os caminhos do painel da Supabase mudam de tempos em tempos. Se não achar,
> procure por "SMTP" nas configurações de Authentication.

### 5. O passo que quase todo mundo esquece

- [ ] Dashboard → **Authentication → Rate Limits** → subir o limite de envio de e-mails

O limite continua baixo **mesmo com SMTP próprio**. Configurar o Resend e não
mexer aqui deixa o problema exatamente onde estava.

### 6. Testar de verdade

- [ ] Cadastrar uma conta com um e-mail **de fora** (não o seu do Resend, não o
      da equipe do projeto)
- [ ] Confirmar que o e-mail chega **na caixa de entrada**, não no spam
- [ ] Clicar no link e confirmar que o login funciona

Testar só com o próprio e-mail é o erro clássico: funciona pra você e falha pro
cliente.

---

## Alternativa: desligar a confirmação de e-mail

Dashboard → **Authentication → Providers → Email** → desmarcar *Confirm email*.

**A favor:** as suas empresas já passam por **aprovação manual sua** na
Plataforma. A confirmação de e-mail é uma segunda tranca em cima de uma tranca
que já existe — e é a tranca que está prendendo gente.

**Contra:** deixa entrar cadastro com e-mail errado (e aí você não tem como
contatar o cliente), e **você vai precisar de SMTP de qualquer jeito** quando
implementar "esqueci minha senha" — que hoje **não existe** no app. Sem ele, todo
esquecimento de senha vira chamado de suporte manual, que é justamente o custo
mais caro identificado no `PRECIFICACAO_E_CUSTOS.txt`.

**Recomendação:** desligar é aceitável como medida temporária para destravar
enquanto o domínio não sai. Não é o destino final.

---

## Pendências relacionadas

- [ ] **Fluxo de "esqueci minha senha"** — não existe no app. Depende deste SMTP.
- [ ] **Reenviar confirmação** — não existe. É o que transformaria o softlock em
      um clique do usuário, em vez de um chamado pra você.
