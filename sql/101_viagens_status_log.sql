-- ================================================================
-- COBEB CICLO DE CARRETAS
-- Script: 101 — Audit log de mudanças de status em viagens
-- Executar no Supabase Studio > SQL Editor
-- ================================================================
--
-- CONTEXTO
-- ────────
-- Em setembro/2026 uma viagem ficou presa com status='retornando'
-- mesmo após dt_chegada_revenda já estar preenchida. A investigação
-- concluiu que um UPDATE direto foi executado no Supabase Studio
-- (changed_by = NULL identifica esse caso). Sem rastro, levou horas.
--
-- Esta tabela registra toda mudança de status em viagens:
--   quem mudou, de qual status, para qual, quando.
--
-- QUERY DE DIAGNÓSTICO
-- ────────────────────
-- Ver histórico de uma viagem específica:
--   SELECT * FROM viagens_status_log
--   WHERE viagem_id = '<uuid>'
--   ORDER BY changed_at;
--
-- Ver mudanças diretas (Studio / fora de RPC/trigger):
--   SELECT l.*, v.status AS status_atual
--   FROM viagens_status_log l
--   JOIN viagens v ON v.id = l.viagem_id
--   WHERE l.changed_by IS NULL
--   ORDER BY l.changed_at DESC;
-- ================================================================

-- ── 1. Tabela ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.viagens_status_log (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  viagem_id   UUID        NOT NULL REFERENCES public.viagens(id) ON DELETE CASCADE,
  status_de   TEXT,
  status_para TEXT        NOT NULL,
  changed_by  UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  changed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_status_log_viagem    ON public.viagens_status_log(viagem_id);
CREATE INDEX IF NOT EXISTS idx_status_log_changed_at ON public.viagens_status_log(changed_at DESC);

-- ── 2. RLS ────────────────────────────────────────────────────────────────────

ALTER TABLE public.viagens_status_log ENABLE ROW LEVEL SECURITY;

-- Apenas admins leem o histórico
DROP POLICY IF EXISTS "pol_status_log_select" ON public.viagens_status_log;
CREATE POLICY "pol_status_log_select"
  ON public.viagens_status_log FOR SELECT TO authenticated
  USING (is_admin() = TRUE);

-- Inserção exclusiva via trigger (SECURITY DEFINER — sem política explícita de INSERT)

-- ── 3. Função de trigger ──────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_log_viagem_status()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO public.viagens_status_log (viagem_id, status_de, status_para, changed_by)
    VALUES (NEW.id, OLD.status, NEW.status, auth.uid());
  END IF;
  RETURN NEW;
END;
$$;

-- ── 4. Trigger ────────────────────────────────────────────────────────────────

DROP TRIGGER IF EXISTS trg_viagens_status_log ON public.viagens;

CREATE TRIGGER trg_viagens_status_log
AFTER UPDATE ON public.viagens
FOR EACH ROW
EXECUTE FUNCTION public.fn_log_viagem_status();
