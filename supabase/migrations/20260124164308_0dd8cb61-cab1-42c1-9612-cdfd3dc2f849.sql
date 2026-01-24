-- =====================================================
-- LIMPEZA COMPLETA DE ÍNDICES ÓRFÃOS E MIGRATION
-- =====================================================

-- Dropar índices órfãos que podem existir sem a tabela
DROP INDEX IF EXISTS public.idx_parcelas_vencimento;
DROP INDEX IF EXISTS public.idx_parcelas_titulo_id;
DROP INDEX IF EXISTS public.idx_eventos_parcela_id;
DROP INDEX IF EXISTS public.idx_eventos_tipo;
DROP INDEX IF EXISTS public.idx_eventos_created_at;
DROP INDEX IF EXISTS public.idx_mv_parcelas_id;
DROP INDEX IF EXISTS public.idx_mv_parcelas_titulo_id;
DROP INDEX IF EXISTS public.idx_mv_parcelas_status;

-- Dropar view e MV
DROP VIEW IF EXISTS public.vw_titulos_completos;
DROP MATERIALIZED VIEW IF EXISTS public.mv_parcelas_consolidadas;

-- Dropar tabelas com CASCADE
DROP TABLE IF EXISTS public.eventos_parcela CASCADE;
DROP TABLE IF EXISTS public.parcelas CASCADE;

-- Dropar funções
DROP FUNCTION IF EXISTS public.criar_evento_emissao_parcela();
DROP FUNCTION IF EXISTS public.validar_titulo_tem_parcelas();
DROP FUNCTION IF EXISTS public.registrar_pagamento_parcela(UUID, NUMERIC, TEXT, TEXT, UUID);
DROP FUNCTION IF EXISTS public.aplicar_encargo_parcela(UUID, TEXT, NUMERIC, TEXT, UUID);
DROP FUNCTION IF EXISTS public.conceder_desconto_parcela(UUID, NUMERIC, TEXT, UUID);
DROP FUNCTION IF EXISTS public.estornar_evento_parcela(UUID, TEXT, UUID);
DROP FUNCTION IF EXISTS public.refresh_mv_parcelas();

-- =====================================================
-- PARTE 1: CRIAR TABELA PARCELAS
-- =====================================================

CREATE TABLE public.parcelas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo_id UUID NOT NULL REFERENCES public.titulos(id) ON DELETE CASCADE,
  numero_parcela INTEGER NOT NULL,
  valor_nominal NUMERIC(15,2) NOT NULL,
  vencimento DATE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(titulo_id, numero_parcela)
);

CREATE INDEX idx_parcelas_titulo_id ON public.parcelas(titulo_id);
CREATE INDEX idx_parcelas_vencimento ON public.parcelas(vencimento);

ALTER TABLE public.parcelas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Parcelas visíveis para usuários autenticados"
  ON public.parcelas FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Parcelas podem ser inseridas por usuários autenticados"
  ON public.parcelas FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM public.titulos t WHERE t.id = titulo_id AND t.created_by = auth.uid()));

CREATE POLICY "Parcelas podem ser excluídas pelo criador do título"
  ON public.parcelas FOR DELETE
  USING (EXISTS (SELECT 1 FROM public.titulos t WHERE t.id = titulo_id AND t.created_by = auth.uid()));

-- =====================================================
-- PARTE 2: CRIAR TABELA EVENTOS_PARCELA
-- =====================================================

CREATE TABLE public.eventos_parcela (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parcela_id UUID NOT NULL REFERENCES public.parcelas(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL CHECK (tipo IN (
    'emissao_parcela', 'pagamento_total', 'pagamento_parcial',
    'juros_aplicado', 'multa_aplicada', 'desconto_concedido', 'estorno'
  )),
  valor NUMERIC(15,2) NOT NULL CHECK (valor > 0),
  efeito INTEGER NOT NULL CHECK (efeito IN (0, 1, -1)),
  descricao TEXT,
  meio_pagamento TEXT CHECK (meio_pagamento IS NULL OR meio_pagamento IN (
    'pix', 'dinheiro', 'boleto', 'transferencia', 'cartao', 'outro'
  )),
  metadata JSONB,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  estornado BOOLEAN DEFAULT false,
  estornado_por_id UUID REFERENCES public.eventos_parcela(id)
);

CREATE INDEX idx_eventos_parcela_id ON public.eventos_parcela(parcela_id);
CREATE INDEX idx_eventos_tipo ON public.eventos_parcela(tipo);
CREATE INDEX idx_eventos_created_at ON public.eventos_parcela(created_at);

ALTER TABLE public.eventos_parcela ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Eventos visíveis para usuários autenticados"
  ON public.eventos_parcela FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Eventos podem ser inseridos por usuários autenticados"
  ON public.eventos_parcela FOR INSERT
  WITH CHECK (auth.uid() = created_by OR created_by IS NULL);

CREATE POLICY "Eventos podem ser atualizados para estorno"
  ON public.eventos_parcela FOR UPDATE
  USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

-- =====================================================
-- PARTE 3: MIGRAÇÃO DE DADOS
-- =====================================================

DO $$
DECLARE t RECORD; p RECORD;
BEGIN
  FOR t IN SELECT tp.id, tp.valor, tp.vencimento, tp.total_parcelas FROM public.titulos tp
    WHERE tp.titulo_pai_id IS NULL AND tp.total_parcelas IS NOT NULL AND tp.total_parcelas > 1
  LOOP
    FOR p IN SELECT id, valor, vencimento, numero_parcela FROM public.titulos WHERE titulo_pai_id = t.id ORDER BY numero_parcela
    LOOP
      INSERT INTO public.parcelas (titulo_id, numero_parcela, valor_nominal, vencimento)
      VALUES (t.id, p.numero_parcela, p.valor, p.vencimento) ON CONFLICT DO NOTHING;
    END LOOP;
  END LOOP;
  
  FOR t IN SELECT id, valor, vencimento FROM public.titulos 
    WHERE titulo_pai_id IS NULL AND (total_parcelas IS NULL OR total_parcelas <= 1)
  LOOP
    INSERT INTO public.parcelas (titulo_id, numero_parcela, valor_nominal, vencimento)
    VALUES (t.id, 1, t.valor, t.vencimento) ON CONFLICT DO NOTHING;
  END LOOP;
  
  DELETE FROM public.titulos WHERE titulo_pai_id IS NOT NULL;
END $$;

-- =====================================================
-- PARTE 4: MATERIALIZED VIEW
-- =====================================================

CREATE MATERIALIZED VIEW public.mv_parcelas_consolidadas AS
SELECT 
  p.id, p.titulo_id, p.numero_parcela, p.valor_nominal, p.vencimento,
  p.valor_nominal + COALESCE(SUM(CASE WHEN e.estornado = false AND e.efeito != 0 THEN e.valor * e.efeito ELSE 0 END), 0) AS saldo_atual,
  COALESCE(SUM(CASE WHEN e.tipo IN ('pagamento_total', 'pagamento_parcial') AND e.estornado = false THEN e.valor ELSE 0 END), 0) AS total_pago,
  COALESCE(SUM(CASE WHEN e.tipo = 'juros_aplicado' AND e.estornado = false THEN e.valor ELSE 0 END), 0) AS juros,
  COALESCE(SUM(CASE WHEN e.tipo = 'multa_aplicada' AND e.estornado = false THEN e.valor ELSE 0 END), 0) AS multa,
  COALESCE(SUM(CASE WHEN e.tipo = 'desconto_concedido' AND e.estornado = false THEN e.valor ELSE 0 END), 0) AS descontos,
  CASE
    WHEN p.valor_nominal + COALESCE(SUM(CASE WHEN e.estornado = false AND e.efeito != 0 THEN e.valor * e.efeito ELSE 0 END), 0) <= 0 THEN 'paga'
    WHEN p.vencimento < CURRENT_DATE THEN 'vencida'
    ELSE 'pendente'
  END AS status,
  MAX(e.created_at) FILTER (WHERE e.tipo IN ('pagamento_total', 'pagamento_parcial') AND e.estornado = false) AS data_ultimo_pagamento,
  COUNT(e.id) AS total_eventos
FROM public.parcelas p LEFT JOIN public.eventos_parcela e ON e.parcela_id = p.id GROUP BY p.id;

CREATE UNIQUE INDEX idx_mv_parcelas_id ON public.mv_parcelas_consolidadas(id);
CREATE INDEX idx_mv_parcelas_titulo_id ON public.mv_parcelas_consolidadas(titulo_id);
CREATE INDEX idx_mv_parcelas_status ON public.mv_parcelas_consolidadas(status);

-- =====================================================
-- PARTE 5: FUNÇÕES RPC
-- =====================================================

CREATE OR REPLACE FUNCTION public.registrar_pagamento_parcela(
  p_parcela_id UUID, p_valor NUMERIC, p_meio_pagamento TEXT, p_descricao TEXT DEFAULT NULL, p_created_by UUID DEFAULT NULL
) RETURNS jsonb AS $$
DECLARE v_saldo_atual NUMERIC; v_tipo_evento TEXT; v_evento_id UUID; v_parcela_info RECORD;
BEGIN
  SELECT id, saldo_atual, status INTO v_parcela_info FROM public.mv_parcelas_consolidadas WHERE id = p_parcela_id;
  IF v_parcela_info.id IS NULL THEN RAISE EXCEPTION 'Parcela não encontrada'; END IF;
  v_saldo_atual := v_parcela_info.saldo_atual;
  IF v_parcela_info.status = 'paga' THEN RAISE EXCEPTION 'Parcela já está paga'; END IF;
  IF p_valor <= 0 THEN RAISE EXCEPTION 'Valor deve ser positivo'; END IF;
  IF p_valor > v_saldo_atual THEN RAISE EXCEPTION 'Valor excede saldo devedor'; END IF;
  v_tipo_evento := CASE WHEN p_valor >= v_saldo_atual THEN 'pagamento_total' ELSE 'pagamento_parcial' END;
  INSERT INTO public.eventos_parcela (parcela_id, tipo, valor, efeito, meio_pagamento, descricao, created_by)
  VALUES (p_parcela_id, v_tipo_evento, p_valor, -1, p_meio_pagamento,
    COALESCE(p_descricao, format('Pagamento de R$ %s via %s', p_valor, p_meio_pagamento)), COALESCE(p_created_by, auth.uid()))
  RETURNING id INTO v_evento_id;
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_parcelas_consolidadas;
  RETURN jsonb_build_object('sucesso', true, 'evento_id', v_evento_id, 'tipo', v_tipo_evento,
    'saldo_anterior', v_saldo_atual, 'saldo_atual', v_saldo_atual - p_valor, 'valor_pago', p_valor);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.aplicar_encargo_parcela(
  p_parcela_id UUID, p_tipo TEXT, p_valor NUMERIC, p_descricao TEXT DEFAULT NULL, p_created_by UUID DEFAULT NULL
) RETURNS jsonb AS $$
DECLARE v_saldo_atual NUMERIC; v_evento_id UUID;
BEGIN
  IF p_tipo NOT IN ('juros_aplicado', 'multa_aplicada') THEN RAISE EXCEPTION 'Tipo inválido'; END IF;
  SELECT saldo_atual INTO v_saldo_atual FROM public.mv_parcelas_consolidadas WHERE id = p_parcela_id;
  IF v_saldo_atual IS NULL THEN RAISE EXCEPTION 'Parcela não encontrada'; END IF;
  INSERT INTO public.eventos_parcela (parcela_id, tipo, valor, efeito, descricao, created_by)
  VALUES (p_parcela_id, p_tipo, p_valor, 1,
    COALESCE(p_descricao, format('%s de R$ %s aplicado', CASE WHEN p_tipo = 'juros_aplicado' THEN 'Juros' ELSE 'Multa' END, p_valor)),
    COALESCE(p_created_by, auth.uid()))
  RETURNING id INTO v_evento_id;
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_parcelas_consolidadas;
  RETURN jsonb_build_object('sucesso', true, 'evento_id', v_evento_id, 'saldo_anterior', v_saldo_atual, 'saldo_atual', v_saldo_atual + p_valor);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.conceder_desconto_parcela(
  p_parcela_id UUID, p_valor NUMERIC, p_descricao TEXT DEFAULT NULL, p_created_by UUID DEFAULT NULL
) RETURNS jsonb AS $$
DECLARE v_saldo_atual NUMERIC; v_evento_id UUID;
BEGIN
  SELECT saldo_atual INTO v_saldo_atual FROM public.mv_parcelas_consolidadas WHERE id = p_parcela_id;
  IF v_saldo_atual IS NULL THEN RAISE EXCEPTION 'Parcela não encontrada'; END IF;
  IF p_valor > v_saldo_atual THEN RAISE EXCEPTION 'Desconto excede saldo'; END IF;
  INSERT INTO public.eventos_parcela (parcela_id, tipo, valor, efeito, descricao, created_by)
  VALUES (p_parcela_id, 'desconto_concedido', p_valor, -1,
    COALESCE(p_descricao, format('Desconto de R$ %s concedido', p_valor)), COALESCE(p_created_by, auth.uid()))
  RETURNING id INTO v_evento_id;
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_parcelas_consolidadas;
  RETURN jsonb_build_object('sucesso', true, 'evento_id', v_evento_id, 'saldo_anterior', v_saldo_atual, 'saldo_atual', v_saldo_atual - p_valor);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.estornar_evento_parcela(p_evento_id UUID, p_motivo TEXT, p_created_by UUID DEFAULT NULL
) RETURNS jsonb AS $$
DECLARE v_evento_original RECORD; v_evento_estorno_id UUID;
BEGIN
  SELECT * INTO v_evento_original FROM public.eventos_parcela WHERE id = p_evento_id;
  IF v_evento_original.id IS NULL THEN RAISE EXCEPTION 'Evento não encontrado'; END IF;
  IF v_evento_original.estornado THEN RAISE EXCEPTION 'Já estornado'; END IF;
  IF v_evento_original.tipo IN ('emissao_parcela', 'estorno') THEN RAISE EXCEPTION 'Não pode estornar'; END IF;
  UPDATE public.eventos_parcela SET estornado = true WHERE id = p_evento_id;
  INSERT INTO public.eventos_parcela (parcela_id, tipo, valor, efeito, descricao, created_by, estornado_por_id)
  VALUES (v_evento_original.parcela_id, 'estorno', v_evento_original.valor, v_evento_original.efeito * -1,
    format('Estorno: %s - Motivo: %s', v_evento_original.descricao, p_motivo), COALESCE(p_created_by, auth.uid()), p_evento_id)
  RETURNING id INTO v_evento_estorno_id;
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_parcelas_consolidadas;
  RETURN jsonb_build_object('sucesso', true, 'evento_estorno_id', v_evento_estorno_id, 'evento_original_id', p_evento_id, 'tipo_estornado', v_evento_original.tipo);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.refresh_mv_parcelas() RETURNS void AS $$
BEGIN REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_parcelas_consolidadas; END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- =====================================================
-- PARTE 6: TRIGGER DE EMISSÃO
-- =====================================================

CREATE OR REPLACE FUNCTION public.criar_evento_emissao_parcela() RETURNS TRIGGER AS $$
DECLARE v_total_parcelas INTEGER; v_created_by UUID;
BEGIN
  SELECT COUNT(*), MAX(t.created_by) INTO v_total_parcelas, v_created_by
  FROM public.parcelas p JOIN public.titulos t ON t.id = p.titulo_id WHERE p.titulo_id = NEW.titulo_id;
  INSERT INTO public.eventos_parcela (parcela_id, tipo, valor, efeito, descricao, created_by)
  VALUES (NEW.id, 'emissao_parcela', NEW.valor_nominal, 0,
    format('Parcela %s/%s emitida - Vencimento: %s', NEW.numero_parcela, v_total_parcelas, to_char(NEW.vencimento, 'DD/MM/YYYY')), v_created_by);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER trigger_evento_emissao_parcela AFTER INSERT ON public.parcelas FOR EACH ROW EXECUTE FUNCTION public.criar_evento_emissao_parcela();

-- =====================================================
-- PARTE 7: LIMPEZA DA TABELA TITULOS
-- =====================================================

ALTER TABLE public.titulos DROP COLUMN IF EXISTS titulo_pai_id;
ALTER TABLE public.titulos DROP COLUMN IF EXISTS numero_parcela;
ALTER TABLE public.titulos DROP COLUMN IF EXISTS total_parcelas;
ALTER TABLE public.titulos DROP COLUMN IF EXISTS status;
ALTER TABLE public.titulos DROP COLUMN IF EXISTS valor_original;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'titulos' AND column_name = 'valor') THEN
    ALTER TABLE public.titulos RENAME COLUMN valor TO valor_original;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'titulos' AND column_name = 'vencimento') THEN
    ALTER TABLE public.titulos RENAME COLUMN vencimento TO vencimento_original;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'titulos' AND column_name = 'observacoes') THEN
    ALTER TABLE public.titulos RENAME COLUMN observacoes TO descricao;
  END IF;
END $$;

ALTER TABLE public.titulos ADD COLUMN IF NOT EXISTS numero_documento VARCHAR(50);
ALTER TABLE public.titulos ADD COLUMN IF NOT EXISTS metadata JSONB;
CREATE UNIQUE INDEX IF NOT EXISTS idx_titulos_numero_documento ON public.titulos(numero_documento) WHERE numero_documento IS NOT NULL;

-- =====================================================
-- PARTE 8: VIEW DE TÍTULOS CONSOLIDADOS
-- =====================================================

CREATE VIEW public.vw_titulos_completos AS
SELECT 
  t.id, t.cliente_id, t.numero_documento, t.valor_original, t.vencimento_original, t.descricao, t.metadata, t.created_by, t.created_at, t.updated_at,
  c.nome AS cliente_nome, c.cpf_cnpj AS cliente_cpf_cnpj, c.telefone AS cliente_telefone, c.email AS cliente_email,
  COALESCE(COUNT(p.id), 0)::integer AS quantidade_parcelas,
  CASE WHEN COUNT(p.id) <= 1 THEN 'unico' ELSE 'parcelado' END AS tipo,
  COALESCE(SUM(mp.saldo_atual), 0)::numeric AS saldo_devedor,
  COALESCE(SUM(mp.total_pago), 0)::numeric AS total_pago,
  COALESCE(SUM(mp.juros), 0)::numeric AS total_juros,
  COALESCE(SUM(mp.multa), 0)::numeric AS total_multa,
  COALESCE(SUM(mp.descontos), 0)::numeric AS total_descontos,
  COALESCE(COUNT(p.id) FILTER (WHERE mp.status = 'paga'), 0)::integer AS parcelas_pagas,
  COALESCE(COUNT(p.id) FILTER (WHERE mp.status = 'vencida'), 0)::integer AS parcelas_vencidas,
  COALESCE(COUNT(p.id) FILTER (WHERE mp.status = 'pendente'), 0)::integer AS parcelas_pendentes,
  CASE
    WHEN COUNT(p.id) = 0 THEN 'sem_parcelas'
    WHEN COUNT(p.id) = COUNT(p.id) FILTER (WHERE mp.status = 'paga') THEN 'quitado'
    WHEN COUNT(p.id) FILTER (WHERE mp.status = 'vencida') > 0 THEN 'inadimplente'
    ELSE 'ativo'
  END AS status,
  MIN(p.vencimento) FILTER (WHERE mp.status != 'paga') AS proximo_vencimento
FROM public.titulos t
JOIN public.clientes c ON c.id = t.cliente_id
LEFT JOIN public.parcelas p ON p.titulo_id = t.id
LEFT JOIN public.mv_parcelas_consolidadas mp ON mp.id = p.id
GROUP BY t.id, c.id;

-- =====================================================
-- PARTE 9: CONSTRAINT DE INTEGRIDADE
-- =====================================================

CREATE OR REPLACE FUNCTION public.validar_titulo_tem_parcelas() RETURNS TRIGGER AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.parcelas WHERE titulo_id = NEW.id) THEN
    RAISE EXCEPTION 'Todo título deve ter ao menos uma parcela.';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER trigger_validar_titulo_tem_parcelas
AFTER INSERT ON public.titulos DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.validar_titulo_tem_parcelas();