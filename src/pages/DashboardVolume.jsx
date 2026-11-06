import { useState, useEffect, useRef, useMemo } from 'react'
import { ChevronLeft, ChevronRight, ChevronDown, AlertTriangle, TrendingUp, TrendingDown, Truck } from 'lucide-react'
import DashboardLayout from '../components/DashboardLayout'
import { supabase } from '../lib/supabase'

// ── Segmentos folha (onde o HL cai depois da classificação) ───────────────────
const SEGMENTOS_FOLHA = [
  'OW Core', 'OW Match', 'OW High End', 'OW Zero Álcool',
  'Garrafa Meia Core', 'Garrafa Meia HE',
  'Garrafa Inteira Core', 'Garrafa Inteira HE',
  'Garrafa 1L Core', 'Garrafa 1L HE',
  'NAB', 'NAB Zero',
]

// Chaves que possuem meta configurada (nível 2)
const META_KEYS = ['Cerveja OW', 'RGB', 'NAB', 'NAB Zero']

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
  if (day <= 7)  return 1
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

// Hierarquia: zeroNAB → NABZero · zeroCerv → OW Zero · RGB por embalagem · OW restante
function classifySegmento(cod, tm, emb, zeroCervSet, zeroNabSet, highEndSet) {
  if (zeroNabSet.has(cod))  return 'NAB Zero'
  const isCerv = tm === '001 - CERVEJA' || tm === '028 - BEBIDAS QUENTES'
  if (!isCerv) return 'NAB'
  if (zeroCervSet.has(cod)) return 'OW Zero Álcool'
  const isHE = highEndSet.has(cod)
  if (emb.startsWith('017')) return isHE ? 'Garrafa Meia HE'    : 'Garrafa Meia Core'
  if (emb.startsWith('018')) return isHE ? 'Garrafa Inteira HE' : 'Garrafa Inteira Core'
  if (emb.startsWith('085')) return isHE ? 'Garrafa 1L HE'      : 'Garrafa 1L Core'
  if (tm === '028 - BEBIDAS QUENTES') return 'OW Match'
  if (isHE) return 'OW High End'
  return 'OW Core'
}

// ── Helpers de UI ─────────────────────────────────────────────────────────────


function DataRow({ label, meta, real, D1, diasUteis, diasPassados, showD0, padLeft = 'pl-6', bold = false, rowClass = '', onToggle, isCollapsed }) {
  const md       = diasUteis > 0 && meta > 0 ? meta / diasUteis : 0
  const diff     = D1 - md
  const pct      = meta > 0 ? real / meta * 100 : null
  const prj      = diasPassados > 0 && diasUteis > 0 && meta > 0 ? (real / diasPassados) * diasUteis : null
  const pctColor = pct  == null ? '' : pct  >= 100 ? 'text-emerald-600' : pct  >= 80 ? 'text-amber-600' : 'text-red-500'
  const d0Color  = diff >= 0 ? 'text-emerald-600' : 'text-red-500'
  const prjColor = prj  == null ? '' : prj >= meta ? 'text-emerald-600' : prj >= meta * 0.9 ? 'text-amber-600' : 'text-red-500'
  const PrjIcon  = prj  == null ? null : prj >= meta ? TrendingUp : TrendingDown

  return (
    <tr className={`border-t border-cobeb-border/40 hover:bg-cobeb-sky/30 transition-colors ${rowClass}`}>
      <td className={`${padLeft} pr-3 py-2.5 text-xs whitespace-nowrap ${bold ? 'font-bold text-cobeb-navy' : 'text-cobeb-text'}`}>
        {onToggle ? (
          <button onClick={onToggle} className="flex items-center gap-1.5 w-full text-left select-none cursor-pointer">
            {isCollapsed
              ? <ChevronRight size={10} className="shrink-0 opacity-50" />
              : <ChevronDown  size={10} className="shrink-0 opacity-50" />}
            {label}
          </button>
        ) : label}
      </td>
      <td className="px-3 py-2.5 text-right text-xs text-slate-600">
        {meta > 0 ? fmtHL(meta) : <span className="text-slate-300">—</span>}
      </td>
      <td className={`px-3 py-2.5 text-right text-xs text-cobeb-navy ${bold ? 'font-bold' : 'font-semibold'}`}>
        {fmtHL(real)}
      </td>
      <td className={`px-3 py-2.5 text-right text-xs ${bold ? 'font-bold' : 'font-semibold'} ${pctColor}`}>
        {pct == null ? <span className="text-slate-300">—</span> : fmtPct(pct)}
      </td>
      {showD0 && (
        <td className={`px-3 py-2.5 text-right text-xs ${bold ? 'font-bold' : 'font-semibold'} ${meta > 0 ? d0Color : ''}`}>
          {meta > 0
            ? `${diff >= 0 ? '+' : ''}${fmtHL(diff)}`
            : <span className="text-slate-300">—</span>}
        </td>
      )}
      <td className={`px-3 py-2.5 text-xs ${bold ? 'font-bold' : 'font-semibold'} ${prjColor}`}>
        {prj == null ? (
          <span className="text-slate-300">—</span>
        ) : (
          <span className="flex items-center gap-1">
            {PrjIcon && <PrjIcon size={11} />}{fmtHL(prj)} HL
          </span>
        )}
      </td>
    </tr>
  )
}

// ── Tabela principal ──────────────────────────────────────────────────────────

function TabelaVolume({ metas, hlData, diasUteis, diasPassados, showD0 }) {
  const [col, setCol] = useState({})
  const toggle = key => setCol(c => ({ ...c, [key]: !c[key] }))
  const isc    = key => !!col[key]

  const cols = showD0 ? 6 : 5

  // Extrai { real, D1 } para um segmento folha
  function s(name) {
    return { real: hlData[name]?.total || 0, D1: hlData[name]?.D1 || 0 }
  }
  // Soma dois objetos { real, D1 }
  function add(...items) {
    return items.reduce((acc, x) => ({ real: acc.real + x.real, D1: acc.D1 + x.D1 }), { real: 0, D1: 0 })
  }

  const owC     = s('OW Core'); const owM = s('OW Match')
  const owHE    = s('OW High End'); const owZ = s('OW Zero Álcool')
  const ow      = add(owC, owM, owHE, owZ); const owMeta  = metas['Cerveja OW']   || 0
  const owCMeta  = metas['OW Core']             || 0
  const owMMeta  = metas['OW Match']            || 0
  const owHEMeta = metas['OW High End']         || 0
  const owZMeta  = metas['OW Zero Álcool']      || 0
  const gmMeta   = metas['Garrafa Meia']        || 0
  const gmCMeta  = metas['Garrafa Meia Core']   || 0
  const gmHMeta  = metas['Garrafa Meia HE']     || 0
  const giMeta   = metas['Garrafa Inteira']     || 0
  const giCMeta  = metas['Garrafa Inteira Core']|| 0
  const giHMeta  = metas['Garrafa Inteira HE']  || 0
  const g1Meta   = metas['Garrafa 1L']          || 0
  const g1CMeta  = metas['Garrafa 1L Core']     || 0
  const g1HMeta  = metas['Garrafa 1L HE']       || 0
  const gmC     = s('Garrafa Meia Core');    const gmH = s('Garrafa Meia HE')
  const giC     = s('Garrafa Inteira Core'); const giH = s('Garrafa Inteira HE')
  const g1C     = s('Garrafa 1L Core');      const g1H = s('Garrafa 1L HE')
  const gm      = add(gmC, gmH)
  const gi      = add(giC, giH)
  const g1      = add(g1C, g1H)
  const rgb     = add(gm, gi, g1);  const rgbMeta = metas['RGB'] || 0
  const tt      = add(ow, rgb);     const ttMeta  = owMeta + rgbMeta
  const nab     = s('NAB');         const nabMeta  = metas['NAB']      || 0
  const nabZ    = s('NAB Zero');    const nabZMeta = metas['NAB Zero'] || 0
  const nabTT   = add(nab, nabZ);   const nabTTMeta = nabMeta + nabZMeta
  const total   = add(tt, nabTT);   const totalMeta = ttMeta + nabTTMeta

  const totalPct  = totalMeta > 0 ? total.real / totalMeta * 100 : null
  const totalPrj  = diasPassados > 0 && diasUteis > 0 && totalMeta > 0
    ? (total.real / diasPassados) * diasUteis : null
  const totalDiff = total.D1 - (diasUteis > 0 && totalMeta > 0 ? totalMeta / diasUteis : 0)

  const dp = { diasUteis, diasPassados, showD0 }

  return (
    <div className="bg-white rounded-2xl border border-cobeb-border shadow-sm overflow-hidden">
      <div className="px-4 pt-4 pb-3 border-b border-cobeb-border/50">
        <h2 className="text-cobeb-text font-semibold text-sm">Volume por Segmento</h2>
        <p className="text-xs text-slate-400 mt-0.5">Meta de puxada mensal em HL por segmento · Real acumulado até D-1</p>
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
          <tbody>

            {/* Cerveja TT — linha de total + toggle */}
            <DataRow {...dp} label="Cerveja TT" meta={ttMeta} {...tt}
              padLeft="pl-4" bold rowClass="bg-cobeb-navy/5"
              onToggle={() => toggle('tt')} isCollapsed={isc('tt')} />

            {!isc('tt') && <>
              {/* Cerveja OW — linha de total + toggle */}
              <DataRow {...dp} label="Cerveja OW" meta={owMeta} {...ow}
                padLeft="pl-6" bold rowClass="bg-cobeb-sky/40"
                onToggle={() => toggle('ow')} isCollapsed={isc('ow')} />
              {!isc('ow') && <>
                <DataRow {...dp} label="Core"        meta={owCMeta}  {...owC}  padLeft="pl-9" />
                <DataRow {...dp} label="Match"       meta={owMMeta}  {...owM}  padLeft="pl-9" />
                <DataRow {...dp} label="High End"    meta={owHEMeta} {...owHE} padLeft="pl-9" />
                <DataRow {...dp} label="Zero Álcool" meta={owZMeta}  {...owZ}  padLeft="pl-9" />
              </>}

              {/* RGB — linha de total + toggle */}
              <DataRow {...dp} label="RGB" meta={rgbMeta} {...rgb}
                padLeft="pl-6" bold rowClass="bg-cobeb-sky/50"
                onToggle={() => toggle('rgb')} isCollapsed={isc('rgb')} />
              {!isc('rgb') && <>
                {/* Garrafa Meia — linha de total + toggle */}
                <DataRow {...dp} label="Garrafa Meia" meta={gmMeta} {...gm}
                  padLeft="pl-9" bold rowClass="bg-cobeb-sky/40"
                  onToggle={() => toggle('gm')} isCollapsed={isc('gm')} />
                {!isc('gm') && <>
                  <DataRow {...dp} label="High End" meta={gmHMeta} {...gmH} padLeft="pl-12" />
                  <DataRow {...dp} label="Core"     meta={gmCMeta} {...gmC} padLeft="pl-12" />
                </>}

                {/* Garrafa Inteira — linha de total + toggle */}
                <DataRow {...dp} label="Garrafa Inteira" meta={giMeta} {...gi}
                  padLeft="pl-9" bold rowClass="bg-cobeb-sky/40"
                  onToggle={() => toggle('gi')} isCollapsed={isc('gi')} />
                {!isc('gi') && <>
                  <DataRow {...dp} label="High End" meta={giHMeta} {...giH} padLeft="pl-12" />
                  <DataRow {...dp} label="Core"     meta={giCMeta} {...giC} padLeft="pl-12" />
                </>}

                {/* Garrafa 1L — linha de total + toggle */}
                <DataRow {...dp} label="Garrafa 1L" meta={g1Meta} {...g1}
                  padLeft="pl-9" bold rowClass="bg-cobeb-sky/40"
                  onToggle={() => toggle('g1')} isCollapsed={isc('g1')} />
                {!isc('g1') && <>
                  <DataRow {...dp} label="High End" meta={g1HMeta} {...g1H} padLeft="pl-12" />
                  <DataRow {...dp} label="Core"     meta={g1CMeta} {...g1C} padLeft="pl-12" />
                </>}
              </>}
            </>}

            {/* NAB — linha de total + toggle */}
            <DataRow {...dp} label="NAB" meta={nabTTMeta} {...nabTT}
              padLeft="pl-4" bold rowClass="bg-cobeb-navy/5"
              onToggle={() => toggle('nab')} isCollapsed={isc('nab')} />
            {!isc('nab') && <>
              <DataRow {...dp} label="NAB"      meta={nabMeta}  {...nab}  padLeft="pl-6" />
              <DataRow {...dp} label="NAB Zero" meta={nabZMeta} {...nabZ} padLeft="pl-6" />
            </>}

          </tbody>
          <tfoot>
            <tr className="bg-[#EBF5FF]/80 border-t-2 border-cobeb-navy/30">
              <td className="px-4 py-2.5 font-black text-cobeb-navy text-xs">Total Geral</td>
              <td className="px-3 py-2.5 text-right font-black text-cobeb-navy text-xs">
                {totalMeta > 0 ? fmtHL(totalMeta) : '—'}
              </td>
              <td className="px-3 py-2.5 text-right font-black text-cobeb-navy text-xs">{fmtHL(total.real)}</td>
              <td className="px-3 py-2.5 text-right font-black text-xs">
                {totalPct != null ? (
                  <span className={totalPct >= 100 ? 'text-emerald-600' : totalPct >= 80 ? 'text-amber-600' : 'text-red-500'}>
                    {fmtPct(totalPct)}
                  </span>
                ) : '—'}
              </td>
              {showD0 && (
                <td className={`px-3 py-2.5 text-right font-black text-xs ${totalMeta > 0 ? (totalDiff >= 0 ? 'text-emerald-600' : 'text-red-500') : ''}`}>
                  {totalMeta > 0 ? `${totalDiff >= 0 ? '+' : ''}${fmtHL(totalDiff)}` : '—'}
                </td>
              )}
              <td className="px-3 py-2.5 font-black text-xs">
                {totalPrj != null ? (() => {
                  const color = totalPrj >= totalMeta ? 'text-emerald-600' : totalPrj >= totalMeta * 0.9 ? 'text-amber-600' : 'text-red-500'
                  const Icon  = totalPrj >= totalMeta ? TrendingUp : TrendingDown
                  return (
                    <span className={`flex items-center gap-1 ${color}`}>
                      <Icon size={12} />{fmtHL(totalPrj)} HL
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

// ── Card Semanas ──────────────────────────────────────────────────────────────

function CardSemanas({ year, month, semanas, metaTotalHL, hlData }) {
  const today          = new Date()
  const isCurrentMonth = year === today.getFullYear() && month === today.getMonth()
  const semanaAtual    = isCurrentMonth ? semanaDoDia(today.getDate()) : null
  const mm             = String(month + 1).padStart(2, '0')

  const hlPorDia = {}
  SEGMENTOS_FOLHA.forEach(seg => {
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
          const metaSem = metaTotalHL * (pcts[sem - 1] / 100)
          let realSem   = 0
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

// ── Card Carros por Dia ───────────────────────────────────────────────────────

function CardCarrosPorDia({ saldoHL, diasRestantes, hlPerPallet }) {
  const hlPorDia     = diasRestantes > 0 ? saldoHL / diasRestantes : 0
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
  const [hlPerPallet, setHlPerPallet] = useState(1.44)

  // Dados estáticos de classificação — carregados uma vez
  const staticRef      = useRef({ zeroCervSet: new Set(), zeroNabSet: new Set(), highEndSet: new Set() })
  const [staticLoaded, setStaticLoaded] = useState(false)

  useEffect(() => {
    Promise.all([
      supabase.from('depara_zero').select('cod_promax, tipo'),
      supabase.from('demanda').select('cod_promax, segmento'),
    ]).then(([{ data: dpz }, { data: dem }]) => {
      const czs = new Set(), nzs = new Set(), hes = new Set()
      ;(dpz ?? []).forEach(d => {
        if (d.tipo === 'CERVEJA ZERO') czs.add(d.cod_promax)
        if (d.tipo === 'NAB ZERO')     nzs.add(d.cod_promax)
      })
      ;(dem ?? []).forEach(d => {
        if (d.segmento?.toUpperCase().includes('HIGH END')) hes.add(d.cod_promax)
      })
      staticRef.current = { zeroCervSet: czs, zeroNabSet: nzs, highEndSet: hes }
      setStaticLoaded(true)
    })
  }, [])

  const mesRef = `${year}-${String(month + 1).padStart(2, '0')}`

  function navMes(dir) {
    let m = month + dir, y = year
    if (m < 0)  { m = 11; y-- }
    if (m > 11) { m = 0;  y++ }
    setMonth(m); setYear(y)
  }

  useEffect(() => {
    if (!staticLoaded) return

    async function load() {
      setLoading(true)
      const monthStart = `${mesRef}-01`
      const lastDay    = new Date(year, month + 1, 0).getDate()
      const monthEnd   = `${mesRef}-${String(lastDay).padStart(2, '0')}`

      const yesterday    = new Date()
      yesterday.setDate(yesterday.getDate() - 1)
      const yesterdayStr = yesterday.toISOString().slice(0, 10)

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
          .select('codigo, tipo_marca, embalagem, caixas_pallet, nr_fator_conversao')
          .in('codigo', skus)
        ;(catData ?? []).forEach(c => { catMap[c.codigo] = c })
      }

      // Ratio HL/pallet a partir de pedidos não-cancelados do mês
      let totalPlt = 0, totalHLR = 0
      pedsAll.filter(p => p.status !== 'cancelado').forEach(p => {
        const cat = catMap[p.cod_produto]
        if (!cat) return
        const hl = (p.qtde_pallets || 0) * (cat.caixas_pallet || 0) * (cat.nr_fator_conversao || 0)
        if (hl > 0) { totalPlt += p.qtde_pallets || 0; totalHLR += hl }
      })
      if (totalPlt > 0 && totalHLR > 0) setHlPerPallet(totalHLR / totalPlt)

      // Real = pedidos vinculados a viagem OU marcados como realizado
      const pedsReal = pedsAll.filter(p => p.viagem_id != null || p.status === 'realizado')

      const { zeroCervSet, zeroNabSet, highEndSet } = staticRef.current
      const result = {}
      SEGMENTOS_FOLHA.forEach(seg => { result[seg] = { total: 0, D1: 0, porDia: {} } })

      pedsReal.forEach(p => {
        const cat = catMap[p.cod_produto]
        if (!cat) return
        const seg = classifySegmento(
          p.cod_produto,
          cat.tipo_marca ?? '',
          cat.embalagem  ?? '',
          zeroCervSet, zeroNabSet, highEndSet
        )
        if (!SEGMENTOS_FOLHA.includes(seg)) return
        const hl = (p.qtde_pallets || 0) * (cat.caixas_pallet || 0) * (cat.nr_fator_conversao || 0)
        if (hl <= 0) return
        const ds = p.data_puxada?.slice(0, 10)
        if (!ds) return

        // Acumula apenas até D-1 (inclusive)
        if (ds <= yesterdayStr) {
          result[seg].total += hl
          result[seg].porDia[ds] = (result[seg].porDia[ds] || 0) + hl
          if (ds === yesterdayStr) result[seg].D1 += hl
        }
      })

      setHlData(result)
      setLoading(false)
    }
    load()
  }, [mesRef, staticLoaded])

  const today          = new Date()
  const yesterday      = new Date(today); yesterday.setDate(today.getDate() - 1)
  const isCurrentMonth = year === today.getFullYear() && month === today.getMonth()

  const yesterdayInMonth = isCurrentMonth &&
    yesterday.getMonth() === month && yesterday.getFullYear() === year
  const showD0 = yesterdayInMonth

  const diasUteis = useMemo(() => diasUteisMes(year, month), [year, month])

  const diasPassados = useMemo(() => {
    if (!isCurrentMonth)   return diasUteis
    if (!yesterdayInMonth) return 0
    return diasUteisRange(year, month, 1, yesterday.getDate())
  }, [year, month, isCurrentMonth, yesterdayInMonth, diasUteis])

  const metas        = metaConfig?.metas   ?? {}
  const semanas      = metaConfig?.semanas ?? { s1: 30, s2: 30, s3: 20, s4: 20 }
  const metaTotalHL  = META_KEYS.reduce((s, k) => s + (metas[k] || 0), 0)
  const realTotalHL  = SEGMENTOS_FOLHA.reduce((s, seg) => s + (hlData[seg]?.total || 0), 0)
  const saldoTotalHL = Math.max(metaTotalHL - realTotalHL, 0)

  const ultimoDia     = new Date(year, month + 1, 0).getDate()
  const diasRestantes = isCurrentMonth
    ? diasUteisRange(year, month, today.getDate(), ultimoDia)
    : 0

  return (
    <DashboardLayout>
      <div className="px-4 pt-5 pb-8 space-y-5">

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
