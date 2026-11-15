-- ================================================================
-- COBEB CICLO DE CARRETAS
-- Script: 120 — Responsabilidade do motivo de furo (Fábrica / Revenda)
-- Executar no Supabase Studio > SQL Editor
--
-- Classifica cada motivo de furo quanto à responsabilidade:
--   'fabrica'  → furo de responsabilidade da Fábrica
--   'revenda'  → furo de responsabilidade da Revenda (CD)
--
-- Nullable de propósito: os motivos já cadastrados no 119 ficam sem
-- classificação até serem ajustados em Cadastros > Metas (a tela obriga
-- a escolha em novos e permite ajustar os antigos).
-- ================================================================

ALTER TABLE public.motivos_furo
  ADD COLUMN IF NOT EXISTS responsabilidade TEXT
    CHECK (responsabilidade IN ('fabrica', 'revenda'));
