-- ================================================================
-- COBEB CICLO DE CARRETAS
-- Script: 100 — RPC admin_reagendar_revenda
-- Executar no Supabase Studio > SQL Editor
-- ================================================================
--
-- Permite que o admin altere o agendamento de chegada na revenda
-- de uma viagem ativa, diretamente do painel em tempo real.
--
-- Fluxo:
--   1. Cancela o agendamento ativo da viagem (se existir)
--   2. Insere novo agendamento com o bloco/data selecionados
--      usando o motorista_id da própria viagem
--
-- O motorista verá o novo horário imediatamente ao recarregar
-- a tela de viagem (a consulta de agendamentos usa status <> 'cancelado').
-- ================================================================

CREATE OR REPLACE FUNCTION public.admin_reagendar_revenda(
  p_viagem_id  UUID,
  p_grade_id   UUID,
  p_data       DATE,
  p_tipo_dia   TEXT,
  p_bloco      TEXT,
  p_revenda_id UUID
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_motorista_id UUID;
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  SELECT motorista_id INTO v_motorista_id
  FROM public.viagens
  WHERE id = p_viagem_id;

  IF v_motorista_id IS NULL THEN
    RAISE EXCEPTION 'Viagem não encontrada';
  END IF;

  -- Cancela agendamento ativo existente
  UPDATE public.agendamentos
    SET status = 'cancelado'
  WHERE viagem_id = p_viagem_id
    AND status <> 'cancelado';

  -- Insere novo agendamento
  INSERT INTO public.agendamentos (
    viagem_id, revenda_id, grade_id,
    data_agendamento, tipo_dia, bloco,
    motorista_id, status
  ) VALUES (
    p_viagem_id, p_revenda_id, p_grade_id,
    p_data, p_tipo_dia, p_bloco,
    v_motorista_id, 'pendente'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_reagendar_revenda(UUID, UUID, DATE, TEXT, TEXT, UUID) TO authenticated;
