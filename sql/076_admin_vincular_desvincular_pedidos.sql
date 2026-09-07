-- ================================================================
-- COBEB CICLO DE CARRETAS
-- Script: 076 — Admin: desvincular viagem e vincular pedido pendente a viagem em trânsito
-- Executar no Supabase Studio > SQL Editor
-- ================================================================

-- ── Coluna auxiliar: dispara realtime no app do motorista ao vincular pedido ──
ALTER TABLE public.viagens
  ADD COLUMN IF NOT EXISTS pedidos_vinculados_em TIMESTAMPTZ;

-- ── RPC: admin_desvincular_viagem ─────────────────────────────────────────────
-- Cancela a viagem inteira: desvincula todos os pedidos (viagem_id → NULL)
-- e deleta a viagem. Bloqueado para status que passaram pela fábrica.

CREATE OR REPLACE FUNCTION public.admin_desvincular_viagem(p_viagem_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_status       TEXT;
  v_acesso_total BOOLEAN;
BEGIN
  SELECT acesso_total INTO v_acesso_total
  FROM public.profiles WHERE id = auth.uid();

  IF NOT COALESCE(v_acesso_total, false) THEN
    RAISE EXCEPTION 'Acesso negado: recurso exclusivo para administradores totais';
  END IF;

  SELECT status INTO v_status FROM public.viagens WHERE id = p_viagem_id;

  IF v_status IS NULL THEN
    RAISE EXCEPTION 'Viagem não encontrada';
  END IF;

  -- Bloqueia se a viagem já chegou ou passou pela fábrica
  IF v_status NOT IN ('iniciada', 'em_transito') THEN
    RAISE EXCEPTION 'VINCULO_FABRICA';
  END IF;

  -- Desvincula todos os pedidos desta viagem
  UPDATE public.pedidos
  SET viagem_id = NULL
  WHERE viagem_id = p_viagem_id;

  -- Deleta a viagem (agendamentos têm ON DELETE CASCADE; portaria/tarefas não existem nesta fase)
  DELETE FROM public.viagens WHERE id = p_viagem_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_desvincular_viagem(UUID) TO authenticated;

-- ── RPC: admin_vincular_pedido_viagem ─────────────────────────────────────────
-- Vincula todos os itens de um pedido pendente a uma viagem em trânsito.
-- Atualiza pedidos_vinculados_em na viagem para disparar o realtime do motorista.

CREATE OR REPLACE FUNCTION public.admin_vincular_pedido_viagem(
  p_numero_pedido BIGINT,
  p_viagem_id     UUID
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_acesso_total BOOLEAN;
  v_status       TEXT;
  v_ja_vinculado INT;
BEGIN
  SELECT acesso_total INTO v_acesso_total
  FROM public.profiles WHERE id = auth.uid();

  IF NOT COALESCE(v_acesso_total, false) THEN
    RAISE EXCEPTION 'Acesso negado: recurso exclusivo para administradores totais';
  END IF;

  -- Garante que os itens do pedido estão pendentes (sem viagem_id)
  SELECT COUNT(*) INTO v_ja_vinculado
  FROM public.pedidos
  WHERE numero_pedido = p_numero_pedido AND viagem_id IS NOT NULL;

  IF v_ja_vinculado > 0 THEN
    RAISE EXCEPTION 'Pedido já vinculado a outra viagem';
  END IF;

  -- Garante que a viagem alvo está em trânsito
  SELECT status INTO v_status FROM public.viagens WHERE id = p_viagem_id;

  IF v_status IS NULL THEN
    RAISE EXCEPTION 'Viagem não encontrada';
  END IF;

  IF v_status != 'em_transito' THEN
    RAISE EXCEPTION 'A viagem alvo não está em trânsito (status: %)', v_status;
  END IF;

  -- Vincula os itens do pedido
  UPDATE public.pedidos
  SET viagem_id = p_viagem_id
  WHERE numero_pedido = p_numero_pedido;

  -- Toca pedidos_vinculados_em para o realtime do motorista detectar
  UPDATE public.viagens
  SET pedidos_vinculados_em = now(),
      updated_at            = now()
  WHERE id = p_viagem_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_vincular_pedido_viagem(BIGINT, UUID) TO authenticated;
