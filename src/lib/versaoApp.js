// Versão atual do APK — manter sincronizado com android/app/build.gradle (versionName)
export const VERSAO_APP = '1.0.40'

// Endereço PERMANENTE do APK mais novo: o nome do arquivo é fixo em toda release
// (`cobeb-ciclo.apk`, ver build-apk.yml), então este link nunca fica velho.
// Usado pela tela de atualização obrigatória (GateAtualizacao).
export const URL_APK_LATEST =
  'https://github.com/gestao-cobeb/Ciclo-de-Carretas-Cobeb/releases/latest/download/cobeb-ciclo.apk'

// Compara versões "x.y.z" por segmento numérico: versaoMenor('1.0.39','1.0.40') === true.
// Entrada inválida/ausente devolve false (fail-open: nunca bloqueia por dúvida).
export function versaoMenor(atual, minima) {
  if (!atual || !minima) return false
  const a = String(atual).split('.').map(n => parseInt(n, 10) || 0)
  const b = String(minima).split('.').map(n => parseInt(n, 10) || 0)
  const len = Math.max(a.length, b.length)
  for (let i = 0; i < len; i++) {
    const x = a[i] ?? 0
    const y = b[i] ?? 0
    if (x < y) return true
    if (x > y) return false
  }
  return false
}
