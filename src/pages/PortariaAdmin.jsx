import { useState, useEffect, useMemo } from 'react'
import { Trash2, RefreshCw, X, AlertTriangle, CheckCircle, Clock, Truck } from 'lucide-react'
import AdminLayout from '../components/AdminLayout'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

function diffHHMM(start, end) {
  if (!start || !end) return null
  const ms = new Date(end) - new Date(start)
  if (ms <= 0) return null
  const h = Math.floor(ms / 3600000)
  const m = Math.floor((ms % 3600000) / 60000)
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

function formatTs(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

function isoToday() {
  return new Date().toISOString().split('T')[0]
}

const selCls = 'bg-white border border-cobeb-border rounded-xl px-3 py-2 text-cobeb-text text-xs focus:outline-none focus:border-cobeb-blue appearance-none cursor-pointer'
const dateCls = 'flex-1 bg-white border border-cobeb-border rounded-xl px-3 py-1.5 text-cobeb-text text-xs focus:outline-none focus:border-cobeb-blue [color-scheme:light]'

const STATUS_TABS = [
  { key: 'todos',          label: 'Todos'          },
  { key: 'aguardando',     label: 'Aguardando'     },
  { key: 'em_atendimento', label: 'Em Atendimento' },
  { key: 'concluido',      label: 'Concluídos'     },
  { key: 'excluidos',      label: 'Excluídos'      },
]

export default function PortariaAdmin() {
  const { profile } = useAuth()
  const isAdminTotal = profile?.acesso_total === true

  const [atendimentos,  setAtendimentos]  = useState([])
  const [unidades,      setUnidades]      = useState([])
  const [loading,       setLoading]       = useState(true)
  const [filtroStatus,  setFiltroStatus]  = useState('todos')
  const [filtroUnidade, setFiltroUnidade] = useState('')
  const [filtroData,    setFiltroData]    = useState(isoToday())
  const [confirmarDel,  setConfirmarDel]  = useState(null)
  const [excluindo,     setExcluindo]     = useState(false)

  useEffect(() => { carregar() }, [])

  useEffect(() => {
    const timer = setInterval(() => carregar(true), 30000)
    return () => clearInterval(timer)
  }, [])

  async function carregar(silent = false) {
    if (!silent) setLoading(true)
    const [{ data: atends }, { data: unis }] = await Promise.all([
      supabase
        .from('portaria_atendimentos')
        .select('*')
        .order('created_at', { ascending: false }),
      supabase.from('unidades').select('id, nome, cidade').order('nome'),
    ])
    setAtendimentos(atends ?? [])
    setUnidades(unis ?? [])
    if (!silent) setLoading(false)
  }

  const filtrados = useMemo(() => {
    return atendimentos.filter(a => {
      if (filtroStatus === 'excluidos') {
        if (!a.excluido_em) return false
      } else {
        if (a.excluido_em) return false
        if (filtroStatus !== 'todos' && a.status !== filtroStatus) return false
      }
      if (filtroUnidade && a.unidade_id !== filtroUnidade) return false
      if (filtroData) {
        const dia = (a.created_at ?? '').slice(0, 10)
        if (dia !== filtroData) return false
      }
      return true
    })
  }, [atendimentos, filtroStatus, filtroUnidade, filtroData])

  async function confirmarExclusao() {
    if (!confirmarDel) return
    setExcluindo(true)
    await supabase
      .from('portaria_atendimentos')
      .update({ excluido_em: new Date().toISOString(), excluido_por: profile?.id })
      .eq('id', confirmarDel.id)
    setConfirmarDel(null)
    setExcluindo(false)
    await carregar()
  }

  function statusBadge(a) {
    if (a.excluido_em) return (
      <span className="text-[10px] font-semibold bg-red-500/10 text-red-400 border border-red-500/20 px-2 py-0.5 rounded-full">Excluído</span>
    )
    if (a.status === 'concluido') return (
      <span className="text-[10px] font-semibold bg-green-500/10 text-green-400 border border-green-500/20 px-2 py-0.5 rounded-full">Concluído</span>
    )
    if (a.status === 'em_atendimento') return (
      <span className="text-[10px] font-semibold bg-cobeb-navy/10 text-cobeb-yellow border border-cobeb-navy/20 px-2 py-0.5 rounded-full">Em Atendimento</span>
    )
    return (
      <span className="text-[10px] font-semibold bg-slate-500/10 text-slate-400 border border-slate-500/20 px-2 py-0.5 rounded-full">Aguardando</span>
    )
  }

  const temFiltroAtivo = filtroUnidade || filtroData

  const filtrosJSX = (
    <div className="max-w-2xl mx-auto px-4 pt-3 pb-3 space-y-2 border-b border-cobeb-border/40">
      <div className="flex gap-2 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
        {STATUS_TABS.map(tab => (
          <button key={tab.key} onClick={() => setFiltroStatus(tab.key)}
            className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
              filtroStatus === tab.key
                ? 'bg-cobeb-navy border-orange-500 text-white'
                : 'bg-white border-cobeb-border text-slate-500 hover:border-cobeb-blue/50'
            }`}>
            {tab.label}
          </button>
        ))}
      </div>
      <div className="flex gap-2">
        <select value={filtroUnidade} onChange={e => setFiltroUnidade(e.target.value)} className={`flex-1 ${selCls}`}>
          <option value="">Todas as unidades</option>
          {unidades.map(u => <option key={u.id} value={u.id}>{u.nome} — {u.cidade}</option>)}
        </select>
        <div className="flex items-center gap-2 flex-1">
          <input type="date" value={filtroData} onChange={e => setFiltroData(e.target.value)} className={dateCls} />
          {filtroData && (
            <button onClick={() => setFiltroData('')} className="text-slate-500 hover:text-cobeb-yellow transition-colors shrink-0">
              <X size={15} />
            </button>
          )}
        </div>
      </div>
      <div className="flex items-center justify-between">
        <p className="text-slate-500 text-xs"><span className="text-cobeb-text font-semibold">{filtrados.length}</span> atendimento(s)</p>
        <div className="flex items-center gap-3">
          {temFiltroAtivo && (
            <button onClick={() => { setFiltroUnidade(''); setFiltroData('') }}
              className="text-xs text-slate-500 hover:text-cobeb-yellow transition-colors">
              Limpar filtros
            </button>
          )}
          <button onClick={carregar} className="text-slate-500 hover:text-cobeb-yellow transition-colors"><RefreshCw size={14} /></button>
        </div>
      </div>
    </div>
  )

  return (
    <AdminLayout title="Portaria" subheader={filtrosJSX}>
      <div className="max-w-2xl mx-auto px-4 pt-4 pb-8 space-y-4">

        {/* Lista */}
        {loading ? (
          <div className="flex justify-center py-16">
            <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filtrados.length === 0 ? (
          <div className="text-center py-16">
            <Truck size={28} className="text-cobeb-border mx-auto mb-3" />
            <p className="text-slate-500 text-sm">Nenhum atendimento encontrado</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtrados.map(a => {
              const tma      = diffHHMM(a.dt_entrada, a.dt_saida)
              const excluido = !!a.excluido_em
              return (
                <div key={a.id} className={`bg-white rounded-2xl border px-4 py-3 ${excluido ? 'border-red-500/20 opacity-60' : 'border-cobeb-border'}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      {/* Linha 1: placa + NF + badge */}
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <Truck size={13} className="text-slate-500 shrink-0" />
                        <span className={`font-semibold text-sm font-mono ${excluido ? 'line-through text-slate-400' : 'text-cobeb-text'}`}>
                          {a.placa_cavalo ?? '—'}
                        </span>
                        {a.placa_carreta && <span className="text-slate-500 text-xs font-mono">/ {a.placa_carreta}</span>}
                        <span className="text-cobeb-yellow text-xs font-mono font-semibold">NF {a.numero_nf}</span>
                        {statusBadge(a)}
                      </div>
                      {/* Linha 2: timestamps */}
                      <div className="flex items-center gap-3 flex-wrap text-[10px] text-slate-500 mt-1">
                        <span>Criado: {formatTs(a.created_at)}</span>
                        {a.dt_entrada && <span>Entrada: {formatTs(a.dt_entrada)}</span>}
                        {a.dt_saida   && <span>Saída: {formatTs(a.dt_saida)}</span>}
                        {tma && <span className="text-cobeb-yellow font-semibold font-mono">TMA {tma}</span>}
                      </div>
                      {excluido && (
                        <p className="text-red-400 text-[10px] mt-1">Excluído em {formatTs(a.excluido_em)}</p>
                      )}
                    </div>

                    {/* Botão excluir (só admin_total e não excluídos) */}
                    {isAdminTotal && !excluido && (
                      <button
                        onClick={() => setConfirmarDel(a)}
                        className="w-8 h-8 rounded-lg bg-[#EBF5FF] border border-cobeb-border flex items-center justify-center text-slate-500 hover:text-red-400 hover:border-red-500/40 transition-colors shrink-0"
                        title="Excluir atendimento"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Modal confirmar exclusão */}
      {confirmarDel && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-end">
          <div className="w-full max-w-lg mx-auto bg-white rounded-t-3xl p-6 space-y-5">
            <div className="w-10 h-1 bg-[#1E3A5F] rounded-full mx-auto" />
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-red-500/20 flex items-center justify-center shrink-0">
                <AlertTriangle size={20} className="text-red-400" />
              </div>
              <div>
                <p className="text-cobeb-text font-semibold text-base">Excluir atendimento</p>
                <p className="text-slate-500 text-sm mt-1">
                  <span className="font-mono font-semibold text-cobeb-text">{confirmarDel.placa_cavalo ?? '—'}</span>
                  {' — '}NF {confirmarDel.numero_nf}
                </p>
                <p className="text-slate-500 text-sm mt-2">
                  O registro será ocultado da portaria, mas permanecerá salvo no sistema com todas as informações.
                </p>
                <p className="text-cobeb-yellow text-xs mt-1 font-medium">Os dados não serão perdidos.</p>
              </div>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setConfirmarDel(null)}
                className="flex-1 bg-[#EBF5FF] border border-cobeb-border text-slate-400 font-semibold py-4 rounded-2xl text-sm">
                Cancelar
              </button>
              <button onClick={confirmarExclusao} disabled={excluindo}
                className="flex-1 bg-red-500 hover:bg-red-600 disabled:opacity-50 text-white font-semibold py-4 rounded-2xl text-sm transition-colors">
                {excluindo ? 'Excluindo...' : 'Excluir'}
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  )
}
