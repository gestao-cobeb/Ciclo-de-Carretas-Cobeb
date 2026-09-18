-- ================================================================
-- COBEB CICLO DE CARRETAS
-- Script: 088 — tarefas_operador: SELECT para todas_unidades
-- Executar no Supabase Studio > SQL Editor
-- ================================================================
--
-- O script 087 restringiu SELECT a acesso_total ou mesma unidade.
-- Admins com todas_unidades=true têm unidade_id=null e eram bloqueados.

DROP POLICY IF EXISTS "tarefas_operador_select" ON public.tarefas_operador;

CREATE POLICY "tarefas_operador_select" ON public.tarefas_operador
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.ativo = true
        AND (
          p.acesso_total = true
          OR p.todas_unidades = true
          OR p.unidade_id = tarefas_operador.unidade_id
        )
    )
  );
