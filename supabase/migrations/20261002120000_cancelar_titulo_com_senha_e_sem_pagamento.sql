-- =====================================================================
-- Cancelar título: senha do admin conferida no banco + sem dinheiro pendurado
-- =====================================================================
-- Decisão do gestor (2026-10-01): todo título pode ser cancelado, mas só pelo
-- administrador e com a senha dele. Aprovada junto a regra do estorno.
--
-- 1. SENHA. A tela pede a senha e faz um login à parte (sem trocar a sessão
--    aberta); a chamada vai com esse token novo. O banco aceita só se o token
--    registrar um login POR SENHA nos últimos 5 minutos (claim `amr` do
--    Supabase Auth). Conferir só na tela não valeria nada: quem tem a sessão
--    aberta chamaria a RPC direto. A senha nunca passa pelo nosso código.
--
-- 2. ESTORNO ANTES. Título com pagamento não estornado não é cancelado. Antes,
--    cancelar escondia o título (deleted_at) mas os pagamentos continuavam em
--    vw_recebimentos: dinheiro recebido sem título visível. Agora o caminho é
--    estornar o pagamento (com motivo, auditado) e depois cancelar. O mesmo
--    vale para título quitado por acordo (renegociação não estornada): o
--    acordo precisa ser desfeito antes — como já era para acordo vigente.
--    Com o limite de títulos por plano, isso também impede liberar espaço
--    apagando recebimentos sem deixar rastro.

-- Login por senha recente no token da chamada.
CREATE OR REPLACE FUNCTION public._senha_confirmada_recentemente(p_segundos integer DEFAULT 300)
RETURNS boolean LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1
      FROM jsonb_array_elements(COALESCE(auth.jwt() -> 'amr', '[]'::jsonb)) a
     WHERE a ->> 'method' = 'password'
       AND to_timestamp((a ->> 'timestamp')::double precision)
           >= now() - make_interval(secs => p_segundos)
  );
$$;

-- Dinheiro que ainda aponta para o título: pagamento ou renegociação não
-- estornados em alguma parcela dele.
CREATE OR REPLACE FUNCTION public._titulo_tem_dinheiro_registrado(p_titulo_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.movimentos_financeiros m
      JOIN public.parcelas p ON p.id = m.parcela_titulo_id
     WHERE p.titulo_id = p_titulo_id
       AND m.tipo IN ('pagamento_total', 'pagamento_parcial', 'renegociacao')
       AND NOT COALESCE(m.estornado, false)
  );
$$;

CREATE OR REPLACE FUNCTION public.cancelar_titulo(p_titulo_id uuid, p_motivo text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_titulo record;
BEGIN
  IF NOT public.has_min_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Operação restrita ao administrador'; END IF;
  IF NOT public._senha_confirmada_recentemente() THEN
    RAISE EXCEPTION 'Confirme sua senha para cancelar o título' USING HINT = 'senha_requerida';
  END IF;

  SELECT * INTO v_titulo FROM public.titulos
    WHERE id = p_titulo_id AND company_id = public.current_company_id()
      FOR UPDATE;
  IF v_titulo.id IS NULL THEN RAISE EXCEPTION 'Título não encontrado'; END IF;
  IF v_titulo.status = 'cancelado' THEN RAISE EXCEPTION 'Título já cancelado'; END IF;

  IF public._titulo_em_acordo_vigente(p_titulo_id) THEN
    RAISE EXCEPTION 'Título possui acordo ativo ou quebrado. Cancele o acordo antes de cancelar o título.';
  END IF;
  IF public._titulo_tem_dinheiro_registrado(p_titulo_id) THEN
    RAISE EXCEPTION 'Título tem pagamento registrado (ou foi quitado por acordo). Estorne o pagamento antes de cancelar: assim o recebimento sai dos relatórios junto com o título.';
  END IF;

  UPDATE public.titulos
    SET status = 'cancelado', deleted_at = now(),
        metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('motivo_cancelamento', p_motivo)
    WHERE id = p_titulo_id;
  UPDATE public.parcelas SET deleted_at = now() WHERE titulo_id = p_titulo_id AND deleted_at IS NULL;
  UPDATE public.agendamentos SET deleted_at = now() WHERE titulo_id = p_titulo_id AND deleted_at IS NULL;

  RETURN jsonb_build_object('sucesso', true, 'titulo_id', p_titulo_id, 'status', 'cancelado');
END $$;

-- Conferência: a RPC continua exposta ao front; os helpers, não.
DO $$
BEGIN
  IF NOT has_function_privilege('authenticated', 'public.cancelar_titulo(uuid,text)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.cancelar_titulo(uuid,text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public._senha_confirmada_recentemente(integer)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public._titulo_tem_dinheiro_registrado(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'grant errado em cancelar_titulo';
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
