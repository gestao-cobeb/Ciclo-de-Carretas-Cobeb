-- ================================================================
-- COBEB CICLO DE CARRETAS
-- Script: 121 — Placa do cavalo na justificativa de furo
-- Executar no Supabase Studio > SQL Editor
--
-- Contexto
-- ────────
-- Um furo não tem viagem (o pedido não foi puxado), então não existe
-- cavalo vinculado automaticamente. Esta coluna permite ao operador
-- registrar MANUALMENTE, na tela Justificativa de Furo, qual cavalo
-- (dos veículos cadastrados) ficou com aquele furo — base para o
-- gráfico "qual placa está furando mais".
--
-- Nullable de propósito: furos antigos e os ainda não classificados
-- ficam sem cavalo até alguém preencher na tela.
-- ON DELETE SET NULL: se o cavalo for removido do cadastro, a
-- justificativa permanece (só perde a placa), sem virar órfã.
-- ================================================================

ALTER TABLE public.pedido_furo_justificativa
  ADD COLUMN IF NOT EXISTS cavalo_id UUID
    REFERENCES public.cavalos(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_pedido_furo_just_cavalo
  ON public.pedido_furo_justificativa (cavalo_id);
