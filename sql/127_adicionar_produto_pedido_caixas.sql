-- ================================================================
-- COBEB CICLO DE CARRETAS
-- Script: 127 — Adição retroativa calcula qtde_skus (caixas)
-- Executar no Supabase Studio > SQL Editor
--
-- Correção do 126: admin_adicionar_produto_pedido gravava qtde_skus=0
-- (herdado do padrão do Painel, onde a conferência preenche depois).
-- Na guia Pedidos não há conferência: o item ficava "0 cx".
--
-- O volume do Dashboard NÃO usa qtde_skus (ele faz pallets ×
-- caixas_pallet × fator), então o HL sempre esteve certo — o defeito
-- era só a coluna "cx" exibida na guia Pedidos / Tarefas / Viagem.
--
-- Agora calcula as caixas na fonte, do mesmo jeito que o resto do app:
--   qtde_skus = ROUND(qtde_pallets × caixas_pallet)   (produtos_catalogo)
-- (ver Tarefas.jsx:435 e DashboardComercial.jsx:306). Se o código não
-- estiver no catálogo, grava 0 — os dashboards já têm fallback por
-- pallets × caixas_pallet.
--
-- CREATE OR REPLACE: substitui a versão do 126. A função de EXCLUSÃO
-- (admin_excluir_produto_pedido) não muda.
-- ================================================================

CREATE OR REPLACE FUNCTION public.admin_adicionar_produto_pedido(
  p_ref_item_id  UUID,
  p_cod_produto  TEXT,
  p_descricao    TEXT,
  p_qtde_pallets NUMERIC
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_acesso_total  BOOLEAN;
  v_ref           RECORD;
  v_caixas_pallet NUMERIC;
  v_qtde_skus     INTEGER;
BEGIN
  SELECT acesso_total INTO v_acesso_total
  FROM public.profiles WHERE id = auth.uid();

  IF NOT COALESCE(v_acesso_total, false) THEN
    RAISE EXCEPTION 'Acesso negado: recurso exclusivo para administradores totais';
  END IF;

  IF TRIM(COALESCE(p_cod_produto, '')) = '' OR TRIM(COALESCE(p_descricao, '')) = '' THEN
    RAISE EXCEPTION 'Código e descrição do produto são obrigatórios';
  END IF;

  IF p_qtde_pallets IS NULL OR p_qtde_pallets <= 0 THEN
    RAISE EXCEPTION 'Quantidade de paletes deve ser maior que zero';
  END IF;

  SELECT * INTO v_ref
  FROM public.pedidos
  WHERE id = p_ref_item_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pedido de referência não encontrado';
  END IF;

  -- Caixas = paletes × caixas por palete (catálogo), arredondado.
  -- Mesmo cálculo do resto do app; 0 se o código não estiver no catálogo.
  SELECT caixas_pallet INTO v_caixas_pallet
  FROM public.produtos_catalogo
  WHERE codigo = TRIM(p_cod_produto);

  v_qtde_skus := COALESCE(ROUND(p_qtde_pallets * v_caixas_pallet)::int, 0);

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
    v_ref.data_puxada,
    v_ref.revenda,
    v_ref.unidade_id,
    v_ref.fabrica,
    v_ref.numero_pedido,
    v_ref.placa,
    TRIM(p_cod_produto),
    TRIM(p_descricao),
    v_ref.embalagem,
    NULL,
    p_qtde_pallets,
    v_qtde_skus,
    v_ref.arquivo_origem,
    v_ref.viagem_id,
    auth.uid(),
    v_ref.codigo_revenda,
    v_ref.codigo_fabrica,
    CASE WHEN v_ref.viagem_id IS NOT NULL THEN 'ativo' ELSE 'realizado' END
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_adicionar_produto_pedido(UUID, TEXT, TEXT, NUMERIC) TO authenticated;
