-- ================================================================
-- COBEB CICLO DE CARRETAS
-- Script: 126 — Ajuste retroativo de pedido via BO (admin total)
-- Executar no Supabase Studio > SQL Editor
--
-- Cenário: o ajuste de BO que deveria ter sido feito no Painel Tempo
-- Real (excluir/substituir produto) NÃO aconteceu a tempo. A viagem
-- concluiu e o Dashboard Volume ficou contando um produto que não foi
-- — ou deixou de contar um que foi. Estas RPCs permitem corrigir o
-- pedido DEPOIS, direto na guia Pedidos, para deixar os dados puxados
-- coerentes com a realidade.
--
-- Diferença para o 060 (substituição) e o 125 (exclusão via BO):
--   • Aquelas são para viagem AINDA ATIVA e por isso TRAVAM quando a
--     viagem saiu de iniciada/em_transito/na_fabrica.
--   • Estas são RETROATIVAS: NÃO há gate de fase da viagem. Funcionam
--     em pedido já finalizado (viagem concluída) ou de dias atrás, e
--     em pedido vinculado manualmente (status='realizado', sem viagem).
--   ⚠ Por isso são FUNÇÕES NOVAS, separadas. NÃO recriar nem relaxar
--     as RPCs do Painel (060/125) — a trava delas é proposital.
--
-- "Troca de SKU" = excluir o item errado + adicionar o correto. Não há
-- RPC de substituição dedicada aqui (decisão com o Lucas).
--
-- Como não quebra nada downstream:
--   • Exclusão marca status='cancelado' + excluido_bo=true — a MESMA
--     chave que o Dashboard Volume (`status !== 'cancelado'`), a guia
--     Pedidos (`status !== 'cancelado'`) e o app do motorista
--     (`.neq('status','cancelado')`) já usam para ignorar itens.
--   • Adição herda viagem_id/status do pedido-modelo, então entra no
--     Dashboard exatamente como os irmãos (regra: viagem_id != null OU
--     status='realizado'). E herda arquivo_origem, então aparece no
--     MESMO grupo da guia Pedidos (que agrupa por numero_pedido ||
--     arquivo_origem) — não vira pedido avulso nem base-fantasma.
-- ================================================================

-- ── 1. Exclusão retroativa de item do pedido ─────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_excluir_produto_pedido(
  p_item_id UUID
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_acesso_total BOOLEAN;
BEGIN
  SELECT acesso_total INTO v_acesso_total
  FROM public.profiles WHERE id = auth.uid();

  IF NOT COALESCE(v_acesso_total, false) THEN
    RAISE EXCEPTION 'Acesso negado: recurso exclusivo para administradores totais';
  END IF;

  -- Só itens ativos podem ser excluídos (já cancelados/furos ficam como estão).
  -- Sem gate de fase da viagem: é ajuste retroativo.
  UPDATE public.pedidos
  SET status = 'cancelado',
      excluido_bo = true
  WHERE id = p_item_id AND status = 'ativo';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Item não encontrado ou não está ativo';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_excluir_produto_pedido(UUID) TO authenticated;

-- ── 2. Adição retroativa de item ao pedido ───────────────────────────────────
-- Herda todos os campos de agrupamento de um item-modelo do mesmo pedido
-- (p_ref_item_id). O frontend passa um item ativo do grupo.
CREATE OR REPLACE FUNCTION public.admin_adicionar_produto_pedido(
  p_ref_item_id  UUID,
  p_cod_produto  TEXT,
  p_descricao    TEXT,
  p_qtde_pallets NUMERIC
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_acesso_total BOOLEAN;
  v_ref          RECORD;
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

  -- Insere o novo item herdando os campos de agrupamento do modelo.
  -- O status é derivado (nunca copiado de v_ref, que poderia estar
  -- cancelado/furo): se o pedido tem viagem, 'ativo'; senão 'realizado'.
  -- Em ambos os casos o Dashboard conta (viagem_id != null OU 'realizado').
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
    0,
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
