-- ================================================================
-- COBEB CICLO DE CARRETAS
-- Script: 098 — Cadastro de Turnos por Unidade
-- Executar no Supabase Studio > SQL Editor
-- ================================================================

-- ── 1. Tabela turnos ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.turnos (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  unidade_id  UUID        NOT NULL REFERENCES public.unidades(id) ON DELETE CASCADE,
  nome        TEXT        NOT NULL,
  hora_inicio TIME        NOT NULL,
  hora_fim    TIME        NOT NULL,
  ativo       BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.turnos ENABLE ROW LEVEL SECURITY;

-- ── 2. Índice ───────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_turnos_unidade ON public.turnos(unidade_id);

-- ── 3. Trigger updated_at ───────────────────────────────────────────────────────

DROP TRIGGER IF EXISTS trg_turnos_updated_at ON public.turnos;
CREATE TRIGGER trg_turnos_updated_at
  BEFORE UPDATE ON public.turnos
  FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();

-- ── 4. RLS — todos os admins gerenciam ─────────────────────────────────────────

DROP POLICY IF EXISTS "pol_turnos_select" ON public.turnos;
CREATE POLICY "pol_turnos_select"
  ON public.turnos FOR SELECT TO authenticated
  USING (is_admin() = TRUE);

DROP POLICY IF EXISTS "pol_turnos_insert" ON public.turnos;
CREATE POLICY "pol_turnos_insert"
  ON public.turnos FOR INSERT TO authenticated
  WITH CHECK (is_admin() = TRUE);

DROP POLICY IF EXISTS "pol_turnos_update" ON public.turnos;
CREATE POLICY "pol_turnos_update"
  ON public.turnos FOR UPDATE TO authenticated
  USING  (is_admin() = TRUE)
  WITH CHECK (is_admin() = TRUE);

DROP POLICY IF EXISTS "pol_turnos_delete" ON public.turnos;
CREATE POLICY "pol_turnos_delete"
  ON public.turnos FOR DELETE TO authenticated
  USING (is_admin() = TRUE);
