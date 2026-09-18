-- ================================================================
-- COBEB CICLO DE CARRETAS
-- Script: 086 — Tabela tarefas_operador
-- Executar no Supabase Studio > SQL Editor
-- ================================================================
--
-- Criada quando o conferente gera um PDF de NRI.
-- O operador (empilheira) vê as tarefas da sua unidade e registra
-- o tempo de organização dos paletes no balizador.

CREATE TABLE IF NOT EXISTS public.tarefas_operador (
  id                 UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  unidade_id         UUID        NOT NULL REFERENCES public.unidades(id),
  placa_cavalo       TEXT,
  placa_carreta      TEXT,
  numero_nf          TEXT,
  quantidade_paletes INTEGER,
  conferente_id      UUID        REFERENCES public.profiles(id) ON DELETE SET NULL,
  conferente_nome    TEXT,
  status             TEXT        NOT NULL DEFAULT 'pendente'
                                 CHECK (status IN ('pendente', 'em_andamento', 'concluido')),
  inicio_at          TIMESTAMPTZ,
  fim_at             TIMESTAMPTZ,
  created_at         TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.tarefas_operador ENABLE ROW LEVEL SECURITY;

-- SELECT: mesma unidade, ou acesso_total / admin
CREATE POLICY "tarefas_operador_select" ON public.tarefas_operador
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.ativo = true
        AND (
          p.acesso_total = true
          OR p.perfil = 'admin'
          OR p.unidade_id = tarefas_operador.unidade_id
        )
    )
  );

-- INSERT: conferente e admin criam tarefas para o operador
CREATE POLICY "tarefas_operador_insert" ON public.tarefas_operador
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.ativo = true
        AND p.perfil IN ('conferente', 'admin')
    )
  );

-- UPDATE: empilheira da mesma unidade pode atualizar status/timestamps
CREATE POLICY "tarefas_operador_update" ON public.tarefas_operador
  FOR UPDATE TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.ativo = true
        AND (
          p.acesso_total = true
          OR p.perfil = 'admin'
          OR (p.perfil = 'empilheira' AND p.unidade_id = tarefas_operador.unidade_id)
        )
    )
  );
