-- ================================================================
-- COBEB CICLO DE CARRETAS
-- Script: 066 — Permissão granular de Grade por usuário admin
-- Executar no Supabase Studio > SQL Editor
-- ================================================================

-- Permissão específica para editar a aba Grade dentro do módulo Cadastros.
-- NULL / FALSE = sem acesso à Grade (mesmo tendo módulo Cadastros autorizado).
-- TRUE = pode visualizar e editar a Grade.
-- Acesso total (acesso_total = true) ignora esta coluna e sempre vê a Grade.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS grade_permitida BOOLEAN NOT NULL DEFAULT FALSE;
