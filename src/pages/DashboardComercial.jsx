import { useState, useEffect, useMemo } from 'react'
import DashboardLayout from '../components/DashboardLayout'
import { supabase } from '../lib/supabase'

const SEGMENTOS = [
  { key: 'cerveja',  label: 'Cerveja',    cor: '#003DA5' },
  { key: 'nab',      label: 'NAB',        cor: '#0D9488' },
  { key: 'rgb',      label: 'RGB Cerveja',cor: '#7C3AED' },
  { key: 'cervZero', label: 'Zero Álcool',cor: '#6366F1' },
  { key: 'nabZero',  label: 'NAB Zero',   cor: '#14B8A6' },
  { key: 'highEnd',  label: 'High End',   cor: '#F59E0B' },
  { key: 'match',    label: 'Match',      cor: '#EF4444' },
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

function ptDate(iso) {
  if (!iso) return '—'
  const [, mm, dd] = iso.split('-')
  return `${dd}/${mm}`
}

export default function DashboardComercial() {
  const [dataInicio,  setDataInicio]  = useState(firstDay)
  const [dataFim,     setDataFim]     = useState(lastDay)
  const [unidades,    setUnidades]    = useState([])
  const [fabricas,    setFabricas]    = useState([])
  const [segFiltro,   setSegFiltro]   = useState([])

  const [loading,     setLoading]     = useState(true)
  const [optUnidades, setOptUnidades] = useState([])
  const [optFabricas, setOptFabricas] = useState([])

  const [catMap,      setCatMap]      = useState({})
  const [zeroCervSet, setZeroCervSet] = useState(new Set())
  const [zeroNabSet,  setZeroNabSet]  = useState(new Set())
  const [highEndSet,  setHighEndSet]  = useState(new Set())
  const [pedidos,     setPedidos]     = useState([])

  // Dados estáticos — carregados uma vez
  useEffect(() => {
    async function load() {
      const [{ data: unis }, { data: fabs }, { data: dpz }, { data: dem }] = await Promise.all([
        supabase.from('unidades').select('id, nome').eq('tipo', 'revenda').eq('ativo', true).order('nome'),
        supabase.from('unidades').select('id, nome, codigo_ambev').eq('tipo', 'fabrica').eq('ativo', true).order('nome'),
        supabase.from('depara_zero').select('cod_promax, tipo'),
        supabase.from('demanda').select('cod_promax, tipo'),
      ])
      setOptUnidades(unis ?? [])
      setOptFabricas((fabs ?? []).filter(f => f.codigo_ambev))

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

  // Pedidos — recarrega quando data, CD ou fábrica muda
  useEffect(() => {
    if (!dataInicio || !dataFim) return
    async function load() {
      setLoading(true)

      let q = supabase
        .from('pedidos')
        .select('numero_pedido, placa, revenda, cod_produto, qtde_pallets, qtde_skus, data_puxada, viagem_id, status, unidade_id, codigo_fabrica')
        .gte('data_puxada', dataInicio)
        .lte('data_puxada', dataFim)
        .neq('status', 'cancelado')
        .not('cod_produto', 'is', null)
        .gt('qtde_pallets', 0)

      if (unidades.length) q = q.in('unidade_id', unidades)
      if (fabricas.length) q = q.in('codigo_fabrica', fabricas)

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
  }, [dataInicio, dataFim, unidades, fabricas])

  const today = new Date().toISOString().slice(0, 10)

  // Classifica cada linha de pedido com segmentos e HL
  const linhasClassificadas = useMemo(() => {
    const result = []
    pedidos.forEach(p => {
      const iso = p.data_puxada?.slice(0, 10)
      if (!iso) return
      const isPast     = iso < today
      const isRealized = p.viagem_id != null || p.status === 'realizado'
      if (isPast && !isRealized) return

      const cat = catMap[p.cod_produto]
      if (!cat) return

      const hl = (p.qtde_pallets || 0) * (cat.caixas_pallet || 0) * (cat.nr_fator_conversao || 0)
      if (hl <= 0) return

      const tm     = cat.tipo_marca ?? ''
      const emb    = cat.embalagem  ?? ''
      const isCerv = tm === '001 - CERVEJA' || tm === '028 - BEBIDAS QUENTES'
      const isRGB  = isCerv && (emb.startsWith('017') || emb.startsWith('018') || emb.startsWith('085'))

      result.push({
        numeroPedido: p.numero_pedido,
        placa:        p.placa || '—',
        revenda:      p.revenda || '—',
        data:         iso,
        codigo:       p.cod_produto,
        descricao:    cat.descricao || p.cod_produto,
        hl,
        paletes: p.qtde_pallets || 0,
        cx:      p.qtde_skus    || 0,
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

  // HL por segmento para os cards (sem filtro de segmento)
  const hlPorSegmento = useMemo(() => {
    const acc = {}
    SEGMENTOS.forEach(s => { acc[s.key] = 0 })
    linhasClassificadas.forEach(l => {
      SEGMENTOS.forEach(s => { if (l.tags[s.key]) acc[s.key] += l.hl })
    })
    return acc
  }, [linhasClassificadas])

  // Cards agrupados por numero_pedido; filtro de segmento aplicado nos SKUs
  const cards = useMemo(() => {
    const map = {}
    linhasClassificadas.forEach(l => {
      const key = `${l.numeroPedido}`
      if (!map[key]) map[key] = {
        numeroPedido: l.numeroPedido,
        placa:   l.placa,
        revenda: l.revenda,
        data:    l.data,
        skus:    [],
      }
      if (segFiltro.length > 0 && !segFiltro.some(s => l.tags[s])) return
      map[key].skus.push(l)
    })
    return Object.values(map)
      .filter(c => c.skus.length > 0)
      .sort((a, b) =>
        (a.placa).localeCompare(b.placa) || (a.data).localeCompare(b.data)
      )
  }, [linhasClassificadas, segFiltro])

  const totaisGerais = useMemo(() => ({
    hl:      cards.reduce((s, c) => s + c.skus.reduce((ss, sk) => ss + sk.hl,      0), 0),
    paletes: cards.reduce((s, c) => s + c.skus.reduce((ss, sk) => ss + sk.paletes, 0), 0),
    cx:      cards.reduce((s, c) => s + c.skus.reduce((ss, sk) => ss + sk.cx,      0), 0),
  }), [cards])

  function toggleUnidade(id) {
    setUnidades(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }
  function toggleFabrica(cod) {
    setFabricas(prev => prev.includes(cod) ? prev.filter(x => x !== cod) : [...prev, cod])
  }
  function toggleSeg(key) {
    setSegFiltro(prev => prev.includes(key) ? prev.filter(x => x !== key) : [...prev, key])
  }

  const dateCls = 'border border-cobeb-border rounded-xl px-3 py-2 text-xs text-cobeb-text bg-white focus:outline-none focus:border-cobeb-blue/60'
  const btnBase = 'px-3 py-1.5 rounded-xl text-xs font-semibold border transition-colors'
  const btnOn   = 'bg-cobeb-navy text-white border-cobeb-navy'
  const btnOff  = 'bg-white text-slate-500 border-cobeb-border hover:border-cobeb-blue/40'

  const cardsHLAtivos = segFiltro.length > 0
    ? SEGMENTOS.filter(s => segFiltro.includes(s.key))
    : SEGMENTOS

  return (
    <DashboardLayout>
      <div className="px-4 pt-5 pb-8 space-y-4">

        {/* ── Filtros ─────────────────────────────────────────────────────── */}
        <div className="bg-white rounded-2xl border border-cobeb-border shadow-sm p-4 space-y-3">

          <div className="flex items-center gap-2">
            <input type="date" value={dataInicio} max={dataFim || undefined}
              onChange={e => setDataInicio(e.target.value)} className={dateCls} />
            <span className="text-slate-400 text-xs shrink-0">até</span>
            <input type="date" value={dataFim} min={dataInicio || undefined}
              onChange={e => setDataFim(e.target.value)} className={dateCls} />
          </div>

          <div>
            <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wide mb-1.5">CD</p>
            <div className="flex flex-wrap gap-1.5">
              <button onClick={() => setUnidades([])} className={`${btnBase} ${unidades.length === 0 ? btnOn : btnOff}`}>Todos os CDs</button>
              {optUnidades.map(u => (
                <button key={u.id} onClick={() => toggleUnidade(u.id)}
                  className={`${btnBase} ${unidades.includes(u.id) ? btnOn : btnOff}`}>{u.nome}</button>
              ))}
            </div>
          </div>

          {optFabricas.length > 0 && (
            <div>
              <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wide mb-1.5">Fábrica</p>
              <div className="flex flex-wrap gap-1.5">
                <button onClick={() => setFabricas([])} className={`${btnBase} ${fabricas.length === 0 ? btnOn : btnOff}`}>Todas as fábricas</button>
                {optFabricas.map(f => (
                  <button key={f.id} onClick={() => toggleFabrica(f.codigo_ambev)}
                    className={`${btnBase} ${fabricas.includes(f.codigo_ambev) ? btnOn : btnOff}`}>{f.nome}</button>
                ))}
              </div>
            </div>
          )}

          <div>
            <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wide mb-1.5">Segmento</p>
            <div className="flex flex-wrap gap-1.5">
              <button onClick={() => setSegFiltro([])} className={`${btnBase} ${segFiltro.length === 0 ? btnOn : btnOff}`}>Todos</button>
              {SEGMENTOS.map(s => (
                <button key={s.key} onClick={() => toggleSeg(s.key)}
                  className={`${btnBase} ${segFiltro.includes(s.key) ? 'text-white border-transparent' : btnOff}`}
                  style={segFiltro.includes(s.key) ? { backgroundColor: s.cor, borderColor: s.cor } : {}}>
                  {s.label}
                </button>
              ))}
            </div>
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
              {cardsHLAtivos.map(s => (
                <div key={s.key}
                  className="bg-white rounded-2xl border border-cobeb-border shadow-sm p-4 flex flex-col gap-1"
                  style={{ borderLeftWidth: 4, borderLeftColor: s.cor }}>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{s.label}</p>
                  <p className="text-xl font-black tabular-nums" style={{ color: s.cor }}>{fmtHL(hlPorSegmento[s.key])}</p>
                  <p className="text-[10px] text-slate-400">HL</p>
                </div>
              ))}
            </div>

            {/* ── Resumo geral ──────────────────────────────────────────────── */}
            <div className="flex items-center justify-between px-1">
              <p className="text-xs text-slate-400">
                {cards.length} pedido{cards.length !== 1 ? 's' : ''} · {cards.reduce((s, c) => s + c.skus.length, 0)} SKUs
              </p>
              <div className="flex gap-3 text-xs text-cobeb-navy font-semibold">
                <span>{fmtHL(totaisGerais.hl)} HL</span>
                <span className="text-slate-400">·</span>
                <span>{fmtN(totaisGerais.paletes)} plt</span>
                <span className="text-slate-400">·</span>
                <span>{fmtN(totaisGerais.cx)} cx</span>
              </div>
            </div>

            {/* ── Cards de pedido ───────────────────────────────────────────── */}
            {cards.length === 0 ? (
              <div className="flex items-center justify-center py-16 text-slate-400 text-sm">
                Sem dados para o período
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                {cards.map(card => {
                  const totalHL  = card.skus.reduce((s, sk) => s + sk.hl,      0)
                  const totalPlt = card.skus.reduce((s, sk) => s + sk.paletes, 0)
                  const totalCx  = card.skus.reduce((s, sk) => s + sk.cx,      0)
                  return (
                    <div key={card.numeroPedido}
                      className="bg-white rounded-2xl border border-cobeb-border shadow-sm overflow-hidden">

                      {/* Cabeçalho do card */}
                      <div className="bg-cobeb-navy px-4 py-2.5 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="shrink-0 bg-cobeb-yellow text-cobeb-navy text-xs font-black px-2.5 py-0.5 rounded-lg tracking-wide">
                            {card.placa}
                          </span>
                          <span className="text-white text-xs font-semibold truncate">{card.revenda}</span>
                        </div>
                        <span className="shrink-0 text-blue-300/60 text-[10px] font-medium">
                          {ptDate(card.data)} · #{card.numeroPedido}
                        </span>
                      </div>

                      {/* SKUs */}
                      <div className="divide-y divide-cobeb-border/60">
                        {card.skus.map(sku => (
                          <div key={sku.codigo} className="px-4 py-2.5 flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-cobeb-text text-xs font-semibold truncate">{sku.descricao}</p>
                              <p className="text-slate-400 text-[10px] font-mono">{sku.codigo}</p>
                            </div>
                            <div className="shrink-0 text-right space-y-0.5">
                              <p className="text-cobeb-navy text-xs font-bold tabular-nums">{fmtHL(sku.hl)} HL</p>
                              <p className="text-slate-400 text-[10px] tabular-nums">
                                {fmtN(sku.paletes)} plt · {fmtN(sku.cx)} cx
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* Rodapé do card */}
                      <div className="bg-cobeb-sky border-t border-cobeb-border px-4 py-2 flex items-center justify-between">
                        <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wide">Total</span>
                        <div className="flex gap-3 text-[10px] font-bold text-cobeb-navy tabular-nums">
                          <span>{fmtHL(totalHL)} HL</span>
                          <span className="text-slate-300">·</span>
                          <span>{fmtN(totalPlt)} plt</span>
                          <span className="text-slate-300">·</span>
                          <span>{fmtN(totalCx)} cx</span>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </>
        )}
      </div>
    </DashboardLayout>
  )
}
