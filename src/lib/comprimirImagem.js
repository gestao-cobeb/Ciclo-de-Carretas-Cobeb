/**
 * Comprime uma foto antes de subir para o Storage, para reduzir o EGRESS.
 *
 * Por que existe: a foto de celular sai com 2–5 MB e era enviada crua. Cada
 * vez que alguém ABRE a foto depois, esses MB saem do Supabase de novo — e foi
 * egress (download) que estourou a cota. Reduzir a foto na origem corta esse
 * custo para sempre, sem mexer no banco nem em quem já foi salvo.
 *
 * O que faz: redimensiona para no máximo MAX_DIM no maior lado e exporta JPEG
 * com QUALIDADE. Corrige a orientação EXIF (foto de celular deitada) via
 * `imageOrientation: 'from-image'`.
 *
 * Regra de ouro: em QUALQUER falha, devolve o arquivo ORIGINAL. Compressão é
 * otimização — nunca pode impedir o conferente de registrar a anomalia. Também
 * devolve o original se o resultado não ficou menor (imagem já pequena).
 */
const MAX_DIM   = 1600
const QUALIDADE = 0.7

function nomeJpg(nome) {
  const base = (nome || 'foto').replace(/\.[^.]+$/, '')
  return `${base}.jpg`
}

export async function comprimirImagem(file) {
  try {
    if (!file || !file.type?.startsWith('image/')) return file

    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
    const escala = Math.min(1, MAX_DIM / Math.max(bitmap.width, bitmap.height))
    const w = Math.round(bitmap.width  * escala)
    const h = Math.round(bitmap.height * escala)

    const canvas = document.createElement('canvas')
    canvas.width  = w
    canvas.height = h
    canvas.getContext('2d').drawImage(bitmap, 0, 0, w, h)
    bitmap.close?.()

    const blob = await new Promise(res => canvas.toBlob(res, 'image/jpeg', QUALIDADE))
    if (!blob || blob.size >= file.size) return file

    return new File([blob], nomeJpg(file.name), { type: 'image/jpeg' })
  } catch {
    return file
  }
}
