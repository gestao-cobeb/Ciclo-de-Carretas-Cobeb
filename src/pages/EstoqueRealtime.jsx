import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Forklift, LogOut, ChevronDown, ChevronUp, AlertTriangle, Clock, RefreshCw, Package, LayoutGrid, Map, Wifi, Building2, Home, Pencil, Check, X, RotateCcw, ArrowLeftRight, MapPin } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import MapaRealtime from './MapaRealtime'

// ── Configuração de status ────────────────────────────────────────────────────

const STATUS_CFG = {
  iniciada: {
    label:  'Aguardando Saída',
    step:   0,
    border: 'border-l-slate-300',
    badge:  'bg-slate-100 text-slate-500 border-slate-200',
    urgent: false,
  },
  em_transito: {
    label:  'Em Rota p/ Fábrica',
    step:   1,
    border: 'border-l-blue-400',
    badge:  'bg-blue-50 text-blue-500 border-blue-200',
    urgent: false,
  },
  na_fabrica: {
    label:  'Na Fábrica',
    step:   2,
    border: 'border-l-blue-500',
    badge:  'bg-blue-50 text-blue-600 border-blue-200',
    urgent: false,
  },
  retornando: {
    label:  'Retornando',
    step:   3,
    border: 'border-l-yellow-400',
    badge:  'bg-yellow-50 text-yellow-600 border-yellow-200',
    urgent: true,
  },
  aguardando_conferencia: {
    label:  'Chegou',
    step:   4,
    border: 'border-l-green-400',
    badge:  'bg-green-50 text-green-600 border-green-200',
    urgent: false,
  },
}

const STEP_LABELS = ['Saída', 'Em Rota', 'Fábrica', 'Retorno', 'Chegou']

// ── Componente principal ──────────────────────────────────────────────────────

export default function EstoqueRealtime({ adminMode = false }) {
  const { profile, signOut, setModoVisao } = useAuth()
  const navigate = useNavigate()
  const [viagens,    setViagens]    = useState([])
  const [loading,    setLoading]    = useState(true)
  const [expanded,   setExpanded]   = useState(new Set())
  const [lastUpdate, setLastUpdate] = useState(null)
  const [view,       setView]       = useState('lista')
  const [unidades,   setUnidades]   = useState([])
  const channelRef = useRef(null)

  useEffect(() => {
    supabase.from('unidades')
      .select('id, nome')
      .eq('tipo', 'revenda')
      .eq('ativo', true)
      .order('nome')
      .then(({ data }) => setUnidades(data ?? []))
  }, [])

  useEffect(() => {
    loadData()

    // Polling a cada 15s para manter painel atualizado
    const timer = setInterval(() => loadData(true), 15000)

    // Supabase Realtime — funciona se a tabela viagens tiver Realtime habilitado
    channelRef.current = supabase
      .channel('painel-viagens')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'viagens' }, () => {
        loadData(true)
      })
      .subscribe()

    return () => {
      clearInterval(timer)
      if (channelRef.current) supabase.removeChannel(channelRef.current)
    }
  }, [])

  const isAdminTotal = profile?.acesso_total === true

  async function loadData(silent = false) {
    if (!silent) setLoading(true)
    const { data, error } = await supabase.rpc('get_painel_viagens')
    if (!error && data) {
      const todasUnidades = profile?.todas_unidades === true
      const filtrado = (isAdminTotal || todasUnidades)
        ? data
        : data.filter(v => v.unidade_descarga_id === profile?.unidade_id)
      setViagens(filtrado)
      setLastUpdate(new Date())
    }
    if (!silent) setLoading(false)
  }

  function toggleExpand(id) {
    setExpanded(prev => {
      const n = new Set(prev)
      n.has(id) ? n.delete(id) : n.add(id)
      return n
    })
  }

  const urgentes = viagens.filter(v => v.status === 'retornando').length

  const conteudo = (
    <>
      {loading ? (
        <div className="flex flex-col items-center justify-center py-24 gap-3">
          <div className="w-8 h-8 border-2 border-cobeb-navy border-t-transparent rounded-full animate-spin" />
          <p className="text-slate-500 text-sm">Carregando veículos...</p>
        </div>
      ) : viagens.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="px-4 pt-4 space-y-3 max-w-lg mx-auto">
          <div className="flex items-center justify-between">
            <p className="text-cobeb-text font-semibold text-sm">
              {viagens.length} veículo{viagens.length !== 1 ? 's' : ''} ativo{viagens.length !== 1 ? 's' : ''}
            </p>
            {urgentes > 0 && (
              <span className="flex items-center gap-1.5 text-[11px] font-bold text-yellow-600 bg-yellow-50 border border-yellow-200 px-2.5 py-1 rounded-full">
                <AlertTriangle size={11} />
                {urgentes} retornando
              </span>
            )}
            {lastUpdate && (
              <span className="text-slate-400 text-[10px]">
                {lastUpdate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
          </div>
          {viagens.map(v => (
            <ViagemCard
              key={v.id}
              viagem={v}
              expanded={expanded.has(v.id)}
              onToggle={() => toggleExpand(v.id)}
              isAdminTotal={isAdminTotal}
              onRefresh={() => loadData(true)}
              unidades={unidades}
            />
          ))}
        </div>
      )}
    </>
  )

  if (adminMode) {
    if (view === 'mapa') return (
      <div className="relative" style={{ height: 'calc(100dvh - 150px)' }}>
        <MapaRealtime onVoltar={() => setView('lista')} />
      </div>
    )
    return (
      <div className="pb-6">
        <div className="px-4 pt-4 max-w-lg mx-auto">
          <button
            onClick={() => setView('mapa')}
            className="w-full flex items-center justify-center gap-2 bg-cobeb-navy hover:bg-cobeb-blue text-white text-sm font-semibold py-3 rounded-xl transition-colors mb-4"
          >
            <Map size={16} />
            Mapa em Tempo Real
          </button>
        </div>
        {conteudo}
      </div>
    )
  }

  if (view === 'mapa') {
    return (
      <div className="flex flex-col" style={{ height: '100dvh' }}>
        <header className="bg-cobeb-navy px-5 py-3.5 flex items-center justify-center shadow-md shadow-cobeb-navy/20 shrink-0">
          <p className="text-white text-sm font-semibold">Mapa em Tempo Real</p>
        </header>
        <main className="flex-1 relative overflow-hidden" style={{ minHeight: 0 }}>
          <MapaRealtime onVoltar={() => setView('lista')} />
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-dvh bg-[#EBF5FF] flex flex-col">

      {/* Header */}
      <header className="bg-cobeb-navy px-5 py-3.5 flex items-center justify-between shadow-md shadow-cobeb-navy/20 shrink-0">
        <div className="flex items-center gap-3">
          <img
            src={`${import.meta.env.BASE_URL}logos/logo-cobeb-transparent.png`}
            alt="COBEB"
            className="h-12 w-auto object-contain"
            style={{ filter: 'brightness(0) invert(1)', opacity: 0.92 }}
            onError={e => { e.target.style.display = 'none' }}
          />
          <div>
            <p className="text-white text-sm font-semibold leading-tight">Painel de Veículos</p>
            <p className="text-blue-300/60 text-[10px] font-medium tracking-wide uppercase">
              {profile?.unidade?.nome ?? 'Tempo Real'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          {lastUpdate && (
            <span className="text-blue-300/40 text-[10px] mr-1">
              {lastUpdate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
          <button
            onClick={() => loadData(true)}
            className="text-blue-300/70 hover:text-cobeb-yellow transition-colors p-1.5 rounded-lg hover:bg-white/10"
            title="Atualizar"
          >
            <RefreshCw size={16} />
          </button>
          {profile?.perfil === 'admin' && (
            <button
              onClick={() => { setModoVisao(null); navigate('/selecionar-modulo') }}
              className="text-cobeb-yellow hover:text-white transition-colors p-1.5 rounded-lg hover:bg-white/10"
              title="Trocar Módulo"
            >
              <LayoutGrid size={18} />
            </button>
          )}
          <button
            onClick={signOut}
            className="text-blue-300/70 hover:text-white transition-colors p-1.5 rounded-lg hover:bg-white/10"
            title="Sair"
          >
            <LogOut size={16} />
          </button>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto pb-6">
        {profile?.acesso_total && (
          <div className="px-4 pt-4 max-w-lg mx-auto">
            <button
              onClick={() => setView('mapa')}
              className="w-full flex items-center justify-center gap-2 bg-cobeb-navy hover:bg-cobeb-blue text-white text-sm font-semibold py-3 rounded-xl transition-colors mb-1"
            >
              <Map size={16} />
              Mapa em Tempo Real
            </button>
          </div>
        )}
        {conteudo}
      </main>
    </div>
  )
}

// ── Card de viagem ────────────────────────────────────────────────────────────

function ViagemCard({ viagem, expanded, onToggle, isAdminTotal, onRefresh, unidades = [] }) {
  const cfg      = STATUS_CFG[viagem.status] ?? STATUS_CFG.iniciada
  const produtos = viagem.produtos ?? []

  const [editHorario,  setEditHorario]  = useState(false)
  const [novoHorario,  setNovoHorario]  = useState('')
  const [showRollback, setShowRollback] = useState(false)
  const [adminLoading, setAdminLoading] = useState(false)

  const [editDestino,   setEditDestino]   = useState(false)
  const [novaDest,      setNovaDest]      = useState('')
  const [savingDestino, setSavingDestino] = useState(false)

  // Estado de substituição de produto
  const [substituindo,     setSubstituindo]     = useState(null)  // id do pedido sendo substituído
  const [subCodigo,        setSubCodigo]        = useState('')
  const [subDescricao,     setSubDescricao]     = useState('')
  const [subQtde,          setSubQtde]          = useState('')
  const [subBuscando,      setSubBuscando]      = useState(false)
  const [subNaoEncontrado, setSubNaoEncontrado] = useState(false)

  const podeReverter    = isAdminTotal && ['na_fabrica', 'retornando'].includes(viagem.status)
  const podeSubstituir  = isAdminTotal && ['iniciada', 'em_transito', 'na_fabrica'].includes(viagem.status)

  async function salvarDestino() {
    if (!novaDest || novaDest === viagem.unidade_descarga_id) return
    setSavingDestino(true)
    const { error } = await supabase
      .from('viagens')
      .update({ unidade_descarga_id: novaDest })
      .eq('id', viagem.id)
    if (error) { alert('Erro ao redirecionar: ' + error.message); setSavingDestino(false); return }
    if (viagem.agendamento_id) {
      await supabase
        .from('agendamentos')
        .update({ status: 'cancelado' })
        .eq('id', viagem.agendamento_id)
    }
    setSavingDestino(false)
    setEditDestino(false)
    setNovaDest('')
    onRefresh?.()
  }

  async function salvarHorario() {
    setAdminLoading(true)
    const { error } = await supabase.rpc('admin_atualizar_horario_agendado', {
      p_viagem_id:    viagem.id,
      p_novo_horario: novoHorario,
    })
    setAdminLoading(false)
    if (error) { alert('Erro ao salvar horário: ' + error.message); return }
    setEditHorario(false)
    onRefresh?.()
  }

  async function confirmarRollback(targetStatus) {
    setAdminLoading(true)
    const { error } = await supabase.rpc('admin_reverter_status_viagem', {
      p_viagem_id:     viagem.id,
      p_target_status: targetStatus,
    })
    setAdminLoading(false)
    if (error) { alert('Erro ao reverter: ' + error.message); return }
    setShowRollback(false)
    onRefresh?.()
  }

  function abrirSubstituicao(itemId) {
    setSubstituindo(itemId)
    setSubCodigo('')
    setSubDescricao('')
    setSubQtde('')
    setSubBuscando(false)
    setSubNaoEncontrado(false)
  }

  function fecharSubstituicao() {
    setSubstituindo(null)
    setSubNaoEncontrado(false)
  }

  async function buscarDescricaoProduto(codigo) {
    if (!codigo.trim()) return
    setSubBuscando(true)
    setSubDescricao('')
    setSubNaoEncontrado(false)
    const { data } = await supabase
      .from('produtos_catalogo')
      .select('descricao')
      .eq('codigo', codigo.trim())
      .maybeSingle()
    setSubBuscando(false)
    if (data?.descricao) {
      setSubDescricao(data.descricao)
      setSubNaoEncontrado(false)
    } else {
      setSubNaoEncontrado(true)
    }
  }

  async function confirmarSubstituicao() {
    if (!substituindo || !subCodigo.trim() || !subDescricao.trim() || !subQtde) return
    setAdminLoading(true)
    const { error } = await supabase.rpc('admin_substituir_produto', {
      p_item_id:          substituindo,
      p_cod_produto_novo: subCodigo.trim(),
      p_descricao_nova:   subDescricao.trim(),
      p_qtde_pallets:     Number(subQtde),
    })
    setAdminLoading(false)
    if (error) { alert('Erro ao substituir produto: ' + error.message); return }
    fecharSubstituicao()
    onRefresh?.()
  }

  return (
    <div className={`bg-white rounded-2xl border border-cobeb-border overflow-hidden border-l-4 ${cfg.border} shadow-sm`}>

      {/* Banner ⚠️ ATENÇÃO */}
      {cfg.urgent && (
        <div className="bg-yellow-50 border-b border-yellow-200 px-4 py-2 flex items-center gap-2">
          <AlertTriangle size={13} className="text-yellow-500 shrink-0" />
          <p className="text-yellow-700 font-bold text-xs uppercase tracking-wide">
            ATENÇÃO — Veículo a caminho
          </p>
        </div>
      )}

      {/* Corpo (clicável) */}
      <button onClick={onToggle} className="w-full text-left px-4 py-3.5">

        {/* Linha 1: placas + badge de status + chevron */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-cobeb-text font-bold text-sm font-mono tracking-wide">
                {viagem.placa_cavalo ?? '—'}
              </span>
              {viagem.placa_carreta && (
                <>
                  <span className="text-slate-300 text-xs">·</span>
                  <span className="text-slate-500 text-xs font-mono">{viagem.placa_carreta}</span>
                </>
              )}
            </div>
            {viagem.motorista_nome && (
              <p className="text-slate-500 text-xs mt-0.5">{viagem.motorista_nome}</p>
            )}
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {viagem.tem_substituicao && (
              <span className="text-[10px] font-semibold px-2 py-1 rounded-full border bg-orange-50 text-orange-600 border-orange-200 whitespace-nowrap">
                BO vinculado
              </span>
            )}
            <span className={`text-[10px] font-semibold px-2.5 py-1 rounded-full border whitespace-nowrap ${cfg.badge}`}>
              {cfg.label}
            </span>
            {expanded
              ? <ChevronUp  size={14} className="text-slate-400" />
              : <ChevronDown size={14} className="text-slate-400" />}
          </div>
        </div>

        {/* Linha 2: NFs + pedidos */}
        <div className="flex items-center gap-3 mt-2 flex-wrap">
          {viagem.numero_nf_saida && (
            <span className="text-[11px] text-slate-500">
              NF Saída <span className="font-semibold text-cobeb-yellow">{viagem.numero_nf_saida}</span>
            </span>
          )}
          {viagem.numero_nf && (
            <span className="text-[11px] text-slate-500">
              {viagem.numero_nf_saida ? 'NF Entrada ' : 'NF '}
              <span className="font-semibold text-cobeb-text">{viagem.numero_nf}</span>
            </span>
          )}
          {Number(viagem.total_pedidos) > 0 && (
            <span className="flex items-center gap-1 text-[11px] text-slate-500">
              <Package size={10} />
              {viagem.total_pedidos} pedido{viagem.total_pedidos !== 1 ? 's' : ''}
            </span>
          )}
        </div>

        {/* Linha 3: agendamentos fábrica e revenda */}
        {(viagem.horario_agendado || viagem.agendamento_bloco) && (
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            {viagem.horario_agendado && (
              <span className="flex items-center gap-1 text-[11px] font-semibold text-blue-600 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-full">
                <Building2 size={9} />
                Fáb. {viagem.horario_agendado}
                {isAdminTotal && !editHorario && (
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={e => {
                      e.stopPropagation()
                      setNovoHorario(viagem.horario_agendado)
                      setEditHorario(true)
                    }}
                    className="ml-0.5 cursor-pointer text-blue-400 hover:text-blue-600 transition-colors leading-none"
                    title="Editar horário fábrica"
                  >
                    <Pencil size={8} />
                  </span>
                )}
              </span>
            )}
            {viagem.agendamento_bloco && (
              <span className="flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                <Home size={9} />
                Rev. {viagem.agendamento_bloco}
                {viagem.agendamento_data && (
                  <span className="font-normal text-emerald-600">
                    {' · '}{new Date(viagem.agendamento_data + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
                  </span>
                )}
              </span>
            )}
          </div>
        )}

        {/* Linha 4: Destino */}
        {viagem.unidade_descarga_nome && (
          <div className="flex items-center gap-1.5 mt-1.5">
            <span className="flex items-center gap-1 text-[11px] font-semibold text-slate-600 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-full">
              <MapPin size={9} />
              {viagem.unidade_descarga_nome}
              {isAdminTotal && !editDestino && (
                <span
                  role="button"
                  tabIndex={0}
                  onClick={e => {
                    e.stopPropagation()
                    setNovaDest(viagem.unidade_descarga_id)
                    setEditDestino(true)
                  }}
                  className="ml-0.5 cursor-pointer text-slate-400 hover:text-slate-600 transition-colors leading-none"
                  title="Redirecionar destino"
                >
                  <Pencil size={8} />
                </span>
              )}
            </span>
          </div>
        )}

        {/* Indicador de etapas */}
        <StepIndicator step={cfg.step} />

        {/* Sinal GPS */}
        {['em_transito', 'na_fabrica', 'retornando'].includes(viagem.status) && (() => {
          const sinal = sinalGPS(viagem.motorista_last_seen_at)
          return (
            <div className="flex items-center gap-1.5 mt-2 pt-2 border-t border-cobeb-border/30">
              <Wifi size={11} className={sinal ? sinal.cor : 'text-slate-300'} />
              <span className={`text-[10px] font-medium ${sinal ? sinal.cor : 'text-slate-400'}`}>
                {sinal ? sinal.label : 'Aguardando GPS…'}
              </span>
            </div>
          )
        })()}
      </button>

      {/* Edição inline de horário fábrica (admin) */}
      {editHorario && (
        <div className="px-4 py-2.5 flex items-center gap-2 bg-blue-50/60 border-t border-blue-100">
          <Building2 size={11} className="text-blue-500 shrink-0" />
          <span className="text-[11px] font-semibold text-blue-600 whitespace-nowrap shrink-0">Horário Fáb.</span>
          <input
            type="time"
            value={novoHorario}
            onChange={e => setNovoHorario(e.target.value)}
            className="text-[11px] border border-blue-300 rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-cobeb-blue [color-scheme:light] bg-white min-w-0 flex-1"
            autoFocus
          />
          <button
            onClick={salvarHorario}
            disabled={adminLoading || !novoHorario}
            className="flex items-center gap-1 text-[11px] font-semibold text-white bg-green-500 hover:bg-green-600 disabled:opacity-50 px-2.5 py-1 rounded-lg transition-colors shrink-0"
          >
            {adminLoading
              ? <div className="w-3 h-3 border border-white/40 border-t-white rounded-full animate-spin" />
              : <Check size={11} />}
            Salvar
          </button>
          <button
            onClick={() => { setEditHorario(false); setNovoHorario('') }}
            className="text-slate-400 hover:text-slate-600 transition-colors p-1 shrink-0"
          >
            <X size={12} />
          </button>
        </div>
      )}

      {/* Edição inline de destino (admin total) */}
      {editDestino && (
        <div className="px-4 py-2.5 flex items-center gap-2 bg-slate-50/80 border-t border-slate-100">
          <MapPin size={11} className="text-slate-500 shrink-0" />
          <span className="text-[11px] font-semibold text-slate-600 whitespace-nowrap shrink-0">Destino</span>
          <select
            value={novaDest}
            onChange={e => setNovaDest(e.target.value)}
            className="text-[11px] border border-slate-300 rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-cobeb-blue bg-white flex-1 min-w-0"
            autoFocus
          >
            <option value="">— Selecionar —</option>
            {unidades.map(u => (
              <option key={u.id} value={u.id}>{u.nome}</option>
            ))}
          </select>
          <button
            onClick={salvarDestino}
            disabled={savingDestino || !novaDest || novaDest === viagem.unidade_descarga_id}
            className="flex items-center gap-1 text-[11px] font-semibold text-white bg-green-500 hover:bg-green-600 disabled:opacity-50 px-2.5 py-1 rounded-lg transition-colors shrink-0"
          >
            {savingDestino
              ? <div className="w-3 h-3 border border-white/40 border-t-white rounded-full animate-spin" />
              : <Check size={11} />}
            Salvar
          </button>
          <button
            onClick={() => { setEditDestino(false); setNovaDest('') }}
            className="text-slate-400 hover:text-slate-600 transition-colors p-1 shrink-0"
          >
            <X size={12} />
          </button>
        </div>
      )}

      {/* Expanded: produtos + painel admin */}
      {expanded && (
        <div className="border-t border-cobeb-border/40">
          {/* Lista de produtos */}
          {produtos.length > 0 ? (
            <>
              <div className="px-4 py-2 bg-[#EBF5FF]">
                <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest">
                  Produtos do pedido
                </p>
              </div>
              <div className="divide-y divide-cobeb-border/30">
                {produtos.map((p, i) => {
                  const cancelado = p.status === 'cancelado'
                  return (
                  <div key={p.id ?? i}>
                    {/* Linha do produto */}
                    <div className={`px-4 py-2.5 flex items-start justify-between gap-3 ${cancelado ? 'bg-red-50/60' : ''}`}>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {cancelado && (
                            <span className="text-[9px] font-bold text-red-500 border border-red-300 bg-red-50 px-1.5 py-0.5 rounded-full uppercase tracking-wide shrink-0">
                              Cancelado
                            </span>
                          )}
                          <p className={`text-xs font-medium ${cancelado ? 'text-red-400 line-through' : 'text-cobeb-text'}`}>
                            {p.descricao}
                          </p>
                        </div>
                        {p.embalagem && (
                          <p className={`text-[10px] mt-0.5 ${cancelado ? 'text-red-300' : 'text-slate-400'}`}>{p.embalagem}</p>
                        )}
                      </div>
                      <div className="flex items-start gap-2 shrink-0">
                        <div className="text-right">
                          <p className={`text-xs font-semibold ${cancelado ? 'text-red-400' : 'text-cobeb-text'}`}>
                            {Number(p.qtde_pallets).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} plt
                          </p>
                          <p className={`text-[10px] ${cancelado ? 'text-red-300' : 'text-slate-400'}`}>
                            {Number(p.qtde_skus).toLocaleString('pt-BR')} cx
                          </p>
                        </div>
                        {podeSubstituir && p.id && !cancelado && substituindo !== p.id && (
                          <span
                            role="button"
                            tabIndex={0}
                            title="Substituir produto"
                            onClick={() => abrirSubstituicao(p.id)}
                            onKeyDown={e => e.key === 'Enter' && abrirSubstituicao(p.id)}
                            className="mt-0.5 cursor-pointer text-slate-300 hover:text-orange-400 transition-colors"
                          >
                            <ArrowLeftRight size={11} />
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Formulário de substituição (inline) */}
                    {substituindo === p.id && (
                      <div className="px-4 pb-3.5 bg-orange-50/70 border-t border-orange-100">
                        <p className="text-[9px] font-bold text-orange-500 uppercase tracking-widest pt-2 mb-2.5">
                          ↳ Substituir produto
                        </p>
                        <div className="space-y-2">
                          {/* Busca por código */}
                          <div className="flex gap-2">
                            <input
                              type="text"
                              placeholder="Código do produto"
                              value={subCodigo}
                              onChange={e => {
                                setSubCodigo(e.target.value)
                                setSubDescricao('')
                                setSubNaoEncontrado(false)
                              }}
                              onKeyDown={e => e.key === 'Enter' && buscarDescricaoProduto(subCodigo)}
                              className="flex-1 text-[11px] border border-orange-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-orange-400 bg-white min-w-0"
                            />
                            <button
                              onClick={() => buscarDescricaoProduto(subCodigo)}
                              disabled={!subCodigo.trim() || subBuscando}
                              className="flex items-center gap-1 text-[11px] font-semibold text-white bg-orange-400 hover:bg-orange-500 disabled:opacity-40 px-2.5 py-1.5 rounded-lg transition-colors shrink-0"
                            >
                              {subBuscando
                                ? <div className="w-3 h-3 border border-white/40 border-t-white rounded-full animate-spin" />
                                : 'Buscar'}
                            </button>
                          </div>

                          {/* Aviso produto não encontrado */}
                          {subNaoEncontrado && (
                            <p className="text-[10px] text-orange-600 flex items-center gap-1">
                              <AlertTriangle size={9} />
                              Não encontrado no cadastro — preencha a descrição manualmente.
                            </p>
                          )}

                          {/* Campo de descrição */}
                          {(subDescricao !== '' || subNaoEncontrado) && (
                            <input
                              type="text"
                              placeholder="Descrição do produto"
                              value={subDescricao}
                              onChange={e => setSubDescricao(e.target.value)}
                              className="w-full text-[11px] border border-orange-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-orange-400 bg-white"
                            />
                          )}

                          {/* Quantidade de paletes */}
                          {(subDescricao !== '' || subNaoEncontrado) && (
                            <div className="flex items-center gap-2">
                              <input
                                type="number"
                                min="0.5"
                                step="0.5"
                                placeholder="Paletes"
                                value={subQtde}
                                onChange={e => setSubQtde(e.target.value)}
                                className="w-28 text-[11px] border border-orange-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-orange-400 bg-white"
                              />
                              <span className="text-[10px] text-slate-400">paletes</span>
                            </div>
                          )}

                          {/* Botões de ação */}
                          <div className="flex gap-2 pt-0.5">
                            <button
                              onClick={confirmarSubstituicao}
                              disabled={adminLoading || !subCodigo.trim() || !subDescricao.trim() || !subQtde}
                              className="flex items-center gap-1.5 text-[11px] font-semibold text-white bg-orange-500 hover:bg-orange-600 disabled:opacity-40 px-3 py-1.5 rounded-lg transition-colors"
                            >
                              {adminLoading
                                ? <div className="w-3 h-3 border border-white/40 border-t-white rounded-full animate-spin" />
                                : <Check size={11} />}
                              Confirmar substituição
                            </button>
                            <button
                              onClick={fecharSubstituicao}
                              className="text-[11px] text-slate-400 hover:text-slate-600 transition-colors px-2 py-1.5"
                            >
                              Cancelar
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                  )
                })}
              </div>
            </>
          ) : (
            <div className="px-4 py-4 text-center">
              <p className="text-slate-400 text-xs">Produtos não vinculados ao pedido ainda</p>
            </div>
          )}

          {/* Painel admin: horário (quando nulo) + rollback de fase */}
          {isAdminTotal && (
            <div className="border-t border-cobeb-border/30">
              <div className="px-4 py-2 bg-slate-50/80">
                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Admin</p>
              </div>
              <div className="px-4 py-3 space-y-3">

                {/* Opção de definir horário quando ainda não existe */}
                {!viagem.horario_agendado && !editHorario && (
                  <button
                    onClick={() => { setNovoHorario(''); setEditHorario(true) }}
                    className="flex items-center gap-1.5 text-[11px] font-semibold text-blue-500 hover:text-blue-700 transition-colors"
                  >
                    <Pencil size={11} />
                    Definir horário fábrica
                  </button>
                )}

                {/* Rollback de fase */}
                {podeReverter && (
                  !showRollback ? (
                    <button
                      onClick={() => setShowRollback(true)}
                      className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500 hover:text-slate-700 transition-colors"
                    >
                      <RotateCcw size={11} />
                      Reverter fase da viagem
                    </button>
                  ) : (
                    <div className="space-y-2.5">
                      <div className="flex items-start gap-1.5 bg-yellow-50 border border-yellow-200 rounded-xl px-3 py-2">
                        <AlertTriangle size={11} className="text-yellow-500 shrink-0 mt-0.5" />
                        <p className="text-[10px] text-yellow-700 leading-relaxed">
                          Se o GPS do motorista estiver ativo, o geofence pode desfazer esta alteração automaticamente na próxima atualização de posição (~30s).
                        </p>
                      </div>
                      <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">
                        Reverter para:
                      </p>
                      <div className="flex gap-2 flex-wrap">
                        {viagem.status === 'retornando' && (
                          <button
                            onClick={() => confirmarRollback('na_fabrica')}
                            disabled={adminLoading}
                            className="flex items-center gap-1.5 text-[11px] font-semibold text-blue-600 bg-blue-50 border border-blue-200 px-3 py-1.5 rounded-xl hover:bg-blue-100 transition-colors disabled:opacity-50"
                          >
                            {adminLoading
                              ? <div className="w-3 h-3 border border-blue-400/40 border-t-blue-500 rounded-full animate-spin" />
                              : <RotateCcw size={10} />}
                            Na Fábrica
                          </button>
                        )}
                        <button
                          onClick={() => confirmarRollback('em_transito')}
                          disabled={adminLoading}
                          className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-600 bg-slate-100 border border-slate-200 px-3 py-1.5 rounded-xl hover:bg-slate-200 transition-colors disabled:opacity-50"
                        >
                          {adminLoading
                            ? <div className="w-3 h-3 border border-slate-400/40 border-t-slate-500 rounded-full animate-spin" />
                            : <RotateCcw size={10} />}
                          Em Rota
                        </button>
                        <button
                          onClick={() => setShowRollback(false)}
                          className="text-[11px] text-slate-400 hover:text-slate-600 transition-colors px-2 py-1.5"
                        >
                          Cancelar
                        </button>
                      </div>
                    </div>
                  )
                )}

                {/* Mensagem quando nenhuma ação admin está disponível */}
                {!podeReverter && viagem.horario_agendado && (
                  <p className="text-[10px] text-slate-400">
                    Clique no ✏ ao lado do horário para editá-lo.
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Sinal GPS ────────────────────────────────────────────────────────────────

function sinalGPS(lastSeen) {
  if (!lastSeen) return null
  const mins = (Date.now() - new Date(lastSeen)) / 60000
  if (mins <= 5)  return { cor: 'text-green-500',  label: 'GPS ativo' }
  if (mins <= 30) return { cor: 'text-orange-500', label: `${Math.round(mins)}min sem atualizar` }
  return { cor: 'text-red-500', label: `${Math.round(mins)}min sem sinal` }
}

// ── Indicador de etapas ───────────────────────────────────────────────────────

function StepIndicator({ step }) {
  return (
    <div className="flex items-start mt-3.5 gap-0">
      {STEP_LABELS.map((label, i) => {
        const done    = i < step
        const current = i === step
        const isLast  = i === STEP_LABELS.length - 1
        return (
          <div key={i} className="flex items-center flex-1 min-w-0">
            <div className="flex flex-col items-center">
              <div className={`w-2.5 h-2.5 rounded-full border-2 transition-all ${
                current ? 'bg-cobeb-navy border-cobeb-navy scale-125' :
                done    ? 'bg-cobeb-navy border-cobeb-navy' :
                          'bg-white border-cobeb-border'
              }`} />
              <p className={`text-[8px] font-semibold mt-0.5 whitespace-nowrap ${
                current ? 'text-cobeb-navy' :
                done    ? 'text-cobeb-navy/50' :
                          'text-slate-300'
              }`}>{label}</p>
            </div>
            {!isLast && (
              <div className={`h-0.5 flex-1 mx-0.5 mb-3 ${
                done ? 'bg-cobeb-navy' : 'bg-cobeb-border'
              }`} />
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── Estado vazio ──────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-24 gap-5 px-6 text-center">
      <div className="w-20 h-20 rounded-2xl bg-white border border-cobeb-border flex items-center justify-center shadow-sm">
        <Forklift size={32} className="text-cobeb-border" />
      </div>
      <div>
        <p className="text-cobeb-text font-bold text-base">Nenhum veículo ativo</p>
        <p className="text-slate-500 text-sm mt-1.5 leading-relaxed">
          Quando um motorista iniciar uma viagem para esta unidade, o card aparecerá aqui automaticamente.
        </p>
      </div>
    </div>
  )
}
