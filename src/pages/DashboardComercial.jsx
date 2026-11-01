import { useState, useEffect, useMemo } from 'react'
import DashboardLayout from '../components/DashboardLayout'
import { supabase } from '../lib/supabase'

const SEGMENTOS = [
  { key: 'cerveja',  label: 'Cerveja',      cor: '#003DA5' },
  { key: 'nab',      label: 'NAB',           cor: '#0D9488' },
  { key: 'rgb',      label: 'RGB Cerveja',   cor: '#7C3AED' },
  { key: 'cervZero', label: 'Zero Álcool',   cor: '#6366F1' },
  { key: 'nabZero',  label: 'NAB Zero',      cor: '#14B8A6' },
  { key: 'highEnd',  label: 'High End',      cor: '#F59E0B' },
  { key: 'match',    label: 'Match',         cor: '#EF4444' },
]

function firstDay() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

function lastDay() {
  const d = new Date()
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().slice(0, 10)
}

function fmtHL(v) {
  if (!v) return '—'
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
}

function fmtN(v) {
  if (!v) return '—'
  return Math.round(v).toLocaleString('pt-BR')
}

export default function DashboardComercial() {
  const [dataInicio,   setDataInicio]   = useState(firstDay)
  const [dataFim,      setDataFim]      = useState(lastDay)
  const [unidades,     setUnidades]     = useState([])   // [] = todos
  const [segFiltro,    setSegFiltro]    = useState([])   // [] = todos

  const [loading,      setLoading]      = useState(true)
  const [optUnidades,  setOptUnidades]  = useState([])

  const [catMap,       setCatMap]       = useState({})
  const [zeroCervSet,  setZeroCervSet]  = useState(new Set())
  const [zeroNabSet,   setZeroNabSet]   = useState(new Set())
  const [highEndSet,   setHighEndSet]   = useState(new Set())
  const [pedidos,      setPedidos]      = useState([])

  // Carrega dados estáticos uma vez
  useEffect(() => {
    async function load() {
      const [{ data: unis }, { data: dpz }, { data: dem }] = await Promise.all([
        supabase.from('unidades').select('id, nome').order('nome'),
        supabase.from('depara_zero').select('cod_promax, tipo'),
        supabase.from('demanda').select('cod_promax, tipo'),
      ])
      setOptUnidades(unis ?? [])

      const czs = new Set()
      const nzs = new Set()
      ;(dpz ?? []).forEach(d => {
        if (d.tipo === 'CERVEJA ZERO') czs.add(d.cod_promax)
        if (d.tipo === 'NAB ZERO')     nzs.add(d.cod_promax)
      })
      setZeroCervSet(czs)
      setZeroNabSet(nzs)

      const hes = new Set()
      ;(dem ?? []).forEach(d => {
        if (d.tipo?.toUpperCase().includes('HIGH END')) hes.add(d.cod_promax)
      })
      setHighEndSet(hes)
    }
    load()
  }, [])

  // Carrega pedidos quando data ou unidade muda
  useEffect(() => {
    if (!dataInicio || !dataFim) return
    async function load() {
      setLoading(true)
      let q = supabase
        .from('pedidos')
        .select('cod_produto, qtde_pallets, qtde_skus, data_puxada, viagem_id, status, unidade_id')
        .gte('data_puxada', dataInicio)
        .lte('data_puxada', dataFim)
        .neq('status', 'cancelado')
        .not('cod_produto', 'is', null)
        .gt('qtde_pallets', 0)
      if (unidades.length) q = q.in('unidade_id', unidades)

      const { data: peds } = await q
      const pedList = peds ?? []

      const skus = [...new Set(pedList.map(p => p.cod_produto).filter(Boolean))]
      if (skus.length) {
        const { data: cat } = await supabase
          .from('produtos_catalogo')
          .select('codigo, descricao, tipo_marca, embalagem, caixas_pallet, nr_fator_conversao')
          .in('codigo', skus)
        const cm = {}
        ;(cat ?? []).forEach(c => { cm[c.codigo] = c })
        setCatMap(cm)
      } else {
        setCatMap({})
      }

      setPedidos(pedList)
      setLoading(false)
    }
    load()
  }, [dataInicio, dataFim, unidades])

  const today = new Date().toISOString().slice(0, 10)

  // Classifica cada pedido válido nos segmentos e calcula HL
  const pedidosClassificados = useMemo(() => {
    const result = []
    pedidos.forEach(p => {
      const iso = p.data_puxada?.slice(0, 10)
      if (!iso) return
      const isPast      = iso < today
      const isRealized  = p.viagem_id != null || p.status === 'realizado'
      if (isPast && !isRealized) return

      const cat = catMap[p.cod_produto]
      if (!cat) return

      const hl = (p.qtde_pallets || 0) * (cat.caixas_pallet || 0) * (cat.nr_fator_conversao || 0)
      if (hl <= 0) return

      const tm      = cat.tipo_marca ?? ''
      const emb     = cat.embalagem  ?? ''
      const isCerv  = tm === '001 - CERVEJA' || tm === '028 - BEBIDAS QUENTES'
      const isRGB   = isCerv && (emb.startsWith('017') || emb.startsWith('018') || emb.startsWith('085'))

      result.push({
        codigo:   p.cod_produto,
        descricao: cat.descricao || p.cod_produto,
        hl,
        paletes:  p.qtde_pallets || 0,
        cx:       p.qtde_skus    || 0,
        tags: {
          cerveja:  isCerv,
          nab:      !isCerv,
          rgb:      isRGB,
          cervZero: zeroCervSet.has(p.cod_produto),
          nabZero:  zeroNabSet.has(p.cod_produto),
          highEnd:  highEndSet.has(p.cod_produto),
          match:    tm === '028 - BEBIDAS QUENTES',
        },
      })
    })
    return result
  }, [pedidos, catMap, zeroCervSet, zeroNabSet, highEndSet, today])

  // HL por segmento (sem filtro de segmento — sempre mostra todos nos cards)
  const hlPorSegmento = useMemo(() => {
    const acc = {}
    SEGMENTOS.forEach(s => { acc[s.key] = 0 })
    pedidosClassificados.forEach(p => {
      SEGMENTOS.forEach(s => { if (p.tags[s.key]) acc[s.key] += p.hl })
    })
    return acc
  }, [pedidosClassificados])

  // Tabela com filtro de segmento aplicado, agrupada por produto
  const tableData = useMemo(() => {
    const map = {}
    pedidosClassificados.forEach(p => {
      if (segFiltro.length > 0 && !segFiltro.some(s => p.tags[s])) return
      if (!map[p.codigo]) map[p.codigo] = { codigo: p.codigo, descricao: p.descricao, hl: 0, paletes: 0, cx: 0 }
      map[p.codigo].hl      += p.hl
      map[p.codigo].paletes += p.paletes
      map[p.codigo].cx      += p.cx
    })
    return Object.values(map).sort((a, b) => b.hl - a.hl)
  }, [pedidosClassificados, segFiltro])

  const totais = useMemo(() => ({
    hl:      tableData.reduce((s, r) => s + r.hl,      0),
    paletes: tableData.reduce((s, r) => s + r.paletes, 0),
    cx:      tableData.reduce((s, r) => s + r.cx,      0),
  }), [tableData])

  function toggleUnidade(id) {
    setUnidades(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  function toggleSeg(key) {
    setSegFiltro(prev => prev.includes(key) ? prev.filter(x => x !== key) : [...prev, key])
  }

  const dateCls = 'border border-cobeb-border rounded-xl px-3 py-2 text-xs text-cobeb-text bg-white focus:outline-none focus:border-cobeb-blue/60'

  // Segmentos a exibir nos cards: os selecionados, ou todos se nenhum selecionado
  const cardsAtivos = segFiltro.length > 0
    ? SEGMENTOS.filter(s => segFiltro.includes(s.key))
    : SEGMENTOS

  return (
    <DashboardLayout>
      <div className="px-4 pt-5 pb-8 space-y-4">

        {/* ── Filtros ───────────────────────────────────────────────────────── */}
        <div className="bg-white rounded-2xl border border-cobeb-border shadow-sm p-4 space-y-3">

          {/* Período */}
          <div className="flex items-center gap-2">
            <input type="date" value={dataInicio} max={dataFim || undefined}
              onChange={e => setDataInicio(e.target.value)} className={dateCls} />
            <span className="text-slate-400 text-xs shrink-0">até</span>
            <input type="date" value={dataFim} min={dataInicio || undefined}
              onChange={e => setDataFim(e.target.value)} className={dateCls} />
          </div>

          {/* CDs */}
          <div className="flex flex-wrap gap-1.5">
            <button onClick={() => setUnidades([])}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-colors ${
                unidades.length === 0
                  ? 'bg-cobeb-navy text-white border-cobeb-navy'
                  : 'bg-white text-slate-500 border-cobeb-border hover:border-cobeb-blue/40'
              }`}>Todos os CDs</button>
            {optUnidades.map(u => (
              <button key={u.id} onClick={() => toggleUnidade(u.id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-colors ${
                  unidades.includes(u.id)
                    ? 'bg-cobeb-navy text-white border-cobeb-navy'
                    : 'bg-white text-slate-500 border-cobeb-border hover:border-cobeb-blue/40'
                }`}>{u.nome}</button>
            ))}
          </div>

          {/* Segmentos */}
          <div className="flex flex-wrap gap-1.5">
            <button onClick={() => setSegFiltro([])}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-colors ${
                segFiltro.length === 0
                  ? 'bg-cobeb-navy text-white border-cobeb-navy'
                  : 'bg-white text-slate-500 border-cobeb-border hover:border-cobeb-blue/40'
              }`}>Todos</button>
            {SEGMENTOS.map(s => (
              <button key={s.key} onClick={() => toggleSeg(s.key)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-colors ${
                  segFiltro.includes(s.key)
                    ? 'text-white border-transparent'
                    : 'bg-white text-slate-500 border-cobeb-border hover:border-cobeb-blue/40'
                }`}
                style={segFiltro.includes(s.key) ? { backgroundColor: s.cor, borderColor: s.cor } : {}}
              >{s.label}</button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-20">
            <div className="w-6 h-6 border-2 border-cobeb-blue border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <>
            {/* ── Cards de HL por segmento ──────────────────────────────────── */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {cardsAtivos.map(s => (
                <div key={s.key}
                  className="bg-white rounded-2xl border border-cobeb-border shadow-sm p-4 flex flex-col gap-1"
                  style={{ borderLeftWidth: 4, borderLeftColor: s.cor }}
                >
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{s.label}</p>
                  <p className="text-xl font-black tabular-nums"
                    style={{ color: s.cor }}>
                    {fmtHL(hlPorSegmento[s.key])}
                  </p>
                  <p className="text-[10px] text-slate-400">HL</p>
                </div>
              ))}
            </div>

            {/* ── Tabela de produtos ────────────────────────────────────────── */}
            <div className="bg-white rounded-2xl border border-cobeb-border shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-cobeb-border bg-cobeb-sky">
                      <th className="text-left px-3 py-2.5 text-cobeb-text font-semibold w-24 whitespace-nowrap">Código</th>
                      <th className="text-left px-3 py-2.5 text-cobeb-text font-semibold">Descrição</th>
                      <th className="text-right px-3 py-2.5 text-cobeb-text font-semibold whitespace-nowrap">HL</th>
                      <th className="text-right px-3 py-2.5 text-cobeb-text font-semibold whitespace-nowrap">Paletes</th>
                      <th className="text-right px-3 py-2.5 text-cobeb-text font-semibold whitespace-nowrap">CX</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tableData.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="text-center py-12 text-slate-400">
                          Sem dados para o período
                        </td>
                      </tr>
                    ) : tableData.map((row, i) => (
                      <tr key={row.codigo} className={i % 2 === 0 ? 'bg-white' : 'bg-cobeb-sky/30'}>
                        <td className="px-3 py-2 text-slate-400 font-mono">{row.codigo}</td>
                        <td className="px-3 py-2 text-cobeb-text">{row.descricao}</td>
                        <td className="px-3 py-2 text-right font-semibold text-cobeb-navy tabular-nums">{fmtHL(row.hl)}</td>
                        <td className="px-3 py-2 text-right text-cobeb-text tabular-nums">{fmtN(row.paletes)}</td>
                        <td className="px-3 py-2 text-right text-cobeb-text tabular-nums">{fmtN(row.cx)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-cobeb-navy/20 bg-cobeb-sky">
                      <td colSpan={2} className="px-3 py-2.5 font-bold text-cobeb-text">
                        Total — {tableData.length} produto{tableData.length !== 1 ? 's' : ''}
                      </td>
                      <td className="px-3 py-2.5 text-right font-bold text-cobeb-navy tabular-nums">{fmtHL(totais.hl)}</td>
                      <td className="px-3 py-2.5 text-right font-bold text-cobeb-navy tabular-nums">{fmtN(totais.paletes)}</td>
                      <td className="px-3 py-2.5 text-right font-bold text-cobeb-navy tabular-nums">{fmtN(totais.cx)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </DashboardLayout>
  )
}
