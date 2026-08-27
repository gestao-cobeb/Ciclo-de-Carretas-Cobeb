#!/bin/sh
# Escreve o `config.json` na subida, se — e SÓ SE — houver variável de execução.
#
# O `config.json` diz ao aplicativo com qual servidor ele fala. Ele já vem
# pronto dentro da imagem, gerado no build a partir das mesmas variáveis do
# `npm run build`. Este script existe para o dia em que esse endereço precisar
# mudar SEM reconstruir a imagem -- que é o dia da migração para o Supabase da
# rede.
#
# ## Por que variável, e não um arquivo montado por volume
#
# A primeira versão montava um `config.json` do host. Duas coisas contra:
#
#   1. Se o arquivo não existisse no host, o Docker criava uma PASTA com aquele
#      nome, e o nginx servia um diretório no lugar do JSON. A tela abria sem
#      falar com servidor nenhum, e a causa não estava em lugar nenhum do log.
#   2. Trocar o endereço exigia editar arquivo na VM. Quem opera esta VM
#      trabalha pelo dockhand, no navegador -- e o dia de descobrir que não há
#      SSH à mão não pode ser o domingo da virada.
#
# Com variável, a troca é editar um campo no dockhand e reiniciar. O container
# é nginx servindo estático: a subida leva segundos, e voltar atrás é apagar o
# campo.
#
# ## Sem variável, nada muda
#
# É de propósito que a ausência não seja erro: o arquivo do build já está lá e
# aponta para onde o build apontava. Configuração de execução aqui é EXCEÇÃO,
# e exceção que precisa ser preenchida para o sistema funcionar como antes é
# armadilha para quem sobe o stack pela primeira vez.
set -e

ALVO=/usr/share/nginx/html/config.json

if [ -n "${SUPABASE_URL:-}" ] && [ -n "${SUPABASE_ANON_KEY:-}" ]; then
  cat > "$ALVO" <<JSON
{
  "_leia": "Escrito na subida do container a partir de SUPABASE_URL e SUPABASE_ANON_KEY. Para voltar ao endereço do build, apague as duas variáveis e reinicie.",
  "supabaseUrl": "${SUPABASE_URL}",
  "supabaseAnonKey": "${SUPABASE_ANON_KEY}"
}
JSON
  echo "[config] servidor por VARIAVEL DE EXECUCAO -> ${SUPABASE_URL}"
elif [ -n "${SUPABASE_URL:-}" ] || [ -n "${SUPABASE_ANON_KEY:-}" ]; then
  # Uma sem a outra é sempre engano, e o resultado seria um app apontado para o
  # servidor novo com a chave do antigo -- que falha na autenticação e manda
  # procurar o problema no lugar errado. Melhor não escrever nada e dizer.
  echo "[config] AVISO: SUPABASE_URL e SUPABASE_ANON_KEY andam juntas." >&2
  echo "[config]        So uma foi preenchida -- IGNORANDO as duas." >&2
  echo "[config] servidor pelo arquivo do build (nada mudou)"
else
  echo "[config] servidor pelo arquivo do build"
fi

# ⚠ Devolve o controle ao entrypoint DA IMAGEM, e não direto ao `nginx`.
#
# A imagem oficial do nginx tem o próprio `/docker-entrypoint.sh`, que roda os
# scripts de `/docker-entrypoint.d/` antes de subir: o IPv6 por padrão, o
# resolver local, o `envsubst` nos templates e o ajuste do número de workers
# pela CPU do container.
#
# Chamando `exec nginx` direto, tudo isso deixa de acontecer -- e não aparece
# como erro em lugar nenhum: o site sobe, responde, e roda com a configuração
# de fábrica em vez da ajustada. Foi o que o log de 27/08/2026 mostrou pela
# ausência.
#
# O `if` é para o caso de o `CMD` vir vazio: a imagem base já traz
# `CMD ["nginx", "-g", "daemon off;"]`, e este entrypoint recebe isso em `$@`.
if [ "$#" -eq 0 ]; then set -- nginx -g "daemon off;"; fi
exec /docker-entrypoint.sh "$@"
