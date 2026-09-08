-- ================================================================
-- COBEB CICLO DE CARRETAS
-- Script: 078 — Admin: permitir reverter "Cheguei" antes da portaria iniciar
-- Executar no Supabase Studio > SQL Editor
-- ================================================================

-- Estende admin_reverter_status_viagem para suportar:
--   aguardando_conferencia → retornando
-- Condição: portaria ainda não iniciou o atendimento (status = 'aguardando').
-- Efeito:
--   1. viagem volta a status='retornando', dt_chegada_revenda=NULL, numero_nf=NULL
--   2. portaria_atendimentos: soft-delete (excluido_em/excluido_por)
--   3. agendamento vinculado: status volta a 'pendente'

CREATE OR REPLACE FUNCTION public.admin_reverter_status_viagem(
  p_viagem_id     UUID,
  p_target_status TEXT
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_status_atual   TEXT;
  v_acesso_total   BOOLEAN;
  v_portaria_id    UUID;
  v_portaria_status TEXT;
  v_agendamento_id UUID;
BEGIN
  SELECT acesso_total INTO v_acesso_total
  FROM public.profiles WHERE id = auth.uid();

  IF NOT COALESCE(v_acesso_total, false) THEN
    RAISE EXCEPTION 'Acesso negado: recurso exclusivo para administradores totais';
  END IF;

  IF p_target_status NOT IN ('em_transito', 'na_fabrica', 'retornando') THEN
    RAISE EXCEPTION 'Status alvo inválido. Valores aceitos: em_transito, na_fabrica, retornando';
  END IF;

  SELECT status INTO v_status_atual
  FROM public.viagens WHERE id = p_viagem_id;

  IF v_status_atual IS NULL THEN
    RAISE EXCEPTION 'Viagem não encontrada';
  END IF;

  -- ── Caso 1: aguardando_conferencia → retornando ────────────────────────────
  IF v_status_atual = 'aguardando_conferencia' AND p_target_status = 'retornando' THEN

    -- Verifica se portaria ainda não iniciou
    SELECT id, status, agendamento_id
    INTO v_portaria_id, v_portaria_status, v_agendamento_id
    FROM public.portaria_atendimentos
    WHERE viagem_id = p_viagem_id
      AND excluido_em IS NULL
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_portaria_id IS NOT NULL AND v_portaria_status <> 'aguardando' THEN
      RAISE EXCEPTION 'Não é possível reverter: a portaria já iniciou o atendimento (status: %).', v_portaria_status;
    END IF;

    -- Volta a viagem para retornando
    UPDATE public.viagens
    SET status             = 'retornando',
        dt_chegada_revenda = NULL,
        numero_nf          = NULL
    WHERE id = p_viagem_id;

    -- Soft-delete no registro de portaria
    IF v_portaria_id IS NOT NULL THEN
      UPDATE public.portaria_atendimentos
      SET excluido_em  = NOW(),
          excluido_por = auth.uid()
      WHERE id = v_portaria_id;
    END IF;

    -- Restaura agendamento de 'realizado' para 'pendente'
    IF v_agendamento_id IS NOT NULL THEN
      UPDATE public.agendamentos
      SET status = 'pendente'
      WHERE id = v_agendamento_id
        AND status = 'realizado';
    END IF;

    RETURN;
  END IF;

  -- ── Caso 2: lógica original (na_fabrica / retornando) ─────────────────────

  IF v_status_atual NOT IN ('na_fabrica', 'retornando') THEN
    RAISE EXCEPTION 'Não é possível reverter viagem com status "%". Apenas na_fabrica, retornando e aguardando_conferencia são revertíveis.', v_status_atual;
  END IF;

  IF v_status_atual = 'na_fabrica' AND p_target_status = 'na_fabrica' THEN
    RAISE EXCEPTION 'Viagem já está no status na_fabrica';
  END IF;

  IF p_target_status = 'na_fabrica' THEN
    -- retornando → na_fabrica: zera apenas a saída da fábrica
    UPDATE public.viagens
    SET status           = 'na_fabrica',
        dt_saida_fabrica = NULL
    WHERE id = p_viagem_id;

  ELSIF p_target_status = 'em_transito' THEN
    -- retornando ou na_fabrica → em_transito: zera chegada e saída da fábrica
    UPDATE public.viagens
    SET status             = 'em_transito',
        dt_chegada_fabrica = NULL,
        dt_saida_fabrica   = NULL
    WHERE id = p_viagem_id;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_reverter_status_viagem(UUID, TEXT) TO authenticated;
