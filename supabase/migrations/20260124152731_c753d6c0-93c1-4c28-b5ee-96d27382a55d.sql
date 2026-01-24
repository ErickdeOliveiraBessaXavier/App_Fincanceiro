-- Create agendamentos table for scheduling follow-ups
CREATE TABLE public.agendamentos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id UUID NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  titulo_id UUID REFERENCES public.titulos(id) ON DELETE SET NULL,
  acordo_id UUID REFERENCES public.acordos(id) ON DELETE SET NULL,
  tipo_evento TEXT NOT NULL,
  descricao TEXT,
  data_agendamento TIMESTAMP WITH TIME ZONE NOT NULL,
  status TEXT NOT NULL DEFAULT 'pendente',
  resultado TEXT,
  created_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.agendamentos ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Agendamentos são visíveis para usuários autenticados"
ON public.agendamentos
FOR SELECT
USING (auth.role() = 'authenticated');

CREATE POLICY "Agendamentos podem ser inseridos por usuários autenticados"
ON public.agendamentos
FOR INSERT
WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Agendamentos podem ser atualizados por quem os criou"
ON public.agendamentos
FOR UPDATE
USING (auth.uid() = created_by);

CREATE POLICY "Agendamentos podem ser excluídos por quem os criou"
ON public.agendamentos
FOR DELETE
USING (auth.uid() = created_by);

-- Create trigger for updated_at
CREATE TRIGGER update_agendamentos_updated_at
BEFORE UPDATE ON public.agendamentos
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create index for faster queries
CREATE INDEX idx_agendamentos_cliente_id ON public.agendamentos(cliente_id);
CREATE INDEX idx_agendamentos_data ON public.agendamentos(data_agendamento);
CREATE INDEX idx_agendamentos_status ON public.agendamentos(status);