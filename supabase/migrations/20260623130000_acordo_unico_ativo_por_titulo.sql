-- =====================================================================
-- Garante NO MÁXIMO UM acordo ativo por título.
-- =====================================================================
-- Antes não havia trava: o seletor de títulos incluía os já 'renegociado'
-- e o banco não impedia um segundo acordo ativo no mesmo título, gerando
-- saldos sobrepostos. O frontend passa a esconder títulos em acordo ativo;
-- aqui está a trava autoritativa no banco.

-- 1) Saneia duplicados pré-existentes (estado inválido): para cada título com
--    mais de um acordo ATIVO, mantém o mais recente e cancela os demais.
WITH ranked AS (
  SELECT id,
         row_number() OVER (PARTITION BY titulo_id ORDER BY created_at DESC, id DESC) AS rn
  FROM public.acordos
  WHERE status = 'ativo'
)
UPDATE public.acordos a
   SET status = 'cancelado'
  FROM ranked r
 WHERE a.id = r.id
   AND r.rn > 1;

-- 2) Trava definitiva: índice único parcial. Permite vários acordos
--    cancelados/quebrados/cumpridos no histórico, mas só um ATIVO por título.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_acordo_ativo_por_titulo
  ON public.acordos (titulo_id)
  WHERE status = 'ativo';

NOTIFY pgrst, 'reload schema';
