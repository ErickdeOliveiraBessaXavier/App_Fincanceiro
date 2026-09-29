# Instruções do Projeto

## Regra do Projeto — Função nova no banco nasce fechada

Desde a migration `20260929120000`, função criada no schema `public` **não**
é executável por `anon` nem por `authenticated`. Ao criar uma RPC que o front
chama, conceda explicitamente na mesma migration:

```sql
GRANT EXECUTE ON FUNCTION public.minha_rpc(argumentos) TO authenticated;
```

- Nunca conceda a `anon`. O app não chama RPC antes do login.
- Função interna (chamada só por outra função, trigger ou Edge Function com
  service role) não recebe grant nenhum.
- Toda RPC exposta valida o papel por dentro (`has_min_role`) e a empresa
  (`current_company_id()`), mesmo que a tela já esconda o botão.
- Depois de aplicar, confira com `has_function_privilege(...)`, em vez de
  presumir pelo DDL.

## Regra do Projeto — Complexidade Ciclomática

Toda alteração ou nova implementação deve considerar a Complexidade Ciclomática como um critério de qualidade do código.

Diretrizes:

- Respeitar a regra `complexity` configurada no ESLint.
- Nenhuma função nova deve exceder o limite de complexidade definido pelo projeto.
- Ao modificar uma função existente, evitar aumentar sua complexidade.
- Sempre que possível, reduzir a complexidade de trechos já existentes.
- Priorizar Early Returns para diminuir níveis de aninhamento.
- Extrair blocos de lógica complexa para funções auxiliares menores e coesas.
- Evitar cadeias extensas de `if/else`.
- Evitar condicionais profundamente aninhadas.
- Preferir código simples e legível em vez de soluções excessivamente inteligentes.
- Não utilizar `eslint-disable`, comentários de supressão ou qualquer mecanismo para ignorar a regra de complexidade.
- Não alterar regras de negócio apenas para satisfazer o ESLint.
- Toda refatoração deve preservar integralmente o comportamento atual da aplicação.

Ao realizar qualquer alteração, avalie o impacto na Complexidade Ciclomática e proponha refatorações quando identificar oportunidades de melhoria.
