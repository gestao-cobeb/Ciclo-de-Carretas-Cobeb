-- ================================================================
-- COBEB CICLO DE CARRETAS
-- Script: 119 — Módulo Justificativa de Furo
-- Executar no Supabase Studio > SQL Editor
--
-- Contexto
-- ────────
-- "Furo" = pedido marcado com status='furo' na guia Pedidos do módulo
-- Administrador (campo status já existe desde o 060; auditoria no 069).
-- Este módulo lista os furos e permite registrar, por linha de pedido
-- (cada linha = um SKU = um id de pedido):
--   • o MOTIVO do furo (lista cadastrada em Cadastros > Metas)
--   • uma OBSERVAÇÃO digitada à mão
--
-- Cria:
--   1. motivos_furo              — lista de motivos (igual aos motivos de blitz)
--   2. pedido_furo_justificativa — motivo + observação por pedido (1:1)
-- ================================================================

-- ----------------------------------------------------------------
-- 1. MOTIVOS DE FURO (cadastrados em Cadastros > Metas)
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.motivos_furo (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  descricao  TEXT        NOT NULL,
  ativo      BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.motivos_furo ENABLE ROW LEVEL SECURITY;

-- Qualquer admin lê (necessário para o dropdown do módulo Justificativa de Furo)
DROP POLICY IF EXISTS "admins leem motivos_furo" ON public.motivos_furo;
CREATE POLICY "admins leem motivos_furo"
  ON public.motivos_furo FOR SELECT TO authenticated
  USING (is_admin());

-- Admin total gerencia a lista (a guia Cadastros é só de admin total)
DROP POLICY IF EXISTS "admin_total insere motivos_furo" ON public.motivos_furo;
CREATE POLICY "admin_total insere motivos_furo"
  ON public.motivos_furo FOR INSERT TO authenticated
  WITH CHECK (is_admin_total());

DROP POLICY IF EXISTS "admin_total atualiza motivos_furo" ON public.motivos_furo;
CREATE POLICY "admin_total atualiza motivos_furo"
  ON public.motivos_furo FOR UPDATE TO authenticated
  USING  (is_admin_total())
  WITH CHECK (is_admin_total());

DROP POLICY IF EXISTS "admin_total deleta motivos_furo" ON public.motivos_furo;
CREATE POLICY "admin_total deleta motivos_furo"
  ON public.motivos_furo FOR DELETE TO authenticated
  USING (is_admin_total());

-- ----------------------------------------------------------------
-- 2. JUSTIFICATIVA DO FURO POR PEDIDO (1 linha por pedido = por SKU)
-- ----------------------------------------------------------------
-- pedido_id é a chave: cada linha de pedido tem seu próprio id, então a
-- justificativa é por SKU. ON DELETE CASCADE: se a re-importação apagar o
-- pedido, a justificativa some junto (não sobra órfã).
CREATE TABLE IF NOT EXISTS public.pedido_furo_justificativa (
  pedido_id      UUID        PRIMARY KEY
                   REFERENCES public.pedidos(id) ON DELETE CASCADE,
  motivo_id      UUID        REFERENCES public.motivos_furo(id) ON DELETE SET NULL,
  observacao     TEXT,
  atualizado_em  TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_por UUID        REFERENCES public.profiles(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_pedido_furo_just_motivo
  ON public.pedido_furo_justificativa (motivo_id);

ALTER TABLE public.pedido_furo_justificativa ENABLE ROW LEVEL SECURITY;

-- Qualquer admin lê e registra/edita a justificativa (é dado operacional,
-- preenchido pelo mesmo usuário que opera o módulo)
DROP POLICY IF EXISTS "admins leem pedido_furo_justificativa" ON public.pedido_furo_justificativa;
CREATE POLICY "admins leem pedido_furo_justificativa"
  ON public.pedido_furo_justificativa FOR SELECT TO authenticated
  USING (is_admin());

DROP POLICY IF EXISTS "admins inserem pedido_furo_justificativa" ON public.pedido_furo_justificativa;
CREATE POLICY "admins inserem pedido_furo_justificativa"
  ON public.pedido_furo_justificativa FOR INSERT TO authenticated
  WITH CHECK (is_admin());

DROP POLICY IF EXISTS "admins atualizam pedido_furo_justificativa" ON public.pedido_furo_justificativa;
CREATE POLICY "admins atualizam pedido_furo_justificativa"
  ON public.pedido_furo_justificativa FOR UPDATE TO authenticated
  USING  (is_admin())
  WITH CHECK (is_admin());

-- Só admin total exclui (limpeza)
DROP POLICY IF EXISTS "admin_total deleta pedido_furo_justificativa" ON public.pedido_furo_justificativa;
CREATE POLICY "admin_total deleta pedido_furo_justificativa"
  ON public.pedido_furo_justificativa FOR DELETE TO authenticated
  USING (is_admin_total());
