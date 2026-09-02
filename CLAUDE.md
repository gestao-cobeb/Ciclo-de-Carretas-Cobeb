# Contexto operacional (leia antes de qualquer mudança)

Este repositório não tinha CLAUDE.md até 02/09/2026 — e é o único dos sistemas
da Cobeb em desenvolvimento ativo que estava sem. O que está escrito aqui foi
tirado dos **próprios arquivos do projeto** (o `docker-compose.yml`, os dois
workflows, o `package.json`) e dos commits recentes. Onde eu não pude conferir,
está dito que não pude — anotação que finge certeza é pior que anotação
faltando.

## O que é

**COBEB Ciclo de Carretas** — o acompanhamento das viagens: tarefas, tempos,
NRI, mapa. React + Vite, com **Supabase na nuvem** como banco, e um aplicativo
Android empacotado com Capacitor.

⚠ **Não confundir com o repositório `cobeb-ciclo-php`.** São projetos
**diferentes**, não duas cópias do mesmo: aquele é PHP com MariaDB dentro da VM,
na porta 8130; este é React com Supabase, na 8140. O aviso está escrito também
no topo do `docker-compose.yml` daqui.

## ⚠ Este sistema é publicado em TRÊS lugares, com regras diferentes

É a armadilha mais cara deste repositório, porque "eu subi e não mudou" tem três
causas possíveis e elas não se parecem:

| onde | o que dispara | quem confere |
|---|---|---|
| **GitHub Pages** | `push` no `main` — **sozinho**, pelo `deploy.yml` | ninguém: é automático |
| **VM da Cobeb** (`172.16.3.247`, porta 8140, nginx em container) | **um clique em Git deploy** no dockhand | alguém tem que clicar |
| **APK Android** | uma **tag** `v*` (`git tag v1.0.0 && git push --tags`) | só sai em tag |

Então: mesclar no `main` publica **o Pages** e não publica a VM. E nenhum dos
dois gera APK novo — quem está com o aplicativo instalado continua com a versão
da última tag até alguém publicar outra.

- ⚠ **`pull_policy: build` no compose não pode sair.** Sem ela o Git deploy do
  dockhand **mente**: o `docker compose up -d` vê que a imagem `:latest` já
  existe e que o compose não mudou, e não faz nada — sem erro, sem aviso, sem
  uma linha de log, porque container novo nenhum subiu. **Foi neste stack que
  isso foi medido** (27/08/2026): três deploys seguidos e o uptime parado em 51
  minutos. Hoje a trava está nos onze serviços da casa; ela nasceu aqui.
- O banco é o **Supabase, na nuvem** — por isso não há container de banco, e por
  isso a VM não guarda dado nenhum deste sistema. O backup dele é o
  `BANCOS_PGEXT` do container de backup, e a URL do Supabase **exige**
  `?sslmode=require` (o espelho exato do `?sslmode=disable` que o Postgres da
  Cobeb exige — trocar um pelo outro dá erro que fala de autenticação e manda
  procurar senha errada).

## O que os defeitos deste sistema têm em comum

Os três corrigidos em 02/09/2026 são a **mesma família**, e vale conhecê-la
antes de mexer em qualquer geração de documento:

- **`gr.codigo.trim()` estourava** quando `cod_produto` vinha `null` do banco —
  e o `TypeError` acontecia **fora** do `try/catch` do `gerarPDF`. Resultado:
  Promise rejeitada em silêncio, **sem alerta e sem PDF**. Quem clicou não viu
  nada acontecer e não tinha como saber por quê.
- **O `INSERT` em `nri_emissoes` não conferia o erro**: `numero_nf: null`
  violava um `NOT NULL` e a falha passava calada.
- **Quantidade fracionária de paletes** (chopp, 0,3 plt) gerava contagens como
  `0,89...` e o RPC `get_next_nri_batch` espera `INT` — a geração do PDF
  **silenciava**. A correção é `Math.ceil` **na fonte e em todos os pontos de
  cálculo**; corrigir só um lugar deixa o defeito vivo noutro caminho.

A lição, que vale para o próximo: **nesta tela, falha vira "não aconteceu
nada"**. Toda geração de documento precisa ou mostrar o erro, ou não existir —
erro tratado em silêncio aqui custa o dobro, porque o usuário conclui que o
botão não funciona e para de usá-lo.

## Ao mexer

- `npm run build` roda o Vite **e** o `gerar-config.mjs` — o build não termina
  no `vite build`, e rodar só ele deixa a configuração velha no ar.
- `npm run build:android` é o mesmo com `VITE_BUILD_TARGET=android` mais o
  `cap sync`; o APK de verdade sai pelo workflow, na tag.
- `postinstall` roda `patch-package`: há patches em `patches/`, então
  `npm install` (e não só `npm ci`) importa para eles serem aplicados.
- O `vercel.json` reescreve tudo para `/` — é uma SPA, e sem isso qualquer rota
  aberta direto devolve 404.

## O que este arquivo NÃO cobre (e eu não inventei)

Não estudei as regras de negócio do sistema — NRI, o cálculo dos tempos, o
vínculo tarefa × viagem, a geolocalização em segundo plano do Capacitor. Quem
mexer nisso e aprender algo que custou tempo, escreva aqui: é assim que os
outros seis CLAUDE.md da casa ficaram úteis.

## Comunicação com o Lucas

Resumos em português simples, sem jargão: o quê / impacto / tempo. Ele decide;
você propõe.
