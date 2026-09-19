-- ================================================================
-- COBEB CICLO DE CARRETAS
-- Script: 093 — Geofence: debounce de 3 pontos + re-entrada cancela saída
-- Executar no Supabase Studio > SQL Editor
-- ================================================================
--
-- Problema: um único ponto GPS fora do raio já disparava na_fabrica →
-- retornando, mesmo quando era interferência momentânea.
--
-- Solução:
--   1. Novo campo pontos_fora_count — contador de pontos consecutivos fora
--   2. Trigger exige 3 pontos consecutivos fora antes de marcar retornando
--   3. Se o caminhão voltar ao raio enquanto retornando → reverte para
--      na_fabrica e limpa dt_saida_fabrica (sem limite de tempo)
-- ================================================================

-- ── 1. Coluna contadora ───────────────────────────────────────────────────────

ALTER TABLE public.viagens
  ADD COLUMN IF NOT EXISTS pontos_fora_count INTEGER NOT NULL DEFAULT 0;

-- ── 2. Função atualizada ──────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_geofence_check()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  fab    RECORD;
  v_dist FLOAT;
  dentro BOOLEAN := FALSE;
BEGIN
  IF NEW.motorista_lat IS NULL OR NEW.motorista_lng IS NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.status NOT IN ('em_transito', 'na_fabrica', 'retornando') THEN
    RETURN NEW;
  END IF;

  -- Haversine contra todas as fábricas vinculadas via pedidos desta viagem
  FOR fab IN
    SELECT DISTINCT u.latitude, u.longitude, COALESCE(u.raio_geofence, 300) AS raio
    FROM public.pedidos p
    JOIN public.unidades u
      ON u.codigo_ambev = p.codigo_fabrica
     AND u.tipo = 'fabrica'
     AND u.latitude  IS NOT NULL
     AND u.longitude IS NOT NULL
    WHERE p.viagem_id = NEW.id
      AND p.codigo_fabrica IS NOT NULL
  LOOP
    v_dist := 6371000 * 2 * ASIN(SQRT(
      POWER(SIN((RADIANS(fab.latitude)  - RADIANS(NEW.motorista_lat))  / 2), 2) +
      COS(RADIANS(NEW.motorista_lat)) * COS(RADIANS(fab.latitude)) *
      POWER(SIN((RADIANS(fab.longitude) - RADIANS(NEW.motorista_lng)) / 2), 2)
    ));
    IF v_dist <= fab.raio THEN
      dentro := TRUE;
      EXIT;
    END IF;
  END LOOP;

  -- em_transito → na_fabrica (entrou no raio)
  IF dentro AND NEW.status = 'em_transito' THEN
    NEW.status             := 'na_fabrica';
    NEW.dt_chegada_fabrica := NOW();
    NEW.pontos_fora_count  := 0;

  -- na_fabrica: fora → debounce de 3 pontos consecutivos
  ELSIF NOT dentro AND NEW.status = 'na_fabrica' THEN
    NEW.pontos_fora_count := COALESCE(OLD.pontos_fora_count, 0) + 1;
    IF NEW.pontos_fora_count >= 3 THEN
      NEW.status            := 'retornando';
      NEW.dt_saida_fabrica  := NOW();
      NEW.pontos_fora_count := 0;
    END IF;

  -- na_fabrica: dentro → resetar contador (interferência descartada)
  ELSIF dentro AND NEW.status = 'na_fabrica' THEN
    NEW.pontos_fora_count := 0;

  -- retornando → na_fabrica (voltou ao raio — sem limite de tempo)
  ELSIF dentro AND NEW.status = 'retornando' THEN
    NEW.status            := 'na_fabrica';
    NEW.dt_saida_fabrica  := NULL;
    NEW.pontos_fora_count := 0;

  END IF;

  RETURN NEW;
END;
$$;

-- ── 3. Trigger: adiciona 'retornando' ao WHEN ─────────────────────────────────

DROP TRIGGER IF EXISTS trg_geofence_check ON public.viagens;

CREATE TRIGGER trg_geofence_check
  BEFORE UPDATE ON public.viagens
  FOR EACH ROW
  WHEN (
    NEW.status IN ('em_transito', 'na_fabrica', 'retornando')
    AND (
      OLD.motorista_lat IS DISTINCT FROM NEW.motorista_lat OR
      OLD.motorista_lng IS DISTINCT FROM NEW.motorista_lng
    )
  )
  EXECUTE FUNCTION public.fn_geofence_check();
