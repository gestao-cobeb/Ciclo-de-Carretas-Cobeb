-- ================================================================
-- COBEB CICLO DE CARRETAS
-- Script: 117 — Trava: impede atendimento de portaria órfão do motorista
-- Executar no Supabase Studio > SQL Editor
-- ================================================================
--
-- CONTEXTO (14/11/2026)
-- ─────────────────────
-- Viagem RFE2I54 (NF saída 115202) ficou com a portaria CONCLUÍDA porém
-- a viagem presa/errada: nunca passou por 'aguardando_conferencia'
-- (dt_chegada_revenda e numero_nf nulos). O "Chegada na Revenda" foi
-- registrado offline — o INSERT da portaria sobreviveu, mas o UPDATE da
-- viagem não aplicou. O app considera o update bem-sucedido só porque o
-- Supabase não retorna erro em UPDATE que acerta ZERO linhas (tryDB faz
-- `return !error`, Viagem.jsx:380). Resultado: portaria sem viagem
-- avançada — exatamente o que o comentário em Viagem.jsx:401 jurava evitar.
--
-- O QUE ESTA TRAVA FAZ
-- ────────────────────
-- Rejeita a criação de um atendimento do FLUXO DO MOTORISTA
-- (tipo='normal' + viagem_id preenchido) quando a viagem vinculada não
-- está em 'aguardando_conferencia'. Com isso:
--   1. nenhum atendimento órfão é criado;
--   2. como o atendimento não existe, portariaStatus nunca fica 'concluido'
--      na tela do motorista → o botão de encerrar não habilita
--      (Viagem.jsx:1201) → ele não fecha 'retornando → concluida' por cima;
--   3. no fluxo normal online a viagem avança ANTES do INSERT da portaria
--      (chamadas sequenciais com await), então a trava deixa passar —
--      ela só barra o caso do bug, sem falso positivo.
--
-- NÃO AFETA entradas manuais Marketplace/Transferência: elas têm
-- viagem_id NULL e tipo <> 'normal' (criar_entrada_marketplace /
-- criar_entrada_transferencia, scripts 049/050/084/085).
-- ================================================================

CREATE OR REPLACE FUNCTION public.fn_portaria_exige_viagem_chegada()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_status TEXT;
BEGIN
  -- Só o fluxo do motorista. Entradas manuais não têm viagem e têm tipo próprio.
  IF COALESCE(NEW.tipo, 'normal') <> 'normal' OR NEW.viagem_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT status INTO v_status
  FROM public.viagens
  WHERE id = NEW.viagem_id;

  IF v_status IS DISTINCT FROM 'aguardando_conferencia' THEN
    RAISE EXCEPTION
      'Chegada na revenda não registrada (viagem em "%"). Atendimento de portaria bloqueado.',
      COALESCE(v_status, 'inexistente')
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_portaria_exige_viagem_chegada ON public.portaria_atendimentos;

CREATE TRIGGER trg_portaria_exige_viagem_chegada
  BEFORE INSERT ON public.portaria_atendimentos
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_portaria_exige_viagem_chegada();
