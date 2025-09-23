-- Criar tabela de clientes
CREATE TABLE public.clientes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nome TEXT NOT NULL,
  cpf_cnpj TEXT NOT NULL UNIQUE,
  telefone TEXT,
  email TEXT,
  endereco_completo TEXT,
  cep TEXT,
  cidade TEXT,
  estado TEXT,
  status TEXT NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo', 'inadimplente', 'em_acordo', 'quitado')),
  observacoes TEXT,
  created_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Habilitar RLS
ALTER TABLE public.clientes ENABLE ROW LEVEL SECURITY;

-- Criar políticas RLS
CREATE POLICY "Authenticated users can view all clientes" 
ON public.clientes 
FOR SELECT 
USING (true);

CREATE POLICY "Authenticated users can insert clientes" 
ON public.clientes 
FOR INSERT 
WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Authenticated users can update clientes" 
ON public.clientes 
FOR UPDATE 
USING (true);

-- Criar tabela de histórico de comunicações
CREATE TABLE public.comunicacoes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  cliente_id UUID NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL CHECK (tipo IN ('ligacao', 'email', 'sms', 'whatsapp', 'visita', 'acordo', 'promessa')),
  canal TEXT NOT NULL CHECK (canal IN ('manual', 'automatico')),
  assunto TEXT NOT NULL,
  mensagem TEXT,
  anexos JSONB,
  resultado TEXT CHECK (resultado IN ('sucesso', 'sem_resposta', 'ocupado', 'promessa', 'acordo')),
  data_contato TIMESTAMP WITH TIME ZONE,
  created_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Habilitar RLS para comunicações
ALTER TABLE public.comunicacoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view all comunicacoes" 
ON public.comunicacoes 
FOR SELECT 
USING (true);

CREATE POLICY "Authenticated users can insert comunicacoes" 
ON public.comunicacoes 
FOR INSERT 
WITH CHECK (auth.uid() = created_by);

-- Criar tabela de anexos
CREATE TABLE public.anexos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  titulo_id UUID REFERENCES public.titulos(id) ON DELETE CASCADE,
  cliente_id UUID REFERENCES public.clientes(id) ON DELETE CASCADE,
  acordo_id UUID REFERENCES public.acordos(id) ON DELETE CASCADE,
  nome_arquivo TEXT NOT NULL,
  tipo_arquivo TEXT NOT NULL,
  tamanho_arquivo INTEGER,
  url_arquivo TEXT NOT NULL,
  categoria TEXT CHECK (categoria IN ('comprovante', 'documento', 'contrato', 'correspondencia')),
  created_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- RLS para anexos
ALTER TABLE public.anexos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view all anexos" 
ON public.anexos 
FOR SELECT 
USING (true);

CREATE POLICY "Authenticated users can insert anexos" 
ON public.anexos 
FOR INSERT 
WITH CHECK (auth.uid() = created_by);

-- Criar tabela de notificações
CREATE TABLE public.notificacoes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  titulo TEXT NOT NULL,
  mensagem TEXT NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('vencimento', 'atraso', 'acordo_quebrado', 'campanha', 'geral')),
  prioridade TEXT NOT NULL DEFAULT 'media' CHECK (prioridade IN ('baixa', 'media', 'alta', 'urgente')),
  lida BOOLEAN NOT NULL DEFAULT false,
  data_agendamento TIMESTAMP WITH TIME ZONE,
  metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- RLS para notificações
ALTER TABLE public.notificacoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own notificacoes" 
ON public.notificacoes 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "System can insert notificacoes" 
ON public.notificacoes 
FOR INSERT 
WITH CHECK (true);

CREATE POLICY "Users can update their own notificacoes" 
ON public.notificacoes 
FOR UPDATE 
USING (auth.uid() = user_id);

-- Adicionar trigger para updated_at em clientes
CREATE TRIGGER update_clientes_updated_at
BEFORE UPDATE ON public.clientes
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Criar índices para performance
CREATE INDEX idx_clientes_cpf_cnpj ON public.clientes(cpf_cnpj);
CREATE INDEX idx_clientes_status ON public.clientes(status);
CREATE INDEX idx_clientes_nome ON public.clientes(nome);
CREATE INDEX idx_comunicacoes_cliente_id ON public.comunicacoes(cliente_id);
CREATE INDEX idx_comunicacoes_tipo ON public.comunicacoes(tipo);
CREATE INDEX idx_comunicacoes_created_at ON public.comunicacoes(created_at DESC);
CREATE INDEX idx_anexos_titulo_id ON public.anexos(titulo_id);
CREATE INDEX idx_anexos_cliente_id ON public.anexos(cliente_id);
CREATE INDEX idx_notificacoes_user_id_lida ON public.notificacoes(user_id, lida);
CREATE INDEX idx_notificacoes_tipo ON public.notificacoes(tipo);

-- Modificar tabela títulos para referenciar clientes
ALTER TABLE public.titulos ADD COLUMN cliente_id UUID REFERENCES public.clientes(id);

-- Criar função para migrar dados existentes (se houver)
CREATE OR REPLACE FUNCTION public.migrate_existing_titulos_to_clientes()
RETURNS void
LANGUAGE plpgsql
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