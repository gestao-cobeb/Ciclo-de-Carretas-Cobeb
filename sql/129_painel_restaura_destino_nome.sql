-- ================================================================
-- COBEB CICLO DE CARRETAS
-- Script: 129 — get_painel_viagens volta a devolver unidade_descarga_nome
--               e agendamento_id (regressão — redirect de destino sumiu)
-- Executar no Supabase Studio > SQL Editor
--
-- Bug corrigido (MESMA família dos scripts 097/124)
-- ─────────────────────────────────────────────────
-- No Painel (Tempo Real), o admin total redireciona a unidade de descarga
-- da viagem pelo lápis no balão de destino. Esse balão (e o lápis) só
-- renderizam quando a viagem traz `unidade_descarga_nome`
-- (EstoqueRealtime.jsx:649). A função parou de devolver esse campo, então
-- o balão + o lápis sumiram e o admin "não consegue mais ajustar".
--
-- Linhagem da regressão:
--   067  criou unidade_descarga_nome + agendamento_id (feature do redirect)
--   097  recriou a função a partir de cópia ANTERIOR ao 067 → derrubou os dois
--   124  copiou do 097 → seguiu sem
--   125  copiou do 124 → seguiu sem (versão viva até aqui)
--
-- É o mesmo padrão que o 097 já tinha usado para derrubar `todas_unidades`
-- (corrigido no 124). Reconferir o CLAUDE.md: ao recriar get_painel_viagens,
-- nunca partir de uma versão antiga sem checar coluna a coluna.
--
-- Correção: parte da versão 125 (mantém excluido_bo, todas_unidades,
-- tem_substituicao com ADICAO_ADMIN) e REPÕE:
--   • unidade_descarga_nome TEXT  — nome da revenda de destino (balão + lápis)
--   • agendamento_id        UUID  — id do agendamento ativo (cancelar no redirect)
-- ================================================================

DROP FUNCTION IF EXISTS public.get_painel_viagens();

CREATE OR REPLACE FUNCTION public.get_painel_viagens()
RETURNS TABLE (
  id                      UUID,
  status                  TEXT,
  horario_agendado        TEXT,
  unidade_descarga_id     UUID,
  unidade_descarga_nome   TEXT,
  placa_carreta           TEXT,
  placa_cavalo            TEXT,
  motorista_nome          TEXT,
  numero_nf               TEXT,
  numero_nf_saida         TEXT,
  total_pedidos           BIGINT,
  produtos                JSONB,
  motorista_last_seen_at  TIMESTAMPTZ,
  motorista_lat           DECIMAL,
  motorista_lng           DECIMAL,
  agendamento_id          UUID,
  agendamento_bloco       TEXT,
  agendamento_data        DATE,
  agendamento_tipo_dia    TEXT,
  fab_nome                TEXT,
  fab_lat                 DECIMAL,
  fab_lng                 DECIMAL,
  tem_substituicao        BOOLEAN
) LANGUAGE sql STABLE SECURITY DEFINER AS $$
  WITH meu_perfil AS (
    SELECT unidade_id, acesso_total, todas_unidades FROM public.profiles WHERE id = auth.uid()
  ),
  viagens_ativas AS (
    SELECT
      v.id, v.status, v.horario_agendado, v.unidade_descarga_id,
      v.carreta_id, v.cavalo_id, v.motorista_id, v.created_at,
      v.motorista_last_seen_at, v.motorista_lat, v.motorista_lng,
      v.numero_nf_saida
    FROM public.viagens v, meu_perfil mp
    WHERE v.status <> 'concluida'
      AND (
        mp.acesso_total = true
        OR mp.todas_unidades = true
        OR (mp.unidade_id IS NOT NULL AND v.unidade_descarga_id = mp.unidade_id)
      )
  ),
  prods AS (
    SELECT
      p.viagem_id,
      jsonb_agg(
        jsonb_build_object(
          'id',           p.id,
          'descricao',    p.descricao,
          'qtde_pallets', p.qtde_pallets,
          'qtde_skus',    p.qtde_skus,
          'embalagem',    p.embalagem,
          'status',       p.status,
          'excluido_bo',  p.excluido_bo
        ) ORDER BY p.descricao
      ) AS lista,
      COUNT(*) FILTER (WHERE p.status = 'ativo') AS total
    FROM public.pedidos p
    WHERE p.viagem_id IN (SELECT id FROM viagens_ativas)
    GROUP BY p.viagem_id
  ),
  tarefa_unica AS (
    SELECT DISTINCT ON (viagem_id) viagem_id, numero_nf
    FROM public.tarefas
    ORDER BY viagem_id, created_at DESC
  ),
  agend AS (
    SELECT DISTINCT ON (viagem_id)
      id, viagem_id, bloco, data_agendamento, tipo_dia
    FROM public.agendamentos
    WHERE status <> 'cancelado'
    ORDER BY viagem_id, created_at DESC
  ),
  fab AS (
    SELECT DISTINCT ON (p.viagem_id)
      p.viagem_id,
      u.nome      AS fab_nome,
      u.latitude  AS fab_lat,
      u.longitude AS fab_lng
    FROM public.pedidos p
    JOIN public.unidades u
      ON u.codigo_ambev = p.codigo_fabrica AND u.tipo = 'fabrica'
    WHERE p.viagem_id IN (SELECT id FROM viagens_ativas)
      AND p.codigo_fabrica IS NOT NULL
      AND p.status = 'ativo'
    ORDER BY p.viagem_id, p.numero_pedido ASC
  )
  SELECT
    v.id,
    v.status,
    v.horario_agendado,
    v.unidade_descarga_id,
    u_dest.nome                      AS unidade_descarga_nome,
    cr.placa                         AS placa_carreta,
    ca.placa                         AS placa_cavalo,
    pf.nome                          AS motorista_nome,
    t.numero_nf,
    v.numero_nf_saida,
    COALESCE(pr.total, 0)            AS total_pedidos,
    COALESCE(pr.lista, '[]'::jsonb)  AS produtos,
    v.motorista_last_seen_at,
    v.motorista_lat,
    v.motorista_lng,
    ag.id                            AS agendamento_id,
    ag.bloco                         AS agendamento_bloco,
    ag.data_agendamento              AS agendamento_data,
    ag.tipo_dia                      AS agendamento_tipo_dia,
    f.fab_nome,
    f.fab_lat,
    f.fab_lng,
    EXISTS (
      SELECT 1 FROM public.pedidos ps
      WHERE ps.viagem_id = v.id
        AND (ps.status = 'cancelado' OR ps.arquivo_origem = 'ADICAO_ADMIN')
    )                                AS tem_substituicao
  FROM viagens_ativas v
  LEFT JOIN public.unidades  u_dest ON u_dest.id = v.unidade_descarga_id
  LEFT JOIN public.carretas  cr     ON cr.id = v.carreta_id
  LEFT JOIN public.cavalos   ca     ON ca.id = v.cavalo_id
  LEFT JOIN public.profiles  pf     ON pf.id = v.motorista_id
  LEFT JOIN tarefa_unica     t      ON t.viagem_id = v.id
  LEFT JOIN prods            pr     ON pr.viagem_id = v.id
  LEFT JOIN agend            ag     ON ag.viagem_id = v.id
  LEFT JOIN fab              f      ON f.viagem_id  = v.id
  ORDER BY
    CASE v.status
      WHEN 'retornando'             THEN 1
      WHEN 'aguardando_conferencia' THEN 2
      WHEN 'na_fabrica'             THEN 3
      WHEN 'em_transito'            THEN 4
      WHEN 'iniciada'               THEN 5
      ELSE 6
    END,
    v.created_at DESC;
$$;

GRANT EXECUTE ON FUNCTION public.get_painel_viagens() TO authenticated;
