# COBEB Ciclo de Carretas — Guia de Migração para Servidor

**Versão do documento:** 1.0  
**Data:** Julho 2026  
**Responsável TI:** Infraestrutura COBEB  

---

## Visão Geral

A aplicação **COBEB Ciclo de Carretas** é um Progressive Web App (PWA) composto de:

| Camada | Tecnologia | Onde roda |
|---|---|---|
| Frontend (web) | React + Vite (arquivos estáticos) | **Servidor COBEB (IIS)** |
| Backend / Banco | Supabase (PostgreSQL na nuvem) | Supabase Cloud — **não migrar** |
| APK Android | Gerado via GitHub Actions | GitHub — **não migrar** |

> O Supabase e o repositório GitHub **permanecem inalterados**. Somente a hospedagem do frontend muda do GitHub Pages para o servidor COBEB.

---

## Pré-requisitos no Servidor Windows

Instalar na ordem abaixo:

### 1. Node.js (para build)
- Download: https://nodejs.org/en/download → versão LTS (22.x)
- Marcar opção "Add to PATH" durante instalação
- Verificar após instalar:
```
node -v   → deve retornar v22.x.x
npm -v    → deve retornar 10.x.x
```

### 2. Git (para clonar e atualizar)
- Download: https://git-scm.com/download/win
- Instalar com opções padrão

### 3. IIS (Internet Information Services)
- Painel de Controle → Programas → Ativar ou desativar recursos do Windows
- Habilitar: **Serviços de Informações da Internet**
  - Serviços da World Wide Web → Recursos de Desenvolvimento de Aplicativos → **Reescrita de URL**  
  _(instalar módulo URL Rewrite via https://www.iis.net/downloads/microsoft/url-rewrite)_

### 4. Certificado SSL
- O app **exige HTTPS** (GPS, câmera e notificações do navegador não funcionam sem)
- Opções:
  - Certificado corporativo emitido pela CA interna da COBEB (recomendado)
  - Let's Encrypt via win-acme se o servidor tiver IP público

---

## Arquivos e Credenciais Necessários

### Repositório (código-fonte)
```
URL GitHub: https://github.com/VictorHAS98/Ciclo-de-Carretas-Cobeb.git
Branch:     main
```

### Variáveis de Ambiente
Criar o arquivo `.env.local` na raiz do projeto com o conteúdo abaixo.  
**Manter este arquivo seguro — contém chaves de acesso ao banco de dados.**

```env
VITE_SUPABASE_URL=https://dbklyyyqyhzzcmhtzumn.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_uIvSlOuBa8To1gfZYEplgQ_1uqbLDU_
VITE_SUPABASE_SERVICE_ROLE_KEY=<COLE_AQUI_A_SERVICE_ROLE_KEY_DO_SUPABASE>
VITE_APK_URL=https://github.com/VictorHAS98/Ciclo-de-Carretas-Cobeb/releases/download/v1.0.25/cobeb-ciclo-v1.0.25.apk
VITE_BASE_URL=/
```

> `VITE_BASE_URL=/` é obrigatório para servidor próprio. No GitHub Pages era diferente.

---

## Instalação — Passo a Passo

### Etapa 1 — Clonar o repositório

Abrir **PowerShell como Administrador** e executar:

```powershell
cd "Z:\TI"
git clone https://github.com/VictorHAS98/Ciclo-de-Carretas-Cobeb.git "COBEB - CICLO"
cd "COBEB - CICLO"
```

### Etapa 2 — Criar arquivo de variáveis de ambiente

```powershell
# Criar o arquivo .env.local na raiz do projeto
# Copiar o conteúdo da seção "Variáveis de Ambiente" acima
notepad .env.local
```

### Etapa 3 — Instalar dependências

```powershell
npm ci
```

> `npm ci` instala exatamente as versões travadas no `package-lock.json`. Pode demorar 2–5 minutos.

### Etapa 4 — Gerar o build de produção

```powershell
npm run build
```

Isso gera a pasta `dist\` com todos os arquivos estáticos prontos para servir.  
O build leva aproximadamente 1–2 minutos.

### Etapa 5 — Configurar o IIS

**Criar o site no IIS:**

1. Abrir **Gerenciador do IIS**
2. Clique com botão direito em **Sites** → **Adicionar Site**
3. Preencher:
   - Nome do site: `cobeb-ciclo`
   - Caminho físico: `Z:\TI\COBEB - CICLO\dist`
   - Associação: HTTPS, porta 443
   - Nome do host: `cobeb-ciclo.cobeb.com.br`
   - Selecionar o certificado SSL

**Configurar reescrita de URL (necessário para o React Router):**

Criar o arquivo `Z:\TI\COBEB - CICLO\dist\web.config` com o conteúdo:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<configuration>
  <system.webServer>
    <rewrite>
      <rules>
        <rule name="SPA" stopProcessing="true">
          <match url=".*" />
          <conditions logicalGrouping="MatchAll">
            <add input="{REQUEST_FILENAME}" matchType="IsFile" negate="true" />
            <add input="{REQUEST_FILENAME}" matchType="IsDirectory" negate="true" />
          </conditions>
          <action type="Rewrite" url="/index.html" />
        </rule>
      </rules>
    </rewrite>
  </system.webServer>
</configuration>
```

### Etapa 6 — Configurar DNS interno

No servidor DNS da COBEB, criar entrada:
```
Tipo: A  
Nome: cobeb-ciclo  
Domínio: cobeb.com.br  
IP: <IP do servidor Windows>
```

### Etapa 7 — Verificar funcionamento

Acessar `https://cobeb-ciclo.cobeb.com.br` em um navegador e validar:
- [ ] Página de login carrega
- [ ] Login funciona (autenticação no Supabase)
- [ ] GPS funciona (requer HTTPS ativo)
- [ ] Botão de download do APK funciona

---

## Processo de Atualização (pós-deploy)

Quando houver atualização da aplicação, o desenvolvedor disponibilizará os arquivos alterados. O TI executa:

```powershell
cd "Z:\TI\COBEB - CICLO"

# 1. Atualizar código-fonte
git pull origin main

# 2. Atualizar dependências (se necessário)
npm ci

# 3. Rebuild
npm run build

# 4. O IIS serve automaticamente o novo dist\
#    Nenhuma reinicialização necessária
```

> Se o VITE_APK_URL mudar (nova versão do APK), atualizar o `.env.local` antes do `npm run build`.

---

## Estrutura de Diretórios no Servidor

```
Z:\TI\COBEB - CICLO\
├── dist\                  ← arquivos servidos pelo IIS (gerado pelo build)
│   ├── index.html
│   ├── assets\
│   └── web.config         ← criado manualmente (Etapa 5)
├── src\                   ← código-fonte (não servido)
├── .env.local             ← credenciais (não commitar, não compartilhar)
├── package.json
└── ...
```

---

## Observações Importantes

| Item | Detalhe |
|---|---|
| Supabase | Backend em nuvem — não requer migração |
| APK Android | Continua sendo gerado via GitHub Actions — não requer migração |
| GitHub Pages | Pode ser mantido em paralelo durante transição ou desativado após validação |
| `.env.local` | **Nunca** commitar no Git — contém chaves de acesso |
| Node.js no servidor | Necessário apenas para build — não fica rodando em produção |
| HTTPS | Obrigatório — GPS e câmera não funcionam em HTTP |

---

## Contato para Dúvidas

Responsável pelo desenvolvimento: **Victor Hugo**  
E-mail: `victor.soares@cobeb.com.br`
