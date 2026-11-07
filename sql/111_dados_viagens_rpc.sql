-- ================================================================
-- COBEB CICLO DE CARRETAS
-- Script: 111 — RPC get_dados_viagens
-- Executar no Supabase Studio > SQL Editor
--
-- Substitui os múltiplos fetches paginados (viagens + pedidos +
-- tarefas + portaria + tarefas_operador + viagens_dispersao) que
-- o Dados.jsx fazia separadamente — cada um limitado a 1000 linhas
-- pelo PostgREST. Retorna uma linha por viagem com todos os campos
-- necessários para a tabela de dados, calculados no banco.
-- ================================================================

CREATE OR REPLACE FUNCTION public.get_dados_viagens()
RETURNS TABLE (
  id                   UUID,
  _tipo                TEXT,
  status               TEXT,
  dt_saida_revenda     TIMESTAMPTZ,
  dt_chegada_fabrica   TIMESTAMPTZ,
  dt_saida_fabrica     TIMESTAMPTZ,
  dt_chegada_revenda   TIMESTAMPTZ,
  dt_saida_entrega     TIMESTAMPTZ,
  placa_carreta        TEXT,
  placa_cavalo         TEXT,
  unidade_id           UUID,
  unidade_nome         TEXT,
  motorista_nome       TEXT,
  numero_nf            TEXT,
  numero_nf_saida      TEXT,
  fabricas             TEXT,
  turno                TEXT,
  dt_portaria_entrada  TIMESTAMPTZ,
  dt_portaria_saida    TIMESTAMPTZ,
  descarga_at          TIMESTAMPTZ,
  dt_inicio_conf       TIMESTAMPTZ,
  dt_fim_conf          TIMESTAMPTZ,
  dispersao            TEXT[]
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$

  WITH meu_perfil AS (
    SELECT unidade_id, acesso_total FROM public.profiles WHERE id = auth.uid()
  )

  -- ── Viagens normais ──────────────────────────────────────────────────────────
  SELECT
    v.id,
    'viagem'::TEXT                                            AS _tipo,
    v.status,
    v.dt_saida_revenda,
    v.dt_chegada_fabrica,
    v.dt_saida_fabrica,
    v.dt_chegada_revenda,
    v.dt_saida_entrega,
    car.placa                                                 AS placa_carreta,
    cav.placa                                                 AS placa_cavalo,
    v.unidade_descarga_id                                     AS unidade_id,
    u.nome                                                    AS unidade_nome,
    pr.nome                                                   AS motorista_nome,
    t.numero_nf,
    v.numero_nf_saida,

    -- Fábricas: nome da unidade via codigo_ambev; fallback código bruto; fallback texto do Excel
    (
      SELECT STRING_AGG(DISTINCT COALESCE(uf.nome, ped.codigo_fabrica, ped.fabrica), ' · ')
      FROM public.pedidos ped
      LEFT JOIN public.unidades uf
             ON uf.codigo_ambev = ped.codigo_fabrica
            AND uf.tipo         = 'fabrica'
      WHERE ped.viagem_id = v.id
        AND (ped.codigo_fabrica IS NOT NULL OR ped.fabrica IS NOT NULL)
    )                                                         AS fabricas,

    -- Turno: calculado no banco pelo horário de chegada na revenda
    (
      SELECT CONCAT('Turno ', tur.nome)
      FROM public.turnos tur
      WHERE tur.unidade_id = v.unidade_descarga_id
        AND tur.ativo      = true
        AND (
              -- turno normal (não cruza meia-noite)
              ( tur.hora_inicio < tur.hora_fim
                AND (v.dt_chegada_revenda AT TIME ZONE 'America/Sao_Paulo')::time >= tur.hora_inicio
                AND (v.dt_chegada_revenda AT TIME ZONE 'America/Sao_Paulo')::time <  tur.hora_fim
              )
              OR
              -- turno que cruza meia-noite
              ( tur.hora_inicio >= tur.hora_fim
                AND (
                      (v.dt_chegada_revenda AT TIME ZONE 'America/Sao_Paulo')::time >= tur.hora_inicio
                   OR (v.dt_chegada_revenda AT TIME ZONE 'America/Sao_Paulo')::time <  tur.hora_fim
                    )
              )
            )
      LIMIT 1
    )                                                         AS turno,

    pa.dt_entrada                                             AS dt_portaria_entrada,
    pa.dt_saida                                               AS dt_portaria_saida,
    top_op.descarga_at,
    t.dt_inicio_conferencia                                   AS dt_inicio_conf,
    t.dt_fim_conferencia                                      AS dt_fim_conf,

    -- Dispersão: array de métricas marcadas como outlier
    (
      SELECT ARRAY_AGG(vd.metrica)
      FROM public.viagens_dispersao vd
      WHERE vd.viagem_id = v.id
    )                                                         AS dispersao

  FROM public.viagens v
  CROSS JOIN meu_perfil mp
  LEFT JOIN public.carretas car ON car.id = v.carreta_id
  LEFT JOIN public.cavalos  cav ON cav.id = v.cavalo_id
  LEFT JOIN public.unidades u   ON u.id   = v.unidade_descarga_id
  LEFT JOIN public.profiles pr  ON pr.id  = v.motorista_id

  -- Tarefa: uma por viagem (a mais recente)
  LEFT JOIN LATERAL (
    SELECT t2.numero_nf, t2.dt_inicio_conferencia, t2.dt_fim_conferencia
    FROM public.tarefas t2
    WHERE t2.viagem_id = v.id
    ORDER BY t2.created_at DESC
    LIMIT 1
  ) t ON true

  -- Portaria: o atendimento ativo (não excluído)
  LEFT JOIN LATERAL (
    SELECT pa2.dt_entrada, pa2.dt_saida
    FROM public.portaria_atendimentos pa2
    WHERE pa2.viagem_id    = v.id
      AND pa2.excluido_em IS NULL
    LIMIT 1
  ) pa ON true

  -- Operador: registro de descarga com maior prioridade de status
  LEFT JOIN LATERAL (
    SELECT top_o.descarga_at
    FROM public.tarefas_operador top_o
    WHERE top_o.numero_nf  = t.numero_nf
      AND top_o.unidade_id = v.unidade_descarga_id
    ORDER BY CASE top_o.status
      WHEN 'concluido'           THEN 4
      WHEN 'em_andamento'        THEN 3
      WHEN 'pendente'            THEN 2
      WHEN 'aguardando_nri'      THEN 1
      WHEN 'aguardando_descarga' THEN 0
      ELSE -1
    END DESC
    LIMIT 1
  ) top_op ON true

  WHERE v.dt_saida_revenda IS NOT NULL
    AND (
      mp.acesso_total = true
      OR v.unidade_descarga_id = mp.unidade_id
    )

  UNION ALL

  -- ── Entradas Marketplace (sem viagem vinculada) ──────────────────────────────
  SELECT
    pa3.id                          AS id,
    'marketplace'::TEXT             AS _tipo,
    'marketplace'::TEXT             AS status,
    pa3.dt_entrada                  AS dt_saida_revenda,
    NULL::TIMESTAMPTZ               AS dt_chegada_fabrica,
    NULL::TIMESTAMPTZ               AS dt_saida_fabrica,
    NULL::TIMESTAMPTZ               AS dt_chegada_revenda,
    NULL::TIMESTAMPTZ               AS dt_saida_entrega,
    pa3.placa_carreta,
    pa3.placa_cavalo,
    pa3.unidade_id,
    u3.nome                         AS unidade_nome,
    NULL::TEXT                      AS motorista_nome,
    NULL::TEXT                      AS numero_nf,
    NULL::TEXT                      AS numero_nf_saida,
    '—'::TEXT                       AS fabricas,
    NULL::TEXT                      AS turno,
    pa3.dt_entrada                  AS dt_portaria_entrada,
    pa3.dt_saida                    AS dt_portaria_saida,
    NULL::TIMESTAMPTZ               AS descarga_at,
    NULL::TIMESTAMPTZ               AS dt_inicio_conf,
    NULL::TIMESTAMPTZ               AS dt_fim_conf,
    NULL::TEXT[]                    AS dispersao
  FROM public.portaria_atendimentos pa3
  CROSS JOIN meu_perfil mp2
  LEFT JOIN public.unidades u3 ON u3.id = pa3.unidade_id
  WHERE pa3.tipo        = 'marketplace'
    AND pa3.viagem_id  IS NULL
    AND pa3.excluido_em IS NULL
    AND (
      mp2.acesso_total = true
      OR pa3.unidade_id = mp2.unidade_id
    )

  ORDER BY dt_saida_revenda DESC NULLS LAST
$$;

GRANT EXECUTE ON FUNCTION public.get_dados_viagens() TO authenticated;
