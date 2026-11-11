-- ================================================================
-- COBEB CICLO DE CARRETAS
-- Script: 116 — Módulo Demanda de Chopp
-- Executar no Supabase Studio > SQL Editor
--
-- Cria:
--   1. chopp_litros  — de-para código → litros por barril
--                      (cadastrado em Cadastros > Metas)
--   2. demanda_chopp — demandas semanais solicitadas
--
-- Semana segue o padrão do Dashboard: mês + semana 1–4
--   (dias 1–7, 8–14, 15–21, 22–fim do mês).
-- ================================================================

-- ----------------------------------------------------------------
-- 1. DE-PARA DE LITROS POR BARRIL
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.chopp_litros (
  codigo             TEXT          PRIMARY KEY,
  descricao          TEXT,
  litros_por_barril  NUMERIC(10,2) NOT NULL,
  criado_em          TIMESTAMPTZ   NOT NULL DEFAULT now(),
  criado_por         UUID          REFERENCES auth.users(id)
);

ALTER TABLE public.chopp_litros ENABLE ROW LEVEL SECURITY;

-- Admins leem (necessário para Solicitar Demanda e Volume Puxado)
DROP POLICY IF EXISTS "admins leem chopp_litros" ON public.chopp_litros;
CREATE POLICY "admins leem chopp_litros"
  ON public.chopp_litros FOR SELECT TO authenticated
  USING (is_admin());

-- Admin total gerencia o de-para
DROP POLICY IF EXISTS "admin_total insere chopp_litros" ON public.chopp_litros;
CREATE POLICY "admin_total insere chopp_litros"
  ON public.chopp_litros FOR INSERT TO authenticated
  WITH CHECK (is_admin_total());

DROP POLICY IF EXISTS "admin_total atualiza chopp_litros" ON public.chopp_litros;
CREATE POLICY "admin_total atualiza chopp_litros"
  ON public.chopp_litros FOR UPDATE TO authenticated
  USING  (is_admin_total())
  WITH CHECK (is_admin_total());

DROP POLICY IF EXISTS "admin_total deleta chopp_litros" ON public.chopp_litros;
CREATE POLICY "admin_total deleta chopp_litros"
  ON public.chopp_litros FOR DELETE TO authenticated
  USING (is_admin_total());

-- ----------------------------------------------------------------
-- 2. DEMANDAS SEMANAIS SOLICITADAS
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.demanda_chopp (
  id                  UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  unidade_id          UUID          REFERENCES public.unidades(id),
  ano                 INTEGER       NOT NULL,
  mes                 INTEGER       NOT NULL CHECK (mes BETWEEN 1 AND 12),
  semana              INTEGER       NOT NULL CHECK (semana BETWEEN 1 AND 4),
  codigo              TEXT          NOT NULL,
  descricao           TEXT,
  qtde_unidades       NUMERIC(12,2) NOT NULL,
  litros_por_barril   NUMERIC(10,2),          -- snapshot no momento da solicitação
  litros              NUMERIC(14,2),          -- snapshot: qtde_unidades * litros_por_barril
  solicitado_por      UUID          REFERENCES auth.users(id),
  solicitado_por_nome TEXT,
  created_at          TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS demanda_chopp_periodo_idx ON public.demanda_chopp (ano, mes, semana);
CREATE INDEX IF NOT EXISTS demanda_chopp_unidade_idx ON public.demanda_chopp (unidade_id);
CREATE INDEX IF NOT EXISTS demanda_chopp_codigo_idx  ON public.demanda_chopp (codigo);

ALTER TABLE public.demanda_chopp ENABLE ROW LEVEL SECURITY;

-- Qualquer admin lê
DROP POLICY IF EXISTS "admins leem demanda_chopp" ON public.demanda_chopp;
CREATE POLICY "admins leem demanda_chopp"
  ON public.demanda_chopp FOR SELECT TO authenticated
  USING (is_admin());

-- Qualquer admin solicita (insere)
DROP POLICY IF EXISTS "admins inserem demanda_chopp" ON public.demanda_chopp;
CREATE POLICY "admins inserem demanda_chopp"
  ON public.demanda_chopp FOR INSERT TO authenticated
  WITH CHECK (is_admin());

-- Após enviado, só admin total edita
DROP POLICY IF EXISTS "admin_total edita demanda_chopp" ON public.demanda_chopp;
CREATE POLICY "admin_total edita demanda_chopp"
  ON public.demanda_chopp FOR UPDATE TO authenticated
  USING  (is_admin_total())
  WITH CHECK (is_admin_total());

-- Só admin total exclui do histórico
DROP POLICY IF EXISTS "admin_total exclui demanda_chopp" ON public.demanda_chopp;
CREATE POLICY "admin_total exclui demanda_chopp"
  ON public.demanda_chopp FOR DELETE TO authenticated
  USING (is_admin_total());
