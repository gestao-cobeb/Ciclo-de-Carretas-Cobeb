-- ================================================================
-- COBEB CICLO DE CARRETAS
-- Script: 057 — Campo primeiro_acesso em profiles
-- Executar no Supabase Studio > SQL Editor
-- ================================================================

-- Usuários existentes já logaram antes — mantém FALSE
-- Novos usuários criados pelo admin receberão TRUE via frontend

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS primeiro_acesso BOOLEAN NOT NULL DEFAULT FALSE;
