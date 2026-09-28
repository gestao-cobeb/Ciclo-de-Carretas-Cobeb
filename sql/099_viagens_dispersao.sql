-- ================================================================
-- COBEB CICLO DE CARRETAS
-- Script: 099 — Tabela de Dispersão por Viagem/Métrica
-- Executar no Supabase Studio > SQL Editor
-- ================================================================

-- ── 1. Tabela viagens_dispersao ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.viagens_dispersao (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  viagem_id  UUID        NOT NULL REFERENCES public.viagens(id) ON DELETE CASCADE,
  metrica    TEXT        NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (viagem_id, metrica)
);

ALTER TABLE public.viagens_dispersao ENABLE ROW LEVEL SECURITY;

-- ── 2. Índice ───────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_dispersao_viagem ON public.viagens_dispersao(viagem_id);

-- ── 3. RLS — todos os admins gerenciam ─────────────────────────────────────────

DROP POLICY IF EXISTS "pol_dispersao_select" ON public.viagens_dispersao;
CREATE POLICY "pol_dispersao_select"
  ON public.viagens_dispersao FOR SELECT TO authenticated
  USING (is_admin() = TRUE);

DROP POLICY IF EXISTS "pol_dispersao_insert" ON public.viagens_dispersao;
CREATE POLICY "pol_dispersao_insert"
  ON public.viagens_dispersao FOR INSERT TO authenticated
  WITH CHECK (is_admin() = TRUE);

DROP POLICY IF EXISTS "pol_dispersao_delete" ON public.viagens_dispersao;
CREATE POLICY "pol_dispersao_delete"
  ON public.viagens_dispersao FOR DELETE TO authenticated
  USING (is_admin() = TRUE);
