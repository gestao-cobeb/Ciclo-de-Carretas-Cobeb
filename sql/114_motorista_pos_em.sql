-- ================================================================
-- COBEB CICLO DE CARRETAS
-- Script: 114 — viagens: adiciona motorista_pos_em
-- ⚠ RODAR NO SUPABASE ANTES DE PUBLICAR O APK v1.0.35
--
-- motorista_pos_em = hora real em que o GPS capturou a posição (loc.getTime())
-- motorista_last_seen_at = hora em que o PATCH foi enviado ao servidor
-- A diferença entre os dois indica latência de envio ou gap de conectividade.
-- ================================================================

ALTER TABLE public.viagens
  ADD COLUMN IF NOT EXISTS motorista_pos_em TIMESTAMPTZ;
