-- ================================================================
-- COBEB CICLO DE CARRETAS
-- Script: 094 — Fluxo de descarga v2
-- Executar no Supabase Studio > SQL Editor
-- ================================================================
--
-- Mudança arquitetural: a tarefa do conferente deixa de ser criada
-- pela portaria e passa a ser criada quando o operador confirma a
-- descarga do veículo.
--
-- Novo ciclo de vida:
--
--   Portaria registra entrada
--     → cria tarefas_operador [aguardando_descarga]
--     (NÃO mais cria tarefas do conferente)
--
--   Operador confirma descarga  ← NOVO ponto de criação
--     → cria tarefas [pendente]  (conferente passa a ver a tarefa)
--     → tarefas_operador: aguardando_descarga → aguardando_nri
--
--   Conferente confere + emite NRI
--     → tarefas: concluida
--     → tarefas_operador: aguardando_nri → pendente
--
--   Operador organiza paletes
--     → tarefas_operador: pendente → em_andamento → concluido
--
-- Para ligar card de operador ao portaria_atendimento correto
-- (evita busca frágil por placa), adicionamos portaria_atendimento_id
-- em tarefas_operador.
-- ================================================================


-- ── 1. Adicionar portaria_atendimento_id em tarefas_operador ─────

ALTER TABLE public.tarefas_operador
  ADD COLUMN IF NOT EXISTS portaria_atendimento_id UUID
    REFERENCES public.portaria_atendimentos(id) ON DELETE SET NULL;


-- ── 2. registrar_entrada_portaria: remove criação de tarefas ─────
--       (apenas cria/mantém o card do operador)

CREATE OR REPLACE FUNCTION public.registrar_entrada_portaria(
  p_atendimento_id UUID,
  p_porteiro_id    UUID
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_viagem_id     UUID;
  v_unidade_id    UUID;
  v_numero_nf     TEXT;
  v_placa_cavalo  TEXT;
  v_placa_carreta TEXT;
BEGIN
  UPDATE public.portaria_atendimentos
  SET
    dt_entrada  = NOW(),
    porteiro_id = p_porteiro_id,
    status      = 'em_atendimento'
  WHERE id = p_atendimento_id
  RETURNING viagem_id, unidade_id, numero_nf, placa_cavalo, placa_carreta
  INTO v_viagem_id, v_unidade_id, v_numero_nf, v_placa_cavalo, v_placa_carreta;

  -- Cria card para o Operador (idempotente)
  IF v_placa_cavalo IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.tarefas_operador
    WHERE unidade_id                = v_unidade_id
      AND placa_cavalo              = v_placa_cavalo
      AND portaria_atendimento_id   = p_atendimento_id
      AND status IN ('aguardando_descarga','aguardando_nri','pendente','em_andamento')
  ) THEN
    INSERT INTO public.tarefas_operador (
      unidade_id, placa_cavalo, placa_carreta, numero_nf,
      status, portaria_atendimento_id
    ) VALUES (
      v_unidade_id, v_placa_cavalo, v_placa_carreta, v_numero_nf,
      'aguardando_descarga', p_atendimento_id
    );
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.registrar_entrada_portaria(UUID, UUID) TO authenticated;


-- ── 3. criar_entrada_marketplace: remove criação de tarefas ──────

CREATE OR REPLACE FUNCTION public.criar_entrada_marketplace(
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
    p_numero_nf, NOW(), 'em_atendimento', v_porteiro_id, 'marketplace'
  ) RETURNING id INTO v_atend_id;

  INSERT INTO public.tarefas_operador (
    unidade_id, placa_cavalo, placa_carreta, numero_nf,
    status, portaria_atendimento_id
  ) VALUES (
    v_unidade_id, p_placa_cavalo, p_placa_carreta, p_numero_nf,
    'aguardando_descarga', v_atend_id
  );

  RETURN v_atend_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.criar_entrada_marketplace(TEXT, TEXT, TEXT) TO authenticated;


-- ── 4. criar_entrada_transferencia: remove criação de tarefas ────

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

  INSERT INTO public.tarefas_operador (
    unidade_id, placa_cavalo, placa_carreta, numero_nf,
    status, portaria_atendimento_id
  ) VALUES (
    v_unidade_id, p_placa_cavalo, p_placa_carreta, p_numero_nf,
    'aguardando_descarga', v_atend_id
  );

  RETURN v_atend_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.criar_entrada_transferencia(TEXT, TEXT, TEXT) TO authenticated;


-- ── 5. confirmar_descarga_operador: cria tarefa do conferente ────
--
-- Chamado pelo operador ao confirmar a descarga. Atomicamente:
--   a) Valida que o card está em aguardando_descarga
--   b) Busca o portaria_atendimento associado
--   c) Cria a tarefa do conferente (idempotente)
--   d) Avança card para aguardando_nri + grava descarga_at + preenche numero_nf se estava nulo

CREATE OR REPLACE FUNCTION public.confirmar_descarga_operador(p_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_card  public.tarefas_operador%ROWTYPE;
  v_atend public.portaria_atendimentos%ROWTYPE;
  v_tipo  TEXT;
BEGIN
  -- Lê o card do operador
  SELECT * INTO v_card FROM public.tarefas_operador WHERE id = p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Card de operador não encontrado: %', p_id;
  END IF;
  IF v_card.status <> 'aguardando_descarga' THEN
    RAISE EXCEPTION 'Card não está em aguardando_descarga (status atual: %)', v_card.status;
  END IF;

  -- Verifica que o usuário logado tem acesso à unidade do card
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE  p.id    = auth.uid()
      AND  p.ativo = true
      AND  (
        p.acesso_total = true
        OR p.perfil = 'admin'
        OR (p.perfil = 'empilheira' AND p.unidade_id = v_card.unidade_id)
      )
  ) THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  -- Resolve portaria_atendimento
  IF v_card.portaria_atendimento_id IS NOT NULL THEN
    SELECT * INTO v_atend
    FROM public.portaria_atendimentos
    WHERE id = v_card.portaria_atendimento_id;
  ELSE
    -- Fallback para cards legados sem portaria_atendimento_id
    SELECT * INTO v_atend
    FROM public.portaria_atendimentos
    WHERE placa_cavalo = v_card.placa_cavalo
      AND unidade_id   = v_card.unidade_id
      AND status       = 'em_atendimento'
      AND excluido_em  IS NULL
    ORDER BY created_at DESC
    LIMIT 1;
  END IF;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Portaria atendimento não encontrado para o card %', p_id;
  END IF;

  v_tipo := COALESCE(v_atend.tipo, 'normal');

  -- Cria a tarefa do conferente (idempotente)
  IF v_tipo = 'normal' THEN
    IF v_atend.viagem_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.tarefas WHERE viagem_id = v_atend.viagem_id
    ) THEN
      INSERT INTO public.tarefas (viagem_id, unidade_id, numero_nf)
      VALUES (v_atend.viagem_id, v_atend.unidade_id, v_atend.numero_nf);
    END IF;
  ELSE
    IF NOT EXISTS (
      SELECT 1 FROM public.tarefas WHERE portaria_atendimento_id = v_atend.id
    ) THEN
      INSERT INTO public.tarefas (
        unidade_id, tipo, placa_cavalo, placa_carreta,
        numero_nf, portaria_atendimento_id, status
      ) VALUES (
        v_atend.unidade_id, v_tipo, v_atend.placa_cavalo, v_atend.placa_carreta,
        v_atend.numero_nf, v_atend.id, 'pendente'
      );
    END IF;
  END IF;

  -- Avança o card do operador
  UPDATE public.tarefas_operador
  SET
    status      = 'aguardando_nri',
    descarga_at = NOW(),
    -- Preenche numero_nf se estava nulo (portaria entrou sem saber a NF)
    numero_nf   = COALESCE(v_card.numero_nf, v_atend.numero_nf)
  WHERE id = p_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.confirmar_descarga_operador(UUID) TO authenticated;
