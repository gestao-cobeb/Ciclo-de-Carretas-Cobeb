-- ================================================================
-- COBEB CICLO DE CARRETAS
-- Script: 068 — Diferenciar "COBEB FILIAL - AB" e "COBEB FILIAL - LP"
-- Executar no Supabase Studio > SQL Editor
--
-- PASSO 1: execute primeiro o SELECT abaixo para identificar os IDs
-- PASSO 2: confirme os IDs e execute os dois UPDATEs
-- ================================================================

-- PASSO 1 — Ver os registros atuais das filiais:
SELECT id, nome, cidade, codigo_ambev, ativo
FROM public.unidades
WHERE nome ILIKE '%filial%'
ORDER BY nome, cidade;

-- ================================================================
-- PASSO 2 — Após identificar qual ID é qual, atualize os nomes.
-- Substitua os dois UUIDs pelos valores retornados no PASSO 1.
-- ================================================================

UPDATE public.unidades SET nome = 'COBEB FILIAL - AB' WHERE id = 'a7d28903-26db-4d41-bd3e-c1ac5b59d631';
UPDATE public.unidades SET nome = 'COBEB FILIAL - LP' WHERE id = 'c2f3d185-6d8c-4196-b7d2-e1dbb4b73a71';
