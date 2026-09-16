-- ================================================================
-- COBEB CICLO DE CARRETAS
-- Script: 054 — Permitir reagendamento após cancelamento
-- Executar no Supabase Studio > SQL Editor
-- ================================================================

-- A constraint única atual bloqueia inserir novo agendamento quando
-- já existe um cancelado para a mesma viagem.
-- Solução: substituir por índice único parcial (exclui cancelados).

ALTER TABLE public.agendamentos
  DROP CONSTRAINT IF EXISTS agendamentos_viagem_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS agendamentos_viagem_id_ativo_key
  ON public.agendamentos(viagem_id)
  WHERE status <> 'cancelado';
