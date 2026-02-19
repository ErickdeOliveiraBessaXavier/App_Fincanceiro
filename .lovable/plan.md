

# Plano: Corrigir erro "function max(uuid) does not exist"

## Problema

O trigger `criar_evento_emissao_parcela` dispara ao inserir parcelas e usa `MAX(t.created_by)` para obter o criador do titulo. Porem, PostgreSQL nao suporta a funcao `MAX()` em colunas do tipo UUID, causando o erro.

## Solucao

### Migration SQL

Recriar a funcao do trigger substituindo `MAX(t.created_by)` por uma subquery direta, ja que todas as parcelas de um titulo compartilham o mesmo `created_by`:

```sql
CREATE OR REPLACE FUNCTION public.criar_evento_emissao_parcela()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_total_parcelas INTEGER; v_created_by UUID;
BEGIN
  SELECT COUNT(*) INTO v_total_parcelas
  FROM public.parcelas p WHERE p.titulo_id = NEW.titulo_id;

  SELECT t.created_by INTO v_created_by
  FROM public.titulos t WHERE t.id = NEW.titulo_id;

  INSERT INTO public.eventos_parcela (parcela_id, tipo, valor, efeito, descricao, created_by)
  VALUES (NEW.id, 'emissao_parcela', NEW.valor_nominal, 0,
    format('Parcela %s/%s emitida - Vencimento: %s', NEW.numero_parcela, v_total_parcelas, to_char(NEW.vencimento, 'DD/MM/YYYY')), v_created_by);
  RETURN NEW;
END;
$function$;

NOTIFY pgrst, 'reload schema';
```

### Resumo

| Alteracao | Detalhe |
|-----------|---------|
| Corrigir `criar_evento_emissao_parcela` | Substituir `MAX(t.created_by)` por SELECT direto na tabela titulos |
| Reload schema PostgREST | `NOTIFY pgrst, 'reload schema'` para garantir que a RPC `criar_titulo_com_parcelas` seja reconhecida |

Nenhum arquivo frontend precisa ser alterado - apenas a migration SQL.

