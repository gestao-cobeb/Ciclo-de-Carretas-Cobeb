-- ================================================================
-- COBEB CICLO DE CARRETAS
-- Script: 096 — Fechar viagens orphaned (presas em status intermediário)
--
-- CONTEXTO
-- ─────────
-- Viagens que chegaram ao status 'retornando' via GPS automático mas cujo
-- motorista nunca registrou "Chegada na Revenda" ficam presas indefinidamente.
-- Quando um motorista acumula 2+ viagens nesse estado, o app dele para de
-- funcionar: a query com .maybeSingle() recebe múltiplas linhas e retorna
-- null, fazendo o app exibir o wizard de seleção de placa em vez da viagem ativa.
--
-- DIAGNÓSTICO — rode primeiro para ver o que será fechado:
-- ================================================================

-- 1. Ver todos os motoristas com múltiplas viagens ativas (indica o problema)
SELECT
  p.nome AS motorista,
  COUNT(*) AS viagens_abertas,
  array_agg(v.status ORDER BY v.created_at DESC) AS statuses,
  array_agg(v.created_at::date ORDER BY v.created_at DESC) AS datas
FROM public.viagens v
JOIN public.profiles p ON p.id = v.motorista_id
WHERE v.status <> 'concluida'
GROUP BY p.id, p.nome
HAVING COUNT(*) > 1
ORDER BY COUNT(*) DESC;

-- 2. Ver detalhes das viagens orphaned de um motorista específico
--    (substitua 'Breno' pelo nome real se necessário)
SELECT v.id, v.status, v.created_at, v.updated_at
FROM public.viagens v
JOIN public.profiles p ON p.id = v.motorista_id
WHERE p.nome ILIKE '%Breno%'
  AND v.status <> 'concluida'
ORDER BY v.created_at DESC;

-- ================================================================
-- CORREÇÃO — fecha todas as viagens orphaned de todos os motoristas,
-- mantendo apenas a mais recente de cada um.
--
-- ⚠ Revise o resultado do diagnóstico acima ANTES de rodar isto.
-- ================================================================

WITH motoristas_com_problema AS (
  SELECT motorista_id
  FROM public.viagens
  WHERE status <> 'concluida'
  GROUP BY motorista_id
  HAVING COUNT(*) > 1
),
viagem_mais_recente_por_motorista AS (
  SELECT DISTINCT ON (motorista_id) id
  FROM public.viagens
  WHERE motorista_id IN (SELECT motorista_id FROM motoristas_com_problema)
    AND status <> 'concluida'
  ORDER BY motorista_id, created_at DESC
)
UPDATE public.viagens
SET status = 'concluida'
WHERE motorista_id IN (SELECT motorista_id FROM motoristas_com_problema)
  AND status <> 'concluida'
  AND id NOT IN (SELECT id FROM viagem_mais_recente_por_motorista);

-- Confirme quantas linhas foram afetadas e rode o diagnóstico novamente para verificar.
