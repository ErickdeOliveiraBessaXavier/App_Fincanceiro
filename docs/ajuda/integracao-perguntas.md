## O que é a integração?

É a ligação entre o sistema de gestão da sua empresa (o ERP) e a plataforma de
cobrança. Com ela, o ERP **envia os títulos** para cobrarmos e **consulta como
está cada um**: em aberto, vencido, pago, em acordo ou cancelado. Assim ninguém
precisa digitar ou importar planilha no dia a dia.

## Quem se conecta a quem?

**O seu ERP chama a nossa API** (a porta de entrada da plataforma). Nós não
entramos no seu sistema nem no seu banco de dados, e nada precisa ser liberado
na sua rede.

É o mesmo tipo de conexão que o ERP já faz para emitir nota fiscal: ele envia
uma informação para fora e recebe uma resposta.

## O que vocês precisam saber da minha empresa?

Não pedimos senha nem acesso ao seu sistema. Só três respostas:

1. **Qual é o ERP** e quem vai programar a chamada (TI própria ou o fornecedor
   do ERP).
2. **Com que frequência** vocês querem enviar títulos e consultar a situação
   (de hora em hora, uma vez por dia…).
3. **Se querem ser avisados** quando algo muda do nosso lado, ou se preferem
   consultar de tempos em tempos.

## O que eu recebo para começar?

- **Uma chave de acesso**, exclusiva da sua empresa.
- **A documentação técnica**, na seção "API — referência técnica" desta
  central, com o endereço e exemplos prontos para a sua TI.
- Se quiser testar antes, uma **chave de uma empresa de teste**: nada do que for
  enviado com ela entra na cobrança real.

## É seguro?

- A chave dá acesso **só aos dados da sua empresa**: com ela, não há como
  enxergar outra empresa.
- A chave pode ser **cancelada a qualquer momento**. Se ela vazar, revogamos a
  antiga e entregamos uma nova.
- Não guardamos a chave em texto: depois de entregue, nem nós conseguimos lê-la.
- Toda a comunicação é criptografada (HTTPS).

## O que dá para fazer hoje?

- **Enviar um título** com as parcelas. Reenviar o mesmo título não duplica.
- **Enviar vários títulos de uma vez** (até 100 por chamada). Se um tiver erro,
  os outros entram normalmente.
- **Informar um pagamento** feito do seu lado, com o valor (inteiro ou parcial),
  a data real e o meio (PIX, boleto…). Repetir o mesmo pagamento não lança duas
  vezes.
- **Cancelar um título** (nota devolvida, venda desfeita). Se o título já tiver
  pagamento ou acordo, o cancelamento é recusado e a equipe de cobrança resolve
  antes.
- **Consultar um título**: situação, quanto foi pago, quanto falta, cada parcela.
- **Buscar só o que mudou** desde a última consulta: pagamentos lançados por nós,
  acordos feitos, quebrados ou cumpridos, cancelamentos.

## Regras que costumam gerar dúvida

- **Corrigir um título já enviado:** pode, enquanto não houver movimentação do
  nosso lado (pagamento, desconto, encargo ou acordo). Depois disso as parcelas
  ficam fixas.
- **Nome e telefone do cliente** corrigidos pela equipe de cobrança não são
  sobrescritos pelo ERP.
- **Parcela que deixa de vir no reenvio** não é apagada: continua sendo cobrada.
- **Pagamento enviado por engano** não se desfaz pelo ERP: a equipe de cobrança
  estorna.
- **Com que frequência consultar:** a cada 15 minutos já é bem atualizado.

## O que ainda não dá?

- **Avisos automáticos** (nós chamarmos o ERP quando algo muda). Hoje o ERP
  consulta de tempos em tempos.
- **Carga inicial de milhares de títulos** pela API. Funciona em lotes de 100,
  mas a importação por planilha é mais rápida.
- **Ver o acordo em detalhe** (valor e parcelas do acordo). Hoje o ERP vê que o
  título está em acordo, e se o acordo está em dia, quebrado ou cumprido.

Se algum desses itens for importante para vocês, fale com o suporte.

## Por que um título em acordo aparece com saldo zero?

Porque o acordo **substitui** a dívida do título: o valor passa a ser cobrado
nas parcelas do acordo. Saldo zero com situação "em acordo" ou "acordo quebrado"
**não é dívida paga**: o cliente continua devendo, só que pelo acordo.

## E se o meu ERP não conseguir chamar uma API?

Fazemos um **conector**: uma peça à parte que conversa com o seu sistema do
jeito que ele consegue (arquivo, planilha exportada) e repassa para a plataforma.
É um serviço de implantação, combinado à parte.

## A API pode mudar e quebrar a integração?

Não sem aviso. Depois que a sua empresa está conectada, a versão atual (`v1`) só
**ganha** coisas: campos novos, situações novas, sempre documentados. Se um dia
for preciso mudar algo de forma incompatível, sai uma `v2`, e a `v1` continua
funcionando por um prazo combinado.

## Quanto tempo leva para integrar?

Depende de quem programa do seu lado. A chamada é simples: quem já integra nota
fiscal costuma fazer em poucos dias. Do nosso lado, a chave e a documentação
são entregues na hora.
