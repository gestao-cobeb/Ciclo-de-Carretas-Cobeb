-- ================================================================
-- COBEB CICLO DE CARRETAS
-- Script: 118 — Reparo: viagens com chegada na revenda não persistida
-- Executar no Supabase Studio > SQL Editor
-- ================================================================
--
-- CONTEXTO (14/11/2026)
-- ─────────────────────
-- Ver script 117. O bug do "Chegada na Revenda" offline deixou viagens
-- fechadas (ou presas) SEM dt_chegada_revenda e SEM numero_nf, enquanto o
-- atendimento de portaria correspondente foi criado normalmente, com a NF
-- e a hora de entrada corretas. Dá para reparar a viagem a partir da
-- portaria (a fonte confiável do que de fato aconteceu).
--
-- Caso-origem:
--   viagem   af5b4a0f-6631-41e0-9584-bfee82e615c4 (RFE2I54, NF saída 115202)
--   portaria ff279e0d-51ea-4fd2-8196-98ced47af91a (NF 001244059, concluída)
--   status atual da viagem: 'concluida' (o ciclo terminou de fato — a
--   portaria entrou 16:52 e saiu 17:16), então o status NÃO muda; o que
--   faltava era o dado da chegada. Backfill abaixo.
-- ================================================================

-- ── 1. DIAGNÓSTICO — rode primeiro para ver TODAS as afetadas ──────────────────
-- Viagens com atendimento de portaria do motorista, mas sem a chegada gravada.
SELECT v.id            AS viagem_id,
       v.status,
       v.numero_nf     AS viagem_nf,
       v.dt_chegada_revenda,
       p.id            AS portaria_id,
       p.numero_nf     AS portaria_nf,
       p.dt_entrada    AS portaria_entrada,
       p.status        AS portaria_status
FROM public.viagens v
JOIN public.portaria_atendimentos p
  ON p.viagem_id = v.id
 AND p.excluido_em IS NULL
 AND COALESCE(p.tipo, 'normal') = 'normal'
WHERE v.dt_chegada_revenda IS NULL
ORDER BY p.created_at DESC;

-- ── 2. REPARO — backfill da chegada a partir da portaria ──────────────────────
-- ⚠ Revise o resultado do diagnóstico acima ANTES de rodar.
-- Não altera o status (já reflete a realidade); só preenche o que faltou.
-- numero_nf só é sobrescrito quando está nulo, para nunca pisar num valor bom.

UPDATE public.viagens v
SET dt_chegada_revenda = COALESCE(p.dt_entrada, p.created_at),
    numero_nf          = COALESCE(v.numero_nf, p.numero_nf)
FROM public.portaria_atendimentos p
WHERE p.viagem_id = v.id
  AND p.excluido_em IS NULL
  AND COALESCE(p.tipo, 'normal') = 'normal'
  AND v.dt_chegada_revenda IS NULL
  AND v.id = 'af5b4a0f-6631-41e0-9584-bfee82e615c4';  -- remova esta linha para reparar TODAS

-- ── 3. CONFERÊNCIA ────────────────────────────────────────────────────────────
SELECT id, status, numero_nf, dt_chegada_revenda
FROM public.viagens
WHERE id = 'af5b4a0f-6631-41e0-9584-bfee82e615c4';
