-- ================================================================
-- COBEB CICLO DE CARRETAS
-- Script: 097 — RPC motorista_dispensar_viagem
--
-- Permite ao motorista se desvinculdr da viagem ativa, devolvendo
-- os pedidos ao pool (virgens) e apagando o registro da viagem.
-- Só é permitido antes da chegada na revenda (antes de portaria/tarefas).
-- ================================================================

CREATE OR REPLACE FUNCTION public.motorista_dispensar_viagem(
  p_viagem_id UUID
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_status TEXT;
BEGIN
  -- Verifica que a viagem pertence ao motorista autenticado
  SELECT status INTO v_status
  FROM public.viagens
  WHERE id = p_viagem_id AND motorista_id = auth.uid();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Viagem não encontrada ou acesso negado';
  END IF;

  IF v_status IN ('aguardando_conferencia', 'concluida') THEN
    RAISE EXCEPTION
      'Não é possível dispensar: viagem já tem registro de chegada na revenda (status: %)',
      v_status;
  END IF;

  -- Remove pedidos substitutos criados pelo admin (arquivo_origem = 'SUBSTITUICAO_ADMIN')
  DELETE FROM public.pedidos
  WHERE viagem_id = p_viagem_id
    AND arquivo_origem = 'SUBSTITUICAO_ADMIN';

  -- Restaura pedidos originais: desvincula e volta status para 'ativo'
  UPDATE public.pedidos
  SET viagem_id = NULL,
      status    = 'ativo'
  WHERE viagem_id = p_viagem_id;

  -- Remove agendamentos vinculados (FK impede deletar a viagem antes)
  DELETE FROM public.agendamentos WHERE viagem_id = p_viagem_id;

  -- Remove tarefas, se existirem (safety net — normalmente não existem nesse ponto)
  DELETE FROM public.tarefas WHERE viagem_id = p_viagem_id;

  -- Remove portaria_atendimentos, se existirem (safety net)
  DELETE FROM public.portaria_atendimentos WHERE viagem_id = p_viagem_id;

  -- Deleta a viagem
  DELETE FROM public.viagens WHERE id = p_viagem_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.motorista_dispensar_viagem(UUID) TO authenticated;
