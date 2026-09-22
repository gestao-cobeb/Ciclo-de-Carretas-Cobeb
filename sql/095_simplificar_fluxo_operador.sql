-- ================================================================
-- COBEB CICLO DE CARRETAS
-- Script: 095 — Simplificar fluxo do operador
-- Executar no Supabase Studio > SQL Editor
-- ================================================================
--
-- Novo ciclo de vida (simplificado):
--
--   Portaria registra entrada
--     → cria tarefas_operador [aguardando_descarga]
--
--   Operador confirma descarga
--     → cria tarefa do conferente (mesmo comportamento)
--     → tarefas_operador: aguardando_descarga → concluido  ← MUDANÇA
--
-- A etapa de organização de paletes (aguardando_nri → pendente →
-- em_andamento → concluido) é eliminada. O card do operador fecha
-- quando a descarga é confirmada.
--
-- Migração de dados:
--   Cards existentes em aguardando_nri / pendente / em_andamento
--   são movidos para concluido (o trabalho já foi realizado).
--   inicio_at e fim_at são zerados (organização não é mais medida).
-- ================================================================


-- ── 1. Migrar cards em estados intermediários agora obsoletos ────

UPDATE public.tarefas_operador
SET status = 'concluido'
WHERE status IN ('aguardando_nri', 'pendente', 'em_andamento');


-- ── 2. Zerar inicio_at e fim_at (organização não é mais medida) ─

UPDATE public.tarefas_operador
SET inicio_at = NULL, fim_at = NULL
WHERE inicio_at IS NOT NULL OR fim_at IS NOT NULL;


-- ── 3. confirmar_descarga_operador: vai direto para concluido ───
--
-- A única mudança em relação ao 094 é na linha final do UPDATE:
--   status = 'concluido'  (antes: 'aguardando_nri')
-- A criação da tarefa do conferente permanece idêntica.

CREATE OR REPLACE FUNCTION public.confirmar_descarga_operador(p_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_card  public.tarefas_operador%ROWTYPE;
  v_atend public.portaria_atendimentos%ROWTYPE;
  v_tipo  TEXT;
BEGIN
  SELECT * INTO v_card FROM public.tarefas_operador WHERE id = p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Card de operador não encontrado: %', p_id;
  END IF;
  IF v_card.status <> 'aguardando_descarga' THEN
    RAISE EXCEPTION 'Card não está em aguardando_descarga (status atual: %)', v_card.status;
  END IF;

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

  IF v_card.portaria_atendimento_id IS NOT NULL THEN
    SELECT * INTO v_atend
    FROM public.portaria_atendimentos
    WHERE id = v_card.portaria_atendimento_id;
  ELSE
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

  -- Cria a tarefa do conferente (idempotente) — sem alteração
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

  -- Fecha card diretamente em concluido, gravando descarga_at
  UPDATE public.tarefas_operador
  SET
    status      = 'concluido',
    descarga_at = NOW(),
    numero_nf   = COALESCE(v_card.numero_nf, v_atend.numero_nf)
  WHERE id = p_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.confirmar_descarga_operador(UUID) TO authenticated;
