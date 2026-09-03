-- ================================================================
-- COBEB CICLO DE CARRETAS
-- Script: 069 — Campos de auditoria para status "furo" em pedidos
-- Executar no Supabase Studio > SQL Editor
--
-- O status TEXT já existe (adicionado em 060, padrão 'ativo').
-- Aqui apenas adicionamos os campos de auditoria do furo.
-- ================================================================

ALTER TABLE public.pedidos
  ADD COLUMN IF NOT EXISTS furo_marcado_em  TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS furo_marcado_por UUID        DEFAULT NULL
    REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_pedidos_status
  ON public.pedidos (status)
  WHERE status = 'furo';
