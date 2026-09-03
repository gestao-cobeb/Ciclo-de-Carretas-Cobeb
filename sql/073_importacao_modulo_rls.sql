-- ================================================================
-- COBEB CICLO DE CARRETAS
-- Script: 073 — Liberação de escrita em pedidos e produtos_catalogo
--              para admins com módulo 'importacao' permitido
-- Executar no Supabase Studio > SQL Editor
--
-- Contexto: antes da 073, INSERT/UPDATE/DELETE em pedidos e
-- produtos_catalogo exigiam is_admin_total(). Com a promoção da
-- tela de Importação para módulo independente (commit ad75fbb),
-- admins leitura com 'importacao' em modulos_permitidos também
-- precisam dessas permissões.
-- ================================================================

-- ── Função auxiliar ───────────────────────────────────────────────────────────
-- Retorna TRUE se o usuário logado é admin total OU tem o módulo indicado
-- em modulos_permitidos. Equivale a is_admin_total() para admin total.

CREATE OR REPLACE FUNCTION has_modulo(modulo TEXT)
RETURNS BOOLEAN
SECURITY DEFINER
SET search_path = public
LANGUAGE sql AS $$
  SELECT COALESCE(
    (SELECT acesso_total
            OR (modulos_permitidos IS NOT NULL AND modulo = ANY(modulos_permitidos))
     FROM profiles
     WHERE id = auth.uid() AND perfil = 'admin' AND ativo = TRUE),
    FALSE
  );
$$;

-- ── pedidos: escrita ──────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "admin_total pode inserir pedidos"  ON public.pedidos;
DROP POLICY IF EXISTS "admin_total pode deletar pedidos"  ON public.pedidos;
DROP POLICY IF EXISTS "admin_total pode atualizar pedidos" ON public.pedidos;

CREATE POLICY "importacao pode inserir pedidos"
  ON public.pedidos FOR INSERT TO authenticated
  WITH CHECK (has_modulo('importacao'));

CREATE POLICY "importacao pode deletar pedidos"
  ON public.pedidos FOR DELETE TO authenticated
  USING (has_modulo('importacao'));

CREATE POLICY "importacao pode atualizar pedidos"
  ON public.pedidos FOR UPDATE TO authenticated
  USING  (has_modulo('importacao'))
  WITH CHECK (has_modulo('importacao'));

-- ── produtos_catalogo: escrita ────────────────────────────────────────────────

DROP POLICY IF EXISTS "admin_total insere produtos_catalogo"  ON public.produtos_catalogo;
DROP POLICY IF EXISTS "admin_total atualiza produtos_catalogo" ON public.produtos_catalogo;
DROP POLICY IF EXISTS "admin_total deleta produtos_catalogo"  ON public.produtos_catalogo;

CREATE POLICY "importacao insere produtos_catalogo"
  ON public.produtos_catalogo FOR INSERT TO authenticated
  WITH CHECK (has_modulo('importacao'));

CREATE POLICY "importacao atualiza produtos_catalogo"
  ON public.produtos_catalogo FOR UPDATE TO authenticated
  USING  (has_modulo('importacao'))
  WITH CHECK (has_modulo('importacao'));

CREATE POLICY "importacao deleta produtos_catalogo"
  ON public.produtos_catalogo FOR DELETE TO authenticated
  USING (has_modulo('importacao'));
