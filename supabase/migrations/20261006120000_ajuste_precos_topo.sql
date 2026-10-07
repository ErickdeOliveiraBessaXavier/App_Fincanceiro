-- =====================================================================
-- Ajuste da tabela de preços no topo
-- =====================================================================
-- 1. Enterprise de R$ 1.197 para R$ 1.097/mês. Com 1.197, o degrau
--    Profissional → Enterprise custava R$ 40 por mil títulos, mais caro que
--    o degrau anterior (R$ 30) e que o excedente (R$ 30): o preço por mil do
--    Enterprise (39,90) ficava pior que o do Profissional (39,85). Com 1.097,
--    o custo de cada mil a mais só cai ou se mantém: 40 → 30 → 30 → 30.
--
-- 2. Implantação do bloco de excedente zerada. Implantação se cobra uma vez,
--    na entrada; cobrar R$ 500 a cada bloco atrapalha justo o momento em que
--    o cliente quer pagar mais. O campo continua no catálogo para o caso de
--    um bloco que exija migração de dados.
--
-- Cada UPDATE só vale se o valor ainda for o inicial: preço que o super admin
-- já tenha mudado em Plataforma › Preços não é sobrescrito. Nenhuma empresa
-- está no Enterprise hoje, então nenhuma mensalidade em curso muda.

UPDATE public.planos
   SET valor_mensal = 1097
 WHERE codigo = 'enterprise' AND valor_mensal = 1197;

UPDATE public.planos
   SET excedente_valor_implantacao = 0
 WHERE codigo = 'enterprise' AND excedente_valor_implantacao = 500;
