-- Drop existing tables and related objects
DROP TABLE IF EXISTS public.parcelas_acordo CASCADE;
DROP TABLE IF EXISTS public.acordos CASCADE;

-- Create acordos table with updated structure
CREATE TABLE public.acordos (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  titulo_id uuid NOT NULL,
  cliente_id uuid NOT NULL,
  valor_original numeric(10, 2) NOT NULL,
  valor_acordo numeric(10, 2) NOT NULL,
  desconto numeric(5, 2) NOT NULL DEFAULT 0,
  parcelas integer NOT NULL DEFAULT 1,
  valor_parcela numeric(10, 2) NOT NULL,
  taxa_juros numeric(5, 2) NULL DEFAULT 0, -- Nova coluna para taxa de juros
  data_acordo date NOT NULL DEFAULT CURRENT_DATE,
  data_inicio date NOT NULL DEFAULT CURRENT_DATE, -- Nova coluna
  data_vencimento_primeira_parcela date NOT NULL,
  status text NOT NULL DEFAULT 'ativo'::text,
  observacoes text NULL,
  created_by uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT acordos_pkey PRIMARY KEY (id),
  CONSTRAINT fk_titulo FOREIGN KEY (titulo_id) REFERENCES titulos(id) ON DELETE CASCADE,
  CONSTRAINT fk_cliente FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE CASCADE,
  CONSTRAINT fk_created_by FOREIGN KEY (created_by) REFERENCES auth.users(id),
  CONSTRAINT acordos_status_check CHECK (
    status = ANY (ARRAY[
      'ativo'::text,
      'cumprido'::text,
      'quebrado'::text,
      'cancelado'::text
    ])
  ),
  CONSTRAINT acordos_parcelas_check CHECK (parcelas > 0),
  CONSTRAINT acordos_valor_check CHECK (valor_acordo > 0 AND valor_original > 0),
  CONSTRAINT acordos_desconto_check CHECK (desconto >= 0 AND desconto <= 100),
  CONSTRAINT acordos_taxa_juros_check CHECK (taxa_juros >= 0 AND taxa_juros <= 100)
);

-- Create parcelas_acordo table 
CREATE TABLE public.parcelas_acordo (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  acordo_id uuid NOT NULL,
  numero_parcela integer NOT NULL,
  valor numeric(10, 2) NOT NULL,
  valor_juros numeric(10, 2) NOT NULL DEFAULT 0, -- Nova coluna para juros da parcela
  valor_total numeric(10, 2) NOT NULL, -- Nova coluna para valor total da parcela
  data_vencimento date NOT NULL,
  data_pagamento date NULL,
  status text NOT NULL DEFAULT 'pendente'::text,
  observacoes text NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT parcelas_acordo_pkey PRIMARY KEY (id),
  CONSTRAINT fk_acordo FOREIGN KEY (acordo_id) REFERENCES acordos(id) ON DELETE CASCADE,
  CONSTRAINT parcelas_status_check CHECK (
    status = ANY (ARRAY[
      'pendente'::text,
      'paga'::text,
      'vencida'::text
    ])
  ),
  CONSTRAINT unique_parcela_acordo UNIQUE (acordo_id, numero_parcela),
  CONSTRAINT parcelas_valor_check CHECK (valor > 0 AND valor_total > 0)
);

-- Create indexes for performance
CREATE INDEX idx_acordos_titulo_id ON public.acordos USING btree (titulo_id);
CREATE INDEX idx_acordos_cliente_id ON public.acordos USING btree (cliente_id);
CREATE INDEX idx_acordos_status ON public.acordos USING btree (status);
CREATE INDEX idx_acordos_data_acordo ON public.acordos USING btree (data_acordo);
CREATE INDEX idx_acordos_created_by ON public.acordos USING btree (created_by);

CREATE INDEX idx_parcelas_acordo_id ON public.parcelas_acordo USING btree (acordo_id);
CREATE INDEX idx_parcelas_status ON public.parcelas_acordo USING btree (status);
CREATE INDEX idx_parcelas_vencimento ON public.parcelas_acordo USING btree (data_vencimento);
CREATE INDEX idx_parcelas_numero ON public.parcelas_acordo USING btree (numero_parcela);

-- Create triggers for updated_at
CREATE TRIGGER update_acordos_updated_at 
  BEFORE UPDATE ON acordos 
  FOR EACH ROW 
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_parcelas_acordo_updated_at 
  BEFORE UPDATE ON parcelas_acordo 
  FOR EACH ROW 
  EXECUTE FUNCTION update_updated_at_column();

-- Enable RLS
ALTER TABLE public.acordos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.parcelas_acordo ENABLE ROW LEVEL SECURITY;

-- Create policies for acordos
CREATE POLICY "Acordos são visíveis apenas para usuários autenticados" ON public.acordos
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Acordos podem ser inseridos por usuários autenticados" ON public.acordos
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Acordos podem ser atualizados por quem os criou" ON public.acordos
  FOR UPDATE USING (auth.uid() = created_by);

CREATE POLICY "Acordos podem ser excluídos por quem os criou" ON public.acordos
  FOR DELETE USING (auth.uid() = created_by);

-- Create policies for parcelas_acordo
CREATE POLICY "Parcelas são visíveis apenas para usuários autenticados" ON public.parcelas_acordo
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.acordos
      WHERE acordos.id = parcelas_acordo.acordo_id
      AND acordos.created_by = auth.uid()
    )
  );

CREATE POLICY "Parcelas podem ser inseridas por usuários autenticados" ON public.parcelas_acordo
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.acordos
      WHERE acordos.id = acordo_id
      AND acordos.created_by = auth.uid()
    )
  );

CREATE POLICY "Parcelas podem ser atualizadas por quem criou o acordo" ON public.parcelas_acordo
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.acordos
      WHERE acordos.id = parcelas_acordo.acordo_id
      AND acordos.created_by = auth.uid()
    )
  );

CREATE POLICY "Parcelas podem ser excluídas por quem criou o acordo" ON public.parcelas_acordo
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.acordos
      WHERE acordos.id = parcelas_acordo.acordo_id
      AND acordos.created_by = auth.uid()
    )
  );

-- Create function to update acordo status based on parcelas
CREATE OR REPLACE FUNCTION update_acordo_status()
RETURNS TRIGGER AS $$
BEGIN
  -- Check if all parcelas are paid
  IF (SELECT COUNT(*) FROM parcelas_acordo WHERE acordo_id = NEW.acordo_id AND status != 'paga') = 0 THEN
    UPDATE acordos SET status = 'cumprido' WHERE id = NEW.acordo_id;
  -- Check if any parcela is overdue
  ELSIF (SELECT COUNT(*) FROM parcelas_acordo WHERE acordo_id = NEW.acordo_id AND status = 'vencida') > 0 THEN
    UPDATE acordos SET status = 'quebrado' WHERE id = NEW.acordo_id;
  ELSE
    UPDATE acordos SET status = 'ativo' WHERE id = NEW.acordo_id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically update acordo status
CREATE TRIGGER trigger_update_acordo_status
  AFTER UPDATE OF status ON parcelas_acordo
  FOR EACH ROW
  EXECUTE FUNCTION update_acordo_status();

-- Create function to check for overdue parcelas
CREATE OR REPLACE FUNCTION check_overdue_parcelas()
RETURNS void AS $$
BEGIN
  -- Mark overdue parcelas
  UPDATE parcelas_acordo 
  SET status = 'vencida'
  WHERE status = 'pendente' 
  AND data_vencimento < CURRENT_DATE;
END;
$$ LANGUAGE plpgsql;
