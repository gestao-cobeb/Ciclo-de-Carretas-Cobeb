import { useState, useEffect, useMemo } from 'react'
import { ChevronDown, ChevronUp, RefreshCw } from 'lucide-react'
import AdminLayout from '../components/AdminLayout'
import { supabase } from '../lib/supabase'

function fmtTs(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

const STATUS_LABEL = {
  iniciada:               'Iniciada',
  em_transito:            'Em trânsito',
  na_fabrica:             'Na fábrica',
  retornando:             'Retornando',
  aguardando_conferencia: 'Ag. conferência',
  em_conferencia:         'Em conferência',
  concluida:              'Concluída',
}

const STATUS_COR = {
  iniciada:               'bg-slate-100 text-slate-600',
  em_transito:            'bg-blue-100 text-blue-700',
  na_fabrica:             'bg-orange-100 text-orange-700',
  retornando:             'bg-indigo-100 text-indigo-700',
  aguardando_conferencia: 'bg-yellow-100 text-yellow-700',
  em_conferencia:         'bg-purple-100 text-purple-700',
  concluida:              'bg-green-100 text-green-700',
}

const selCls = 'bg-white border border-cobeb-border rounded-xl px-3 py-2 text-cobeb-text text-xs focus:outline-none focus:border-cobeb-blue appearance-none cursor-pointer'

function badgeCls(contagem) {
  if (contagem >= 4) return 'bg-red-500/10 text-red-600 border-red-400/30'
  if (contagem >= 2) return 'bg-amber-500/10 text-amber-600 border-amber-400/30'
  return 'bg-green-500/10 text-green-600 border-green-500/20'
}

export default function Monitoramento() {
  const [grupos,        setGrupos]        = useState([])
  const [unidades,      setUnidades]      = useState([])
  const [loading,       setLoading]       = useState(true)
  const [ultimaSync,    setUltimaSync]    = useState(null)
  const [expandidos,    setExpandidos]    = useState({})
  const [filtroUnidade, setFiltroUnidade] = useState('')

  useEffect(() => { carregar() }, [])
  useEffect(() => {
    const timer = setInterval(() => carregar(true), 30000)
    return () => clearInterval(timer)
  }, [])

  async function carregar(silent = false) {
    if (!silent) setLoading(true)

    const quatroDiasAtras = new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString()

    const [{ data: eventos }, { data: unids }] = await Promise.all([
      supabase
        .from('gps_eventos')
        .select(`
          viagem_id, created_at,
          motorista:profiles!motorista_id(nome),
          viagem:viagens!viagem_id(
            id, status, dt_saida_revenda, numero_nf_saida,
            unidade:unidades!unidade_descarga_id(id, nome),
            carreta:carretas!carreta_id(placa),
            cavalo:cavalos!cavalo_id(placa)
          )
        `)
        .eq('evento', 'iniciar')
        .gte('created_at', quatroDiasAtras)
        .order('created_at', { ascending: false })
        .limit(500),
      supabase.from('unidades').select('id, nome').eq('tipo', 'revenda').order('nome'),
    ])

    // Agrupa por viagem_id
    const mapa = {}
    for (const e of (eventos ?? [])) {
      const id = e.viagem_id
      if (!mapa[id]) {
        mapa[id] = {
          viagem_id:  id,
          viagem:     e.viagem,
          motorista:  e.motorista,
          timestamps: [],
        }
      }
      mapa[id].timestamps.push(e.created_at)
    }

    // timestamps chegam DESC; reverte para ASC na exibição
    const lista = Object.values(mapa).map(g => ({
      ...g,
      timestamps: [...g.timestamps].reverse(),
      contagem:   g.timestamps.length,
      ultima_at:  g.timestamps[0],
    }))

    lista.sort((a, b) => b.contagem - a.contagem || (b.ultima_at > a.ultima_at ? 1 : -1))

    setGrupos(lista)
    setUnidades(unids ?? [])
    setUltimaSync(new Date())
    if (!silent) setLoading(false)
  }

  const gruposFiltrados = useMemo(() => {
    if (!filtroUnidade) return grupos
    return grupos.filter(g => g.viagem?.unidade?.id === filtroUnidade)
  }, [grupos, filtroUnidade])

  const totalReinits    = gruposFiltrados.reduce((s, g) => s + Math.max(g.contagem - 1, 0), 0)
  const alertasCriticos = gruposFiltrados.filter(g => g.contagem >= 4).length

  function toggleExpand(id) {
    setExpandidos(prev => ({ ...prev, [id]: !prev[id] }))
  }

  return (
    <AdminLayout title="Monitoramento GPS">
      <div className="px-4 pt-5 pb-6 space-y-4">

        {/* Filtro + última sync */}
        <div className="flex items-center gap-2">
          <select
            value={filtroUnidade}
            onChange={e => setFiltroUnidade(e.target.value)}
            className={`flex-1 ${selCls}`}
          >
            <option value="">Todos os CDs</option>
            {unidades.map(u => (
              <option key={u.id} value={u.id}>{u.nome}</option>
            ))}
          </select>
          {ultimaSync && (
            <span className="text-[10px] text-slate-400 shrink-0 flex items-center gap-1">
              <RefreshCw size={10} />
              {ultimaSync.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
        </div>

        {/* Resumo */}
        {!loading && (
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-white rounded-xl border border-cobeb-border p-3 text-center">
              <p className="text-cobeb-navy font-bold text-lg leading-none">{gruposFiltrados.length}</p>
              <p className="text-slate-400 text-[10px] mt-1">viagens</p>
            </div>
            <div className={`rounded-xl border p-3 text-center ${
              totalReinits > 0 ? 'bg-amber-50 border-amber-200' : 'bg-white border-cobeb-border'
            }`}>
              <p className={`font-bold text-lg leading-none ${totalReinits > 0 ? 'text-amber-600' : 'text-cobeb-navy'}`}>
                {totalReinits}
              </p>
              <p className="text-slate-400 text-[10px] mt-1">reinicializações</p>
            </div>
            <div className={`rounded-xl border p-3 text-center ${
              alertasCriticos > 0 ? 'bg-red-50 border-red-200' : 'bg-white border-cobeb-border'
            }`}>
              <p className={`font-bold text-lg leading-none ${alertasCriticos > 0 ? 'text-red-600' : 'text-cobeb-navy'}`}>
                {alertasCriticos}
              </p>
              <p className="text-slate-400 text-[10px] mt-1">críticos (4+)</p>
            </div>
          </div>
        )}

        {/* Lista */}
        {loading ? (
          <div className="flex justify-center py-14">
            <div className="w-6 h-6 border-2 border-cobeb-blue border-t-transparent rounded-full animate-spin" />
          </div>
        ) : gruposFiltrados.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-1">
            <p className="text-slate-400 text-sm">Nenhum dado nos últimos 4 dias</p>
            <p className="text-slate-300 text-xs">O log começa após instalar esta versão do app</p>
          </div>
        ) : (
          <div className="space-y-2">
            {gruposFiltrados.map(g => {
              const v        = g.viagem
              const expanded = expandidos[g.viagem_id]

              return (
                <div key={g.viagem_id}
                  className="bg-white rounded-2xl border border-cobeb-border shadow-sm overflow-hidden">

                  <button
                    onClick={() => toggleExpand(g.viagem_id)}
                    className="w-full px-4 py-3 flex items-start gap-3 text-left"
                  >
                    <span className={`shrink-0 mt-0.5 text-[11px] font-bold px-2 py-1 rounded-full border ${badgeCls(g.contagem)}`}>
                      {g.contagem}×
                    </span>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-cobeb-text font-semibold text-sm">
                          {v?.carreta?.placa ?? '—'} · {v?.cavalo?.placa ?? '—'}
                        </span>
                        {v?.status && (
                          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${STATUS_COR[v.status] ?? 'bg-slate-100 text-slate-500'}`}>
                            {STATUS_LABEL[v.status] ?? v.status}
                          </span>
                        )}
                      </div>
                      <p className="text-slate-500 text-xs mt-0.5">
                        {g.motorista?.nome ?? '—'}
                        {v?.numero_nf_saida ? ` · NF ${v.numero_nf_saida}` : ''}
                        {v?.unidade?.nome   ? ` · ${v.unidade.nome}`       : ''}
                      </p>
                      <p className="text-slate-400 text-[10px] mt-0.5">
                        Saída: {fmtTs(v?.dt_saida_revenda)}
                      </p>
                    </div>

                    {g.contagem > 1 && (
                      expanded
                        ? <ChevronUp   size={16} className="text-slate-400 shrink-0 mt-1" />
                        : <ChevronDown size={16} className="text-slate-400 shrink-0 mt-1" />
                    )}
                  </button>

                  {expanded && g.contagem > 1 && (
                    <div className="px-4 pb-4 border-t border-cobeb-border/50">
                      <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide pt-3 mb-2">
                        Histórico de reinicializações
                      </p>
                      <div className="space-y-1.5">
                        {g.timestamps.map((ts, i) => (
                          <div key={ts} className="flex items-center gap-2.5">
                            <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${
                              i === 0 ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                            }`}>
                              {i + 1}
                            </span>
                            <span className="text-xs text-cobeb-text font-mono">{fmtTs(ts)}</span>
                            {i > 0 && (
                              <span className="text-[10px] text-slate-400">
                                +{Math.round((new Date(ts) - new Date(g.timestamps[i - 1])) / 60000)} min
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        <p className="text-center text-[10px] text-slate-300 pt-1">
          Últimos 4 dias · 1× = normal · 2–3× = atenção · 4+× = possível battery optimization
        </p>
      </div>
    </AdminLayout>
  )
}
