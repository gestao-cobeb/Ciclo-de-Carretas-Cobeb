-- ================================================================
-- COBEB CICLO DE CARRETAS
-- Script: 083 — Admin com módulos tem permissão completa de escrita
-- Executar no Supabase Studio > SQL Editor
-- ================================================================
--
-- PROBLEMA RESOLVIDO
-- ─────────────────
-- 1. "duplicate key violates unique constraint users_email_partial_key"
--    Um admin sem acesso_total chamava criar_usuario_auth (que só verifica
--    is_admin() → PASSOU) e depois tentava inserir em profiles (que exigia
--    is_admin_total() → FALHOU). O row em auth.users ficava órfão.
--    Na próxima tentativa, criar_usuario_auth batia no constraint do email.
--
-- 2. Qualquer admin com módulo habilitado deve ter acesso de escrita nesse
--    módulo, igual ao acesso_total. A distinção acesso_total x somente-leitura
--    já é feita pela interface (quais módulos aparecem no menu); no banco,
--    qualquer admin autenticado pode operar.
-- ================================================================


-- ── 1. criar_usuario_auth: recupera row órfão em vez de falhar ────────────────

CREATE OR REPLACE FUNCTION criar_usuario_auth(
  p_email TEXT,
  p_senha TEXT,
  p_nome  TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = auth, extensions, public
AS $$
DECLARE
  v_id          UUID := gen_random_uuid();
  v_existing_id UUID;
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'Acesso negado'; END IF;

  -- Verifica se o email já existe em auth.users (não deletado)
  SELECT id INTO v_existing_id
  FROM auth.users
  WHERE email = p_email AND deleted_at IS NULL;

  IF v_existing_id IS NOT NULL THEN
    -- Email já tem profile associado: é um duplicado real
    IF EXISTS (SELECT 1 FROM public.profiles WHERE id = v_existing_id) THEN
      RAISE EXCEPTION 'E-mail % já está em uso por outro usuário.', p_email;
    END IF;
    -- auth.users órfão (criação anterior falhou antes do INSERT em profiles):
    -- atualiza a senha com o novo valor e retorna o ID para continuar
    UPDATE auth.users
      SET encrypted_password = crypt(p_senha, gen_salt('bf')),
          updated_at         = now()
    WHERE id = v_existing_id;
    RETURN v_existing_id;
  END IF;

  -- Criação normal
  INSERT INTO auth.users (
    id, instance_id,
    aud, role,
    email, encrypted_password,
    email_confirmed_at, created_at, updated_at,
    raw_app_meta_data, raw_user_meta_data,
    is_super_admin,
    confirmation_token, email_change, email_change_token_new, recovery_token
  ) VALUES (
    v_id,
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated',
    p_email,
    crypt(p_senha, gen_salt('bf')),
    now(), now(), now(),
    '{"provider":"email","providers":["email"]}',
    jsonb_build_object('nome', p_nome),
    false,
    '', '', '', ''
  );

  INSERT INTO auth.identities (
    id, user_id, identity_data, provider,
    last_sign_in_at, created_at, updated_at, provider_id
  ) VALUES (
    gen_random_uuid(), v_id,
    jsonb_build_object('sub', v_id::text, 'email', p_email),
    'email', now(), now(), now(), p_email
  );

  RETURN v_id;
END;
$$;


-- ── 2. profiles — qualquer admin pode criar e editar usuários ─────────────────

DROP POLICY IF EXISTS "pol_profiles_admin_insert" ON public.profiles;
CREATE POLICY "pol_profiles_admin_insert"
  ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (is_admin() = TRUE);

DROP POLICY IF EXISTS "pol_profiles_admin_update" ON public.profiles;
CREATE POLICY "pol_profiles_admin_update"
  ON public.profiles FOR UPDATE TO authenticated
  USING  (is_admin() = TRUE)
  WITH CHECK (is_admin() = TRUE);


-- ── 3. carretas ───────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "pol_carretas_insert" ON public.carretas;
CREATE POLICY "pol_carretas_insert"
  ON public.carretas FOR INSERT TO authenticated
  WITH CHECK (is_admin() = TRUE);

DROP POLICY IF EXISTS "pol_carretas_update" ON public.carretas;
CREATE POLICY "pol_carretas_update"
  ON public.carretas FOR UPDATE TO authenticated
  USING  (is_admin() = TRUE)
  WITH CHECK (is_admin() = TRUE);


-- ── 4. cavalos ────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "pol_cavalos_insert" ON public.cavalos;
CREATE POLICY "pol_cavalos_insert"
  ON public.cavalos FOR INSERT TO authenticated
  WITH CHECK (is_admin() = TRUE);

DROP POLICY IF EXISTS "pol_cavalos_update" ON public.cavalos;
CREATE POLICY "pol_cavalos_update"
  ON public.cavalos FOR UPDATE TO authenticated
  USING  (is_admin() = TRUE)
  WITH CHECK (is_admin() = TRUE);


-- ── 5. viagens ────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "admin_total cria viagens"     ON public.viagens;
DROP POLICY IF EXISTS "admin_total atualiza viagens" ON public.viagens;

CREATE POLICY "admin cria viagens"
  ON public.viagens FOR INSERT TO authenticated
  WITH CHECK (is_admin());

CREATE POLICY "admin atualiza viagens"
  ON public.viagens FOR UPDATE TO authenticated
  USING  (is_admin())
  WITH CHECK (is_admin());


-- ── 6. tarefas ────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "admin_total cria tarefas"     ON public.tarefas;
DROP POLICY IF EXISTS "admin_total atualiza tarefas" ON public.tarefas;

CREATE POLICY "admin cria tarefas"
  ON public.tarefas FOR INSERT TO authenticated
  WITH CHECK (is_admin());

CREATE POLICY "admin atualiza tarefas"
  ON public.tarefas FOR UPDATE TO authenticated
  USING  (is_admin())
  WITH CHECK (is_admin());


-- ── 7. conferencia_itens ──────────────────────────────────────────────────────

DROP POLICY IF EXISTS "admin_total gerencia conf_itens" ON public.conferencia_itens;
CREATE POLICY "admin gerencia conf_itens"
  ON public.conferencia_itens FOR ALL TO authenticated
  USING  (is_admin())
  WITH CHECK (is_admin());


-- ── 8. anomalias ──────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "admin_total insere anomalias" ON public.anomalias;
CREATE POLICY "admin insere anomalias"
  ON public.anomalias FOR INSERT TO authenticated
  WITH CHECK (is_admin());


-- ── 9. storage — fotos de anomalias ──────────────────────────────────────────

DROP POLICY IF EXISTS "admin_total upload anomalias fotos" ON storage.objects;
CREATE POLICY "admin upload anomalias fotos"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'anomalias-fotos' AND is_admin());

DROP POLICY IF EXISTS "admin_total update anomalias fotos" ON storage.objects;
CREATE POLICY "admin update anomalias fotos"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'anomalias-fotos' AND is_admin());


-- ── 10. portaria_atendimentos ─────────────────────────────────────────────────

DROP POLICY IF EXISTS "admin_total gerencia portaria_atendimentos" ON public.portaria_atendimentos;
CREATE POLICY "admin gerencia portaria_atendimentos"
  ON public.portaria_atendimentos FOR ALL TO authenticated
  USING  (is_admin())
  WITH CHECK (is_admin());


-- ── 11. manutencoes_carretas ──────────────────────────────────────────────────

DROP POLICY IF EXISTS "pol_manutencoes_insert" ON public.manutencoes_carretas;
CREATE POLICY "pol_manutencoes_insert"
  ON public.manutencoes_carretas FOR INSERT TO authenticated
  WITH CHECK (is_admin() = TRUE);

DROP POLICY IF EXISTS "pol_manutencoes_update" ON public.manutencoes_carretas;
CREATE POLICY "pol_manutencoes_update"
  ON public.manutencoes_carretas FOR UPDATE TO authenticated
  USING  (is_admin() = TRUE)
  WITH CHECK (is_admin() = TRUE);


-- ── 12. manutencoes_cavalos ───────────────────────────────────────────────────

DROP POLICY IF EXISTS "pol_man_cavalos_insert" ON public.manutencoes_cavalos;
CREATE POLICY "pol_man_cavalos_insert"
  ON public.manutencoes_cavalos FOR INSERT TO authenticated
  WITH CHECK (is_admin() = TRUE);

DROP POLICY IF EXISTS "pol_man_cavalos_update" ON public.manutencoes_cavalos;
CREATE POLICY "pol_man_cavalos_update"
  ON public.manutencoes_cavalos FOR UPDATE TO authenticated
  USING  (is_admin() = TRUE)
  WITH CHECK (is_admin() = TRUE);


-- ── 13. produtos_catalogo ─────────────────────────────────────────────────────

DROP POLICY IF EXISTS "pol_produtos_insert" ON public.produtos_catalogo;
CREATE POLICY "pol_produtos_insert"
  ON public.produtos_catalogo FOR INSERT TO authenticated
  WITH CHECK (is_admin());

DROP POLICY IF EXISTS "pol_produtos_update" ON public.produtos_catalogo;
CREATE POLICY "pol_produtos_update"
  ON public.produtos_catalogo FOR UPDATE TO authenticated
  USING  (is_admin())
  WITH CHECK (is_admin());

DROP POLICY IF EXISTS "pol_produtos_delete" ON public.produtos_catalogo;
CREATE POLICY "pol_produtos_delete"
  ON public.produtos_catalogo FOR DELETE TO authenticated
  USING (is_admin());


-- ── 14. RPC: admin_reverter_status_viagem ─────────────────────────────────────

CREATE OR REPLACE FUNCTION public.admin_reverter_status_viagem(
  p_viagem_id     UUID,
  p_target_status TEXT
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_status_atual TEXT;
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  IF p_target_status NOT IN ('em_transito', 'na_fabrica') THEN
    RAISE EXCEPTION 'Status alvo inválido. Valores aceitos: em_transito, na_fabrica';
  END IF;

  SELECT status INTO v_status_atual
  FROM public.viagens WHERE id = p_viagem_id;

  IF v_status_atual IS NULL THEN
    RAISE EXCEPTION 'Viagem não encontrada';
  END IF;

  IF v_status_atual NOT IN ('na_fabrica', 'retornando') THEN
    RAISE EXCEPTION 'Não é possível reverter viagem com status "%". Apenas na_fabrica e retornando são revertíveis.', v_status_atual;
  END IF;

  IF v_status_atual = 'na_fabrica' AND p_target_status = 'na_fabrica' THEN
    RAISE EXCEPTION 'Viagem já está no status na_fabrica';
  END IF;

  IF p_target_status = 'na_fabrica' THEN
    UPDATE public.viagens
      SET status           = 'na_fabrica',
          dt_saida_fabrica = NULL
    WHERE id = p_viagem_id;
  ELSIF p_target_status = 'em_transito' THEN
    UPDATE public.viagens
      SET status             = 'em_transito',
          dt_chegada_fabrica = NULL,
          dt_saida_fabrica   = NULL
    WHERE id = p_viagem_id;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_reverter_status_viagem(UUID, TEXT) TO authenticated;


-- ── 15. RPC: admin_atualizar_horario_agendado ─────────────────────────────────

CREATE OR REPLACE FUNCTION public.admin_atualizar_horario_agendado(
  p_viagem_id    UUID,
  p_novo_horario TEXT
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_horario_anterior TEXT;
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  SELECT horario_agendado INTO v_horario_anterior
  FROM public.viagens WHERE id = p_viagem_id;

  INSERT INTO public.viagens_horario_log (viagem_id, horario_anterior, horario_novo, admin_id)
  VALUES (p_viagem_id, v_horario_anterior, NULLIF(TRIM(p_novo_horario), ''), auth.uid());

  UPDATE public.viagens
    SET horario_agendado = NULLIF(TRIM(p_novo_horario), '')
  WHERE id = p_viagem_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_atualizar_horario_agendado(UUID, TEXT) TO authenticated;


-- ── 16. RPC: registrar_manutencao (carretas) ──────────────────────────────────

CREATE OR REPLACE FUNCTION public.registrar_manutencao(
  p_carreta_id   UUID,
  p_tipo         TEXT,
  p_motivo       TEXT,
  p_observacoes  TEXT,
  p_dt_entrada   TIMESTAMPTZ,
  p_furo_puxada  BOOLEAN DEFAULT FALSE
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_id UUID;
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'Acesso negado'; END IF;

  IF EXISTS (
    SELECT 1 FROM public.manutencoes_carretas
    WHERE carreta_id = p_carreta_id AND status = 'em_manutencao'
  ) THEN
    RAISE EXCEPTION 'Carreta já possui manutenção ativa';
  END IF;

  INSERT INTO public.manutencoes_carretas (
    carreta_id, tipo, motivo, observacoes, responsavel_id, dt_entrada, furo_puxada
  ) VALUES (
    p_carreta_id, p_tipo, p_motivo, p_observacoes, auth.uid(), p_dt_entrada, p_furo_puxada
  )
  RETURNING id INTO v_id;

  UPDATE public.carretas SET em_manutencao = TRUE WHERE id = p_carreta_id;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.registrar_manutencao(UUID, TEXT, TEXT, TEXT, TIMESTAMPTZ, BOOLEAN) TO authenticated;


-- ── 17. RPC: dar_baixa_manutencao (carretas) ──────────────────────────────────

CREATE OR REPLACE FUNCTION public.dar_baixa_manutencao(
  p_manutencao_id UUID
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_carreta_id UUID;
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'Acesso negado'; END IF;

  UPDATE public.manutencoes_carretas
    SET status = 'finalizada', dt_retorno = NOW()
  WHERE id = p_manutencao_id AND status = 'em_manutencao'
  RETURNING carreta_id INTO v_carreta_id;

  IF v_carreta_id IS NULL THEN
    RAISE EXCEPTION 'Manutenção não encontrada ou já finalizada';
  END IF;

  UPDATE public.carretas SET em_manutencao = FALSE WHERE id = v_carreta_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.dar_baixa_manutencao(UUID) TO authenticated;


-- ── 18. RPC: registrar_manutencao_cavalo ──────────────────────────────────────

CREATE OR REPLACE FUNCTION public.registrar_manutencao_cavalo(
  p_cavalo_id    UUID,
  p_tipo         TEXT,
  p_motivo       TEXT,
  p_observacoes  TEXT,
  p_dt_entrada   TIMESTAMPTZ
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_id UUID;
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'Acesso negado'; END IF;

  IF EXISTS (
    SELECT 1 FROM public.manutencoes_cavalos
    WHERE cavalo_id = p_cavalo_id AND status = 'em_manutencao'
  ) THEN
    RAISE EXCEPTION 'Cavalo já possui manutenção ativa';
  END IF;

  INSERT INTO public.manutencoes_cavalos (
    cavalo_id, tipo, motivo, observacoes, responsavel_id, dt_entrada
  ) VALUES (
    p_cavalo_id, p_tipo, p_motivo, p_observacoes, auth.uid(), p_dt_entrada
  )
  RETURNING id INTO v_id;

  UPDATE public.cavalos SET em_manutencao = TRUE WHERE id = p_cavalo_id;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.registrar_manutencao_cavalo(UUID, TEXT, TEXT, TEXT, TIMESTAMPTZ) TO authenticated;


-- ── 19. RPC: dar_baixa_manutencao_cavalo ──────────────────────────────────────

CREATE OR REPLACE FUNCTION public.dar_baixa_manutencao_cavalo(
  p_manutencao_id UUID
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_cavalo_id UUID;
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'Acesso negado'; END IF;

  UPDATE public.manutencoes_cavalos
    SET status = 'finalizada', dt_retorno = NOW()
  WHERE id = p_manutencao_id AND status = 'em_manutencao'
  RETURNING cavalo_id INTO v_cavalo_id;

  IF v_cavalo_id IS NULL THEN
    RAISE EXCEPTION 'Manutenção não encontrada ou já finalizada';
  END IF;

  UPDATE public.cavalos SET em_manutencao = FALSE WHERE id = v_cavalo_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.dar_baixa_manutencao_cavalo(UUID) TO authenticated;


-- ── 20. get_painel_viagens: adiciona todas_unidades ao filtro ─────────────────
-- Antes: apenas acesso_total via mp.acesso_total = true via viagens por unidade
-- Agora: admins com todas_unidades=true também veem todas as viagens
-- (equivalente ao acesso_total para fins do painel)

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
          'status',       p.status
        ) ORDER BY p.status ASC, p.descricao ASC
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
      WHERE ps.viagem_id = v.id AND ps.status = 'cancelado'
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
