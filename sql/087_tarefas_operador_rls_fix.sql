-- ================================================================
-- COBEB CICLO DE CARRETAS
-- Script: 087 — Corrige RLS de tarefas_operador
-- Executar no Supabase Studio > SQL Editor
-- ================================================================
--
-- A política SELECT anterior permitia que qualquer admin visse todas
-- as tarefas. A regra correta: acesso_total vê tudo; todos os demais
-- (incluindo admins sem acesso_total) veem apenas sua própria unidade.

DROP POLICY IF EXISTS "tarefas_operador_select" ON public.tarefas_operador;

CREATE POLICY "tarefas_operador_select" ON public.tarefas_operador
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.ativo = true
        AND (
          p.acesso_total = true
          OR p.unidade_id = tarefas_operador.unidade_id
        )
    )
  );
