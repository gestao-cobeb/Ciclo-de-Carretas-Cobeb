-- ================================================================
-- COBEB CICLO DE CARRETAS
-- Script: 122 — Disponibilidade de cavalos (controle quinzenal)
-- Executar no Supabase Studio > SQL Editor
--
-- Contexto
-- ────────
-- A tabela "Disponibilidade" (Dashboard › Puxada) controla, por
-- quinzena, quais dias cada cavalo ficou DISPONÍVEL (OK) para rodar
-- e quais ficou INDISPONÍVEL (NOK). É base para o bônus quinzenal de
-- frete: quem acumula no máximo 1 dia NOK na quinzena ganha o prêmio.
--
-- Modelo de dados — a escolha que vale a pena entender:
-- ─────────────────────────────────────────────────────
-- O padrão é OK. Só gravamos o DESVIO. Uma linha nesta tabela
-- significa "este cavalo esteve INDISPONÍVEL (NOK) neste dia".
--   • célula sem linha  → OK  (disponível) — o estado normal
--   • célula com linha   → NOK (indisponível)
-- Marcar NOK = INSERT; voltar para OK = DELETE. O somatório de NOK da
-- quinzena é um simples COUNT das linhas no intervalo. Assim a tabela
-- fica pequena (só os dias-problema) e não precisa semear dia por dia.
--
-- 1) unidade_id em cavalos — o CD "casa" do veículo. A tabela de
--    disponibilidade filtra por CD, e o cavalo não tinha vínculo fixo
--    com unidade (só se descobria pela viagem). Nullable: cavalo sem
--    CD preenchido continua aparecendo quando o filtro é "Todos os CDs".
--    ON DELETE SET NULL: some o CD, o cavalo permanece.
-- ================================================================

-- ── 1. CD fixo do cavalo ───────────────────────────────────────────────────────

ALTER TABLE public.cavalos
  ADD COLUMN IF NOT EXISTS unidade_id UUID
    REFERENCES public.unidades(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_cavalos_unidade ON public.cavalos(unidade_id);

-- ── 2. Tabela disponibilidade_cavalos (linha = dia NOK) ────────────────────────

CREATE TABLE IF NOT EXISTS public.disponibilidade_cavalos (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  cavalo_id      UUID        NOT NULL REFERENCES public.cavalos(id) ON DELETE CASCADE,
  data           DATE        NOT NULL,
  motivo         TEXT,                       -- opcional: por que ficou indisponível
  registrado_por UUID        REFERENCES public.profiles(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (cavalo_id, data)                   -- um registro por cavalo por dia
);

ALTER TABLE public.disponibilidade_cavalos ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS trg_disp_cavalos_updated_at ON public.disponibilidade_cavalos;
CREATE TRIGGER trg_disp_cavalos_updated_at
  BEFORE UPDATE ON public.disponibilidade_cavalos
  FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();

-- ── 3. Índices ─────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_disp_cavalos_cavalo ON public.disponibilidade_cavalos(cavalo_id);
CREATE INDEX IF NOT EXISTS idx_disp_cavalos_data   ON public.disponibilidade_cavalos(data);

-- ── 4. RLS policies (mesmo padrão do módulo de manutenção, script 036) ──────────

DROP POLICY IF EXISTS "pol_disp_cavalos_select" ON public.disponibilidade_cavalos;
CREATE POLICY "pol_disp_cavalos_select"
  ON public.disponibilidade_cavalos FOR SELECT TO authenticated
  USING (is_admin() = TRUE);

DROP POLICY IF EXISTS "pol_disp_cavalos_insert" ON public.disponibilidade_cavalos;
CREATE POLICY "pol_disp_cavalos_insert"
  ON public.disponibilidade_cavalos FOR INSERT TO authenticated
  WITH CHECK (is_admin_total() = TRUE);

DROP POLICY IF EXISTS "pol_disp_cavalos_update" ON public.disponibilidade_cavalos;
CREATE POLICY "pol_disp_cavalos_update"
  ON public.disponibilidade_cavalos FOR UPDATE TO authenticated
  USING  (is_admin_total() = TRUE)
  WITH CHECK (is_admin_total() = TRUE);

DROP POLICY IF EXISTS "pol_disp_cavalos_delete" ON public.disponibilidade_cavalos;
CREATE POLICY "pol_disp_cavalos_delete"
  ON public.disponibilidade_cavalos FOR DELETE TO authenticated
  USING (is_admin_total() = TRUE);
