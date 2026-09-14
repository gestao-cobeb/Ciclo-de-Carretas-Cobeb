-- ================================================================
-- COBEB CICLO DE CARRETAS
-- Script: 081 — Adicionar 'realizado' ao check constraint de pedidos.status
-- Executar no Supabase Studio > SQL Editor
-- ================================================================

ALTER TABLE public.pedidos
  DROP CONSTRAINT IF EXISTS pedidos_status_check;

ALTER TABLE public.pedidos
  ADD CONSTRAINT pedidos_status_check
    CHECK (status IN ('ativo', 'cancelado', 'furo', 'realizado'));
