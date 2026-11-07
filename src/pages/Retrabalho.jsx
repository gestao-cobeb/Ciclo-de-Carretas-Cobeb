import { useState, useEffect, useRef } from 'react'
import {
  RotateCcw, Package, RefreshCw, LogOut, LayoutGrid,
  CheckCircle, Clock, Undo2, Trash2, Play, StopCircle,
  Camera, AlertTriangle, X, AlertCircle, Plus, Search,
  FilePlus, CalendarDays,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

function formatData(iso) {
  if (!iso) return null
  return new Date(iso + 'T12:00:00').toLocaleDateString('pt-BR')
}

function formatTs(iso) {
  if (!iso) return null
  const d = new Date(iso)
  return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

function formatDuracao(inicio, fim) {
  if (!inicio || !fim) return null
  const ms = new Date(fim) - new Date(inicio)
  if (ms <= 0) return null
  const totalMin = Math.floor(ms / 60000)
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  if (h === 0) return `${m}min`
  return `${h}h ${m}min`
}

export default function Retrabalho() {
  const { user, profile, signOut, modoVisao, setModoVisao } = useAuth()
  const navigate = useNavigate()

  const [itens,          setItens]          = useState([])
  const [motivos,        setMotivos]        = useState([])
  const [loading,        setLoading]        = useState(true)
  const [filtro,         setFiltro]         = useState('7dias')
  const [statusFiltro,   setStatusFiltro]   = useState('ativos')
  const [erro,           setErro]           = useState(null)
  const [confirmando,        setConfirmando]        = useState(null)
  const [excluindo,          setExcluindo]          = useState(null)
  const [excluindoConcluido, setExcluindoConcluido] = useState(null)
  const [iniciando,          setIniciando]          = useState(null)
  const [finalizando,    setFinalizando]    = useState(null)
  const [apontamentoItem, setApontamentoItem] = useState(null)
  const [criarModal,      setCriarModal]      = useState(false)

  const podeConfirmarEnvio  = profile?.perfil === 'empilheira' || profile?.acesso_total
  const podeDesfazer        = profile?.acesso_total
  const podeIniciar         = profile?.perfil !== 'empilheira'
  const podeExcluirConcluido = user?.email === 'admin@cobeb.com.br'

  useEffect(() => {
    supabase.from('motivos_blitz').select('id, descricao').eq('ativo', true).order('descricao')
      .then(({ data }) => setMotivos(data ?? []))
  }, [])

  useEffect(() => { load() }, [filtro, statusFiltro])

  async function load() {
    setLoading(true)
    setErro(null)
    let q = supabase
      .from('tarefas_retrabalho')
      .select(`
        id, tarefa_id, qtde_unidades, qtde_paletes, data_validade, descricao_motivo,
        cod_produto, descricao_produto, embalagem_produto,
        numero_nf, motorista_nome, placa_carreta,
        enviado_retrabalho, enviado_em, enviado_por_nome,
        inicio_retrabalho, inicio_por_nome,
        fim_retrabalho, fim_por_nome,
        retrabalho_concluido, criado_manualmente, data_chegada, numero_nri_ref, created_at
      `)
      .eq('retrabalho_concluido', statusFiltro === 'concluidos')
      .order('created_at', { ascending: false })

    if (!profile?.acesso_total && profile?.unidade_id) {
      q = q.eq('unidade_id', profile.unidade_id)
    }

    if (filtro !== 'tudo') {
      const corte = new Date()
      corte.setHours(0, 0, 0, 0)
      if (filtro === '7dias') corte.setDate(corte.getDate() - 6)
      q = q.gte('created_at', corte.toISOString())
    }

    const { data, error } = await q
    if (error) setErro(error.message)
    setItens(data ?? [])
    setLoading(false)
  }

  // ── Envio empilheira ────────────────────────────────────────────────────────

  async function confirmarEnvio(item) {
    setConfirmando(item.id)
    const { error } = await supabase.from('tarefas_retrabalho').update({
      enviado_retrabalho: true,
      enviado_em:         new Date().toISOString(),
      enviado_por_nome:   profile.nome ?? '',
    }).eq('id', item.id)
    if (error) { alert('Erro: ' + error.message); setConfirmando(null); return }
    setItens(prev => prev.map(i => i.id === item.id
      ? { ...i, enviado_retrabalho: true, enviado_em: new Date().toISOString(), enviado_por_nome: profile.nome }
      : i
    ))
    setConfirmando(null)
  }

  async function desfazerEnvio(item) {
    setConfirmando(item.id)
    const { error } = await supabase.from('tarefas_retrabalho').update({
      enviado_retrabalho: false, enviado_em: null, enviado_por_nome: null,
    }).eq('id', item.id)
    if (error) { alert('Erro: ' + error.message); setConfirmando(null); return }
    setItens(prev => prev.map(i => i.id === item.id
      ? { ...i, enviado_retrabalho: false, enviado_em: null, enviado_por_nome: null }
      : i
    ))
    setConfirmando(null)
  }

  // ── Exclusão da blitz ───────────────────────────────────────────────────────

  async function excluirBlitz(item) {
    const label = item.criado_manualmente
      ? `Excluir este retrabalho manual (${item.descricao_produto ?? item.cod_produto})?`
      : `Excluir todos os apontamentos da blitz da NF ${item.numero_nf ?? item.tarefa_id}?\n\nA tarefa voltará como "Blitz Puxada" pendente no módulo de conferência.`
    if (!window.confirm(label)) return
    setExcluindo(item.id)

    if (item.criado_manualmente) {
      const { error } = await supabase.from('tarefas_retrabalho').delete().eq('id', item.id)
      if (error) { alert('Erro ao excluir: ' + error.message); setExcluindo(null); return }
      setItens(prev => prev.filter(i => i.id !== item.id))
    } else {
      const [r1, r2, r3] = await Promise.all([
        supabase.from('tarefas_retrabalho').delete().eq('tarefa_id', item.tarefa_id),
        supabase.from('blitz_apontamentos').delete().eq('tarefa_id', item.tarefa_id),
        supabase.from('tarefas').update({ blitz_concluida: false }).eq('id', item.tarefa_id),
      ])
      const err = r1.error || r2.error || r3.error
      if (err) { alert('Erro ao excluir: ' + err.message); setExcluindo(null); return }
      setItens(prev => prev.filter(i => i.tarefa_id !== item.tarefa_id))
    }
    setExcluindo(null)
  }

  // ── Exclusão permanente de concluído (somente admin@cobeb.com.br) ───────────

  async function excluirConcluido(item) {
    if (!window.confirm(`Excluir permanentemente este retrabalho concluído (${item.descricao_produto ?? item.cod_produto})?\n\nEsta ação não pode ser desfeita.`)) return
    setExcluindoConcluido(item.id)
    const { error: e1 } = await supabase.from('retrabalho_apontamentos').delete().eq('tarefas_retrabalho_id', item.id)
    if (e1) { alert('Erro ao excluir apontamentos: ' + e1.message); setExcluindoConcluido(null); return }
    const { error: e2 } = await supabase.from('tarefas_retrabalho').delete().eq('id', item.id)
    if (e2) { alert('Erro ao excluir retrabalho: ' + e2.message); setExcluindoConcluido(null); return }
    setItens(prev => prev.filter(i => i.id !== item.id))
    setExcluindoConcluido(null)
  }

  // ── Workflow de retrabalho ──────────────────────────────────────────────────

  async function iniciarRetrabalho(item) {
    if (!window.confirm('Confirmar início do retrabalho deste palete?')) return
    setIniciando(item.id)
    const { error } = await supabase.from('tarefas_retrabalho').update({
      inicio_retrabalho: new Date().toISOString(),
      inicio_por_nome:   profile.nome ?? '',
    }).eq('id', item.id)
    if (error) { alert('Erro: ' + error.message); setIniciando(null); return }
    setItens(prev => prev.map(i => i.id === item.id
      ? { ...i, inicio_retrabalho: new Date().toISOString(), inicio_por_nome: profile.nome }
      : i
    ))
    setIniciando(null)
  }

  async function finalizarRetrabalho(item) {
    if (!window.confirm('Confirmar fim do retrabalho deste palete?')) return
    setFinalizando(item.id)
    const { error } = await supabase.from('tarefas_retrabalho').update({
      fim_retrabalho: new Date().toISOString(),
      fim_por_nome:   profile.nome ?? '',
    }).eq('id', item.id)
    if (error) { alert('Erro: ' + error.message); setFinalizando(null); return }
    const updated = { ...item, fim_retrabalho: new Date().toISOString(), fim_por_nome: profile.nome }
    setItens(prev => prev.map(i => i.id === item.id ? updated : i))
    setFinalizando(null)
    setApontamentoItem(updated)
  }

  async function salvarApontamento(item, form) {
    const { error: apoErr } = await supabase.from('retrabalho_apontamentos').insert({
      tarefas_retrabalho_id: item.id,
      sem_anomalia:          form.semAnomalia,
      motivo_id:             form.semAnomalia ? null : (form.motivoId || null),
      descricao_motivo:      form.semAnomalia ? null : (motivos.find(m => m.id === form.motivoId)?.descricao ?? null),
      qtde_avariada:         form.semAnomalia ? null : (form.qtdeAvariada ? Number(form.qtdeAvariada) : null),
      fotos:                 form.fotosUrls.filter(Boolean),
      apontado_por_nome:     profile.nome ?? '',
    })
    if (apoErr) { alert('Erro ao salvar: ' + apoErr.message); return false }
    const { error: updErr } = await supabase.from('tarefas_retrabalho')
      .update({ retrabalho_concluido: true }).eq('id', item.id)
    if (updErr) { alert('Erro ao concluir: ' + updErr.message); return false }
    setItens(prev => prev.filter(i => i.id !== item.id))
    setApontamentoItem(null)
    return true
  }

  // ── Criação manual ─────────────────────────────────────────────────────────

  async function criarRetrabalho(form) {
    const motivo = motivos.find(m => m.id === form.motivoId)
    const { data, error } = await supabase.from('tarefas_retrabalho').insert({
      tarefa_id:            null,
      conferencia_item_id:  null,
      pedido_id:            null,
      cod_produto:          form.codProduto      ?? null,
      descricao_produto:    form.descricaoProduto ?? null,
      embalagem_produto:    form.embalagemproduto ?? null,
      qtde_paletes:         1,
      qtde_unidades:        null,
      motivo_id:            form.motivoId,
      descricao_motivo:     motivo?.descricao ?? '',
      data_chegada:         form.dataChegada,
      numero_nri_ref:       form.numeroNri ? Number(form.numeroNri) : null,
      unidade_id:           profile?.unidade_id ?? null,
      criado_manualmente:   true,
      numero_nf:            form.nriNumeroNf  ?? null,
      motorista_nome:       form.nriMotorista ?? null,
      placa_carreta:        form.nriPlaca     ?? null,
    }).select().single()
    if (error) { alert('Erro ao criar: ' + error.message); return false }
    setItens(prev => [data, ...prev])
    setCriarModal(false)
    return true
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-[#EBF5FF]">

      {/* Header */}
      <header className="sticky top-0 z-40 bg-cobeb-navy border-b border-blue-800 px-3 py-2 sm:px-5 sm:py-3.5 flex items-center justify-between shadow-md shadow-cobeb-navy/20">
        <div className="flex items-center gap-2 min-w-0">
          <RotateCcw size={16} className="text-purple-400 shrink-0" />
          <p className="text-white text-sm font-semibold truncate">Retrabalho</p>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={load}
            className="text-blue-300/70 hover:text-white transition-colors p-1.5 rounded-lg hover:bg-white/10">
            <RefreshCw size={16} />
          </button>
          {modoVisao && (
            <button onClick={() => { setModoVisao(null); navigate('/selecionar-modulo') }}
              className="text-cobeb-yellow hover:text-white transition-colors p-1.5 rounded-lg hover:bg-white/10"
              title="Trocar Módulo">
              <LayoutGrid size={16} />
            </button>
          )}
          <button onClick={signOut}
            className="text-blue-300/70 hover:text-white transition-colors p-1.5 rounded-lg hover:bg-white/10">
            <LogOut size={16} />
          </button>
        </div>
      </header>

      {/* Body */}
      <main className="max-w-lg mx-auto px-4 pt-4 pb-8 space-y-3">

        {/* Toggle Ativos / Concluídos + botão retrabalho manual */}
        <div className="flex items-center gap-2">
          <div className="flex flex-1 rounded-2xl border border-cobeb-border overflow-hidden text-xs font-semibold bg-white">
            {[
              { value: 'ativos',     label: 'Ativos' },
              { value: 'concluidos', label: 'Concluídos' },
            ].map(({ value, label }) => (
              <button key={value} onClick={() => setStatusFiltro(value)}
                className={`flex-1 py-2.5 transition-colors ${
                  statusFiltro === value
                    ? 'bg-cobeb-navy text-white'
                    : 'text-slate-500 hover:bg-[#EBF5FF]'
                }`}>
                {label}
              </button>
            ))}
          </div>
          <button onClick={() => setCriarModal(true)}
            className="flex items-center gap-1.5 bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold px-3 py-2.5 rounded-2xl transition-colors shrink-0">
            <Plus size={13} />
            Manual
          </button>
        </div>

        {/* Filtro período + count */}
        <div className="flex items-center justify-between gap-3">
          <p className="text-cobeb-text text-sm font-semibold">
            {!loading && <span className="text-slate-500 font-normal">{itens.length} palete(s)</span>}
          </p>
          <div className="flex rounded-xl border border-cobeb-border overflow-hidden text-xs font-semibold bg-white">
            {[
              { value: 'hoje',  label: 'Hoje' },
              { value: '7dias', label: '7 dias' },
              { value: 'tudo',  label: 'Tudo' },
            ].map(({ value, label }) => (
              <button key={value} onClick={() => setFiltro(value)}
                className={`px-3 py-1.5 transition-colors ${
                  filtro === value ? 'bg-cobeb-navy text-white' : 'text-slate-500 hover:bg-[#EBF5FF]'
                }`}>
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Erro */}
        {erro && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-2xl px-4 py-3 text-red-400 text-xs">
            {erro}
          </div>
        )}

        {/* Lista */}
        {loading ? (
          <div className="flex justify-center py-16">
            <div className="w-7 h-7 border-2 border-purple-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : !erro && itens.length === 0 ? (
          <div className="bg-white rounded-2xl border border-cobeb-border px-5 py-12 text-center">
            <div className="w-14 h-14 rounded-2xl bg-purple-600/10 border border-purple-600/20 flex items-center justify-center mx-auto mb-4">
              <RotateCcw size={22} className="text-purple-600" />
            </div>
            <p className="text-cobeb-text font-semibold text-sm">
              {statusFiltro === 'concluidos' ? 'Nenhum retrabalho concluído no período' : 'Nenhum palete no período'}
            </p>
            <p className="text-slate-500 text-xs mt-1">
              {statusFiltro === 'ativos' && 'Paletes com anomalia na blitz de puxada aparecem aqui'}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {itens.map(item => {
              const enviado    = !!item.enviado_retrabalho
              const iniciado   = !!item.inicio_retrabalho
              const finalizado = !!item.fim_retrabalho
              const concluido  = !!item.retrabalho_concluido
              const carregando = confirmando === item.id
              const removendo  = excluindo   === item.id
              const emInicio   = iniciando   === item.id
              const emFim      = finalizando === item.id

              return (
                <div key={item.id} className={`bg-white rounded-2xl border overflow-hidden ${
                  concluido  ? 'border-green-500/30'  :
                  finalizado ? 'border-purple-500/40' :
                  iniciado   ? 'border-yellow-500/40' :
                  enviado    ? 'border-blue-500/30'   :
                  'border-purple-500/20'
                }`}>

                  {/* Produto */}
                  <div className="px-4 pt-3 pb-2.5 border-b border-cobeb-border/50 flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-cobeb-text text-xs font-medium leading-snug">
                        {item.descricao_produto ?? 'Produto'}
                      </p>
                      <p className="text-slate-500 text-[10px] font-mono mt-0.5">
                        {item.cod_produto}
                        {item.embalagem_produto ? ` · ${item.embalagem_produto}` : ''}
                      </p>
                    </div>
                    {podeDesfazer && !enviado && !concluido && (
                      <button onClick={() => excluirBlitz(item)} disabled={removendo}
                        className="text-slate-300 hover:text-red-400 transition-colors p-1 shrink-0 disabled:opacity-40"
                        title="Excluir blitz">
                        {removendo
                          ? <div className="w-3.5 h-3.5 border-2 border-red-400/40 border-t-red-400 rounded-full animate-spin" />
                          : <Trash2 size={14} />}
                      </button>
                    )}
                    {podeExcluirConcluido && concluido && (
                      <button onClick={() => excluirConcluido(item)} disabled={excluindoConcluido === item.id}
                        className="text-slate-300 hover:text-red-400 transition-colors p-1 shrink-0 disabled:opacity-40"
                        title="Excluir permanentemente">
                        {excluindoConcluido === item.id
                          ? <div className="w-3.5 h-3.5 border-2 border-red-400/40 border-t-red-400 rounded-full animate-spin" />
                          : <Trash2 size={14} />}
                      </button>
                    )}
                  </div>

                  {/* Detalhes */}
                  <div className="px-4 py-3 space-y-2.5">
                    <div className="flex items-center gap-2 flex-wrap text-xs text-slate-500">
                      <span className="flex items-center gap-1">
                        <Package size={11} className="text-purple-500" />
                        <span className="text-cobeb-text font-semibold">{Number(item.qtde_paletes).toLocaleString('pt-BR')}</span> plt
                        {item.qtde_unidades != null && (
                          <span className="ml-1">· <span className="text-cobeb-text font-semibold">{Number(item.qtde_unidades).toLocaleString('pt-BR')}</span> und</span>
                        )}
                      </span>
                      {item.data_validade && <span>Val: {formatData(item.data_validade)}</span>}
                    </div>

                    {item.descricao_motivo && (
                      <span className="inline-flex text-[10px] font-semibold bg-orange-500/10 text-orange-600 border border-orange-500/20 px-2 py-0.5 rounded-full">
                        {item.descricao_motivo}
                      </span>
                    )}

                    <div className="flex items-center gap-2 text-[10px] text-slate-400 flex-wrap">
                      {item.criado_manualmente && (
                        <span className="inline-flex items-center gap-0.5 bg-purple-500/10 text-purple-600 border border-purple-500/20 px-1.5 py-0.5 rounded-full font-semibold">
                          <FilePlus size={9} /> Manual
                        </span>
                      )}
                      {item.data_chegada && (
                        <span className="flex items-center gap-1">
                          <CalendarDays size={9} className="text-purple-400" />
                          Chegada: {formatData(item.data_chegada)}
                        </span>
                      )}
                      {item.numero_nf      && <span>{item.data_chegada ? '·' : ''} NF {item.numero_nf}</span>}
                      {item.motorista_nome && <span>· {item.motorista_nome}</span>}
                      {item.placa_carreta  && <span>· {item.placa_carreta}</span>}
                      <span className="ml-auto">{formatTs(item.created_at)}</span>
                    </div>

                    {/* Status de envio */}
                    <div className="pt-1 border-t border-cobeb-border/50 space-y-2">

                      {/* 1. Envio empilheira */}
                      {!enviado ? (
                        <div className="space-y-2">
                          <span className="flex items-center gap-1.5 text-[10px] font-semibold text-orange-500">
                            <Clock size={11} /> Pendente envio para área de retrabalho
                          </span>
                          {podeConfirmarEnvio && (
                            <button onClick={() => confirmarEnvio(item)} disabled={carregando}
                              className="w-full bg-green-600 hover:bg-green-700 disabled:opacity-40 text-white text-xs font-semibold py-2.5 rounded-xl transition-colors flex items-center justify-center gap-1.5">
                              {carregando
                                ? <div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                                : <><CheckCircle size={13} /> Palete enviado à área de retrabalho</>}
                            </button>
                          )}
                        </div>
                      ) : (
                        <div className="flex items-center justify-between gap-2">
                          <div>
                            <span className="flex items-center gap-1.5 text-[10px] font-semibold text-green-600">
                              <CheckCircle size={11} /> Enviado para área de retrabalho
                            </span>
                            {item.enviado_por_nome && (
                              <p className="text-[10px] text-slate-400 mt-0.5">
                                por {item.enviado_por_nome} · {formatTs(item.enviado_em)}
                              </p>
                            )}
                          </div>
                          {podeDesfazer && !iniciado && (
                            <button onClick={() => desfazerEnvio(item)} disabled={carregando}
                              className="flex items-center gap-1 text-[10px] text-slate-400 hover:text-cobeb-navy underline transition-colors shrink-0 disabled:opacity-40">
                              <Undo2 size={11} /> Desfazer
                            </button>
                          )}
                        </div>
                      )}

                      {/* 2. Iniciar retrabalho */}
                      {enviado && !iniciado && !concluido && (
                        podeIniciar ? (
                          <button onClick={() => iniciarRetrabalho(item)} disabled={emInicio}
                            className="w-full bg-purple-600 hover:bg-purple-700 disabled:opacity-40 text-white text-xs font-semibold py-2.5 rounded-xl transition-colors flex items-center justify-center gap-1.5">
                            {emInicio
                              ? <div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                              : <><Play size={13} /> Iniciar Retrabalho</>}
                          </button>
                        ) : (
                          <span className="flex items-center gap-1.5 text-[10px] font-semibold text-blue-500">
                            <Clock size={11} /> Aguardando início do retrabalho
                          </span>
                        )
                      )}

                      {/* 3. Em andamento / Finalizar */}
                      {iniciado && !finalizado && !concluido && (
                        <div className="space-y-2">
                          <div>
                            <span className="flex items-center gap-1.5 text-[10px] font-semibold text-yellow-600">
                              <RotateCcw size={11} className="animate-spin" /> Em andamento
                            </span>
                            {item.inicio_por_nome && (
                              <p className="text-[10px] text-slate-400 mt-0.5">
                                Iniciado por {item.inicio_por_nome} · {formatTs(item.inicio_retrabalho)}
                              </p>
                            )}
                          </div>
                          {podeIniciar && (
                            <button onClick={() => finalizarRetrabalho(item)} disabled={emFim}
                              className="w-full bg-cobeb-navy hover:bg-cobeb-blue disabled:opacity-40 text-white text-xs font-semibold py-2.5 rounded-xl transition-colors flex items-center justify-center gap-1.5">
                              {emFim
                                ? <div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                                : <><StopCircle size={13} /> Finalizar Retrabalho</>}
                            </button>
                          )}
                        </div>
                      )}

                      {/* 4. Aguardando apontamento (fim salvo mas modal fechado sem salvar) */}
                      {finalizado && !concluido && (
                        <div className="space-y-2">
                          <span className="flex items-center gap-1.5 text-[10px] font-semibold text-purple-600">
                            <AlertTriangle size={11} /> Aguardando apontamento final
                          </span>
                          {podeIniciar && (
                            <button onClick={() => setApontamentoItem(item)}
                              className="w-full bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold py-2.5 rounded-xl transition-colors flex items-center justify-center gap-1.5">
                              <AlertTriangle size={13} /> Registrar Apontamento
                            </button>
                          )}
                        </div>
                      )}

                      {/* 5. Concluído */}
                      {concluido && (
                        <div>
                          <span className="flex items-center gap-1.5 text-[10px] font-semibold text-green-600">
                            <CheckCircle size={11} /> Retrabalho concluído
                          </span>
                          {formatDuracao(item.inicio_retrabalho, item.fim_retrabalho) && (
                            <p className="text-[10px] text-slate-400 mt-0.5">
                              Tempo de retrabalho: <span className="font-semibold text-cobeb-text">{formatDuracao(item.inicio_retrabalho, item.fim_retrabalho)}</span>
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </main>

      {/* Modal criação manual */}
      {criarModal && (
        <CriarRetrabalhoModal
          motivos={motivos}
          onClose={() => setCriarModal(false)}
          onSave={criarRetrabalho}
        />
      )}

      {/* Modal de apontamento final */}
      {apontamentoItem && (
        <ApontamentoModal
          item={apontamentoItem}
          motivos={motivos}
          profileNome={profile?.nome ?? ''}
          onClose={() => setApontamentoItem(null)}
          onSave={salvarApontamento}
        />
      )}
    </div>
  )
}

// ── Modal de criação manual ───────────────────────────────────────────────────

function identificarProduto(emissao, nriNum) {
  const offset = nriNum - emissao.primeiro_numero

  if (emissao.itens?.length > 0) {
    let pos = 0
    for (const item of emissao.itens) {
      const count = item.isKeg ? Math.ceil(item.qtdePaletes) : Math.ceil(item.qtdePaletes) * 3
      if (offset < pos + count) return { cod: item.codigo, desc: item.descricao, emb: null }
      pos += count
    }
  }

  const citens = emissao.tarefa?.conferencia_itens ?? []
  if (citens.length === 1) {
    const p = citens[0].pedido
    return { cod: p?.cod_produto ?? null, desc: p?.descricao ?? null, emb: p?.embalagem ?? null }
  }
  if (citens.length > 1) {
    let pos = 0
    for (const ci of citens) {
      const count = Math.ceil(Number(ci.qtde_paletes) || 1) * 3
      if (offset < pos + count) {
        const p = ci.pedido
        return { cod: p?.cod_produto ?? null, desc: p?.descricao ?? null, emb: p?.embalagem ?? null }
      }
      pos += count
    }
  }

  return { cod: null, desc: null, emb: null }
}

function CriarRetrabalhoModal({ motivos, onClose, onSave }) {
  const [numeroNri,       setNumeroNri]       = useState('')
  const [nriInfo,         setNriInfo]         = useState(null)   // { dataChegada, nf, motorista, placa, cod, desc, emb }
  const [buscandoNri,     setBuscandoNri]     = useState(false)
  const [erroNri,         setErroNri]         = useState(null)
  const [produtoSel,      setProdutoSel]      = useState(null) // { cod, desc, emb }
  const [motivoId,        setMotivoId]        = useState('')
  const [salvando,        setSalvando]        = useState(false)

  const prodFinal = nriInfo?.opcoesProduto ? produtoSel : nriInfo
  const canSave   = nriInfo && motivoId && (!nriInfo.opcoesProduto || produtoSel)

  function resetNri() {
    setNriInfo(null)
    setErroNri(null)
    setProdutoSel(null)
  }

  async function buscarNri() {
    const n = Number(numeroNri.trim())
    if (!n) return
    setBuscandoNri(true)
    resetNri()

    // 1. Busca o lote de NRI pelo range de números
    const { data: emissao, error: e1 } = await supabase
      .from('nri_emissoes')
      .select('id, created_at, numero_nf, primeiro_numero, ultimo_numero, itens, tarefa_id')
      .lte('primeiro_numero', n)
      .gte('ultimo_numero', n)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (e1 || !emissao) { setBuscandoNri(false); setErroNri('NRI não encontrado'); return }

    // 2. Busca dados básicos da tarefa (sem join)
    let nf = emissao.numero_nf ?? null
    let motorista = null
    let placa = null
    let prod = { cod: null, desc: null, emb: null }

    if (emissao.tarefa_id) {
      const { data: tarefa } = await supabase
        .from('tarefas')
        .select('numero_nf, viagem_id')
        .eq('id', emissao.tarefa_id)
        .maybeSingle()

      if (tarefa) {
        nf = tarefa.numero_nf ?? nf

        // 3. Viagem → motorista e placa (separado)
        if (tarefa.viagem_id) {
          const { data: viagem } = await supabase
            .from('viagens')
            .select('motorista_id, carreta_id')
            .eq('id', tarefa.viagem_id)
            .maybeSingle()

          if (viagem?.motorista_id) {
            const { data: mot } = await supabase
              .from('profiles').select('nome').eq('id', viagem.motorista_id).maybeSingle()
            motorista = mot?.nome ?? null
          }
          if (viagem?.carreta_id) {
            const { data: car } = await supabase
              .from('carretas').select('placa').eq('id', viagem.carreta_id).maybeSingle()
            placa = car?.placa ?? null
          }

          // 4. Produto via pedidos → viagem_id
          if (emissao.itens?.length > 0) {
            prod = identificarProduto(emissao, n)
          } else {
            const { data: peds } = await supabase
              .from('pedidos')
              .select('cod_produto, descricao, embalagem')
              .eq('viagem_id', tarefa.viagem_id)
            const uniq = [...new Map((peds ?? []).map(p => [p.cod_produto, p])).values()]
            if (uniq.length === 1) {
              prod = { cod: uniq[0].cod_produto, desc: uniq[0].descricao, emb: uniq[0].embalagem }
            } else if (uniq.length > 1) {
              prod = { cod: null, desc: null, emb: null, opcoesProduto: uniq.map(p => ({ cod: p.cod_produto, desc: p.descricao, emb: p.embalagem })) }
            }
          }
        }
      }
    }

    setBuscandoNri(false)
    setNriInfo({
      dataChegada:    emissao.created_at.split('T')[0],
      nf, motorista, placa,
      cod:            prod.cod,
      desc:           prod.desc,
      emb:            prod.emb,
      opcoesProduto:  prod.opcoesProduto ?? null,
    })
  }

  async function handleSave() {
    setSalvando(true)
    const ok = await onSave({
      codProduto:       prodFinal?.cod  ?? nriInfo.cod,
      descricaoProduto: prodFinal?.desc ?? nriInfo.desc,
      embalagemproduto: nriInfo.emb,
      motivoId,
      dataChegada:  nriInfo.dataChegada,
      numeroNri:    numeroNri.trim(),
      nriNumeroNf:  nriInfo.nf,
      nriMotorista: nriInfo.motorista,
      nriPlaca:     nriInfo.placa,
    })
    if (!ok) setSalvando(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-white rounded-t-3xl border-t border-cobeb-border px-5 pt-4 pb-8 max-h-[92vh] overflow-y-auto">
        <div className="w-10 h-1 bg-cobeb-border rounded-full mx-auto mb-4" />

        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <FilePlus size={16} className="text-purple-600" />
            <p className="text-cobeb-text font-semibold text-sm">Retrabalho Manual</p>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-cobeb-text p-1 transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-5">

          {/* NRI */}
          <div>
            <label className="text-slate-500 text-[11px] font-semibold uppercase tracking-widest block mb-1.5">
              Número do NRI <span className="text-cobeb-yellow">*</span>
            </label>
            <div className="flex gap-2">
              <input
                type="number" placeholder="Ex: 10234"
                value={numeroNri}
                onChange={e => { setNumeroNri(e.target.value); resetNri() }}
                onKeyDown={e => e.key === 'Enter' && buscarNri()}
                className="flex-1 bg-[#EBF5FF] border border-cobeb-border rounded-xl px-3 py-2.5 text-sm text-cobeb-text focus:outline-none focus:border-cobeb-blue transition-colors"
              />
              <button onClick={buscarNri} disabled={!numeroNri.trim() || buscandoNri}
                className="px-4 py-2.5 bg-cobeb-navy hover:bg-cobeb-blue disabled:opacity-40 text-white text-sm font-semibold rounded-xl transition-colors flex items-center gap-1.5">
                {buscandoNri
                  ? <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  : <Search size={14} />}
              </button>
            </div>
            {erroNri && <p className="text-red-500 text-[11px] mt-1.5">{erroNri}</p>}

            {/* Preview dos dados encontrados */}
            {nriInfo && (
              <div className="mt-3 bg-[#EBF5FF] border border-cobeb-border rounded-2xl px-4 py-3 space-y-2">
                {/* Produto */}
                <div className="border-b border-cobeb-border/50 pb-2">
                  <p className="text-cobeb-text text-xs font-semibold">
                    {nriInfo.desc ?? <span className="text-slate-400 italic">Produto não identificado</span>}
                  </p>
                  <p className="text-slate-500 text-[10px] font-mono mt-0.5">
                    {nriInfo.cod}
                    {nriInfo.emb ? ` · ${nriInfo.emb}` : ''}
                  </p>
                  <p className="text-purple-600 text-[10px] font-semibold mt-1">1 palete</p>
                </div>
                {/* Viagem */}
                <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-slate-500">
                  <span className="flex items-center gap-1">
                    <CalendarDays size={9} className="text-purple-400" />
                    Chegada: <span className="font-semibold text-cobeb-text ml-0.5">
                      {new Date(nriInfo.dataChegada + 'T12:00:00').toLocaleDateString('pt-BR')}
                    </span>
                  </span>
                  {nriInfo.nf        && <span>· NF {nriInfo.nf}</span>}
                  {nriInfo.motorista && <span>· {nriInfo.motorista}</span>}
                  {nriInfo.placa     && <span>· {nriInfo.placa}</span>}
                </div>
              </div>
            )}
          </div>

          {/* Seletor de produto — aparece quando há múltiplos na viagem */}
          {nriInfo?.opcoesProduto && (
            <div>
              <label className="text-slate-500 text-[11px] font-semibold uppercase tracking-widest block mb-2">
                Qual produto? <span className="text-cobeb-yellow">*</span>
              </label>
              <div className="space-y-2">
                {nriInfo.opcoesProduto.map((op, i) => (
                  <button key={i} type="button"
                    onClick={() => setProdutoSel(op)}
                    className={`w-full px-3 py-2.5 rounded-xl border text-left transition-colors ${
                      produtoSel?.cod === op.cod
                        ? 'bg-cobeb-navy/10 border-cobeb-navy/50 text-cobeb-navy'
                        : 'bg-[#EBF5FF] border-cobeb-border text-slate-600 hover:border-cobeb-blue/40'
                    }`}>
                    <p className="text-xs font-semibold">{op.desc ?? op.cod}</p>
                    <p className="text-[10px] text-slate-400 font-mono mt-0.5">{op.cod}{op.emb ? ` · ${op.emb}` : ''}</p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Motivo — só aparece após lookup com sucesso */}
          {nriInfo && (
            <div>
              <label className="text-slate-500 text-[11px] font-semibold uppercase tracking-widest block mb-2">
                Motivo <span className="text-cobeb-yellow">*</span>
              </label>
              {motivos.length === 0 ? (
                <p className="text-slate-400 text-xs bg-[#EBF5FF] border border-cobeb-border rounded-xl px-3 py-3">
                  Nenhum motivo cadastrado em Metas.
                </p>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  {motivos.map(m => (
                    <button key={m.id} type="button"
                      onClick={() => setMotivoId(m.id)}
                      className={`px-3 py-2.5 rounded-xl border text-xs font-medium text-left transition-colors ${
                        motivoId === m.id
                          ? 'bg-orange-500/10 border-orange-500/50 text-orange-700'
                          : 'bg-[#EBF5FF] border-cobeb-border text-slate-500 hover:border-orange-500/30'
                      }`}>
                      {m.descricao}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="flex gap-3 pt-1">
            <button onClick={onClose}
              className="flex-1 bg-[#EBF5FF] border border-cobeb-border text-slate-400 text-sm font-semibold py-3 rounded-2xl">
              Cancelar
            </button>
            <button onClick={handleSave} disabled={!canSave || salvando}
              className="flex-1 bg-purple-600 hover:bg-purple-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold py-3 rounded-2xl transition-colors flex items-center justify-center gap-2">
              {salvando
                ? <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                : 'Criar Retrabalho'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Modal de apontamento final ────────────────────────────────────────────────

function ApontamentoModal({ item, motivos, profileNome, onClose, onSave }) {
  const [semAnomalia,  setSemAnomalia]  = useState(true)
  const [motivoId,     setMotivoId]     = useState('')
  const [qtdeAvariada, setQtdeAvariada] = useState('')
  const [fotos,        setFotos]        = useState([]) // { preview, path, uploading, erro }
  const [salvando,     setSalvando]     = useState(false)
  const inputRef = useRef()

  const MAX_FOTOS = 5
  const temFotoOk = fotos.some(f => f.path && !f.uploading)
  const uploading = fotos.some(f => f.uploading)

  const canSave = semAnomalia
    ? true
    : (motivoId && qtdeAvariada && Number(qtdeAvariada) > 0 && temFotoOk && !uploading)

  async function handleFoto(file) {
    if (!file || fotos.length >= MAX_FOTOS) return
    const preview = URL.createObjectURL(file)
    const idx = fotos.length
    setFotos(prev => [...prev, { preview, path: null, uploading: true, erro: null }])

    const ext  = (file.name.split('.').pop() || 'jpg').toLowerCase()
    const path = `retrabalho/${item.id}/${Date.now()}_${idx}.${ext}`
    const { error } = await supabase.storage.from('anomalias-fotos').upload(path, file, { upsert: true })

    setFotos(prev => prev.map((f, i) => i === idx
      ? error
        ? { ...f, uploading: false, erro: 'Falha no envio' }
        : { ...f, uploading: false, path }
      : f
    ))
  }

  function removerFoto(idx) {
    setFotos(prev => prev.filter((_, i) => i !== idx))
  }

  async function handleSave() {
    setSalvando(true)
    const ok = await onSave(item, {
      semAnomalia,
      motivoId,
      qtdeAvariada,
      fotosUrls: fotos.map(f => f.path),
    })
    if (!ok) setSalvando(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-white rounded-t-3xl border-t border-cobeb-border px-5 pt-4 pb-8 max-h-[92vh] overflow-y-auto">
        <div className="w-10 h-1 bg-cobeb-border rounded-full mx-auto mb-4" />

        <div className="flex items-center justify-between mb-5">
          <p className="text-cobeb-text font-semibold text-sm">Apontamento Final</p>
          <button onClick={onClose} className="text-slate-500 hover:text-cobeb-text p-1 transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Info do produto */}
        <div className="bg-[#EBF5FF] rounded-xl px-3 py-2.5 border border-cobeb-border mb-5">
          <p className="text-cobeb-text text-xs font-medium">{item.descricao_produto ?? 'Produto'}</p>
          <p className="text-slate-500 text-[10px] font-mono mt-0.5">{item.cod_produto}</p>
          <p className="text-slate-500 text-[10px] mt-0.5">
            {Number(item.qtde_paletes).toLocaleString('pt-BR')} plt
            {item.data_validade && ` · Val: ${formatData(item.data_validade)}`}
          </p>
        </div>

        <div className="space-y-5">

          {/* Tipo */}
          <div>
            <label className="text-slate-500 text-[11px] font-semibold uppercase tracking-widest block mb-2">
              Resultado do retrabalho <span className="text-cobeb-yellow">*</span>
            </label>
            <div className="flex gap-2">
              {[
                { val: true,  label: 'Sem anomalias encontradas' },
                { val: false, label: 'Com anomalia' },
              ].map(({ val, label }) => (
                <button key={String(val)} type="button"
                  onClick={() => setSemAnomalia(val)}
                  className={`flex-1 py-2.5 rounded-xl text-xs font-semibold border transition-colors ${
                    semAnomalia === val
                      ? val ? 'bg-green-600 text-white border-green-600' : 'bg-orange-500 text-white border-orange-500'
                      : 'bg-white text-slate-500 border-cobeb-border hover:border-cobeb-blue/50'
                  }`}>
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Com anomalia */}
          {!semAnomalia && (
            <>
              {/* Motivo */}
              <div>
                <label className="text-slate-500 text-[11px] font-semibold uppercase tracking-widest block mb-2">
                  Motivo <span className="text-cobeb-yellow">*</span>
                </label>
                {motivos.length === 0 ? (
                  <p className="text-slate-400 text-xs bg-[#EBF5FF] border border-cobeb-border rounded-xl px-3 py-3">
                    Nenhum motivo cadastrado em Metas.
                  </p>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    {motivos.map(m => (
                      <button key={m.id} type="button"
                        onClick={() => setMotivoId(m.id)}
                        className={`px-3 py-2.5 rounded-xl border text-xs font-medium text-left transition-colors ${
                          motivoId === m.id
                            ? 'bg-orange-500/10 border-orange-500/50 text-orange-700'
                            : 'bg-[#EBF5FF] border-cobeb-border text-slate-500 hover:border-orange-500/30'
                        }`}>
                        {m.descricao}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Quantidade avariada */}
              <div>
                <label className="text-slate-500 text-[11px] font-semibold uppercase tracking-widest block mb-1.5">
                  Quantidade avariada <span className="text-cobeb-yellow">*</span>
                </label>
                <p className="text-orange-500/80 text-[10px] font-semibold mb-2">
                  ⚠ Informe em unidades individuais de itens
                </p>
                <div className="flex items-center gap-2">
                  <input
                    type="number" min="1" step="1" placeholder="0"
                    value={qtdeAvariada}
                    onChange={e => setQtdeAvariada(e.target.value)}
                    className="w-28 bg-[#EBF5FF] border border-cobeb-border rounded-xl px-3 py-2.5 text-sm text-cobeb-text focus:outline-none focus:border-cobeb-blue transition-colors text-right"
                  />
                  <span className="text-slate-500 text-sm">unidades</span>
                </div>
              </div>

              {/* Fotos */}
              <div>
                <label className="text-slate-500 text-[11px] font-semibold uppercase tracking-widest block mb-2">
                  Fotos das unidades avariadas <span className="text-cobeb-yellow">*</span>
                  <span className="normal-case tracking-normal font-normal text-slate-400 ml-1">
                    mín. 1 · máx. {MAX_FOTOS}
                  </span>
                </label>
                <input
                  type="file" accept="image/*" capture="environment"
                  ref={inputRef} className="hidden"
                  onChange={e => e.target.files[0] && handleFoto(e.target.files[0])}
                />
                <div className="flex flex-wrap gap-2">
                  {fotos.map((f, idx) => (
                    <div key={idx} className="relative w-20 h-20 rounded-xl overflow-hidden border border-cobeb-border shrink-0">
                      <img src={f.preview} alt="" className="w-full h-full object-cover" />
                      {f.uploading && (
                        <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                          <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                        </div>
                      )}
                      {f.erro && (
                        <div className="absolute inset-0 bg-red-500/60 flex items-center justify-center">
                          <AlertCircle size={16} className="text-white" />
                        </div>
                      )}
                      {!f.uploading && !f.erro && (
                        <button onClick={() => removerFoto(idx)}
                          className="absolute top-0.5 right-0.5 w-5 h-5 bg-black/60 rounded-full flex items-center justify-center">
                          <X size={10} className="text-white" />
                        </button>
                      )}
                    </div>
                  ))}
                  {fotos.length < MAX_FOTOS && (
                    <button onClick={() => inputRef.current?.click()}
                      className="w-20 h-20 rounded-xl border-2 border-dashed border-cobeb-border hover:border-cobeb-blue/50 flex flex-col items-center justify-center gap-1 text-slate-400 hover:text-cobeb-navy transition-colors shrink-0">
                      <Camera size={18} />
                      <span className="text-[9px] font-semibold">Foto</span>
                    </button>
                  )}
                </div>
                <p className="text-slate-400 text-[10px] mt-1">
                  {fotos.filter(f => f.path).length} de {MAX_FOTOS} fotos enviadas
                </p>
              </div>
            </>
          )}

          {/* Sem anomalia - confirmação */}
          {semAnomalia && (
            <div className="bg-green-500/10 border border-green-500/20 rounded-xl px-4 py-3">
              <p className="text-green-700 text-xs font-semibold flex items-center gap-1.5">
                <CheckCircle size={13} /> Nenhuma anomalia encontrada no retrabalho
              </p>
              <p className="text-slate-500 text-[10px] mt-1">Nenhuma foto obrigatória.</p>
            </div>
          )}

          <div className="flex gap-3 pt-1">
            <button onClick={onClose}
              className="flex-1 bg-[#EBF5FF] border border-cobeb-border text-slate-400 text-sm font-semibold py-3 rounded-2xl">
              Cancelar
            </button>
            <button onClick={handleSave} disabled={!canSave || salvando}
              className="flex-1 bg-cobeb-navy hover:bg-cobeb-blue disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold py-3 rounded-2xl transition-colors flex items-center justify-center gap-2">
              {salvando
                ? <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                : 'Finalizar Retrabalho'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
