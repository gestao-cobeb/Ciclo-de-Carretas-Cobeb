-- ================================================================
-- COBEB CICLO DE CARRETAS
-- Script: 054 — Fecha o bucket de fotos de anomalias
-- Executar no Supabase Studio > SQL Editor
-- ================================================================
--
-- O bucket `anomalias-fotos` era PÚBLICO. Duas coisas o deixavam assim, e as
-- duas precisam ser desfeitas -- mexer só numa não fecha nada:
--
--   1. `storage.buckets.public = true`. Num bucket público o Supabase serve
--      `/storage/v1/object/public/...` SEM CONSULTAR POLÍTICA NENHUMA. Ou seja:
--      apagar a política e deixar o bucket público não muda absolutamente nada,
--      e a leitura ficaria aberta com a tela do Studio mostrando as políticas
--      "certas" ao lado.
--   2. a política `publico le fotos anomalias`, com `FOR SELECT TO public`
--      (`sql/016`), que abria a leitura também pelo caminho autenticado.
--
-- Quem tinha a URL abria a foto sem login, de fora da rede. E a URL é
-- previsível o bastante (`<tarefa>/<pasta>/frente.jpg`) para não depender de
-- sorte: bastava uma encaminhada para o padrão ficar claro.
--
-- ⚠ ORDEM DA PUBLICAÇÃO: o app tem que subir ANTES deste script.
--
-- A tela passou a pedir URL ASSINADA (`src/lib/fotos.js`), e assinatura
-- funciona nos dois casos -- em bucket público ela é só desnecessária. Então
-- com o app novo no ar e o bucket ainda público, nada quebra; rodando este
-- script antes do deploy, as fotos somem da tela até o app subir.
--
-- ⚠ NÃO REEXECUTAR O `016`: ele termina com `ON CONFLICT DO UPDATE SET
-- public = true` e reabriria o bucket em silêncio.
--
-- Para VOLTAR atrás: `UPDATE storage.buckets SET public = true WHERE id =
-- 'anomalias-fotos';` -- as URLs públicas antigas voltam a funcionar na hora, e
-- o app continua funcionando porque a assinatura vale nos dois casos.
-- ================================================================

-- 1. O bucket deixa de ser público. É esta linha que fecha de verdade.
UPDATE storage.buckets
   SET public = false
 WHERE id = 'anomalias-fotos';

-- 2. Some a leitura anônima.
DROP POLICY IF EXISTS "publico le fotos anomalias" ON storage.objects;

-- 3. E entra a leitura de quem está autenticado.
--
-- `TO authenticated` e não uma lista de perfis, de propósito: o buraco que este
-- script fecha é o acesso SEM LOGIN, e é ele que precisa sumir hoje. Restringir
-- também por perfil (conferente/admin) é um segundo passo, que só vale depois
-- de confirmar na tela quem abre a aba de Anomalias -- um predicado errado aqui
-- deixaria a página cheia de traços, e o custo de errar é maior que o ganho.
--
-- Escrever continua sendo de conferente e admin_total (`sql/005`, `sql/016`,
-- `sql/030`): este script não afrouxa nada.
DROP POLICY IF EXISTS "autenticados leem fotos anomalias" ON storage.objects;
CREATE POLICY "autenticados leem fotos anomalias"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'anomalias-fotos');

-- ── Conferência, para rodar logo depois ──────────────────────────────────────
-- Espera-se: public = false, e nenhuma linha com roles contendo 'anon'/'public'
-- para este bucket.
--
--   SELECT id, public FROM storage.buckets WHERE id = 'anomalias-fotos';
--
--   SELECT polname, polroles::regrole[], polcmd
--     FROM pg_policy
--    WHERE polrelid = 'storage.objects'::regclass
--      AND polname ILIKE '%anomalias%';
