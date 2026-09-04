import { jsPDF } from 'jspdf'

// ── Helpers ───────────────────────────────────────────────────────────────────

export function fmt2Y(iso) {
  if (!iso) return ''
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y.slice(-2)}`
}

export function minus30(iso) {
  if (!iso) return ''
  const d = new Date(iso + 'T12:00:00')
  d.setDate(d.getDate() - 30)
  return d.toISOString().slice(0, 10)
}

// ── Render de uma NRI no doc jsPDF ───────────────────────────────────────────

export function renderNRI(doc, {
  nri, yBase, marginX, W,
  dataRecebimento, horaEmissao,
  cabecalho, placaCarreta, placaCavalo, numeroNF, motorista, origem,
}) {
  const x0      = marginX
  const BLUE    = [26, 79, 156]
  const BLACK   = [0, 0, 0]
  const WHITE   = [255, 255, 255]
  const GRAY_LT = [232, 232, 232]
  const GRAY_MD = [212, 212, 212]
  const GRAY_TX = [90, 90, 90]
  const GRAY_BR = [185, 185, 185]

  const r1H = 11
  const r2H = 28   // código 40pt + descrição 20pt
  const r3H = 27
  const r4H = 21
  const r5H = 10
  const totalH = r1H + r2H + r3H + r4H + r5H  // 97mm

  const r1Y = yBase + 1
  const r2Y = r1Y + r1H
  const r3Y = r2Y + r2H
  const r4Y = r3Y + r3H
  const r5Y = r4Y + r4H

  const hline = (y, lw = 0.25) => {
    doc.setDrawColor(...BLACK); doc.setLineWidth(lw)
    doc.line(x0, y, x0 + W, y)
  }

  doc.setDrawColor(...BLACK); doc.setLineWidth(0.5)
  doc.rect(x0, r1Y, W, totalH, 'S')

  // Row 1
  doc.setFontSize(20); doc.setFont('helvetica', 'bold'); doc.setTextColor(...BLUE)
  doc.text('COBEB', x0 + 3, r1Y + 9)
  doc.setFontSize(6); doc.setFont('courier', 'normal'); doc.setTextColor(...GRAY_BR)
  doc.text(String(nri.numero).padStart(12, '0'), x0 + W - 3, r1Y + 9, { align: 'right' })
  hline(r1Y + r1H)

  // Row 2 — Código 40pt (destaque) + Descrição 20pt
  doc.setTextColor(...BLACK)

  // Código — 40pt negrito, centralizado (só o número)
  doc.setFontSize(40); doc.setFont('helvetica', 'bold')
  doc.text(String(nri.codigo || ''), x0 + W / 2, r2Y + 14, { align: 'center' })

  // Descrição — 20pt negrito, centralizado
  doc.setFontSize(20); doc.setFont('helvetica', 'bold')
  const descRaw   = (nri.descricao || '').toUpperCase()
  const descLines = doc.splitTextToSize(descRaw, W - 6)
  if (descLines.length === 1) {
    doc.text(descLines[0], x0 + W / 2, r2Y + 24, { align: 'center' })
  } else {
    doc.text(descLines[0], x0 + W / 2, r2Y + 22, { align: 'center' })
    doc.text(descLines[1], x0 + W / 2, r2Y + 28, { align: 'center' })
  }
  hline(r2Y + r2H)

  // Row 3
  const rightW = 54
  const leftW  = W - rightW

  doc.setFillColor(...BLACK); doc.rect(x0, r3Y, leftW, r3H, 'F')
  doc.setFontSize(7.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(...WHITE)
  doc.text('VENCIMENTO', x0 + leftW / 2, r3Y + 6, { align: 'center' })
  const dateStr = fmt2Y(nri.dataValidade)
  doc.setFont('helvetica', 'bold'); doc.setFontSize(40)
  const w40 = doc.getTextWidth(dateStr)
  const maxByWidth  = Math.floor(40 * (leftW - 6) / w40)
  const maxByHeight = Math.floor(18 / (0.353 * 0.72))
  doc.setFontSize(Math.min(maxByWidth, maxByHeight))
  doc.setTextColor(...WHITE)
  doc.text(dateStr, x0 + leftW / 2, r3Y + r3H - 2, { align: 'center' })

  // CURVA — bloco direito ocupa toda a altura r3H, letra maximizada
  doc.setFillColor(...GRAY_LT); doc.rect(x0 + leftW, r3Y, rightW, r3H, 'F')
  doc.setFontSize(6.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(...GRAY_TX)
  doc.text('CURVA', x0 + leftW + rightW / 2, r3Y + 4.5, { align: 'center' })
  const curvaLetter = nri.curva || ''
  if (curvaLetter) {
    doc.setFontSize(60); doc.setFont('helvetica', 'bold')
    const testW60 = doc.getTextWidth(curvaLetter)
    const maxCurvaByW = (testW60 > 0) ? Math.floor(60 * (rightW - 6) / testW60) : 60
    const maxCurvaByH = Math.floor((r3H - 9) / (0.353 * 0.72))
    doc.setFontSize(Math.min(maxCurvaByW, maxCurvaByH))
    doc.setTextColor(...BLACK)
    doc.text(curvaLetter, x0 + leftW + rightW / 2, r3Y + r3H - 3, { align: 'center' })
  }

  doc.setDrawColor(...BLACK); doc.setLineWidth(0.25)
  doc.line(x0 + leftW, r3Y, x0 + leftW, r3Y + r3H)
  hline(r3Y + r3H)

  // Row 4
  const placaStr = [placaCarreta, placaCavalo].filter(Boolean).join(' / ')
  const lineH4   = (r4H - 3) / 4
  doc.setFontSize(7.5); doc.setTextColor(...BLACK)
  doc.setFont('helvetica', 'normal')
  doc.text(`RECEBIMENTO: ${dataRecebimento}`,                            x0 + 3, r4Y + 1.5 + lineH4 * 0.9)
  doc.setFont('helvetica', 'bold')
  doc.text(`RESPONSÁVEL: ${(cabecalho.conferente || '').toUpperCase()}`, x0 + 3, r4Y + 1.5 + lineH4 * 1.9)
  doc.setFont('helvetica', 'normal')
  doc.text(`PLACA: ${placaStr}`,                                         x0 + 3, r4Y + 1.5 + lineH4 * 2.9)
  doc.text(`NF: ${numeroNF}`,                                            x0 + 3, r4Y + 1.5 + lineH4 * 3.9)

  // CARREGAR ATÉ — canto inferior direito, fundo preto, mesma largura da coluna CURVA
  doc.setFillColor(...BLACK); doc.rect(x0 + leftW, r4Y, rightW, r4H, 'F')
  doc.setFontSize(5.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(...WHITE)
  doc.text('CARREGAR ATÉ', x0 + leftW + rightW / 2, r4Y + 5, { align: 'center' })
  doc.setFontSize(16); doc.setFont('helvetica', 'bold'); doc.setTextColor(...WHITE)
  doc.text(fmt2Y(minus30(nri.dataValidade)), x0 + leftW + rightW / 2, r4Y + r4H - 4, { align: 'center' })
  doc.setDrawColor(...BLACK); doc.setLineWidth(0.25)
  doc.line(x0 + leftW, r4Y, x0 + leftW, r4Y + r4H)
  hline(r4Y + r4H)

  // Row 5
  const cols = [
    { label: 'OPERADOR',  value: (cabecalho.operador  || '').toUpperCase(), w: 0.27 },
    { label: 'TURNO',     value:  cabecalho.turno      || '',               w: 0.10 },
    { label: 'HORA',      value:  horaEmissao,                              w: 0.13 },
    { label: 'ORIGEM',    value: (origem    || '').toUpperCase(),           w: 0.27 },
    { label: 'MOTORISTA', value: (motorista || '').toUpperCase(),           w: 0.23 },
  ]
  const hdrH = 5
  const datH = r5H - hdrH
  let cx = x0
  for (const col of cols) {
    const cW = col.w * W
    doc.setFillColor(...BLACK); doc.rect(cx, r5Y, cW, hdrH, 'F')
    doc.setFontSize(5); doc.setFont('helvetica', 'bold'); doc.setTextColor(...WHITE)
    doc.text(col.label, cx + cW / 2, r5Y + 3.6, { align: 'center' })
    doc.setFillColor(...WHITE); doc.setDrawColor(...BLACK); doc.setLineWidth(0.15)
    doc.rect(cx, r5Y + hdrH, cW, datH, 'FD')
    doc.setFontSize(6); doc.setFont('helvetica', 'normal'); doc.setTextColor(...BLACK)
    const v = doc.splitTextToSize(col.value, cW - 2)
    doc.text(v[0] || '', cx + cW / 2, r5Y + hdrH + datH * 0.72, { align: 'center' })
    cx += cW
  }
}

// ── Gerador completo de PDF a partir de lista de NRIs ────────────────────────

export function gerarNRIPdf({ allNRIs, cabecalho, placaCarreta, placaCavalo, numeroNF, motorista, origem, dataRecebimento, horaEmissao, filename }) {
  const doc     = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const pageW   = 210
  const pageH   = 297
  const nriH    = pageH / 3
  const marginX = 3
  const W       = pageW - 2 * marginX

  const ctx = { marginX, W, dataRecebimento, horaEmissao, cabecalho, placaCarreta, placaCavalo, numeroNF, motorista, origem }

  for (let i = 0; i < allNRIs.length; i++) {
    const posOnPage = i % 3
    if (i > 0 && posOnPage === 0) doc.addPage()

    const yBase = posOnPage * nriH
    renderNRI(doc, { nri: allNRIs[i], yBase, ...ctx })

    const isLastOnPage = posOnPage === 2
    const isLastNRI    = i === allNRIs.length - 1
    if (!isLastOnPage && !isLastNRI) {
      const dashY = yBase + nriH - 0.5
      doc.setLineDashPattern([2, 1.5], 0)
      doc.setDrawColor(100, 100, 100)
      doc.setLineWidth(0.4)
      doc.line(marginX, dashY, pageW - marginX, dashY)
      doc.setLineDashPattern([], 0)
    }
  }

  return doc
}
