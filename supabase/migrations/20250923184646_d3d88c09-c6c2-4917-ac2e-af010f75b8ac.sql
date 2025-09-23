-- Corrigir função com search_path seguro
CREATE OR REPLACE FUNCTION public.migrate_existing_titulos_to_clientes()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    titulo_record RECORD;
    cliente_id_var UUID;
BEGIN
    FOR titulo_record IN SELECT DISTINCT cliente, cpf_cnpj, contato, created_by FROM public.titulos LOOP
        -- Verificar se cliente já existe
        SELECT id INTO cliente_id_var 
        FROM public.clientes 
        WHERE cpf_cnpj = titulo_record.cpf_cnpj;
        
        -- Se não existe, criar
        IF cliente_id_var IS NULL THEN
            INSERT INTO public.clientes (nome, cpf_cnpj, telefone, created_by)
            VALUES (titulo_record.cliente, titulo_record.cpf_cnpj, titulo_record.contato, titulo_record.created_by)
            RETURNING id INTO cliente_id_var;
        END IF;
        
        -- Atualizar títulos para referenciar o cliente
        UPDATE public.titulos 
        SET cliente_id = cliente_id_var 
        WHERE cpf_cnpj = titulo_record.cpf_cnpj;
    END LOOP;
END;
$$;