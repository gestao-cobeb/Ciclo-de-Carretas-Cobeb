-- ================================================================
-- COBEB CICLO DE CARRETAS
-- Script: 110 — Tabela de-para de produtos Zero (NAB ZERO / CERVEJA ZERO)
-- Executar no Supabase Studio > SQL Editor
-- ================================================================

CREATE TABLE IF NOT EXISTS public.depara_zero (
  id           uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  cod_promax   text,
  cod_sap      text,
  produto      text,
  tipo         text        NOT NULL, -- 'CERVEJA ZERO' ou 'NAB ZERO'
  importado_em timestamptz DEFAULT now(),
  importado_por uuid       REFERENCES auth.users(id)
);

CREATE INDEX IF NOT EXISTS depara_zero_cod_sap_idx    ON public.depara_zero (cod_sap);
CREATE INDEX IF NOT EXISTS depara_zero_cod_promax_idx ON public.depara_zero (cod_promax);
CREATE INDEX IF NOT EXISTS depara_zero_tipo_idx       ON public.depara_zero (tipo);

ALTER TABLE public.depara_zero ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_select_depara_zero" ON public.depara_zero
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.perfil = 'admin'
    )
  );

CREATE POLICY "admin_insert_depara_zero" ON public.depara_zero
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.perfil = 'admin'
    )
  );

CREATE POLICY "admin_delete_depara_zero" ON public.depara_zero
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.perfil = 'admin'
    )
  );
