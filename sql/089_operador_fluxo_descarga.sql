-- ================================================================
-- COBEB CICLO DE CARRETAS
-- Script: 089 — Novo fluxo de descarga no módulo operadores
-- Executar no Supabase Studio > SQL Editor
-- ================================================================
--
-- Altera o ciclo de vida de tarefas_operador:
--   aguardando_descarga → aguardando_nri → pendente → em_andamento → concluido
--
-- O card é criado pela portaria no momento da entrada do veículo
-- (não mais pelo conferente ao gerar a NRI). A NRI apenas desbloqueia
-- o card existente, atualizando-o de aguardando_nri para pendente.
--
-- Vínculo operador ↔ NRI: placa_cavalo + numero_nf.


-- ── 1. Novos status em tarefas_operador ──────────────────────────────────────

ALTER TABLE public.tarefas_operador
  DROP CONSTRAINT IF EXISTS tarefas_operador_status_check;

ALTER TABLE public.tarefas_operador
  ADD CONSTRAINT tarefas_operador_status_check
  CHECK (status IN (
    'aguardando_descarga',
    'aguardando_nri',
    'pendente',
    'em_andamento',
    'concluido'
  ));


-- ── 2. UPDATE policy: conferente pode desbloquear (aguardando_nri → pendente) ─

DROP POLICY IF EXISTS "tarefas_operador_update" ON public.tarefas_operador;

CREATE POLICY "tarefas_operador_update" ON public.tarefas_operador
  FOR UPDATE TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.ativo = true
        AND (
          p.acesso_total = true
          OR p.perfil = 'admin'
          OR p.perfil = 'conferente'
          OR (p.perfil = 'empilheira' AND p.unidade_id = tarefas_operador.unidade_id)
        )
    )
  );


-- ── 3. registrar_entrada_portaria: cria card para operador na entrada ─────────

CREATE OR REPLACE FUNCTION public.registrar_entrada_portaria(
  p_atendimento_id UUID,
  p_porteiro_id    UUID
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_viagem_id   UUID;
  v_unidade_id  UUID;
  v_numero_nf   TEXT;
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

  -- Cria tarefa para o Conferente (idempotente)
  IF NOT EXISTS (
    SELECT 1 FROM public.tarefas WHERE viagem_id = v_viagem_id
  ) THEN
    INSERT INTO public.tarefas (viagem_id, unidade_id, numero_nf)
    VALUES (v_viagem_id, v_unidade_id, v_numero_nf);
  END IF;

  -- Cria card para o Operador com aguardando_descarga (idempotente)
  IF v_placa_cavalo IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.tarefas_operador
    WHERE unidade_id   = v_unidade_id
      AND placa_cavalo = v_placa_cavalo
      AND (v_numero_nf IS NULL OR numero_nf = v_numero_nf)
      AND status IN ('aguardando_descarga', 'aguardando_nri', 'pendente', 'em_andamento')
  ) THEN
    INSERT INTO public.tarefas_operador (
      unidade_id, placa_cavalo, placa_carreta, numero_nf, status
    ) VALUES (
      v_unidade_id, v_placa_cavalo, v_placa_carreta, v_numero_nf, 'aguardando_descarga'
    );
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.registrar_entrada_portaria(UUID, UUID) TO authenticated;


-- ── 4. criar_entrada_marketplace: inclui p_numero_nf + cria card operador ─────
--    (085 removeu p_numero_nf acidentalmente; este script restaura e amplia)

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

  INSERT INTO public.tarefas (
    unidade_id, tipo, placa_cavalo, placa_carreta,
    numero_nf, portaria_atendimento_id, status
  ) VALUES (
    v_unidade_id, 'marketplace', p_placa_cavalo, p_placa_carreta,
    p_numero_nf, v_atend_id, 'pendente'
  );

  INSERT INTO public.tarefas_operador (
    unidade_id, placa_cavalo, placa_carreta, numero_nf, status
  ) VALUES (
    v_unidade_id, p_placa_cavalo, p_placa_carreta, p_numero_nf, 'aguardando_descarga'
  );

  RETURN v_atend_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.criar_entrada_marketplace(TEXT, TEXT, TEXT) TO authenticated;


-- ── 5. criar_entrada_transferencia: inclui card operador ─────────────────────

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

  INSERT INTO public.tarefas_operador (
    unidade_id, placa_cavalo, placa_carreta, numero_nf, status
  ) VALUES (
    v_unidade_id, p_placa_cavalo, p_placa_carreta, p_numero_nf, 'aguardando_descarga'
  );

  RETURN v_atend_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.criar_entrada_transferencia(TEXT, TEXT, TEXT) TO authenticated;
