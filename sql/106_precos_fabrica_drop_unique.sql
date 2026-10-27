-- ================================================================
-- COBEB CICLO DE CARRETAS
-- Script: 106 — Remove índice único de vigência (dedup fica no cliente)
-- Executar no Supabase Studio > SQL Editor
-- ================================================================

-- Remove a constraint que conflita com duplicatas da planilha fonte
DROP INDEX IF EXISTS idx_precos_fabrica_vigencia;

-- Índice normal para lookup por (codigo, tabela) com data mais recente
CREATE INDEX IF NOT EXISTS idx_precos_fabrica_lookup
  ON public.precos_fabrica(codigo, tabela, data_vigencia DESC NULLS LAST);
