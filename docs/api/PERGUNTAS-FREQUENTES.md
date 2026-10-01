# API de integração — perguntas frequentes

Respostas curtas, sem jargão, para quando um cliente (ou a TI dele) perguntar
sobre a integração. A documentação técnica, com endereços e exemplos, está em
[`README.md`](README.md).

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
- **Informar um pagamento** feito do lado do cliente (reenviando o título com a
  parcela marcada como paga).
- **Consultar um título**: situação, quanto foi pago, quanto falta, cada parcela.
- **Buscar só o que mudou** desde a última consulta: pagamentos lançados por nós,
  acordos feitos, quebrados ou cumpridos, cancelamentos.

## O que ainda não dá?

- **Avisos automáticos** (nós chamarmos o ERP quando algo muda). Hoje o ERP
  consulta de tempos em tempos.
- **Enviar muitos títulos numa chamada só.** Para a carga inicial, a importação
  por planilha é mais rápida.
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
