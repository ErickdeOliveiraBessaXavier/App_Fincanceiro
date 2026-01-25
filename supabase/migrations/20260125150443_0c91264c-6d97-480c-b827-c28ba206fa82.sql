-- Criar profiles para usuários existentes que não têm
INSERT INTO public.profiles (user_id, email, nome)
SELECT u.id, u.email, COALESCE(u.raw_user_meta_data->>'nome', u.raw_user_meta_data->>'name', split_part(u.email, '@', 1))
FROM auth.users u
WHERE NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id = u.id);

-- FK para agendamentos.created_by -> profiles.user_id
ALTER TABLE public.agendamentos
ADD CONSTRAINT agendamentos_created_by_fkey 
FOREIGN KEY (created_by) REFERENCES public.profiles(user_id);

-- FK para comunicacoes.created_by -> profiles.user_id
ALTER TABLE public.comunicacoes
ADD CONSTRAINT comunicacoes_created_by_fkey 
FOREIGN KEY (created_by) REFERENCES public.profiles(user_id);