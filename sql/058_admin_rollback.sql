-- ================================================================
-- COBEB CICLO DE CARRETAS
-- Script: 058 — Admin: reverter fase de viagem + editar horário com histórico
-- Executar no Supabase Studio > SQL Editor
-- ================================================================

-- ── Tabela de histórico de ajustes de horário ────────────────────────────────

CREATE TABLE IF NOT EXISTS public.viagens_horario_log (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  viagem_id        UUID        NOT NULL REFERENCES public.viagens(id) ON DELETE CASCADE,
  horario_anterior TEXT,
  horario_novo     TEXT,
  admin_id         UUID        NOT NULL REFERENCES public.profiles(id),
  criado_em        TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.viagens_horario_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins veem historico horario"
  ON public.viagens_horario_log FOR SELECT TO authenticated
  USING (is_admin());

CREATE INDEX IF NOT EXISTS idx_viagens_horario_log_viagem
  ON public.viagens_horario_log(viagem_id);

-- ── RPC: reverter status de viagem para fase anterior ───────────────────────
-- Permite admin_total reverter retornando → na_fabrica, ou ambos → em_transito.
-- Limpa os timestamps correspondentes para que a lógica de motorista e
-- geofence permaneça consistente.

CREATE OR REPLACE FUNCTION public.admin_reverter_status_viagem(
  p_viagem_id     UUID,
  p_target_status TEXT
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_status_atual TEXT;
  v_acesso_total BOOLEAN;
BEGIN
  SELECT acesso_total INTO v_acesso_total
  FROM public.profiles WHERE id = auth.uid();

  IF NOT COALESCE(v_acesso_total, false) THEN
    RAISE EXCEPTION 'Acesso negado: recurso exclusivo para administradores totais';
  END IF;

  IF p_target_status NOT IN ('em_transito', 'na_fabrica') THEN
    RAISE EXCEPTION 'Status alvo inválido. Valores aceitos: em_transito, na_fabrica';
  END IF;

  SELECT status INTO v_status_atual
  FROM public.viagens WHERE id = p_viagem_id;

  IF v_status_atual IS NULL THEN
    RAISE EXCEPTION 'Viagem não encontrada';
  END IF;

  IF v_status_atual NOT IN ('na_fabrica', 'retornando') THEN
    RAISE EXCEPTION 'Não é possível reverter viagem com status "%". Apenas na_fabrica e retornando são revertíveis.', v_status_atual;
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

-- ── RPC: atualizar horário agendado com log de histórico ─────────────────────

CREATE OR REPLACE FUNCTION public.admin_atualizar_horario_agendado(
  p_viagem_id    UUID,
  p_novo_horario TEXT
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_horario_anterior TEXT;
  v_acesso_total     BOOLEAN;
BEGIN
  SELECT acesso_total INTO v_acesso_total
  FROM public.profiles WHERE id = auth.uid();

  IF NOT COALESCE(v_acesso_total, false) THEN
    RAISE EXCEPTION 'Acesso negado: recurso exclusivo para administradores totais';
  END IF;

  SELECT horario_agendado INTO v_horario_anterior
  FROM public.viagens WHERE id = p_viagem_id;

  INSERT INTO public.viagens_horario_log (viagem_id, horario_anterior, horario_novo, admin_id)
  VALUES (p_viagem_id, v_horario_anterior, NULLIF(TRIM(p_novo_horario), ''), auth.uid());

  UPDATE public.viagens
  SET horario_agendado = NULLIF(TRIM(p_novo_horario), '')
  WHERE id = p_viagem_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_atualizar_horario_agendado(UUID, TEXT) TO authenticated;

-- ── Correção: get_painel_viagens — adiciona unidade_descarga_id ──────────────
-- O campo faltava na função, causando o filtro JS de unidade não funcionar
-- para usuários não-admin (que veriam cards vazios no painel).

DROP FUNCTION IF EXISTS public.get_painel_viagens();

CREATE OR REPLACE FUNCTION public.get_painel_viagens()
RETURNS TABLE (
  id                      UUID,
  status                  TEXT,
  horario_agendado        TEXT,
  unidade_descarga_id     UUID,
  placa_carreta           TEXT,
  placa_cavalo            TEXT,
  motorista_nome          TEXT,
  numero_nf               TEXT,
  numero_nf_saida         TEXT,
  total_pedidos           BIGINT,
  produtos                JSONB,
  motorista_last_seen_at  TIMESTAMPTZ,
  motorista_lat           DECIMAL,
  motorista_lng           DECIMAL,
  agendamento_bloco       TEXT,
  agendamento_data        DATE,
  agendamento_tipo_dia    TEXT,
  fab_nome                TEXT,
  fab_lat                 DECIMAL,
  fab_lng                 DECIMAL
) LANGUAGE sql STABLE SECURITY DEFINER AS $$
  WITH meu_perfil AS (
    SELECT unidade_id, acesso_total FROM public.profiles WHERE id = auth.uid()
  ),
  viagens_ativas AS (
    SELECT
      v.id, v.status, v.horario_agendado, v.unidade_descarga_id,
      v.carreta_id, v.cavalo_id, v.motorista_id, v.created_at,
      v.motorista_last_seen_at, v.motorista_lat, v.motorista_lng,
      v.numero_nf_saida
    FROM public.viagens v, meu_perfil mp
    WHERE v.status <> 'concluida'
      AND (
        mp.acesso_total = true
        OR (mp.unidade_id IS NOT NULL AND v.unidade_descarga_id = mp.unidade_id)
      )
  ),
  prods AS (
    SELECT
      p.viagem_id,
      jsonb_agg(
        jsonb_build_object(
          'descricao',    p.descricao,
          'qtde_pallets', p.qtde_pallets,
          'qtde_skus',    p.qtde_skus,
          'embalagem',    p.embalagem
        ) ORDER BY p.descricao
      ) AS lista,
      COUNT(*) AS total
    FROM public.pedidos p
    WHERE p.viagem_id IN (SELECT id FROM viagens_ativas)
    GROUP BY p.viagem_id
  ),
  tarefa_unica AS (
    SELECT DISTINCT ON (viagem_id) viagem_id, numero_nf
    FROM public.tarefas
    ORDER BY viagem_id, created_at DESC
  ),
  agend AS (
    SELECT DISTINCT ON (viagem_id)
      viagem_id, bloco, data_agendamento, tipo_dia
    FROM public.agendamentos
    WHERE status <> 'cancelado'
    ORDER BY viagem_id, created_at DESC
  ),
  fab AS (
    SELECT DISTINCT ON (p.viagem_id)
      p.viagem_id,
      u.nome      AS fab_nome,
      u.latitude  AS fab_lat,
      u.longitude AS fab_lng
    FROM public.pedidos p
    JOIN public.unidades u
      ON u.codigo_ambev = p.codigo_fabrica AND u.tipo = 'fabrica'
    WHERE p.viagem_id IN (SELECT id FROM viagens_ativas)
      AND p.codigo_fabrica IS NOT NULL
    ORDER BY p.viagem_id, p.numero_pedido ASC
  )
  SELECT
    v.id,
    v.status,
    v.horario_agendado,
    v.unidade_descarga_id,
    cr.placa                         AS placa_carreta,
    ca.placa                         AS placa_cavalo,
    pf.nome                          AS motorista_nome,
    t.numero_nf,
    v.numero_nf_saida,
    COALESCE(pr.total, 0)            AS total_pedidos,
    COALESCE(pr.lista, '[]'::jsonb)  AS produtos,
    v.motorista_last_seen_at,
    v.motorista_lat,
    v.motorista_lng,
    ag.bloco                         AS agendamento_bloco,
    ag.data_agendamento              AS agendamento_data,
    ag.tipo_dia                      AS agendamento_tipo_dia,
    f.fab_nome,
    f.fab_lat,
    f.fab_lng
  FROM viagens_ativas v
  LEFT JOIN public.carretas  cr ON cr.id = v.carreta_id
  LEFT JOIN public.cavalos   ca ON ca.id = v.cavalo_id
  LEFT JOIN public.profiles  pf ON pf.id = v.motorista_id
  LEFT JOIN tarefa_unica     t  ON t.viagem_id = v.id
  LEFT JOIN prods            pr ON pr.viagem_id = v.id
  LEFT JOIN agend            ag ON ag.viagem_id = v.id
  LEFT JOIN fab              f  ON f.viagem_id  = v.id
  ORDER BY
    CASE v.status
      WHEN 'retornando'             THEN 1
      WHEN 'aguardando_conferencia' THEN 2
      WHEN 'na_fabrica'             THEN 3
      WHEN 'em_transito'            THEN 4
      WHEN 'iniciada'               THEN 5
      ELSE 6
    END,
    v.created_at DESC;
$$;

GRANT EXECUTE ON FUNCTION public.get_painel_viagens() TO authenticated;
