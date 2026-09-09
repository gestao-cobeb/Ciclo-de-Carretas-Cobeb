-- ================================================================
-- COBEB CICLO DE CARRETAS
-- Script: 079 — Estender liberar_motorista para fechar portaria ativa
-- Executar no Supabase Studio > SQL Editor
-- ================================================================
--
-- Problema corrigido:
--   Após rollback de "Cheguei" + nova chegada real, havia 2 registros
--   de portaria_atendimentos para o mesmo viagem_id (um soft-deleted,
--   um ativo). O app do motorista usava .maybeSingle() sem filtrar
--   excluido_em IS NULL, retornava null silenciosamente e o botão
--   "Finalizar Viagem" ficava travado.
--
--   Além da correção no frontend (filtro excluido_em IS NULL),
--   esta versão do liberar_motorista também fecha a portaria ativa
--   caso ainda não esteja concluída — garantindo que o admin possa
--   desbloquear qualquer caso similar sem precisar de deploy.

CREATE OR REPLACE FUNCTION public.liberar_motorista(p_viagem_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_unidade_id UUID;
  v_numero_nf  TEXT;
  v_tarefa_id  UUID;
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  SELECT unidade_descarga_id, numero_nf
    INTO v_unidade_id, v_numero_nf
    FROM public.viagens
   WHERE id = p_viagem_id AND status = 'aguardando_conferencia';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Viagem não encontrada ou não está aguardando conferência';
  END IF;

  -- Marca tarefa como concluída (cria se não existir)
  SELECT id INTO v_tarefa_id
    FROM public.tarefas
   WHERE viagem_id = p_viagem_id
   LIMIT 1;

  IF v_tarefa_id IS NULL THEN
    INSERT INTO public.tarefas (viagem_id, unidade_id, numero_nf, status)
    VALUES (p_viagem_id, v_unidade_id, v_numero_nf, 'concluida');
  ELSE
    UPDATE public.tarefas SET status = 'concluida' WHERE id = v_tarefa_id;
  END IF;

  -- Fecha a portaria ativa caso ainda não esteja concluída.
  -- Cobre o cenário de rollback + re-chegada onde a portaria pode estar
  -- em qualquer estado intermediário.
  UPDATE public.portaria_atendimentos
  SET status   = 'concluido',
      dt_saida = COALESCE(dt_saida, NOW())
  WHERE viagem_id  = p_viagem_id
    AND excluido_em IS NULL
    AND status     <> 'concluido';
END;
$$;
