-- =====================================================================
-- Título cancelado deixa de reservar o seu número de documento.
-- =====================================================================
-- Sintoma: cancelar o título "123" e reimportar a mesma planilha falhava com
-- 409 (duplicate key em idx_titulos_numero_doc), sem mensagem amigável.
--
-- Causa: o importador e o índice discordavam sobre o que é um título existente.
--   * importar_titulo_completo (20260618130000) procura o título com
--     `... AND deleted_at IS NULL` — ou seja, IGNORA cancelados e parte para o
--     INSERT.
--   * idx_titulos_numero_doc (20260531170000:363) era
--     `UNIQUE (company_id, numero_documento) WHERE numero_documento IS NOT NULL`
--     — sem filtro de deleted_at, então ainda ENXERGAVA o cancelado e barrava
--     o INSERT.
-- Resultado prático: cancelar um título queimava o número dele para sempre
-- naquela empresa, mesmo o cancelamento sendo um soft delete reversível.
--
-- Correção: alinhar o índice ao que o importador já assume. O número volta a
-- ficar livre quando o título é cancelado, e passam a coexistir um "123"
-- cancelado (histórico) e um "123" ativo — que é o comportamento desejado.
--
-- Sem saneamento prévio: o predicado novo cobre um subconjunto das linhas que o
-- antigo cobria, então nenhum dado existente pode violá-lo.
--
-- Idempotente: o DROP garante que a definição antiga saia antes de recriar.
DROP INDEX IF EXISTS public.idx_titulos_numero_doc;

CREATE UNIQUE INDEX idx_titulos_numero_doc
  ON public.titulos (company_id, numero_documento)
  WHERE numero_documento IS NOT NULL AND deleted_at IS NULL;

NOTIFY pgrst, 'reload schema';
