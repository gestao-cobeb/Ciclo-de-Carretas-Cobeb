import { useState, useEffect } from 'react'
import { Forklift, LayoutGrid, LogOut, RefreshCw, CheckCircle, Clock, Truck, Package, User } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatTs(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

function formatDuration(startIso, endIso) {
  if (!startIso || !endIso) return '—'
  const ms = new Date(endIso) - new Date(startIso)
  if (ms <= 0) return '—'
  const h = Math.floor(ms / 3600000)
  const m = Math.floor((ms % 3600000) / 60000)
  const s = Math.floor((ms % 60000) / 1000)
  if (h > 0) return `${h}h ${m}min`
  if (m > 0) return `${m}min ${s}s`
  return `${s}s`
}

const STATUS_CFG = {
  pendente:     { label: 'Pendente',     color: 'text-slate-500',  bg: 'bg-[#EBF5FF]',    border: 'border-cobeb-border' },
  em_andamento: { label: 'Em Andamento', color: 'text-blue-400',   bg: 'bg-blue-500/10',  border: 'border-blue-500/40' },
  concluido:    { label: 'Concluído',    color: 'text-green-400',  bg: 'bg-green-500/10', border: 'border-green-500/40' },
}

// ── Cronômetro ────────────────────────────────────────────────────────────────

function Cronometro({ inicioAt }) {
  const [elapsed, setElapsed] = useState(0)
  useEffect(() => {
    const start = new Date(inicioAt).getTime()
    const tick = () => setElapsed(Date.now() - start)
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [inicioAt])
  const h = Math.floor(elapsed / 3600000)
  const m = Math.floor((elapsed % 3600000) / 60000)
  const s = Math.floor((elapsed % 60000) / 1000)
  return <>{String(h).padStart(2, '0')}:{String(m).padStart(2, '0')}:{String(s).padStart(2, '0')}</>
}

// ── Main ─────────────────────────────────────────────────────────────────────

export default function OperadoresPage() {
  const { profile, signOut, modoVisao, setModoVisao } = useAuth()
  const navigate = useNavigate()

  const [tarefas,      setTarefas]      = useState([])
  const [loading,      setLoading]      = useState(true)
  const [filtroStatus, setFiltroStatus] = useState('')
  const [agindo,       setAgindo]       = useState(null)   // id da tarefa em ação
  const [confirmando,  setConfirmando]  = useState(null)   // { tarefa, tipo: 'iniciar'|'concluir' }

  const handleSair = async () => {
    await signOut()
    navigate('/login', { replace: true })
  }

  // ── Carga ────────────────────────────────────────────────────────────────────

  const loadTarefas = async (silent = false) => {
    if (!silent) setLoading(true)
    let q = supabase
      .from('tarefas_operador')
      .select('*')
      .order('created_at', { ascending: false })

    if (!profile?.acesso_total && profile?.unidade_id) {
      q = q.eq('unidade_id', profile.unidade_id)
    }

    const { data } = await q
    setTarefas(data ?? [])
    if (!silent) setLoading(false)
  }

  useEffect(() => { loadTarefas() }, [])
  useEffect(() => {
    const timer = setInterval(() => loadTarefas(true), 30000)
    return () => clearInterval(timer)
  }, [])

  // ── Ações ────────────────────────────────────────────────────────────────────

  const iniciarOrganizacao = async (tarefa) => {
    setAgindo(tarefa.id)
    const inicio_at = new Date().toISOString()
    const { error } = await supabase
      .from('tarefas_operador')
      .update({ status: 'em_andamento', inicio_at })
      .eq('id', tarefa.id)
    setAgindo(null)
    if (!error) {
      setTarefas(prev => prev.map(t =>
        t.id === tarefa.id ? { ...t, status: 'em_andamento', inicio_at } : t
      ))
    }
    setConfirmando(null)
  }

  const concluirOrganizacao = async (tarefa) => {
    setAgindo(tarefa.id)
    const fim_at = new Date().toISOString()
    const { error } = await supabase
      .from('tarefas_operador')
      .update({ status: 'concluido', fim_at })
      .eq('id', tarefa.id)
    setAgindo(null)
    if (!error) {
      setTarefas(prev => prev.map(t =>
        t.id === tarefa.id ? { ...t, status: 'concluido', fim_at } : t
      ))
    }
    setConfirmando(null)
  }

  // ── Dados ─────────────────────────────────────────────────────────────────────

  const tarefasFiltradas = filtroStatus
    ? tarefas.filter(t => t.status === filtroStatus)
    : tarefas

  const counts = {
    pendente:     tarefas.filter(t => t.status === 'pendente').length,
    em_andamento: tarefas.filter(t => t.status === 'em_andamento').length,
    concluido:    tarefas.filter(t => t.status === 'concluido').length,
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-[#EBF5FF]">

      {/* Header fixo */}
      <div className="sticky top-0 z-40">
        <header className="bg-cobeb-navy border-b border-blue-800 px-3 py-2 sm:px-5 sm:py-3.5 flex items-center justify-between shadow-md shadow-cobeb-navy/20">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <img
              src={`${import.meta.env.BASE_URL}logos/logo-cobeb-v2.png`}
              alt="COBEB"
              className="h-7 sm:h-11 md:h-14 w-auto object-contain shrink-0"
              style={{ opacity: 0.92 }}
              onError={e => { e.target.style.display = 'none' }}
            />
            <div className="min-w-0">
              <p className="text-white text-xs sm:text-sm font-semibold leading-tight truncate">Organização de Paletes</p>
              <p className="text-blue-300/60 text-[9px] sm:text-[10px] font-medium hidden sm:block">
                {profile?.unidade?.nome ?? 'COBEB'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={() => loadTarefas()} className="text-blue-300/70 hover:text-white transition-colors p-1.5 rounded-lg hover:bg-white/10">
              <RefreshCw size={16} />
            </button>
            {modoVisao && (
              <button
                onClick={() => { setModoVisao(null); navigate('/selecionar-modulo') }}
                className="text-cobeb-yellow hover:text-white transition-colors p-1.5 rounded-lg hover:bg-white/10"
                title="Trocar Módulo"
              >
                <LayoutGrid size={18} />
              </button>
            )}
            <button onClick={handleSair} className="text-blue-300/70 hover:text-white transition-colors p-1.5 rounded-lg hover:bg-white/10" title="Sair">
              <LogOut size={16} />
            </button>
          </div>
        </header>

        {/* Filtros de status */}
        <div className="bg-[#EBF5FF] border-b border-cobeb-border/40 px-4 py-2.5">
          <div className="max-w-lg mx-auto flex gap-2 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
            {[
              { value: '',             label: 'Todas',        count: tarefas.length },
              { value: 'pendente',     label: 'Pendentes',    count: counts.pendente },
              { value: 'em_andamento', label: 'Em Andamento', count: counts.em_andamento },
              { value: 'concluido',    label: 'Concluídas',   count: counts.concluido },
            ].map(({ value, label, count }) => {
              const active = filtroStatus === value
              return (
                <button key={value} onClick={() => setFiltroStatus(value)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap border transition-colors ${
                    active
                      ? 'bg-cobeb-navy border-orange-500 text-white'
                      : 'bg-transparent border-cobeb-border text-slate-500 hover:border-cobeb-blue/40'
                  }`}>
                  {label}
                  <span className={`text-[10px] ${active ? 'text-cobeb-navy/70' : 'text-slate-500'}`}>{count}</span>
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {/* Lista */}
      <main className="pb-8">
        <div className="max-w-lg mx-auto px-4 pt-4 space-y-4">

          {loading ? (
            <div className="flex justify-center py-16">
              <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : tarefasFiltradas.length === 0 ? (
            <div className="text-center py-16">
              <div className="w-14 h-14 rounded-2xl bg-white border border-cobeb-border flex items-center justify-center mx-auto mb-4">
                <Forklift size={22} className="text-cobeb-border" />
              </div>
              <p className="text-slate-500 text-sm font-medium">Nenhuma tarefa encontrada</p>
              <p className="text-cobeb-border text-xs mt-1">As tarefas aparecem quando o conferente gera uma NRI</p>
            </div>
          ) : (
            <div className="space-y-3">
              {tarefasFiltradas.map(tarefa => {
                const cfg = STATUS_CFG[tarefa.status] ?? STATUS_CFG.pendente
                const placas = [tarefa.placa_cavalo, tarefa.placa_carreta].filter(Boolean).join(' / ')
                return (
                  <div key={tarefa.id} className={`rounded-2xl border overflow-hidden ${cfg.bg} ${cfg.border}`}>
                    <div className="px-4 py-3">

                      {/* Cabeçalho do card */}
                      <div className="mb-3">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span className="text-cobeb-text font-semibold text-sm">
                            {tarefa.numero_nf ? `NF ${tarefa.numero_nf}` : 'Sem NF'}
                          </span>
                          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${cfg.color} ${cfg.border} bg-[#EBF5FF]/60`}>
                            {cfg.label}
                          </span>
                        </div>

                        {/* Placas */}
                        {placas && (
                          <div className="flex items-center gap-1 text-xs text-slate-500 mb-1">
                            <Truck size={10} />
                            <span className="font-mono text-[11px]">{placas}</span>
                          </div>
                        )}

                        {/* Paletes + conferente */}
                        <div className="flex items-center gap-3 mt-1 text-[10px] text-slate-500 flex-wrap">
                          {tarefa.quantidade_paletes != null && (
                            <span className="flex items-center gap-1">
                              <Package size={10} />
                              {tarefa.quantidade_paletes} palete{tarefa.quantidade_paletes !== 1 ? 's' : ''}
                            </span>
                          )}
                          {tarefa.conferente_nome && (
                            <span className="flex items-center gap-1">
                              <User size={10} />
                              {tarefa.conferente_nome}
                            </span>
                          )}
                          <span className="flex items-center gap-1">
                            <Clock size={10} />
                            {formatTs(tarefa.created_at)}
                          </span>
                        </div>

                        {/* Cronômetro (em andamento) */}
                        {tarefa.status === 'em_andamento' && tarefa.inicio_at && (
                          <div className="mt-2 flex items-center gap-1.5 bg-blue-500/10 border border-blue-500/20 rounded-xl px-3 py-2">
                            <Clock size={12} className="text-blue-400" />
                            <span className="text-blue-400 text-xs font-mono font-semibold">
                              <Cronometro inicioAt={tarefa.inicio_at} />
                            </span>
                          </div>
                        )}

                        {/* Tempo total (concluído) */}
                        {tarefa.status === 'concluido' && tarefa.inicio_at && tarefa.fim_at && (
                          <div className="mt-2 flex items-center gap-1.5 bg-green-500/10 border border-green-500/20 rounded-xl px-3 py-2">
                            <CheckCircle size={12} className="text-green-400" />
                            <span className="text-green-400 text-xs font-semibold">
                              Organizado em {formatDuration(tarefa.inicio_at, tarefa.fim_at)}
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Botões de ação */}
                      {tarefa.status === 'pendente' && (
                        <button
                          onClick={() => setConfirmando({ tarefa, tipo: 'iniciar' })}
                          disabled={agindo === tarefa.id}
                          className="w-full bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white text-xs font-semibold py-2.5 rounded-xl transition-colors flex items-center justify-center gap-1.5"
                        >
                          {agindo === tarefa.id
                            ? <div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                            : <><Forklift size={13} />Iniciar organização de paletes no balizador</>}
                        </button>
                      )}

                      {tarefa.status === 'em_andamento' && (
                        <button
                          onClick={() => setConfirmando({ tarefa, tipo: 'concluir' })}
                          disabled={agindo === tarefa.id}
                          className="w-full bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-xs font-semibold py-2.5 rounded-xl transition-colors flex items-center justify-center gap-1.5"
                        >
                          {agindo === tarefa.id
                            ? <div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                            : <><CheckCircle size={13} />Paletes organizados</>}
                        </button>
                      )}

                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </main>

      {/* Dialog de confirmação */}
      {confirmando && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-end">
          <div className="w-full max-w-lg mx-auto bg-white rounded-t-2xl p-5 space-y-4">
            <div className="w-10 h-1 bg-cobeb-border rounded-full mx-auto" />
            <div>
              <p className="text-cobeb-text font-semibold text-base">
                {confirmando.tipo === 'iniciar'
                  ? 'Iniciar organização?'
                  : 'Os paletes foram organizados no balizador?'}
              </p>
              <p className="text-slate-500 text-sm mt-1">
                {confirmando.tipo === 'iniciar'
                  ? 'O cronômetro será iniciado e a tarefa ficará em andamento.'
                  : 'Confirme apenas quando todos os paletes estiverem posicionados.'}
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmando(null)}
                className="flex-1 bg-[#EBF5FF] border border-cobeb-border text-slate-500 font-semibold py-3 rounded-xl text-sm"
              >
                Não
              </button>
              <button
                onClick={() =>
                  confirmando.tipo === 'iniciar'
                    ? iniciarOrganizacao(confirmando.tarefa)
                    : concluirOrganizacao(confirmando.tarefa)
                }
                disabled={agindo === confirmando.tarefa.id}
                className="flex-1 bg-cobeb-navy hover:bg-cobeb-blue disabled:opacity-50 text-white font-semibold py-3 rounded-xl text-sm transition-colors"
              >
                {agindo === confirmando.tarefa.id
                  ? <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin mx-auto" />
                  : 'Sim'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
