-- ================================================================
-- COBEB CICLO DE CARRETAS
-- Script: 080 — Múltiplas datas por produto na conferência
-- Executar no Supabase Studio > SQL Editor
-- ================================================================

-- Remove a restrição UNIQUE(tarefa_id, pedido_id) para permitir
-- múltiplas entradas (qtde + data) por produto dentro de uma mesma tarefa.
-- Cada linha continua identificada pelo seu próprio UUID (id PK).

ALTER TABLE public.conferencia_itens
  DROP CONSTRAINT IF EXISTS conferencia_itens_tarefa_id_pedido_id_key;
