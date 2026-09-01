-- ================================================================
-- COBEB CICLO DE CARRETAS
-- Script: 060 — Substituição de produto em viagem ativa (admin)
-- Executar no Supabase Studio > SQL Editor
--
-- Cenário: produto em falta na fábrica antes do carregamento.
-- Admin marca o item original como "cancelado" e insere um substituto.
-- Toda a lógica de conferência e NRI passa a enxergar apenas o novo item.
-- ================================================================

-- ── 1. Coluna de status em pedidos ───────────────────────────────────────────
-- Valores: 'ativo' (padrão) | 'cancelado' (substituído por admin)
ALTER TABLE public.pedidos
ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'ativo'
CHECK (status IN ('ativo', 'cancelado'));

-- ── 2. Atualiza get_painel_viagens ──────────────────────────────────────────
--   a) inclui "id" de cada pedido no JSONB para que o frontend possa
--      identificar qual item substituir
--   b) filtra pedidos cancelados para que não apareçam no painel
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
          'id',           p.id,
          'descricao',    p.descricao,
          'qtde_pallets', p.qtde_pallets,
          'qtde_skus',    p.qtde_skus,
          'embalagem',    p.embalagem
        ) ORDER BY p.descricao
      ) AS lista,
      COUNT(*) AS total
    FROM public.pedidos p
    WHERE p.viagem_id IN (SELECT id FROM viagens_ativas)
      AND p.status = 'ativo'
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

-- ── 3. RPC de substituição de produto ────────────────────────────────────────
-- Cancela o item original e insere o substituto mantendo todos os campos
-- de agrupamento (numero_pedido, viagem_id, unidade_id, fabrica etc.).
-- Só funciona quando a viagem ainda está em trânsito ou na fábrica
-- (antes do carregamento efetivo).

CREATE OR REPLACE FUNCTION public.admin_substituir_produto(
  p_item_id          UUID,
  p_cod_produto_novo TEXT,
  p_descricao_nova   TEXT,
  p_qtde_pallets     NUMERIC
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_acesso_total BOOLEAN;
  v_original     RECORD;
  v_status_viagem TEXT;
BEGIN
  SELECT acesso_total INTO v_acesso_total
  FROM public.profiles WHERE id = auth.uid();

  IF NOT COALESCE(v_acesso_total, false) THEN
    RAISE EXCEPTION 'Acesso negado: recurso exclusivo para administradores totais';
  END IF;

  IF TRIM(p_cod_produto_novo) = '' OR TRIM(p_descricao_nova) = '' THEN
    RAISE EXCEPTION 'Código e descrição do produto substituto são obrigatórios';
  END IF;

  IF p_qtde_pallets IS NULL OR p_qtde_pallets <= 0 THEN
    RAISE EXCEPTION 'Quantidade de paletes deve ser maior que zero';
  END IF;

  SELECT * INTO v_original
  FROM public.pedidos
  WHERE id = p_item_id AND status = 'ativo';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Item não encontrado ou já cancelado';
  END IF;

  -- Garante que a viagem ainda está em fase que permite substituição
  SELECT status INTO v_status_viagem
  FROM public.viagens WHERE id = v_original.viagem_id;

  IF v_status_viagem NOT IN ('iniciada', 'em_transito', 'na_fabrica') THEN
    RAISE EXCEPTION 'Substituição de produto só é permitida quando a viagem está em rota ou na fábrica (status atual: %)', v_status_viagem;
  END IF;

  -- Marca o item original como cancelado
  UPDATE public.pedidos
  SET status = 'cancelado'
  WHERE id = p_item_id;

  -- Insere o item substituto herdando os campos de agrupamento do original
  INSERT INTO public.pedidos (
    data_puxada,
    revenda,
    unidade_id,
    fabrica,
    numero_pedido,
    placa,
    cod_produto,
    descricao,
    embalagem,
    curva,
    qtde_pallets,
    qtde_skus,
    arquivo_origem,
    viagem_id,
    importado_por,
    codigo_revenda,
    codigo_fabrica,
    status
  ) VALUES (
    v_original.data_puxada,
    v_original.revenda,
    v_original.unidade_id,
    v_original.fabrica,
    v_original.numero_pedido,
    v_original.placa,
    TRIM(p_cod_produto_novo),
    TRIM(p_descricao_nova),
    v_original.embalagem,
    NULL,
    p_qtde_pallets,
    0,
    'SUBSTITUICAO_ADMIN',
    v_original.viagem_id,
    auth.uid(),
    v_original.codigo_revenda,
    v_original.codigo_fabrica,
    'ativo'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_substituir_produto(UUID, TEXT, TEXT, NUMERIC) TO authenticated;
