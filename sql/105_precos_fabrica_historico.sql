-- ================================================================
-- COBEB CICLO DE CARRETAS
-- Script: 105 — Permite múltiplas vigências por (codigo, tabela)
-- Executar no Supabase Studio > SQL Editor
-- ================================================================

-- Remove a PK composta (codigo, tabela) criada em 103
ALTER TABLE public.precos_fabrica
  DROP CONSTRAINT IF EXISTS precos_fabrica_pkey;

-- Nova PK surrogate — suporta múltiplas linhas por (codigo, tabela)
ALTER TABLE public.precos_fabrica
  ADD COLUMN IF NOT EXISTS id BIGSERIAL PRIMARY KEY;

-- Índice único por (codigo, tabela, data_vigencia) para integridade histórica
DROP INDEX IF EXISTS idx_precos_fabrica_vigencia;
CREATE UNIQUE INDEX idx_precos_fabrica_vigencia
  ON public.precos_fabrica(codigo, tabela, data_vigencia)
  WHERE data_vigencia IS NOT NULL;
