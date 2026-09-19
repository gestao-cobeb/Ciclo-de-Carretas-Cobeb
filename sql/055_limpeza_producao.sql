-- ================================================================
-- COBEB CICLO DE CARRETAS
-- Script: 055 — Limpeza de dados para início de produção
-- Executar no Supabase Studio > SQL Editor
--
-- MANTÉM:  unidades, cavalos, carretas, profiles, produtos_catalogo,
--          grade_horarios, grade_horarios_log
-- APAGA:   toda movimentação operacional + manutenções
-- RESETA:  contador NRI para zero
--
-- ATENÇÃO: imagens de anomalias no Storage NÃO são removidas por SQL.
--          Apague manualmente em Storage > anomalias no painel Supabase.
-- ================================================================

BEGIN;

-- 1. Emissões de NRI (referencia tarefas)
DELETE FROM public.nri_emissoes;

-- 2. Itens de conferência
DELETE FROM public.conferencia_itens;

-- 3. Tarefas (referencia portaria_atendimentos e viagens)
DELETE FROM public.tarefas;

-- 4. Anomalias (referencia viagens)
DELETE FROM public.anomalias;

-- 5. Atendimentos de portaria — viagens normais e marketplace
DELETE FROM public.portaria_atendimentos;

-- 6. Agendamentos
DELETE FROM public.agendamentos;

-- 7. Pedidos (referencia viagens)
DELETE FROM public.pedidos;

-- 8. Viagens
DELETE FROM public.viagens;

-- 9. Manutenções
DELETE FROM public.manutencoes_carretas;
DELETE FROM public.manutencoes_cavalos;

-- 10. Resetar sequencial de NRI
UPDATE public.nri_sequencial SET ultimo_numero = 0;

COMMIT;

-- Verificação — todos devem retornar 0
SELECT 'nri_emissoes'          AS tabela, COUNT(*) AS registros FROM public.nri_emissoes
UNION ALL
SELECT 'conferencia_itens',      COUNT(*) FROM public.conferencia_itens
UNION ALL
SELECT 'tarefas',                COUNT(*) FROM public.tarefas
UNION ALL
SELECT 'anomalias',              COUNT(*) FROM public.anomalias
UNION ALL
SELECT 'portaria_atendimentos',  COUNT(*) FROM public.portaria_atendimentos
UNION ALL
SELECT 'agendamentos',           COUNT(*) FROM public.agendamentos
UNION ALL
SELECT 'pedidos',                COUNT(*) FROM public.pedidos
UNION ALL
SELECT 'viagens',                COUNT(*) FROM public.viagens
UNION ALL
SELECT 'manutencoes_carretas',   COUNT(*) FROM public.manutencoes_carretas
UNION ALL
SELECT 'manutencoes_cavalos',    COUNT(*) FROM public.manutencoes_cavalos
UNION ALL
SELECT 'nri_sequencial (valor)', ultimo_numero FROM public.nri_sequencial;
