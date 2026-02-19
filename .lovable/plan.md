

# Plano: Corrigir Erro ao Criar Titulo

## Problema

O trigger `trigger_validar_titulo_tem_parcelas` e do tipo `CONSTRAINT DEFERRABLE INITIALLY DEFERRED`, o que significa que ele dispara ao final da transacao. Porem, o Supabase JS executa cada `.insert()` como uma transacao separada:

1. Transacao 1: Insere titulo -> trigger dispara -> nao encontra parcelas -> **ERRO**
2. Transacao 2: Insere parcelas (nunca executa)

## Solucao

Criar uma funcao RPC no banco que faz tudo dentro de uma unica transacao:

### Parte 1: Migration SQL

Criar funcao `criar_titulo_com_parcelas`:

```sql
CREATE OR REPLACE FUNCTION public.criar_titulo_com_parcelas(
  p_cliente_id UUID,
  p_valor_original NUMERIC,
  p_vencimento_original DATE,
  p_descricao TEXT DEFAULT NULL,
  p_numero_documento VARCHAR DEFAULT NULL,
  p_numero_parcelas INTEGER DEFAULT 1,
  p_intervalo_dias INTEGER DEFAULT 30,
  p_created_by UUID DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_titulo_id UUID;
  v_valor_parcela NUMERIC;
  v_data_vencimento DATE;
  i INTEGER;
BEGIN
  -- Inserir titulo
  INSERT INTO titulos (cliente_id, valor_original, vencimento_original, descricao, numero_documento, created_by)
  VALUES (p_cliente_id, p_valor_original, p_vencimento_original, p_descricao, p_numero_documento, COALESCE(p_created_by, auth.uid()))
  RETURNING id INTO v_titulo_id;

  -- Calcular valor de cada parcela
  v_valor_parcela := ROUND(p_valor_original / p_numero_parcelas, 2);

  -- Inserir parcelas
  FOR i IN 1..p_numero_parcelas LOOP
    v_data_vencimento := p_vencimento_original + ((i - 1) * p_intervalo_dias);
    INSERT INTO parcelas (titulo_id, numero_parcela, valor_nominal, vencimento)
    VALUES (v_titulo_id, i, v_valor_parcela, v_data_vencimento);
  END LOOP;

  -- Refresh materialized view
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_parcelas_consolidadas;

  RETURN jsonb_build_object(
    'sucesso', true,
    'titulo_id', v_titulo_id,
    'parcelas_criadas', p_numero_parcelas
  );
END;
$$;
```

### Parte 2: Alterar `src/pages/Titulos.tsx`

Substituir a funcao `handleCreateTitulo` (linhas 162-237) para usar a nova RPC:

```typescript
const handleCreateTitulo = async () => {
  if (!newTitulo.cliente_id || !newTitulo.valor_original || !user) {
    toast({
      title: "Erro",
      description: "Preencha todos os campos obrigatorios",
      variant: "destructive",
    });
    return;
  }

  try {
    const { data, error } = await supabase.rpc('criar_titulo_com_parcelas', {
      p_cliente_id: newTitulo.cliente_id,
      p_valor_original: newTitulo.valor_original,
      p_vencimento_original: newTitulo.vencimento_original,
      p_descricao: newTitulo.descricao || null,
      p_numero_documento: newTitulo.numero_documento || null,
      p_numero_parcelas: newTitulo.numero_parcelas,
      p_intervalo_dias: newTitulo.intervalo_dias,
      p_created_by: user.id
    });

    if (error) throw error;

    toast({
      title: "Sucesso",
      description: "Titulo criado com sucesso",
    });

    setIsCreateModalOpen(false);
    setNewTitulo({ /* reset */ });
    fetchTitulos();
  } catch (error) {
    console.error('Erro ao criar titulo:', error);
    toast({
      title: "Erro",
      description: "Nao foi possivel criar o titulo",
      variant: "destructive",
    });
  }
};
```

## Resumo

| Alteracao | Local |
|-----------|-------|
| Nova funcao RPC `criar_titulo_com_parcelas` | Migration SQL |
| Substituir logica de criacao por chamada RPC | `src/pages/Titulos.tsx` |

Tudo (titulo + parcelas + refresh da view) executa numa unica transacao, respeitando o trigger de validacao.

