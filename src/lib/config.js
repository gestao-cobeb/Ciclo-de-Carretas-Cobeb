/**
 * De onde o app descobre COM QUAL SERVIDOR ele fala.
 *
 * Antes, o endereço do Supabase era `import.meta.env.VITE_SUPABASE_URL` — uma
 * constante resolvida na COMPILAÇÃO. Ela virava parte do APK, e trocar de
 * servidor exigia que cada motorista instalasse uma versão nova. Como APK
 * instalado à mão não se atualiza sozinho, a troca criaria um período em que
 * um caminhão grava num banco e outro grava noutro.
 *
 * Agora o endereço é lido em TEMPO DE EXECUÇÃO, de um `config.json`. Mudar de
 * servidor passa a ser editar um arquivo — e voltar atrás, editar de novo.
 *
 * ## Por que a URL de origem é absoluta no aplicativo nativo
 *
 * No navegador, `fetch('config.json')` cai no mesmo servidor que serviu a
 * página — é o que se quer. **No APK, não**: o WebView serve os arquivos de
 * dentro do próprio pacote, então o `fetch` relativo leria o `config.json`
 * EMPACOTADO, que é exatamente a constante de compilação que estamos tirando
 * do caminho. O motorista ficaria preso ao endereço antigo e ninguém veria.
 *
 * Por isso o nativo pergunta a um endereço ABSOLUTO (`VITE_CONFIG_URL`), que é
 * o portal da Cobeb. Continua havendo um endereço compilado — mas é o do
 * portal, que é da Cobeb e não muda, em vez do de um fornecedor.
 *
 * ## A ordem de preferência, e por que ela é essa
 *
 *   1. o que o servidor respondeu agora;
 *   2. senão, o último que ele já respondeu (guardado no aparelho);
 *   3. senão, o que foi compilado.
 *
 * O passo 2 é o que salva o motorista sem sinal: sem ele, um celular em área
 * morta cairia no valor compilado — que, depois da migração, é o servidor
 * ANTIGO. Ele gravaria a viagem no lugar errado, com o app funcionando
 * normalmente e nada denunciando.
 */
const GUARDADO = "cobeb_ciclo_config"

/** O que foi compilado. É o último recurso, nunca o primeiro. */
const DO_BUILD = {
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL,
  supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY,
}

/** Onde perguntar. Relativo no navegador; absoluto no APK. Ver o cabeçalho. */
function origem() {
  const nativo = window.Capacitor?.isNativePlatform?.() === true
  const absoluta = import.meta.env.VITE_CONFIG_URL
  if (nativo) return absoluta || null
  return absoluta || `${import.meta.env.VITE_BASE_URL ?? "/"}config.json`.replace("//", "/")
}

let atual = DO_BUILD

/** Só aceita o que serve: sem endereço ou sem chave, a resposta é descartada. */
function valida(c) {
  return !!(c && typeof c.supabaseUrl === "string" && c.supabaseUrl.startsWith("http")
            && typeof c.supabaseAnonKey === "string" && c.supabaseAnonKey.length > 20)
}

/**
 * Busca a configuração. Chamada UMA vez, antes de a tela subir.
 *
 * Nunca levanta: o app tem que abrir mesmo sem rede, e a decisão de qual
 * endereço usar já está resolvida pela ordem de preferência acima.
 */
export async function carregarConfig({ timeoutMs = 6000 } = {}) {
  const de = origem()
  if (de) {
    try {
      const corta = new AbortController()
      const t = setTimeout(() => corta.abort(), timeoutMs)
      const r = await fetch(`${de}?t=${Date.now()}`, { cache: "no-store", signal: corta.signal })
      clearTimeout(t)
      if (r.ok) {
        const c = await r.json()
        if (valida(c)) {
          atual = { supabaseUrl: c.supabaseUrl, supabaseAnonKey: c.supabaseAnonKey }
          try { localStorage.setItem(GUARDADO, JSON.stringify(atual)) } catch { /* modo privado */ }
          return atual
        }
        console.warn("[config] resposta do servidor incompleta — usando a anterior")
      }
    } catch (e) {
      // Sem rede, sem DNS, tempo esgotado. Não é erro fatal: há dois degraus
      // abaixo. Mas SAI NO CONSOLE -- engolir isto em silêncio é como o app do
      // Alô ficou dois meses em branco.
      console.warn("[config] não consegui buscar a configuração:", e?.message ?? e)
    }
  }
  try {
    const g = JSON.parse(localStorage.getItem(GUARDADO) ?? "null")
    if (valida(g)) { atual = g; return atual }
  } catch { /* ignora */ }
  atual = DO_BUILD
  return atual
}

/** A configuração em vigor. Só depois do `carregarConfig`. */
export function config() {
  return atual
}
