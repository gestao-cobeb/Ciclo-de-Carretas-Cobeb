/**
 * Escreve o `dist/config.json` a partir das MESMAS variáveis que o build usa.
 *
 * Sem isto haveria duas fontes da verdade — o valor compilado e um arquivo
 * escrito à mão — e elas divergiriam no primeiro dia em que alguém trocasse
 * uma só. O app leria uma e o build teria embutido a outra, sem nada avisar.
 *
 * O arquivo gerado é o PADRÃO: aponta para onde o build apontaria. Na VM ele é
 * substituído por um volume para trocar de servidor sem recompilar. Ver
 * `src/lib/config.js`.
 */
import { writeFileSync, existsSync, mkdirSync } from "node:fs"

const url = process.env.VITE_SUPABASE_URL ?? ""
const key = process.env.VITE_SUPABASE_ANON_KEY ?? ""

if (!url || !key) {
  // Falhar aqui é melhor que publicar um config.json vazio: o app cairia no
  // valor compilado (que também estaria vazio) e a tela abriria sem conseguir
  // falar com nada — sintoma difuso, causa distante.
  console.error(
    "\n[gerar-config] Faltam VITE_SUPABASE_URL e/ou VITE_SUPABASE_ANON_KEY.\n" +
    "               Sem elas o app sobe sem servidor. Defina no ambiente do build.\n")
  process.exit(1)
}

/**
 * O APK PRECISA de um endereço absoluto — e sem ele a falha é invisível.
 *
 * No navegador, `fetch("config.json")` cai no servidor que serviu a página, que
 * é o que se quer. No aplicativo nativo, NÃO: o WebView serve os arquivos de
 * dentro do próprio pacote, então o `fetch` relativo lê o `config.json`
 * EMPACOTADO — exatamente a constante de compilação que este mecanismo existe
 * para tirar do caminho.
 *
 * Sem `VITE_CONFIG_URL`, o app do motorista fica preso ao servidor gravado no
 * APK e **ninguém vê**: a tela abre, o login funciona, e tudo parece normal.
 * O defeito só aparece no dia da virada, e aparece do pior jeito possível —
 * um caminhão gravando no banco novo e outro no antigo, sem nada na tela
 * dizendo qual é qual.
 *
 * Por isso o build do Android PARA aqui. Faltar a variável é problema de
 * configuração; descobrir isso depois de o APK estar na mão dos motoristas é
 * problema de dado.
 */
if (process.env.VITE_BUILD_TARGET === "android") {
  const alvo = process.env.VITE_CONFIG_URL ?? ""
  if (!alvo.startsWith("http")) {
    console.error(
      "\n[gerar-config] Build do ANDROID sem VITE_CONFIG_URL absoluta.\n" +
      `               Valor recebido: ${alvo ? `"${alvo}"` : "(vazio)"}\n` +
      "               Ela diz ao APK a que endereco perguntar com qual servidor\n" +
      "               falar, e precisa comecar com http. Sem ela o aplicativo le\n" +
      "               o config.json EMPACOTADO e fica preso ao servidor antigo,\n" +
      "               sem nenhum sinal na tela.\n" +
      "               Defina o secret VITE_CONFIG_URL no repositorio.\n")
    process.exit(1)
  }
}

if (!existsSync("dist")) mkdirSync("dist", { recursive: true })
writeFileSync("dist/config.json", JSON.stringify({
  _leia: "Diz ao aplicativo com qual servidor ele fala. Editar e recarregar troca de "
       + "servidor, sem recompilar nem reinstalar. Ver src/lib/config.js.",
  supabaseUrl: url,
  supabaseAnonKey: key,
}, null, 2) + "\n")

console.log(`[gerar-config] dist/config.json -> ${new URL(url).host}`)
