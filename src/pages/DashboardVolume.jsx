import { useState, useEffect, useMemo } from 'react'
import { ChevronLeft, ChevronRight, AlertTriangle, TrendingUp, TrendingDown, Truck } from 'lucide-react'
import DashboardLayout from '../components/DashboardLayout'
import { supabase } from '../lib/supabase'

const SEGMENTOS = [
  'Cerveja', 'NAB', 'RGB Cerveja', 'Zero Álcool',
  'NAB Zero', 'High End', 'Match', 'Garrafa Meia',
]

const MESES = [
  'Janeiro','Fevereiro','Março','Abril','Maio','Junho',
  'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro',
]

function diasUteisRange(year, month, dIni, dFim) {
  const ultimo = new Date(year, month + 1, 0).getDate()
  let n = 0
  for (let d = dIni; d <= Math.min(dFim, ultimo); d++) {
    if (new Date(year, month, d).getDay() !== 0) n++
  }
  return n
}

function diasUteisMes(year, month) {
  return diasUteisRange(year, month, 1, new Date(year, month + 1, 0).getDate())
}

function semanaLimites(sem, year, month) {
  const ultimo = new Date(year, month + 1, 0).getDate()
  return { ini: (sem - 1) * 7 + 1, fim: sem < 4 ? sem * 7 : ultimo }
}

function semanaDoDia(day) {
  if (day <= 7) return 1
  if (day <= 14) return 2
  if (day <= 21) return 3
  return 4
}

function fmtHL(v) {
  if (v == null || isNaN(v)) return '—'
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
}

function fmtPct(v) {
  if (v == null || !isFinite(v)) return '—'
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 1 }) + '%'
}

// ── Sub-componentes ───────────────────────────────────────────────────────────

function TabelaVolume({ metas, hlData, diasUteis, diasPassados, showD0 }) {
  const totalMeta  = SEGMENTOS.reduce((s, g) => s + (metas[g] || 0), 0)
  const totalReal  = SEGMENTOS.reduce((s, g) => s + (hlData[g]?.total || 0), 0)
  const totalHoje  = SEGMENTOS.reduce((s, g) => s + (hlData[g]?.hoje || 0), 0)
  const metaDiariaTotal = diasUteis > 0 ? totalMeta / diasUteis : 0
  const diff0Total = totalHoje - metaDiariaTotal

  return (
    <div className="bg-white rounded-2xl border border-cobeb-border shadow-sm overflow-hidden">
      <div className="px-4 pt-4 pb-3 border-b border-cobeb-border/50">
        <h2 className="text-cobeb-text font-semibold text-sm">Volume por Segmento</h2>
        <p className="text-xs text-slate-400 mt-0.5">Meta de puxada mensal em HL por segmento de marca</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-[#EBF5FF]/60 border-b border-cobeb-border">
              <th className="px-4 py-2 text-left text-cobeb-navy font-semibold whitespace-nowrap">Segmento</th>
              <th className="px-3 py-2 text-right text-cobeb-navy font-semibold whitespace-nowrap">Meta (HL)</th>
              <th className="px-3 py-2 text-right text-cobeb-navy font-semibold whitespace-nowrap">Real (HL)</th>
              <th className="px-3 py-2 text-right text-cobeb-navy font-semibold whitespace-nowrap">% Ating.</th>
              {showD0 && <th className="px-3 py-2 text-right text-cobeb-navy font-semibold whitespace-nowrap">Saldo D0</th>}
              <th className="px-3 py-2 text-left text-cobeb-navy font-semibold whitespace-nowrap">Tendência</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-cobeb-border/40">
            {SEGMENTOS.map(seg => {
              const meta       = metas[seg] || 0
              const real       = hlData[seg]?.total || 0
              const hoje       = hlData[seg]?.hoje || 0
              const metaDiaria = diasUteis > 0 && meta > 0 ? meta / diasUteis : 0
              const diff0      = hoje - metaDiaria
              const pct        = meta > 0 ? real / meta * 100 : null
              const proj       = diasPassados > 0 && diasUteis > 0 ? (real / diasPassados) * diasUteis : null

              const pctColor  = pct  == null ? '' : pct  >= 100 ? 'text-emerald-600' : pct  >= 80 ? 'text-amber-600' : 'text-red-500'
              const d0Color   = meta === 0 ? '' : diff0 >= 0 ? 'text-emerald-600' : 'text-red-500'
              const projColor = proj == null || meta === 0 ? '' : proj >= meta ? 'text-emerald-600' : proj >= meta * 0.9 ? 'text-amber-600' : 'text-red-500'
              const ProjIcon  = proj == null || meta === 0 ? null : proj >= meta ? TrendingUp : TrendingDown

              return (
                <tr key={seg} className="hover:bg-cobeb-sky/30 transition-colors">
                  <td className="px-4 py-2.5 font-medium text-cobeb-text whitespace-nowrap">{seg}</td>
                  <td className="px-3 py-2.5 text-right text-slate-600">
                    {meta > 0 ? fmtHL(meta) : <span className="text-slate-300">—</span>}
                  </td>
                  <td className="px-3 py-2.5 text-right font-semibold text-cobeb-navy">{fmtHL(real)}</td>
                  <td className={`px-3 py-2.5 text-right font-semibold ${pctColor}`}>
                    {pct == null ? <span className="text-slate-300">—</span> : fmtPct(pct)}
                  </td>
                  {showD0 && (
                    <td className={`px-3 py-2.5 text-right font-semibold ${d0Color}`}>
                      {meta === 0
                        ? <span className="text-slate-300">—</span>
                        : `${diff0 >= 0 ? '+' : ''}${fmtHL(diff0)}`}
                    </td>
                  )}
                  <td className={`px-3 py-2.5 font-semibold ${projColor}`}>
                    {proj == null || meta === 0 ? (
                      <span className="text-slate-300">—</span>
                    ) : (
                      <span className="flex items-center gap-1">
                        {ProjIcon && <ProjIcon size={12} />}
                        {fmtHL(proj)} HL
                      </span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr className="bg-[#EBF5FF]/60 border-t-2 border-cobeb-navy/20">
              <td className="px-4 py-2.5 font-bold text-cobeb-navy">Total</td>
              <td className="px-3 py-2.5 text-right font-bold text-cobeb-navy">
                {totalMeta > 0 ? fmtHL(totalMeta) : '—'}
              </td>
              <td className="px-3 py-2.5 text-right font-bold text-cobeb-navy">{fmtHL(totalReal)}</td>
              <td className="px-3 py-2.5 text-right font-bold">
                {totalMeta > 0 ? (
                  <span className={totalReal / totalMeta >= 1 ? 'text-emerald-600' : totalReal / totalMeta >= 0.8 ? 'text-amber-600' : 'text-red-500'}>
                    {fmtPct(totalReal / totalMeta * 100)}
                  </span>
                ) : '—'}
              </td>
              {showD0 && (
                <td className={`px-3 py-2.5 text-right font-bold ${diff0Total >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                  {totalMeta > 0 ? `${diff0Total >= 0 ? '+' : ''}${fmtHL(diff0Total)}` : '—'}
                </td>
              )}
              <td className="px-3 py-2.5 font-bold">
                {diasPassados > 0 && totalMeta > 0 && diasUteis > 0 ? (() => {
                  const proj = totalReal / diasPassados * diasUteis
                  const color = proj >= totalMeta ? 'text-emerald-600' : proj >= totalMeta * 0.9 ? 'text-amber-600' : 'text-red-500'
                  const Icon  = proj >= totalMeta ? TrendingUp : TrendingDown
                  return (
                    <span className={`flex items-center gap-1 ${color}`}>
                      <Icon size={12} />{fmtHL(proj)} HL
                    </span>
                  )
                })() : <span className="text-slate-300">—</span>}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}

function CardSemanas({ year, month, semanas, metaTotalHL, hlData }) {
  const today         = new Date()
  const isCurrentMonth = year === today.getFullYear() && month === today.getMonth()
  const semanaAtual   = isCurrentMonth ? semanaDoDia(today.getDate()) : null
  const mm            = String(month + 1).padStart(2, '0')

  const hlPorDia = {}
  SEGMENTOS.forEach(seg => {
    Object.entries(hlData[seg]?.porDia ?? {}).forEach(([ds, hl]) => {
      hlPorDia[ds] = (hlPorDia[ds] || 0) + hl
    })
  })

  const pcts = [semanas.s1 || 0, semanas.s2 || 0, semanas.s3 || 0, semanas.s4 || 0]

  return (
    <div className="bg-white rounded-2xl border border-cobeb-border shadow-sm p-4">
      <h2 className="text-cobeb-text font-semibold text-sm mb-3">Volume por Semana</h2>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[1, 2, 3, 4].map(sem => {
          const { ini, fim } = semanaLimites(sem, year, month)
          const metaSem     = metaTotalHL * (pcts[sem - 1] / 100)

          let realSem = 0
          for (let d = ini; d <= fim; d++) {
            const ds = `${year}-${mm}-${String(d).padStart(2, '0')}`
            realSem += hlPorDia[ds] || 0
          }

          const pct      = metaSem > 0 ? realSem / metaSem * 100 : null
          const isActive = semanaAtual === sem
          const isPast   = isCurrentMonth && today.getDate() > fim
          const isFuture = isCurrentMonth && today.getDate() < ini

          const pctColor = pct == null ? '' : pct >= 100 ? 'text-emerald-600' : pct >= 80 ? 'text-amber-600' : 'text-red-500'

          return (
            <div key={sem} className={`rounded-xl border p-3 ${isActive ? 'border-cobeb-blue bg-[#EBF5FF]' : 'border-cobeb-border bg-cobeb-sky/20'}`}>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-semibold text-cobeb-navy">Sem. {sem}</span>
                {isActive && <span className="text-[9px] font-bold bg-cobeb-navy text-white px-1.5 py-0.5 rounded-full">Atual</span>}
                {isPast   && <span className="text-[9px] font-bold bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded-full">Concluída</span>}
                {isFuture && <span className="text-[9px] font-bold bg-slate-100 text-slate-400 px-1.5 py-0.5 rounded-full">Próxima</span>}
              </div>
              <p className="text-[10px] text-slate-400 mb-2">
                {String(ini).padStart(2,'0')}/{mm}–{String(fim).padStart(2,'0')}/{mm}
                <span className="ml-1 text-cobeb-navy font-semibold">({pcts[sem-1]}%)</span>
              </p>
              <div className="space-y-1">
                <div className="flex justify-between">
                  <span className="text-[10px] text-slate-400">Meta</span>
                  <span className="text-[10px] font-semibold text-slate-600">{metaSem > 0 ? fmtHL(metaSem) : '—'} HL</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[10px] text-slate-400">Real</span>
                  <span className="text-[10px] font-semibold text-cobeb-navy">{fmtHL(realSem)} HL</span>
                </div>
                {pct != null && (
                  <div className="flex justify-between">
                    <span className="text-[10px] text-slate-400">Ating.</span>
                    <span className={`text-[10px] font-bold ${pctColor}`}>{fmtPct(pct)}</span>
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function CardCarrosPorDia({ saldoHL, diasRestantes, hlPerPallet }) {
  const hlPorDia    = diasRestantes > 0 ? saldoHL / diasRestantes : 0
  const paletsPorDia = hlPerPallet > 0 ? hlPorDia / hlPerPallet : 0
  const carrosPorDia = paletsPorDia / 26

  if (saldoHL <= 0) {
    return (
      <div className="bg-white rounded-2xl border border-cobeb-border shadow-sm p-4">
        <div className="flex items-center gap-2 mb-2">
          <Truck size={15} className="text-cobeb-navy" />
          <h2 className="text-cobeb-text font-semibold text-sm">Necessidade de Carros por Dia</h2>
        </div>
        <p className="text-center py-5 text-emerald-600 font-semibold text-sm">
          Meta mensal atingida — sem necessidade adicional de carros
        </p>
      </div>
    )
  }

  if (diasRestantes === 0) {
    return (
      <div className="bg-white rounded-2xl border border-cobeb-border shadow-sm p-4">
        <div className="flex items-center gap-2 mb-2">
          <Truck size={15} className="text-cobeb-navy" />
          <h2 className="text-cobeb-text font-semibold text-sm">Necessidade de Carros por Dia</h2>
        </div>
        <p className="text-center py-5 text-slate-400 text-sm">Sem dias úteis restantes no mês</p>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-2xl border border-cobeb-border shadow-sm p-4">
      <div className="flex items-center gap-2 mb-4">
        <Truck size={15} className="text-cobeb-navy" />
        <h2 className="text-cobeb-text font-semibold text-sm">Necessidade de Carros por Dia</h2>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-[#EBF5FF] rounded-xl p-3 text-center">
          <p className="text-[10px] text-slate-400 mb-1">Saldo Restante</p>
          <p className="text-sm font-bold text-cobeb-navy">{fmtHL(saldoHL)} HL</p>
          <p className="text-[10px] text-slate-400 mt-0.5">{diasRestantes} dias úteis</p>
        </div>
        <div className="bg-[#EBF5FF] rounded-xl p-3 text-center">
          <p className="text-[10px] text-slate-400 mb-1">HL por Dia</p>
          <p className="text-sm font-bold text-cobeb-navy">{fmtHL(hlPorDia)} HL</p>
          <p className="text-[10px] text-slate-400 mt-0.5">necessário/dia</p>
        </div>
        <div className="bg-[#EBF5FF] rounded-xl p-3 text-center">
          <p className="text-[10px] text-slate-400 mb-1">Paletes por Dia</p>
          <p className="text-sm font-bold text-cobeb-navy">
            {paletsPorDia.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} plt
          </p>
          <p className="text-[10px] text-slate-400 mt-0.5">
            {hlPerPallet.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} HL/plt
          </p>
        </div>
        <div className="bg-cobeb-navy rounded-xl p-3 text-center">
          <p className="text-[10px] text-white/70 mb-1">Carros por Dia</p>
          <p className="text-xl font-black text-white">
            {carrosPorDia.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
          </p>
          <p className="text-[10px] text-white/60 mt-0.5">cap. 26 plt/carreta</p>
        </div>
      </div>
    </div>
  )
}

// ── Componente principal ──────────────────────────────────────────────────────

export default function DashboardVolume() {
  const [year,  setYear]  = useState(() => new Date().getFullYear())
  const [month, setMonth] = useState(() => new Date().getMonth())

  const [loading,     setLoading]     = useState(true)
  const [metaConfig,  setMetaConfig]  = useState(null)
  const [hlData,      setHlData]      = useState({})
  const [hlPerPallet, setHlPerPallet] = useState(1.44) // HL/pallet ratio, computed from catalog

  const mesRef = `${year}-${String(month + 1).padStart(2, '0')}`

  function navMes(dir) {
    let m = month + dir, y = year
    if (m < 0)  { m = 11; y-- }
    if (m > 11) { m = 0;  y++ }
    setMonth(m); setYear(y)
  }

  useEffect(() => {
    async function load() {
      setLoading(true)
      const monthStart = `${mesRef}-01`
      const lastDay    = new Date(year, month + 1, 0).getDate()
      const monthEnd   = `${mesRef}-${String(lastDay).padStart(2, '0')}`
      const todayStr   = new Date().toISOString().slice(0, 10)

      const [{ data: cfgData }, { data: pedsData }] = await Promise.all([
        supabase
          .from('dashboard_configs')
          .select('valor')
          .eq('chave', 'meta_volume_puxada')
          .maybeSingle(),
        supabase
          .from('pedidos')
          .select('cod_produto, qtde_pallets, data_puxada, status, viagem_id, codigo_fabrica')
          .gte('data_puxada', monthStart)
          .lte('data_puxada', monthEnd)
          .not('qtde_pallets', 'is', null)
          .gt('qtde_pallets', 0)
          .not('cod_produto', 'is', null)
          .not('codigo_fabrica', 'is', null),
      ])

      setMetaConfig(cfgData?.valor?.[mesRef] ?? null)

      const pedsAll = pedsData ?? []
      const skus    = [...new Set(pedsAll.map(p => p.cod_produto).filter(Boolean))]

      let catMap = {}
      if (skus.length) {
        const { data: catData } = await supabase
          .from('produtos_catalogo')
          .select('codigo, tipo_marca, caixas_pallet, nr_fator_conversao')
          .in('codigo', skus)
        ;(catData ?? []).forEach(c => { catMap[c.codigo] = c })
      }

      // Compute HL/pallet ratio from non-cancelled pedidos
      let totalPlt = 0, totalHLR = 0
      pedsAll.filter(p => p.status !== 'cancelado').forEach(p => {
        const cat = catMap[p.cod_produto]
        if (!cat) return
        const hl = (p.qtde_pallets || 0) * (cat.caixas_pallet || 0) * (cat.nr_fator_conversao || 0)
        if (hl > 0) { totalPlt += p.qtde_pallets || 0; totalHLR += hl }
      })
      if (totalPlt > 0 && totalHLR > 0) setHlPerPallet(totalHLR / totalPlt)

      // Real = pedidos linked to a viagem OR manually marked realizado
      const pedsReal = pedsAll.filter(p => p.viagem_id != null || p.status === 'realizado')

      // Aggregate by segment
      const result = {}
      SEGMENTOS.forEach(seg => { result[seg] = { total: 0, hoje: 0, porDia: {} } })

      pedsReal.forEach(p => {
        const cat = catMap[p.cod_produto]
        if (!cat) return
        const seg = cat.tipo_marca
        if (!SEGMENTOS.includes(seg)) return
        const hl = (p.qtde_pallets || 0) * (cat.caixas_pallet || 0) * (cat.nr_fator_conversao || 0)
        if (hl <= 0) return
        result[seg].total += hl
        const ds = p.data_puxada?.slice(0, 10)
        if (ds) {
          result[seg].porDia[ds] = (result[seg].porDia[ds] || 0) + hl
          if (ds === todayStr) result[seg].hoje += hl
        }
      })

      setHlData(result)
      setLoading(false)
    }
    load()
  }, [mesRef])

  const today         = new Date()
  const isCurrentMonth = year === today.getFullYear() && month === today.getMonth()
  const isSunday      = today.getDay() === 0
  const showD0        = isCurrentMonth && !isSunday

  const diasUteis = useMemo(() => diasUteisMes(year, month), [year, month])

  const diasPassados = useMemo(() => {
    if (!isCurrentMonth) return diasUteis
    return diasUteisRange(year, month, 1, new Date().getDate())
  }, [year, month, isCurrentMonth, diasUteis])

  const metas      = metaConfig?.metas   ?? {}
  const semanas    = metaConfig?.semanas ?? { s1: 30, s2: 30, s3: 20, s4: 20 }
  const metaTotalHL = SEGMENTOS.reduce((s, g) => s + (metas[g] || 0), 0)
  const realTotalHL = SEGMENTOS.reduce((s, g) => s + (hlData[g]?.total || 0), 0)
  const saldoTotalHL = Math.max(metaTotalHL - realTotalHL, 0)

  const ultimoDia     = new Date(year, month + 1, 0).getDate()
  const diasRestantes = isCurrentMonth
    ? diasUteisRange(year, month, today.getDate() + 1, ultimoDia)
    : 0

  return (
    <DashboardLayout>
      <div className="px-4 pt-5 pb-8 space-y-5">

        {/* Seletor de mês */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => navMes(-1)}
            className="p-1.5 rounded-xl bg-white border border-cobeb-border text-slate-500 hover:text-cobeb-navy hover:border-cobeb-blue/40 transition-colors"
          >
            <ChevronLeft size={16} />
          </button>
          <span className="text-cobeb-text font-semibold text-sm flex-1 text-center">
            {MESES[month]} {year}
          </span>
          <button
            onClick={() => navMes(1)}
            className="p-1.5 rounded-xl bg-white border border-cobeb-border text-slate-500 hover:text-cobeb-navy hover:border-cobeb-blue/40 transition-colors"
          >
            <ChevronRight size={16} />
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-20">
            <div className="w-6 h-6 border-2 border-cobeb-blue border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <>
            {!metaConfig && (
              <div className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 flex items-center gap-2 text-amber-700 text-sm">
                <AlertTriangle size={14} className="shrink-0" />
                Meta não configurada para {MESES[month]} {year}. Acesse Cadastros → Metas para cadastrar.
              </div>
            )}

            <TabelaVolume
              metas={metas}
              hlData={hlData}
              diasUteis={diasUteis}
              diasPassados={diasPassados}
              showD0={showD0}
            />

            <CardSemanas
              year={year}
              month={month}
              semanas={semanas}
              metaTotalHL={metaTotalHL}
              hlData={hlData}
            />

            {isCurrentMonth && (
              <CardCarrosPorDia
                saldoHL={saldoTotalHL}
                diasRestantes={diasRestantes}
                hlPerPallet={hlPerPallet}
              />
            )}
          </>
        )}

      </div>
    </DashboardLayout>
  )
}
