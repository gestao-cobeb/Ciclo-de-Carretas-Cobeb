/**
 * As fotos de avaria — do que está guardado no banco até o `<img src>`.
 *
 * O bucket `anomalias-fotos` era PÚBLICO: qualquer pessoa com a URL abria a
 * foto sem login, de fora da rede. Não era descuido escondido — estava escrito
 * em `sql/016`, com a política `FOR SELECT TO public`. Só que "quem tem a URL"
 * inclui qualquer um que a receba encaminhada, e a URL é previsível o bastante
 * (`<tarefa>/<pasta>/frente.jpg`) para não depender de sorte.
 *
 * Agora o bucket é privado e cada exibição pede uma URL ASSINADA, válida por
 * uma hora. Quem não está autenticado não assina nada.
 *
 * ## Duas formas guardadas, e por que as duas continuam valendo
 *
 * As anomalias antigas guardaram a URL pública inteira; as novas guardam só o
 * CAMINHO. Reescrever as antigas seria uma migração de dados sobre centenas de
 * linhas para ganhar arrumação — e o caminho está dentro da URL, então ler as
 * duas custa uma linha. `caminhoDaFoto` é essa linha.
 *
 * O que NÃO se faz é continuar guardando a URL pública: ela deixou de
 * funcionar, e um endereço guardado que devolve erro quando alguém o cola é
 * exatamente o tipo de pista falsa que faz a investigação começar no lugar
 * errado.
 */
import { supabase } from './supabase'

const BUCKET = 'anomalias-fotos'
const MARCA = `/${BUCKET}/`

/** Quanto tempo a URL assinada vale. Uma hora cobre a sessão de quem confere. */
export const VALIDADE_S = 3600

/**
 * O caminho dentro do bucket, venha o valor como URL pública antiga ou já como
 * caminho. Devolve `null` para o que não serve — nunca uma string quebrada.
 */
export function caminhoDaFoto(valor) {
  if (typeof valor !== 'string' || !valor) return null
  const i = valor.indexOf(MARCA)
  if (i >= 0) return valor.slice(i + MARCA.length) || null
  // Já é um caminho. Uma URL de outro bucket (ou de outro site) não é foto de
  // avaria e não pode virar um caminho relativo por acidente.
  if (/^https?:\/\//i.test(valor)) return null
  return valor.replace(/^\/+/, '') || null
}

/**
 * Assina uma lista de fotos de uma vez.
 *
 * Uma chamada para N arquivos, e não N chamadas: a tela de anomalias mostra
 * quatro fotos por linha e dezenas de linhas — uma requisição por miniatura
 * transformaria o carregamento da lista numa saraivada.
 *
 * Devolve um mapa `valor guardado -> URL assinada`. O que falhar simplesmente
 * não entra no mapa, e a tela mostra o buraco em vez de uma imagem quebrada:
 * `createSignedUrls` reporta erro POR ARQUIVO, e tratar o lote inteiro como
 * perdido por causa de um apagado esconderia os outros três.
 */
export async function assinarFotos(valores) {
  const mapa = new Map()
  const caminhos = []
  const porCaminho = new Map()
  for (const v of valores ?? []) {
    const c = caminhoDaFoto(v)
    if (!c || porCaminho.has(c)) continue
    porCaminho.set(c, v)
    caminhos.push(c)
  }
  if (!caminhos.length) return mapa
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrls(caminhos, VALIDADE_S)
  if (error) {
    // Sem `throw`: a lista de anomalias tem que abrir mesmo sem as fotos. O
    // console fica com o motivo -- engolir em silêncio foi o que deixou o
    // Dashboard do Alô dois meses em branco.
    console.warn('[fotos] não consegui assinar as fotos:', error?.message ?? error)
    return mapa
  }
  for (const item of data ?? []) {
    if (!item?.signedUrl || item?.error) continue
    const original = porCaminho.get(item.path)
    if (original) mapa.set(original, item.signedUrl)
  }
  return mapa
}
