-- ================================================================
-- COBEB CICLO DE CARRETAS
-- Script: 113 — gps_eventos: adiciona sem_sinal tracking
-- Executar no Supabase Studio > SQL Editor
--
-- Adiciona coluna duracao_segundos (usada pelos eventos 'sem_sinal')
-- e expande o CHECK para aceitar o novo tipo de evento.
-- O app registra 'sem_sinal' quando sincronizar() fica sem posição
-- ou offline por mais de 5 minutos e depois se recupera.
-- ================================================================

ALTER TABLE public.gps_eventos
  ADD COLUMN IF NOT EXISTS duracao_segundos INTEGER;

ALTER TABLE public.gps_eventos
  DROP CONSTRAINT IF EXISTS gps_eventos_evento_check;

ALTER TABLE public.gps_eventos
  ADD CONSTRAINT gps_eventos_evento_check
    CHECK (evento IN ('iniciar', 'parar', 'sem_sinal'));
