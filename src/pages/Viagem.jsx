import { useState, useEffect, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Truck, ChevronLeft, ChevronRight, Plus, Trash2,
  CheckCircle, Clock, MapPin, Home, Search,
  AlertCircle, WifiOff, RefreshCw, LogOut, Package,
  AlertTriangle, User, LayoutGrid, Navigation,
  Calendar, CalendarCheck, X,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import {
  saveOfflineAction, getOfflineQueue, clearOfflineQueue,
  hasOfflineActions, cacheViagem, getCachedViagem,
} from '../lib/offline'
import { useRastreamento, IS_NATIVE_APP } from '../hooks/useRastreamento'
import InstalarApp from './InstalarApp'

// ── Etapas manuais (aparecem na UI) ──────────────────────────────────────────

const ETAPAS = [
  { key: 'saida_revenda',   label: 'Saída da Revenda',   field: 'dt_saida_revenda',   nextStatus: 'em_transito',            Icon: MapPin,      requireNF: false, closeCycle: false },
  { key: 'chegada_revenda', label: 'Chegada na Revenda', field: 'dt_chegada_revenda', nextStatus: 'aguardando_conferencia', Icon: Home,        requireNF: true,  closeCycle: false },
  { key: 'saida_entrega',   label: 'Finalizar Viagem',   field: 'dt_saida_entrega',   nextStatus: 'concluida',              Icon: CheckCircle, requireNF: false, closeCycle: true  },
]

function formatTs(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

function diffHHMM(start, end) {
  if (!start || !end) return '—'
  const ms = new Date(end) - new Date(start)
  if (ms <= 0) return '00:00'
  const h = Math.floor(ms / 3600000)
  const m = Math.floor((ms % 3600000) / 60000)
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function Viagem() {
  const { profile, signOut, setModoVisao } = useAuth()
  const navigate = useNavigate()

  const [view, setView]               = useState('loading')
  const [viagemAtiva, setViagemAtiva] = useState(null)
  const [pedidosDaViagem, setPedidosDaViagem] = useState([])

  const [carretas, setCarretas]   = useState([])
  const [cavalos,  setCavalos]    = useState([])
  const [unidades, setUnidades]   = useState([])
  const [motoristas, setMotoristas] = useState([])

  // wizard
  const [step, setStep]                           = useState(1)
  const [carreta, setCarreta]                     = useState(null)
  const [cavalo, setCavalo]                       = useState(null)
  const [pedidosAdicionados, setPedidos]          = useState([])
  const [horarioAgendado, setHorario]             = useState('')
  const [motoristaSelecionada, setMotoristaSelecionada] = useState(null)
  const [searchNum, setSearchNum]                 = useState('')
  const [searching, setSearching]                 = useState(false)
  const [searchResult, setSearchResult]           = useState(null)
  const [nfSaida,  setNfSaida]                     = useState('')
  const [iniciando, setIniciando]                 = useState(false)

  // stages
  const [registrando, setRegistrando] = useState(false)
  const [showNF, setShowNF]           = useState(false)
  const [numeroNF, setNumeroNF]       = useState('')

  // rastreamento
  const [fabricasAlvo,     setFabricasAlvo]     = useState([])
  const [aceitouNavegador, setAceitouNavegador] = useState(false)
  const statusRef  = useRef(null)
  const channelRef = useRef(null)

  // módulo 6
  const [tarefaStatus,   setTarefaStatus]   = useState(null) // null | 'pendente' | 'em_andamento' | 'concluida'
  const [portariaStatus, setPortariaStatus] = useState(null) // null | 'aguardando' | 'em_atendimento' | 'concluido'
  const [portariaSaida,  setPortariaSaida]  = useState(null) // timestamp da saída da portaria
  const [resumoData,     setResumoData]     = useState(null)

  // agendamento
  const [agendamento,          setAgendamento]          = useState(null)
  const [showModalAgendamento, setShowModalAgendamento] = useState(false)

  // offline
  const [isOnline, setIsOnline]       = useState(navigator.onLine)
  const [pendingSync, setPendingSync] = useState(hasOfflineActions)
  const [syncing, setSyncing]         = useState(false)

  // Mantém statusRef sincronizado com o estado atual da viagem
  useEffect(() => { statusRef.current = viagemAtiva?.status ?? null }, [viagemAtiva?.status])

  // Hook de rastreamento GPS (deve ser chamado antes dos demais useEffects)
  const rastreamento = useRastreamento({
    viagemId:     viagemAtiva?.id ?? null,
    statusRef,
    fabricasAlvo,
    isOnline,
    onMudarStatus: async (etapaAuto) => {
      setRegistrando(true)
      await registrarEtapa(etapaAuto, null)
      setRegistrando(false)
    },
  })

  // Re-inicia GPS se viagem já estava em trânsito quando o app foi aberto
  useEffect(() => {
    const emTransito = ['em_transito', 'na_fabrica', 'retornando']
    if (viagemAtiva && fabricasAlvo.length > 0 && emTransito.includes(viagemAtiva.status)) {
      rastreamento.iniciar()
    }
  }, [viagemAtiva?.id, fabricasAlvo.length])

  // ── lifecycle ─────────────────────────────────────────────────────────────

  useEffect(() => {
    const on  = () => setIsOnline(true)
    const off = () => setIsOnline(false)
    window.addEventListener('online',  on)
    window.addEventListener('offline', off)
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off) }
  }, [])

  useEffect(() => {
    init()
    return () => { if (channelRef.current) supabase.removeChannel(channelRef.current) }
  }, [])

  // Polling: enquanto motorista aguarda conferência/portaria, verifica a cada 30s
  useEffect(() => {
    if (view !== 'active' || viagemAtiva?.status !== 'aguardando_conferencia') return
    const id = viagemAtiva.id
    async function check() {
      const [{ data: tarefa }, { data: portaria }] = await Promise.all([
        supabase.from('tarefas').select('status').eq('viagem_id', id).maybeSingle(),
        supabase.from('portaria_atendimentos').select('status, dt_saida').eq('viagem_id', id).maybeSingle(),
      ])
      if (tarefa?.status) setTarefaStatus(tarefa.status)
      if (portaria?.status) {
        setPortariaStatus(portaria.status)
        if (portaria.dt_saida) setPortariaSaida(portaria.dt_saida)
      }
    }
    check()
    const timer = setInterval(check, 30000)
    return () => clearInterval(timer)
  }, [view, viagemAtiva?.id, viagemAtiva?.status])

  async function init() {
    const [{ data: c }, { data: ca }, { data: u }, { data: v }, { data: m }] = await Promise.all([
      supabase.from('carretas').select('*').eq('ativo', true).eq('em_manutencao', false).order('placa'),
      supabase.from('cavalos').select('*').eq('ativo', true).eq('em_manutencao', false).order('placa'),
      supabase.from('unidades').select('*').eq('tipo', 'revenda').order('nome'),
      supabase.from('viagens')
        .select('*, unidade:unidades(*), carreta:carretas(*), cavalo:cavalos(*)')
        .eq('motorista_id', profile.id)
        .neq('status', 'concluida')
        .maybeSingle(),
      supabase.from('profiles').select('id, nome, tipo, cpf').eq('perfil', 'motorista').eq('ativo', true).order('nome'),
    ])
    setCarretas(c ?? [])
    setCavalos(ca ?? [])
    setUnidades(u ?? [])
    setMotoristas(m ?? [])

    if (v) {
      setViagemAtiva(v); cacheViagem(v)
      const { data: peds } = await supabase.from('pedidos').select('*').eq('viagem_id', v.id).neq('status', 'cancelado')
      setPedidosDaViagem(peds ?? [])

      const { data: agend } = await supabase
        .from('agendamentos')
        .select('*, revenda:unidades(id, nome, cidade)')
        .eq('viagem_id', v.id)
        .neq('status', 'cancelado')
        .maybeSingle()
      setAgendamento(agend ?? null)

      // Carrega fábricas-alvo para geofence automático
      const codigosFab = [...new Set((peds ?? []).map(p => p.codigo_fabrica).filter(Boolean))]
      if (codigosFab.length) {
        const { data: fabs } = await supabase
          .from('unidades')
          .select('id, nome, latitude, longitude, raio_geofence, codigo_ambev')
          .eq('tipo', 'fabrica')
          .in('codigo_ambev', codigosFab)
        setFabricasAlvo(fabs ?? [])
      }

      setView('active')

      // Realtime: recebe ajustes feitos pelo admin (horário e rollback de status)
      if (channelRef.current) supabase.removeChannel(channelRef.current)
      channelRef.current = supabase
        .channel(`viagem-driver-${v.id}`)
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'viagens', filter: `id=eq.${v.id}` },
          (payload) => {
            const row = payload.new
            if (!row || row.id !== v.id) return
            setViagemAtiva(prev => {
              if (!prev) return prev
              const patch = {}
              if (row.horario_agendado !== prev.horario_agendado)
                patch.horario_agendado = row.horario_agendado
              if (row.status && row.status !== prev.status)
                patch.status = row.status
              if (row.dt_chegada_fabrica !== prev.dt_chegada_fabrica)
                patch.dt_chegada_fabrica = row.dt_chegada_fabrica
              if (row.dt_saida_fabrica !== prev.dt_saida_fabrica)
                patch.dt_saida_fabrica = row.dt_saida_fabrica
              return Object.keys(patch).length ? { ...prev, ...patch } : prev
            })
          }
        )
        .subscribe()
    } else {
      const cached = getCachedViagem()
      if (cached && !navigator.onLine) { setViagemAtiva(cached); setView('active') }
      else setView('wizard')
    }
  }

  // ── wizard: buscar pedido ─────────────────────────────────────────────────

  async function buscarPedido() {
    const num = searchNum.trim()
    if (!num) return
    setSearching(true); setSearchResult(null)

    const { data: rows } = await supabase
      .from('pedidos')
      .select('*, unidade:unidades(id, nome, codigo, cidade)')
      .eq('numero_pedido', Number(num))

    setSearching(false)

    if (!rows?.length) { setSearchResult({ error: 'Pedido não encontrado na base importada.' }); return }
    if (rows.some(r => r.viagem_id)) { setSearchResult({ error: 'Este pedido já está vinculado a outra viagem.' }); return }
    if (pedidosAdicionados.some(p => p.numero_pedido === rows[0].numero_pedido)) { setSearchResult({ error: 'Este pedido já foi adicionado.' }); return }

    setSearchResult({
      ok: {
        numero_pedido: rows[0].numero_pedido,
        unidade_id:    rows[0].unidade_id,
        unidade:       rows[0].unidade,
        fabrica:       rows[0].fabrica,
        itens:         rows,
        total_pallets: rows.reduce((s, r) => s + (Number(r.qtde_pallets) || 0), 0),
        total_skus:    rows.reduce((s, r) => s + (Number(r.qtde_skus) || 0), 0),
      }
    })
  }

  function adicionarPedido() {
    if (!searchResult?.ok) return
    setPedidos(prev => [...prev, searchResult.ok])
    setSearchNum(''); setSearchResult(null)
  }

  // ── iniciar viagem ────────────────────────────────────────────────────────

  async function iniciarViagem() {
    if (!carreta || !cavalo || !pedidosAdicionados.length || !motoristaSelecionada) return
    setIniciando(true)

    const { data: viagem, error } = await supabase
      .from('viagens')
      .insert({
        motorista_id:     motoristaSelecionada.id,
        carreta_id:       carreta.id,
        cavalo_id:        cavalo.id,
        horario_agendado: horarioAgendado || null,
        numero_nf_saida:  nfSaida.trim() || null,
      })
      .select('*, unidade:unidades(*), carreta:carretas(*), cavalo:cavalos(*)')
      .single()

    if (error) { setIniciando(false); return }

    await supabase.rpc('vincular_pedidos_viagem', {
      p_viagem_id:      viagem.id,
      p_numeros_pedido: pedidosAdicionados.map(p => p.numero_pedido),
    })

    cacheViagem(viagem)
    setViagemAtiva(viagem)
    setPedidosDaViagem(pedidosAdicionados.flatMap(p => p.itens))
    resetWizard()
    setView('active')
    setIniciando(false)
  }

  // ── verificar tarefa (manual) ─────────────────────────────────────────────

  async function verificarTarefa() {
    if (!viagemAtiva?.id) return
    const [{ data: tarefa }, { data: portaria }] = await Promise.all([
      supabase.from('tarefas').select('status').eq('viagem_id', viagemAtiva.id).maybeSingle(),
      supabase.from('portaria_atendimentos').select('status, dt_saida').eq('viagem_id', viagemAtiva.id).maybeSingle(),
    ])
    if (tarefa?.status) setTarefaStatus(tarefa.status)
    if (portaria?.status) {
      setPortariaStatus(portaria.status)
      if (portaria.dt_saida) setPortariaSaida(portaria.dt_saida)
    }
  }

  // ── agendamento ───────────────────────────────────────────────────────────

  async function criarAgendamento({ revendaId, gradeId, dataAgendamento, tipoDia, bloco, revenda }) {
    const { data, error } = await supabase
      .from('agendamentos')
      .insert({
        viagem_id:        viagemAtiva.id,
        revenda_id:       revendaId,
        grade_id:         gradeId,
        data_agendamento: dataAgendamento,
        tipo_dia:         tipoDia,
        bloco,
        motorista_id:     profile.id,
        status:           'pendente',
      })
      .select('*, revenda:unidades(id, nome, cidade)')
      .single()
    if (error) { alert('Erro ao agendar: ' + error.message); return }
    setAgendamento({ ...data, revenda })
    setShowModalAgendamento(false)
  }

  async function cancelarAgendamento() {
    if (!agendamento) return
    await supabase.from('agendamentos').update({ status: 'cancelado' }).eq('id', agendamento.id)
    setAgendamento(null)
  }

  // ── registrar etapa ───────────────────────────────────────────────────────

  async function registrarEtapa(etapa, nf) {
    const now     = etapa.closeCycle && portariaSaida ? portariaSaida : new Date().toISOString()
    const updates = { [etapa.field]: now, status: etapa.nextStatus }
    if (nf) updates.numero_nf = nf
    const updated = { ...viagemAtiva, ...updates }

    const tryDB = async () => {
      const { error } = await supabase.from('viagens').update(updates).eq('id', viagemAtiva.id)
      return !error
    }

    if (isOnline && await tryDB()) {
      setViagemAtiva(updated); cacheViagem(updated)
    } else {
      saveOfflineAction({ type: 'UPDATE_VIAGEM', viagem_id: viagemAtiva.id, updates })
      setViagemAtiva(updated); cacheViagem(updated); setPendingSync(true)
    }

    // ── Controle de GPS: inicia na saída, para na chegada final ───────────────
    if (etapa.nextStatus === 'em_transito') {
      rastreamento.iniciar()
    } else if (etapa.nextStatus === 'aguardando_conferencia' || etapa.closeCycle) {
      rastreamento.parar()
    }

    if (etapa.requireNF) {
      // A tarefa para o Conferente agora é criada pela Portaria ao registrar entrada
      const unidadeId  = agendamento?.revenda_id ?? viagemAtiva.unidade_descarga_id
      const portariaAtend = {
        viagem_id:       viagemAtiva.id,
        unidade_id:      unidadeId,
        numero_nf:       nf,
        numero_nf_saida: viagemAtiva.numero_nf_saida ?? null,
        placa_cavalo:    viagemAtiva.cavalo?.placa  ?? null,
        placa_carreta:   viagemAtiva.carreta?.placa ?? null,
        agendamento_id:  agendamento?.id ?? null,
      }
      if (isOnline) {
        await supabase.from('portaria_atendimentos').insert(portariaAtend)
        if (agendamento?.id) {
          await supabase.from('agendamentos').update({ status: 'realizado' }).eq('id', agendamento.id)
        }
      } else {
        saveOfflineAction({ type: 'INSERT_PORTARIA', portariaAtend })
      }
    }

    if (etapa.closeCycle) {
      // Busca resumo antes de limpar o estado
      const { data: stats } = await supabase.rpc('get_resumo_viagem', { p_viagem_id: viagemAtiva.id })
      setResumoData({
        viagem: updated,
        stats: stats?.[0] ?? { paletes_esperados: 0, paletes_recebidos: 0, total_anomalias: 0 },
      })
      cacheViagem(null)
      setViagemAtiva(null); setPedidosDaViagem([])
      setTarefaStatus(null)
      setView('resumo')
    }
  }

  function resetWizard() {
    setStep(1); setCarreta(null); setCavalo(null)
    setPedidos([]); setHorario(''); setNfSaida('')
    setMotoristaSelecionada(null)
    setSearchNum(''); setSearchResult(null)
  }

  async function definirUnidadeDescarga(unidade) {
    if (!viagemAtiva?.id) return
    await supabase.from('viagens').update({ unidade_descarga_id: unidade.id }).eq('id', viagemAtiva.id)
    setViagemAtiva(v => ({ ...v, unidade_descarga_id: unidade.id, unidade }))
  }

  function iniciarNovaViagem() {
    setResumoData(null)
    resetWizard()
    setView('wizard')
  }

  // ── sync offline ──────────────────────────────────────────────────────────

  async function syncOffline() {
    setSyncing(true)
    try {
      for (const action of getOfflineQueue()) {
        if (action.type === 'UPDATE_VIAGEM')
          await supabase.from('viagens').update(action.updates).eq('id', action.viagem_id)
        else if (action.type === 'INSERT_TAREFA')
          await supabase.from('tarefas').insert(action.tarefa)
        else if (action.type === 'INSERT_PORTARIA')
          await supabase.from('portaria_atendimentos').insert(action.portariaAtend)
      }
      clearOfflineQueue(); setPendingSync(false)
    } finally { setSyncing(false) }
  }

  // ── render ────────────────────────────────────────────────────────────────

  // ── Tela de instalação do APK (motorista no navegador sem app nativo) ────────
  if (!IS_NATIVE_APP && !aceitouNavegador) {
    return <InstalarApp onContinuar={() => setAceitouNavegador(true)} />
  }

  if (view === 'loading') return (
    <div className="min-h-screen bg-[#EBF5FF] flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-cobeb-blue border-t-transparent rounded-full animate-spin" />
    </div>
  )

  if (view === 'resumo' && resumoData) {
    return <ResumoViagem resumoData={resumoData} profile={profile} onNovaViagem={iniciarNovaViagem} signOut={signOut} />
  }

  const headerTitle = view === 'active'
    ? viagemAtiva?.status === 'aguardando_conferencia'
      ? 'Aguardando Conferência'
      : 'Viagem em Andamento'
    : 'Nova Viagem'

  return (
    <div className="min-h-screen bg-[#EBF5FF] flex flex-col">
      <header className="bg-cobeb-navy border-b border-blue-800 px-5 py-3.5 flex items-center justify-between shrink-0 shadow-md shadow-cobeb-navy/20">
        <div className="flex items-center gap-3">
          <img
            src={`${import.meta.env.BASE_URL}logos/logo-cobeb-transparent.png`}
            alt="COBEB"
            className="h-14 w-auto object-contain" style={{ filter: 'brightness(0) invert(1)', opacity: 0.92 }}
            onError={(e) => { e.target.style.display = 'none' }}
          />
          <div>
            <p className="text-white text-sm font-semibold leading-tight">{headerTitle}</p>
            <p className="text-blue-300/60 text-[10px] font-medium">{profile?.nome}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {!isOnline && <WifiOff size={16} className="text-yellow-300" />}
          {profile?.perfil === 'admin' && (
            <button onClick={() => { setModoVisao(null); navigate('/selecionar-modulo') }}
              className="text-cobeb-yellow hover:text-white transition-colors p-1.5 rounded-lg hover:bg-white/10"
              title="Trocar Módulo">
              <LayoutGrid size={16} />
            </button>
          )}
          <button onClick={async () => { await signOut() }} className="text-blue-300/70 hover:text-white transition-colors p-1.5 rounded-lg hover:bg-white/10">
            <LogOut size={18} />
          </button>
        </div>
      </header>

      {!isOnline && (
        <div className="bg-yellow-500/10 border-b border-yellow-500/20 px-4 py-2 flex items-center gap-2">
          <WifiOff size={13} className="text-yellow-400 shrink-0" />
          <p className="text-yellow-400 text-xs">Sem conexão — ações salvas localmente</p>
        </div>
      )}
      {pendingSync && isOnline && (
        <div className="bg-blue-500/10 border-b border-blue-500/20 px-4 py-2 flex items-center justify-between">
          <p className="text-blue-400 text-xs">Ações pendentes de sincronização</p>
          <button onClick={syncOffline} disabled={syncing} className="flex items-center gap-1.5 text-blue-400 text-xs font-semibold disabled:opacity-50">
            <RefreshCw size={12} className={syncing ? 'animate-spin' : ''} />
            {syncing ? 'Sincronizando...' : 'Sincronizar'}
          </button>
        </div>
      )}

      <main className="flex-1 overflow-y-auto pb-10">
        {view === 'wizard'
          ? <Wizard
              step={step} setStep={setStep}
              carretas={carretas} cavalos={cavalos}
              carreta={carreta} setCarreta={setCarreta}
              cavalo={cavalo} setCavalo={setCavalo}
              pedidosAdicionados={pedidosAdicionados}
              horarioAgendado={horarioAgendado} setHorario={setHorario}
              motoristas={motoristas}
              motoristaSelecionada={motoristaSelecionada} setMotoristaSelecionada={setMotoristaSelecionada}
              searchNum={searchNum} setSearchNum={setSearchNum}
              searching={searching} searchResult={searchResult}
              buscarPedido={buscarPedido} adicionarPedido={adicionarPedido}
              removerPedido={n => setPedidos(prev => prev.filter(p => p.numero_pedido !== n))}
              nfSaida={nfSaida} setNfSaida={setNfSaida}
              iniciando={iniciando} iniciarViagem={iniciarViagem}
            />
          : <ViagemAtiva
              viagem={viagemAtiva}
              pedidos={pedidosDaViagem}
              tarefaStatus={tarefaStatus}
              portariaStatus={portariaStatus}
              onVerificarTarefa={verificarTarefa}
              showNF={showNF} setShowNF={setShowNF}
              numeroNF={numeroNF} setNumeroNF={setNumeroNF}
              registrando={registrando} setRegistrando={setRegistrando}
              registrarEtapa={registrarEtapa}
              agendamento={agendamento}
              unidades={unidades}
              onAbrirAgendamento={() => setShowModalAgendamento(true)}
              onCancelarAgendamento={cancelarAgendamento}
              showModalAgendamento={showModalAgendamento}
              onFecharModalAgendamento={() => setShowModalAgendamento(false)}
              onCriarAgendamento={criarAgendamento}
              onDefinirUnidade={definirUnidadeDescarga}
            />
        }
      </main>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Wizard
// ─────────────────────────────────────────────────────────────────────────────

function Wizard({ step, setStep, carretas, cavalos, carreta, setCarreta, cavalo, setCavalo,
  pedidosAdicionados, horarioAgendado, setHorario, motoristas, motoristaSelecionada, setMotoristaSelecionada,
  searchNum, setSearchNum, searching, searchResult,
  buscarPedido, adicionarPedido, removerPedido, nfSaida, setNfSaida, iniciando, iniciarViagem }) {

  const labels = ['Carreta', 'Cavalo', 'Pedidos', 'Motorista', 'NF Saída', 'Confirmar']
  const canNext = [!!carreta, !!cavalo, pedidosAdicionados.length > 0, !!motoristaSelecionada, true, false]

  return (
    <div className="max-w-lg mx-auto px-4 pt-5">
      {/* Step indicator */}
      <div className="flex items-center justify-center mb-6">
        {labels.map((label, i) => {
          const n = i + 1; const done = n < step; const active = n === step
          return (
            <div key={n} className="flex items-center">
              <div className="flex flex-col items-center gap-1">
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold transition-colors ${
                  done ? 'bg-cobeb-navy text-white' : active ? 'bg-cobeb-navy/10 text-cobeb-yellow ring-2 ring-cobeb-yellow' : 'bg-white text-slate-500'
                }`}>
                  {done ? <CheckCircle size={13} /> : n}
                </div>
                <span className={`text-[9px] font-medium ${active ? 'text-cobeb-yellow' : done ? 'text-slate-400' : 'text-slate-500'}`}>{label}</span>
              </div>
              {i < 5 && <div className={`w-4 h-px mb-5 mx-0.5 ${n < step ? 'bg-cobeb-navy' : 'bg-cobeb-border'}`} />}
            </div>
          )
        })}
      </div>

      {step === 1 && <StepSelecionar titulo="Selecionar Carreta" itens={carretas} selecionado={carreta} onSelecionar={setCarreta}
        onProximo={() => setStep(2)} podeProximo={canNext[0]} />}
      {step === 2 && <StepSelecionar titulo="Selecionar Cavalo" itens={cavalos} selecionado={cavalo} onSelecionar={setCavalo}
        onVoltar={() => setStep(1)} onProximo={() => setStep(3)} podeProximo={canNext[1]} />}
      {step === 3 && <StepPedidos
        pedidosAdicionados={pedidosAdicionados}
        horarioAgendado={horarioAgendado} setHorario={setHorario}
        searchNum={searchNum} setSearchNum={setSearchNum} searching={searching} searchResult={searchResult}
        buscarPedido={buscarPedido} adicionarPedido={adicionarPedido} removerPedido={removerPedido}
        onVoltar={() => setStep(2)} onProximo={() => setStep(4)} podeProximo={canNext[2]} />}
      {step === 4 && <StepMotorista
        motoristas={motoristas} motoristaSelecionada={motoristaSelecionada} setMotoristaSelecionada={setMotoristaSelecionada}
        onVoltar={() => setStep(3)} onProximo={() => setStep(5)} podeProximo={canNext[3]} />}
      {step === 5 && <StepNFSaida
        nfSaida={nfSaida} setNfSaida={setNfSaida}
        onVoltar={() => setStep(4)} onProximo={() => setStep(6)} />}
      {step === 6 && <StepConfirmar
        carreta={carreta} cavalo={cavalo} pedidosAdicionados={pedidosAdicionados}
        horarioAgendado={horarioAgendado} nfSaida={nfSaida}
        motoristaSelecionada={motoristaSelecionada}
        onVoltar={() => setStep(5)} onConfirmar={iniciarViagem} iniciando={iniciando} />}
    </div>
  )
}

function StepSelecionar({ titulo, itens, selecionado, onSelecionar, onVoltar, onProximo, podeProximo }) {
  const [busca, setBusca] = useState('')
  const filtrados = itens.filter(i => i.placa?.toLowerCase().includes(busca.toLowerCase()))

  return (
    <div className="space-y-4">
      <h2 className="text-cobeb-text font-semibold text-base">{titulo}</h2>
      <div className="relative">
        <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
        <input
          value={busca}
          onChange={e => setBusca(e.target.value)}
          placeholder="Buscar por placa..."
          className="w-full bg-white border border-cobeb-border rounded-xl pl-9 pr-4 py-2.5 text-cobeb-text text-sm placeholder-slate-400 focus:outline-none focus:border-cobeb-blue"
        />
      </div>
      <div className="space-y-2">
        {filtrados.map(item => {
          const selected = selecionado?.id === item.id
          return (
            <button key={item.id} onClick={() => onSelecionar(item)}
              className={`w-full flex items-center justify-between px-4 py-4 rounded-2xl border transition-all ${
                selected ? 'bg-cobeb-navy/10 border-cobeb-blue' : 'bg-white border-cobeb-border hover:border-cobeb-blue/40'
              }`}>
              <div className="flex items-center gap-3">
                <Truck size={18} className={selected ? 'text-cobeb-yellow' : 'text-slate-500'} />
                <div className="text-left">
                  <p className={`font-mono font-semibold text-sm ${selected ? 'text-cobeb-navy' : 'text-cobeb-text'}`}>{item.placa}</p>
                  <p className="text-slate-500 text-xs mt-0.5">{item.tipo}</p>
                </div>
              </div>
              {selected && <CheckCircle size={18} className="text-cobeb-yellow" />}
            </button>
          )
        })}
        {!filtrados.length && (
          <p className="text-slate-500 text-sm text-center py-8">
            {busca ? `Nenhum resultado para "${busca}"` : 'Nenhum cadastrado no sistema'}
          </p>
        )}
      </div>
      <BotoesPasso onVoltar={onVoltar} onProximo={onProximo} podeProximo={podeProximo} />
    </div>
  )
}

function StepPedidos({ pedidosAdicionados, horarioAgendado, setHorario,
  searchNum, setSearchNum, searching, searchResult,
  buscarPedido, adicionarPedido, removerPedido, onVoltar, onProximo, podeProximo }) {

  const totalPallets = pedidosAdicionados.reduce((s, p) => s + p.total_pallets, 0)
  const totalSkus    = pedidosAdicionados.reduce((s, p) => s + p.total_skus,    0)

  return (
    <div className="space-y-4">
      <h2 className="text-cobeb-text font-semibold text-base">Pedidos</h2>

      {/* Search */}
      <div className="bg-white rounded-2xl border border-cobeb-border overflow-hidden">
        <div className="flex gap-2 p-3">
          <input value={searchNum} onChange={e => setSearchNum(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && buscarPedido()}
            placeholder="Número do pedido..." inputMode="numeric"
            className="flex-1 bg-[#EBF5FF] border border-cobeb-border rounded-xl px-4 py-2.5 text-cobeb-text text-sm placeholder-slate-400 focus:outline-none focus:border-cobeb-blue" />
          <button onClick={buscarPedido} disabled={searching || !searchNum.trim()}
            className="bg-cobeb-navy hover:bg-cobeb-blue disabled:opacity-50 text-white px-4 rounded-xl font-semibold text-sm transition-colors flex items-center gap-2">
            {searching
              ? <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
              : <Search size={16} />}
            Buscar
          </button>
        </div>

        {searchResult?.error && (
          <div className="flex items-center gap-2 text-red-400 text-xs bg-red-500/10 mx-3 mb-3 rounded-xl px-4 py-3">
            <AlertCircle size={13} className="shrink-0" />{searchResult.error}
          </div>
        )}
        {searchResult?.ok && (
          <div className="mx-3 mb-3 bg-[#EBF5FF] rounded-xl p-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-cobeb-yellow font-mono text-sm font-semibold">#{searchResult.ok.numero_pedido}</p>
                <p className="text-slate-400 text-xs mt-0.5">{searchResult.ok.unidade?.codigo} · {searchResult.ok.fabrica}</p>
                <p className="text-slate-500 text-xs">{searchResult.ok.itens.length} produtos · {searchResult.ok.total_pallets.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} pallets</p>
              </div>
              <button onClick={adicionarPedido}
                className="bg-cobeb-navy hover:bg-cobeb-blue text-white text-xs font-semibold px-3 py-1.5 rounded-xl flex items-center gap-1 transition-colors shrink-0">
                <Plus size={13} />Adicionar
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Added pedidos */}
      {pedidosAdicionados.length > 0 && (
        <div className="space-y-2">
          {pedidosAdicionados.map(p => (
            <div key={p.numero_pedido} className="bg-white rounded-2xl border border-cobeb-border px-4 py-3 flex items-center justify-between gap-3">
              <div>
                <p className="text-cobeb-yellow font-mono text-sm font-semibold">#{p.numero_pedido}</p>
                <p className="text-slate-500 text-xs mt-0.5">{p.unidade?.codigo ?? '—'} · {p.fabrica ?? '—'}</p>
                <p className="text-slate-500 text-xs">{p.total_pallets.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} pal · {p.total_skus.toLocaleString('pt-BR')} cx</p>
              </div>
              <button onClick={() => removerPedido(p.numero_pedido)} className="text-slate-500 hover:text-red-400 transition-colors">
                <Trash2 size={16} />
              </button>
            </div>
          ))}
          <p className="text-right text-xs text-slate-500">
            Total: <span className="text-cobeb-text font-semibold">{totalPallets.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}</span> pallets · <span className="text-cobeb-text font-semibold">{totalSkus.toLocaleString('pt-BR')}</span> caixas
          </p>
        </div>
      )}

      {/* Horário de carregamento */}
      <div>
        <label className="block text-slate-500 text-[11px] font-semibold uppercase tracking-widest mb-1.5">
          Horário de Carregamento
        </label>
        <input type="time" value={horarioAgendado} onChange={e => setHorario(e.target.value)}
          className="w-full bg-white border border-cobeb-border rounded-xl px-4 py-3 text-cobeb-text text-sm focus:outline-none focus:border-cobeb-blue [color-scheme:light]" />
      </div>

      <BotoesPasso onVoltar={onVoltar} onProximo={onProximo} podeProximo={podeProximo} />
    </div>
  )
}

function StepNFSaida({ nfSaida, setNfSaida, onVoltar, onProximo }) {
  const [modo, setModo] = useState(nfSaida ? 'com_nf' : null)

  function selecionarModo(m) {
    setModo(m)
    if (m === 'sem_nf') setNfSaida('')
  }

  const podeProximo = modo === 'sem_nf' || (modo === 'com_nf' && nfSaida.trim() !== '')

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-cobeb-text font-semibold text-base">NF de Retorno de Ativos</h2>
        <p className="text-slate-500 text-sm mt-1">
          O motorista está saindo com nota fiscal de retorno de ativos de giro?
        </p>
      </div>

      <div className="space-y-2">
        {[
          { key: 'com_nf',  titulo: 'Com NF de Retorno',  desc: 'Motorista sai com NF de ativos de giro (paletes, vasilhame)' },
          { key: 'sem_nf',  titulo: 'Somente Pedido',     desc: 'Motorista sai sem NF — apenas com o pedido vinculado' },
        ].map(({ key, titulo, desc }) => {
          const sel = modo === key
          return (
            <button key={key} onClick={() => selecionarModo(key)}
              className={`w-full flex items-center justify-between px-4 py-4 rounded-2xl border transition-all text-left ${
                sel ? 'bg-cobeb-navy/10 border-cobeb-blue' : 'bg-white border-cobeb-border hover:border-cobeb-blue/40'
              }`}>
              <div>
                <p className={`font-semibold text-sm ${sel ? 'text-cobeb-navy' : 'text-cobeb-text'}`}>{titulo}</p>
                <p className="text-slate-500 text-xs mt-0.5">{desc}</p>
              </div>
              {sel && <CheckCircle size={18} className="text-cobeb-yellow shrink-0" />}
            </button>
          )
        })}
      </div>

      {modo === 'com_nf' && (
        <div>
          <label className="block text-slate-500 text-[11px] font-semibold uppercase tracking-widest mb-1.5">
            Número da NF Saída <span className="text-cobeb-yellow">*</span>
          </label>
          <input
            value={nfSaida}
            onChange={e => setNfSaida(e.target.value)}
            placeholder="Ex: 654321"
            inputMode="numeric"
            className="w-full bg-white border border-cobeb-border rounded-xl px-4 py-3 text-cobeb-text text-sm placeholder-slate-400 focus:outline-none focus:border-cobeb-blue"
          />
        </div>
      )}

      <BotoesPasso onVoltar={onVoltar} onProximo={onProximo} podeProximo={podeProximo} />
    </div>
  )
}

function StepMotorista({ motoristas, motoristaSelecionada, setMotoristaSelecionada, onVoltar, onProximo, podeProximo }) {
  const [busca, setBusca] = useState('')
  const filtrados = motoristas.filter(m => m.nome?.toLowerCase().includes(busca.toLowerCase()))

  return (
    <div className="space-y-4">
      <h2 className="text-cobeb-text font-semibold text-base">Selecionar Motorista</h2>
      <div className="relative">
        <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
        <input
          value={busca}
          onChange={e => setBusca(e.target.value)}
          placeholder="Buscar por nome..."
          className="w-full bg-white border border-cobeb-border rounded-xl pl-9 pr-4 py-2.5 text-cobeb-text text-sm placeholder-slate-400 focus:outline-none focus:border-cobeb-blue"
        />
      </div>
      <div className="space-y-2">
        {filtrados.map(m => {
          const selected = motoristaSelecionada?.id === m.id
          return (
            <button key={m.id} onClick={() => setMotoristaSelecionada(m)}
              className={`w-full flex items-center justify-between px-4 py-4 rounded-2xl border transition-all ${
                selected ? 'bg-cobeb-navy/10 border-cobeb-blue' : 'bg-white border-cobeb-border hover:border-cobeb-blue/40'
              }`}>
              <div className="flex items-center gap-3">
                <User size={18} className={selected ? 'text-cobeb-yellow' : 'text-slate-500'} />
                <div className="text-left">
                  <p className={`font-semibold text-sm ${selected ? 'text-cobeb-navy' : 'text-cobeb-text'}`}>{m.nome}</p>
                  <p className="text-slate-500 text-xs mt-0.5">{m.tipo === 'FF' ? 'Frota Fixa' : 'Freteiro (SPOT)'}</p>
                </div>
              </div>
              {selected && <CheckCircle size={18} className="text-cobeb-yellow" />}
            </button>
          )
        })}
        {!filtrados.length && (
          <p className="text-slate-500 text-sm text-center py-8">
            {busca ? `Nenhum resultado para "${busca}"` : 'Nenhum motorista cadastrado no sistema'}
          </p>
        )}
      </div>
      <BotoesPasso onVoltar={onVoltar} onProximo={onProximo} podeProximo={podeProximo} />
    </div>
  )
}

function StepConfirmar({ carreta, cavalo, pedidosAdicionados, horarioAgendado, nfSaida, motoristaSelecionada, onVoltar, onConfirmar, iniciando }) {
  const totalPallets = pedidosAdicionados.reduce((s, p) => s + p.total_pallets, 0)
  const totalSkus    = pedidosAdicionados.reduce((s, p) => s + p.total_skus,    0)
  const allItens     = pedidosAdicionados.flatMap(p => p.itens)

  return (
    <div className="space-y-4">
      <h2 className="text-cobeb-text font-semibold text-base">Confirmar Viagem</h2>

      <div className="bg-white rounded-2xl border border-cobeb-border divide-y divide-cobeb-border">
        <SRow label="Motorista" value={`${motoristaSelecionada?.nome} · ${motoristaSelecionada?.tipo === 'FF' ? 'Frota Fixa' : 'Freteiro'}`} />
        <SRow label="Carreta"   value={`${carreta?.placa} · ${carreta?.tipo}`} />
        <SRow label="Cavalo"    value={`${cavalo?.placa} · ${cavalo?.tipo}`} />
        <SRow label="Pedidos"   value={pedidosAdicionados.map(p => `#${p.numero_pedido}`).join(' · ')} />
        <SRow label="Total"     value={`${totalPallets.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} pallets · ${totalSkus.toLocaleString('pt-BR')} caixas`} />
        {horarioAgendado && <SRow label="Hor. Carregamento" value={horarioAgendado} />}
        {nfSaida && <SRow label="NF Saída (Ativos)" value={nfSaida} />}
      </div>

      <div className="bg-white rounded-2xl border border-cobeb-border overflow-hidden">
        <div className="px-4 py-3 border-b border-cobeb-border">
          <p className="text-slate-500 text-xs font-semibold uppercase tracking-widest">{allItens.length} produtos</p>
        </div>
        {allItens.slice(0, 5).map(item => (
          <div key={item.id} className="flex items-center justify-between px-4 py-2.5 border-b border-cobeb-border last:border-0">
            <p className="text-cobeb-text text-xs truncate flex-1 mr-4">{item.descricao}</p>
            <p className="text-xs text-slate-500 shrink-0">{Number(item.qtde_pallets).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} pal</p>
          </div>
        ))}
        {allItens.length > 5 && <p className="text-slate-500 text-xs text-center py-2">+ {allItens.length - 5} produtos</p>}
      </div>

      <div className="flex gap-3">
        <button onClick={onVoltar} className="flex-1 bg-white border border-cobeb-border text-slate-400 font-semibold py-4 rounded-2xl text-sm flex items-center justify-center gap-2">
          <ChevronLeft size={16} />Voltar
        </button>
        <button onClick={onConfirmar} disabled={iniciando}
          className="flex-1 bg-cobeb-navy hover:bg-cobeb-blue disabled:opacity-50 text-white font-semibold py-4 rounded-2xl text-sm flex items-center justify-center gap-2 transition-colors">
          {iniciando
            ? <><div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />Iniciando...</>
            : <>Iniciar Viagem<ChevronRight size={16} /></>}
        </button>
      </div>
    </div>
  )
}

function SRow({ label, value, highlight }) {
  return (
    <div className="flex justify-between items-center gap-4 px-4 py-3">
      <span className="text-slate-500 text-xs shrink-0">{label}</span>
      <span className={`text-xs font-medium text-right ${highlight ? 'text-cobeb-yellow' : 'text-cobeb-text'}`}>{value}</span>
    </div>
  )
}

function BotoesPasso({ onVoltar, onProximo, podeProximo }) {
  return (
    <div className="flex gap-3 pt-2">
      {onVoltar && (
        <button onClick={onVoltar} className="flex-1 bg-white border border-cobeb-border text-slate-400 font-semibold py-4 rounded-2xl text-sm flex items-center justify-center gap-2">
          <ChevronLeft size={16} />Voltar
        </button>
      )}
      <button onClick={onProximo} disabled={!podeProximo}
        className="flex-1 bg-cobeb-navy hover:bg-cobeb-blue disabled:opacity-40 disabled:pointer-events-none text-white font-semibold py-4 rounded-2xl text-sm flex items-center justify-center gap-2 transition-colors">
        Próximo<ChevronRight size={16} />
      </button>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Viagem Ativa
// ─────────────────────────────────────────────────────────────────────────────

const STATUS_GPS = ['em_transito', 'na_fabrica', 'retornando']
const STATUS_GPS_LABEL = {
  em_transito: 'Rastreando — a caminho da fábrica',
  na_fabrica:  'Rastreando — na fábrica',
  retornando:  'Rastreando — retornando à revenda',
}

function ViagemAtiva({ viagem, pedidos, tarefaStatus, portariaStatus, onVerificarTarefa, showNF, setShowNF, numeroNF, setNumeroNF, registrando, setRegistrando, registrarEtapa, agendamento, unidades, onAbrirAgendamento, onCancelarAgendamento, showModalAgendamento, onFecharModalAgendamento, onCriarAgendamento, onDefinirUnidade }) {
  const numerosUnicos = [...new Set(pedidos.map(p => p.numero_pedido))]
  const totalPallets  = pedidos.reduce((s, p) => s + (Number(p.qtde_pallets) || 0), 0)
  const totalSkus     = pedidos.reduce((s, p) => s + (Number(p.qtde_skus)    || 0), 0)
  const etapaAtualIdx = ETAPAS.findIndex(e => !viagem?.[e.field])

  const [showModalUnidade, setShowModalUnidade] = useState(false)

  // Bloqueio chegada_revenda sem agendamento — só aplica quando etapa ainda não está concluída
  const saidaRevenda   = !!viagem?.dt_saida_revenda
  const chegadaRevenda = !!viagem?.dt_chegada_revenda
  const precisaAgendar = saidaRevenda && !chegadaRevenda && !agendamento

  async function handleEtapa(etapa) {
    if (etapa.key === 'saida_revenda') { setShowModalUnidade(true); return }
    if (etapa.requireNF) { setShowNF(true); return }
    setRegistrando(true)
    await registrarEtapa(etapa, null)
    setRegistrando(false)
  }

  async function confirmarUnidadeESair(unidade) {
    setShowModalUnidade(false)
    setRegistrando(true)
    await registrarEtapa(ETAPAS[0], null)
    // Aplica unidade ao estado APÓS registrarEtapa para não ser sobrescrita
    await onDefinirUnidade(unidade)
    setRegistrando(false)
  }

  async function confirmarNF() {
    if (!numeroNF.trim()) return
    setShowNF(false); setRegistrando(true)
    await registrarEtapa(ETAPAS.find(e => e.key === 'chegada_revenda'), numeroNF.trim())
    setRegistrando(false); setNumeroNF('')
  }

  return (
    <div className="max-w-lg mx-auto px-4 pt-5 space-y-4">
      {/* Trip header */}
      <div className="bg-white rounded-2xl border border-cobeb-blue/30 p-4 space-y-3">
        <div className="flex items-center gap-2">
          <MapPin size={14} className="text-cobeb-yellow shrink-0" />
          <p className="text-cobeb-yellow font-semibold text-sm">{viagem?.unidade?.nome}</p>
          <span className="text-slate-500 text-xs">— {viagem?.unidade?.cidade}</span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-[#EBF5FF] rounded-xl px-3 py-2">
            <p className="text-slate-500 text-[10px] uppercase tracking-widest">Carreta</p>
            <p className="text-cobeb-text font-mono font-semibold text-sm mt-0.5">{viagem?.carreta?.placa}</p>
            <p className="text-slate-500 text-[10px]">{viagem?.carreta?.tipo}</p>
          </div>
          <div className="bg-[#EBF5FF] rounded-xl px-3 py-2">
            <p className="text-slate-500 text-[10px] uppercase tracking-widest">Cavalo</p>
            <p className="text-cobeb-text font-mono font-semibold text-sm mt-0.5">{viagem?.cavalo?.placa}</p>
            <p className="text-slate-500 text-[10px]">{viagem?.cavalo?.tipo}</p>
          </div>
        </div>
        <div className="bg-[#EBF5FF] rounded-xl px-3 py-2">
          <p className="text-slate-500 text-[10px] uppercase tracking-widest mb-1">Pedidos</p>
          <div className="flex flex-wrap gap-2">
            {numerosUnicos.map(n => <span key={n} className="text-cobeb-yellow font-mono text-xs font-semibold">#{n}</span>)}
          </div>
          <p className="text-slate-500 text-[10px] mt-1">
            {totalPallets.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} pallets · {totalSkus.toLocaleString('pt-BR')} caixas
            {viagem?.horario_agendado && <> · Hor: {viagem.horario_agendado}</>}
          </p>
          {viagem?.numero_nf_saida && (
            <p className="text-[10px] mt-1">
              <span className="text-slate-400">NF Saída: </span>
              <span className="text-cobeb-yellow font-semibold font-mono">{viagem.numero_nf_saida}</span>
            </p>
          )}
        </div>
      </div>


      {/* Banner GPS ativo */}
      {STATUS_GPS.includes(viagem?.status) && (
        <div className="flex items-center gap-2.5 bg-cobeb-navy/10 border border-cobeb-blue/30 rounded-2xl px-4 py-3">
          <Navigation size={13} className="text-cobeb-navy shrink-0 animate-pulse" />
          <p className="text-cobeb-navy text-xs font-semibold">
            {STATUS_GPS_LABEL[viagem.status]}
          </p>
        </div>
      )}

      {/* Card de agendamento — visível após saída da revenda e antes da chegada */}
      {saidaRevenda && !chegadaRevenda && (
        <div className={`rounded-2xl border-2 p-4 space-y-3 ${agendamento ? 'bg-cobeb-navy/10 border-cobeb-blue' : 'bg-amber-50 border-amber-300'}`}>
          <div className="flex items-center gap-2">
            {agendamento
              ? <CalendarCheck size={16} className="text-cobeb-yellow shrink-0" />
              : <Calendar size={16} className="text-amber-500 shrink-0" />}
            <p className={`font-semibold text-sm ${agendamento ? 'text-cobeb-yellow' : 'text-amber-700'}`}>
              {agendamento ? 'Horário Agendado' : 'Agendar Horário na Revenda'}
            </p>
          </div>

          {agendamento ? (
            <div className="space-y-2">
              <div className="bg-white/60 rounded-xl px-3 py-2 space-y-1">
                <p className="text-cobeb-navy text-xs font-semibold">{agendamento.revenda?.nome}</p>
                <p className="text-slate-500 text-xs">{agendamento.revenda?.cidade}</p>
                <p className="text-cobeb-navy text-xs font-mono font-bold">{agendamento.bloco} · {agendamento.tipo_dia}</p>
                <p className="text-slate-500 text-xs">
                  {new Date(agendamento.data_agendamento + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit' })}
                </p>
              </div>
              <button onClick={onCancelarAgendamento}
                className="w-full flex items-center justify-center gap-2 text-xs text-slate-400 hover:text-red-400 transition-colors py-1">
                <X size={12} />Cancelar e reagendar
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-amber-700 text-xs">A chegada na revenda só poderá ser registrada após agendar um horário.</p>
              <button onClick={onAbrirAgendamento}
                className="w-full bg-cobeb-navy hover:bg-cobeb-blue text-white font-semibold py-3 rounded-xl text-sm transition-colors flex items-center justify-center gap-2">
                <Calendar size={15} />Agendar Horário
              </button>
            </div>
          )}
        </div>
      )}

      {/* Stages */}
      <div className="space-y-2">
        {ETAPAS.map((etapa, i) => {
          const done    = !!viagem?.[etapa.field]
          const current = !done && i === etapaAtualIdx

          if (done) return (
            <div key={etapa.key} className="bg-white rounded-2xl border border-cobeb-border px-4 py-3 flex items-center gap-3">
              <CheckCircle size={18} className="text-green-400 shrink-0" />
              <div>
                <p className="text-cobeb-text text-sm font-medium">{etapa.label}</p>
                <p className="text-slate-500 text-xs mt-0.5">{formatTs(viagem[etapa.field])}</p>
              </div>
            </div>
          )

          if (current) return (
            <div key={etapa.key} className="bg-cobeb-navy/10 rounded-2xl border-2 border-cobeb-blue p-4">
              <div className="flex items-center gap-2 mb-4">
                <etapa.Icon size={16} className="text-cobeb-yellow" />
                <p className="text-cobeb-yellow font-semibold text-sm uppercase tracking-wide">{etapa.label}</p>
              </div>

              {/* Status da portaria — visível apenas na última etapa */}
              {etapa.closeCycle && (
                <div className={`flex items-center gap-2 rounded-xl px-3 py-2 mb-4 ${
                  portariaStatus === 'concluido'
                    ? 'bg-green-500/10 border border-green-500/30'
                    : 'bg-blue-500/10 border border-blue-500/30'
                }`}>
                  {portariaStatus === 'concluido'
                    ? <CheckCircle size={13} className="text-green-400 shrink-0" />
                    : <Clock size={13} className="text-blue-400 shrink-0" />}
                  <p className={`text-xs flex-1 ${portariaStatus === 'concluido' ? 'text-green-400' : 'text-blue-400'}`}>
                    {portariaStatus === 'concluido'
                      ? 'Portaria liberada'
                      : portariaStatus === 'em_atendimento'
                        ? 'Veículo em atendimento na portaria'
                        : 'Aguardando portaria'}
                  </p>
                  {portariaStatus !== 'concluido' && (
                    <button onClick={onVerificarTarefa}
                      className="text-cobeb-yellow text-xs font-semibold flex items-center gap-1 hover:text-cobeb-blue transition-colors shrink-0">
                      <RefreshCw size={11} />Verificar
                    </button>
                  )}
                </div>
              )}

              <button
                onClick={() => handleEtapa(etapa)}
                disabled={registrando || (etapa.closeCycle && portariaStatus !== 'concluido') || (etapa.key === 'chegada_revenda' && precisaAgendar)}
                className="w-full bg-cobeb-navy hover:bg-cobeb-blue disabled:opacity-50 text-white font-bold py-5 rounded-xl text-base transition-colors flex items-center justify-center gap-3">
                {registrando
                  ? <><div className="w-5 h-5 border-2 border-white/40 border-t-white rounded-full animate-spin" />Registrando...</>
                  : <><CheckCircle size={20} />{etapa.label}</>}
              </button>
            </div>
          )

          return (
            <div key={etapa.key} className="bg-white rounded-2xl border border-cobeb-border px-4 py-3 flex items-center gap-3 opacity-40">
              <div className="w-5 h-5 rounded-full border-2 border-slate-600 shrink-0" />
              <p className="text-slate-500 text-sm">{etapa.label}</p>
            </div>
          )
        })}
      </div>

      {/* Products */}
      {pedidos.length > 0 && (
        <div className="bg-white rounded-2xl border border-cobeb-border overflow-hidden">
          <div className="px-4 py-3 border-b border-cobeb-border flex items-center gap-2">
            <Package size={14} className="text-slate-500" />
            <p className="text-slate-500 text-[10px] font-semibold uppercase tracking-widest">{pedidos.length} produtos da carga</p>
          </div>
          {pedidos.slice(0, 5).map((item, i) => (
            <div key={item.id} className={`flex items-center justify-between px-4 py-2.5 ${i < Math.min(pedidos.length, 5) - 1 ? 'border-b border-cobeb-border' : ''}`}>
              <p className="text-slate-400 text-xs truncate flex-1 mr-3">{item.descricao}</p>
              <p className="text-slate-500 text-xs shrink-0">{Number(item.qtde_pallets).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} pal</p>
            </div>
          ))}
          {pedidos.length > 5 && <p className="text-slate-500 text-xs text-center py-2">+ {pedidos.length - 5} produtos</p>}
        </div>
      )}

      {/* NF Modal */}
      {showNF && <NFModal numeroNF={numeroNF} setNumeroNF={setNumeroNF} onConfirmar={confirmarNF} onCancelar={() => { setShowNF(false); setNumeroNF('') }} />}

      {/* Modal de seleção de unidade (Saída da Revenda) */}
      {showModalUnidade && (
        <ModalUnidadeDescarga
          unidades={unidades}
          onConfirmar={confirmarUnidadeESair}
          onCancelar={() => setShowModalUnidade(false)}
        />
      )}

      {/* Modal de Agendamento */}
      {showModalAgendamento && (
        <ModalAgendamento
          unidades={unidades}
          unidadePreSelecionada={viagem?.unidade ?? null}
          onConfirmar={onCriarAgendamento}
          onCancelar={onFecharModalAgendamento}
        />
      )}
    </div>
  )
}

// ── Modal Unidade de Descarga ─────────────────────────────────────────────────

function ModalUnidadeDescarga({ unidades, onConfirmar, onCancelar }) {
  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-end">
      <div className="w-full max-w-lg mx-auto bg-white rounded-t-3xl p-6 space-y-4">
        <div className="w-10 h-1 bg-cobeb-border rounded-full mx-auto" />
        <div>
          <p className="text-cobeb-text font-semibold text-base">Para onde vai descarregar?</p>
          <p className="text-slate-500 text-sm mt-1">Selecione a unidade de destino desta carga</p>
        </div>
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {unidades.map(u => (
            <button key={u.id} onClick={() => onConfirmar(u)}
              className="w-full flex items-center justify-between px-4 py-3.5 rounded-2xl border border-cobeb-border bg-white hover:border-cobeb-blue hover:bg-cobeb-navy/5 transition-all text-left">
              <div>
                <p className="text-cobeb-text text-sm font-semibold">{u.nome}</p>
                <p className="text-slate-500 text-xs mt-0.5">{u.cidade}</p>
              </div>
              <ChevronRight size={16} className="text-slate-400" />
            </button>
          ))}
          {!unidades.length && <p className="text-slate-400 text-sm text-center py-4">Nenhuma unidade cadastrada</p>}
        </div>
        <button onClick={onCancelar}
          className="w-full bg-[#EBF5FF] border border-cobeb-border text-slate-400 font-semibold py-3.5 rounded-2xl text-sm">
          Cancelar
        </button>
      </div>
    </div>
  )
}

// ── NF Modal ──────────────────────────────────────────────────────────────────

function NFModal({ numeroNF, setNumeroNF, onConfirmar, onCancelar }) {
  const ref = useRef(null)
  useEffect(() => { setTimeout(() => ref.current?.focus(), 150) }, [])

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-end">
      <div className="w-full max-w-lg mx-auto bg-white rounded-t-3xl p-6 space-y-5">
        <div className="w-10 h-1 bg-cobeb-border rounded-full mx-auto" />
        <div>
          <p className="text-cobeb-text font-semibold text-base">Chegada na Revenda</p>
          <p className="text-slate-500 text-sm mt-1">Informe o número da Nota Fiscal a entregar</p>
        </div>
        <div>
          <label className="block text-slate-500 text-[11px] font-semibold uppercase tracking-widest mb-1.5">
            Número da NF <span className="text-cobeb-navy">*</span>
          </label>
          <input ref={ref} value={numeroNF} onChange={e => setNumeroNF(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && numeroNF.trim() && onConfirmar()}
            placeholder="Ex: 123456" inputMode="numeric"
            className="w-full bg-[#EBF5FF] border border-cobeb-border rounded-xl px-4 py-3 text-cobeb-text text-sm placeholder-slate-400 focus:outline-none focus:border-cobeb-blue" />
        </div>
        <div className="flex gap-3">
          <button onClick={onCancelar} className="flex-1 bg-[#EBF5FF] border border-cobeb-border text-slate-400 font-semibold py-4 rounded-2xl text-sm">Cancelar</button>
          <button onClick={onConfirmar} disabled={!numeroNF.trim()}
            className="flex-1 bg-cobeb-navy hover:bg-cobeb-blue disabled:opacity-50 text-white font-semibold py-4 rounded-2xl text-sm transition-colors">
            Confirmar Chegada
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Modal Agendamento ─────────────────────────────────────────────────────────

const TIPO_DIA_LABEL = { SEMANA: 'Semana (Seg–Sex)', SÁBADO: 'Sábado', DOMINGO: 'Domingo' }

function ModalAgendamento({ unidades, onConfirmar, onCancelar, unidadePreSelecionada }) {
  const [step, setStep]           = useState(unidadePreSelecionada ? 'data' : 'revenda')
  const [revendaSel, setRevendaSel] = useState(unidadePreSelecionada ?? null)
  const [dataSel, setDataSel]     = useState('')        // 'YYYY-MM-DD'
  const [tipoDia, setTipoDia]     = useState('')        // 'SEMANA' | 'SÁBADO' | 'DOMINGO'
  const [blocos, setBlocos]       = useState([])        // grade_horarios rows
  const [vagasUsadas, setVagasUsadas] = useState({})   // { grade_id: count }
  const [carregando, setCarregando] = useState(false)
  const [confirmando, setConfirmando] = useState(false)

  function calcTipoDia(dateStr) {
    const dow = new Date(dateStr + 'T12:00:00').getDay() // 0=Dom, 6=Sáb
    if (dow === 0) return 'DOMINGO'
    if (dow === 6) return 'SÁBADO'
    return 'SEMANA'
  }

  async function carregarBlocos(revenda, date) {
    const tipo = calcTipoDia(date)
    setTipoDia(tipo)
    setCarregando(true)

    const { data: rows } = await supabase
      .from('grade_horarios')
      .select('id, bloco, status, motivo_criticidade, vagas, revenda_id')
      .eq('revenda_id', revenda.id)
      .eq('tipo_dia', tipo)
      .order('bloco')

    const disponiveis = (rows ?? []).filter(r => r.motivo_criticidade !== 'SEM ESCALA')

    // Conta agendamentos já existentes para cada bloco nessa data
    const gradeIds = disponiveis.map(r => r.id)
    let usadas = {}
    if (gradeIds.length) {
      const { data: ags } = await supabase
        .from('agendamentos')
        .select('grade_id')
        .in('grade_id', gradeIds)
        .eq('data_agendamento', date)
        .neq('status', 'cancelado')
      ;(ags ?? []).forEach(a => { usadas[a.grade_id] = (usadas[a.grade_id] ?? 0) + 1 })
    }

    setBlocos(disponiveis)
    setVagasUsadas(usadas)
    setCarregando(false)
    setStep('blocos')
  }

  async function confirmar(bloco) {
    setConfirmando(true)
    await onConfirmar({
      revendaId:        revendaSel.id,
      gradeId:          bloco.id,
      dataAgendamento:  dataSel,
      tipoDia,
      bloco:            bloco.bloco,
      revenda:          revendaSel,
    })
    setConfirmando(false)
  }

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-end">
      <div className="w-full max-w-lg mx-auto bg-white rounded-t-3xl flex flex-col" style={{ maxHeight: '90vh' }}>
        {/* Handle + header */}
        <div className="px-6 pt-5 pb-4 border-b border-cobeb-border shrink-0">
          <div className="w-10 h-1 bg-cobeb-border rounded-full mx-auto mb-4" />
          <div className="flex items-center justify-between">
            <div>
              <p className="text-cobeb-text font-semibold text-base">Agendar Horário</p>
              <p className="text-slate-500 text-xs mt-0.5">
                {step === 'revenda' && 'Selecione a revenda de destino'}
                {step === 'data'    && revendaSel?.nome}
                {step === 'blocos'  && `${revendaSel?.nome} · ${new Date(dataSel + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' })}`}
              </p>
            </div>
            <button onClick={onCancelar} className="p-2 text-slate-400 hover:text-slate-600 transition-colors">
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="overflow-y-auto flex-1 p-4 space-y-3">
          {/* Step: revenda */}
          {step === 'revenda' && (
            <>
              {unidades.map(u => (
                <button key={u.id} onClick={() => { setRevendaSel(u); setStep('data') }}
                  className="w-full flex items-center justify-between px-4 py-3.5 rounded-2xl border border-cobeb-border bg-white hover:border-cobeb-blue hover:bg-cobeb-navy/5 transition-all text-left">
                  <div>
                    <p className="text-cobeb-text text-sm font-semibold">{u.nome}</p>
                    <p className="text-slate-500 text-xs mt-0.5">{u.cidade}</p>
                  </div>
                  <ChevronRight size={16} className="text-slate-400" />
                </button>
              ))}
              {!unidades.length && <p className="text-slate-400 text-sm text-center py-6">Nenhuma revenda cadastrada</p>}
            </>
          )}

          {/* Step: data */}
          {step === 'data' && (
            <div className="space-y-4">
              <div>
                <label className="block text-slate-500 text-[11px] font-semibold uppercase tracking-widest mb-1.5">
                  Data de chegada prevista
                </label>
                <input
                  type="date"
                  value={dataSel}
                  min={new Date().toISOString().slice(0, 10)}
                  onChange={e => setDataSel(e.target.value)}
                  className="w-full bg-[#EBF5FF] border border-cobeb-border rounded-xl px-4 py-3 text-cobeb-text text-sm focus:outline-none focus:border-cobeb-blue"
                />
                {dataSel && (
                  <p className="text-slate-500 text-xs mt-2">
                    Tipo de dia: <span className="font-semibold text-cobeb-navy">{TIPO_DIA_LABEL[calcTipoDia(dataSel)]}</span>
                  </p>
                )}
              </div>
              <div className="flex gap-3">
                <button onClick={() => setStep('revenda')} className="flex-1 bg-[#EBF5FF] border border-cobeb-border text-slate-500 font-semibold py-3.5 rounded-xl text-sm">
                  Voltar
                </button>
                <button
                  onClick={() => carregarBlocos(revendaSel, dataSel)}
                  disabled={!dataSel || carregando}
                  className="flex-1 bg-cobeb-navy hover:bg-cobeb-blue disabled:opacity-50 text-white font-semibold py-3.5 rounded-xl text-sm transition-colors flex items-center justify-center gap-2">
                  {carregando
                    ? <><div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />Carregando...</>
                    : 'Ver Horários'}
                </button>
              </div>
            </div>
          )}

          {/* Step: blocos */}
          {step === 'blocos' && (
            <>
              <button onClick={() => setStep('data')} className="flex items-center gap-1.5 text-slate-400 text-xs mb-1 hover:text-cobeb-navy transition-colors">
                <ChevronLeft size={13} />Alterar data
              </button>

              {blocos.length === 0 && !carregando && (
                <p className="text-slate-400 text-sm text-center py-6">Nenhum horário disponível para essa data na grade.</p>
              )}

              {blocos.map(b => {
                const usadas  = vagasUsadas[b.id] ?? 0
                const cheio   = usadas >= b.vagas
                const critico = b.status === 'CRÍTICO'
                return (
                  <div key={b.id} className={`rounded-2xl border p-4 space-y-2 ${cheio ? 'opacity-40 bg-slate-50 border-cobeb-border' : critico ? 'border-amber-300 bg-amber-50' : 'border-cobeb-border bg-white'}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-cobeb-text font-mono font-bold text-sm">{b.bloco}</p>
                        <p className="text-slate-500 text-xs mt-0.5">
                          {cheio ? 'Vagas esgotadas' : `${b.vagas - usadas} de ${b.vagas} vaga${b.vagas > 1 ? 's' : ''} disponível`}
                        </p>
                      </div>
                      {critico && !cheio && (
                        <span className="bg-amber-100 text-amber-700 text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0">CRÍTICO</span>
                      )}
                      {cheio && (
                        <span className="bg-slate-100 text-slate-400 text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0">LOTADO</span>
                      )}
                    </div>
                    {critico && b.motivo_criticidade && !cheio && (
                      <div className="flex items-start gap-1.5 bg-amber-100/60 rounded-lg px-2 py-1.5">
                        <AlertTriangle size={11} className="text-amber-600 shrink-0 mt-0.5" />
                        <p className="text-amber-700 text-[11px]">{b.motivo_criticidade}</p>
                      </div>
                    )}
                    {!cheio && (
                      <button
                        onClick={() => confirmar(b)}
                        disabled={confirmando}
                        className="w-full bg-cobeb-navy hover:bg-cobeb-blue disabled:opacity-50 text-white font-semibold py-3 rounded-xl text-sm transition-colors flex items-center justify-center gap-2">
                        {confirmando
                          ? <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                          : 'Confirmar este horário'}
                      </button>
                    )}
                  </div>
                )
              })}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Resumo da Viagem (Módulo 6)
// ─────────────────────────────────────────────────────────────────────────────

function MetricBox({ label, value, highlight }) {
  return (
    <div className={`rounded-2xl border p-3 text-center ${highlight ? 'bg-cobeb-navy/10 border-cobeb-blue/30' : 'bg-white border-cobeb-border'}`}>
      <p className={`text-[10px] mb-1 uppercase tracking-wide ${highlight ? 'text-cobeb-yellow' : 'text-slate-500'}`}>{label}</p>
      <p className={`font-bold text-base font-mono ${highlight ? 'text-cobeb-yellow' : 'text-cobeb-text'}`}>{value}</p>
    </div>
  )
}

function ResumoViagem({ resumoData, profile, onNovaViagem, signOut }) {
  const { viagem, stats } = resumoData

  const tmaFabrica = diffHHMM(viagem.dt_chegada_fabrica, viagem.dt_saida_fabrica)
  const tmaRevenda = diffHHMM(viagem.dt_chegada_revenda, viagem.dt_saida_entrega)
  const tmvIda     = diffHHMM(viagem.dt_saida_revenda,   viagem.dt_chegada_fabrica)
  const tmvVolta   = diffHHMM(viagem.dt_saida_fabrica,   viagem.dt_chegada_revenda)
  const tmvTotal   = diffHHMM(viagem.dt_saida_revenda,   viagem.dt_saida_entrega)

  const paletesEsp = Number(stats.paletes_esperados)
  const paletesRec = Number(stats.paletes_recebidos)
  const diferenca  = paletesRec - paletesEsp

  return (
    <div className="min-h-screen bg-[#EBF5FF] flex flex-col">
      <header className="bg-cobeb-navy border-b border-blue-800 px-5 py-3.5 flex items-center justify-between shrink-0 shadow-md shadow-cobeb-navy/20">
        <div className="flex items-center gap-3">
          <img
            src={`${import.meta.env.BASE_URL}logos/logo-cobeb-transparent.png`}
            alt="COBEB"
            className="h-14 w-auto object-contain" style={{ filter: 'brightness(0) invert(1)', opacity: 0.92 }}
            onError={(e) => { e.target.style.display = 'none' }}
          />
          <div>
            <p className="text-white text-sm font-semibold leading-tight">Resumo da Viagem</p>
            <p className="text-blue-300/60 text-[10px] font-medium">{profile?.nome}</p>
          </div>
        </div>
        <button onClick={async () => { await signOut() }} className="text-blue-300/70 hover:text-white transition-colors p-1.5 rounded-lg hover:bg-white/10">
          <LogOut size={18} />
        </button>
      </header>

      <main className="flex-1 overflow-y-auto pb-28">
        <div className="max-w-lg mx-auto px-4 pt-5 space-y-4">

          {/* Banner de conclusão */}
          <div className="bg-green-500/10 border border-green-500/30 rounded-2xl p-5 text-center">
            <CheckCircle size={36} className="text-green-400 mx-auto mb-2" />
            <p className="text-cobeb-text font-bold text-base">Viagem Concluída!</p>
            <p className="text-slate-500 text-sm mt-1">{viagem.unidade?.nome} — {viagem.unidade?.cidade}</p>
          </div>

          {/* Veículo e motorista */}
          <div className="bg-white rounded-2xl border border-cobeb-border divide-y divide-cobeb-border">
            <SRow label="Motorista" value={`${profile?.nome}${profile?.tipo ? ' · ' + profile.tipo : ''}`} />
            <SRow label="Carreta"   value={`${viagem.carreta?.placa ?? '—'} · ${viagem.carreta?.tipo ?? ''}`} />
            <SRow label="Cavalo"    value={`${viagem.cavalo?.placa ?? '—'} · ${viagem.cavalo?.tipo ?? ''}`} />
            {viagem.numero_nf_saida && <SRow label="NF Saída (Rev→Fab)" value={viagem.numero_nf_saida} />}
            {viagem.numero_nf && <SRow label="NF Entrada (Fab→Rev)" value={viagem.numero_nf} />}
          </div>

          {/* Horários */}
          <section>
            <p className="text-[11px] text-slate-500 font-semibold uppercase tracking-widest mb-2 px-1">Horários</p>
            <div className="bg-white rounded-2xl border border-cobeb-border divide-y divide-cobeb-border">
              <SRow label="Saída da Revenda"   value={formatTs(viagem.dt_saida_revenda)}   />
              <SRow label="Chegada na Fábrica" value={formatTs(viagem.dt_chegada_fabrica)} />
              <SRow label="Saída da Fábrica"   value={formatTs(viagem.dt_saida_fabrica)}   />
              <SRow label="Chegada na Revenda" value={formatTs(viagem.dt_chegada_revenda)} />
              <SRow label="Saída após Entrega" value={formatTs(viagem.dt_saida_entrega)}   />
            </div>
          </section>

          {/* TMA */}
          <section>
            <p className="text-[11px] text-slate-500 font-semibold uppercase tracking-widest mb-2 px-1">TMA — Tempo de Atendimento</p>
            <div className="grid grid-cols-2 gap-3">
              <MetricBox label="Na Fábrica" value={tmaFabrica} />
              <MetricBox label="Na Revenda" value={tmaRevenda} />
            </div>
          </section>

          {/* TMV */}
          <section>
            <p className="text-[11px] text-slate-500 font-semibold uppercase tracking-widest mb-2 px-1">TMV — Tempo de Viagem</p>
            <div className="grid grid-cols-3 gap-3">
              <MetricBox label="Ida"   value={tmvIda}   />
              <MetricBox label="Volta" value={tmvVolta} />
              <MetricBox label="Total" value={tmvTotal} highlight />
            </div>
          </section>

          {/* Paletes */}
          <div className="bg-white rounded-2xl border border-cobeb-border p-4">
            <p className="text-[11px] text-slate-500 font-semibold uppercase tracking-widest mb-3">Paletes</p>
            <div className="grid grid-cols-3 gap-3 text-center">
              <div>
                <p className="text-slate-500 text-[10px] mb-1">Esperado</p>
                <p className="text-cobeb-text font-bold text-xl">{paletesEsp.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}</p>
              </div>
              <div>
                <p className="text-slate-500 text-[10px] mb-1">Recebido</p>
                <p className="text-cobeb-text font-bold text-xl">{paletesRec.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}</p>
              </div>
              <div>
                <p className="text-slate-500 text-[10px] mb-1">Diferença</p>
                <p className={`font-bold text-xl ${diferenca === 0 ? 'text-green-400' : 'text-cobeb-yellow'}`}>
                  {diferenca > 0 ? '+' : ''}{diferenca.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}
                </p>
              </div>
            </div>
          </div>

          {/* Anomalias */}
          {stats.total_anomalias > 0 ? (
            <div className="bg-cobeb-navy/10 border border-cobeb-blue/30 rounded-2xl px-4 py-3 flex items-center gap-3">
              <AlertTriangle size={16} className="text-cobeb-yellow shrink-0" />
              <p className="text-cobeb-yellow text-sm">{stats.total_anomalias} anomalia{stats.total_anomalias > 1 ? 's' : ''} registrada{stats.total_anomalias > 1 ? 's' : ''}</p>
            </div>
          ) : (
            <div className="bg-green-500/5 border border-green-500/20 rounded-2xl px-4 py-3 flex items-center gap-3">
              <CheckCircle size={14} className="text-green-400 shrink-0" />
              <p className="text-green-400 text-sm">Nenhuma anomalia registrada</p>
            </div>
          )}

        </div>
      </main>

      {/* Footer fixo */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-cobeb-border px-4 py-3 z-30">
        <button onClick={onNovaViagem}
          className="w-full bg-cobeb-navy hover:bg-cobeb-blue text-white font-bold py-4 rounded-2xl text-sm flex items-center justify-center gap-2 transition-colors">
          Iniciar Nova Viagem <ChevronRight size={18} />
        </button>
      </div>
    </div>
  )
}
