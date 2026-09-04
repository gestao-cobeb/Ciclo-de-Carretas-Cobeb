-- ================================================================
-- COBEB CICLO DE CARRETAS
-- Script: 074 — Vincular novos itens importados a viagens ativas
-- Executar no Supabase Studio > SQL Editor
--
-- Contexto: ao importar uma BASE com novos cod_produto em números
-- de pedido já vinculados a uma viagem ativa, a lógica de
-- importação inseria os novos rows sem viagem_id. Este script
-- corrige os rows orphanos já existentes no banco.
-- ================================================================

UPDATE public.pedidos p
SET viagem_id = sub.viagem_id
FROM (
  SELECT DISTINCT ON (p_orphan.id)
    p_orphan.id,
    p_linked.viagem_id
  FROM public.pedidos p_orphan
  JOIN public.pedidos p_linked
    ON p_linked.numero_pedido = p_orphan.numero_pedido
   AND p_linked.viagem_id IS NOT NULL
  JOIN public.viagens v
    ON v.id = p_linked.viagem_id
   AND v.status <> 'concluida'
  WHERE p_orphan.viagem_id IS NULL
) sub
WHERE p.id = sub.id;
