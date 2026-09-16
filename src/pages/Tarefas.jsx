import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  LogOut, ClipboardList, MapPin, ChevronLeft, CheckCircle, Clock,
  AlertCircle, Package, Truck, RefreshCw, Camera, AlertTriangle, Plus, X, FileText, LayoutGrid, ShoppingCart, ArrowLeftRight,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import EmissaoNRI from './EmissaoNRI'

const uid = () => Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2)

// ── Helpers ───────────────────────────────────────────────────────────────────

function tipoManualCfg(tipo) {
  if (tipo === 'transferencia') return {
    Icon: ArrowLeftRight, label: 'Transferência',
    labelCls: 'text-indigo-600', iconCls: 'text-indigo-500',
    btnCls: 'bg-indigo-500 hover:bg-indigo-600',
  }
  return {
    Icon: ShoppingCart, label: 'Marketplace',
    labelCls: 'text-orange-600', iconCls: 'text-orange-500',
    btnCls: 'bg-orange-500 hover:bg-orange-600',
  }
}

const STATUS_CFG = {
  pendente:     { label: 'Pendente',     color: 'text-slate-500',  bg: 'bg-[#EBF5FF]',    border: 'border-cobeb-border' },
  em_andamento: { label: 'Em Andamento', color: 'text-blue-400',   bg: 'bg-blue-500/10',  border: 'border-blue-500/40' },
  concluida:    { label: 'Concluída',    color: 'text-green-400',  bg: 'bg-green-500/10', border: 'border-green-500/40' },
}

function formatTs(iso) {
  if (!iso) return null
  const d = new Date(iso)
  return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

function calcCaixas(qtdeRecebida, pedido) {
  const rec = Number(qtdeRecebida)
  const pal = Number(pedido.qtde_pallets)
  const cx  = Number(pedido.qtde_skus)
  if (!rec || !pal) return null
  return Math.round(rec * (cx / pal))
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function Tarefas() {
  const { profile, signOut, modoVisao, setModoVisao } = useAuth()
  const navigate = useNavigate()

  const [view, setView]             = useState('lista')
  const [tarefaSel, setTarefaSel]   = useState(null)

  // lista
  const [tarefas, setTarefas]             = useState([])
  const [loading, setLoading]             = useState(true)
  const [filtroStatus, setFiltroStatus]   = useState('')
  const [iniciando, setIniciando]         = useState(null)
  const [portariaMap, setPortariaMap]     = useState({}) // viagem_id → status portaria
  const [verificando, setVerificando]     = useState(null)

  // conferência
  const [pedidos, setPedidos]             = useState([])
  const [itenState, setItenState]         = useState({})
  const [anomalias, setAnomalias]         = useState([])
  const [loadingConf, setLoadingConf]     = useState(false)
  const [concluindo, setConcluindo]       = useState(false)

  // NRI
  const [abrindoNRI,     setAbrindoNRI]     = useState(null) // tarefa.id enquanto carrega
  const [gruposNRI,      setGruposNRI]      = useState([])
  const [finalizando,    setFinalizando]    = useState(null)
  const [finalizandoSem, setFinalizandoSem] = useState(null)

  // anomalia modal
  const [showModal, setShowModal]         = useState(false)
  const [anomForm, setAnomaliaForm]       = useState(null)
  const [salvandoAno, setSalvandoAno]     = useState(false)
  const fotoRefs                          = [useRef(), useRef(), useRef(), useRef()]

  useEffect(() => { loadLista() }, [])

  useEffect(() => {
    const timer = setInterval(() => loadLista(true), 30000)
    return () => clearInterval(timer)
  }, [])

  // ─── Lista ──────────────────────────────────────────────────────────────────

  async function loadLista(silent = false) {
    if (!silent) setLoading(true)
    let q = supabase
      .from('tarefas')
      .select(`*,
        viagem:viagens(
          id, horario_agendado, dt_chegada_revenda,
          motorista:profiles(nome, tipo),
          carreta:carretas(placa),
          cavalo:cavalos(placa)
        )
      `)
      .order('created_at', { ascending: false })
    if (!profile?.acesso_total && profile?.unidade_id) {
      q = q.eq('unidade_id', profile.unidade_id)
    }
    const { data } = await q

    const lista = data ?? []

    // Busca status portaria para tarefas pendentes
    const viagemIds = lista
      .filter(t => t.status === 'pendente' && t.viagem?.id)
      .map(t => t.viagem.id)
    if (viagemIds.length) {
      const { data: ports } = await supabase
        .from('portaria_atendimentos')
        .select('viagem_id, status')
        .in('viagem_id', viagemIds)
        .is('excluido_em', null)
      // Default 'aguardando' para todas — sem registro = portaria ainda não iniciou
      const map = {}
      viagemIds.forEach(id => { map[id] = 'aguardando' })
      ;(ports ?? []).forEach(p => { map[p.viagem_id] = p.status })
      setPortariaMap(map)
    }

    setTarefas(lista)
    if (!silent) setLoading(false)
  }

  // Polling para tarefas pendentes aguardando portaria
  useEffect(() => {
    const bloqueadas = tarefas.filter(t =>
      t.status === 'pendente' && t.viagem?.id && portariaMap[t.viagem.id] === 'aguardando'
    )
    if (!bloqueadas.length) return
    const ids = bloqueadas.map(t => t.viagem.id)
    const timer = setInterval(async () => {
      const { data: ports } = await supabase
        .from('portaria_atendimentos')
        .select('viagem_id, status')
        .in('viagem_id', ids)
        .is('excluido_em', null)
      setPortariaMap(prev => {
        const next = { ...prev }
        ;(ports ?? []).forEach(p => { next[p.viagem_id] = p.status })
        return next
      })
    }, 30000)
    return () => clearInterval(timer)
  }, [tarefas, portariaMap])

  async function verificarPortaria(tarefa) {
    if (!tarefa.viagem?.id) return
    setVerificando(tarefa.id)
    const { data } = await supabase
      .from('portaria_atendimentos')
      .select('viagem_id, status')
      .eq('viagem_id', tarefa.viagem.id)
      .is('excluido_em', null)
      .maybeSingle()
    if (data) setPortariaMap(prev => ({ ...prev, [data.viagem_id]: data.status }))
    setVerificando(null)
  }

  async function iniciarConferencia(tarefa) {
    setIniciando(tarefa.id)
    const { error } = await supabase.from('tarefas')
      .update({ status: 'em_andamento', conferente_id: profile.id })
      .eq('id', tarefa.id)
    setIniciando(null)
    if (error) return
    const updated = { ...tarefa, status: 'em_andamento', conferente_id: profile.id }
    setTarefas(prev => prev.map(t => t.id === tarefa.id ? updated : t))
    openConferencia(updated)
  }

  function openConferencia(tarefa) {
    setTarefaSel(tarefa)
    setView('conferencia')
    loadConferencia(tarefa)
  }

  function voltarLista() {
    setView('lista')
    setTarefaSel(null)
    setPedidos([])
    setItenState({})
    setAnomalias([])
  }

  // ─── Conferência ────────────────────────────────────────────────────────────

  async function loadConferencia(tarefa) {
    setLoadingConf(true)
    // viagem_id direto da tarefa como fallback para quando o join viagem retorna null (ex: admin_total)
    const viagemId = tarefa.viagem?.id ?? tarefa.viagem_id
    if (!viagemId) {
      setPedidos([]); setItenState({}); setAnomalias([])
      setLoadingConf(false)
      return
    }
    const [{ data: peds }, { data: itens }, { data: anos }] = await Promise.all([
      supabase.from('pedidos').select('*').eq('viagem_id', viagemId).neq('status', 'cancelado').order('descricao'),
      supabase.from('conferencia_itens').select('*').eq('tarefa_id', tarefa.id).order('created_at'),
      supabase.from('anomalias')
        .select('*, pedido:pedidos(descricao, cod_produto)')
        .eq('tarefa_id', tarefa.id)
        .order('created_at'),
    ])
    const pedsList = peds ?? []
    setPedidos(pedsList)

    // Agrupa entradas do banco por pedido_id
    const dbByPedido = {}
    ;(itens ?? []).forEach(it => {
      if (!dbByPedido[it.pedido_id]) dbByPedido[it.pedido_id] = []
      dbByPedido[it.pedido_id].push({
        _id:          uid(),
        id:           it.id,
        qtde_recebida: it.qtde_recebida != null ? String(it.qtde_recebida) : '',
        data_validade: it.data_validade ?? '',
        cxInput:      '',
      })
    })

    // Para produtos sem dados no banco, inicia com uma entrada em branco
    const state = {}
    pedsList.forEach(p => {
      state[p.id] = dbByPedido[p.id] ?? [{ _id: uid(), id: null, qtde_recebida: '', data_validade: '', cxInput: '' }]
    })

    setItenState(state)
    setAnomalias(anos ?? [])
    setLoadingConf(false)
  }

  function setEntradaField(pedidoId, localId, field, value) {
    setItenState(s => ({
      ...s,
      [pedidoId]: (s[pedidoId] ?? []).map(e => e._id === localId ? { ...e, [field]: value } : e),
    }))
  }

  async function salvarEntrada(pedidoId, localId) {
    const entries = itenState[pedidoId] ?? []
    const entry = entries.find(e => e._id === localId)
    if (!entry) return
    const qtde = entry.qtde_recebida || null
    const dataVal = entry.data_validade || null
    if (!qtde && !dataVal && !entry.id) return
    if (entry.id) {
      await supabase.from('conferencia_itens')
        .update({ qtde_recebida: qtde, data_validade: dataVal })
        .eq('id', entry.id)
    } else {
      const { data: row } = await supabase.from('conferencia_itens')
        .insert({ tarefa_id: tarefaSel.id, pedido_id: pedidoId, qtde_recebida: qtde, data_validade: dataVal })
        .select('id')
        .single()
      if (row?.id) {
        setItenState(s => ({
          ...s,
          [pedidoId]: (s[pedidoId] ?? []).map(e => e._id === localId ? { ...e, id: row.id } : e),
        }))
      }
    }
  }

  function adicionarEntrada(pedidoId) {
    setItenState(s => ({
      ...s,
      [pedidoId]: [...(s[pedidoId] ?? []), { _id: uid(), id: null, qtde_recebida: '', data_validade: '', cxInput: '' }],
    }))
  }

  async function removerEntrada(pedidoId, localId) {
    const entry = (itenState[pedidoId] ?? []).find(e => e._id === localId)
    if (entry?.id) {
      await supabase.from('conferencia_itens').delete().eq('id', entry.id)
    }
    setItenState(s => ({
      ...s,
      [pedidoId]: (s[pedidoId] ?? []).filter(e => e._id !== localId),
    }))
  }

  const todosConferidos = pedidos.length > 0 &&
    pedidos.every(p => {
      const entries = itenState[p.id] ?? []
      return entries.some(e => e.qtde_recebida && Number(e.qtde_recebida) > 0)
    })

  const divergencias = pedidos.filter(p => {
    const entries = itenState[p.id] ?? []
    const hasAnyQty = entries.some(e => e.qtde_recebida && Number(e.qtde_recebida) > 0)
    if (!hasAnyQty) return false
    const totalRec = entries.reduce((s, e) => s + (Number(e.qtde_recebida) || 0), 0)
    return Math.abs(totalRec - Number(p.qtde_pallets)) > 0.001
  })

  const divergenciasSemAnomalia = divergencias.filter(p =>
    !anomalias.some(a => a.pedido_id === p.id)
  )

  async function concluirConferencia() {
    if (divergenciasSemAnomalia.length > 0) return
    setConcluindo(true)
    await supabase.from('tarefas').update({ status: 'concluida' }).eq('id', tarefaSel.id)
    setConcluindo(false)
    voltarLista()
    loadLista()
  }

  async function abrirNRI(tarefa) {
    setAbrindoNRI(tarefa.id)
    try {
      const nriViagemId = tarefa.viagem?.id ?? tarefa.viagem_id
      const [{ data: peds }, { data: itens }, { data: anos }] = await Promise.all([
        supabase.from('pedidos').select('*').eq('viagem_id', nriViagemId).neq('status', 'cancelado').order('descricao'),
        supabase.from('conferencia_itens')
          .select('pedido_id, qtde_recebida, data_validade')
          .eq('tarefa_id', tarefa.id)
          .gt('qtde_recebida', 0),
        supabase.from('anomalias')
          .select('pedido_id')
          .eq('tarefa_id', tarefa.id)
          .not('pedido_id', 'is', null),
      ])

      const pedidos = peds ?? []
      setPedidos(pedidos)

      const pedidoMap   = {}
      pedidos.forEach(p => { pedidoMap[p.id] = p })
      const comAnomalia = new Set((anos ?? []).map(a => a.pedido_id))

      const gruposIniciais = (itens ?? [])
        .filter(it => !comAnomalia.has(it.pedido_id) && pedidoMap[it.pedido_id])
        .map(it => {
          const p        = pedidoMap[it.pedido_id]
          const cxPallet = (p.qtde_pallets > 0) ? p.qtde_skus / p.qtde_pallets : null
          const qtd      = Number(it.qtde_recebida)
          return {
            _id:          uid(),
            codigo:       p.cod_produto ?? '',
            descricao:    p.descricao,
            cxPallet,
            qtdePaletes:  String(Math.ceil(qtd)),
            qtdeCaixas:   cxPallet && qtd ? Math.round(Math.ceil(qtd) * cxPallet) : null,
            unidade:      'PLT',
            qtdaCxInput:  '',
            dataValidade: it.data_validade ?? '',
            curva:        p.curva ?? null,
            buscando:     false,
            erroCodigo:   null,
            erroQtd:      false,
            erroData:     false,
          }
        })

      setGruposNRI(gruposIniciais)
      setTarefaSel(tarefa)
      setView('nri')
    } catch (err) {
      console.error('[abrirNRI] Erro ao carregar dados:', err)
      alert('Erro ao abrir NRI. Tente novamente.')
    } finally {
      setAbrindoNRI(null)
    }
  }

  async function abrirNRIMarketplace(tarefa) {
    setAbrindoNRI(tarefa.id)
    setGruposNRI([])
    setPedidos([])
    setTarefaSel(tarefa)
    setAbrindoNRI(null)
    setView('nri')
  }

  async function finalizarMarketplace(tarefa) {
    setFinalizando(tarefa.id)
    const { error } = await supabase.from('tarefas')
      .update({ status: 'concluida' })
      .eq('id', tarefa.id)
    setFinalizando(null)
    if (error) { alert('Erro ao finalizar: ' + error.message); return }
    setTarefas(prev => prev.map(t => t.id === tarefa.id ? { ...t, status: 'concluida' } : t))
  }

  async function finalizarSemConferencia(tarefa) {
    if (!window.confirm(`Finalizar NF ${tarefa.numero_nf ?? tarefa.id} sem conferência?\nA tarefa será marcada como concluída sem revisão de itens.`)) return
    setFinalizandoSem(tarefa.id)
    const { error } = await supabase.from('tarefas').update({ status: 'concluida' }).eq('id', tarefa.id)
    setFinalizandoSem(null)
    if (error) { alert('Erro ao finalizar: ' + error.message); return }
    setTarefas(prev => prev.map(t => t.id === tarefa.id ? { ...t, status: 'concluida' } : t))
  }

  async function iniciarConferenciaMarketplace(tarefa) {
    setIniciando(tarefa.id)
    const { error } = await supabase.from('tarefas')
      .update({ status: 'em_andamento', conferente_id: profile.id })
      .eq('id', tarefa.id)
    setIniciando(null)
    if (error) return
    const updated = { ...tarefa, status: 'em_andamento', conferente_id: profile.id }
    setTarefas(prev => prev.map(t => t.id === tarefa.id ? updated : t))
    await abrirNRIMarketplace(updated)
  }

  // ─── Anomalia Modal ──────────────────────────────────────────────────────────

  function abrirModalAnomalia(pedidoId = '') {
    setAnomaliaForm({
      tipo:                'qualidade',
      pedido_id:           pedidoId,
      descricao:           '',
      lote:                '',
      folderKey:           uid(),
      fotos:               [null, null, null, null],
      fotosUrls:           [null, null, null, null],
      uploading:           [false, false, false, false],
      erros:               [null, null, null, null],
      sub_codigo:          '',
      sub_descricao:       null,
      sub_erro:            null,
      sub_buscando:        false,
      sub_qtde_pallets:    '',
      sub_qtde_caixas:     null,
      sub_caixas_pallet:   null,
      sub_data_validade:   '',
    })
    setShowModal(true)
  }

  async function buscarSubstituto(codigo) {
    const cod = codigo.trim()
    if (!cod) return
    setAnomaliaForm(f => f ? { ...f, sub_buscando: true, sub_erro: null, sub_descricao: null } : f)
    const { data } = await supabase
      .from('produtos_catalogo')
      .select('codigo, descricao, caixas_pallet')
      .eq('codigo', cod)
      .maybeSingle()
    setAnomaliaForm(f => {
      if (!f) return f
      if (data) {
        const cx = f.sub_qtde_pallets && data.caixas_pallet
          ? Math.round(Number(f.sub_qtde_pallets) * Number(data.caixas_pallet))
          : null
        return { ...f, sub_buscando: false, sub_descricao: data.descricao, sub_erro: null, sub_caixas_pallet: data.caixas_pallet, sub_qtde_caixas: cx }
      }
      return { ...f, sub_buscando: false, sub_descricao: null, sub_erro: 'Produto não encontrado na tabela', sub_caixas_pallet: null, sub_qtde_caixas: null }
    })
  }

  async function handleFotoSelect(file, idx) {
    if (!file) return
    const previewUrl = URL.createObjectURL(file)
    setAnomaliaForm(f => {
      if (!f) return f
      const fotos     = [...f.fotos];     fotos[idx]     = previewUrl
      const uploading = [...f.uploading]; uploading[idx] = true
      const erros     = [...f.erros];     erros[idx]     = null
      return { ...f, fotos, uploading, erros }
    })

    const folderKey = anomForm?.folderKey
    if (!folderKey) return

    const ext  = (file.name.split('.').pop() || 'jpg').toLowerCase()
    const slot = ['frente', 'lateral', 'fundo', 'lote'][idx]
    const path = `${tarefaSel.id}/${folderKey}/${slot}.${ext}`

    const { error } = await supabase.storage
      .from('anomalias-fotos')
      .upload(path, file, { upsert: true })

    if (error) {
      setAnomaliaForm(f => {
        if (!f) return f
        const fotos     = [...f.fotos];     fotos[idx]     = null
        const uploading = [...f.uploading]; uploading[idx] = false
        const erros     = [...f.erros];     erros[idx]     = 'Falha no envio. Toque para tentar novamente.'
        return { ...f, fotos, uploading, erros }
      })
      return
    }

    /**
     * Guarda o CAMINHO, e não mais a URL pública.
     *
     * O bucket passou a ser privado (ver `sql/054` e `src/lib/fotos.js`), então
     * `getPublicUrl` devolveria um endereço que não abre. Guardar um endereço
     * que dá erro quando alguém o cola é pista falsa: manda a investigação
     * começar no lugar errado.
     *
     * As anomalias antigas continuam com a URL inteira gravada, e `caminhoDaFoto`
     * lê as duas formas -- nenhuma migração de dados foi necessária.
     */
    setAnomaliaForm(f => {
      if (!f) return f
      const fotosUrls = [...f.fotosUrls]; fotosUrls[idx] = path
      const uploading = [...f.uploading]; uploading[idx] = false
      return { ...f, fotosUrls, uploading }
    })
  }

  async function salvarAnomalia() {
    if (!anomForm || !anomForm.descricao.trim()) return
    setSalvandoAno(true)
    const fotosEnviadas = anomForm.fotosUrls.filter(Boolean)
    const { data, error } = await supabase.from('anomalias').insert({
      tarefa_id:               tarefaSel.id,
      pedido_id:               anomForm.pedido_id || null,
      unidade_id:              tarefaSel.unidade_id,
      conferente_id:           profile.id,
      descricao:               anomForm.descricao.trim(),
      lote:                    anomForm.lote.trim() || null,
      fotos:                   fotosEnviadas,
      tipo:                     anomForm.tipo,
      substituto_codigo:        anomForm.tipo === 'inversao' ? (anomForm.sub_codigo.trim() || null) : null,
      substituto_descricao:     anomForm.tipo === 'inversao' ? (anomForm.sub_descricao || null) : null,
      substituto_qtde_pallets:  anomForm.tipo === 'inversao' && anomForm.sub_qtde_pallets ? Number(anomForm.sub_qtde_pallets) : null,
      substituto_qtde_caixas:   anomForm.tipo === 'inversao' ? (anomForm.sub_qtde_caixas || null) : null,
      substituto_data_validade: anomForm.tipo === 'inversao' ? (anomForm.sub_data_validade || null) : null,
    }).select('*, pedido:pedidos(descricao, cod_produto)').single()
    setSalvandoAno(false)
    if (!error && data) {
      setAnomalias(prev => [...prev, data])
      setShowModal(false)
      setAnomaliaForm(null)
    }
  }

  // ─── Render ──────────────────────────────────────────────────────────────────

  const tarefasFiltradas = filtroStatus
    ? tarefas.filter(t => t.status === filtroStatus)
    : tarefas

  const counts = {
    pendente:     tarefas.filter(t => t.status === 'pendente').length,
    em_andamento: tarefas.filter(t => t.status === 'em_andamento').length,
    concluida:    tarefas.filter(t => t.status === 'concluida').length,
  }

  if (view === 'nri' && tarefaSel) {
    return (
      <EmissaoNRI
        tarefa={tarefaSel}
        pedidos={pedidos}
        profileNome={profile?.nome ?? ''}
        gruposIniciais={gruposNRI}
        onVoltar={voltarLista}
      />
    )
  }

  if (view === 'conferencia' && tarefaSel) {
    return (
      <>
        <ConferenciaView
          tarefa={tarefaSel}
          pedidos={pedidos}
          itenState={itenState}
          anomalias={anomalias}
          loadingConf={loadingConf}
          concluindo={concluindo}
          todosConferidos={todosConferidos}
          divergencias={divergencias}
          divergenciasSemAnomalia={divergenciasSemAnomalia}
          onBack={voltarLista}
          onSetEntrada={setEntradaField}
          onSalvarEntrada={salvarEntrada}
          onAdicionarEntrada={adicionarEntrada}
          onRemoverEntrada={removerEntrada}
          onConcluir={concluirConferencia}
          onAbrirAnomalia={abrirModalAnomalia}
          signOut={signOut}
          isAdminEdit={!!profile?.acesso_total}
        />
        {showModal && anomForm && (
          <AnomaliaModal
            form={anomForm}
            pedidos={pedidos}
            fotoRefs={fotoRefs}
            salvando={salvandoAno}
            onClose={() => { setShowModal(false); setAnomaliaForm(null) }}
            onSave={salvarAnomalia}
            onFotoSelect={handleFotoSelect}
            onBuscarSubstituto={buscarSubstituto}
            onChange={setAnomaliaForm}
          />
        )}
      </>
    )
  }

  return (
    <div className="min-h-screen bg-[#EBF5FF]">
      {/* Header + filtros fixos no topo */}
      <div className="sticky top-0 z-40">
        <header className="bg-cobeb-navy border-b border-blue-800 px-3 py-2 sm:px-5 sm:py-3.5 flex items-center justify-between shadow-md shadow-cobeb-navy/20">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <img
              src={`${import.meta.env.BASE_URL}logos/logo-cobeb-v2.png`}
              alt="COBEB"
              className="h-7 sm:h-11 md:h-14 w-auto object-contain shrink-0" style={{ opacity: 0.92 }}
              onError={(e) => { e.target.style.display = 'none' }}
            />
            <div className="min-w-0">
              <p className="text-white text-xs sm:text-sm font-semibold leading-tight truncate">Tarefas de Conferência</p>
              <p className="text-blue-300/60 text-[9px] sm:text-[10px] font-medium flex items-center gap-1 hidden sm:flex">
                <MapPin size={9} />
                {profile?.unidade?.nome ?? 'COBEB'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={loadLista} className="text-blue-300/70 hover:text-white transition-colors p-1.5 rounded-lg hover:bg-white/10">
              <RefreshCw size={16} />
            </button>
            {modoVisao && (
              <button onClick={() => { setModoVisao(null); navigate('/selecionar-modulo') }}
                className="text-cobeb-yellow hover:text-white transition-colors p-1.5 rounded-lg hover:bg-white/10"
                title="Trocar Módulo">
                <LayoutGrid size={16} />
              </button>
            )}
            <button onClick={() => signOut()} className="text-blue-300/70 hover:text-white transition-colors p-1.5 rounded-lg hover:bg-white/10">
              <LogOut size={18} />
            </button>
          </div>
        </header>
        {/* Status pills */}
        <div className="bg-[#EBF5FF] border-b border-cobeb-border/40 px-4 py-2.5">
          <div className="max-w-lg mx-auto flex gap-2 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
            {[
              { value: '',             label: 'Todas',        count: tarefas.length },
              { value: 'pendente',     label: 'Pendentes',    count: counts.pendente },
              { value: 'em_andamento', label: 'Em Andamento', count: counts.em_andamento },
              { value: 'concluida',    label: 'Concluídas',   count: counts.concluida },
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
      </div>{/* /sticky */}

      <main className="pb-8">
        <div className="max-w-lg mx-auto px-4 pt-4 space-y-4">

          {/* Task list */}
          {loading ? (
            <div className="flex justify-center py-16">
              <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : tarefasFiltradas.length === 0 ? (
            <div className="text-center py-16">
              <div className="w-14 h-14 rounded-2xl bg-white border border-cobeb-border flex items-center justify-center mx-auto mb-4">
                <ClipboardList size={22} className="text-cobeb-border" />
              </div>
              <p className="text-slate-500 text-sm font-medium">Nenhuma tarefa encontrada</p>
              <p className="text-cobeb-border text-xs mt-1">As tarefas aparecem quando um motorista chega na revenda</p>
            </div>
          ) : (
            <div className="space-y-3">
              {tarefasFiltradas.map(tarefa => {
                const cfg = STATUS_CFG[tarefa.status] ?? STATUS_CFG.pendente
                return (
                  <div key={tarefa.id} className={`rounded-2xl border overflow-hidden ${cfg.bg} ${cfg.border}`}>
                    <div className="px-4 py-3">
                      <div className="mb-3">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          {tarefa.tipo !== 'normal'
                            ? (() => { const c = tipoManualCfg(tarefa.tipo); return <><c.Icon size={13} className={c.iconCls} /><span className={`${c.labelCls} font-semibold text-sm`}>{c.label}</span></> })()
                            : <span className="text-cobeb-text font-semibold text-sm">NF {tarefa.numero_nf}</span>}
                          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${cfg.color} ${cfg.border} bg-[#EBF5FF]/60`}>
                            {cfg.label}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-slate-500 flex-wrap">
                          {tarefa.tipo !== 'normal' ? (
                            <span className="flex items-center gap-1 font-mono text-[11px]">
                              <Truck size={10} />
                              {[tarefa.placa_cavalo, tarefa.placa_carreta].filter(Boolean).join(' / ')}
                            </span>
                          ) : (
                            <>
                              {tarefa.viagem?.motorista?.nome && (
                                <span className="flex items-center gap-1">
                                  <Truck size={10} className="text-slate-500" />
                                  {tarefa.viagem.motorista.nome}
                                  {tarefa.viagem.motorista.tipo && (
                                    <span className="text-slate-500 text-[10px]">({tarefa.viagem.motorista.tipo})</span>
                                  )}
                                </span>
                              )}
                              {(tarefa.viagem?.carreta?.placa || tarefa.viagem?.cavalo?.placa) && (
                                <>
                                  <span className="text-slate-700">·</span>
                                  <span className="font-mono text-[11px]">
                                    {[tarefa.viagem?.carreta?.placa, tarefa.viagem?.cavalo?.placa].filter(Boolean).join(' / ')}
                                  </span>
                                </>
                              )}
                            </>
                          )}
                        </div>
                        <div className="flex items-center gap-3 mt-1 text-[10px] text-slate-500 flex-wrap">
                          <span className="flex items-center gap-1">
                            <Clock size={10} />
                            {tarefa.tipo !== 'normal' ? 'Entrada: ' : 'Chegada: '}
                            {formatTs(tarefa.viagem?.dt_chegada_revenda) ?? formatTs(tarefa.created_at)}
                          </span>
                          {tarefa.viagem?.horario_agendado && (
                            <span>Agend.: {tarefa.viagem.horario_agendado}</span>
                          )}
                        </div>
                      </div>

                      {tarefa.tipo !== 'normal' ? (
                        <>
                          {tarefa.status === 'pendente' && (
                            <button onClick={() => iniciarConferenciaMarketplace(tarefa)} disabled={iniciando === tarefa.id}
                              className={`w-full disabled:opacity-50 text-white text-xs font-semibold py-2.5 rounded-xl transition-colors flex items-center justify-center gap-1.5 ${tipoManualCfg(tarefa.tipo).btnCls}`}>
                              {iniciando === tarefa.id
                                ? <div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                                : <><FileText size={13} />Gerar NRI {tipoManualCfg(tarefa.tipo).label}</>}
                            </button>
                          )}
                          {tarefa.status === 'em_andamento' && (
                            <div className="flex gap-2">
                              <button onClick={() => abrirNRIMarketplace(tarefa)} disabled={abrindoNRI === tarefa.id}
                                className="flex-1 bg-cobeb-navy hover:bg-cobeb-blue disabled:opacity-50 text-white text-xs font-semibold py-2.5 rounded-xl transition-colors flex items-center justify-center gap-1.5">
                                {abrindoNRI === tarefa.id
                                  ? <div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                                  : <><FileText size={13} />Gerar NRI</>}
                              </button>
                              <button onClick={() => finalizarMarketplace(tarefa)} disabled={finalizando === tarefa.id}
                                className="flex-1 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-xs font-semibold py-2.5 rounded-xl transition-colors flex items-center justify-center gap-1.5">
                                {finalizando === tarefa.id
                                  ? <div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                                  : <><CheckCircle size={13} />Finalizar Recebimento</>}
                              </button>
                            </div>
                          )}
                          {tarefa.status === 'concluida' && (
                            <button onClick={() => abrirNRIMarketplace(tarefa)} disabled={abrindoNRI === tarefa.id}
                              className="w-full bg-cobeb-navy hover:bg-cobeb-blue disabled:opacity-50 text-white text-xs font-semibold py-2.5 rounded-xl transition-colors flex items-center justify-center gap-1.5">
                              {abrindoNRI === tarefa.id
                                ? <div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                                : <><FileText size={13} />Gerar NRI</>}
                            </button>
                          )}
                        </>
                      ) : (
                        <>
                      {tarefa.status === 'pendente' && (
                        portariaMap[tarefa.viagem?.id] === 'aguardando' ? (
                          <div className="space-y-2">
                            <div className="flex items-center gap-2 bg-blue-500/10 border border-blue-500/30 rounded-xl px-3 py-2.5">
                              <Clock size={13} className="text-blue-400 shrink-0" />
                              <p className="text-blue-400 text-xs flex-1">Aguardando entrada portaria</p>
                              <button
                                onClick={() => verificarPortaria(tarefa)}
                                disabled={verificando === tarefa.id}
                                className="text-cobeb-yellow text-xs font-semibold flex items-center gap-1 hover:text-cobeb-blue transition-colors shrink-0">
                                {verificando === tarefa.id
                                  ? <div className="w-3 h-3 border border-cobeb-yellow/40 border-t-cobeb-yellow rounded-full animate-spin" />
                                  : <RefreshCw size={11} />}
                                Verificar
                              </button>
                            </div>
                            {profile?.acesso_total && (
                              <button onClick={() => finalizarSemConferencia(tarefa)} disabled={finalizandoSem === tarefa.id}
                                className="w-full bg-slate-700 hover:bg-slate-800 disabled:opacity-50 text-white text-xs font-semibold py-2.5 rounded-xl transition-colors flex items-center justify-center gap-1.5">
                                {finalizandoSem === tarefa.id
                                  ? <div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                                  : 'Finalizar sem conferência'}
                              </button>
                            )}
                          </div>
                        ) : profile?.acesso_total ? (
                          <div className="flex gap-2">
                            <button onClick={() => iniciarConferencia(tarefa)} disabled={iniciando === tarefa.id}
                              className="flex-1 bg-blue-500 hover:bg-blue-600 disabled:opacity-50 text-white text-xs font-semibold py-2.5 rounded-xl transition-colors flex items-center justify-center gap-1.5">
                              {iniciando === tarefa.id
                                ? <div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                                : <><AlertCircle size={13} />Iniciar Conferência</>}
                            </button>
                            <button onClick={() => finalizarSemConferencia(tarefa)} disabled={finalizandoSem === tarefa.id}
                              className="bg-slate-700 hover:bg-slate-800 disabled:opacity-50 text-white text-xs font-semibold px-3 py-2.5 rounded-xl transition-colors flex items-center justify-center shrink-0">
                              {finalizandoSem === tarefa.id
                                ? <div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                                : 'Finalizar'}
                            </button>
                          </div>
                        ) : (
                          <button onClick={() => iniciarConferencia(tarefa)} disabled={iniciando === tarefa.id}
                            className="w-full bg-blue-500 hover:bg-blue-600 disabled:opacity-50 text-white text-xs font-semibold py-2.5 rounded-xl transition-colors flex items-center justify-center gap-1.5">
                            {iniciando === tarefa.id
                              ? <div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                              : <><AlertCircle size={13} />Iniciar Conferência</>}
                          </button>
                        )
                      )}
                      {tarefa.status === 'em_andamento' && (
                        profile?.acesso_total ? (
                          <div className="flex gap-2">
                            <button onClick={() => openConferencia(tarefa)}
                              className="flex-1 bg-cobeb-navy hover:bg-cobeb-blue text-white text-xs font-semibold py-2.5 rounded-xl transition-colors flex items-center justify-center gap-1.5">
                              <Package size={13} />Continuar Conferência
                            </button>
                            <button onClick={() => finalizarSemConferencia(tarefa)} disabled={finalizandoSem === tarefa.id}
                              className="bg-slate-700 hover:bg-slate-800 disabled:opacity-50 text-white text-xs font-semibold px-3 py-2.5 rounded-xl transition-colors flex items-center justify-center shrink-0">
                              {finalizandoSem === tarefa.id
                                ? <div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                                : 'Finalizar'}
                            </button>
                          </div>
                        ) : (
                          <button onClick={() => openConferencia(tarefa)}
                            className="w-full bg-cobeb-navy hover:bg-cobeb-blue text-white text-xs font-semibold py-2.5 rounded-xl transition-colors flex items-center justify-center gap-1.5">
                            <Package size={13} />Continuar Conferência
                          </button>
                        )
                      )}
                      {tarefa.status === 'concluida' && (
                        <div className="flex gap-2">
                          <button onClick={() => openConferencia(tarefa)}
                            className="flex-1 bg-[#EBF5FF] border border-green-500/30 hover:border-green-500/60 text-green-400 text-xs font-semibold py-2.5 rounded-xl transition-colors flex items-center justify-center gap-1.5">
                            <CheckCircle size={13} />Ver Conferência
                          </button>
                          <button
                            onClick={() => abrirNRI(tarefa)}
                            disabled={abrindoNRI === tarefa.id}
                            className="flex-1 bg-cobeb-navy hover:bg-cobeb-blue disabled:opacity-50 text-white text-xs font-semibold py-2.5 rounded-xl transition-colors flex items-center justify-center gap-1.5">
                            {abrindoNRI === tarefa.id
                              ? <div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                              : <><FileText size={13} />Gerar NRI</>}
                          </button>
                        </div>
                      )}
                        </>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}

// ── ConferenciaView ────────────────────────────────────────────────────────────

function ConferenciaView({
  tarefa, pedidos, itenState, anomalias,
  loadingConf, concluindo, todosConferidos, divergencias, divergenciasSemAnomalia,
  onBack, onSetEntrada, onSalvarEntrada, onAdicionarEntrada, onRemoverEntrada,
  onConcluir, onAbrirAnomalia, signOut,
  isAdminEdit,
}) {
  const concluida = tarefa.status === 'concluida'
  const readOnly = concluida && !isAdminEdit
  const [confUnidade, setConfUnidade] = useState({})

  function getUnidade(pedidoId) {
    return confUnidade[pedidoId] ?? 'PLT'
  }

  function switchUnidade(pedidoId, u) {
    const entries = itenState[pedidoId] ?? []
    setConfUnidade(prev => ({ ...prev, [pedidoId]: u }))
    entries.forEach(e => {
      onSetEntrada(pedidoId, e._id, 'qtde_recebida', '')
      onSetEntrada(pedidoId, e._id, 'cxInput', '')
    })
  }

  function handleCxInput(pedidoId, localId, val, cxPallet) {
    onSetEntrada(pedidoId, localId, 'cxInput', val)
    const cx = Number(val)
    if (cx > 0 && cxPallet) {
      onSetEntrada(pedidoId, localId, 'qtde_recebida', String(cx / cxPallet))
    } else {
      onSetEntrada(pedidoId, localId, 'qtde_recebida', '')
    }
  }

  return (
    <div className="min-h-screen bg-[#EBF5FF]">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-cobeb-navy border-b border-blue-800 px-4 py-3 shadow-md shadow-cobeb-navy/20">
        <div className="flex items-center gap-3 mb-2">
          <button onClick={onBack} className="text-blue-300/70 hover:text-white transition-colors p-1.5 rounded-lg hover:bg-white/10 -ml-1">
            <ChevronLeft size={20} />
          </button>
          <div className="flex-1 min-w-0">
            <p className="text-white text-sm font-semibold truncate">Conferência — NF {tarefa.numero_nf}</p>
            <p className="text-blue-300/60 text-[11px] truncate">
              {tarefa.viagem?.motorista?.nome ?? 'Motorista'}
              {tarefa.viagem?.carreta?.placa && ` · ${tarefa.viagem.carreta.placa}`}
              {tarefa.viagem?.cavalo?.placa  && ` / ${tarefa.viagem.cavalo.placa}`}
            </p>
          </div>
          <button onClick={() => signOut()} className="text-blue-300/70 hover:text-white transition-colors p-1.5 rounded-lg hover:bg-white/10">
            <LogOut size={16} />
          </button>
        </div>
        <div className="flex items-center gap-3 text-[10px] text-blue-300/60 flex-wrap">
          <span className="flex items-center gap-1">
            <Clock size={9} />
            Chegada: {formatTs(tarefa.viagem?.dt_chegada_revenda) ?? formatTs(tarefa.created_at)}
          </span>
          {tarefa.viagem?.horario_agendado && <span>Agend.: {tarefa.viagem.horario_agendado}</span>}
          {concluida && (
            <span className="text-green-400 flex items-center gap-1">
              <CheckCircle size={9} />Concluída
            </span>
          )}
        </div>
      </header>

      {/* Body */}
      <main>
        {loadingConf ? (
          <div className="flex justify-center py-16">
            <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="max-w-lg mx-auto px-4 pt-5 pb-32 space-y-6">

            {/* Summary strip */}
            <div className="bg-white rounded-2xl border border-cobeb-border px-4 py-3 flex items-center justify-between">
              <span className="text-xs text-slate-500 flex items-center gap-2">
                <Package size={13} className="text-cobeb-yellow" />
                <span className="text-cobeb-text font-semibold">{pedidos.length}</span> produto(s)
              </span>
              {divergencias.length > 0 && (
                <span className="text-[11px] text-cobeb-yellow flex items-center gap-1.5">
                  <AlertTriangle size={12} />{divergencias.length} divergência(s)
                </span>
              )}
            </div>

            {/* Products */}
            <section>
              <p className="text-[11px] text-slate-500 font-semibold uppercase tracking-widest mb-3 px-1">
                Produtos a Conferir
              </p>
              <div className="space-y-3">
                {pedidos.map(pedido => {
                  const entries   = itenState[pedido.id] ?? []
                  const cxPallet  = pedido.qtde_pallets > 0 ? pedido.qtde_skus / pedido.qtde_pallets : null
                  const unidade   = getUnidade(pedido.id)
                  const totalRec  = entries.reduce((s, e) => s + (Number(e.qtde_recebida) || 0), 0)
                  const hasAnyQty = entries.some(e => e.qtde_recebida && Number(e.qtde_recebida) > 0)
                  const cxRec     = hasAnyQty ? calcCaixas(totalRec, pedido) : null
                  const hasDiverg = hasAnyQty && Math.abs(totalRec - Number(pedido.qtde_pallets)) > 0.001
                  const anomaliaRegistrada = hasDiverg && anomalias.some(a => a.pedido_id === pedido.id)

                  return (
                    <div key={pedido.id}
                      className={`rounded-2xl border overflow-hidden bg-white ${hasDiverg ? 'border-orange-500/50' : 'border-cobeb-border'}`}>
                      {/* Product header */}
                      <div className="px-4 pt-3 pb-2.5 border-b border-cobeb-border/60">
                        <div className="flex items-start gap-2">
                          {pedido.curva && (
                            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded leading-none shrink-0 mt-0.5 ${
                              pedido.curva === 'A' ? 'bg-cobeb-navy/10 text-cobeb-yellow' :
                              pedido.curva === 'B' ? 'bg-blue-500/20 text-blue-400' :
                              'bg-[#1E3A5F]/50 text-slate-500'
                            }`}>{pedido.curva}</span>
                          )}
                          <div className="min-w-0 flex-1">
                            <p className="text-cobeb-text text-xs font-medium leading-snug">{pedido.descricao}</p>
                            <p className="text-slate-500 text-[10px] font-mono mt-0.5">
                              {pedido.cod_produto}{pedido.embalagem ? ` · ${pedido.embalagem}` : ''}
                            </p>
                          </div>
                          {!readOnly && (
                            <div className="flex rounded-lg border border-cobeb-border overflow-hidden text-[10px] font-bold shrink-0">
                              {['PLT', 'CX'].map(u => (
                                <button key={u} type="button"
                                  disabled={u === 'CX' && !cxPallet}
                                  title={u === 'CX' && !cxPallet ? 'Conversão indisponível — use PLT' : undefined}
                                  onClick={() => switchUnidade(pedido.id, u)}
                                  className={`px-2.5 py-1 transition-colors ${
                                    u === 'CX' && !cxPallet
                                      ? 'bg-white text-slate-300 cursor-not-allowed'
                                      : unidade === u
                                        ? 'bg-cobeb-navy text-white'
                                        : 'bg-white text-slate-500 hover:bg-[#EBF5FF]'
                                  }`}>
                                  {u}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Quantities */}
                      <div className="px-4 py-3 space-y-2.5">
                        {/* Esperado */}
                        <div className="flex items-center justify-between">
                          <span className="text-slate-500 text-[11px]">Esperado</span>
                          <span className="text-xs">
                            <span className="text-cobeb-text font-semibold">
                              {Number(pedido.qtde_pallets).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}
                            </span>
                            <span className="text-slate-500"> plt · </span>
                            <span className="text-slate-400">
                              {Number(pedido.qtde_skus).toLocaleString('pt-BR')} cx
                            </span>
                          </span>
                        </div>

                        {/* Recebido — múltiplas entradas (qty + data) */}
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-slate-500 text-[11px]">Recebido</span>
                            {entries.length > 1 && hasAnyQty && (
                              <span className="text-cobeb-text text-[10px] font-semibold">
                                Total: {totalRec.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} plt
                                {cxRec !== null && ` = ${cxRec.toLocaleString('pt-BR')} cx`}
                              </span>
                            )}
                          </div>
                          {entries.map(entry => (
                            <div key={entry._id} className="flex items-center gap-1.5">
                              {unidade === 'CX' ? (
                                <input
                                  type="number" min="1" step="1" placeholder="0"
                                  disabled={readOnly}
                                  value={entry.cxInput ?? ''}
                                  onChange={e => handleCxInput(pedido.id, entry._id, e.target.value, cxPallet)}
                                  onBlur={() => onSalvarEntrada(pedido.id, entry._id)}
                                  className={`w-16 text-right bg-[#EBF5FF] border rounded-xl px-2 py-1.5 text-xs text-cobeb-text focus:outline-none focus:border-cobeb-blue transition-colors ${
                                    hasDiverg ? 'border-orange-500/60' : 'border-cobeb-border'
                                  } disabled:opacity-50 disabled:cursor-default`}
                                />
                              ) : (
                                <input
                                  type="number" min="0" step="0.5" placeholder="0"
                                  disabled={readOnly}
                                  value={entry.qtde_recebida ?? ''}
                                  onChange={e => onSetEntrada(pedido.id, entry._id, 'qtde_recebida', e.target.value)}
                                  onBlur={() => onSalvarEntrada(pedido.id, entry._id)}
                                  className={`w-16 text-right bg-[#EBF5FF] border rounded-xl px-2 py-1.5 text-xs text-cobeb-text focus:outline-none focus:border-cobeb-blue transition-colors ${
                                    hasDiverg ? 'border-orange-500/60' : 'border-cobeb-border'
                                  } disabled:opacity-50 disabled:cursor-default`}
                                />
                              )}
                              <span className="text-slate-500 text-[11px] shrink-0">{unidade === 'CX' ? 'cx' : 'plt'}</span>
                              <input
                                type="date"
                                disabled={readOnly}
                                value={entry.data_validade ?? ''}
                                onChange={e => onSetEntrada(pedido.id, entry._id, 'data_validade', e.target.value)}
                                onBlur={() => onSalvarEntrada(pedido.id, entry._id)}
                                className="flex-1 min-w-0 bg-[#EBF5FF] border border-cobeb-border rounded-xl px-2 py-1.5 text-xs text-cobeb-text focus:outline-none focus:border-cobeb-blue transition-colors disabled:opacity-50 disabled:cursor-default [color-scheme:light]"
                              />
                              {!readOnly && entries.length > 1 && (
                                <button
                                  onClick={() => onRemoverEntrada(pedido.id, entry._id)}
                                  className="text-slate-400 hover:text-red-400 transition-colors shrink-0 p-0.5">
                                  <X size={12} />
                                </button>
                              )}
                            </div>
                          ))}
                          {!readOnly && (
                            <button
                              onClick={() => onAdicionarEntrada(pedido.id)}
                              className="flex items-center gap-1 text-[10px] text-cobeb-navy/70 hover:text-cobeb-navy font-semibold transition-colors">
                              <Plus size={11} />Adicionar data
                            </button>
                          )}
                        </div>

                        {/* Divergence alert */}
                        {hasDiverg && (
                          <div className={`flex items-center gap-2 rounded-xl px-3 py-2 border ${
                            anomaliaRegistrada
                              ? 'bg-green-500/10 border-green-500/30'
                              : 'bg-cobeb-navy/10 border-orange-500/30'
                          }`}>
                            {anomaliaRegistrada
                              ? <CheckCircle size={11} className="text-green-500 shrink-0" />
                              : <AlertTriangle size={11} className="text-cobeb-yellow shrink-0" />}
                            <p className={`text-[10px] flex-1 ${anomaliaRegistrada ? 'text-green-400' : 'text-cobeb-yellow'}`}>
                              Esperado {Number(pedido.qtde_pallets).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} plt,
                              recebido {totalRec.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} plt
                              {anomaliaRegistrada && ' · Anomalia registrada'}
                            </p>
                            {!readOnly && !anomaliaRegistrada && (
                              <button onClick={() => onAbrirAnomalia(pedido.id)}
                                className="text-[10px] text-cobeb-yellow font-semibold underline whitespace-nowrap shrink-0">
                                Registrar Anomalia
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </section>

            {/* Anomalias */}
            <section>
              <div className="flex items-center justify-between mb-3 px-1">
                <p className="text-[11px] text-slate-500 font-semibold uppercase tracking-widest">
                  Anomalias{anomalias.length > 0 ? ` (${anomalias.length})` : ''}
                </p>
                {!readOnly && (
                  <button onClick={onAbrirAnomalia}
                    className="flex items-center gap-1 text-[11px] text-cobeb-yellow hover:text-orange-300 font-semibold transition-colors">
                    <Plus size={12} />Nova Anomalia
                  </button>
                )}
              </div>

              {anomalias.length === 0 ? (
                <div className="bg-white rounded-2xl border border-cobeb-border px-4 py-5 text-center">
                  <p className="text-slate-500 text-xs">Nenhuma anomalia registrada</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {anomalias.map(ano => (
                    <div key={ano.id} className="bg-white rounded-2xl border border-orange-500/20 overflow-hidden">
                      <div className="px-4 py-3">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          {ano.tipo === 'inversao'
                            ? <span className="text-[10px] font-semibold bg-orange-500/10 text-orange-400 border border-orange-500/20 px-2 py-0.5 rounded-full">Inversão de Produto</span>
                            : <span className="text-[10px] font-semibold bg-red-500/10 text-red-400 border border-red-500/20 px-2 py-0.5 rounded-full">Problema de Qualidade</span>
                          }
                        </div>
                        {ano.pedido && (
                          <p className="text-slate-500 text-[10px] mb-1 font-mono">
                            {ano.pedido.cod_produto} — {ano.pedido.descricao}
                          </p>
                        )}
                        <p className="text-cobeb-text text-xs">{ano.descricao}</p>
                        {ano.substituto_codigo && (
                          <div className="mt-2 bg-[#EBF5FF] rounded-xl px-3 py-2 border border-cobeb-border">
                            <p className="text-[10px] font-semibold text-cobeb-navy uppercase tracking-widest mb-0.5">Substituto recebido</p>
                            <p className="text-cobeb-text text-xs font-mono font-semibold">{ano.substituto_codigo}</p>
                            {ano.substituto_descricao && <p className="text-slate-500 text-[10px]">{ano.substituto_descricao}</p>}
                            {ano.substituto_qtde_pallets != null && (
                              <p className="text-cobeb-yellow text-xs font-semibold mt-0.5">
                                {Number(ano.substituto_qtde_pallets).toLocaleString('pt-BR')} plt
                                {ano.substituto_qtde_caixas != null && ` · ${Number(ano.substituto_qtde_caixas).toLocaleString('pt-BR')} cx`}
                              </p>
                            )}
                            {ano.substituto_data_validade && (
                              <p className="text-slate-500 text-[10px] mt-0.5">Val: {new Date(ano.substituto_data_validade + 'T12:00:00').toLocaleDateString('pt-BR')}</p>
                            )}
                          </div>
                        )}
                        <p className="text-slate-500 text-[10px] mt-1">{formatTs(ano.created_at)}</p>
                      </div>
                      {ano.fotos?.length > 0 && (
                        <div className="flex gap-2 px-4 pb-3">
                          {ano.fotos.map((url, i) => (
                            <a key={i} href={url} target="_blank" rel="noopener noreferrer"
                              className="w-16 h-16 rounded-xl overflow-hidden border border-cobeb-border shrink-0 hover:border-cobeb-blue/40 transition-colors">
                              <img src={url} alt={`Foto ${i + 1}`} className="w-full h-full object-cover" />
                            </a>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        )}
      </main>

      {/* Footer */}
      {!readOnly && (
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-cobeb-border px-4 py-3 z-30">
          <div className="max-w-lg mx-auto">
            {!todosConferidos && (
              <p className="text-slate-500 text-[10px] text-center mb-2">
                Preencha a quantidade recebida de todos os produtos para concluir
              </p>
            )}
            {todosConferidos && divergenciasSemAnomalia.length > 0 && (
              <p className="text-orange-400 text-[10px] text-center mb-2 flex items-center justify-center gap-1">
                <AlertTriangle size={11} />
                {divergenciasSemAnomalia.length === 1
                  ? '1 produto com diferença aguarda apontamento de anomalia'
                  : `${divergenciasSemAnomalia.length} produtos com diferença aguardam apontamento de anomalia`}
              </p>
            )}
            <button
              onClick={onConcluir}
              disabled={!todosConferidos || concluindo || divergenciasSemAnomalia.length > 0}
              className="w-full bg-green-600 hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold py-3 rounded-2xl transition-colors flex items-center justify-center gap-2"
            >
              {concluindo
                ? <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                : <><CheckCircle size={16} />{concluida ? 'Atualizar Conferência' : 'Concluir Conferência'}</>}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── AnomaliaModal ─────────────────────────────────────────────────────────────

function AnomaliaModal({ form, pedidos, fotoRefs, salvando, onClose, onSave, onFotoSelect, onChange, onBuscarSubstituto }) {
  const uploading = form.uploading.some(Boolean)
  const canSave   = form.descricao.trim() && !uploading && !salvando

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-white rounded-t-3xl border-t border-cobeb-border px-5 pt-4 pb-8 max-h-[92vh] overflow-y-auto">
        <div className="w-10 h-1 bg-[#1E3A5F] rounded-full mx-auto mb-4" />

        <div className="flex items-center justify-between mb-5">
          <p className="text-cobeb-text font-semibold text-sm">Nova Anomalia</p>
          <button onClick={onClose} className="text-slate-500 hover:text-white p-1 transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-5">
          {/* Tipo de anomalia */}
          <div>
            <label className="text-slate-500 text-[11px] font-semibold uppercase tracking-widest block mb-2">Tipo de anomalia <span className="text-cobeb-yellow">*</span></label>
            <div className="flex gap-2">
              {[
                { key: 'qualidade', label: 'Problema de Qualidade' },
                { key: 'inversao', label: 'Inversão de Produto' },
              ].map(({ key, label }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => onChange(f => ({
                    ...f, tipo: key,
                    sub_codigo: '', sub_descricao: null, sub_erro: null,
                    sub_qtde_pallets: '', sub_qtde_caixas: null, sub_caixas_pallet: null, sub_data_validade: '',
                  }))}
                  className={`flex-1 py-2.5 rounded-xl text-xs font-semibold border transition-colors ${
                    form.tipo === key
                      ? 'bg-cobeb-navy text-white border-cobeb-navy'
                      : 'bg-white text-slate-500 border-cobeb-border hover:border-cobeb-blue/50'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Product selector */}
          <div>
            <label className="text-slate-500 text-[11px] font-semibold uppercase tracking-widest block mb-2">Produto</label>
            <select
              value={form.pedido_id}
              onChange={e => onChange(f => ({ ...f, pedido_id: e.target.value }))}
              className="w-full bg-[#EBF5FF] border border-cobeb-border rounded-xl px-3 py-2.5 text-xs text-cobeb-text focus:outline-none focus:border-cobeb-blue transition-colors"
            >
              <option value="">— Selecione (opcional) —</option>
              {pedidos.map(p => (
                <option key={p.id} value={p.id}>{p.cod_produto} — {p.descricao}</option>
              ))}
            </select>
          </div>

          {/* Description */}
          <div>
            <label className="text-slate-500 text-[11px] font-semibold uppercase tracking-widest block mb-2">
              Problema <span className="text-cobeb-yellow">*</span>
            </label>
            <textarea
              rows={3}
              placeholder="Descreva o problema encontrado..."
              value={form.descricao}
              onChange={e => onChange(f => ({ ...f, descricao: e.target.value }))}
              className="w-full bg-[#EBF5FF] border border-cobeb-border rounded-xl px-3 py-2.5 text-xs text-cobeb-text placeholder-slate-400 focus:outline-none focus:border-cobeb-blue transition-colors resize-none"
            />
          </div>

          {/* Lote */}
          <div>
            <label className="text-slate-500 text-[11px] font-semibold uppercase tracking-widest block mb-2">
              Lote do produto
            </label>
            <input
              type="text"
              placeholder="Ex: L240610"
              value={form.lote}
              onChange={e => onChange(f => ({ ...f, lote: e.target.value }))}
              className="w-full bg-[#EBF5FF] border border-cobeb-border rounded-xl px-3 py-2.5 text-xs text-cobeb-text placeholder-slate-400 focus:outline-none focus:border-cobeb-blue transition-colors"
            />
          </div>

          {/* Produto substituto — só para inversão */}
          {form.tipo === 'inversao' && <div className="bg-[#EBF5FF] rounded-2xl p-4 space-y-3 border border-cobeb-border">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-cobeb-navy">Produto recebido no lugar</p>

            {/* Código */}
            <div>
              <label className="text-slate-500 text-[11px] font-semibold uppercase tracking-widest block mb-1.5">Código do produto substituto</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Ex: 38026"
                  value={form.sub_codigo}
                  onChange={e => onChange(f => ({ ...f, sub_codigo: e.target.value, sub_descricao: null, sub_erro: null }))}
                  onBlur={() => onBuscarSubstituto(form.sub_codigo)}
                  className="flex-1 bg-white border border-cobeb-border rounded-xl px-3 py-2.5 text-xs text-cobeb-text placeholder-slate-400 focus:outline-none focus:border-cobeb-blue transition-colors font-mono"
                />
                <button
                  type="button"
                  onClick={() => onBuscarSubstituto(form.sub_codigo)}
                  disabled={form.sub_buscando || !form.sub_codigo.trim()}
                  className="px-3 py-2.5 bg-cobeb-navy text-white text-xs font-semibold rounded-xl disabled:opacity-40 transition-colors"
                >
                  {form.sub_buscando ? '...' : 'Buscar'}
                </button>
              </div>
              {form.sub_descricao && (
                <p className="text-cobeb-text text-xs mt-1.5 font-medium">{form.sub_descricao}</p>
              )}
              {form.sub_erro && (
                <p className="text-red-400 text-xs mt-1.5">{form.sub_erro}</p>
              )}
            </div>

            {/* Quantidade + Data validade */}
            {form.sub_descricao && (
              <div className="space-y-3">
                <div>
                  <label className="text-slate-500 text-[11px] font-semibold uppercase tracking-widest block mb-1.5">Quantidade recebida (paletes)</label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    placeholder="0"
                    value={form.sub_qtde_pallets}
                    onChange={e => {
                      const v = e.target.value
                      const cx = v && form.sub_caixas_pallet
                        ? Math.round(Number(v) * Number(form.sub_caixas_pallet))
                        : null
                      onChange(f => ({ ...f, sub_qtde_pallets: v, sub_qtde_caixas: cx }))
                    }}
                    className="w-32 bg-white border border-cobeb-border rounded-xl px-3 py-2.5 text-xs text-cobeb-text focus:outline-none focus:border-cobeb-blue transition-colors text-right"
                  />
                  {form.sub_qtde_caixas != null && (
                    <p className="text-slate-500 text-xs mt-1">= {form.sub_qtde_caixas.toLocaleString('pt-BR')} cx</p>
                  )}
                </div>
                <div>
                  <label className="text-slate-500 text-[11px] font-semibold uppercase tracking-widest block mb-1.5">Data de validade</label>
                  <input
                    type="date"
                    value={form.sub_data_validade}
                    onChange={e => onChange(f => ({ ...f, sub_data_validade: e.target.value }))}
                    className="bg-white border border-cobeb-border rounded-xl px-3 py-2.5 text-xs text-cobeb-text focus:outline-none focus:border-cobeb-blue transition-colors [color-scheme:light]"
                  />
                </div>
              </div>
            )}
          </div>}

          {/* Photos */}
          <div>
            <label className="text-slate-500 text-[11px] font-semibold uppercase tracking-widest block mb-2">
              Fotos <span className="text-cobeb-yellow">*</span>
              <span className="text-slate-700 ml-1.5 normal-case tracking-normal font-normal">frente · lateral · fundo · lote</span>
            </label>
            <div className="grid grid-cols-2 gap-3">
              {['Frente', 'Lateral', 'Fundo', 'Lote'].map((label, idx) => {
                const preview  = form.fotos[idx]
                const uploaded = form.fotosUrls[idx]
                const isLoading = form.uploading[idx]
                const erro     = form.erros?.[idx]

                return (
                  <div key={idx} className="flex flex-col gap-1">
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      ref={fotoRefs[idx]}
                      className="hidden"
                      onChange={e => e.target.files[0] && onFotoSelect(e.target.files[0], idx)}
                    />
                    <button
                      type="button"
                      onClick={() => fotoRefs[idx].current?.click()}
                      className={`w-full aspect-square rounded-2xl border-2 flex flex-col items-center justify-center overflow-hidden relative transition-colors ${
                        erro
                          ? 'border-red-500/60 bg-red-500/5'
                          : uploaded
                          ? 'border-green-500/50'
                          : preview
                          ? 'border-cobeb-blue/40'
                          : 'border-cobeb-border hover:border-cobeb-blue/40'
                      }`}
                    >
                      {preview ? (
                        <>
                          <img src={preview} alt={label} className="w-full h-full object-cover" />
                          {isLoading && (
                            <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                              <div className="w-5 h-5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                            </div>
                          )}
                          {uploaded && !isLoading && (
                            <div className="absolute top-1.5 right-1.5 w-5 h-5 bg-green-500 rounded-full flex items-center justify-center">
                              <CheckCircle size={11} className="text-white" />
                            </div>
                          )}
                        </>
                      ) : (
                        <div className="flex flex-col items-center gap-1.5 py-4">
                          {erro
                            ? <AlertCircle size={20} className="text-red-400" />
                            : <Camera size={20} className="text-slate-500" />}
                          <span className={`text-[10px] ${erro ? 'text-red-400' : 'text-slate-500'}`}>{label}</span>
                        </div>
                      )}
                    </button>
                    {erro && (
                      <p className="text-[9px] text-red-400 text-center leading-tight">{erro}</p>
                    )}
                  </div>
                )
              })}
            </div>
            <p className="text-slate-500 text-[10px] mt-1 text-center">
              {form.fotosUrls.filter(Boolean).length} de 4 fotos enviadas
              {form.fotosUrls.filter(Boolean).length === 0 && ' — fotos são opcionais'}
            </p>
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-1">
            <button onClick={onClose}
              className="flex-1 bg-[#EBF5FF] border border-cobeb-border text-slate-400 text-sm font-semibold py-3 rounded-2xl transition-colors">
              Cancelar
            </button>
            <button onClick={onSave} disabled={!canSave}
              className="flex-1 bg-cobeb-navy hover:bg-cobeb-blue disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold py-3 rounded-2xl transition-colors flex items-center justify-center gap-2">
              {salvando
                ? <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                : 'Salvar Anomalia'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
