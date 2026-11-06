import { useState, useEffect } from 'react'
import { Target, RotateCcw, Plus, ToggleLeft, ToggleRight, ChevronLeft, ChevronRight, BarChart3 } from 'lucide-react'
import { supabase } from '../../lib/supabase'

const CHAVE_VIAGENS = 'planejado_viagens'

const SEGMENTOS_VOL = [
  'Cerveja OW',
  'OW Core', 'OW Match', 'OW High End', 'OW Zero Álcool',
  'RGB',
  'Garrafa Meia', 'Garrafa Meia Core', 'Garrafa Meia HE',
  'Garrafa Inteira', 'Garrafa Inteira Core', 'Garrafa Inteira HE',
  'Garrafa 1L', 'Garrafa 1L Core', 'Garrafa 1L HE',
  'NAB', 'NAB Zero',
]
const META_TOTAL_KEYS = ['Cerveja OW', 'RGB', 'NAB', 'NAB Zero']

const MESES_VOL = [
  'Janeiro','Fevereiro','Março','Abril','Maio','Junho',
  'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro',
]

function MetaViagens() {
  const [unidades, setUnidades] = useState([])
  const [loading,  setLoading]  = useState(true)
  const [draft,    setDraft]    = useState({})
  const [salvando, setSalvando] = useState(false)
  const [salvo,    setSalvo]    = useState(false)
  const [erro,     setErro]     = useState('')

  useEffect(() => {
    async function load() {
      const [{ data: uData }, { data: cData }] = await Promise.all([
        supabase
          .from('unidades')
          .select('id, nome')
          .eq('tipo', 'revenda')
          .eq('ativo', true)
          .order('nome'),
        supabase
          .from('dashboard_configs')
          .select('valor')
          .eq('chave', CHAVE_VIAGENS)
          .maybeSingle(),
      ])
      const metaAtual = cData?.valor ?? {}
      const d = {}
      ;(uData ?? []).forEach(u => { d[u.id] = metaAtual[u.id] ?? '' })
      setUnidades(uData ?? [])
      setDraft(d)
      setLoading(false)
    }
    load()
  }, [])

  async function salvar() {
    setSalvando(true)
    setErro('')
    const clean = {}
    unidades.forEach(u => { clean[u.id] = Math.max(0, parseInt(draft[u.id], 10) || 0) })
    const { error } = await supabase
      .from('dashboard_configs')
      .upsert({ chave: CHAVE_VIAGENS, valor: clean, atualizado_em: new Date().toISOString() })
    setSalvando(false)
    if (error) { setErro(error.message); return }
    setSalvo(true)
    setTimeout(() => setSalvo(false), 2000)
  }

  const total = unidades.reduce((s, u) => s + (parseInt(draft[u.id]) || 0), 0)

  return (
    <div className="bg-white rounded-2xl border border-cobeb-border shadow-sm p-5">
      <div className="mb-4">
        <p className="text-cobeb-text font-semibold text-sm">Planejado vs Real — Viagens por Dia</p>
        <p className="text-slate-500 text-xs mt-0.5">Meta de viagens diárias por unidade (CD) usada no Dashboard Puxada</p>
      </div>

      {loading ? (
        <div className="flex justify-center py-8">
          <div className="w-6 h-6 border-2 border-cobeb-navy border-t-transparent rounded-full animate-spin" />
        </div>
      ) : unidades.length === 0 ? (
        <p className="text-slate-400 text-sm text-center py-6">Nenhuma unidade CD ativa cadastrada.</p>
      ) : (
        <>
          <div className="space-y-2 mb-4">
            {unidades.map(u => (
              <div key={u.id} className="flex items-center gap-3">
                <span className="text-sm text-cobeb-text flex-1 truncate">{u.nome}</span>
                <div className="flex items-center gap-2 shrink-0">
                  <input
                    type="number"
                    min="0"
                    value={draft[u.id] ?? ''}
                    onChange={e => setDraft(m => ({
                      ...m,
                      [u.id]: e.target.value === '' ? '' : Math.max(0, parseInt(e.target.value, 10) || 0),
                    }))}
                    className="w-20 text-sm border border-cobeb-border rounded-xl px-3 py-1.5 text-center focus:outline-none focus:border-cobeb-blue [appearance:textfield]"
                  />
                  <span className="text-xs text-slate-400 w-16">veíc./dia</span>
                </div>
              </div>
            ))}
          </div>

          {erro && (
            <p className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-red-400 text-sm mb-3">{erro}</p>
          )}

          <div className="flex items-center justify-between pt-3 border-t border-cobeb-border">
            <div className="flex items-baseline gap-2">
              <span className="text-sm font-semibold text-cobeb-text">Total</span>
              <span className="text-sm font-bold text-cobeb-navy">{total} veíc./dia</span>
            </div>
            <button
              onClick={salvar}
              disabled={salvando}
              className={`px-5 py-2 rounded-xl text-sm font-semibold transition-colors disabled:opacity-60 ${
                salvo
                  ? 'bg-green-500 text-white'
                  : 'bg-cobeb-navy hover:bg-cobeb-blue text-white'
              }`}
            >
              {salvando ? 'Salvando...' : salvo ? 'Salvo ✓' : 'Salvar'}
            </button>
          </div>
        </>
      )}
    </div>
  )
}

function MotivosBlitz() {
  const [motivos,   setMotivos]   = useState([])
  const [loading,   setLoading]   = useState(true)
  const [novoDesc,  setNovoDesc]  = useState('')
  const [salvando,  setSalvando]  = useState(false)
  const [toggling,  setToggling]  = useState(null)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('motivos_blitz')
      .select('id, descricao, ativo')
      .order('descricao')
    setMotivos(data ?? [])
    setLoading(false)
  }

  async function adicionar() {
    const desc = novoDesc.trim()
    if (!desc) return
    setSalvando(true)
    const { error } = await supabase.from('motivos_blitz').insert({ descricao: desc, ativo: true })
    setSalvando(false)
    if (error) { alert('Erro: ' + error.message); return }
    setNovoDesc('')
    load()
  }

  async function toggleAtivo(motivo) {
    setToggling(motivo.id)
    await supabase.from('motivos_blitz').update({ ativo: !motivo.ativo }).eq('id', motivo.id)
    setMotivos(prev => prev.map(m => m.id === motivo.id ? { ...m, ativo: !m.ativo } : m))
    setToggling(null)
  }

  return (
    <div className="bg-white rounded-2xl border border-cobeb-border shadow-sm p-5">
      <div className="mb-4">
        <p className="text-cobeb-text font-semibold text-sm">Motivos de Blitz de Puxada</p>
        <p className="text-slate-500 text-xs mt-0.5">Motivos disponíveis para apontamento de anomalia na blitz</p>
      </div>

      {/* Adicionar */}
      <div className="flex gap-2 mb-4">
        <input
          type="text"
          placeholder="Ex: Furado, Amassado, Quebrado..."
          value={novoDesc}
          onChange={e => setNovoDesc(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && adicionar()}
          className="flex-1 text-sm border border-cobeb-border rounded-xl px-3 py-2 focus:outline-none focus:border-cobeb-blue transition-colors"
        />
        <button
          onClick={adicionar}
          disabled={salvando || !novoDesc.trim()}
          className="px-4 py-2 bg-cobeb-navy hover:bg-cobeb-blue disabled:opacity-40 text-white text-sm font-semibold rounded-xl transition-colors flex items-center gap-1.5">
          <Plus size={14} /> Adicionar
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-6">
          <div className="w-5 h-5 border-2 border-cobeb-navy border-t-transparent rounded-full animate-spin" />
        </div>
      ) : motivos.length === 0 ? (
        <p className="text-slate-400 text-sm text-center py-4">Nenhum motivo cadastrado.</p>
      ) : (
        <div className="space-y-2">
          {motivos.map(m => (
            <div key={m.id} className={`flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl border transition-colors ${
              m.ativo ? 'border-cobeb-border bg-[#EBF5FF]/50' : 'border-cobeb-border/40 bg-slate-50 opacity-50'
            }`}>
              <span className="text-sm text-cobeb-text">{m.descricao}</span>
              <button
                onClick={() => toggleAtivo(m)}
                disabled={toggling === m.id}
                className="text-slate-400 hover:text-cobeb-navy transition-colors shrink-0 p-1"
                title={m.ativo ? 'Desativar' : 'Ativar'}>
                {toggling === m.id
                  ? <div className="w-4 h-4 border-2 border-cobeb-navy/30 border-t-cobeb-navy rounded-full animate-spin" />
                  : m.ativo
                    ? <ToggleRight size={18} className="text-green-500" />
                    : <ToggleLeft size={18} />}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function MetaInput({ label, seg, metas, setMetas, indent, bgRow = '' }) {
  return (
    <div className={`flex items-center gap-3 ${indent} py-2 border-t border-cobeb-border/40 ${bgRow}`}>
      <span className="text-sm text-cobeb-text flex-1 truncate">{label}</span>
      <div className="flex items-center gap-1.5 shrink-0">
        <input
          type="number"
          min="0"
          step="0.1"
          value={metas[seg] ?? ''}
          onChange={e => setMetas(m => ({ ...m, [seg]: e.target.value }))}
          className="w-24 text-sm border border-cobeb-border rounded-xl px-3 py-1.5 text-right focus:outline-none focus:border-cobeb-blue [appearance:textfield]"
        />
        <span className="text-xs text-slate-400 w-5">HL</span>
      </div>
    </div>
  )
}

function MetaVolumePuxada() {
  const now = new Date()
  const [year,     setYear]     = useState(now.getFullYear())
  const [month,    setMonth]    = useState(now.getMonth())
  const [metas,    setMetas]    = useState({})
  const [semanas,  setSemanas]  = useState({ s1: 30, s2: 30, s3: 20, s4: 20 })
  const [allConfig, setAllConfig] = useState({})
  const [loading,  setLoading]  = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [salvo,    setSalvo]    = useState(false)
  const [erro,     setErro]     = useState('')

  const mesRef = `${year}-${String(month + 1).padStart(2, '0')}`

  function loadMes(cfg, ref) {
    const mesCfg = cfg[ref] ?? {}
    const m = {}
    SEGMENTOS_VOL.forEach(seg => { m[seg] = mesCfg.metas?.[seg] != null ? String(mesCfg.metas[seg]) : '' })
    setMetas(m)
    setSemanas(mesCfg.semanas ?? { s1: 30, s2: 30, s3: 20, s4: 20 })
  }

  useEffect(() => {
    supabase
      .from('dashboard_configs')
      .select('valor')
      .eq('chave', 'meta_volume_puxada')
      .maybeSingle()
      .then(({ data }) => {
        const cfg = data?.valor ?? {}
        setAllConfig(cfg)
        loadMes(cfg, `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`)
        setLoading(false)
      })
  }, [])

  function navMes(dir) {
    let m = month + dir, y = year
    if (m < 0)  { m = 11; y-- }
    if (m > 11) { m = 0;  y++ }
    const ref = `${y}-${String(m + 1).padStart(2, '0')}`
    setYear(y); setMonth(m)
    loadMes(allConfig, ref)
  }

  const somaSem = ['s1','s2','s3','s4'].reduce((s, k) => s + (parseInt(semanas[k]) || 0), 0)
  const somaOk  = somaSem === 100

  async function salvar() {
    setErro('')
    if (!somaOk) { setErro('A soma dos percentuais das semanas deve ser 100%.'); return }
    setSalvando(true)

    const cleanMetas = {}
    SEGMENTOS_VOL.forEach(seg => { cleanMetas[seg] = parseFloat(metas[seg]) || 0 })
    const cleanSemanas = { s1: parseInt(semanas.s1)||0, s2: parseInt(semanas.s2)||0, s3: parseInt(semanas.s3)||0, s4: parseInt(semanas.s4)||0 }

    const updated = { ...allConfig, [mesRef]: { metas: cleanMetas, semanas: cleanSemanas } }

    const { error } = await supabase
      .from('dashboard_configs')
      .upsert({ chave: 'meta_volume_puxada', valor: updated, atualizado_em: new Date().toISOString() })

    setSalvando(false)
    if (error) { setErro(error.message); return }
    setAllConfig(updated)
    setSalvo(true)
    setTimeout(() => setSalvo(false), 2000)
  }

  const somaHL    = META_TOTAL_KEYS.reduce((s, k) => s + (parseFloat(metas[k]) || 0), 0)
  const sumMetas  = (...keys) => {
    const v = keys.reduce((s, k) => s + (parseFloat(metas[k]) || 0), 0)
    return v > 0 ? v.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' HL' : '—'
  }

  return (
    <div className="bg-white rounded-2xl border border-cobeb-border shadow-sm p-5">
      <div className="mb-4">
        <p className="text-cobeb-text font-semibold text-sm">Meta de Volume de Puxada</p>
        <p className="text-slate-500 text-xs mt-0.5">Meta mensal em HL por segmento, cadastrada mês a mês</p>
      </div>

      {/* Seletor de mês */}
      <div className="flex items-center gap-2 mb-5">
        <button onClick={() => navMes(-1)} className="p-1.5 rounded-xl border border-cobeb-border text-slate-500 hover:text-cobeb-navy transition-colors">
          <ChevronLeft size={15} />
        </button>
        <span className="text-cobeb-text font-semibold text-sm flex-1 text-center">
          {MESES_VOL[month]} {year}
        </span>
        <button onClick={() => navMes(1)} className="p-1.5 rounded-xl border border-cobeb-border text-slate-500 hover:text-cobeb-navy transition-colors">
          <ChevronRight size={15} />
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-6">
          <div className="w-5 h-5 border-2 border-cobeb-navy border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <>
          {/* Metas por segmento — hierarquia completa */}
          <p className="text-[11px] font-semibold text-cobeb-navy mb-2 uppercase tracking-wide">Meta por segmento (HL/mês)</p>
          <div className="mb-4 rounded-xl border border-cobeb-border overflow-hidden">
            {/* ── Cerveja TT ───────────────────────────────────────── */}
            <div className="flex items-center justify-between bg-cobeb-sky/60 px-3 py-1.5">
              <span className="text-[11px] font-black text-cobeb-navy uppercase tracking-widest">Cerveja TT</span>
              <span className="text-[10px] font-semibold text-cobeb-navy">{sumMetas('Cerveja OW', 'RGB')}</span>
            </div>
            <MetaInput label="Cerveja OW"      seg="Cerveja OW"         metas={metas} setMetas={setMetas} indent="pl-5 pr-3"  bgRow="bg-cobeb-sky/30" />
            <MetaInput label="Core"            seg="OW Core"            metas={metas} setMetas={setMetas} indent="pl-9 pr-3"  />
            <MetaInput label="Match"           seg="OW Match"           metas={metas} setMetas={setMetas} indent="pl-9 pr-3"  />
            <MetaInput label="High End"        seg="OW High End"        metas={metas} setMetas={setMetas} indent="pl-9 pr-3"  />
            <MetaInput label="Zero Álcool"     seg="OW Zero Álcool"     metas={metas} setMetas={setMetas} indent="pl-9 pr-3"  />
            <MetaInput label="RGB"             seg="RGB"                metas={metas} setMetas={setMetas} indent="pl-5 pr-3"  bgRow="bg-cobeb-sky/30" />
            <MetaInput label="Garrafa Meia"    seg="Garrafa Meia"       metas={metas} setMetas={setMetas} indent="pl-9 pr-3"  bgRow="bg-cobeb-sky/10" />
            <MetaInput label="High End"        seg="Garrafa Meia HE"    metas={metas} setMetas={setMetas} indent="pl-12 pr-3" />
            <MetaInput label="Core"            seg="Garrafa Meia Core"  metas={metas} setMetas={setMetas} indent="pl-12 pr-3" />
            <MetaInput label="Garrafa Inteira" seg="Garrafa Inteira"       metas={metas} setMetas={setMetas} indent="pl-9 pr-3"  bgRow="bg-cobeb-sky/10" />
            <MetaInput label="High End"        seg="Garrafa Inteira HE"    metas={metas} setMetas={setMetas} indent="pl-12 pr-3" />
            <MetaInput label="Core"            seg="Garrafa Inteira Core"  metas={metas} setMetas={setMetas} indent="pl-12 pr-3" />
            <MetaInput label="Garrafa 1L"      seg="Garrafa 1L"          metas={metas} setMetas={setMetas} indent="pl-9 pr-3"  bgRow="bg-cobeb-sky/10" />
            <MetaInput label="High End"        seg="Garrafa 1L HE"       metas={metas} setMetas={setMetas} indent="pl-12 pr-3" />
            <MetaInput label="Core"            seg="Garrafa 1L Core"     metas={metas} setMetas={setMetas} indent="pl-12 pr-3" />
            {/* ── NAB ──────────────────────────────────────────────── */}
            <div className="flex items-center justify-between bg-cobeb-sky/60 px-3 py-1.5 border-t border-cobeb-border/40">
              <span className="text-[11px] font-black text-cobeb-navy uppercase tracking-widest">NAB</span>
              <span className="text-[10px] font-semibold text-cobeb-navy">{sumMetas('NAB', 'NAB Zero')}</span>
            </div>
            <MetaInput label="NAB"      seg="NAB"      metas={metas} setMetas={setMetas} indent="pl-5 pr-3" />
            <MetaInput label="NAB Zero" seg="NAB Zero" metas={metas} setMetas={setMetas} indent="pl-5 pr-3" />
          </div>

          <div className="flex items-baseline justify-between pb-4 border-b border-cobeb-border mb-4">
            <span className="text-xs text-slate-400">Total mês (Cerveja + NAB)</span>
            <span className="text-sm font-bold text-cobeb-navy">
              {somaHL.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} HL
            </span>
          </div>

          {/* Distribuição semanal */}
          <p className="text-[11px] font-semibold text-cobeb-navy mb-2 uppercase tracking-wide">Distribuição semanal (%)</p>
          <div className="grid grid-cols-4 gap-2 mb-1">
            {['s1','s2','s3','s4'].map((k, i) => (
              <div key={k} className="text-center">
                <p className="text-[10px] text-slate-400 mb-1">Sem. {i + 1}</p>
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="1"
                  value={semanas[k] ?? ''}
                  onChange={e => setSemanas(s => ({ ...s, [k]: e.target.value }))}
                  className={`w-full text-sm border rounded-xl px-2 py-1.5 text-center focus:outline-none [appearance:textfield] ${
                    somaOk ? 'border-cobeb-border focus:border-cobeb-blue' : 'border-red-300 focus:border-red-400'
                  }`}
                />
                <p className="text-[10px] text-slate-400 mt-0.5">%</p>
              </div>
            ))}
          </div>
          <p className={`text-xs text-right mb-4 ${somaOk ? 'text-emerald-600' : 'text-red-500'}`}>
            Soma: {somaSem}% {somaOk ? '✓' : '(deve ser 100%)'}
          </p>

          {erro && (
            <p className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-red-400 text-sm mb-3">{erro}</p>
          )}

          <button
            onClick={salvar}
            disabled={salvando || !somaOk}
            className={`w-full py-2.5 rounded-xl text-sm font-semibold transition-colors disabled:opacity-60 ${
              salvo ? 'bg-green-500 text-white' : 'bg-cobeb-navy hover:bg-cobeb-blue text-white'
            }`}
          >
            {salvando ? 'Salvando...' : salvo ? 'Salvo ✓' : 'Salvar'}
          </button>
        </>
      )}
    </div>
  )
}

function MetaVolumeUnidades() {
  const now  = new Date()
  const [year,     setYear]     = useState(now.getFullYear())
  const [month,    setMonth]    = useState(now.getMonth())
  const [unidades, setUnidades] = useState([])
  const [pcts,     setPcts]     = useState({})
  const [allConfig, setAllConfig] = useState({})
  const [loading,  setLoading]  = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [salvo,    setSalvo]    = useState(false)
  const [erro,     setErro]     = useState('')

  const mesRef = `${year}-${String(month + 1).padStart(2, '0')}`

  function loadMes(unis, cfg, ref) {
    const mesCfg = cfg[ref] ?? {}
    const p = {}
    unis.forEach(u => { p[u.id] = mesCfg[u.id] != null ? String(mesCfg[u.id]) : '' })
    setPcts(p)
  }

  useEffect(() => {
    Promise.all([
      supabase.from('unidades').select('id, nome').eq('tipo', 'revenda').eq('ativo', true).order('nome'),
      supabase.from('dashboard_configs').select('valor').eq('chave', 'meta_volume_unidades_pct').maybeSingle(),
    ]).then(([{ data: unis }, { data: cfg }]) => {
      const config = cfg?.valor ?? {}
      setAllConfig(config)
      setUnidades(unis ?? [])
      loadMes(unis ?? [], config, `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`)
      setLoading(false)
    })
  }, [])

  function navMes(dir) {
    let m = month + dir, y = year
    if (m < 0)  { m = 11; y-- }
    if (m > 11) { m = 0;  y++ }
    setYear(y); setMonth(m)
    loadMes(unidades, allConfig, `${y}-${String(m + 1).padStart(2, '0')}`)
  }

  const somaPct = unidades.reduce((s, u) => s + (parseFloat(pcts[u.id]) || 0), 0)
  const pctOk   = somaPct === 0 || Math.abs(somaPct - 100) < 0.01

  async function salvar() {
    setErro('')
    if (!pctOk) { setErro('A soma dos percentuais deve ser 0 (sem configuração) ou 100%.'); return }
    setSalvando(true)
    const cleanPcts = {}
    unidades.forEach(u => { cleanPcts[u.id] = parseFloat(pcts[u.id]) || 0 })
    const updated = { ...allConfig, [mesRef]: cleanPcts }
    const { error } = await supabase.from('dashboard_configs')
      .upsert({ chave: 'meta_volume_unidades_pct', valor: updated, atualizado_em: new Date().toISOString() })
    setSalvando(false)
    if (error) { setErro(error.message); return }
    setAllConfig(updated)
    setSalvo(true)
    setTimeout(() => setSalvo(false), 2000)
  }

  return (
    <div className="bg-white rounded-2xl border border-cobeb-border shadow-sm p-5">
      <div className="mb-4">
        <p className="text-cobeb-text font-semibold text-sm">% Meta Volume por Unidade</p>
        <p className="text-slate-500 text-xs mt-0.5">Fatia da meta mensal atribuída a cada unidade (CD), mês a mês</p>
      </div>

      {/* Seletor de mês */}
      <div className="flex items-center gap-2 mb-4">
        <button onClick={() => navMes(-1)} className="p-1.5 rounded-xl border border-cobeb-border text-slate-500 hover:text-cobeb-navy transition-colors">
          <ChevronLeft size={15} />
        </button>
        <span className="text-cobeb-text font-semibold text-sm flex-1 text-center">
          {MESES_VOL[month]} {year}
        </span>
        <button onClick={() => navMes(1)} className="p-1.5 rounded-xl border border-cobeb-border text-slate-500 hover:text-cobeb-navy transition-colors">
          <ChevronRight size={15} />
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-6">
          <div className="w-5 h-5 border-2 border-cobeb-navy border-t-transparent rounded-full animate-spin" />
        </div>
      ) : unidades.length === 0 ? (
        <p className="text-slate-400 text-sm text-center py-4">Nenhuma unidade CD ativa cadastrada.</p>
      ) : (
        <>
          <div className="space-y-2 mb-4">
            {unidades.map(u => (
              <div key={u.id} className="flex items-center gap-3">
                <span className="text-sm text-cobeb-text flex-1 truncate">{u.nome}</span>
                <div className="flex items-center gap-1.5 shrink-0">
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.1"
                    value={pcts[u.id] ?? ''}
                    onChange={e => setPcts(m => ({ ...m, [u.id]: e.target.value }))}
                    className="w-20 text-sm border border-cobeb-border rounded-xl px-3 py-1.5 text-right focus:outline-none focus:border-cobeb-blue [appearance:textfield]"
                  />
                  <span className="text-xs text-slate-400 w-4">%</span>
                </div>
              </div>
            ))}
          </div>

          <p className={`text-xs text-right mb-4 ${pctOk ? 'text-emerald-600' : 'text-red-500'}`}>
            Soma: {somaPct.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%{' '}
            {pctOk ? '✓' : '(deve ser 100% ou 0%)'}
          </p>

          {erro && (
            <p className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-red-400 text-sm mb-3">{erro}</p>
          )}

          <button
            onClick={salvar}
            disabled={salvando || !pctOk}
            className={`w-full py-2.5 rounded-xl text-sm font-semibold transition-colors disabled:opacity-60 ${
              salvo ? 'bg-green-500 text-white' : 'bg-cobeb-navy hover:bg-cobeb-blue text-white'
            }`}
          >
            {salvando ? 'Salvando...' : salvo ? 'Salvo ✓' : 'Salvar'}
          </button>
        </>
      )}
    </div>
  )
}

export default function Metas() {
  return (
    <div className="px-5 py-4 max-w-2xl space-y-5">
      <div className="flex items-center gap-2 mb-1">
        <Target size={15} className="text-cobeb-navy" />
        <p className="text-cobeb-text font-semibold text-sm">Metas dos Gráficos</p>
      </div>
      <MetaViagens />

      <div className="flex items-center gap-2 mt-6 mb-1">
        <BarChart3 size={15} className="text-cobeb-navy" />
        <p className="text-cobeb-text font-semibold text-sm">Volume de Puxada</p>
      </div>
      <MetaVolumePuxada />
      <MetaVolumeUnidades />

      <div className="flex items-center gap-2 mt-6 mb-1">
        <RotateCcw size={15} className="text-purple-600" />
        <p className="text-cobeb-text font-semibold text-sm">Blitz de Puxada</p>
      </div>
      <MotivosBlitz />
    </div>
  )
}
