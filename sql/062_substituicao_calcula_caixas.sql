-- ================================================================
-- COBEB CICLO DE CARRETAS
-- Script: 062 — Substituição: calcular qtde_skus via produtos_catalogo
-- Executar no Supabase Studio > SQL Editor
--
-- Corrige admin_substituir_produto para buscar caixas_pallet no catálogo
-- e calcular qtde_skus = ROUND(caixas_pallet × qtde_pallets).
-- Se o produto não estiver no catálogo, qtde_skus fica 0.
-- ================================================================

CREATE OR REPLACE FUNCTION public.admin_substituir_produto(
  p_item_id          UUID,
  p_cod_produto_novo TEXT,
  p_descricao_nova   TEXT,
  p_qtde_pallets     NUMERIC
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_acesso_total  BOOLEAN;
  v_original      RECORD;
  v_status_viagem TEXT;
  v_caixas_pallet NUMERIC;
  v_qtde_skus     INTEGER;
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

  SELECT status INTO v_status_viagem
  FROM public.viagens WHERE id = v_original.viagem_id;

  IF v_status_viagem NOT IN ('iniciada', 'em_transito', 'na_fabrica') THEN
    RAISE EXCEPTION 'Substituição só é permitida quando a viagem está em rota ou na fábrica (status atual: %)', v_status_viagem;
  END IF;

  -- Busca caixas por palete no catálogo para calcular qtde_skus
  SELECT caixas_pallet INTO v_caixas_pallet
  FROM public.produtos_catalogo
  WHERE codigo = TRIM(p_cod_produto_novo);

  v_qtde_skus := COALESCE(ROUND(v_caixas_pallet * p_qtde_pallets)::INTEGER, 0);

  -- Marca o item original como cancelado
  UPDATE public.pedidos
  SET status = 'cancelado'
  WHERE id = p_item_id;

  -- Insere o item substituto com qtde_skus calculada
  INSERT INTO public.pedidos (
    data_puxada, revenda, unidade_id, fabrica, numero_pedido, placa,
    cod_produto, descricao, embalagem, curva, qtde_pallets, qtde_skus,
    arquivo_origem, viagem_id, importado_por,
    codigo_revenda, codigo_fabrica, status
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
    v_qtde_skus,
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

-- ── Corrige registros já inseridos com qtde_skus = 0 via substituição ────────
-- Atualiza todos os pedidos criados por admin (arquivo_origem = 'SUBSTITUICAO_ADMIN')
-- que ainda estão com qtde_skus = 0, calculando pelo catálogo de produtos.
UPDATE public.pedidos p
SET qtde_skus = ROUND(pc.caixas_pallet * p.qtde_pallets)::INTEGER
FROM public.produtos_catalogo pc
WHERE p.cod_produto    = pc.codigo
  AND p.arquivo_origem = 'SUBSTITUICAO_ADMIN'
  AND p.status         = 'ativo'
  AND p.qtde_skus      = 0
  AND pc.caixas_pallet IS NOT NULL
  AND pc.caixas_pallet > 0;
