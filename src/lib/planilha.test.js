// node --test src/lib/   (npm test)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as XLSX from 'xlsx'
import { lerLinhasComCelulas, textoIdCelula, numeroCelula, numeroDeTexto } from './planilha.js'

// Monta uma planilha como o Excel gravaria (célula numérica + formato de
// exibição), grava em .xlsx e relê como a tela /importacao relê.
function planilha(linhas, formatos = {}) {
  const ws = XLSX.utils.aoa_to_sheet(linhas)
  for (const [addr, z] of Object.entries(formatos)) ws[addr].z = z
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Planilha1')
  const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' })
  const lido = XLSX.read(buf, { type: 'array', cellDates: false })
  return lido.Sheets[lido.SheetNames[0]]
}

test('EAN de 13 dígitos gravado como número sai inteiro, sem notação científica', () => {
  const ws = planilha([['ean'], [7891234567890], [7890000000024], ['7890000000017']])
  const linhas = lerLinhasComCelulas(ws, XLSX.utils)
  assert.equal(linhas[1].texto[0], '7.89123E+12')          // o texto mostrado (o defeito)
  assert.equal(textoIdCelula(linhas[1].celulas[0]), '7891234567890')
  assert.equal(textoIdCelula(linhas[2].celulas[0]), '7890000000024')
  assert.equal(textoIdCelula(linhas[3].celulas[0]), '7890000000017') // já era texto
})

test('código com formato de zeros à esquerda mantém os zeros', () => {
  const ws = planilha([['ncm'], [2011000]], { A2: '00000000' })
  const [, l] = lerLinhasComCelulas(ws, XLSX.utils)
  assert.equal(textoIdCelula(l.celulas[0]), '02011000')
})

test('número com separador de milhar no formato vale o número da célula', () => {
  const ws = planilha([['cx', 'fator', 'pct'], [1234, 1234.5, 0.00415]], { A2: '#,##0', B2: '#,##0.00', C2: '0.00%' })
  const [, l] = lerLinhasComCelulas(ws, XLSX.utils)
  assert.equal(l.texto[0], '1,234')                         // parseFloat daria 1
  assert.equal(numeroCelula(l.celulas[0]), 1234)
  assert.equal(numeroCelula(l.celulas[1]), 1234.5)
  assert.equal(numeroCelula(l.celulas[2]), 0.00415)        // e não 0.42 do "0.42%"
})

test('linhas e colunas continuam alinhadas com o sheet_to_json (vazias inclusive)', () => {
  const ws = planilha([['a', 'b'], [], [1, 'x'], [null, 2]])
  const linhas = lerLinhasComCelulas(ws, XLSX.utils)
  assert.deepEqual(linhas.map(l => l.texto), [['a', 'b'], ['', ''], ['1', 'x'], ['', '2']])
  assert.equal(linhas[1].celulas[0], null)
  assert.equal(numeroCelula(linhas[3].celulas[1]), 2)
  assert.ok(Number.isNaN(numeroCelula(linhas[3].celulas[0])))
  assert.equal(textoIdCelula(linhas[3].celulas[0]), '')
})

test('número digitado como TEXTO: padrão brasileiro e internacional', () => {
  assert.equal(numeroDeTexto('1.234'), 1234)        // milhar brasileiro
  assert.equal(numeroDeTexto('1.234.567'), 1234567)
  assert.equal(numeroDeTexto('1.234,56'), 1234.56)
  assert.equal(numeroDeTexto('1,234.56'), 1234.56)  // internacional
  assert.equal(numeroDeTexto('1,234,567'), 1234567)
  assert.equal(numeroDeTexto('9,125'), 9.125)       // vírgula sozinha = decimal (regra do app)
  assert.equal(numeroDeTexto('0,3'), 0.3)
  assert.equal(numeroDeTexto('9.5'), 9.5)
  assert.equal(numeroDeTexto('0.420'), 0.42)        // começa com 0: não é milhar
  assert.equal(numeroDeTexto(' 1 234,5 '), 1234.5)
  assert.equal(numeroDeTexto('-1.234,5'), -1234.5)
  assert.ok(Number.isNaN(numeroDeTexto('')))
  assert.ok(Number.isNaN(numeroDeTexto('abc')))
})

test('célula de texto e de erro', () => {
  assert.equal(numeroCelula({ t: 's', v: '1.234' }), 1234)
  assert.ok(Number.isNaN(numeroCelula({ t: 'e', v: 42, w: '#N/A' })))
  assert.equal(textoIdCelula({ t: 's', v: '  ABC  ' }), 'ABC')
  assert.equal(textoIdCelula(null), '')
})
