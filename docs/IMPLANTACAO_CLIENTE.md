# Implantação de um cliente novo (com integração por API)

Roteiro para quando um cliente disser: "quero o sistema e quero conectar ao meu
via API". Escrito em 2026-11-05. Marque os itens conforme for fazendo.

**Quem se conecta a quem:** o ERP do cliente **chama a nossa API**. Nós não
entramos no sistema nem no banco de dados dele. É o mesmo tipo de conexão que o
ERP já usa para emitir nota fiscal.

---

## Fase 1: conversa comercial (1 dia)

- [ ] Fazer as 3 perguntas ao cliente:
  1. **Qual é o ERP** e quem vai programar a integração (a TI dele ou o
     fornecedor do ERP).
  2. **Com que frequência** quer enviar e consultar (de hora em hora, uma vez
     por dia…).
  3. **Se quer ser avisado** quando algo muda do nosso lado. Ainda não existe:
     hoje o ERP consulta de tempos em tempos.
- [ ] Fechar o plano: implantação + mensalidade, com carência de 60 dias na 1ª
      mensalidade (Plataforma › Preços dos planos › Simulador).
- [ ] Contrato. Sem CNPJ próprio ainda, definir em nome de quem ele sai.

- [ ] Antes da reunião, decidir com os sócios os itens **A DEFINIR** da seção
      "Perguntas comerciais e de confiança" do FAQ: preço da integração,
      horário de suporte, saída de dados e em nome de quem sai o contrato.
- [ ] Avisar o cliente de que o **fornecedor do ERP pode cobrar** para programar
      a integração, e do que faz a chave parar (limite do plano, fim do teste,
      mensalidade atrasada).

Respostas prontas para as dúvidas do cliente: [`api/PERGUNTAS-FREQUENTES.md`](api/PERGUNTAS-FREQUENTES.md).

## Fase 2: implantação no sistema (mesmo dia)

- [ ] O cliente se cadastra; aprovar a empresa na **Plataforma**. Ela começa no
      teste de 30 dias ou já no plano contratado (Plataforma › Alterar plano).
- [ ] O admin da empresa convida a equipe: financeiro, cobradores e vendedores.
- [ ] **Carga inicial:** os títulos que já existem entram pela **importação de
      planilha** (.xlsx/.csv), mais rápida que a API para volume grande. Daí em
      diante, a API cuida só dos títulos novos e das mudanças.

## Fase 3: integração pela API (poucos dias, depende da TI do cliente)

- [ ] **Homologação (teste):** gerar na Plataforma uma **chave de uma empresa de
      teste** e mandar à TI do cliente junto com [`api/README.md`](api/README.md)
      (endereço, exemplos e contato de suporte já estão lá). A TI programa e
      testa sem afetar a cobrança real.
- [ ] Antes da chave definitiva, rodar `node scripts/testar-api-v1.mjs` (só
      leitura; precisa de `API_V1_CHAVE` e `API_V1_CHAVE_OUTRA_EMPRESA` no
      `.env.local`).
- [ ] **Produção:** gerar a **chave da empresa real** e entregar uma única vez
      (depois nem nós conseguimos lê-la). Revogar a chave de teste e as chaves
      usadas no script.
- [ ] Acompanhar os primeiros dias: o ERP envia títulos, informa pagamentos
      feitos do lado dele e consulta a situação (pago, vencido, em acordo…).

## O que a API ainda não faz

Avisar o ERP automaticamente (webhooks) e mostrar o detalhe do acordo (valor e
parcelas). Só construir se o cliente pedir; tudo entra como acréscimo na v1, sem
quebrar o que existe. Envio em lote, pagamento com valor/data/meio e
cancelamento pelo ERP já existem (desde 2026-11-05).

Se o ERP **não conseguir** chamar uma API: fazer um **conector específico** só
para ele (arquivo, planilha, acesso que ele liberar), cobrado como serviço de
implantação à parte. Fica fora da `api-v1`.

---

## Antes do primeiro cliente pagante

Itens abertos em [`../PENDENCIAS.md`](../PENDENCIAS.md) e no
[`GUIA_LANCAMENTO.md`](GUIA_LANCAMENTO.md):

- [ ] **Hospedagem:** sair do Vercel Hobby, que **proíbe uso comercial**, para o
      Cloudflare Pages.
- [ ] **E-mails:** SMTP próprio (Resend). Hoje são 2 e-mails por hora, o que
      trava convites e recuperação de senha de uma equipe inteira. Depende do
      domínio, que depende do nome.
- [ ] **Backup:** assinar o Supabase Pro (backup diário). Com dados reais, não
      é opcional.
- [ ] **"Limpar títulos da empresa"** apaga pagamentos junto; rever antes de
      haver dados reais.
- [ ] **Termos de Uso e Política de Privacidade (LGPD).**

Se for começar antes disso, o caminho mais seguro é um **piloto**: plano
Cortesia ou teste de 30 dias, com o cliente ciente de que é uma fase de
implantação, enquanto hospedagem, e-mail e backup são resolvidos.
