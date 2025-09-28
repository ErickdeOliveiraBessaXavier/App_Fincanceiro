-- Adicionar RLS e políticas à tabela existente (se ainda não tiver)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE policyname = 'Títulos são visíveis apenas para usuários autenticados' 
        AND tablename = 'titulos'
    ) THEN
        ALTER TABLE public.titulos ENABLE ROW LEVEL SECURITY;
        
        CREATE POLICY "Títulos são visíveis apenas para usuários autenticados" 
        ON public.titulos FOR SELECT 
        USING (auth.role() = 'authenticated');

        CREATE POLICY "Títulos podem ser inseridos por usuários autenticados" 
        ON public.titulos FOR INSERT 
        WITH CHECK (auth.role() = 'authenticated');

        CREATE POLICY "Títulos podem ser atualizados por quem os criou" 
        ON public.titulos FOR UPDATE 
        USING (auth.uid() = created_by);

        CREATE POLICY "Títulos podem ser excluídos por quem os criou" 
        ON public.titulos FOR DELETE 
        USING (auth.uid() = created_by);
    END IF;
END$$;
