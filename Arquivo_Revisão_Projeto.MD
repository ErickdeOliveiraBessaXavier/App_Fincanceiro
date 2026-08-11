# Prompt: Análise de UX/UI e Fluxo de Usabilidade — Sistema de Cobrança

## Contexto do projeto

Este é o meu sistema de cobrança **multi-tenant**, já em produção — você já tem acesso ao código-fonte e ao contexto completo do projeto. As entidades centrais são:

- **Clientes** (devedores)
- **Títulos** (dívidas/faturas)
- **Acordos** (renegociações)
- **Cobranças** (ações de cobrança)
- **Contatos** (canais de comunicação com o cliente)
- **Múltiplas empresas** (contexto multi-tenant)

O sistema foi construído de forma incremental, conforme as necessidades de negócio surgiram — **não houve um planejamento prévio de arquitetura de informação ou fluxo de navegação**. Como resultado, suspeito que existam inconsistências, redundâncias e fricções na experiência do usuário que nunca foram avaliadas de forma holística.

Esta é uma tarefa de **revisão/refatoramento de UX**, não de criação de um sistema novo. Use o que já existe como base — não proponha uma reformulação do zero nem descarte decisões atuais sem justificativa concreta.

## Papel esperado da IA

Atue como um(a) especialista em **arquitetura de informação e UX de sistemas B2B/back-office**, com experiência em ferramentas de gestão de cobrança, CRM ou ERPs multi-tenant. Você não deve propor um redesign visual — o foco é **fluxo, hierarquia de informação e usabilidade**.

## Antes de começar

Antes de qualquer análise, revise o código-fonte atual do projeto (rotas/telas, templates/componentes, modelos de dados) para **relembrar e confirmar** — não redescobrir do zero — como as entidades estão implementadas e conectadas hoje. Isso é importante porque o sistema cresceu de forma incremental, então partes dele podem ter divergido do que seria esperado por um padrão único.

1. Releia a estrutura de pastas, rotas/views e modelos relacionados a: clientes, títulos, acordos, cobranças e contatos.
2. Liste rapidamente as telas, modais e fluxos existentes que você identificou, antes de iniciar a análise crítica — isso serve como checkpoint para garantir que nada relevante ficou de fora.
3. Se algo no código estiver ambíguo ou incompleto (ex: perfis de usuário, regra específica de negócio, tela sem uso claro), **pergunte pontualmente** em vez de presumir — mas não pare o fluxo de análise por isso; sinalize a dúvida e continue com o que for possível avaliar.

## Etapa 1 — Diagnóstico do fluxo atual

Mapeie e documente, entidade por entidade e fluxo por fluxo, como o sistema funciona **hoje**. Para cada fluxo principal (ex: localizar cliente → ver títulos → negociar acordo → registrar cobrança), descreva:

- Sequência real de telas/passos que o usuário percorre
- Número de cliques, páginas e confirmações envolvidos
- Onde o contexto do cliente é perdido ou precisa ser refeito
- Onde há dados duplicados, redundantes ou fora de lugar

## Etapa 2 — Pontos de avaliação

Avalie criticamente os pontos abaixo, sempre com exemplos concretos do sistema atual (nome de tela, rota ou funcionalidade), não em abstrato:

1. **Fluxo de tarefas principais** — o caminho que o usuário percorre para realizar as ações mais comuns é direto ou tem desvios desnecessários?
2. **Navegação entre entidades** — a transição entre cliente → título → acordo → cobrança → contato é natural e previsível?
3. **Etapas redundantes** — existem passos, telas ou confirmações que poderiam ser condensados ou eliminados?
4. **Momento da informação** — alguma informação aparece cedo/tarde demais ou deveria ser exibida de forma contextual (ex: dentro da tela do cliente, e não em uma tela separada)?
5. **Proximidade funcional** — há telas/funcionalidades relacionadas que estão distantes na navegação e deveriam estar próximas?
6. **Excesso de fricção** — há modais, cliques ou confirmações em excesso para ações simples?
7. **Hierarquia de informação por perfil** — a densidade e prioridade de informação está adequada para os diferentes perfis de usuário (operador de cobrança, gestor, admin da empresa, etc.)?
8. **Persistência de contexto** — o contexto do cliente (e da empresa, no caso multi-tenant) é mantido ao navegar entre módulos, ou o usuário precisa re-buscar/re-selecionar constantemente?
9. **Clareza do multi-tenant** — fica claro para o usuário em qual empresa/contexto ele está operando? Isso influencia negativamente a navegação em algum ponto?
10. **Consistência de UX/UI** — existem padrões de interação, nomenclatura ou layout diferentes entre módulos que deveriam ser unificados?
11. **Fontes de erro e retrabalho** — quais fluxos hoje geram mais dúvida, erro de operação ou necessidade de refazer uma tarefa?

## Etapa 3 — Proposta de fluxo ideal

Com base no diagnóstico, proponha um fluxo de navegação e arquitetura de informação otimizados, **aproveitando ao máximo a estrutura já existente** (evite propor uma reescrita completa, a menos que seja estritamente necessário).

Para cada recomendação, classifique explicitamente como:

- 🟢 **Refinamento** — ajuste incremental, baixo risco, não exige mudança estrutural (ex: reordenar campos, mover uma ação para outro lugar, unificar um padrão visual).
- 🟡 **Ajuste estrutural moderado** — exige mudança de fluxo ou de relacionamento entre telas, mas reaproveita a base atual.
- 🔴 **Mudança estrutural significativa** — exige repensar arquitetura de navegação, modelo de dados ou hierarquia de módulos.

Para cada recomendação, inclua:
- Problema identificado
- Proposta de solução
- Classificação (🟢/🟡/🔴)
- Impacto esperado no usuário
- Complexidade estimada de implementação

## Restrições importantes

- **Não altere código nesta etapa.** O objetivo aqui é diagnóstico e proposta, não implementação. Alterações só devem ser feitas depois, mediante minha aprovação explícita do que vale a pena implementar.
- **Não proponha redesign visual.** Não sugira paleta de cores, componentes de UI ou estilo — o foco é fluxo, arquitetura de informação e usabilidade.
- **Não reformule o que já funciona bem.** O objetivo é refinar e corrigir pontos de fricção reais, não recriar telas ou fluxos que já cumprem seu papel adequadamente. Toda sugestão deve ser uma resposta a um problema concreto identificado, não uma mudança por preferência estilística.
- Baseie-se no sistema real (código, telas, dados), não em um sistema de cobrança genérico ou "melhores práticas de mercado" descoladas do contexto atual.
- Ao final, apresente um resumo priorizado (ex: matriz de esforço x impacto) para facilitar a decisão sobre o que vale a pena implementar primeiro.

## Formato de saída esperado

1. Checkpoint inicial — telas/fluxos/entidades identificados no código atual (breve, para validação)
2. Diagnóstico do fluxo atual (por entidade/fluxo)
3. Lista de problemas identificados (com localização exata no sistema: arquivo, rota ou tela)
4. Proposta de fluxo ideal (com classificação 🟢/🟡/🔴)
5. Resumo priorizado (esforço x impacto)