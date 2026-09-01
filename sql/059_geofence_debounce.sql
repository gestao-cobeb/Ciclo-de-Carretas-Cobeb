-- ================================================================
-- COBEB CICLO DE CARRETAS
-- Script: 059 — Geofence: debounce de saída da fábrica (3 pings)
-- Executar no Supabase Studio > SQL Editor
--
-- Problema: um único ping GPS impreciso dentro do raio da fábrica
-- disparava imediatamente a transição na_fabrica → retornando.
-- Solução: exigir 3 pings consecutivos fora do raio antes de confirmar
-- a saída. Se qualquer ping voltar dentro do raio, o contador é zerado.
-- Com GPS a cada ~30s, 3 pings = ~90 segundos de confirmação.
-- ================================================================

-- Adiciona contador de debounce na tabela viagens
ALTER TABLE public.viagens
ADD COLUMN IF NOT EXISTS pings_fora_fabrica INT NOT NULL DEFAULT 0;

-- Atualiza a função do trigger com debounce de saída
CREATE OR REPLACE FUNCTION public.fn_geofence_check()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  fab          RECORD;
  v_dist       FLOAT;
  dentro       BOOLEAN := FALSE;
  LIMITE CONSTANT INT := 3;
BEGIN
  IF NEW.motorista_lat IS NULL OR NEW.motorista_lng IS NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.status NOT IN ('em_transito', 'na_fabrica') THEN
    RETURN NEW;
  END IF;

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

  -- em_transito → na_fabrica: entrada imediata, sem debounce, reseta contador
  IF dentro AND NEW.status = 'em_transito' THEN
    NEW.status             := 'na_fabrica';
    NEW.dt_chegada_fabrica := NOW();
    NEW.pings_fora_fabrica := 0;
  END IF;

  -- na_fabrica: debounce de saída
  IF NEW.status = 'na_fabrica' THEN
    IF dentro THEN
      -- ping voltou para dentro: era glitch, reseta contador
      NEW.pings_fora_fabrica := 0;
    ELSE
      -- ping fora do raio: incrementa contador
      NEW.pings_fora_fabrica := COALESCE(OLD.pings_fora_fabrica, 0) + 1;
      -- confirma saída apenas após 3 pings consecutivos fora (~90s)
      IF NEW.pings_fora_fabrica >= LIMITE THEN
        NEW.status             := 'retornando';
        NEW.dt_saida_fabrica   := NOW();
        NEW.pings_fora_fabrica := 0;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
