-- ================================================================
-- COBEB CICLO DE CARRETAS
-- Script: 091 — Limpeza de cards duplicados em tarefas_operador
-- Executar no Supabase Studio > SQL Editor
-- ================================================================
--
-- Problema: quando o conferente emitia a NRI enquanto o card ainda
-- estava em 'aguardando_descarga' (não 'aguardando_nri'), o UPDATE
-- em EmissaoNRI retornava 0 linhas e o fallback INSERT criava um
-- segundo card com status 'pendente' para a mesma placa+NF.
--
-- Este script remove o card mais antigo (aguardando_descarga)
-- quando já existe um card mais avançado (pendente/em_andamento)
-- para o mesmo número de NF na mesma unidade.
--
-- Verificar antes de executar:
SELECT
  id,
  unidade_id,
  placa_cavalo,
  numero_nf,
  status,
  created_at
FROM public.tarefas_operador
WHERE numero_nf = '1227451'
ORDER BY created_at;

-- ================================================================
-- EXECUTAR SOMENTE APÓS CONFIRMAR OS RESULTADOS ACIMA
-- Remove o card 'aguardando_descarga' da NF 1227451 pois a NRI já
-- foi emitida e o card 'pendente' é o correto para prosseguir.
-- ================================================================

DELETE FROM public.tarefas_operador
WHERE numero_nf = '1227451'
  AND status = 'aguardando_descarga'
  AND EXISTS (
    SELECT 1 FROM public.tarefas_operador t2
    WHERE t2.numero_nf    = '1227451'
      AND t2.unidade_id   = tarefas_operador.unidade_id
      AND t2.placa_cavalo = tarefas_operador.placa_cavalo
      AND t2.status IN ('pendente', 'em_andamento', 'concluido')
  );
