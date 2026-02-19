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