import { useState, useEffect, useRef, useMemo } from 'react'
import {
  Upload, FileSpreadsheet, Trash2, RefreshCw,
  AlertCircle, CheckCircle2, X, Database, AlertTriangle, Package,
} from 'lucide-react'
import * as XLSX from 'xlsx'
import AdminLayout from '../components/AdminLayout'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

const FILE_PATTERN      = /^BASE_(\d{2})-(\d{2})-(\d{4})\.xlsx$/i
const FILE_PATTERN_PROD = /^\d{2}\.\d{2}\.xlsx$/i

function excelSerial(n) {
  if (!n) return null
  if (typeof n === 'number')
    return new Date(Math.round((n - 25569) * 86400 * 1000)).toISOString().split('T')[0]
  const d = new Date(n)
  return isNaN(d) ? null : d.toISOString().split('T')[0]
}

function arqOrigemToDate(s) {
  const m = s.match(/^BASE_(\d{2})-(\d{2})-(\d{4})$/i)
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null
}

function mapRevenda(codigoRevenda, unidades) {
  if (!codigoRevenda) return null
  return unidades.find(u => u.codigo_ambev === codigoRevenda.trim())?.id ?? null
}

function chunk(arr, size) {
  const out = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

function ptDate(iso) {
  if (!iso) return '—'
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

function ptTs(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

export default function Importacao() {
  const { profile } = useAuth()
  const fileRef     = useRef(null)
  const fileRefProd = useRef(null)

  // BASE Ambev
  const [bases,        setBases]        = useState([])
  const [unidades,     setUnidades]     = useState([])
  const [loading,      setLoading]      = useState(true)
  const [busca,        setBusca]        = useState('')
  const [pendingFile,  setPendingFile]  = useState(null)
  const [fileError,    setFileError]    = useState('')
  const [importing,    setImporting]    = useState(false)
  const [importResult, setImportResult] = useState(null)
  const [confirmarDel, setConfirmarDel] = useState(null)
  const [excluindo,    setExcluindo]    = useState(false)

  // Tabela de Produtos
  const [basesProd,        setBasesProd]        = useState([])
  const [pendingFileProd,  setPendingFileProd]  = useState(null)
  const [fileErrorProd,    setFileErrorProd]    = useState('')
  const [importingProd,    setImportingProd]    = useState(false)
  const [importResultProd, setImportResultProd] = useState(null)
  const [confirmarDelProd, setConfirmarDelProd] = useState(null)
  const [excluindoProd,    setExcluindoProd]    = useState(false)

  useEffect(() => { carregar() }, [])

  async function carregar() {
    setLoading(true)
    const [{ data: peds }, { data: unis }, { data: prods }] = await Promise.all([
      supabase.from('pedidos').select('arquivo_origem, data_puxada, viagem_id, importado_em'),
      supabase.from('unidades').select('id, nome, codigo, codigo_ambev, cidade, tipo').order('nome'),
      supabase.from('produtos_catalogo').select('arquivo_origem, importado_em'),
    ])

    const map = {}
    ;(peds ?? []).forEach(p => {
      if (!map[p.arquivo_origem]) {
        map[p.arquivo_origem] = {
          arquivo_origem: p.arquivo_origem,
          data_puxada:   p.data_puxada,
          total:         0,
          vinculados:    0,
          livres:        0,
          importado_em:  p.importado_em,
        }
      }
      const b = map[p.arquivo_origem]
      b.total++
      if (p.viagem_id) b.vinculados++
      else b.livres++
      if ((p.importado_em ?? '') > (b.importado_em ?? '')) b.importado_em = p.importado_em
    })

    setBases(
      Object.values(map)
        .filter(b => b.livres > 0 && b.arquivo_origem !== 'SUBSTITUICAO_ADMIN')
        .sort((a, b) => (b.data_puxada ?? '').localeCompare(a.data_puxada ?? ''))
    )
    setUnidades(unis ?? [])

    // Agrupa catálogos de produtos por arquivo_origem
    const prodMap = {}
    ;(prods ?? []).forEach(p => {
      if (!prodMap[p.arquivo_origem]) {
        prodMap[p.arquivo_origem] = { arquivo_origem: p.arquivo_origem, total: 0, importado_em: p.importado_em }
      }
      prodMap[p.arquivo_origem].total++
      if ((p.importado_em ?? '') > (prodMap[p.arquivo_origem].importado_em ?? ''))
        prodMap[p.arquivo_origem].importado_em = p.importado_em
    })
    setBasesProd(Object.values(prodMap).sort((a, b) => (b.arquivo_origem ?? '').localeCompare(a.arquivo_origem ?? '')))

    setLoading(false)
  }

  // ── file handling ────────────────────────────────────────────────────────────

  function handleFileChange(e) {
    const file = e.target.files?.[0]
    if (fileRef.current) fileRef.current.value = ''
    setFileError(''); setImportResult(null); setPendingFile(null)
    if (!file) return
    if (!FILE_PATTERN.test(file.name)) {
      setFileError('Nome inválido. Use o padrão BASE_DD-MM-YYYY.xlsx')
      return
    }
    const reader = new FileReader()
    reader.onload = ev => {
      try {
        const wb = XLSX.read(ev.target.result, { type: 'array', cellDates: false })
        const ws = wb.Sheets[wb.SheetNames[0]]
        const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: true })
        const dataRows = rows.slice(1).filter(r => r[5])
        if (!dataRows.length) { setFileError('Arquivo sem dados válidos.'); return }
        const arqOrigem = file.name.replace(/\.xlsx$/i, '')
        setPendingFile({ name: file.name, arqOrigem, data: dataRows, count: dataRows.length })
      } catch {
        setFileError('Erro ao ler o arquivo.')
      }
    }
    reader.readAsArrayBuffer(file)
  }

  async function handleImport() {
    if (!pendingFile) return
    setImporting(true); setImportResult(null)

    try {
      const newRecords = pendingFile.data.map(r => ({
        data_puxada:    excelSerial(r[0]),
        codigo_revenda: String(r[1] || '').trim() || null,
        revenda:        String(r[2] || ''),
        unidade_id:     mapRevenda(String(r[1] || ''), unidades),
        codigo_fabrica: String(r[3] || '').trim() || null,
        fabrica:        String(r[4] || ''),
        numero_pedido:  Number(r[5]),
        placa:          r[6] ? String(r[6]).toUpperCase().trim() : null,
        cod_produto:    String(r[7] || ''),
        descricao:      String(r[8] || ''),
        embalagem:      r[9] ? String(r[9]) : null,
        curva:          r[10] ? String(r[10]).trim() : null,
        qtde_pallets:   Number(r[11]) || 0,
        qtde_skus:      Number(r[12]) || 0,
        arquivo_origem: pendingFile.arqOrigem,
        importado_por:  profile?.id,
      }))

      const numeroPedidos = [...new Set(newRecords.map(r => r.numero_pedido))]
      let existingPedidos = []
      for (const batch of chunk(numeroPedidos, 200)) {
        const { data, error } = await supabase
          .from('pedidos')
          .select('id, numero_pedido, cod_produto, viagem_id, arquivo_origem')
          .in('numero_pedido', batch)
        if (error) throw error
        existingPedidos = existingPedidos.concat(data ?? [])
      }

      const { data: oldSameBase, error: oldErr } = await supabase
        .from('pedidos')
        .select('id, numero_pedido, cod_produto, viagem_id')
        .eq('arquivo_origem', pendingFile.arqOrigem)
      if (oldErr) throw oldErr

      const allViagemIds = [...new Set([
        ...(existingPedidos ?? []).map(p => p.viagem_id),
        ...(oldSameBase     ?? []).map(p => p.viagem_id),
      ].filter(Boolean))]

      const viagemStatusMap = {}
      if (allViagemIds.length) {
        for (const batch of chunk(allViagemIds, 200)) {
          const { data } = await supabase.from('viagens').select('id, status').in('id', batch)
          ;(data ?? []).forEach(v => { viagemStatusMap[v.id] = v.status })
        }
      }

      const existingMap = {}
      ;(existingPedidos ?? []).forEach(p => {
        const key = `${p.numero_pedido}|${p.cod_produto}`
        const prev = existingMap[key]
        if (!prev || (!prev.viagem_id && p.viagem_id)) existingMap[key] = p
      })

      const toInsert = []
      const toUpdate = []
      let ignoradosCount = 0
      const viagensAlteradasIds = new Set()

      for (const rec of newRecords) {
        const key = `${rec.numero_pedido}|${rec.cod_produto}`
        const ex  = existingMap[key]
        if (!ex) {
          toInsert.push(rec)
        } else {
          const status = ex.viagem_id ? viagemStatusMap[ex.viagem_id] : null
          if (status === 'concluida') {
            ignoradosCount++
          } else if (ex.viagem_id) {
            toUpdate.push({ id: ex.id, payload: { ...rec, viagem_id: ex.viagem_id } })
            viagensAlteradasIds.add(ex.viagem_id)
          } else {
            toUpdate.push({ id: ex.id, payload: rec })
          }
        }
      }

      const newKeys = new Set(newRecords.map(r => `${r.numero_pedido}|${r.cod_produto}`))
      const toDelete = (oldSameBase ?? [])
        .filter(p => !newKeys.has(`${p.numero_pedido}|${p.cod_produto}`) && !p.viagem_id)
        .map(p => p.id)

      for (const batch of chunk(toInsert, 500)) {
        const { error } = await supabase.from('pedidos').insert(batch)
        if (error) throw error
      }

      // Deduplica por id antes do upsert (arquivo pode ter linhas duplicadas)
      const upsertById = {}
      toUpdate.forEach(({ id, payload }) => { upsertById[id] = { id, ...payload } })
      const upsertRows = Object.values(upsertById)
      for (const batch of chunk(upsertRows, 500)) {
        const { error } = await supabase.from('pedidos').upsert(batch, { onConflict: 'id' })
        if (error) throw error
      }

      for (const batch of chunk(toDelete, 500)) {
        const { error } = await supabase.from('pedidos').delete().in('id', batch)
        if (error) throw error
      }

      let viagensAlteradas = []
      if (viagensAlteradasIds.size) {
        const { data } = await supabase
          .from('viagens')
          .select('id, carreta:carretas(placa), cavalo:cavalos(placa)')
          .in('id', [...viagensAlteradasIds])
        viagensAlteradas = (data ?? []).map(v =>
          [v.carreta?.placa, v.cavalo?.placa].filter(Boolean).join('/') || v.id
        )
      }

      // Detecta fábricas do arquivo que não têm entrada em unidades
      const fabricasCadastradas = new Set(
        unidades.filter(u => u.tipo === 'fabrica').map(u => u.codigo_ambev).filter(Boolean)
      )
      const novasFabricasMap = {}
      newRecords.forEach(r => {
        if (r.codigo_fabrica && !fabricasCadastradas.has(r.codigo_fabrica)) {
          novasFabricasMap[r.codigo_fabrica] = r.fabrica
        }
      })
      const novasFabricas = Object.entries(novasFabricasMap).map(([codigo, nome]) => ({ codigo, nome }))

      setImportResult({
        ok: true,
        inseridos:       toInsert.length,
        atualizados:     toUpdate.length,
        ignorados:       ignoradosCount,
        deletados:       toDelete.length,
        viagensAlteradas,
        novasFabricas,
      })
      setPendingFile(null)
      await carregar()
    } catch (err) {
      setImportResult({ ok: false, msg: err.message || 'Erro ao importar.' })
    } finally {
      setImporting(false)
    }
  }

  // ── tabela de produtos ────────────────────────────────────────────────────────

  function handleFileChangeProd(e) {
    const file = e.target.files?.[0]
    if (fileRefProd.current) fileRefProd.current.value = ''
    setFileErrorProd(''); setImportResultProd(null); setPendingFileProd(null)
    if (!file) return
    if (!FILE_PATTERN_PROD.test(file.name)) {
      setFileErrorProd('Nome inválido. Use o padrão DD.MM.xlsx (ex: 01.11.xlsx)')
      return
    }
    const reader = new FileReader()
    reader.onload = ev => {
      try {
        const wb = XLSX.read(ev.target.result, { type: 'array', cellDates: false })
        const ws = wb.Sheets[wb.SheetNames[0]]
        const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: false })
        const dataRows = rows.slice(1).filter(r => r[0])
        if (!dataRows.length) { setFileErrorProd('Arquivo sem dados válidos.'); return }
        const arqOrigem = file.name.replace(/\.xlsx$/i, '')
        setPendingFileProd({ name: file.name, arqOrigem, data: dataRows, count: dataRows.length })
      } catch {
        setFileErrorProd('Erro ao ler o arquivo.')
      }
    }
    reader.readAsArrayBuffer(file)
  }

  async function handleImportProd() {
    if (!pendingFileProd) return
    setImportingProd(true); setImportResultProd(null)
    try {
      const records = pendingFileProd.data.map(r => ({
        codigo:             String(r[0] ?? '').trim(),
        descricao:          String(r[1] ?? '').trim(),
        tipo_marca:         String(r[4] ?? '').trim() || null,
        linha_marca:        String(r[5] ?? '').trim() || null,
        embalagem:          String(r[6] ?? '').trim() || null,
        marca:              String(r[7] ?? '').trim() || null,
        peso_bruto:         parseFloat(r[12]) || null,
        fator:              parseFloat(r[13]) || null,
        grupo:              String(r[17] ?? '').trim() || null,
        ean:                String(r[19] ?? '').trim() || null,
        caixas_pallet:      parseFloat(r[21]) || null,
        nr_fator_conversao: parseFloat(r[22]) || null,
        codigo_sap:         String(r[38] ?? '').trim() || null,
        ncm:                String(r[40] ?? '').trim() || null,
        subtipo:            String(r[47] ?? '').trim() || null,
        arquivo_origem:     pendingFileProd.arqOrigem,
        importado_por:      profile?.id,
      })).filter(r => r.codigo)

      let inseridos = 0, atualizados = 0
      for (const batch of chunk(records, 500)) {
        const { data, error } = await supabase
          .from('produtos_catalogo')
          .upsert(batch, { onConflict: 'codigo', ignoreDuplicates: false })
          .select('codigo')
        if (error) throw error
        // Supabase upsert não distingue insert/update facilmente; contamos tudo
        inseridos += batch.length
      }

      setImportResultProd({ ok: true, total: records.length })
      setPendingFileProd(null)
      await carregar()
    } catch (err) {
      setImportResultProd({ ok: false, msg: err.message || 'Erro ao importar.' })
    } finally {
      setImportingProd(false)
    }
  }

  async function excluirBaseProd() {
    if (!confirmarDelProd) return
    setExcluindoProd(true)
    await supabase.from('produtos_catalogo').delete().eq('arquivo_origem', confirmarDelProd.arquivo_origem)
    setConfirmarDelProd(null)
    setExcluindoProd(false)
    await carregar()
  }

  // ── excluir base ─────────────────────────────────────────────────────────────

  async function excluirBase() {
    if (!confirmarDel) return
    setExcluindo(true)
    const { error } = await supabase
      .from('pedidos')
      .delete()
      .eq('arquivo_origem', confirmarDel.arquivo_origem)
      .is('viagem_id', null)
    if (!error) { setConfirmarDel(null); await carregar() }
    setExcluindo(false)
  }

  const basesFiltradas = useMemo(() => {
    if (!busca.trim()) return bases
    return bases.filter(b => b.arquivo_origem.toLowerCase().includes(busca.toLowerCase()))
  }, [bases, busca])

  return (
    <AdminLayout title="Importação de Bases">
      <div className="max-w-lg mx-auto px-4 pt-5 pb-8 space-y-5">

        {/* ── Upload ── */}
        <div className="bg-white rounded-2xl border border-cobeb-border overflow-hidden">
          <div className="flex items-center gap-2.5 px-5 py-3.5 border-b border-cobeb-border">
            <FileSpreadsheet size={16} className="text-cobeb-yellow" />
            <span className="text-cobeb-text text-sm font-semibold">Importar BASE Ambev</span>
          </div>
          <div className="p-4 space-y-3">
            <input ref={fileRef} type="file" accept=".xlsx" onChange={handleFileChange} className="hidden" />

            {!pendingFile ? (
              <button
                onClick={() => fileRef.current?.click()}
                className="w-full border-2 border-dashed border-cobeb-border hover:border-orange-500/50 rounded-xl py-6 flex flex-col items-center gap-2 transition-colors group"
              >
                <Upload size={18} className="text-slate-500 group-hover:text-cobeb-yellow transition-colors" />
                <span className="text-slate-500 text-sm">Selecionar arquivo BASE...</span>
                <span className="text-slate-600 text-xs">Padrão: BASE_DD-MM-YYYY.xlsx</span>
              </button>
            ) : (
              <div className="bg-[#EBF5FF] rounded-xl p-3.5 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <FileSpreadsheet size={16} className="text-cobeb-yellow shrink-0" />
                  <div>
                    <p className="text-cobeb-text text-sm font-medium">{pendingFile.name}</p>
                    <p className="text-slate-500 text-xs">{pendingFile.count.toLocaleString('pt-BR')} registros</p>
                  </div>
                </div>
                <button onClick={() => { setPendingFile(null); setImportResult(null) }} className="text-slate-500 hover:text-slate-400">
                  <X size={15} />
                </button>
              </div>
            )}

            {fileError && (
              <div className="flex items-center gap-2 text-red-400 text-xs bg-red-500/10 rounded-xl px-4 py-3">
                <AlertCircle size={13} className="shrink-0" />{fileError}
              </div>
            )}

            {importResult && (
              <div className={`rounded-xl px-4 py-3 text-xs ${importResult.ok ? 'bg-green-500/10' : 'bg-red-500/10'}`}>
                {importResult.ok ? (
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-1.5 text-green-400 font-semibold mb-2">
                      <CheckCircle2 size={13} />Importação concluída
                    </div>
                    <p className="text-green-400">+ {importResult.inseridos} pedido(s) inserido(s)</p>
                    <p className="text-cobeb-yellow">↻ {importResult.atualizados} pedido(s) atualizado(s)</p>
                    {importResult.deletados > 0 && (
                      <p className="text-slate-400">− {importResult.deletados} removido(s) da base</p>
                    )}
                    {importResult.ignorados > 0 && (
                      <p className="text-slate-500">⊘ {importResult.ignorados} ignorado(s) — viagem finalizada</p>
                    )}
                    {importResult.viagensAlteradas?.length > 0 && (
                      <p className="text-blue-400 mt-1">✎ Viagens alteradas: {importResult.viagensAlteradas.join(', ')}</p>
                    )}
                    {importResult.novasFabricas?.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-amber-500/20">
                        <p className="text-amber-400 font-semibold mb-1">⚠ Nova{importResult.novasFabricas.length > 1 ? 's' : ''} fábrica{importResult.novasFabricas.length > 1 ? 's' : ''} detectada{importResult.novasFabricas.length > 1 ? 's' : ''}:</p>
                        {importResult.novasFabricas.map(f => (
                          <p key={f.codigo} className="text-amber-300 text-[11px]">· {f.nome} (código {f.codigo})</p>
                        ))}
                        <p className="text-slate-400 text-[11px] mt-1">Cadastre em Cadastros → Unidades para habilitar no mapa.</p>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-red-400">
                    <AlertCircle size={13} className="shrink-0" />{importResult.msg}
                  </div>
                )}
              </div>
            )}

            {pendingFile && (
              <button
                onClick={handleImport}
                disabled={importing}
                className="w-full bg-cobeb-navy hover:bg-cobeb-blue disabled:opacity-50 text-white text-sm font-semibold rounded-xl py-3 transition-colors flex items-center justify-center gap-2"
              >
                {importing
                  ? <><div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />Importando...</>
                  : <><Upload size={15} />Importar {pendingFile.count.toLocaleString('pt-BR')} registros</>}
              </button>
            )}
          </div>
        </div>

        {/* ── Lista de bases ── */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <p className="text-cobeb-text text-sm font-semibold">{bases.length} base(s) importada(s)</p>
            <button onClick={carregar} className="text-slate-500 hover:text-cobeb-yellow transition-colors">
              <RefreshCw size={15} />
            </button>
          </div>

          <div className="relative mb-3">
            <input
              type="text"
              value={busca}
              onChange={e => setBusca(e.target.value)}
              placeholder="Filtrar bases..."
              className="w-full bg-white border border-cobeb-border rounded-xl px-4 py-2.5 text-cobeb-text text-sm placeholder-slate-400 focus:outline-none focus:border-cobeb-blue transition-colors"
            />
            {busca && (
              <button onClick={() => setBusca('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-400">
                <X size={14} />
              </button>
            )}
          </div>

          {loading ? (
            <div className="flex justify-center py-12">
              <div className="w-6 h-6 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : basesFiltradas.length === 0 ? (
            <div className="text-center py-12">
              <Database size={28} className="text-cobeb-border mx-auto mb-3" />
              <p className="text-slate-500 text-sm">{busca ? 'Nenhuma base encontrada' : 'Nenhuma base importada ainda'}</p>
            </div>
          ) : (
            <div className="space-y-2">
              {basesFiltradas.map(b => (
                <div key={b.arquivo_origem} className="bg-white rounded-2xl border border-cobeb-border px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-cobeb-text text-sm font-semibold font-mono truncate">{b.arquivo_origem}</p>
                      <p className="text-slate-500 text-xs mt-0.5">Puxada: {ptDate(b.data_puxada)}</p>
                      <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                        <span className="text-xs text-cobeb-text font-medium">{b.total} reg.</span>
                        <span className="text-[10px] bg-green-500/10 text-green-400 border border-green-500/20 px-2 py-0.5 rounded-full">
                          {b.livres} livre(s)
                        </span>
                        {b.vinculados > 0 && (
                          <span className="text-[10px] bg-cobeb-navy/10 text-cobeb-yellow border border-cobeb-navy/20 px-2 py-0.5 rounded-full">
                            {b.vinculados} vinculado(s)
                          </span>
                        )}
                      </div>
                      <p className="text-slate-400 text[10px] mt-1 text-[10px]">Importado em: {ptTs(b.importado_em)}</p>
                    </div>
                    <button
                      onClick={() => setConfirmarDel(b)}
                      disabled={b.livres === 0}
                      title={b.livres === 0 ? 'Todos os registros estão vinculados' : 'Excluir registros livres'}
                      className="w-8 h-8 rounded-lg bg-[#EBF5FF] border border-cobeb-border flex items-center justify-center text-slate-500 hover:text-red-400 hover:border-red-500/40 transition-colors disabled:opacity-30 disabled:cursor-not-allowed shrink-0 mt-0.5"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Seção: Tabela de Produtos ── */}
      <div className="max-w-lg mx-auto px-4 pb-8 space-y-5">

        {/* Upload produtos */}
        <div className="bg-white rounded-2xl border border-cobeb-border overflow-hidden">
          <div className="flex items-center gap-2.5 px-5 py-3.5 border-b border-cobeb-border">
            <Package size={16} className="text-cobeb-yellow" />
            <span className="text-cobeb-text text-sm font-semibold">Importar Tabela de Produtos</span>
          </div>
          <div className="p-4 space-y-3">
            <input ref={fileRefProd} type="file" accept=".xlsx" onChange={handleFileChangeProd} className="hidden" />

            {!pendingFileProd ? (
              <button
                onClick={() => fileRefProd.current?.click()}
                className="w-full border-2 border-dashed border-cobeb-border hover:border-orange-500/50 rounded-xl py-6 flex flex-col items-center gap-2 transition-colors group"
              >
                <Upload size={18} className="text-slate-500 group-hover:text-cobeb-yellow transition-colors" />
                <span className="text-slate-500 text-sm">Selecionar tabela de produtos...</span>
                <span className="text-slate-600 text-xs">Padrão: DD.MM.xlsx (ex: 01.11.xlsx)</span>
              </button>
            ) : (
              <div className="bg-[#EBF5FF] rounded-xl p-3.5 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <Package size={16} className="text-cobeb-yellow shrink-0" />
                  <div>
                    <p className="text-cobeb-text text-sm font-medium">{pendingFileProd.name}</p>
                    <p className="text-slate-500 text-xs">{pendingFileProd.count.toLocaleString('pt-BR')} produtos</p>
                  </div>
                </div>
                <button onClick={() => { setPendingFileProd(null); setImportResultProd(null) }} className="text-slate-500 hover:text-slate-400">
                  <X size={15} />
                </button>
              </div>
            )}

            {fileErrorProd && (
              <div className="flex items-center gap-2 text-red-400 text-xs bg-red-500/10 rounded-xl px-4 py-3">
                <AlertCircle size={13} className="shrink-0" />{fileErrorProd}
              </div>
            )}

            {importResultProd && (
              <div className={`rounded-xl px-4 py-3 text-xs ${importResultProd.ok ? 'bg-green-500/10' : 'bg-red-500/10'}`}>
                {importResultProd.ok ? (
                  <div className="flex items-center gap-1.5 text-green-400 font-semibold">
                    <CheckCircle2 size={13} />
                    {importResultProd.total.toLocaleString('pt-BR')} produtos importados/atualizados com sucesso
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-red-400">
                    <AlertCircle size={13} className="shrink-0" />{importResultProd.msg}
                  </div>
                )}
              </div>
            )}

            {pendingFileProd && (
              <button
                onClick={handleImportProd}
                disabled={importingProd}
                className="w-full bg-cobeb-navy hover:bg-cobeb-blue disabled:opacity-50 text-white text-sm font-semibold rounded-xl py-3 transition-colors flex items-center justify-center gap-2"
              >
                {importingProd
                  ? <><div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />Importando {pendingFileProd.count.toLocaleString('pt-BR')} produtos...</>
                  : <><Upload size={15} />Importar {pendingFileProd.count.toLocaleString('pt-BR')} produtos</>}
              </button>
            )}
          </div>
        </div>

        {/* Lista de catálogos importados */}
        {basesProd.length > 0 && (
          <div>
            <p className="text-cobeb-text text-sm font-semibold mb-3">{basesProd.length} catálogo(s) importado(s)</p>
            <div className="space-y-2">
              {basesProd.map(b => (
                <div key={b.arquivo_origem} className="bg-white rounded-2xl border border-cobeb-border px-4 py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-cobeb-text text-sm font-semibold font-mono">{b.arquivo_origem}</p>
                    <p className="text-slate-500 text-xs mt-0.5">{b.total.toLocaleString('pt-BR')} produtos · Importado em: {ptTs(b.importado_em)}</p>
                  </div>
                  <button
                    onClick={() => setConfirmarDelProd(b)}
                    title="Excluir catálogo"
                    className="w-8 h-8 rounded-lg bg-[#EBF5FF] border border-cobeb-border flex items-center justify-center text-slate-500 hover:text-red-400 hover:border-red-500/40 transition-colors shrink-0"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Modal confirmar exclusão */}
      {confirmarDel && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-end">
          <div className="w-full max-w-lg mx-auto bg-white rounded-t-3xl p-6 space-y-5">
            <div className="w-10 h-1 bg-[#1E3A5F] rounded-full mx-auto" />
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-red-500/20 flex items-center justify-center shrink-0">
                <AlertTriangle size={20} className="text-red-400" />
              </div>
              <div>
                <p className="text-cobeb-text font-semibold text-base">Excluir base</p>
                <p className="text-slate-500 text-sm mt-0.5 font-mono">{confirmarDel.arquivo_origem}</p>
                <p className="text-slate-500 text-sm mt-2">
                  <span className="text-red-400 font-semibold">{confirmarDel.livres} registro(s) livre(s)</span> serão excluídos permanentemente.
                </p>
                {confirmarDel.vinculados > 0 && (
                  <p className="text-cobeb-yellow text-xs mt-1">
                    {confirmarDel.vinculados} registro(s) vinculados a viagens serão mantidos.
                  </p>
                )}
                <p className="text-red-400 text-xs mt-2 font-medium">Esta ação não pode ser desfeita.</p>
              </div>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setConfirmarDel(null)}
                className="flex-1 bg-[#EBF5FF] border border-cobeb-border text-slate-400 font-semibold py-4 rounded-2xl text-sm">
                Cancelar
              </button>
              <button onClick={excluirBase} disabled={excluindo}
                className="flex-1 bg-red-500 hover:bg-red-600 disabled:opacity-50 text-white font-semibold py-4 rounded-2xl text-sm transition-colors">
                {excluindo ? 'Excluindo...' : 'Excluir'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal confirmar exclusão — catálogo de produtos */}
      {confirmarDelProd && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-end">
          <div className="w-full max-w-lg mx-auto bg-white rounded-t-3xl p-6 space-y-5">
            <div className="w-10 h-1 bg-[#1E3A5F] rounded-full mx-auto" />
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-red-500/20 flex items-center justify-center shrink-0">
                <AlertTriangle size={20} className="text-red-400" />
              </div>
              <div>
                <p className="text-cobeb-text font-semibold text-base">Excluir catálogo</p>
                <p className="text-slate-500 text-sm mt-0.5 font-mono">{confirmarDelProd.arquivo_origem}</p>
                <p className="text-slate-500 text-sm mt-2">
                  <span className="text-red-400 font-semibold">{confirmarDelProd.total.toLocaleString('pt-BR')} produto(s)</span> serão excluídos permanentemente.
                </p>
                <p className="text-red-400 text-xs mt-2 font-medium">Esta ação não pode ser desfeita.</p>
              </div>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setConfirmarDelProd(null)}
                className="flex-1 bg-[#EBF5FF] border border-cobeb-border text-slate-400 font-semibold py-4 rounded-2xl text-sm">
                Cancelar
              </button>
              <button onClick={excluirBaseProd} disabled={excluindoProd}
                className="flex-1 bg-red-500 hover:bg-red-600 disabled:opacity-50 text-white font-semibold py-4 rounded-2xl text-sm transition-colors">
                {excluindoProd ? 'Excluindo...' : 'Excluir'}
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  )
}
