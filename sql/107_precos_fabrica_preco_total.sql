-- ================================================================
-- COBEB CICLO DE CARRETAS
-- Script: 107 — Adiciona coluna preco_total (col M da TABELA.xlsx)
-- Executar no Supabase Studio > SQL Editor
-- ================================================================

-- Valor consolidado (preço + IPI + ICMS ST + FECOP) já calculado na planilha
ALTER TABLE public.precos_fabrica
  ADD COLUMN IF NOT EXISTS preco_total NUMERIC(10,4);
