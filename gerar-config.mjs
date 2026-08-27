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

if (!existsSync("dist")) mkdirSync("dist", { recursive: true })
writeFileSync("dist/config.json", JSON.stringify({
  _leia: "Diz ao aplicativo com qual servidor ele fala. Editar e recarregar troca de "
       + "servidor, sem recompilar nem reinstalar. Ver src/lib/config.js.",
  supabaseUrl: url,
  supabaseAnonKey: key,
}, null, 2) + "\n")

console.log(`[gerar-config] dist/config.json -> ${new URL(url).host}`)
