import { useState, useEffect } from 'react'
import { Target, RotateCcw, Plus, Trash2, ToggleLeft, ToggleRight } from 'lucide-react'
import { supabase } from '../../lib/supabase'

const CHAVE_VIAGENS = 'planejado_viagens'

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

export default function Metas() {
  return (
    <div className="px-5 py-4 max-w-2xl space-y-5">
      <div className="flex items-center gap-2 mb-1">
        <Target size={15} className="text-cobeb-navy" />
        <p className="text-cobeb-text font-semibold text-sm">Metas dos Gráficos</p>
      </div>
      <MetaViagens />

      <div className="flex items-center gap-2 mt-6 mb-1">
        <RotateCcw size={15} className="text-purple-600" />
        <p className="text-cobeb-text font-semibold text-sm">Blitz de Puxada</p>
      </div>
      <MotivosBlitz />
    </div>
  )
}
