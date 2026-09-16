-- ================================================================
-- COBEB CICLO DE CARRETAS
-- Script: 084 — Entrada manual tipo transferência na portaria
-- Executar no Supabase Studio > SQL Editor
-- ================================================================

-- ── 1. Estender CHECK de tipo em portaria_atendimentos ───────────────────────

ALTER TABLE public.portaria_atendimentos
  DROP CONSTRAINT IF EXISTS portaria_atendimentos_tipo_check;

ALTER TABLE public.portaria_atendimentos
  ADD CONSTRAINT portaria_atendimentos_tipo_check
  CHECK (tipo IN ('normal', 'marketplace', 'transferencia'));

-- ── 2. Estender CHECK de tipo em tarefas ─────────────────────────────────────

ALTER TABLE public.tarefas
  DROP CONSTRAINT IF EXISTS tarefas_tipo_check;

ALTER TABLE public.tarefas
  ADD CONSTRAINT tarefas_tipo_check
  CHECK (tipo IN ('normal', 'marketplace', 'transferencia'));

-- ── 3. Função criar_entrada_transferencia ─────────────────────────────────────
--    Mesma lógica que criar_entrada_marketplace: insere portaria_atendimento
--    + tarefa para o conferente, mas com tipo = 'transferencia'.

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
  WHERE  id = auth.uid() AND perfil = 'portaria' AND ativo = true;

  IF v_unidade_id IS NULL THEN
    RAISE EXCEPTION 'Usuário não é portaria ativa ou não tem unidade definida';
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

GRANT EXECUTE ON FUNCTION public.criar_entrada_transferencia(TEXT, TEXT, TEXT) TO authenticated;
