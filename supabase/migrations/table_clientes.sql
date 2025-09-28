-- Adicionar foreign key constraint para created_by (se não existir)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'clientes_created_by_fkey'
        AND table_name = 'clientes'
    ) THEN
        ALTER TABLE public.clientes 
        ADD CONSTRAINT clientes_created_by_fkey 
        FOREIGN KEY (created_by) REFERENCES auth.users(id);
    END IF;
END$$;

-- Adicionar índice para created_by (se não existir)
CREATE INDEX IF NOT EXISTS idx_clientes_created_by 
ON public.clientes USING btree (created_by);

-- Habilitar Row Level Security
ALTER TABLE public.clientes ENABLE ROW LEVEL SECURITY;

-- Remover políticas existentes se houver
DROP POLICY IF EXISTS "Clientes são visíveis apenas para usuários autenticados" ON public.clientes;
DROP POLICY IF EXISTS "Clientes podem ser inseridos por usuários autenticados" ON public.clientes;
DROP POLICY IF EXISTS "Clientes podem ser atualizados por quem os criou" ON public.clientes;
DROP POLICY IF EXISTS "Clientes podem ser excluídos por quem os criou" ON public.clientes;

-- Criar políticas de segurança
CREATE POLICY "Clientes são visíveis apenas para usuários autenticados" 
ON public.clientes FOR SELECT 
USING (auth.role() = 'authenticated');

CREATE POLICY "Clientes podem ser inseridos por usuários autenticados" 
ON public.clientes FOR INSERT 
WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Clientes podem ser atualizados por quem os criou" 
ON public.clientes FOR UPDATE 
USING (auth.uid() = created_by);

CREATE POLICY "Clientes podem ser excluídos por quem os criou" 
ON public.clientes FOR DELETE 
USING (auth.uid() = created_by);