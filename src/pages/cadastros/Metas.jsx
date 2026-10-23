import { useState, useEffect } from 'react'
import { Target } from 'lucide-react'
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

export default function Metas() {
  return (
    <div className="px-5 py-4 max-w-2xl space-y-5">
      <div className="flex items-center gap-2 mb-1">
        <Target size={15} className="text-cobeb-navy" />
        <p className="text-cobeb-text font-semibold text-sm">Metas dos Gráficos</p>
      </div>
      <MetaViagens />
    </div>
  )
}
