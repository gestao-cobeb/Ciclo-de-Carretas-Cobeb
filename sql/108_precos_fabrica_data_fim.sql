-- ================================================================
-- COBEB CICLO DE CARRETAS
-- Script: 108 — Adiciona coluna data_fim_vigencia (col F da TABELA.xlsx)
-- Executar no Supabase Studio > SQL Editor
-- ================================================================

-- Período de fim da vigência (null = vigência ainda em aberto)
ALTER TABLE public.precos_fabrica
  ADD COLUMN IF NOT EXISTS data_fim_vigencia DATE;
