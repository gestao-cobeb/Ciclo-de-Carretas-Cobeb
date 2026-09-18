-- ================================================================
-- COBEB CICLO DE CARRETAS
-- Script: 090 — tarefas_operador: coluna descarga_at
-- Executar no Supabase Studio > SQL Editor
-- ================================================================
--
-- Registra o instante em que o operador confirmou "Descarga finalizada".
-- Usado no módulo Dados para calcular o tempo de descarga do veículo
-- (intervalo entre dt_entrada na portaria e descarga_at).

ALTER TABLE public.tarefas_operador
  ADD COLUMN IF NOT EXISTS descarga_at TIMESTAMPTZ;
