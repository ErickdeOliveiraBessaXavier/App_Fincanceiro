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
  INSERT INTO titulos (cliente_id, valor_original, vencimento_original, descricao, numero_documento, created_by)
  VALUES (p_cliente_id, p_valor_original, p_vencimento_original, p_descricao, p_numero_documento, COALESCE(p_created_by, auth.uid()))
  RETURNING id INTO v_titulo_id;

  v_valor_parcela := ROUND(p_valor_original / p_numero_parcelas, 2);

  FOR i IN 1..p_numero_parcelas LOOP
    v_data_vencimento := p_vencimento_original + ((i - 1) * p_intervalo_dias);
    INSERT INTO parcelas (titulo_id, numero_parcela, valor_nominal, vencimento)
    VALUES (v_titulo_id, i, v_valor_parcela, v_data_vencimento);
  END LOOP;

  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_parcelas_consolidadas;

  RETURN jsonb_build_object(
    'sucesso', true,
    'titulo_id', v_titulo_id,
    'parcelas_criadas', p_numero_parcelas
  );
END;
$$;