-- ================================================================
-- COBEB CICLO DE CARRETAS
-- Script: 102 — Tabela de preços fábrica (tabela Pratic)
-- Executar no Supabase Studio > SQL Editor
-- ================================================================

CREATE TABLE IF NOT EXISTS public.precos_fabrica (
  codigo         TEXT          PRIMARY KEY,  -- mesmo valor de pedidos.cod_produto
  nome           TEXT,
  preco          NUMERIC(10,4),              -- preço fábrica tabela Pratic
  data_vigencia  DATE,                       -- data_inicio da vigência mais recente
  importado_em   TIMESTAMPTZ   NOT NULL DEFAULT now(),
  importado_por  UUID          REFERENCES public.profiles(id)
);

ALTER TABLE public.precos_fabrica ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_precos_fabrica_codigo ON public.precos_fabrica(codigo);

CREATE POLICY "admins veem precos_fabrica"
  ON public.precos_fabrica FOR SELECT TO authenticated
  USING (is_admin());

CREATE POLICY "admin_total insere precos_fabrica"
  ON public.precos_fabrica FOR INSERT TO authenticated
  WITH CHECK (is_admin_total());

CREATE POLICY "admin_total atualiza precos_fabrica"
  ON public.precos_fabrica FOR UPDATE TO authenticated
  USING  (is_admin_total())
  WITH CHECK (is_admin_total());

CREATE POLICY "admin_total deleta precos_fabrica"
  ON public.precos_fabrica FOR DELETE TO authenticated
  USING (is_admin_total());
