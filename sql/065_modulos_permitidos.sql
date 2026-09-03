-- ================================================================
-- COBEB CICLO DE CARRETAS
-- Script: 065 — Módulos permitidos por usuário admin
-- Executar no Supabase Studio > SQL Editor
-- ================================================================

-- Nova coluna: lista de chaves de módulo autorizados para cada admin
-- NULL = acesso total (admin@cobeb.com.br) — todos os módulos
-- [] vazio = nenhum módulo (aguardando configuração)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS modulos_permitidos TEXT[] DEFAULT NULL;

-- Garante que a política de update de admin total já existente
-- cubra a nova coluna (sem alteração de RLS necessária, pois
-- as políticas de UPDATE afetam a linha inteira)
