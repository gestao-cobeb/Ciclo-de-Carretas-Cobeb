-- ================================================================
-- COBEB CICLO DE CARRETAS
-- Script: 092 — Corrigir placa_cavalo nula em tarefas_operador
-- Executar no Supabase Studio > SQL Editor
-- ================================================================
--
-- Problema: cards criados pelo fallback INSERT do EmissaoNRI ficaram
-- com placa_cavalo = NULL quando o cavalo não estava vinculado à viagem.
-- A placa correta está registrada em portaria_atendimentos.
--
-- Verificar antes de executar:
SELECT
  t.id,
  t.unidade_id,
  t.numero_nf,
  t.placa_cavalo   AS placa_atual,
  pa.placa_cavalo  AS placa_portaria,
  t.status,
  t.created_at
FROM public.tarefas_operador t
JOIN public.portaria_atendimentos pa
  ON  pa.numero_nf  = t.numero_nf
  AND pa.unidade_id = t.unidade_id
WHERE t.placa_cavalo IS NULL
  AND pa.placa_cavalo IS NOT NULL
ORDER BY t.created_at;

-- ================================================================
-- EXECUTAR SOMENTE APÓS CONFIRMAR OS RESULTADOS ACIMA
-- ================================================================

UPDATE public.tarefas_operador t
SET placa_cavalo = pa.placa_cavalo
FROM public.portaria_atendimentos pa
WHERE pa.numero_nf  = t.numero_nf
  AND pa.unidade_id = t.unidade_id
  AND t.placa_cavalo IS NULL
  AND pa.placa_cavalo IS NOT NULL;
