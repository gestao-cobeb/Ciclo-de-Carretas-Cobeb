# COBEB Ciclo de Carretas

Acompanhamento das viagens (React + Vite, Supabase, app Android com Capacitor).
O contexto de operação e as armadilhas conhecidas estão no `CLAUDE.md`.

## Como atualizar o xlsx (SheetJS)

O pacote `xlsx` (SheetJS), usado para ler as planilhas da tela `/importacao` e
gerar as exportações (Dados, Dashboard Comercial, Importação), **não vem do
npm**. O npm parou na 0.18.5, que tem falhas de segurança conhecidas; as
versões corrigidas só são publicadas no CDN oficial: <https://cdn.sheetjs.com>.

Por isso, no `package.json`, o `xlsx` aponta para a URL do arquivo `.tgz`, e
não para um número de versão.

Para atualizar:

1. Veja a versão mais nova em <https://cdn.sheetjs.com> e instale pela URL
   (troque `X.Y.Z` pela versão):

   ```bash
   npm install https://cdn.sheetjs.com/xlsx-X.Y.Z/xlsx-X.Y.Z.tgz
   ```

2. Confira no `package-lock.json` que a entrada `node_modules/xlsx` tem o
   `resolved` apontando para `https://cdn.sheetjs.com/...` e um `integrity`
   `sha512-...` preenchido.
3. Rode o build: `npm run build`.
4. Teste a importação: abra `/importacao` e importe as cinco planilhas (BASE,
   Produtos, Preços, Demanda e De-Para Zero) **num banco de teste**, nunca no
   de produção; confira também que os botões de baixar geram arquivos que
   abrem.

⚠ **O Dependabot não avisa versões novas do xlsx**, porque o pacote não está no
npm. Confira o site do SheetJS (<https://cdn.sheetjs.com>) de tempos em tempos.
