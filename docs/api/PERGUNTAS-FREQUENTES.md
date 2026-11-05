# API de integração — perguntas frequentes

Respostas curtas, sem jargão, para quando um cliente (ou a TI dele) perguntar
sobre a integração. A documentação técnica, com endereços e exemplos, está em
[`README.md`](README.md) — é esse arquivo que vai para a TI do cliente; este
FAQ é interno.

**Antes de entregar uma chave,** rode o teste de ponta a ponta:
`node scripts/testar-api-v1.mjs` (só leitura). Depois de mudar a API, rode
também `node scripts/testar-api-v1-escrita.mjs`, que grava dados: só com a chave
de uma empresa de teste (`API_V1_CHAVE_TESTE_ESCRITA`).

---

## O que é a API?

É uma porta de entrada do nosso sistema para o sistema do cliente (o ERP). Por
ela o ERP **envia títulos** para cobrarmos e **consulta como está cada um**:
em aberto, vencido, pago, em acordo.

## Quem se conecta a quem?

**O ERP do cliente chama a nossa API.** Nós não entramos no sistema nem no
banco de dados do cliente.

É o mesmo tipo de conexão que o ERP já faz para emitir nota fiscal: ele envia
uma informação para fora e recebe uma resposta.

## O que o cliente precisa me passar?

Não precisa de senha nem de acesso ao banco dele. Só três respostas:

1. **Qual é o ERP** e quem pode programar a chamada (TI própria ou o fornecedor
   do ERP).
2. **Com que frequência** querem enviar títulos e consultar a situação (de hora
   em hora, uma vez por dia…).
3. **Se querem ser avisados** quando algo muda do nosso lado, ou se preferem
   consultar de tempos em tempos.

## O que eu entrego ao cliente?

- **Uma chave de acesso**, gerada por nós, exclusiva da empresa dele.
- **A documentação técnica** (`README.md`), com o endereço e exemplos prontos.

## É seguro?

- A chave dá acesso **só aos dados da empresa dele**: com ela, não há como
  enxergar outra empresa.
- A chave pode ser **cancelada a qualquer momento**. Se vazar, geramos outra e
  revogamos a antiga.
- Não guardamos a chave em texto: depois de entregue, nem nós conseguimos lê-la.
- Toda a comunicação é criptografada (HTTPS).

## O que dá para fazer hoje?

- **Enviar um título** com suas parcelas. Reenviar o mesmo título não duplica.
- **Enviar vários títulos de uma vez** (até 100 por chamada). Se um tiver erro,
  os outros entram normalmente.
- **Informar um pagamento** feito do lado do cliente, com o valor (inteiro ou
  parcial), a data real e o meio (PIX, boleto…). Repetir o mesmo pagamento não
  lança duas vezes.
- **Cancelar um título** (nota devolvida, venda desfeita). Se o título já tiver
  pagamento ou acordo, o cancelamento é recusado e a equipe de cobrança resolve
  antes.
- **Consultar um título**: situação, quanto foi pago, quanto falta, cada parcela.
- **Buscar só o que mudou** desde a última consulta: pagamentos lançados por nós,
  acordos feitos, quebrados ou cumpridos, cancelamentos.

## O que ainda não dá?

- **Avisos automáticos** (nós chamarmos o ERP quando algo muda). Hoje o ERP
  consulta de tempos em tempos.
- **Carga inicial de milhares de títulos** pela API. Funciona em lotes de 100,
  mas a importação por planilha é mais rápida.
- **Ver o acordo em detalhe** (valor e parcelas do acordo). Hoje o ERP vê que o
  título está em acordo, e se o acordo está em dia, quebrado ou cumprido.

## Por que um título em acordo aparece com saldo zero?

Porque o acordo **substitui** a dívida do título. O valor passa a ser cobrado
nas parcelas do acordo. Saldo zero com situação `em_acordo` ou `acordo_quebrado`
**não é dívida paga**: o cliente continua devendo, só que pelo acordo.

## E se o ERP do cliente não conseguir chamar uma API?

Aí fazemos um **conector específico** para ele: uma peça à parte que conversa com
o sistema dele do jeito que ele consegue (arquivo, planilha, acesso que ele
liberar) e repassa para a nossa API. É um serviço de implantação, feito sob
medida para aquele cliente.

## Dá para fazer algo especial só para um cliente?

Sim, **ao lado** da API, nunca dentro dela. A API é a mesma para todos. O que é
específico de um cliente vira um conector só dele, que usa as mesmas regras.

Assim, uma melhoria na API vale para todos, e o pedido de um cliente não
atrapalha os outros.

## A API pode mudar e quebrar a integração do cliente?

Não sem aviso. Depois que um cliente está conectado, a versão atual (`v1`) só
**ganha** coisas: campos novos, situações novas documentadas. Se um dia precisar
mudar algo de forma incompatível, sai uma `v2`, e a `v1` continua funcionando
por um prazo combinado. As mudanças ficam no "Histórico de mudanças" do
`README.md`.

## Quanto tempo leva para integrar?

Depende de quem programa do lado do cliente. A chamada é simples: quem já
integra nota fiscal costuma fazer em poucos dias. Do nosso lado, entregar a chave
e a documentação é imediato.

---

# Perguntas comerciais e de confiança

Respostas para a reunião, não para a TI. Itens marcados **A DEFINIR** dependem
de decisão dos sócios: não improvise na hora, diga que retorna.

## A integração tem custo à parte?

**A DEFINIR.** Hoje o preço é implantação + mensalidade (Plataforma › Preços dos
planos), mas não está decidido se a API vem incluída ou é cobrada separada.

## O cliente tem algum custo do lado dele?

Pode ter. Quem programa a chamada é a TI dele ou o **fornecedor do ERP**, e o
fornecedor pode cobrar por esse serviço. Isso é entre o cliente e o fornecedor;
nós entregamos a chave, a documentação e o suporte durante a integração.

Diga isso no início da conversa, não depois do contrato.

## Os dados ficam seguros? E a LGPD?

O que já existe, e pode ser dito:

- Cada empresa só enxerga os próprios dados, inclusive pela API (testado).
- A comunicação é criptografada (HTTPS) e a chave não fica guardada em texto.
- Cada pessoa da equipe do cliente tem login próprio e papel próprio (admin,
  financeiro, cobrador, vendedor), com o que cada um pode ver e fazer.

O que **ainda não existe**, e não deve ser prometido:

- **Backup diário automático** — entra ao assinar o Supabase Pro.
- **Termos de Uso e Política de Privacidade** (LGPD).

Resposta honesta: *"Estamos em fase de implantação. Backup diário e os termos de
privacidade entram antes de rodar com os seus dados reais."* Se não estiverem
prontos até lá, comece como **piloto** (ver `docs/IMPLANTACAO_CLIENTE.md`).

## O que pode fazer a integração parar de funcionar?

Avise o cliente destes três casos, para não parecer defeito:

1. **Limite de títulos do plano.** Ao chegar a 100% do plano, o ERP não consegue
   mais enviar títulos **novos** (erro `limite_do_plano`). Os títulos que já
   existem continuam sendo atualizados e consultados. O sistema avisa a partir
   de 80%; para voltar, amplia-se o plano.
2. **Fim do teste de 30 dias** sem plano contratado: a chave deixa de ser aceita.
3. **Mensalidade em atraso** além da tolerância: a empresa é bloqueada, e a chave
   junto.

Nos casos 2 e 3, o ERP recebe "chave inválida". Para a TI do cliente parece que
a chave quebrou: oriente a falar com o suporte antes de mexer na integração.

## O sistema fica no ar 24 horas? Tem garantia (SLA)?

O sistema fica no ar o tempo todo, hospedado no Supabase (infraestrutura em
nuvem usada por milhares de empresas). **Não oferecemos garantia formal de
disponibilidade (SLA)** por enquanto: é "melhor esforço".

Se o ERP não conseguir falar com a API por um momento, basta tentar de novo: a
documentação diz quais erros podem ser repetidos, e reenviar não duplica nada.

## Qual é o horário do suporte? Quem atende?

**A DEFINIR** — horário, canal (e-mail, WhatsApp) e prazo de resposta. Hoje o
contato na documentação é um e-mail provisório.

## Se o cliente sair, ele leva os dados?

**A DEFINIR** — formato (planilha, arquivo), prazo para pedir e por quanto tempo
os dados ficam guardados depois do fim do contrato. Isso também entra na
Política de Privacidade.

## Em nome de quem sai o contrato?

**A DEFINIR** — ainda não há CNPJ próprio. Até lá, a alternativa é um piloto
(teste de 30 dias ou plano Cortesia) com o cliente ciente da fase de
implantação.
