-- ================================================================
-- COBEB CICLO DE CARRETAS
-- Script: 075 — Liberar emissão de NRI para admins com módulo
--              'conferente' em modulos_permitidos
-- Executar no Supabase Studio > SQL Editor
--
-- Contexto: a política INSERT em nri_emissoes exigia is_conferente()
-- (perfil = 'conferente'). Admins leitura com 'conferente' em
-- modulos_permitidos têm perfil = 'admin', então eram bloqueados.
-- has_modulo() já existe desde 073 e cobre admin_total E o módulo.
-- ================================================================

CREATE POLICY "modulo conferente pode inserir nri_emissoes"
  ON public.nri_emissoes FOR INSERT TO authenticated
  WITH CHECK (has_modulo('conferente'));
