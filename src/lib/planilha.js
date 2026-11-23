/**
 * Leitura de células de planilha (SheetJS) sem perder informação.
 *
 * Por que existe: a importação de PRODUTOS lia a planilha com `raw:false`, ou
 * seja, o TEXTO que o Excel mostraria. Isso estraga duas coisas:
 *   - EAN de 13 dígitos gravado como NÚMERO, no formato "Geral", vira
 *     "7.89123E+12" (notação científica, dígitos perdidos para sempre);
 *   - número com separador de milhar no formato ("#,##0") vira "1,234", e o
 *     `parseFloat("1,234")` devolve 1.
 *
 * A regra daqui: se a célula é NUMÉRICA, vale o valor guardado (`cell.v`), não o
 * texto mostrado. Só quando a célula é TEXTO é que se interpreta o texto.
 *
 * Funções puras (sem React, sem Supabase): testadas em `planilha.test.js`
 * com `node --test`.
 */

/**
 * Lê a primeira aba com o mesmo formato de antes (`header:1, defval:'', raw:false`)
 * e devolve, junto de cada linha de texto, as células originais da planilha.
 * Com `header:1` e `defval:''` o SheetJS devolve uma linha por linha da área
 * usada (inclusive as vazias), então a linha i corresponde à linha `s.r + i`.
 *
 * @returns {{ texto: any[], celulas: (object|null)[] }[]}
 */
export function lerLinhasComCelulas(ws, utils) {
  const texto = utils.sheet_to_json(ws, { header: 1, defval: '', raw: false })
  if (!ws || !ws['!ref']) return texto.map(t => ({ texto: t, celulas: [] }))
  const range = utils.decode_range(ws['!ref'])
  const denso = Array.isArray(ws['!data']) ? ws['!data'] : null
  return texto.map((t, i) => {
    const R = range.s.r + i
    const celulas = []
    for (let C = range.s.c; C <= range.e.c; C++) {
      const cell = denso ? denso[R]?.[C] : ws[utils.encode_cell({ r: R, c: C })]
      celulas.push(cell ?? null)
    }
    return { texto: t, celulas }
  })
}

/**
 * Valor de coluna de IDENTIFICAÇÃO (EAN, código, SAP, NCM) como texto,
 * sem notação científica e sem perder dígitos.
 *   - número inteiro → todos os dígitos ("7891234567890");
 *     se o formato da célula mostra só dígitos (ex. "00000" → "01001"), mantém
 *     o texto mostrado, para não perder zero à esquerda;
 *   - texto → o próprio texto, aparado.
 */
export function textoIdCelula(cell) {
  if (!cell || cell.v === undefined || cell.v === null) return ''
  if (cell.t !== 'e' && typeof cell.v === 'number' && Number.isFinite(cell.v)) {
    const w = String(cell.w ?? '').trim()
    if (/^\d+$/.test(w) && Number(w) === cell.v) return w
    if (Number.isInteger(cell.v)) return BigInt(cell.v).toString()
    return String(cell.v)
  }
  return String(cell.w ?? cell.v).trim()
}

/**
 * Valor NUMÉRICO da célula. Célula numérica → `cell.v` (o número de verdade,
 * independente do formato de exibição). Célula de texto → `numeroDeTexto`.
 * Devolve NaN quando não há número.
 */
export function numeroCelula(cell) {
  if (!cell || cell.v === undefined || cell.v === null || cell.t === 'e') return NaN
  if (typeof cell.v === 'number') return cell.v
  if (typeof cell.v === 'boolean') return cell.v ? 1 : 0
  return numeroDeTexto(cell.v)
}

/**
 * Interpreta um número DIGITADO como texto, aceitando o padrão brasileiro e o
 * internacional:
 *   - com "." e "," → o separador que aparece por ÚLTIMO é o decimal
 *     ("1.234,56" e "1,234.56" → 1234.56);
 *   - só "," → vírgula decimal, como o app já faz em outras telas
 *     (`replace(',', '.')`): "9,125" → 9.125. Exceção: mais de uma vírgula
 *     ("1,234,567") só pode ser milhar;
 *   - só "." → ponto decimal ("9.5", "0.00415"), EXCETO quando é exatamente
 *     milhar no padrão brasileiro: grupos de 3 dígitos ("1.234" → 1234,
 *     "1.234.567" → 1234567).
 * Espaços (inclusive NBSP) são ignorados. Devolve NaN se não for número.
 */
export function numeroDeTexto(valor) {
  let s = String(valor ?? '').replace(/[\s ]+/g, '')
  if (!s) return NaN
  const temPonto = s.includes('.')
  const temVirgula = s.includes(',')
  if (temPonto && temVirgula) {
    if (s.lastIndexOf(',') > s.lastIndexOf('.')) s = s.replace(/\./g, '').replace(',', '.')
    else s = s.replace(/,/g, '')
  } else if (temVirgula) {
    s = (s.match(/,/g).length > 1) ? s.replace(/,/g, '') : s.replace(',', '.')
  } else if (temPonto) {
    if (/^[-+]?[1-9]\d{0,2}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '')
  }
  const n = Number(s)
  return Number.isNaN(n) ? parseFloat(s) : n
}
