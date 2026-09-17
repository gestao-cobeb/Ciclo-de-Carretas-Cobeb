-- ================================================================
-- COBEB CICLO DE CARRETAS
-- Script: 085 — Admins com módulo portaria: mesmas permissões do porteiro
-- Executar no Supabase Studio > SQL Editor
-- ================================================================
--
-- Problema: criar_entrada_marketplace e criar_entrada_transferencia
-- checavam perfil='portaria' explicitamente, bloqueando admins que
-- têm acesso ao módulo portaria via modulos_permitidos ou acesso_total.
--
-- Solução: ampliar o WHERE de cada RPC para aceitar também admins
-- com has_modulo('portaria'). registrar_entrada_portaria não precisa
-- mudar — não tem verificação de perfil.

-- ── 1. criar_entrada_marketplace ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.criar_entrada_marketplace(
  p_placa_cavalo  TEXT,
  p_placa_carreta TEXT DEFAULT NULL
)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_porteiro_id UUID;
  v_unidade_id  UUID;
  v_atend_id    UUID;
BEGIN
  SELECT id, unidade_id
  INTO   v_porteiro_id, v_unidade_id
  FROM   public.profiles
  WHERE  id = auth.uid()
    AND  ativo = true
    AND  (
      perfil = 'portaria'
      OR (perfil = 'admin' AND (acesso_total = true OR 'portaria' = ANY(modulos_permitidos)))
    );

  IF v_unidade_id IS NULL THEN
    RAISE EXCEPTION 'Usuário não tem acesso ao módulo portaria ou não tem unidade definida';
  END IF;

  INSERT INTO public.portaria_atendimentos (
    unidade_id, placa_cavalo, placa_carreta,
    dt_entrada, status, porteiro_id, tipo
  ) VALUES (
    v_unidade_id, p_placa_cavalo, p_placa_carreta,
    NOW(), 'em_atendimento', v_porteiro_id, 'marketplace'
  ) RETURNING id INTO v_atend_id;

  INSERT INTO public.tarefas (
    unidade_id, tipo, placa_cavalo, placa_carreta,
    portaria_atendimento_id, status
  ) VALUES (
    v_unidade_id, 'marketplace', p_placa_cavalo, p_placa_carreta,
    v_atend_id, 'pendente'
  );

  RETURN v_atend_id;
END;
$$;

-- ── 2. criar_entrada_transferencia ───────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.criar_entrada_transferencia(
  p_placa_cavalo  TEXT,
  p_numero_nf     TEXT,
  p_placa_carreta TEXT DEFAULT NULL
)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_porteiro_id UUID;
  v_unidade_id  UUID;
  v_atend_id    UUID;
BEGIN
  SELECT id, unidade_id
  INTO   v_porteiro_id, v_unidade_id
  FROM   public.profiles
  WHERE  id = auth.uid()
    AND  ativo = true
    AND  (
      perfil = 'portaria'
      OR (perfil = 'admin' AND (acesso_total = true OR 'portaria' = ANY(modulos_permitidos)))
    );

  IF v_unidade_id IS NULL THEN
    RAISE EXCEPTION 'Usuário não tem acesso ao módulo portaria ou não tem unidade definida';
  END IF;

  INSERT INTO public.portaria_atendimentos (
    unidade_id, placa_cavalo, placa_carreta,
    numero_nf, dt_entrada, status, porteiro_id, tipo
  ) VALUES (
    v_unidade_id, p_placa_cavalo, p_placa_carreta,
    p_numero_nf, NOW(), 'em_atendimento', v_porteiro_id, 'transferencia'
  ) RETURNING id INTO v_atend_id;

  INSERT INTO public.tarefas (
    unidade_id, tipo, placa_cavalo, placa_carreta,
    numero_nf, portaria_atendimento_id, status
  ) VALUES (
    v_unidade_id, 'transferencia', p_placa_cavalo, p_placa_carreta,
    p_numero_nf, v_atend_id, 'pendente'
  );

  RETURN v_atend_id;
END;
$$;
