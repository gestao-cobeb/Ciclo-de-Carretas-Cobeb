import { useState, useEffect, useCallback, useMemo } from 'react'
import { LogOut, Clock, CheckCircle, Truck, RefreshCw, X, LayoutGrid, PlusCircle, ShoppingCart, ArrowLeftRight } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'

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
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

function isoToday() {
  return new Date().toISOString().split('T')[0]
}

function tipoBadge(tipo) {
  if (tipo === 'marketplace')   return { label: 'Marketplace',  abbr: 'Mkt', cls: 'bg-orange-50 border-orange-200 text-orange-600' }
  if (tipo === 'transferencia') return { label: 'Transferência', abbr: 'Trf', cls: 'bg-indigo-50 border-indigo-200 text-indigo-600' }
  return null
}

function TipoIcon({ tipo, size = 16, className = '' }) {
  if (tipo === 'marketplace')   return <ShoppingCart size={size} className={className} />
  if (tipo === 'transferencia') return <ArrowLeftRight size={size} className={className} />
  return <Truck size={size} className={className} />
}

function ElapsedTimer({ from }) {
  const [elapsed, setElapsed] = useState('')
  useEffect(() => {
    function update() {
      setElapsed(diffHHMM(from, new Date().toISOString()) ?? '00:00')
    }
    update()
    const id = setInterval(update, 10000)
    return () => clearInterval(id)
  }, [from])
  return <span>{elapsed}</span>
}

const STATUS_TABS = [
  { key: 'todos',          label: 'Todos'          },
  { key: 'aguardando',     label: 'Aguardando'     },
  { key: 'em_atendimento', label: 'Em Atendimento' },
  { key: 'concluido',      label: 'Concluídos'     },
]

export default function PortariaPage() {
  const { profile, signOut, modoVisao, setModoVisao } = useAuth()
  const navigate = useNavigate()

  const [atendimentos, setAtendimentos] = useState([])
  const [loading,      setLoading]      = useState(true)
  const [registrando,  setRegistrando]  = useState(null)
  const [confirmando,  setConfirmando]  = useState(null) // { id, acao: 'entrada'|'saida' }
  const [filtroStatus, setFiltroStatus] = useState('todos')
  const [filtroData,   setFiltroData]   = useState(isoToday())

  // entrada manual (marketplace / transferencia)
  const [showModalEntrada, setShowModalEntrada] = useState(false)
  const [tipoEntrada,      setTipoEntrada]      = useState(null) // null = seletor | 'marketplace' | 'transferencia'
  const [placaCavaloM,     setPlacaCavaloM]     = useState('')
  const [placaCarretaM,    setPlacaCarretaM]    = useState('')
  const [numeroNFM,        setNumeroNFM]        = useState('')
  const [criando,          setCriando]          = useState(false)

  const carregar = useCallback(async (silent = false) => {
    if (!profile?.acesso_total && !profile?.unidade_id) return
    if (!silent) setLoading(true)
    let q = supabase
      .from('portaria_atendimentos')
      .select('*, agendamento:agendamentos(bloco, tipo_dia, data_agendamento)')
      .is('excluido_em', null)
      .order('created_at', { ascending: false })
    if (!profile?.acesso_total) {
      q = q.eq('unidade_id', profile.unidade_id)
    }
    const { data } = await q
    setAtendimentos(data ?? [])
    if (!silent) setLoading(false)
  }, [profile?.unidade_id, profile?.acesso_total])

  useEffect(() => { carregar() }, [carregar])

  useEffect(() => {
    const timer = setInterval(() => carregar(true), 30000)
    return () => clearInterval(timer)
  }, [carregar])

  const handleLogout = async () => {
    await signOut()
    navigate('/login', { replace: true })
  }

  function pedirConfirmacao(id, acao) {
    setConfirmando({ id, acao })
  }

  function cancelarConfirmacao() {
    setConfirmando(null)
  }

  async function registrarEntrada(atend) {
    setConfirmando(null)
    setRegistrando(atend.id)
    const { error } = await supabase.rpc('registrar_entrada_portaria', {
      p_atendimento_id: atend.id,
      p_porteiro_id:    profile.id,
    })
    if (error) alert('Erro ao registrar entrada: ' + error.message)
    await carregar()
    setRegistrando(null)
  }

  function fecharModalEntrada() {
    setShowModalEntrada(false)
    setTipoEntrada(null)
    setPlacaCavaloM('')
    setPlacaCarretaM('')
    setNumeroNFM('')
  }

  async function criarEntrada() {
    if (!placaCavaloM.trim() || !numeroNFM.trim()) return
    setCriando(true)
    const rpc = tipoEntrada === 'marketplace' ? 'criar_entrada_marketplace' : 'criar_entrada_transferencia'
    const { error } = await supabase.rpc(rpc, {
      p_placa_cavalo:  placaCavaloM.trim().toUpperCase(),
      p_numero_nf:     numeroNFM.trim(),
      p_placa_carreta: placaCarretaM.trim().toUpperCase() || null,
    })
    setCriando(false)
    if (error) { alert('Erro ao registrar entrada: ' + error.message); return }
    fecharModalEntrada()
    await carregar()
  }

  async function registrarSaida(atend) {
    setConfirmando(null)
    setRegistrando(atend.id)
    await supabase
      .from('portaria_atendimentos')
      .update({ dt_saida: new Date().toISOString(), status: 'concluido' })
      .eq('id', atend.id)
    await carregar()
    setRegistrando(null)
  }

  const filtrados = useMemo(() => {
    return atendimentos.filter(a => {
      if (filtroStatus !== 'todos' && a.status !== filtroStatus) return false
      if (filtroData) {
        const dia = (a.created_at ?? '').slice(0, 10)
        if (dia !== filtroData) return false
      }
      return true
    })
  }, [atendimentos, filtroStatus, filtroData])

  const aguardando    = filtrados.filter(a => a.status === 'aguardando')
  const emAtendimento = filtrados.filter(a => a.status === 'em_atendimento')
  const concluidos    = filtrados.filter(a => a.status === 'concluido')
  const semAtividade  = filtrados.length === 0

  return (
    <div className="min-h-screen bg-[#EBF5FF]">

      {/* Header + filtros fixos no topo */}
      <div className="sticky top-0 z-40">
      <header className="bg-cobeb-navy border-b border-blue-800 px-3 py-2 sm:px-5 sm:py-3.5 flex items-center justify-between shadow-md shadow-cobeb-navy/20">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <img
            src={`${import.meta.env.BASE_URL}logos/logo-cobeb-v2.png`}
            alt="COBEB"
            className="h-7 sm:h-11 md:h-14 w-auto object-contain shrink-0"
            style={{ opacity: 0.92 }}
            onError={e => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'flex' }}
          />
          <div style={{ display: 'none' }} className="w-7 h-7 rounded-lg bg-white/20 items-center justify-center shrink-0">
            <span className="text-white text-xs font-black select-none">CB</span>
          </div>
          <div className="min-w-0">
            <p className="text-white text-xs sm:text-sm font-semibold leading-tight truncate">Portaria</p>
            <p className="text-blue-300/60 text-[9px] sm:text-[10px] font-medium tracking-wide uppercase hidden sm:block">
              {profile?.unidade?.cidade ?? 'Ciclo de Carretas'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={carregar} className="text-blue-300/70 hover:text-white transition-colors p-1.5 rounded-lg hover:bg-white/10" title="Atualizar">
            <RefreshCw size={16} />
          </button>
          {modoVisao && (
            <button onClick={() => { setModoVisao(null); navigate('/selecionar-modulo') }}
              className="text-cobeb-yellow hover:text-white transition-colors p-1.5 rounded-lg hover:bg-white/10"
              title="Trocar Módulo">
              <LayoutGrid size={16} />
            </button>
          )}
          <button onClick={handleLogout} className="text-blue-300/70 hover:text-white transition-colors p-1.5 rounded-lg hover:bg-white/10" title="Sair">
            <LogOut size={18} />
          </button>
        </div>
      </header>

      {/* Filtros */}
      <div className="bg-white border-b border-cobeb-border px-4 py-3 space-y-3">
        {/* Status pills + botão entrada manual */}
        <div className="flex items-center gap-2">
          <div className="flex gap-2 overflow-x-auto pb-0.5 flex-1">
            {STATUS_TABS.map(tab => (
              <button
                key={tab.key}
                onClick={() => setFiltroStatus(tab.key)}
                className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                  filtroStatus === tab.key
                    ? 'bg-cobeb-navy border-orange-500 text-white'
                    : 'bg-transparent border-cobeb-border text-slate-500 hover:border-cobeb-blue/50'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <button
            onClick={() => { setShowModalEntrada(true); setTipoEntrada(null) }}
            className="shrink-0 flex items-center gap-1.5 bg-cobeb-yellow hover:bg-yellow-400 text-cobeb-navy text-xs font-bold px-3 py-1.5 rounded-full transition-colors"
          >
            <PlusCircle size={13} />
            Entrada Manual
          </button>
        </div>

        {/* Data */}
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={filtroData}
            onChange={e => setFiltroData(e.target.value)}
            className="flex-1 bg-[#EBF5FF] border border-cobeb-border rounded-xl px-3 py-1.5 text-cobeb-text text-xs focus:outline-none focus:border-cobeb-blue [color-scheme:light]"
          />
          {filtroData && (
            <button onClick={() => setFiltroData('')} className="text-slate-500 hover:text-cobeb-yellow transition-colors shrink-0">
              <X size={15} />
            </button>
          )}
        </div>
      </div>
      </div>{/* /sticky */}

      {/* Modal entrada manual */}
      {showModalEntrada && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-4">

            {/* Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <PlusCircle size={18} className="text-cobeb-yellow" />
                <p className="text-cobeb-text font-bold text-base">Entrada Manual</p>
              </div>
              <button onClick={fecharModalEntrada} className="text-slate-400 hover:text-slate-600 transition-colors">
                <X size={18} />
              </button>
            </div>

            {/* Step 1: selecionar tipo */}
            {!tipoEntrada && (
              <>
                <p className="text-slate-500 text-xs">Qual o tipo de entrada?</p>
                <div className="space-y-2">
                  <button
                    onClick={() => setTipoEntrada('marketplace')}
                    className="w-full flex items-center gap-3 px-4 py-4 rounded-2xl border border-cobeb-border bg-white hover:border-orange-300 hover:bg-orange-50 transition-all text-left"
                  >
                    <div className="w-10 h-10 rounded-xl bg-orange-500/10 flex items-center justify-center shrink-0">
                      <ShoppingCart size={18} className="text-orange-500" />
                    </div>
                    <div>
                      <p className="text-cobeb-text font-semibold text-sm">Marketplace</p>
                      <p className="text-slate-500 text-xs mt-0.5">Veículo terceiro sem pedido vinculado</p>
                    </div>
                  </button>
                  <button
                    onClick={() => setTipoEntrada('transferencia')}
                    className="w-full flex items-center gap-3 px-4 py-4 rounded-2xl border border-cobeb-border bg-white hover:border-indigo-300 hover:bg-indigo-50 transition-all text-left"
                  >
                    <div className="w-10 h-10 rounded-xl bg-indigo-500/10 flex items-center justify-center shrink-0">
                      <ArrowLeftRight size={18} className="text-indigo-500" />
                    </div>
                    <div>
                      <p className="text-cobeb-text font-semibold text-sm">Transferência</p>
                      <p className="text-slate-500 text-xs mt-0.5">Transferência entre filiais</p>
                    </div>
                  </button>
                </div>
              </>
            )}

            {/* Step 2: formulário */}
            {tipoEntrada && (
              <>
                <div className="flex items-center gap-2 -mb-1">
                  <button onClick={() => setTipoEntrada(null)} className="text-slate-400 hover:text-cobeb-navy text-xs flex items-center gap-1 transition-colors">
                    ← Voltar
                  </button>
                  {(() => { const b = tipoBadge(tipoEntrada); return b ? <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${b.cls}`}>{b.label}</span> : null })()}
                </div>
                <div className="space-y-3">
                  <div>
                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-widest block mb-1">Número da NF *</label>
                    <input
                      value={numeroNFM}
                      onChange={e => setNumeroNFM(e.target.value)}
                      placeholder="Ex: 123456"
                      inputMode="numeric"
                      className="w-full bg-[#EBF5FF] border border-cobeb-border rounded-xl px-4 py-2.5 text-cobeb-text text-sm placeholder-slate-400 focus:outline-none focus:border-cobeb-blue"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-widest block mb-1">Placa Cavalo *</label>
                    <input
                      value={placaCavaloM}
                      onChange={e => setPlacaCavaloM(e.target.value.toUpperCase())}
                      placeholder="ABC-1234"
                      className="w-full bg-[#EBF5FF] border border-cobeb-border rounded-xl px-4 py-2.5 text-cobeb-text text-sm font-mono uppercase placeholder-slate-400 focus:outline-none focus:border-cobeb-blue"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-widest block mb-1">Placa Carreta (opcional)</label>
                    <input
                      value={placaCarretaM}
                      onChange={e => setPlacaCarretaM(e.target.value.toUpperCase())}
                      placeholder="DEF-5678"
                      className="w-full bg-[#EBF5FF] border border-cobeb-border rounded-xl px-4 py-2.5 text-cobeb-text text-sm font-mono uppercase placeholder-slate-400 focus:outline-none focus:border-cobeb-blue"
                    />
                  </div>
                </div>
                <button
                  onClick={criarEntrada}
                  disabled={criando || !placaCavaloM.trim() || !numeroNFM.trim()}
                  className="w-full bg-cobeb-navy hover:bg-cobeb-blue disabled:opacity-50 text-white font-bold py-3.5 rounded-xl text-sm transition-colors flex items-center justify-center gap-2"
                >
                  {criando
                    ? <><div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />Registrando...</>
                    : <><PlusCircle size={16} />Liberar Entrada</>}
                </button>
              </>
            )}

          </div>
        </div>
      )}

      <main className="px-4 pt-4 pb-8 max-w-lg mx-auto w-full space-y-5">

        {loading ? (
          <div className="flex justify-center py-20">
            <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <>
            {/* Em Atendimento */}
            {emAtendimento.length > 0 && (
              <section>
                <p className="text-[10px] font-semibold text-cobeb-yellow uppercase tracking-widest mb-2">Em Atendimento</p>
                <div className="space-y-3">
                  {emAtendimento.map(a => (
                    <div key={a.id} className="bg-white rounded-2xl border-2 border-cobeb-blue p-4">
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <TipoIcon tipo={a.tipo} size={16} className="text-cobeb-yellow shrink-0" />
                          <span className="text-cobeb-text font-bold text-sm">{a.placa_cavalo ?? '—'}</span>
                          {a.placa_carreta && <span className="text-slate-500 text-xs font-mono">/ {a.placa_carreta}</span>}
                        </div>
                        {tipoBadge(a.tipo)
                          ? <div className="text-right">
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border block ${tipoBadge(a.tipo).cls}`}>{tipoBadge(a.tipo).label}</span>
                              {a.numero_nf && <span className="text-cobeb-yellow text-xs font-mono font-semibold">NF {a.numero_nf}</span>}
                            </div>
                          : <div className="text-right space-y-0.5">
                              {a.numero_nf_saida && <p className="text-[10px] text-slate-400 font-mono">Saída: <span className="text-cobeb-yellow font-semibold">{a.numero_nf_saida}</span></p>}
                              {a.numero_nf && <p className="text-cobeb-yellow text-sm font-mono font-semibold">{a.numero_nf_saida ? 'Ent.: ' : 'NF '}{a.numero_nf}</p>}
                            </div>}
                      </div>
                      {a.agendamento && (
                        <p className="text-cobeb-navy text-[11px] font-semibold mb-1">
                          Agendado: {a.agendamento.bloco} · {a.agendamento.tipo_dia}
                        </p>
                      )}
                      <div className="flex items-center gap-3 mb-4">
                        <span className="text-slate-500 text-xs">Entrada: {formatTs(a.dt_entrada)}</span>
                        <div className="flex items-center gap-1 text-cobeb-yellow font-mono font-bold text-lg">
                          <Clock size={14} className="shrink-0" />
                          <ElapsedTimer from={a.dt_entrada} />
                        </div>
                      </div>
                      {confirmando?.id === a.id && confirmando?.acao === 'saida' ? (
                        <div className="flex gap-2">
                          <button
                            onClick={cancelarConfirmacao}
                            className="flex-1 border border-cobeb-border text-slate-500 font-semibold py-3.5 rounded-xl text-sm transition-colors hover:bg-[#EBF5FF]"
                          >
                            Cancelar
                          </button>
                          <button
                            onClick={() => registrarSaida(a)}
                            disabled={registrando === a.id}
                            className="flex-1 bg-cobeb-navy hover:bg-cobeb-blue disabled:opacity-50 text-white font-bold py-3.5 rounded-xl text-sm transition-colors flex items-center justify-center gap-2"
                          >
                            {registrando === a.id
                              ? <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                              : 'Confirmar Saída'}
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => pedirConfirmacao(a.id, 'saida')}
                          disabled={registrando === a.id}
                          className="w-full bg-cobeb-navy hover:bg-cobeb-blue disabled:opacity-50 text-white font-bold py-4 rounded-xl text-base transition-colors flex items-center justify-center gap-2"
                        >
                          <Clock size={18} />Registrar Saída
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Aguardando */}
            {aguardando.length > 0 && (
              <section>
                <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest mb-2">Aguardando Entrada</p>
                <div className="space-y-3">
                  {aguardando.map(a => (
                    <div key={a.id} className="bg-white rounded-2xl border border-cobeb-border p-4">
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <TipoIcon tipo={a.tipo} size={15} className="text-slate-500 shrink-0" />
                          <span className="text-cobeb-text font-semibold text-sm">{a.placa_cavalo ?? '—'}</span>
                          {a.placa_carreta && <span className="text-slate-500 text-xs font-mono">/ {a.placa_carreta}</span>}
                        </div>
                        {tipoBadge(a.tipo)
                          ? <div className="text-right">
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border block ${tipoBadge(a.tipo).cls}`}>{tipoBadge(a.tipo).label}</span>
                              {a.numero_nf && <span className="text-cobeb-yellow text-xs font-mono font-semibold">NF {a.numero_nf}</span>}
                            </div>
                          : <div className="text-right space-y-0.5">
                              {a.numero_nf_saida && <p className="text-[10px] text-slate-400 font-mono">Saída: <span className="text-cobeb-yellow font-semibold">{a.numero_nf_saida}</span></p>}
                              {a.numero_nf && <p className="text-cobeb-yellow text-sm font-mono font-semibold">{a.numero_nf_saida ? 'Ent.: ' : 'NF '}{a.numero_nf}</p>}
                            </div>}
                      </div>
                      {a.agendamento && (
                        <p className="text-cobeb-navy text-[11px] font-semibold mb-2">
                          Agendado: {a.agendamento.bloco} · {a.agendamento.tipo_dia}
                        </p>
                      )}
                      {confirmando?.id === a.id && confirmando?.acao === 'entrada' ? (
                        <div className="flex gap-2">
                          <button
                            onClick={cancelarConfirmacao}
                            className="flex-1 border border-cobeb-border text-slate-500 font-semibold py-3.5 rounded-xl text-sm transition-colors hover:bg-[#EBF5FF]"
                          >
                            Cancelar
                          </button>
                          <button
                            onClick={() => registrarEntrada(a)}
                            disabled={registrando === a.id}
                            className="flex-1 bg-cobeb-navy hover:bg-cobeb-blue disabled:opacity-50 text-white font-bold py-3.5 rounded-xl text-sm transition-colors flex items-center justify-center gap-2"
                          >
                            {registrando === a.id
                              ? <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                              : 'Confirmar Entrada'}
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => pedirConfirmacao(a.id, 'entrada')}
                          disabled={registrando === a.id}
                          className="w-full bg-cobeb-navy hover:bg-cobeb-blue disabled:opacity-50 text-white font-bold py-4 rounded-xl text-base transition-colors flex items-center justify-center gap-2"
                        >
                          <Clock size={18} />Registrar Entrada
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Empty */}
            {semAtividade && (
              <div className="text-center py-20">
                <div className="w-14 h-14 rounded-2xl bg-white border border-cobeb-border flex items-center justify-center mx-auto mb-4">
                  <Truck size={24} className="text-cobeb-border" />
                </div>
                <p className="text-slate-500 text-sm font-medium">Nenhum atendimento encontrado</p>
                <p className="text-cobeb-border text-xs mt-1">Ajuste os filtros ou aguarde novos registros</p>
              </div>
            )}

            {/* Concluídos */}
            {concluidos.length > 0 && (
              <section>
                <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest mb-2">Concluídos</p>
                <div className="space-y-2">
                  {concluidos.map(a => {
                    const tma = diffHHMM(a.dt_entrada, a.dt_saida)
                    return (
                      <div key={a.id} className="bg-white rounded-2xl border border-cobeb-border px-4 py-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2 min-w-0">
                            <CheckCircle size={14} className="text-green-400 shrink-0" />
                            <span className="text-cobeb-text text-sm font-semibold font-mono">{a.placa_cavalo ?? '—'}</span>
                            {a.placa_carreta && <span className="text-slate-500 text-xs font-mono truncate">/ {a.placa_carreta}</span>}
                            {tipoBadge(a.tipo)
                              ? <><span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full border ${tipoBadge(a.tipo).cls}`}>{tipoBadge(a.tipo).abbr}</span>{a.numero_nf && <span className="text-slate-400 text-xs">NF {a.numero_nf}</span>}</>
                              : <>
                                  {a.numero_nf_saida && <span className="text-[10px] text-slate-400 font-mono">Saída:{a.numero_nf_saida}</span>}
                                  {a.numero_nf && <span className="text-slate-400 text-xs">{a.numero_nf_saida ? ' Ent.:' : 'NF '}{a.numero_nf}</span>}
                                </>}
                          </div>
                          {tma && <span className="text-cobeb-yellow font-mono text-sm font-bold shrink-0 ml-2">{tma}</span>}
                        </div>
                        <div className="flex items-center gap-4 mt-1.5 text-[10px] text-slate-500">
                          <span>Entrada: {formatTs(a.dt_entrada)}</span>
                          <span>Saída: {formatTs(a.dt_saida)}</span>
                          {tma && <span className="text-cobeb-yellow font-semibold">TMA {tma}</span>}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </section>
            )}
          </>
        )}
      </main>
    </div>
  )
}
