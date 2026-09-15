import { useState, useEffect, useMemo } from 'react'
import { Trash2, CheckSquare, Square, AlertTriangle, Clock, Truck, Unlock, X, Factory, ShoppingCart } from 'lucide-react'
import AdminLayout from '../components/AdminLayout'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

function formatTs(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

function diffHHMM(start, end) {
  if (!start || !end) return null
  const ms = new Date(end) - new Date(start)
  if (ms <= 0) return null
  const h = Math.floor(ms / 3600000)
  const m = Math.floor((ms % 3600000) / 60000)
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

const selCls  = 'bg-white border border-cobeb-border rounded-xl px-3 py-2 text-cobeb-text text-xs focus:outline-none focus:border-cobeb-blue appearance-none cursor-pointer'
const dateCls = 'flex-1 bg-white border border-cobeb-border rounded-xl px-3 py-1.5 text-cobeb-text text-xs focus:outline-none focus:border-cobeb-blue transition-colors [color-scheme:light]'

export default function Historico() {
  const { profile } = useAuth()
  const isAdminTotal = profile?.acesso_total === true

  const [viagens,       setViagens]       = useState([])
  const [marketplaces,  setMarketplaces]  = useState([])
  const [unidades,      setUnidades]      = useState([])
  const [todasPlacas,   setTodasPlacas]   = useState([])
  const [filtroUnid,    setFiltroUnid]    = useState('')
  const [filtroPlaca,   setFiltroPlaca]   = useState('')
  const [filtroDataDe,  setFiltroDataDe]  = useState('')
  const [filtroDataAte, setFiltroDataAte] = useState('')
  const [selecionadas,  setSelecionadas]  = useState(new Set())
  const [loading,       setLoading]       = useState(true)
  const [excluindo,     setExcluindo]     = useState(false)
  const [modalExcluir,  setModalExcluir]  = useState(false)
  const [modalLiberar,  setModalLiberar]  = useState(null)
  const [liberando,     setLiberando]     = useState(null)
  const [feedback,      setFeedback]      = useState(null)

  useEffect(() => { carregar() }, [])

  useEffect(() => {
    const timer = setInterval(() => carregar(true), 30000)
    return () => clearInterval(timer)
  }, [])

  async function carregar(silent = false) {
    if (!silent) setLoading(true)
    if (!silent) setSelecionadas(new Set())

    const [{ data: v }, { data: u }, { data: cavalos }, { data: mkt }] = await Promise.all([
      supabase
        .from('viagens')
        .select(`
          id, status, numero_nf, numero_nf_saida, dt_saida_revenda, dt_chegada_fabrica,
          dt_saida_fabrica, dt_chegada_revenda, dt_saida_entrega,
          unidade:unidades(id, nome, cidade),
          carreta:carretas(placa, tipo),
          cavalo:cavalos(placa, tipo),
          motorista:profiles(nome, tipo)
        `)
        .in('status', ['concluida', 'aguardando_conferencia'])
        .order('dt_chegada_revenda', { ascending: false }),
      supabase.from('unidades').select('id, nome, cidade').order('nome'),
      supabase.from('cavalos').select('placa').order('placa'),
      supabase
        .from('portaria_atendimentos')
        .select('id, unidade_id, placa_cavalo, placa_carreta, numero_nf, dt_entrada, dt_saida, created_at, unidade:unidades(id, nome, cidade)')
        .eq('tipo', 'marketplace')
        .eq('status', 'concluido')
        .is('excluido_em', null)
        .order('dt_saida', { ascending: false }),
    ])

    const viagensRaw = v ?? []

    // Busca pedidos separadamente para evitar conflito de RLS no join aninhado
    let viagensComPedidos = viagensRaw
    if (viagensRaw.length) {
      const { data: peds } = await supabase
        .from('pedidos')
        .select('viagem_id, numero_pedido, fabrica')
        .in('viagem_id', viagensRaw.map(x => x.id))
      if (peds?.length) {
        const porViagem = {}
        const fabricasPorViagem = {}
        peds.forEach(p => {
          if (!porViagem[p.viagem_id]) porViagem[p.viagem_id] = []
          porViagem[p.viagem_id].push(p.numero_pedido)
          if (p.fabrica) {
            if (!fabricasPorViagem[p.viagem_id]) fabricasPorViagem[p.viagem_id] = new Set()
            fabricasPorViagem[p.viagem_id].add(p.fabrica)
          }
        })
        viagensComPedidos = viagensRaw.map(vi => ({
          ...vi,
          numeros_pedido: [...new Set(porViagem[vi.id] ?? [])],
          fabricas: [...(fabricasPorViagem[vi.id] ?? [])],
        }))
      }
    }

    setViagens(viagensComPedidos)
    setMarketplaces(mkt ?? [])
    setUnidades(u ?? [])
    setTodasPlacas((cavalos ?? []).map(c => c.placa).filter(Boolean))
    if (!silent) setLoading(false)
  }

  // Lista unificada ordenada por data desc
  const itens = useMemo(() => {
    const v = viagens.map(x => ({
      ...x,
      _type: 'viagem',
      _sortDate: x.dt_saida_entrega || x.dt_chegada_revenda || x.dt_saida_revenda || '',
    }))
    const m = marketplaces.map(x => ({
      ...x,
      _type: 'marketplace',
      _sortDate: x.dt_saida || x.created_at || '',
    }))
    return [...v, ...m].sort((a, b) => (b._sortDate > a._sortDate ? 1 : -1))
  }, [viagens, marketplaces])

  const itensFiltrados = useMemo(() => {
    return itens.filter(item => {
      if (filtroUnid && item.unidade?.id !== filtroUnid) return false
      if (filtroPlaca) {
        const placa = item._type === 'viagem' ? item.cavalo?.placa : item.placa_cavalo
        if (placa !== filtroPlaca) return false
      }
      const ref = item._type === 'viagem'
        ? (item.dt_chegada_revenda || item.dt_saida_entrega || '').slice(0, 10)
        : (item.dt_saida || item.created_at || '').slice(0, 10)
      if (filtroDataDe  && ref < filtroDataDe)  return false
      if (filtroDataAte && ref > filtroDataAte) return false
      return true
    })
  }, [itens, filtroUnid, filtroPlaca, filtroDataDe, filtroDataAte])

  function resetFiltros() {
    setFiltroUnid('')
    setFiltroPlaca('')
    setFiltroDataDe('')
    setFiltroDataAte('')
    setSelecionadas(new Set())
  }

  function toggleSelecionada(id) {
    setSelecionadas(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function toggleTodas() {
    if (selecionadas.size === itensFiltrados.length) {
      setSelecionadas(new Set())
    } else {
      setSelecionadas(new Set(itensFiltrados.map(i => i.id)))
    }
  }

  async function confirmarExclusao() {
    setModalExcluir(false)
    if (!isAdminTotal) {
      setFeedback({ tipo: 'erro', msg: 'Exclusão permitida somente para o Administrador com acesso total.' })
      return
    }
    setExcluindo(true)
    setFeedback(null)

    const selectedItems = itens.filter(i => selecionadas.has(i.id))
    const viagemIds = selectedItems.filter(i => i._type === 'viagem').map(i => i.id)
    const mktIds    = selectedItems.filter(i => i._type === 'marketplace').map(i => i.id)
    const erros = []

    if (viagemIds.length) {
      const { data, error } = await supabase.rpc('excluir_viagens', { p_ids: viagemIds })
      if (error) erros.push(error.message)
    }

    for (const id of mktIds) {
      const { error } = await supabase.rpc('excluir_entrada_marketplace', { p_atendimento_id: id })
      if (error) erros.push(error.message)
    }

    if (erros.length) {
      setFeedback({ tipo: 'erro', msg: 'Erro ao excluir: ' + erros.join('; ') })
    } else {
      const total = viagemIds.length + mktIds.length
      setFeedback({ tipo: 'ok', msg: `${total} item(s) excluído(s) com sucesso.` })
      await carregar()
    }

    setExcluindo(false)
  }

  async function confirmarLiberar() {
    const viagem = modalLiberar
    setModalLiberar(null)
    setLiberando(viagem.id)
    setFeedback(null)

    const { error } = await supabase.rpc('liberar_motorista', { p_viagem_id: viagem.id })

    if (error) {
      setFeedback({ tipo: 'erro', msg: 'Erro ao liberar: ' + error.message })
    } else {
      setFeedback({ tipo: 'ok', msg: `Motorista ${viagem.motorista?.nome ?? ''} liberado. A saída será desbloqueada no próximo check do app.` })
      await carregar()
    }

    setLiberando(null)
  }

  const temFiltroAtivo    = filtroUnid || filtroPlaca || filtroDataDe || filtroDataAte
  const todasSelecionadas = itensFiltrados.length > 0 && selecionadas.size === itensFiltrados.length
  const algumaSelecionada = selecionadas.size > 0

  // Texto do modal de exclusão
  const selectedItems   = itens.filter(i => selecionadas.has(i.id))
  const nViagens        = selectedItems.filter(i => i._type === 'viagem').length
  const nMkt            = selectedItems.filter(i => i._type === 'marketplace').length
  const textoExclusao   = [
    nViagens > 0 ? `${nViagens} viagem(ns)` : '',
    nMkt > 0     ? `${nMkt} recebimento(s) marketplace` : '',
  ].filter(Boolean).join(' e ')

  const filtrosJSX = (
    <div className="max-w-2xl mx-auto px-4 pt-3 pb-3 space-y-2 border-b border-cobeb-border/40">
      <div className="flex gap-2">
        <select value={filtroUnid} onChange={e => { setFiltroUnid(e.target.value); setSelecionadas(new Set()) }} className={`flex-1 ${selCls}`}>
          <option value="">Todas as unidades</option>
          {unidades.map(u => <option key={u.id} value={u.id}>{u.nome} — {u.cidade}</option>)}
        </select>
        <select value={filtroPlaca} onChange={e => { setFiltroPlaca(e.target.value); setSelecionadas(new Set()) }} className={`flex-1 ${selCls}`}>
          <option value="">Todas as placas</option>
          {todasPlacas.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
      </div>
      <div className="flex items-center gap-2">
        <input type="date" value={filtroDataDe} max={filtroDataAte || undefined}
          onChange={e => { setFiltroDataDe(e.target.value); setSelecionadas(new Set()) }} className={dateCls} />
        <span className="text-slate-400 text-xs shrink-0">até</span>
        <input type="date" value={filtroDataAte} min={filtroDataDe || undefined}
          onChange={e => { setFiltroDataAte(e.target.value); setSelecionadas(new Set()) }} className={dateCls} />
        {(filtroDataDe || filtroDataAte) && (
          <button onClick={() => { setFiltroDataDe(''); setFiltroDataAte(''); setSelecionadas(new Set()) }}
            className="text-slate-500 hover:text-cobeb-yellow transition-colors shrink-0">
            <X size={15} />
          </button>
        )}
      </div>
      {temFiltroAtivo && (
        <button onClick={resetFiltros} className="text-xs text-slate-500 hover:text-cobeb-yellow transition-colors">
          Limpar filtros
        </button>
      )}
    </div>
  )

  return (
    <AdminLayout title="Histórico de Viagens" subheader={filtrosJSX}>
      <div className="max-w-2xl mx-auto px-4 pt-4 pb-4 space-y-4">

        {/* Feedback */}
        {feedback && (
          <div className={`rounded-2xl px-4 py-3 flex items-center gap-3 ${
            feedback.tipo === 'ok'
              ? 'bg-green-500/10 border border-green-500/30'
              : 'bg-red-500/10 border border-red-500/30'
          }`}>
            <span className={`text-sm ${feedback.tipo === 'ok' ? 'text-green-400' : 'text-red-400'}`}>
              {feedback.msg}
            </span>
            <button onClick={() => setFeedback(null)} className="ml-auto text-slate-500 hover:text-slate-400 text-xs">✕</button>
          </div>
        )}

        {/* Barra de seleção — somente admin_total */}
        {isAdminTotal && !loading && itensFiltrados.length > 0 && (
          <div className="flex items-center justify-between bg-white rounded-2xl border border-cobeb-border px-4 py-3">
            <button onClick={toggleTodas} className="flex items-center gap-2 text-sm text-slate-400 hover:text-white transition-colors">
              {todasSelecionadas
                ? <CheckSquare size={18} className="text-cobeb-yellow" />
                : <Square size={18} className="text-slate-500" />}
              {todasSelecionadas ? 'Desmarcar todos' : 'Selecionar todos'}
            </button>
            <span className="text-slate-500 text-xs">{itensFiltrados.length} item(s)</span>
          </div>
        )}

        {/* Lista */}
        {loading ? (
          <div className="flex justify-center py-16">
            <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : itensFiltrados.length === 0 ? (
          <div className="text-center py-16">
            <Clock size={32} className="text-slate-700 mx-auto mb-3" />
            <p className="text-slate-500 text-sm">
              {temFiltroAtivo
                ? 'Nenhum item encontrado com esses filtros'
                : 'Nenhuma viagem concluída ou recebimento marketplace'}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {itensFiltrados.map(item => {
              const sel     = selecionadas.has(item.id)
              const emLib   = liberando === item.id

              if (item._type === 'marketplace') {
                const tma = diffHHMM(item.dt_entrada, item.dt_saida)
                return (
                  <div key={item.id}
                    className={`rounded-2xl border transition-all ${
                      sel ? 'bg-cobeb-navy/10 border-orange-500' : 'bg-white border-cobeb-border'
                    }`}>
                    <button onClick={() => isAdminTotal && toggleSelecionada(item.id)} className="w-full text-left p-4">
                      <div className="flex items-start gap-3">
                        {isAdminTotal && (
                          <div className="mt-0.5 shrink-0">
                            {sel
                              ? <CheckSquare size={18} className="text-cobeb-yellow" />
                              : <Square size={18} className="text-slate-500" />}
                          </div>
                        )}
                        <div className="flex-1 min-w-0 space-y-2">
                          {/* Unidade + badges + data */}
                          <div className="flex items-center justify-between gap-2 flex-wrap">
                            <div className="flex items-center gap-2 min-w-0">
                              <p className={`font-semibold text-sm truncate ${sel ? 'text-cobeb-yellow' : 'text-cobeb-text'}`}>
                                {item.unidade?.nome ?? '—'}
                              </p>
                              <span className="shrink-0 flex items-center gap-1 text-[10px] font-semibold bg-orange-50 text-orange-600 border border-orange-200 px-2 py-0.5 rounded-full">
                                <ShoppingCart size={9} />Marketplace
                              </span>
                              <span className="shrink-0 text-[10px] font-semibold bg-green-500/15 text-green-400 border border-green-500/30 px-2 py-0.5 rounded-full">
                                Concluído
                              </span>
                            </div>
                            <span className="text-slate-500 text-xs shrink-0">{formatTs(item.dt_saida)}</span>
                          </div>

                          {/* Placas + NF */}
                          <div className="flex items-center gap-2 flex-wrap">
                            <Truck size={12} className="text-slate-500 shrink-0" />
                            <span className="text-slate-500 text-xs font-mono">{item.placa_cavalo ?? '—'}</span>
                            {item.placa_carreta && (
                              <>
                                <span className="text-slate-700 text-xs">/</span>
                                <span className="text-slate-500 text-xs font-mono">{item.placa_carreta}</span>
                              </>
                            )}
                            {item.numero_nf && (
                              <span className="text-slate-500 text-xs">· NF {item.numero_nf}</span>
                            )}
                          </div>

                          {/* Horários + TMA */}
                          <div className="flex items-center gap-3 flex-wrap text-xs text-slate-500">
                            <span>Entrada: {formatTs(item.dt_entrada)}</span>
                            <span>Saída: {formatTs(item.dt_saida)}</span>
                            {tma && <span className="font-mono">⏱ {tma}</span>}
                          </div>
                        </div>
                      </div>
                    </button>
                  </div>
                )
              }

              // ── Viagem normal ──────────────────────────────────────────────
              const tmvTotal = diffHHMM(item.dt_saida_revenda, item.dt_saida_entrega)
              const travada  = item.status === 'aguardando_conferencia'

              return (
                <div key={item.id}
                  className={`rounded-2xl border transition-all ${
                    sel
                      ? 'bg-cobeb-navy/10 border-orange-500'
                      : travada
                        ? 'bg-white border-blue-500/30'
                        : 'bg-white border-cobeb-border'
                  }`}>

                  <button onClick={() => isAdminTotal && toggleSelecionada(item.id)} className="w-full text-left p-4">
                    <div className="flex items-start gap-3">
                      {isAdminTotal && (
                        <div className="mt-0.5 shrink-0">
                          {sel
                            ? <CheckSquare size={18} className="text-cobeb-yellow" />
                            : <Square size={18} className="text-slate-500" />}
                        </div>
                      )}
                      <div className="flex-1 min-w-0 space-y-2">
                        {/* Unidade + badge + data */}
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <div className="flex items-center gap-2 min-w-0">
                            <p className={`font-semibold text-sm truncate ${sel ? 'text-cobeb-yellow' : 'text-cobeb-text'}`}>
                              {item.unidade?.nome ?? '—'}
                            </p>
                            {travada ? (
                              <span className="shrink-0 text-[10px] font-semibold bg-blue-500/15 text-blue-400 border border-blue-500/30 px-2 py-0.5 rounded-full">
                                Em Conferência
                              </span>
                            ) : (
                              <span className="shrink-0 text-[10px] font-semibold bg-green-500/15 text-green-400 border border-green-500/30 px-2 py-0.5 rounded-full">
                                Concluída
                              </span>
                            )}
                          </div>
                          <span className="text-slate-500 text-xs shrink-0">
                            {travada ? formatTs(item.dt_chegada_revenda) : formatTs(item.dt_saida_entrega)}
                          </span>
                        </div>

                        {/* Motorista + veículos */}
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-slate-400 text-xs">{item.motorista?.nome ?? '—'}</span>
                          {item.motorista?.tipo && (
                            <span className="text-[10px] bg-[#EBF5FF] border border-cobeb-border text-slate-500 px-2 py-0.5 rounded-full">
                              {item.motorista.tipo}
                            </span>
                          )}
                          <span className="text-slate-700 text-xs">·</span>
                          <Truck size={12} className="text-slate-500 shrink-0" />
                          <span className="text-slate-500 text-xs font-mono">{item.carreta?.placa ?? '—'}</span>
                          <span className="text-slate-700 text-xs">/</span>
                          <span className="text-slate-500 text-xs font-mono">{item.cavalo?.placa ?? '—'}</span>
                        </div>

                        {/* Pedidos + NF + TMV */}
                        <div className="flex items-center gap-3 flex-wrap">
                          {item.numeros_pedido?.length > 0 && (
                            <span className="text-slate-500 text-xs">
                              Ped. {item.numeros_pedido.map(n => `#${n}`).join(' · ')}
                            </span>
                          )}
                          {item.numero_nf_saida && (
                            <span className="text-slate-500 text-xs">
                              NF Saída <span className="text-cobeb-yellow font-semibold">{item.numero_nf_saida}</span>
                            </span>
                          )}
                          {item.numero_nf && (
                            <span className="text-slate-500 text-xs">
                              {item.numero_nf_saida ? 'NF Entrada ' : 'NF '}
                              <span className="text-blue-400 font-semibold">{item.numero_nf}</span>
                            </span>
                          )}
                          {tmvTotal && <span className="text-slate-500 text-xs font-mono">⏱ {tmvTotal}</span>}
                        </div>

                        {/* Fábrica */}
                        {item.fabricas?.length > 0 && (
                          <div className="flex items-center gap-1.5">
                            <Factory size={12} className="text-slate-400 shrink-0" />
                            <span className="text-slate-500 text-xs">{item.fabricas.join(' · ')}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </button>

                  {/* Botão Liberar — só para viagens em conferência */}
                  {travada && (
                    <div className="px-4 pb-3 pt-0">
                      <button
                        onClick={e => { e.stopPropagation(); setModalLiberar(item) }}
                        disabled={emLib}
                        className="w-full flex items-center justify-center gap-2 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/30 text-blue-400 font-semibold text-xs py-2.5 rounded-xl transition-colors disabled:opacity-50">
                        {emLib
                          ? <div className="w-4 h-4 border-2 border-blue-400/40 border-t-blue-400 rounded-full animate-spin" />
                          : <Unlock size={14} />}
                        {emLib ? 'Liberando...' : 'Liberar Motorista'}
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Barra de ação — excluir selecionados (somente admin_total) */}
      {isAdminTotal && algumaSelecionada && (
        <div className="fixed bottom-20 left-0 right-0 z-40 flex justify-center px-4 pointer-events-none">
          <div className="w-full max-w-2xl bg-[#1E3A5F] border border-cobeb-blue/40 rounded-2xl px-4 py-3 flex items-center justify-between shadow-xl pointer-events-auto">
            <span className="text-cobeb-text text-sm font-semibold">
              {selecionadas.size} selecionado{selecionadas.size > 1 ? 's' : ''}
            </span>
            <button
              onClick={() => setModalExcluir(true)}
              disabled={excluindo}
              className="flex items-center gap-2 bg-red-500 hover:bg-red-600 disabled:opacity-50 text-white font-semibold text-sm px-4 py-2 rounded-xl transition-colors">
              {excluindo
                ? <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                : <Trash2 size={15} />}
              {excluindo ? 'Excluindo...' : 'Excluir'}
            </button>
          </div>
        </div>
      )}

      {/* Modal: confirmar exclusão */}
      {modalExcluir && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-end">
          <div className="w-full max-w-lg mx-auto bg-white rounded-t-3xl p-6 space-y-5">
            <div className="w-10 h-1 bg-[#1E3A5F] rounded-full mx-auto" />
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-red-500/20 flex items-center justify-center shrink-0">
                <AlertTriangle size={20} className="text-red-400" />
              </div>
              <div>
                <p className="text-cobeb-text font-semibold text-base">Confirmar exclusão</p>
                <p className="text-slate-500 text-sm mt-1">
                  {textoExclusao} serão excluídos permanentemente, incluindo tarefas, NRIs e anomalias.
                </p>
                <p className="text-red-400 text-xs mt-2 font-medium">Esta ação não pode ser desfeita.</p>
              </div>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setModalExcluir(false)}
                className="flex-1 bg-[#EBF5FF] border border-cobeb-border text-slate-400 font-semibold py-4 rounded-2xl text-sm">
                Cancelar
              </button>
              <button onClick={confirmarExclusao}
                className="flex-1 bg-red-500 hover:bg-red-600 text-white font-semibold py-4 rounded-2xl text-sm transition-colors">
                Excluir
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: confirmar liberação */}
      {modalLiberar && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-end">
          <div className="w-full max-w-lg mx-auto bg-white rounded-t-3xl p-6 space-y-5">
            <div className="w-10 h-1 bg-[#1E3A5F] rounded-full mx-auto" />
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-500/20 flex items-center justify-center shrink-0">
                <Unlock size={20} className="text-blue-400" />
              </div>
              <div>
                <p className="text-cobeb-text font-semibold text-base">Liberar motorista</p>
                <p className="text-slate-400 text-sm mt-1">
                  <span className="text-cobeb-text font-medium">{modalLiberar.motorista?.nome ?? 'Motorista'}</span>
                  {' — '}{modalLiberar.unidade?.nome}
                </p>
                <p className="text-slate-500 text-sm mt-2">
                  Isso marca a conferência como concluída e desbloqueia a "Saída após Entrega" no app do motorista. Use quando a conferência foi feita manualmente ou não será realizada.
                </p>
              </div>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setModalLiberar(null)}
                className="flex-1 bg-[#EBF5FF] border border-cobeb-border text-slate-400 font-semibold py-4 rounded-2xl text-sm">
                Cancelar
              </button>
              <button onClick={confirmarLiberar}
                className="flex-1 bg-blue-500 hover:bg-blue-600 text-white font-semibold py-4 rounded-2xl text-sm transition-colors">
                Liberar
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  )
}
