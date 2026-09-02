-- ================================================================
-- COBEB CICLO DE CARRETAS
-- Script: 064 — Timestamps de início e fim da conferência
-- Executar no Supabase Studio > SQL Editor
--
-- Adiciona dt_inicio_conferencia e dt_fim_conferencia à tabela
-- tarefas. Ambos são preenchidos automaticamente por trigger quando
-- o status transita para 'em_andamento' e 'concluida'.
-- Nenhuma alteração no frontend necessária.
-- ================================================================

-- ── 1. Colunas ────────────────────────────────────────────────────────────────

ALTER TABLE public.tarefas
  ADD COLUMN IF NOT EXISTS dt_inicio_conferencia TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS dt_fim_conferencia    TIMESTAMPTZ;

-- ── 2. Função trigger ─────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_tarefas_timestamps()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
BEGIN
  -- Registra início quando status passa para em_andamento
  IF OLD.status IS DISTINCT FROM NEW.status
     AND NEW.status = 'em_andamento'
     AND NEW.dt_inicio_conferencia IS NULL
  THEN
    NEW.dt_inicio_conferencia := NOW();
  END IF;

  -- Registra fim quando status passa para concluida
  IF OLD.status IS DISTINCT FROM NEW.status
     AND NEW.status = 'concluida'
     AND NEW.dt_fim_conferencia IS NULL
  THEN
    NEW.dt_fim_conferencia := NOW();
  END IF;

  RETURN NEW;
END;
$$;

-- ── 3. Trigger ────────────────────────────────────────────────────────────────

DROP TRIGGER IF EXISTS trg_tarefas_timestamps ON public.tarefas;

CREATE TRIGGER trg_tarefas_timestamps
  BEFORE UPDATE ON public.tarefas
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION public.fn_tarefas_timestamps();
