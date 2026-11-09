-- ================================================================
-- COBEB CICLO DE CARRETAS
-- Script: 115 — gps_eventos: adiciona app_version
-- ⚠ RODAR NO SUPABASE ANTES DE PUBLICAR O APK v1.0.35
--
-- Grava a versão do APK no evento 'iniciar', permitindo que o
-- módulo de Monitoramento identifique motoristas com versão antiga.
-- ================================================================

ALTER TABLE public.gps_eventos
  ADD COLUMN IF NOT EXISTS app_version TEXT;
