-- ================================================================
-- COBEB CICLO DE CARRETAS
-- Script: 128 — Versão mínima do APK (atualização obrigatória)
-- Executar no Supabase Studio > SQL Editor
--
-- O app nativo (motorista) checa esta versão no startup. Se o APK instalado
-- for ANTERIOR a `versao_minima`, o app mostra uma tela de bloqueio com botão
-- de baixar a versão nova e NÃO deixa acessar até atualizar (ver
-- src/components/GateAtualizacao.jsx). Fail-open: sem rede ou sem a linha, o
-- app NÃO bloqueia.
--
-- ⚠ Só o gate que roda DENTRO do app consegue barrar. APKs antigos já
--   instalados (<= v1.0.39) não têm o gate — esta trava só vale do v1.0.40
--   em diante. A primeira migração para o v1.0.40 ainda é manual, uma vez.
--
-- ⚠ Nunca ponha aqui uma versão SEM APK publicado: travaria todo mundo num
--   laço (baixa o mais novo, continua "velho", bloqueia de novo).
--
-- Para EXIGIR uma nova versão no futuro (depois que o APK dela estiver no ar):
--   UPDATE public.app_versao SET versao_minima = '1.0.41', atualizado_em = now() WHERE id = 1;
-- ================================================================

CREATE TABLE IF NOT EXISTS public.app_versao (
  id            INT         PRIMARY KEY DEFAULT 1,
  versao_minima TEXT        NOT NULL,
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT app_versao_linha_unica CHECK (id = 1)
);

INSERT INTO public.app_versao (id, versao_minima)
VALUES (1, '1.0.40')
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.app_versao ENABLE ROW LEVEL SECURITY;

-- Leitura PÚBLICA (role anon): a tela de atualização precisa checar ANTES do
-- login. Não há dado sensível — é só um número de versão.
DROP POLICY IF EXISTS app_versao_leitura ON public.app_versao;
CREATE POLICY app_versao_leitura ON public.app_versao
  FOR SELECT TO anon, authenticated USING (true);

-- Só admin total altera a versão exigida.
DROP POLICY IF EXISTS app_versao_update ON public.app_versao;
CREATE POLICY app_versao_update ON public.app_versao
  FOR UPDATE TO authenticated
  USING      (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.acesso_total = true))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.acesso_total = true));

GRANT SELECT ON public.app_versao TO anon, authenticated;
GRANT UPDATE ON public.app_versao TO authenticated;

-- Verificação
SELECT * FROM public.app_versao;
