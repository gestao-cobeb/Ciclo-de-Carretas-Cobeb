-- ================================================================
-- COBEB CICLO DE CARRETAS
-- Script: 097 — Adição de produto via BO (admin total)
-- Executar no Supabase Studio > SQL Editor
--
-- Cenário: viagem já em rota ou na fábrica precisa de um SKU extra
-- (ex.: 20 plt Brahma → 20 plt Brahma + 6 plt Skol).
-- Diferente da substituição, não cancela nenhum item original.
-- Herda campos de agrupamento (unidade, fábrica, data) do primeiro
-- pedido ativo da viagem.
-- ================================================================

-- ── 1. RPC de adição de produto ──────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.admin_adicionar_produto_viagem(
  p_viagem_id    UUID,
  p_cod_produto  TEXT,
  p_descricao    TEXT,
  p_qtde_pallets NUMERIC
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_acesso_total  BOOLEAN;
  v_status_viagem TEXT;
  v_ref           RECORD;
  v_embalagem     TEXT;
  v_caixas_pallet NUMERIC;
  v_qtde_skus     INTEGER;
BEGIN
  SELECT acesso_total INTO v_acesso_total
  FROM public.profiles WHERE id = auth.uid();

  IF NOT COALESCE(v_acesso_total, false) THEN
    RAISE EXCEPTION 'Acesso negado: recurso exclusivo para administradores totais';
  END IF;

  IF TRIM(p_cod_produto) = '' OR TRIM(p_descricao) = '' THEN
    RAISE EXCEPTION 'Código e descrição do produto são obrigatórios';
  END IF;

  IF p_qtde_pallets IS NULL OR p_qtde_pallets <= 0 THEN
    RAISE EXCEPTION 'Quantidade de paletes deve ser maior que zero';
  END IF;

  SELECT status INTO v_status_viagem
  FROM public.viagens WHERE id = p_viagem_id;

  IF v_status_viagem NOT IN ('iniciada', 'em_transito', 'na_fabrica') THEN
    RAISE EXCEPTION 'Adição só é permitida quando a viagem está em rota ou na fábrica (status atual: %)', v_status_viagem;
  END IF;

  -- Herda campos de agrupamento do primeiro pedido ativo da viagem
  SELECT * INTO v_ref
  FROM public.pedidos
  WHERE viagem_id = p_viagem_id AND status = 'ativo'
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Nenhum pedido ativo encontrado nesta viagem';
  END IF;

  -- Busca embalagem e caixas_pallet do catálogo para o novo produto
  SELECT embalagem, caixas_pallet
  INTO v_embalagem, v_caixas_pallet
  FROM public.produtos_catalogo
  WHERE codigo = TRIM(p_cod_produto);

  v_qtde_skus := COALESCE(ROUND(v_caixas_pallet * p_qtde_pallets)::INTEGER, 0);

  INSERT INTO public.pedidos (
    data_puxada, revenda, unidade_id, fabrica, numero_pedido, placa,
    cod_produto, descricao, embalagem, curva, qtde_pallets, qtde_skus,
    arquivo_origem, viagem_id, importado_por,
    codigo_revenda, codigo_fabrica, status
  ) VALUES (
    v_ref.data_puxada,
    v_ref.revenda,
    v_ref.unidade_id,
    v_ref.fabrica,
    v_ref.numero_pedido,
    v_ref.placa,
    TRIM(p_cod_produto),
    TRIM(p_descricao),
    COALESCE(v_embalagem, v_ref.embalagem),
    NULL,
    p_qtde_pallets,
    v_qtde_skus,
    'ADICAO_ADMIN',
    p_viagem_id,
    auth.uid(),
    v_ref.codigo_revenda,
    v_ref.codigo_fabrica,
    'ativo'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_adicionar_produto_viagem(UUID, TEXT, TEXT, NUMERIC) TO authenticated;

-- ── 2. Atualiza get_painel_viagens — tem_substituicao cobre adições também ───
-- Antes: só verdadeiro quando havia pedido cancelado (substituição).
-- Agora: também verdadeiro quando há pedido com arquivo_origem = 'ADICAO_ADMIN'.

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
  fab_lng                 DECIMAL,
  tem_substituicao        BOOLEAN
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
          'id',           p.id,
          'descricao',    p.descricao,
          'qtde_pallets', p.qtde_pallets,
          'qtde_skus',    p.qtde_skus,
          'embalagem',    p.embalagem,
          'status',       p.status
        ) ORDER BY p.descricao
      ) AS lista,
      COUNT(*) FILTER (WHERE p.status = 'ativo') AS total
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
      AND p.status = 'ativo'
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
    f.fab_lng,
    EXISTS (
      SELECT 1 FROM public.pedidos ps
      WHERE ps.viagem_id = v.id
        AND (ps.status = 'cancelado' OR ps.arquivo_origem = 'ADICAO_ADMIN')
    )                                AS tem_substituicao
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
