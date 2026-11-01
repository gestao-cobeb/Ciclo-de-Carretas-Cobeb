import { useState, useEffect, useMemo } from 'react'
import DashboardLayout from '../components/DashboardLayout'
import { supabase } from '../lib/supabase'
import * as XLSX from 'xlsx'
import { SlidersHorizontal } from 'lucide-react'

const SEGMENTOS = [
  { key: 'cerveja',  label: 'Cerveja',    cor: '#003DA5' },
  { key: 'nab',      label: 'NAB',        cor: '#0D9488' },
  { key: 'rgb',      label: 'RGB Cerveja',cor: '#7C3AED' },
  { key: 'cervZero', label: 'Zero Álcool',cor: '#6366F1' },
  { key: 'nabZero',  label: 'NAB Zero',   cor: '#14B8A6' },
  { key: 'highEnd',  label: 'High End',   cor: '#F59E0B' },
  { key: 'match',    label: 'Match',      cor: '#EF4444' },
]

const TABELAS_PRECO = ['Pratic', 'Cheia', 'Diferença']

// Mapeamento de status → label, cores e qual timestamp usar
const STATUS_CFG = {
  iniciada:               { label: 'Saída',      bg: 'bg-slate-100',   text: 'text-slate-500',   ts: v => v.created_at },
  em_transito:            { label: 'Em Rota',    bg: 'bg-purple-50',   text: 'text-purple-600',  ts: v => v.dt_saida_revenda },
  na_fabrica:             { label: 'Fábrica',    bg: 'bg-blue-50',     text: 'text-blue-600',    ts: v => v.dt_chegada_fabrica },
  retornando:             { label: 'Retornando', bg: 'bg-yellow-50',   text: 'text-yellow-600',  ts: v => v.dt_saida_fabrica },
  aguardando_conferencia: { label: 'Chegou',     bg: 'bg-green-50',    text: 'text-green-600',   ts: v => v.dt_chegada_revenda },
  concluida:              { label: 'Chegou',     bg: 'bg-green-50',    text: 'text-green-600',   ts: v => v.dt_chegada_revenda },
}

function todayStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function fmtHL(v) {
  if (!v) return '—'
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
}

function fmtN(v) {
  if (!v) return '—'
  return Math.round(v).toLocaleString('pt-BR')
}

function fmtR$(v) {
  if (!v) return '—'
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function fmtHora(ts) {
  if (!ts) return ''
  return new Date(ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

function StatusBadge({ info }) {
  if (!info) return (
    <span className="inline-flex items-center text-[10px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap bg-red-50 text-red-400">
      Não vinculado
    </span>
  )
  const cfg = STATUS_CFG[info.status] ?? STATUS_CFG.iniciada
  const hora = fmtHora(cfg.ts(info))
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${cfg.bg} ${cfg.text}`}>
      {cfg.label}{hora ? ` ${hora}` : ''}
    </span>
  )
}

// Igual ao Dashboard — busca preço vigente na data do pedido
function findPreco(precosMap, tabela, codigo, date) {
  const rows = precosMap[tabela]?.[codigo] ?? []
  if (!date) return null
  const d = date.slice(0, 10)
  const active = rows.find(r =>
    r.data_vigencia <= d && (r.data_fim_vigencia == null || r.data_fim_vigencia >= d)
  )
  if (active) return active.preco_total
  return rows.find(r => r.data_vigencia <= d)?.preco_total ?? null
}

export default function DashboardComercial() {
  const [dataInicio,    setDataInicio]    = useState(todayStr)
  const [dataFim,       setDataFim]       = useState(todayStr)
  const [unidades,      setUnidades]      = useState([])
  const [fabricas,      setFabricas]      = useState([])
  const [segFiltro,     setSegFiltro]     = useState([])
  const [tabelaPreco,      setTabelaPreco]      = useState('Pratic')
  const [filtrosVisiveis,  setFiltrosVisiveis]  = useState(true)

  const [loading,       setLoading]       = useState(true)
  const [optUnidades,   setOptUnidades]   = useState([])
  const [optFabricas,   setOptFabricas]   = useState([])
  const [precosMap,     setPrecosMap]     = useState({ Pratic: {}, Cheia: {} })

  const [catMap,        setCatMap]        = useState({})
  const [fabMap,        setFabMap]        = useState({})   // codigo_ambev → { nome, tipo }
  const [placaMap,      setPlacaMap]      = useState({})
  const [viagemInfoMap, setViagemInfoMap] = useState({})
  const [zeroCervSet,   setZeroCervSet]   = useState(new Set())
  const [zeroNabSet,    setZeroNabSet]    = useState(new Set())
  const [highEndSet,    setHighEndSet]    = useState(new Set())
  const [pedidos,       setPedidos]       = useState([])

  // Dados estáticos — carregados uma vez
  useEffect(() => {
    async function load() {
      const [{ data: unis }, { data: fabs }, { data: todasUnis }, { data: dpz }, { data: dem }, { data: precos }] = await Promise.all([
        supabase.from('unidades').select('id, nome').eq('tipo', 'revenda').eq('ativo', true).order('nome'),
        supabase.from('unidades').select('id, nome, codigo_ambev').eq('tipo', 'fabrica').eq('ativo', true).order('nome'),
        supabase.from('unidades').select('nome, tipo, codigo_ambev').not('codigo_ambev', 'is', null),
        supabase.from('depara_zero').select('cod_promax, tipo'),
        supabase.from('demanda').select('cod_promax, segmento'),
        supabase.from('precos_fabrica')
          .select('codigo, tabela, preco_total, data_vigencia, data_fim_vigencia')
          .not('data_vigencia', 'is', null)
          .order('data_vigencia', { ascending: false })
          .limit(100000),
      ])

      setOptUnidades(unis ?? [])
      setOptFabricas((fabs ?? []).filter(f => f.codigo_ambev))

      const fm = {}
      ;(todasUnis ?? []).forEach(u => { if (u.codigo_ambev) fm[u.codigo_ambev] = { nome: u.nome, tipo: u.tipo } })
      setFabMap(fm)

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
        if (d.segmento?.toUpperCase().includes('HIGH END')) hes.add(d.cod_promax)
      })
      setHighEndSet(hes)

      const pMap = { Pratic: {}, Cheia: {} }
      ;(precos ?? []).forEach(p => {
        if (!pMap[p.tabela]) pMap[p.tabela] = {}
        if (!pMap[p.tabela][p.codigo]) pMap[p.tabela][p.codigo] = []
        pMap[p.tabela][p.codigo].push({
          data_vigencia:     p.data_vigencia,
          data_fim_vigencia: p.data_fim_vigencia,
          preco_total:       p.preco_total,
        })
      })
      setPrecosMap(pMap)
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
        .select('cod_produto, placa, embalagem, qtde_pallets, qtde_skus, data_puxada, viagem_id, status, unidade_id, codigo_fabrica')
        .gte('data_puxada', dataInicio)
        .lte('data_puxada', dataFim)
        .neq('status', 'cancelado')
        .not('cod_produto', 'is', null)
        .gt('qtde_pallets', 0)

      if (unidades.length) q = q.in('unidade_id', unidades)
      if (fabricas.length) q = q.in('codigo_fabrica', fabricas)

      const { data: peds } = await q
      const pedList = peds ?? []

      // Placa do cavalo + dados de status da viagem
      const viagemIds = [...new Set(pedList.map(p => p.viagem_id).filter(Boolean))]
      const pm  = {}   // viagem_id → placa
      const vim = {}   // viagem_id → info de status
      if (viagemIds.length) {
        const { data: viagens } = await supabase
          .from('viagens')
          .select('id, cavalo_id, status, created_at, dt_saida_revenda, dt_chegada_fabrica, dt_saida_fabrica, dt_chegada_revenda')
          .in('id', viagemIds)

        const cavaloIds = [...new Set((viagens ?? []).map(v => v.cavalo_id).filter(Boolean))]
        if (cavaloIds.length) {
          const { data: cavalos } = await supabase
            .from('cavalos').select('id, placa').in('id', cavaloIds)
          const cavPlacaMap = Object.fromEntries((cavalos ?? []).map(c => [c.id, c.placa]))
          ;(viagens ?? []).forEach(v => {
            if (v.cavalo_id && cavPlacaMap[v.cavalo_id]) pm[v.id] = cavPlacaMap[v.cavalo_id]
            vim[v.id] = {
              status:             v.status,
              created_at:         v.created_at,
              dt_saida_revenda:   v.dt_saida_revenda,
              dt_chegada_fabrica: v.dt_chegada_fabrica,
              dt_saida_fabrica:   v.dt_saida_fabrica,
              dt_chegada_revenda: v.dt_chegada_revenda,
            }
          })
        } else {
          ;(viagens ?? []).forEach(v => {
            vim[v.id] = {
              status:             v.status,
              created_at:         v.created_at,
              dt_saida_revenda:   v.dt_saida_revenda,
              dt_chegada_fabrica: v.dt_chegada_fabrica,
              dt_saida_fabrica:   v.dt_saida_fabrica,
              dt_chegada_revenda: v.dt_chegada_revenda,
            }
          })
        }
      }
      setPlacaMap(pm)
      setViagemInfoMap(vim)

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

  const temTabela = tabelaPreco === 'Diferença'
    ? Object.keys(precosMap['Pratic'] ?? {}).length > 0 && Object.keys(precosMap['Cheia'] ?? {}).length > 0
    : Object.keys(precosMap[tabelaPreco] ?? {}).length > 0

  // Classifica cada linha de pedido com segmentos, HL, Valor e status da viagem
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

      // Valor — mesmo cálculo do GraficoValorFabrica
      const caixas = p.qtde_skus || 0
      const fator  = /^01[78]/.test(p.embalagem ?? '') ? 2 : 1
      let valor = 0
      if (caixas > 0) {
        if (tabelaPreco === 'Diferença') {
          const ptC = findPreco(precosMap, 'Cheia',  p.cod_produto, p.data_puxada)
          const ptP = findPreco(precosMap, 'Pratic', p.cod_produto, p.data_puxada)
          if (ptC && ptP) valor = caixas * fator * (ptC - ptP)
        } else {
          const pt = findPreco(precosMap, tabelaPreco, p.cod_produto, p.data_puxada)
          if (pt) valor = caixas * fator * pt
        }
      }

      const placa      = (p.viagem_id ? placaMap[p.viagem_id] : null) ?? p.placa ?? '—'
      const viagemInfo = p.viagem_id ? (viagemInfoMap[p.viagem_id] ?? null) : null
      const fabInfo    = p.codigo_fabrica ? (fabMap[p.codigo_fabrica] ?? null) : null
      const fabNome    = fabInfo?.nome ?? '—'
      const isTransfer = fabInfo != null && fabInfo.tipo !== 'fabrica'

      // Transferências internas não têm valor comercial
      if (isTransfer) valor = 0
      const tm         = cat.tipo_marca ?? ''
      const emb        = cat.embalagem  ?? ''
      const isCerv     = tm === '001 - CERVEJA' || tm === '028 - BEBIDAS QUENTES'
      const isRGB      = isCerv && (emb.startsWith('017') || emb.startsWith('018') || emb.startsWith('085'))

      result.push({
        placa,
        fabNome,
        isTransfer,
        viagemInfo,
        codigo:    p.cod_produto,
        descricao: cat.descricao || p.cod_produto,
        valor,
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
  }, [pedidos, catMap, fabMap, placaMap, viagemInfoMap, zeroCervSet, zeroNabSet, highEndSet, precosMap, tabelaPreco, today])

  // HL por segmento para os cards (sem filtro de segmento; exclui transferências internas)
  const hlPorSegmento = useMemo(() => {
    const acc = {}
    SEGMENTOS.forEach(s => { acc[s.key] = 0 })
    linhasClassificadas.forEach(l => {
      if (l.isTransfer) return
      SEGMENTOS.forEach(s => { if (l.tags[s.key]) acc[s.key] += l.hl })
    })
    return acc
  }, [linhasClassificadas])

  // Tabela agrupada por (placa + produto) com filtro de segmento
  const tableData = useMemo(() => {
    const map = {}
    linhasClassificadas.forEach(l => {
      if (segFiltro.length > 0 && !segFiltro.some(s => l.tags[s])) return
      const key = `${l.placa}||${l.codigo}`
      if (!map[key]) {
        map[key] = {
          placa:      l.placa,
          fabNome:    l.fabNome,
          isTransfer: l.isTransfer,
          viagemInfo: l.viagemInfo,
          codigo:     l.codigo,
          descricao:  l.descricao,
          valor:   0,
          hl:      0,
          paletes: 0,
          cx:      0,
        }
      }
      map[key].valor   += l.valor
      map[key].hl      += l.hl
      map[key].paletes += l.paletes
      map[key].cx      += l.cx
    })
    return Object.values(map).sort((a, b) =>
      a.placa.localeCompare(b.placa) || b.hl - a.hl
    )
  }, [linhasClassificadas, segFiltro])

  const totais = useMemo(() => ({
    valor:   tableData.reduce((s, r) => s + r.valor,   0),
    hl:      tableData.reduce((s, r) => s + r.hl,      0),
    paletes: tableData.reduce((s, r) => s + r.paletes, 0),
    cx:      tableData.reduce((s, r) => s + r.cx,      0),
  }), [tableData])

  function exportarExcel() {
    const header = [
      'Placa', 'Fábrica', 'Código', 'Descrição',
      `Valor (${tabelaPreco})`, 'HL', 'Paletes', 'CX', 'Status',
    ]
    const rows = tableData.map(r => {
      const cfg  = r.viagemInfo ? (STATUS_CFG[r.viagemInfo.status] ?? STATUS_CFG.iniciada) : null
      const hora = cfg ? fmtHora(cfg.ts(r.viagemInfo)) : ''
      const statusTxt = cfg ? `${cfg.label}${hora ? ` ${hora}` : ''}` : '—'
      return [
        r.placa,
        r.isTransfer ? `[Transf.] ${r.fabNome}` : r.fabNome,
        r.codigo,
        r.descricao,
        temTabela ? r.valor : '',
        r.hl,
        r.paletes,
        r.cx,
        statusTxt,
      ]
    })
    const totalRow = [
      'TOTAL', '', '', '',
      temTabela ? totais.valor : '',
      totais.hl,
      totais.paletes,
      totais.cx,
      '',
    ]
    const ws = XLSX.utils.aoa_to_sheet([header, ...rows, totalRow])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Comercial')
    const periodo = dataInicio === dataFim ? dataInicio : `${dataInicio}_${dataFim}`
    XLSX.writeFile(wb, `Comercial_${periodo}.xlsx`)
  }

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
        <div className="bg-white rounded-2xl border border-cobeb-border shadow-sm overflow-hidden">
          <button
            onClick={() => setFiltrosVisiveis(v => !v)}
            className="w-full flex items-center justify-between px-4 py-3 hover:bg-cobeb-sky/50 transition-colors"
          >
            <div className="flex items-center gap-2 text-cobeb-text text-xs font-semibold">
              <SlidersHorizontal size={13} />
              Filtros
              {(unidades.length > 0 || fabricas.length > 0 || segFiltro.length > 0) && (
                <span className="bg-cobeb-navy text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                  {unidades.length + fabricas.length + segFiltro.length}
                </span>
              )}
            </div>
            <span className="text-slate-400 text-[10px]">{filtrosVisiveis ? 'Ocultar' : 'Mostrar'}</span>
          </button>

          {filtrosVisiveis && <div className="px-4 pb-4 space-y-3">

            <div className="flex items-center gap-2 pt-1">
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

            <div>
              <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wide mb-1.5">Tabela de Preço</p>
              <div className="flex gap-1.5">
                {TABELAS_PRECO.map(t => (
                  <button key={t} onClick={() => setTabelaPreco(t)}
                    className={`${btnBase} ${tabelaPreco === t ? btnOn : btnOff}`}>
                    {t}
                  </button>
                ))}
              </div>
              {!temTabela && (
                <p className="text-[10px] text-amber-600 mt-1.5">
                  {tabelaPreco === 'Diferença'
                    ? 'Tabelas Pratic e Cheia precisam estar importadas.'
                    : `Tabela ${tabelaPreco} não importada. Acesse Importação de Bases.`}
                </p>
              )}
            </div>
          </div>}
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

            {/* ── Tabela de produtos ────────────────────────────────────────── */}
            <div className="bg-white rounded-2xl border border-cobeb-border shadow-sm overflow-hidden">
              <div className="px-4 py-2.5 border-b border-cobeb-border flex items-center justify-between">
                <p className="text-[11px] font-semibold text-slate-500">
                  {tableData.length} produto{tableData.length !== 1 ? 's' : ''}
                </p>
                <button
                  onClick={exportarExcel}
                  disabled={tableData.length === 0}
                  className="flex items-center gap-1.5 text-[11px] font-semibold text-cobeb-navy bg-cobeb-sky border border-cobeb-border hover:border-cobeb-blue/50 hover:bg-blue-50 disabled:opacity-40 px-3 py-1.5 rounded-xl transition-colors"
                >
                  ↓ Exportar Excel
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-cobeb-border bg-cobeb-sky">
                      <th className="text-left px-3 py-2.5 text-cobeb-text font-semibold whitespace-nowrap">Placa</th>
                      <th className="text-left px-3 py-2.5 text-cobeb-text font-semibold whitespace-nowrap">Fábrica</th>
                      <th className="text-left px-3 py-2.5 text-cobeb-text font-semibold whitespace-nowrap">Código</th>
                      <th className="text-left px-3 py-2.5 text-cobeb-text font-semibold">Descrição</th>
                      <th className="text-right px-3 py-2.5 text-cobeb-text font-semibold whitespace-nowrap">
                        Valor {tabelaPreco !== 'Diferença' ? `(${tabelaPreco})` : '(Dif.)'}
                      </th>
                      <th className="text-right px-3 py-2.5 text-cobeb-text font-semibold whitespace-nowrap">HL</th>
                      <th className="text-right px-3 py-2.5 text-cobeb-text font-semibold whitespace-nowrap">Paletes</th>
                      <th className="text-right px-3 py-2.5 text-cobeb-text font-semibold whitespace-nowrap">CX</th>
                      <th className="text-left px-3 py-2.5 text-cobeb-text font-semibold whitespace-nowrap">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tableData.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="text-center py-12 text-slate-400">
                          Sem dados para o período
                        </td>
                      </tr>
                    ) : tableData.map((row, i) => (
                      <tr key={`${row.placa}||${row.codigo}`} className={i % 2 === 0 ? 'bg-white' : 'bg-cobeb-sky/30'}>
                        <td className="px-3 py-2 font-semibold text-cobeb-text font-mono whitespace-nowrap">{row.placa}</td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          {row.isTransfer ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-orange-50 text-orange-500">
                              ⇄ {row.fabNome}
                            </span>
                          ) : (
                            <span className="text-xs text-cobeb-text">{row.fabNome}</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-slate-400 font-mono whitespace-nowrap">{row.codigo}</td>
                        <td className="px-3 py-2 text-cobeb-text">{row.descricao}</td>
                        <td className="px-3 py-2 text-right font-semibold text-emerald-700 tabular-nums">{temTabela ? fmtR$(row.valor) : '—'}</td>
                        <td className="px-3 py-2 text-right font-semibold text-cobeb-navy tabular-nums">{fmtHL(row.hl)}</td>
                        <td className="px-3 py-2 text-right text-cobeb-text tabular-nums">{fmtN(row.paletes)}</td>
                        <td className="px-3 py-2 text-right text-cobeb-text tabular-nums">{fmtN(row.cx)}</td>
                        <td className="px-3 py-2"><StatusBadge info={row.viagemInfo} /></td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-cobeb-navy/20 bg-cobeb-sky">
                      <td colSpan={4} className="px-3 py-2.5 font-bold text-cobeb-text">
                        Total — {tableData.length} linha{tableData.length !== 1 ? 's' : ''}
                      </td>
                      <td className="px-3 py-2.5 text-right font-bold text-emerald-700 tabular-nums">{temTabela ? fmtR$(totais.valor) : '—'}</td>
                      <td className="px-3 py-2.5 text-right font-bold text-cobeb-navy tabular-nums">{fmtHL(totais.hl)}</td>
                      <td className="px-3 py-2.5 text-right font-bold text-cobeb-navy tabular-nums">{fmtN(totais.paletes)}</td>
                      <td className="px-3 py-2.5 text-right font-bold text-cobeb-navy tabular-nums">{fmtN(totais.cx)}</td>
                      <td className="px-3 py-2.5" />
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
