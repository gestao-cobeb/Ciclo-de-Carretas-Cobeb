-- ================================================================
-- COBEB CICLO DE CARRETAS
-- Script: 056 — Geofence automático via trigger no banco
-- Executar no Supabase Studio > SQL Editor
--
-- Problema: a verificação de geofence rodava só no JS (foreground).
-- Com tela apagada, o serviço nativo enviava GPS mas o status nunca mudava.
-- Solução: trigger BEFORE UPDATE na tabela viagens que checa geofence
-- sempre que lat/lng mudam, independente do estado do app.
-- ================================================================

CREATE OR REPLACE FUNCTION public.fn_geofence_check()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  fab    RECORD;
  v_dist FLOAT;
  dentro BOOLEAN := FALSE;
BEGIN
  -- Só processa se status relevante e coords presentes
  IF NEW.motorista_lat IS NULL OR NEW.motorista_lng IS NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.status NOT IN ('em_transito', 'na_fabrica') THEN
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

  -- em_transito → na_fabrica  (entrou no raio da fábrica)
  IF dentro AND NEW.status = 'em_transito' THEN
    NEW.status            := 'na_fabrica';
    NEW.dt_chegada_fabrica := NOW();
  END IF;

  -- na_fabrica → retornando  (saiu do raio da fábrica)
  IF NOT dentro AND NEW.status = 'na_fabrica' THEN
    NEW.status          := 'retornando';
    NEW.dt_saida_fabrica := NOW();
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_geofence_check ON public.viagens;

CREATE TRIGGER trg_geofence_check
  BEFORE UPDATE ON public.viagens
  FOR EACH ROW
  WHEN (
    NEW.status IN ('em_transito', 'na_fabrica')
    AND (
      OLD.motorista_lat IS DISTINCT FROM NEW.motorista_lat OR
      OLD.motorista_lng IS DISTINCT FROM NEW.motorista_lng
    )
  )
  EXECUTE FUNCTION public.fn_geofence_check();
