-- ================================================================
-- COBEB CICLO DE CARRETAS
-- Script: 077 — Vincular pedido pendente em qualquer fase da viagem
-- Executar no Supabase Studio > SQL Editor
-- ================================================================

-- Atualiza o RPC para permitir vínculo em qualquer status ativo (não concluída).

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

  -- Permite vincular em qualquer fase, exceto viagem concluída
  SELECT status INTO v_status FROM public.viagens WHERE id = p_viagem_id;

  IF v_status IS NULL THEN
    RAISE EXCEPTION 'Viagem não encontrada';
  END IF;

  IF v_status = 'concluida' THEN
    RAISE EXCEPTION 'Não é possível vincular pedidos a uma viagem já concluída';
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
