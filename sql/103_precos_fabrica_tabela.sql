-- ================================================================
-- COBEB CICLO DE CARRETAS
-- Script: 103 — Suporte a múltiplas tabelas de preço (Pratic + Cheia)
-- Executar no Supabase Studio > SQL Editor
-- ================================================================

-- Adiciona coluna tabela (default 'Pratic' mantém dados existentes)
ALTER TABLE public.precos_fabrica
  ADD COLUMN IF NOT EXISTS tabela TEXT NOT NULL DEFAULT 'Pratic';

-- Recria a chave primária como composta (codigo, tabela)
ALTER TABLE public.precos_fabrica
  DROP CONSTRAINT IF EXISTS precos_fabrica_pkey;

ALTER TABLE public.precos_fabrica
  ADD PRIMARY KEY (codigo, tabela);

-- Reaplica índice de busca por codigo
DROP INDEX IF EXISTS idx_precos_fabrica_codigo;
CREATE INDEX IF NOT EXISTS idx_precos_fabrica_codigo ON public.precos_fabrica(codigo);
