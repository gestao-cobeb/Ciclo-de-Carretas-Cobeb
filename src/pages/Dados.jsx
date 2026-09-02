import { useState, useEffect, useMemo } from 'react'
import { X, FileDown } from 'lucide-react'
import * as XLSX from 'xlsx'
import AdminLayout from '../components/AdminLayout'
import { supabase } from '../lib/supabase'

function diffHHMM(start, end) {
  if (!start || !end) return '—'
  const ms = new Date(end) - new Date(start)
  if (ms <= 0) return '—'
  const h = Math.floor(ms / 3600000)
  const m = Math.floor((ms % 3600000) / 60000)
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

function fmtDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('pt-BR')
}

function fmtTs(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  return (
    d.toLocaleDateString('pt-BR') + ' ' +
    d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  )
}

const selCls  = 'bg-white border border-cobeb-border rounded-xl px-3 py-2 text-cobeb-text text-xs focus:outline-none focus:border-cobeb-blue appearance-none cursor-pointer'
const dateCls = 'flex-1 bg-white border border-cobeb-border rounded-xl px-3 py-1.5 text-cobeb-text text-xs focus:outline-none focus:border-cobeb-blue [color-scheme:light]'

// ── Definição das colunas ────────────────────────────────────────────────────

const COLS = [
  { label: 'Data Viagem',        key: 'data_viagem',          min: 90  },
  { label: 'Carreta',            key: 'carreta',              min: 90  },
  { label: 'Cavalo',             key: 'cavalo',               min: 90  },
  { label: 'NF',                  key: 'nf',                   min: 100 },
  { label: 'Fábrica',            key: 'fabrica',              min: 160 },
  { label: 'Revenda (CD)',       key: 'revenda',              min: 150 },
  { label: 'Saída Revenda',      key: 'dt_saida_revenda',     min: 128 },
  { label: 'Chegada Fábrica',    key: 'dt_chegada_fabrica',   min: 128 },
  { label: 'Saída Fábrica',      key: 'dt_saida_fabrica',     min: 128 },
  { label: 'Chegada Revenda',    key: 'dt_chegada_revenda',   min: 128 },
  { label: 'Entrada Portaria',   key: 'dt_entrada',           min: 128 },
  { label: 'Início Conferência', key: 'dt_inicio_conf',       min: 128 },
  { label: 'Fim Conferência',    key: 'dt_fim_conf',          min: 128 },
  { label: 'Saída Portaria',     key: 'dt_saida_portaria',    min: 128 },
  { label: 'Fim Viagem',         key: 'dt_saida_entrega',     min: 128 },
  { label: 'Rev→Fab',           key: 'trecho_rev_fab',        min: 82  },
  { label: 'Fab→Rev',           key: 'trecho_fab_rev',        min: 82  },
  { label: 'TMA Fábrica',        key: 'tma_fab',              min: 90  },
  { label: 'TMA Revenda',        key: 'tma_rev',              min: 90  },
  { label: 'Aguardo (fila)',     key: 'aguardo',              min: 100 },
  { label: 'Conferência',        key: 'tempo_conf',           min: 95  },
  { label: 'TMV',                key: 'tmv',                  min: 72  },
]

const METRIC_KEYS = new Set([
  'trecho_rev_fab', 'trecho_fab_rev',
  'tma_fab', 'tma_rev', 'aguardo', 'tempo_conf', 'tmv',
])

const TABLE_MIN_WIDTH = COLS.reduce((s, c) => s + c.min, 0)

// ── Valor de cada célula ──────────────────────────────────────────────────────

function cellValue(row, key) {
  const t = row._tarefa
  const p = row._portaria
  switch (key) {
    case 'data_viagem':        return fmtDate(row.dt_saida_revenda)
    case 'carreta':            return row.carreta?.placa  ?? '—'
    case 'cavalo':             return row.cavalo?.placa   ?? '—'
    case 'nf':                 return row._nf
    case 'fabrica':            return row._fabricas
    case 'revenda':            return row.unidade?.nome   ?? '—'
    case 'dt_saida_revenda':   return fmtTs(row.dt_saida_revenda)
    case 'dt_chegada_fabrica': return fmtTs(row.dt_chegada_fabrica)
    case 'dt_saida_fabrica':   return fmtTs(row.dt_saida_fabrica)
    case 'dt_chegada_revenda': return fmtTs(row.dt_chegada_revenda)
    case 'dt_entrada':         return fmtTs(p?.dt_entrada)
    case 'dt_inicio_conf':     return fmtTs(t?.dt_inicio_conferencia)
    case 'dt_fim_conf':        return fmtTs(t?.dt_fim_conferencia)
    case 'dt_saida_portaria':  return fmtTs(p?.dt_saida)
    case 'dt_saida_entrega':   return fmtTs(row.dt_saida_entrega)
    case 'trecho_rev_fab':     return diffHHMM(row.dt_saida_revenda,    row.dt_chegada_fabrica)
    case 'trecho_fab_rev':     return diffHHMM(row.dt_saida_fabrica,    row.dt_chegada_revenda)
    case 'tma_fab':            return diffHHMM(row.dt_chegada_fabrica,  row.dt_saida_fabrica)
    case 'tma_rev':            return diffHHMM(row.dt_chegada_revenda,  p?.dt_saida)
    case 'aguardo':            return diffHHMM(row.dt_chegada_revenda,  p?.dt_entrada)
    case 'tempo_conf':         return diffHHMM(t?.dt_inicio_conferencia, t?.dt_fim_conferencia)
    case 'tmv':                return diffHHMM(row.dt_saida_revenda,    p?.dt_saida)
    default:                   return '—'
  }
}

// ── Componente principal ──────────────────────────────────────────────────────

export default function Dados() {
  const [rows,     setRows]     = useState([])
  const [unidades, setUnidades] = useState([])
  const [loading,  setLoading]  = useState(true)

  const [filtroUnidade, setFiltroUnidade] = useState('')
  const [filtroDataDe,  setFiltroDataDe]  = useState('')
  const [filtroDataAte, setFiltroDataAte] = useState('')

  useEffect(() => { carregar() }, [])
  useEffect(() => {
    const timer = setInterval(() => carregar(true), 30000)
    return () => clearInterval(timer)
  }, [])

  async function carregar(silent = false) {
    if (!silent) setLoading(true)

    const [{ data: viagens }, { data: unids }] = await Promise.all([
      supabase
        .from('viagens')
        .select(`
          id, status,
          dt_saida_revenda, dt_chegada_fabrica, dt_saida_fabrica,
          dt_chegada_revenda, dt_saida_entrega,
          carreta:carretas(placa),
          cavalo:cavalos(placa),
          unidade:unidades(id, nome, cidade)
        `)
        .not('dt_saida_revenda', 'is', null)
        .order('dt_saida_revenda', { ascending: false }),
      supabase
        .from('unidades')
        .select('id, nome, cidade')
        .eq('tipo', 'revenda')
        .order('nome'),
    ])

    const viagemIds = (viagens ?? []).map(v => v.id)

    if (!viagemIds.length) {
      setRows([])
      setUnidades(unids ?? [])
      if (!silent) setLoading(false)
      return
    }

    const [{ data: peds }, { data: tarefas }, { data: portarias }] = await Promise.all([
      supabase
        .from('pedidos')
        .select('viagem_id, numero_pedido, codigo_fabrica')
        .in('viagem_id', viagemIds),
      supabase
        .from('tarefas')
        .select('viagem_id, numero_nf, dt_inicio_conferencia, dt_fim_conferencia')
        .in('viagem_id', viagemIds),
      supabase
        .from('portaria_atendimentos')
        .select('viagem_id, dt_entrada, dt_saida')
        .in('viagem_id', viagemIds)
        .is('excluido_em', null),
    ])

    // Nomes das fábricas via codigo_ambev
    const codigos = [...new Set((peds ?? []).map(p => p.codigo_fabrica).filter(Boolean))]
    const fabMap  = {}
    if (codigos.length) {
      const { data: fabData } = await supabase
        .from('unidades')
        .select('codigo_ambev, nome')
        .eq('tipo', 'fabrica')
        .in('codigo_ambev', codigos)
      ;(fabData ?? []).forEach(f => { fabMap[f.codigo_ambev] = f.nome })
    }

    // Mapas por viagem_id
    const pedMap = {}
    ;(peds ?? []).forEach(p => {
      if (!pedMap[p.viagem_id]) pedMap[p.viagem_id] = { numeros: [], fabricas: new Set() }
      pedMap[p.viagem_id].numeros.push(p.numero_pedido)
      if (p.codigo_fabrica)
        pedMap[p.viagem_id].fabricas.add(fabMap[p.codigo_fabrica] ?? p.codigo_fabrica)
    })

    const tarefaMap  = {}
    ;(tarefas ?? []).forEach(t => {
      if (!tarefaMap[t.viagem_id]) tarefaMap[t.viagem_id] = t
    })

    const portariaMap = {}
    ;(portarias ?? []).forEach(p => { portariaMap[p.viagem_id] = p })

    const mapped = (viagens ?? []).map(v => ({
      ...v,
      _nf:       tarefaMap[v.id]?.numero_nf ?? '—',
      _fabricas: [...(pedMap[v.id]?.fabricas ?? new Set())].join(' · ') || '—',
      _tarefa:   tarefaMap[v.id]   ?? {},
      _portaria: portariaMap[v.id] ?? {},
    }))

    setRows(mapped)
    setUnidades(unids ?? [])
    if (!silent) setLoading(false)
  }

  const rowsFiltradas = useMemo(() => {
    return rows.filter(r => {
      if (filtroUnidade && r.unidade?.id !== filtroUnidade) return false
      const ref = (r.dt_saida_revenda ?? '').slice(0, 10)
      if (filtroDataDe  && ref < filtroDataDe)  return false
      if (filtroDataAte && ref > filtroDataAte) return false
      return true
    })
  }, [rows, filtroUnidade, filtroDataDe, filtroDataAte])

  const temFiltro = filtroUnidade || filtroDataDe || filtroDataAte

  function resetFiltros() {
    setFiltroUnidade('')
    setFiltroDataDe('')
    setFiltroDataAte('')
  }

  function exportarXlsx() {
    const header = COLS.map(c => c.label)
    const dataRows = rowsFiltradas.map(row => COLS.map(col => {
      const v = cellValue(row, col.key)
      return v === '—' ? '' : v
    }))
    const ws = XLSX.utils.aoa_to_sheet([header, ...dataRows])
    const colWidths = COLS.map(col => ({ wch: Math.max(col.label.length, 12) }))
    ws['!cols'] = colWidths
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Dados')
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, '')
    XLSX.writeFile(wb, `COBEB_Dados_${date}.xlsx`)
  }

  return (
    <AdminLayout title="Dados">
      <div className="px-4 pt-5 pb-6 space-y-4">

        {/* ── Filtros ─────────────────────────────────────────────────────── */}
        <div className="space-y-2">
          <select
            value={filtroUnidade}
            onChange={e => setFiltroUnidade(e.target.value)}
            className={`w-full ${selCls}`}
          >
            <option value="">Todos os CDs</option>
            {unidades.map(u => (
              <option key={u.id} value={u.id}>{u.nome} — {u.cidade}</option>
            ))}
          </select>

          <div className="flex items-center gap-2">
            <input
              type="date"
              value={filtroDataDe}
              max={filtroDataAte || undefined}
              onChange={e => setFiltroDataDe(e.target.value)}
              className={dateCls}
            />
            <span className="text-slate-400 text-xs shrink-0">até</span>
            <input
              type="date"
              value={filtroDataAte}
              min={filtroDataDe || undefined}
              onChange={e => setFiltroDataAte(e.target.value)}
              className={dateCls}
            />
            {(filtroDataDe || filtroDataAte) && (
              <button
                onClick={() => { setFiltroDataDe(''); setFiltroDataAte('') }}
                className="text-slate-500 hover:text-cobeb-yellow transition-colors shrink-0"
              >
                <X size={15} />
              </button>
            )}
          </div>

          {temFiltro && (
            <button
              onClick={resetFiltros}
              className="text-xs text-slate-500 hover:text-cobeb-yellow transition-colors"
            >
              Limpar filtros
            </button>
          )}
        </div>

        {/* ── Contagem + Exportar ──────────────────────────────────────────── */}
        <div className="flex items-center justify-between">
          <p className="text-slate-400 text-xs">
            {loading
              ? 'Carregando...'
              : `${rowsFiltradas.length} viagem${rowsFiltradas.length !== 1 ? 's' : ''}`}
          </p>
          {!loading && rowsFiltradas.length > 0 && (
            <button
              onClick={exportarXlsx}
              className="flex items-center gap-1.5 text-xs font-semibold text-cobeb-navy border border-cobeb-border bg-white rounded-xl px-3 py-1.5 hover:bg-cobeb-navy hover:text-white transition-colors"
            >
              <FileDown size={13} />
              Exportar .xlsx
            </button>
          )}
        </div>

        {/* ── Tabela ───────────────────────────────────────────────────────── */}
        {loading ? (
          <div className="flex justify-center py-14">
            <div className="w-6 h-6 border-2 border-cobeb-blue border-t-transparent rounded-full animate-spin" />
          </div>
        ) : rowsFiltradas.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-2">
            <p className="text-slate-400 text-sm">Nenhuma viagem encontrada</p>
            {temFiltro && (
              <button onClick={resetFiltros} className="text-xs text-cobeb-yellow hover:underline">
                Limpar filtros
              </button>
            )}
          </div>
        ) : (
          <div
            className="overflow-x-auto rounded-2xl border border-cobeb-border shadow-sm"
            style={{ WebkitOverflowScrolling: 'touch' }}
          >
            <table
              className="border-collapse text-xs"
              style={{ minWidth: `${TABLE_MIN_WIDTH}px` }}
            >
              <thead>
                <tr>
                  {COLS.map(col => (
                    <th
                      key={col.key}
                      style={{ minWidth: `${col.min}px` }}
                      className={`
                        px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wide
                        whitespace-nowrap border-r border-b last:border-r-0
                        ${METRIC_KEYS.has(col.key)
                          ? 'bg-cobeb-navy text-cobeb-yellow border-blue-900'
                          : 'bg-cobeb-navy text-blue-200 border-blue-900'}
                      `}
                    >
                      {col.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rowsFiltradas.map((row, ri) => (
                  <tr
                    key={row.id}
                    className={ri % 2 === 0 ? 'bg-white' : 'bg-[#EBF5FF]/50'}
                  >
                    {COLS.map(col => {
                      const val      = cellValue(row, col.key)
                      const isMetric = METRIC_KEYS.has(col.key)
                      const isEmpty  = val === '—'
                      return (
                        <td
                          key={col.key}
                          className={`
                            px-3 py-2 whitespace-nowrap
                            border-r border-cobeb-border/50 last:border-r-0
                            ${isMetric
                              ? isEmpty
                                ? 'text-slate-300 bg-cobeb-yellow/[0.04]'
                                : 'text-cobeb-navy font-mono font-semibold bg-cobeb-yellow/[0.04]'
                              : isEmpty
                                ? 'text-slate-300'
                                : 'text-cobeb-text'}
                          `}
                        >
                          {val}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AdminLayout>
  )
}
