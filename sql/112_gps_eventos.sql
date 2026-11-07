-- ================================================================
-- COBEB CICLO DE CARRETAS
-- Script: 112 — Tabela gps_eventos (monitoramento GPS)
-- Executar no Supabase Studio > SQL Editor
--
-- Registra cada vez que iniciar() é chamado no app do motorista.
-- Reinicializações múltiplas na mesma viagem indicam que o Android
-- está matando o serviço CobebGps (battery optimization).
-- A página Monitoramento exibe os últimos 4 dias — dados mais antigos
-- podem ser deletados periodicamente sem impacto funcional.
-- ================================================================

CREATE TABLE IF NOT EXISTS public.gps_eventos (
  id           UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  viagem_id    UUID        NOT NULL REFERENCES public.viagens(id)  ON DELETE CASCADE,
  motorista_id UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  evento       TEXT        NOT NULL CHECK (evento IN ('iniciar', 'parar')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS gps_eventos_viagem_idx    ON public.gps_eventos (viagem_id, created_at DESC);
CREATE INDEX IF NOT EXISTS gps_eventos_created_idx   ON public.gps_eventos (created_at DESC);

ALTER TABLE public.gps_eventos ENABLE ROW LEVEL SECURITY;

-- Motorista grava seus próprios eventos
CREATE POLICY "gps_eventos_insert"
  ON public.gps_eventos FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = motorista_id);

-- Somente admin total lê (a página é requireAdminTotal)
CREATE POLICY "gps_eventos_select"
  ON public.gps_eventos FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND acesso_total = true
    )
  );
