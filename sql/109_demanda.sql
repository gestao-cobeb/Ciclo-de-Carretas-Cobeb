-- ================================================================
-- COBEB CICLO DE CARRETAS
-- Script: 109 — Tabela de demanda (importada da planilha DEMANDA.xlsx)
-- Executar no Supabase Studio > SQL Editor
-- ================================================================

CREATE TABLE IF NOT EXISTS public.demanda (
  id                  uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  versao              text        NOT NULL,
  mes                 text        NOT NULL,
  ano                 integer     NOT NULL,
  geo_uf              text,
  comercial_operacao  text,
  canal               text,
  cod_operacao        text,
  nome_operacao       text,
  cod_promax          text,
  cod_sap             text,
  produto             text,
  tipo                text,
  segmento            text,
  sub_segmento        text,
  marca               text,
  sub_marca           text,
  pack                text,
  vol_media_l6m       numeric,
  vol_media_l3m       numeric,
  vol_tend            numeric,
  demanda             numeric,
  volume_real         numeric,
  importado_em        timestamptz DEFAULT now(),
  importado_por       uuid        REFERENCES auth.users(id)
);

-- Índices para consultas típicas
CREATE INDEX IF NOT EXISTS demanda_ano_mes_idx       ON public.demanda (ano, mes);
CREATE INDEX IF NOT EXISTS demanda_versao_ano_idx    ON public.demanda (versao, ano);
CREATE INDEX IF NOT EXISTS demanda_cod_operacao_idx  ON public.demanda (cod_operacao);
CREATE INDEX IF NOT EXISTS demanda_cod_sap_idx       ON public.demanda (cod_sap);

-- RLS
ALTER TABLE public.demanda ENABLE ROW LEVEL SECURITY;

-- Admins leem
CREATE POLICY "admin_select_demanda" ON public.demanda
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.perfil = 'admin'
    )
  );

-- Admins inserem / atualizam / excluem
CREATE POLICY "admin_insert_demanda" ON public.demanda
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.perfil = 'admin'
    )
  );

CREATE POLICY "admin_delete_demanda" ON public.demanda
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.perfil = 'admin'
    )
  );
