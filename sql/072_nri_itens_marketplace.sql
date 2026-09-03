-- ================================================================
-- COBEB CICLO DE CARRETAS
-- Script: 072 — Armazenar itens dos grupos na NRI marketplace
-- Executar no Supabase Studio > SQL Editor
--
-- Adiciona coluna JSONB em nri_emissoes para guardar os itens
-- digitados pelo conferente ao gerar NRI de entrada marketplace.
-- Isso permite reconstruir o PDF no Check de Recebimento.
-- Registros anteriores ficam com itens = NULL.
-- ================================================================

ALTER TABLE public.nri_emissoes
  ADD COLUMN IF NOT EXISTS itens JSONB DEFAULT NULL;
