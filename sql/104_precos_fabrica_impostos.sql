-- ================================================================
-- COBEB CICLO DE CARRETAS
-- Script: 104 — Adiciona colunas de impostos à tabela precos_fabrica
-- Executar no Supabase Studio > SQL Editor
-- ================================================================

-- IPI por caixa (col J da TABELA.xlsx)
ALTER TABLE public.precos_fabrica
  ADD COLUMN IF NOT EXISTS ipi NUMERIC(10,4);

-- ICMS da Revenda (ICMS ST) por caixa (col K da TABELA.xlsx)
ALTER TABLE public.precos_fabrica
  ADD COLUMN IF NOT EXISTS icms_revenda NUMERIC(10,4);

-- Base de Cálculo Total por caixa (col R da TABELA.xlsx)
-- FECOP = base_calc × 2%
ALTER TABLE public.precos_fabrica
  ADD COLUMN IF NOT EXISTS base_calc NUMERIC(10,4);
