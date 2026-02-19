

# Plano: Exibir parcelas do acordo em titulos renegociados

## Problema

Quando um acordo e criado com varias parcelas, essas parcelas sao salvas na tabela `parcelas_acordo`. Porem, a pagina de Titulos (`Titulos.tsx`) so exibe parcelas da `mv_parcelas_consolidadas` (que vem da tabela `parcelas`). Titulos com status "Renegociado" aparecem corretamente, mas ao expandir, nao mostram as parcelas do acordo.

## Solucao

Quando um titulo tem status "renegociado", buscar e exibir as parcelas do acordo (`parcelas_acordo`) alem das parcelas originais. Isso sera feito no frontend, sem alterar a estrutura do banco.

## Alteracoes

### 1. `src/pages/Titulos.tsx`

**Adicionar estado e funcao para parcelas de acordo:**

```typescript
const [parcelasAcordo, setParcelasAcordo] = useState<Map<string, any[]>>(new Map());

const fetchParcelasAcordo = async (tituloId: string) => {
  const { data: acordos } = await supabase
    .from('acordos')
    .select('id')
    .eq('titulo_id', tituloId)
    .eq('status', 'ativo');

  if (!acordos || acordos.length === 0) return;

  const { data: parcelas } = await supabase
    .from('parcelas_acordo')
    .select('*')
    .eq('acordo_id', acordos[0].id)
    .order('numero_parcela');

  if (parcelas) {
    setParcelasAcordo(prev => new Map(prev).set(tituloId, parcelas));
  }
};
```

**Modificar `toggleTituloExpanded`** para tambem buscar parcelas de acordo quando o titulo esta renegociado:

```typescript
const toggleTituloExpanded = (tituloId: string) => {
  setExpandedTitulos(prev => {
    const next = new Set(prev);
    if (next.has(tituloId)) {
      next.delete(tituloId);
    } else {
      next.add(tituloId);
      fetchParcelasTitulo(tituloId);
      // Buscar parcelas de acordo se titulo renegociado
      const titulo = titulos.find(t => t.id === tituloId);
      if (titulo?.status === 'renegociado') {
        fetchParcelasAcordo(tituloId);
      }
    }
    return next;
  });
};
```

**Adicionar secao de parcelas do acordo no JSX**, logo apos as parcelas originais (apos linha 779). Quando existirem parcelas de acordo para o titulo, exibir um separador visual "Parcelas do Acordo" seguido das parcelas com seus valores, vencimentos e status.

### 2. Permitir expandir titulos renegociados

Atualmente, o botao de expandir so aparece se `quantidade_parcelas > 1` (linha 595). Modificar para tambem expandir se o titulo esta renegociado:

```typescript
{((titulo.quantidade_parcelas || 0) > 1 || titulo.status === 'renegociado') && (
  <Button ...>
```

## Resumo

| Arquivo | Alteracao |
|---------|-----------|
| `src/pages/Titulos.tsx` | Novo estado `parcelasAcordo`, funcao `fetchParcelasAcordo`, exibicao das parcelas do acordo ao expandir titulo renegociado |

Nenhuma alteracao no banco de dados. Apenas leitura da tabela `parcelas_acordo` ja existente.

