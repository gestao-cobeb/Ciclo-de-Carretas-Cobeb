import { useState, useEffect, useMemo } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ReferenceLine, ResponsiveContainer, LabelList,
} from 'recharts'
import { X } from 'lucide-react'
import DashboardLayout from '../components/DashboardLayout'
import { supabase } from '../lib/supabase'

// ── Helpers ───────────────────────────────────────────────────────────────────

function diffMin(start, end) {
  if (!start || !end) return null
  const ms = new Date(end) - new Date(start)
  return ms > 0 ? ms / 60000 : null
}

function minutesToHHMM(min) {
  if (min == null || isNaN(min)) return '—'
  const h = Math.floor(min / 60)
  const m = Math.floor(min % 60)
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

function groupByDay(rows, metricFn) {
  const map = {}
  rows.forEach(v => {
    const val = metricFn(v)
    if (val == null) return
    const isoDay = v.dt_saida_revenda?.slice(0, 10)
    if (!isoDay) return
    if (!map[isoDay]) map[isoDay] = { sum: 0, count: 0 }
    map[isoDay].sum += val
    map[isoDay].count++
  })
  return Object.entries(map)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([isoDay, { sum, count }]) => {
      const [, mm, dd] = isoDay.split('-')
      return { day: `${dd}/${mm}`, value: Math.round(sum / count), count }
    })
}

const LABEL_MES = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']

function groupByMonth(rows, metricFn) {
  const map = {}
  rows.forEach(v => {
    const val = metricFn(v)
    if (val == null) return
    const date = v.dt_saida_revenda
    if (!date) return
    const month = new Date(date).getMonth()
    if (!map[month]) map[month] = { sum: 0, count: 0 }
    map[month].sum += val
    map[month].count++
  })
  return LABEL_MES.map((label, i) => ({
    day:   label,
    value: map[i] ? Math.round(map[i].sum / map[i].count) : null,
    count: map[i]?.count ?? 0,
  }))
}

const LABEL_SEMANA = ['Seg','Ter','Qua','Qui','Sex','Sáb','Dom']

function groupByWeek(rows, metricFn) {
  const map = {}
  rows.forEach(v => {
    const val = metricFn(v)
    if (val == null) return
    const date = v.dt_saida_revenda
    if (!date) return
    const dow = (new Date(date).getDay() + 6) % 7 // 0=Seg … 6=Dom
    if (!map[dow]) map[dow] = { sum: 0, count: 0 }
    map[dow].sum += val
    map[dow].count++
  })
  return LABEL_SEMANA.map((label, i) => ({
    day:   label,
    value: map[i] ? Math.round(map[i].sum / map[i].count) : null,
    count: map[i]?.count ?? 0,
  }))
}

function groupByYear(rows, metricFn) {
  const map = {}
  rows.forEach(v => {
    const val = metricFn(v)
    if (val == null) return
    const date = v.dt_saida_revenda
    if (!date) return
    const year = String(new Date(date).getFullYear())
    if (!map[year]) map[year] = { sum: 0, count: 0 }
    map[year].sum += val
    map[year].count++
  })
  return Object.entries(map)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([year, { sum, count }]) => ({
      day: year, value: Math.round(sum / count), count,
    }))
}

function groupRows(rows, metricFn, agrupamento) {
  if (agrupamento === 'ano')    return groupByYear(rows, metricFn)
  if (agrupamento === 'mes')    return groupByMonth(rows, metricFn)
  if (agrupamento === 'semana') return groupByWeek(rows, metricFn)
  return groupByDay(rows, metricFn)
}

function calcAvg(data) {
  const valid = data.filter(d => d.value != null)
  if (!valid.length) return null
  return Math.round(valid.reduce((s, d) => s + d.value, 0) / valid.length)
}

function resolverTurno(dt, turnos) {
  if (!dt || !turnos.length) return '—'
  const d    = new Date(dt)
  const hora = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  for (const t of turnos) {
    const ini = t.hora_inicio.slice(0, 5)
    const fim = t.hora_fim.slice(0, 5)
    const match = ini < fim
      ? hora >= ini && hora < fim
      : hora >= ini || hora < fim
    if (match) return `Turno ${t.nome}`
  }
  return '—'
}

// ── Componentes de gráfico ────────────────────────────────────────────────────

function renderBarLabel({ x, y, width, value }) {
  if (!value) return null
  return (
    <text x={x + width / 2} y={y - 5}
      textAnchor="middle" fontSize={10} fontWeight={600} fill="#1E3A6E">
      {minutesToHHMM(value)}
    </text>
  )
}

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div style={{
      background: '#fff', border: '1px solid #BFDBFE',
      borderRadius: 12, padding: '10px 14px', fontSize: 12, boxShadow: '0 4px 12px rgba(0,0,0,.08)',
    }}>
      <p style={{ fontWeight: 600, color: '#1E3A6E', marginBottom: 4 }}>{label}</p>
      <p style={{ color: '#003DA5', fontWeight: 700 }}>{minutesToHHMM(payload[0].value)}</p>
      <p style={{ color: '#94A3B8', marginTop: 2 }}>
        {payload[0].payload.count} viagem{payload[0].payload.count !== 1 ? 's' : ''}
      </p>
    </div>
  )
}

function GraficoMetrica({ title, data, color }) {
  const avg         = calcAvg(data)
  const semDados    = data.length === 0 || data.every(d => d.value == null)
  const tickInterval = Math.max(0, Math.ceil(data.length / 12) - 1)

  return (
    <div className="bg-white rounded-2xl border border-cobeb-border shadow-sm p-4">
      <div className="flex items-center justify-between gap-3 mb-4">
        <h2 className="text-cobeb-text font-semibold text-sm">{title}</h2>
        {avg != null && (
          <span className="shrink-0 text-xs font-semibold text-cobeb-navy bg-cobeb-sky border border-cobeb-border rounded-lg px-2.5 py-1">
            Média: {minutesToHHMM(avg)}
          </span>
        )}
      </div>

      {semDados ? (
        <div className="flex items-center justify-center h-52 text-slate-400 text-sm">
          Sem dados para o período
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={data} margin={{ top: 20, right: 12, left: 4, bottom: 32 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#BFDBFE" vertical={false} />
            <XAxis
              dataKey="day"
              tick={{ fontSize: 10, fill: '#94A3B8' }}
              tickLine={false}
              axisLine={{ stroke: '#BFDBFE' }}
              angle={-35}
              textAnchor="end"
              interval={tickInterval}
            />
            <YAxis
              tickFormatter={minutesToHHMM}
              tick={{ fontSize: 10, fill: '#94A3B8' }}
              tickLine={false}
              axisLine={false}
              width={50}
            />
            <Tooltip content={<ChartTooltip />} cursor={{ fill: '#EBF5FF' }} />
            {avg != null && (
              <ReferenceLine
                y={avg}
                stroke="#EF4444"
                strokeDasharray="5 3"
                strokeWidth={1.5}
                label={{
                  value: `⌀ ${minutesToHHMM(avg)}`,
                  position: 'insideTopRight',
                  fontSize: 10,
                  fill: '#EF4444',
                  fontWeight: 600,
                }}
              />
            )}
            <Bar dataKey="value" fill={color} radius={[4, 4, 0, 0]} maxBarSize={44}>
              <LabelList dataKey="value" content={renderBarLabel} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}

// ── Estilos ───────────────────────────────────────────────────────────────────

const selCls   = 'bg-white border border-cobeb-border rounded-xl px-3 py-2 text-cobeb-text text-xs focus:outline-none focus:border-cobeb-blue appearance-none cursor-pointer w-full'
const dateCls  = 'flex-1 bg-white border border-cobeb-border rounded-xl px-3 py-1.5 text-cobeb-text text-xs focus:outline-none focus:border-cobeb-blue [color-scheme:light]'

const DEFAULT_FIM    = new Date().toISOString().slice(0, 10)
const DEFAULT_INICIO = new Date(Date.now() - 29 * 24 * 3600000).toISOString().slice(0, 10)

const LABEL_AGRUP = { dia: 'por Dia', semana: 'por Semana', mes: 'por Mês', ano: 'por Ano' }

// ── Componente principal ──────────────────────────────────────────────────────

export default function Dashboard() {
  // dados
  const [viagens,          setViagens]          = useState([])
  const [portariaMap,      setPortariaMap]      = useState({})
  const [fabricaViagemMap, setFabricaViagemMap] = useState({})
  const [dispersaoMap,     setDispersaoMap]     = useState({})
  const [loading,          setLoading]          = useState(true)

  // opções dos filtros
  const [optUnidades, setOptUnidades] = useState([])
  const [optFabricas, setOptFabricas] = useState([])
  const [optCavalos,  setOptCavalos]  = useState([])
  const [turnosMap,   setTurnosMap]   = useState({})

  // valores dos filtros
  const [dataInicio,       setDataInicio]       = useState(DEFAULT_INICIO)
  const [dataFim,          setDataFim]          = useState(DEFAULT_FIM)
  const [filtroUnidade,    setFiltroUnidade]    = useState('')
  const [filtroFrota,      setFiltroFrota]      = useState('')
  const [filtroFabrica,    setFiltroFabrica]    = useState('')
  const [filtroCavalo,     setFiltroCavalo]     = useState('')
  const [filtroTurno,      setFiltroTurno]      = useState('')
  const [filtroAgrupamento, setFiltroAgrupamento] = useState('dia')

  // opções dos selects — carregadas uma vez
  useEffect(() => {
    async function loadOpts() {
      const [{ data: u }, { data: f }, { data: c }, { data: turnData }] = await Promise.all([
        supabase.from('unidades').select('id, nome').eq('tipo', 'revenda').eq('ativo', true).order('nome'),
        supabase.from('unidades').select('id, nome, codigo_ambev').eq('tipo', 'fabrica').eq('ativo', true).order('nome'),
        supabase.from('cavalos').select('id, placa, tipo').eq('ativo', true).order('placa'),
        supabase.from('turnos').select('unidade_id, nome, hora_inicio, hora_fim').eq('ativo', true),
      ])
      if (u) setOptUnidades(u)
      if (f) setOptFabricas(f)
      if (c) setOptCavalos(c)
      if (turnData) {
        const tMap = {}
        turnData.forEach(t => {
          if (!tMap[t.unidade_id]) tMap[t.unidade_id] = []
          tMap[t.unidade_id].push(t)
        })
        setTurnosMap(tMap)
      }
    }
    loadOpts()
  }, [])

  // auto-ajuste do período ao mudar agrupamento
  useEffect(() => {
    const today   = new Date()
    const todayStr = today.toISOString().slice(0, 10)

    if (filtroAgrupamento === 'dia') {
      setDataInicio(DEFAULT_INICIO)
      setDataFim(DEFAULT_FIM)
    } else if (filtroAgrupamento === 'ano') {
      setDataInicio('2020-01-01')
      setDataFim(todayStr)
    } else if (filtroAgrupamento === 'mes') {
      setDataInicio(`${today.getFullYear()}-01-01`)
      setDataFim(todayStr)
    } else if (filtroAgrupamento === 'semana') {
      const dow         = today.getDay() // 0=Dom
      const sinceMonday = dow === 0 ? 6 : dow - 1
      const thisMonday  = new Date(today)
      thisMonday.setDate(today.getDate() - sinceMonday)
      const lastMonday  = new Date(thisMonday)
      lastMonday.setDate(thisMonday.getDate() - 7)
      const lastSunday  = new Date(thisMonday)
      lastSunday.setDate(thisMonday.getDate() - 1)
      setDataInicio(lastMonday.toISOString().slice(0, 10))
      setDataFim(lastSunday.toISOString().slice(0, 10))
    }
  }, [filtroAgrupamento])

  // dados — recarregam quando o período muda
  useEffect(() => { carregar() }, [dataInicio, dataFim])

  async function carregar() {
    setLoading(true)

    const { data: vData } = await supabase
      .from('viagens')
      .select(`
        id,
        dt_saida_revenda, dt_chegada_fabrica, dt_saida_fabrica,
        dt_chegada_revenda, dt_saida_entrega,
        unidade:unidades(id, nome),
        cavalo:cavalos(id, placa, tipo)
      `)
      .not('dt_saida_revenda', 'is', null)
      .gte('dt_saida_revenda', dataInicio + 'T00:00:00')
      .lte('dt_saida_revenda', dataFim + 'T23:59:59')
      .order('dt_saida_revenda')

    const vids = (vData ?? []).map(v => v.id)

    if (!vids.length) {
      setViagens([]); setPortariaMap({}); setFabricaViagemMap({}); setDispersaoMap({})
      setLoading(false)
      return
    }

    const [{ data: pData }, { data: pedData }, { data: dispData }] = await Promise.all([
      supabase
        .from('portaria_atendimentos')
        .select('viagem_id, dt_entrada, dt_saida')
        .in('viagem_id', vids)
        .is('excluido_em', null),
      supabase
        .from('pedidos')
        .select('viagem_id, codigo_fabrica')
        .in('viagem_id', vids)
        .not('codigo_fabrica', 'is', null),
      supabase
        .from('viagens_dispersao')
        .select('viagem_id, metrica')
        .in('viagem_id', vids),
    ])

    const pMap = {}
    ;(pData ?? []).forEach(p => { pMap[p.viagem_id] = p })

    const fabVMap = {}
    ;(pedData ?? []).forEach(p => {
      if (!fabVMap[p.viagem_id]) fabVMap[p.viagem_id] = new Set()
      fabVMap[p.viagem_id].add(p.codigo_fabrica)
    })

    const dMap = {}
    ;(dispData ?? []).forEach(d => {
      if (!dMap[d.viagem_id]) dMap[d.viagem_id] = new Set()
      dMap[d.viagem_id].add(d.metrica)
    })

    setViagens(vData ?? [])
    setPortariaMap(pMap)
    setFabricaViagemMap(fabVMap)
    setDispersaoMap(dMap)
    setLoading(false)
  }

  // filtros client-side + métricas pré-computadas
  const rows = useMemo(() => {
    const fabCodigo = filtroFabrica
      ? optFabricas.find(f => f.id === filtroFabrica)?.codigo_ambev ?? null
      : null

    return viagens
      .map(v => {
        const p    = portariaMap[v.id]
        const disp = dispersaoMap[v.id]
        return {
          ...v,
          _turno:   resolverTurno(v.dt_chegada_revenda, turnosMap[v.unidade?.id] ?? []),
          _tmv:     disp?.has('tmv')     ? null : diffMin(v.dt_saida_revenda,   p?.dt_saida),
          _tmaRev:  disp?.has('tma_rev') ? null : diffMin(v.dt_chegada_revenda,  p?.dt_saida),
          _tmaFab:  disp?.has('tma_fab') ? null : diffMin(v.dt_chegada_fabrica,  v.dt_saida_fabrica),
          _aguardo: disp?.has('aguardo') ? null : diffMin(v.dt_chegada_revenda,  p?.dt_entrada),
        }
      })
      .filter(v => {
        if (filtroUnidade && v.unidade?.id !== filtroUnidade) return false
        if (filtroFrota   && v.cavalo?.tipo !== filtroFrota)  return false
        if (filtroCavalo  && v.cavalo?.id   !== filtroCavalo) return false
        if (fabCodigo && !fabricaViagemMap[v.id]?.has(fabCodigo)) return false
        if (filtroTurno && v._turno !== `Turno ${filtroTurno}`)   return false
        return true
      })
  }, [viagens, portariaMap, fabricaViagemMap, dispersaoMap, turnosMap, filtroUnidade, filtroFrota, filtroCavalo, filtroFabrica, filtroTurno, optFabricas])

  const dadosTMV     = useMemo(() => groupRows(rows, r => r._tmv,     filtroAgrupamento), [rows, filtroAgrupamento])
  const dadosTMARev  = useMemo(() => groupRows(rows, r => r._tmaRev,  filtroAgrupamento), [rows, filtroAgrupamento])
  const dadosTMAFab  = useMemo(() => groupRows(rows, r => r._tmaFab,  filtroAgrupamento), [rows, filtroAgrupamento])
  const dadosAguardo = useMemo(() => groupRows(rows, r => r._aguardo, filtroAgrupamento), [rows, filtroAgrupamento])

  const temFiltro = filtroUnidade || filtroFrota || filtroFabrica || filtroCavalo || filtroTurno
  const datesLocked = filtroAgrupamento !== 'dia'

  function resetFiltros() {
    setFiltroUnidade(''); setFiltroFrota(''); setFiltroFabrica(''); setFiltroCavalo(''); setFiltroTurno('')
  }

  const lbl = LABEL_AGRUP[filtroAgrupamento]

  return (
    <DashboardLayout>
      <div className="px-4 pt-5 pb-8 space-y-5">

        {/* ── Filtros ──────────────────────────────────────────────────────── */}
        <div className="bg-white rounded-2xl border border-cobeb-border shadow-sm p-4 space-y-3">

          {/* Agrupamento */}
          <div className="flex gap-1.5">
            {[['dia', 'Por Dia'], ['semana', 'Semana'], ['mes', 'Mês'], ['ano', 'Ano']].map(([val, label]) => (
              <button key={val} onClick={() => setFiltroAgrupamento(val)}
                className={`flex-1 py-2 rounded-xl text-xs font-semibold border transition-colors ${
                  filtroAgrupamento === val
                    ? 'bg-cobeb-navy text-white border-cobeb-navy'
                    : 'bg-white text-slate-500 border-cobeb-border hover:border-cobeb-blue/40'
                }`}>
                {label}
              </button>
            ))}
          </div>

          {/* Período — visível apenas no modo Por Dia */}
          {!datesLocked && (
            <div className="flex items-center gap-2">
              <input type="date" value={dataInicio} max={dataFim || undefined}
                onChange={e => setDataInicio(e.target.value)} className={dateCls} />
              <span className="text-slate-400 text-xs shrink-0">até</span>
              <input type="date" value={dataFim} min={dataInicio || undefined}
                onChange={e => setDataFim(e.target.value)} className={dateCls} />
            </div>
          )}

          {/* Unidade + Fábrica */}
          <div className="grid grid-cols-2 gap-2">
            <select value={filtroUnidade} onChange={e => setFiltroUnidade(e.target.value)} className={selCls}>
              <option value="">Todos os CDs</option>
              {optUnidades.map(u => <option key={u.id} value={u.id}>{u.nome}</option>)}
            </select>
            <select value={filtroFabrica} onChange={e => setFiltroFabrica(e.target.value)} className={selCls}>
              <option value="">Todas as fábricas</option>
              {optFabricas.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
            </select>
          </div>

          {/* Cavalo + Frota */}
          <div className="grid grid-cols-2 gap-2">
            <select value={filtroCavalo} onChange={e => setFiltroCavalo(e.target.value)} className={selCls}>
              <option value="">Todos os cavalos</option>
              {optCavalos.map(c => (
                <option key={c.id} value={c.id}>{c.placa} ({c.tipo})</option>
              ))}
            </select>
            <div className="flex gap-1.5">
              {[['', 'Todos'], ['FF', 'FF'], ['SPOT', 'SPOT']].map(([val, label]) => (
                <button key={val} onClick={() => setFiltroFrota(val)}
                  className={`flex-1 py-2 rounded-xl text-xs font-semibold border transition-colors ${
                    filtroFrota === val
                      ? 'bg-cobeb-navy text-white border-cobeb-navy'
                      : 'bg-white text-slate-500 border-cobeb-border hover:border-cobeb-blue/40'
                  }`}>
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Turno */}
          <div className="flex gap-1.5">
            {[['', 'Todos os turnos'], ['A', 'Turno A'], ['B', 'Turno B'], ['C', 'Turno C']].map(([val, label]) => (
              <button key={val} onClick={() => setFiltroTurno(val)}
                className={`flex-1 py-2 rounded-xl text-xs font-semibold border transition-colors ${
                  filtroTurno === val
                    ? 'bg-cobeb-navy text-white border-cobeb-navy'
                    : 'bg-white text-slate-500 border-cobeb-border hover:border-cobeb-blue/40'
                }`}>
                {label}
              </button>
            ))}
          </div>

          {temFiltro && (
            <button onClick={resetFiltros}
              className="flex items-center gap-1 text-xs text-slate-500 hover:text-cobeb-yellow transition-colors">
              <X size={12} /> Limpar filtros
            </button>
          )}
        </div>

        {/* ── Contagem ─────────────────────────────────────────────────────── */}
        <p className="text-slate-400 text-xs">
          {loading
            ? 'Carregando...'
            : `${rows.length} viagem${rows.length !== 1 ? 's' : ''} no período`}
        </p>

        {/* ── Gráficos ─────────────────────────────────────────────────────── */}
        {loading ? (
          <div className="flex justify-center py-20">
            <div className="w-6 h-6 border-2 border-cobeb-blue border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="space-y-5">
            <GraficoMetrica
              title={`TMV ${lbl} — Saída Revenda → Saída Portaria`}
              data={dadosTMV}
              color="#003DA5"
            />
            <GraficoMetrica
              title={`TMA Revenda ${lbl} — Chegada Revenda → Saída Portaria`}
              data={dadosTMARev}
              color="#1D6AD4"
            />
            <GraficoMetrica
              title={`TMA Fábrica ${lbl} — Chegada Fábrica → Saída Fábrica`}
              data={dadosTMAFab}
              color="#FFB81C"
            />
            <GraficoMetrica
              title={`Fila ${lbl} — Chegada Revenda → Entrada Portaria`}
              data={dadosAguardo}
              color="#EF4444"
            />
          </div>
        )}

      </div>
    </DashboardLayout>
  )
}
