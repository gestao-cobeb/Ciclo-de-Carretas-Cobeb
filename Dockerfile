# COBEB Ciclo de Carretas (React) — imagem de duas etapas: node constrói, nginx
# serve. O resultado é HTML/JS/CSS estático; o banco é o Supabase, na nuvem, e
# por isso NÃO há container de banco aqui.

# ─────────────────────────────────────────────────────────────────────────────
# Etapa 1: construir
# ─────────────────────────────────────────────────────────────────────────────
FROM node:22-alpine AS build

WORKDIR /app

# O `playwright` é devDependency e o instalador dele baixa navegadores (~400 MB)
# que este build não usa para nada. Sem esta linha, todo build da imagem baixa
# tudo de novo.
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

# O `postinstall` é `patch-package`, que lê a pasta `patches/`. Ela precisa
# existir ANTES do `npm ci` -- senão o postinstall não aplica remendo nenhum e
# não reclama, e o defeito aparece só em runtime, no comportamento remendado.
COPY package.json package-lock.json ./
COPY patches ./patches
RUN npm ci

COPY . .

# ⚠ ESTAS VARIÁVEIS SÃO DE BUILD, NÃO DE EXECUÇÃO. Não adianta pô-las no bloco
# `environment:` do compose.
#
# O Vite grava o valor DENTRO do JavaScript na hora de construir; o container do
# nginx só entrega arquivo pronto e não lê variável nenhuma. Mudar o Supabase
# exige RECONSTRUIR a imagem, não reiniciar o container.
#
# (É o espelho da armadilha do VITE_APP_ID do Volume Diário: lá o nome enganava
# porque quem lia era o servidor em execução. Aqui é o contrário, e por isso
# está escrito.)
ARG VITE_BASE_URL=/
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ARG VITE_ORS_API_KEY
ARG VITE_APK_URL

# ⚠ VITE_SUPABASE_SERVICE_ROLE_KEY NÃO entra aqui, de propósito.
#
# Ela ignora toda a segurança por linha (RLS) do Supabase, e tudo que tem
# prefixo VITE_ vai parar DENTRO do JavaScript que o navegador baixa -- ou seja,
# qualquer pessoa que abrisse a tela poderia ler e escrever o banco inteiro.
#
# Hoje nada a usa: o único arquivo que a lê é `src/lib/supabaseAdmin.js`, que
# ninguém importa (a migração `sql/013_funcoes_auth_rpc.sql` o substituiu por
# funções SECURITY DEFINER no banco), e o Vite não empacota arquivo sem uso.
# Não acrescentar sem apagar aquele arquivo antes.

# Falhar AQUI, no build, é o ponto: sem a chave o `npm run build` passa igual, e
# o defeito só aparece na tela do usuário, como página que não carrega nada.
RUN if [ -z "$VITE_SUPABASE_URL" ] || [ -z "$VITE_SUPABASE_ANON_KEY" ]; then \
        echo "ERRO: VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY sao obrigatorias." >&2; \
        echo "      Elas sao build args (--build-arg), nao variaveis de execucao." >&2; \
        echo "      Ver .env.docker.example." >&2; \
        exit 1; \
    fi \
    && npm run build

# ─────────────────────────────────────────────────────────────────────────────
# Etapa 2: servir
# ─────────────────────────────────────────────────────────────────────────────
FROM nginx:alpine

ENV TZ=America/Sao_Paulo
RUN ln -snf /usr/share/zoneinfo/$TZ /etc/localtime && echo $TZ > /etc/timezone

COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80
