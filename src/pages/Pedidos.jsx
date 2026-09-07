import { useState, useEffect, useMemo } from 'react'
import {
  ChevronDown, ChevronUp, X, Search, RefreshCw,
  CheckCircle, Clock, Package, AlertTriangle, RotateCcw,
  Link2, Unlink2, Truck, User,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import AdminLayout from '../components/AdminLayout'

function ptDate(iso) {
  if (!iso) return '—'
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

function isoToday() {
  return new Date().toISOString().split('T')[0]
}

function addDays(isoDate, n) {
  const d = new Date(isoDate + 'T12:00:00Z')
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().split('T')[0]
}

// ── component ─────────────────────────────────────────────────────────────────

export default function Pedidos() {
  const { profile: meProfile } = useAuth()
  const isAdminTotal = meProfile?.acesso_total === true

  const [unidades,     setUnidades]     = useState([])
  const [pedidos,      setPedidos]      = useState([])
  const [loading,      setLoading]      = useState(true)
  const [marcandoFuro, setMarcandoFuro] = useState(new Set())

  // filter state
  const [filtData, setFiltData] = useState('')
  const [filtUnidade, setFiltUnidade] = useState('')
  const [filtFabrica, setFiltFabrica] = useState('')
  const [search, setSearch] = useState('')

  const [expanded, setExpanded] = useState(new Set())

  // desvincular
  const [showConfirmDesvincular, setShowConfirmDesvincular] = useState(null)
  const [desvinculando,          setDesvinculando]          = useState(false)

  // vincular
  const [showVincularModal, setShowVincularModal]   = useState(null)
  const [viagemsTransito,   setViagemsTransito]     = useState([])
  const [loadingViagemModal, setLoadingViagemModal] = useState(false)
  const [vinculando,         setVinculando]         = useState(false)

  useEffect(() => { loadData() }, [])

  async function loadData() {
    setLoading(true)

    const [{ data: unis }, { data: peds }] = await Promise.all([
      supabase.from('unidades').select('id, nome, codigo, cidade').order('nome'),
      supabase.from('pedidos').select('*')
        .order('data_puxada', { ascending: false })
        .order('numero_pedido'),
    ])

    const pedidosList = peds ?? []

    // Monta mapa viagem_id → placa do cavalo + status
    let placaCavaloMap  = {}
    let viagemStatusMap = {}
    const viagemIds = [...new Set(pedidosList.map(p => p.viagem_id).filter(Boolean))]
    if (viagemIds.length > 0) {
      const { data: viagens } = await supabase
        .from('viagens')
        .select('id, cavalo_id, status')
        .in('id', viagemIds)

      const cavaloIds = [...new Set((viagens ?? []).map(v => v.cavalo_id).filter(Boolean))]
      if (cavaloIds.length > 0) {
        const { data: cavalos } = await supabase
          .from('cavalos')
          .select('id, placa')
          .in('id', cavaloIds)

        const cavaloPlacaMap = Object.fromEntries((cavalos ?? []).map(c => [c.id, c.placa]))
        ;(viagens ?? []).forEach(v => {
          if (v.cavalo_id && cavaloPlacaMap[v.cavalo_id]) {
            placaCavaloMap[v.id] = cavaloPlacaMap[v.cavalo_id]
          }
        })
      }

      ;(viagens ?? []).forEach(v => { viagemStatusMap[v.id] = v.status })
    }

    setUnidades(unis ?? [])
    setPedidos(pedidosList.map(p => ({
      ...p,
      placa_cavalo:  placaCavaloMap[p.viagem_id]  ?? null,
      viagem_status: viagemStatusMap[p.viagem_id] ?? null,
    })))
    setLoading(false)
  }

  // derived: unique dates sorted desc
  const datas = useMemo(
    () => [...new Set(pedidos.map(p => p.data_puxada))].sort().reverse(),
    [pedidos]
  )

  // default to most recent date on first load
  useEffect(() => {
    if (!filtData && datas.length > 0) setFiltData(datas[0])
  }, [datas])

  const fabricas = useMemo(
    () => [...new Set(pedidos.map(p => p.fabrica).filter(Boolean))].sort(),
    [pedidos]
  )

  // ── grouping ────────────────────────────────────────────────────────────────

  const agrupados = useMemo(() => {
    let filtered = pedidos
    if (filtData)    filtered = filtered.filter(p => p.data_puxada === filtData)
    if (filtUnidade) filtered = filtered.filter(p => p.unidade_id === filtUnidade)
    if (filtFabrica) filtered = filtered.filter(p => p.fabrica === filtFabrica)
    if (search.trim()) {
      const q = search.trim()
      filtered = filtered.filter(p => String(p.numero_pedido).includes(q))
    }

    const map = new Map()
    for (const p of filtered) {
      const key = `${p.numero_pedido}||${p.arquivo_origem}`
      if (!map.has(key)) {
        map.set(key, {
          key,
          numero_pedido: p.numero_pedido,
          placa:         p.placa_cavalo ?? p.placa,
          data_puxada:   p.data_puxada,
          unidade_id:    p.unidade_id,
          fabrica:       p.fabrica,
          viagem_id:     p.viagem_id,
          viagem_status: p.viagem_status,
          itens:         [],
          total_pallets: 0,
          total_skus:    0,
        })
      }
      const g = map.get(key)
      g.itens.push(p)
      g.total_pallets += Number(p.qtde_pallets) || 0
      g.total_skus    += Number(p.qtde_skus) || 0
    }
    return [...map.values()]
  }, [pedidos, filtData, filtUnidade, filtFabrica, search])

  function toggleExpand(key) {
    setExpanded(prev => {
      const n = new Set(prev)
      n.has(key) ? n.delete(key) : n.add(key)
      return n
    })
  }

  async function marcarFuro(grupo, desfazer = false) {
    const key = grupo.key
    setMarcandoFuro(prev => new Set([...prev, key]))
    const ids = grupo.itens.filter(i => i.status !== 'cancelado').map(i => i.id)
    const payload = desfazer
      ? { status: 'ativo', furo_marcado_em: null, furo_marcado_por: null }
      : { status: 'furo', furo_marcado_em: new Date().toISOString(), furo_marcado_por: meProfile?.id }
    const { error } = await supabase.from('pedidos').update(payload).in('id', ids)
    setMarcandoFuro(prev => { const n = new Set(prev); n.delete(key); return n })
    if (error) alert('Erro: ' + error.message)
    else loadData()
  }

  // ── desvincular ──────────────────────────────────────────────────────────────

  async function desvincularViagem() {
    if (!showConfirmDesvincular) return
    setDesvinculando(true)
    const { error } = await supabase.rpc('admin_desvincular_viagem', {
      p_viagem_id: showConfirmDesvincular.viagem_id,
    })
    setDesvinculando(false)
    setShowConfirmDesvincular(null)
    if (error) {
      if (error.message?.includes('VINCULO_FABRICA')) {
        alert('Vínculo na fábrica — a viagem já chegou à fábrica e não pode ser desvinculada.')
      } else {
        alert('Erro: ' + error.message)
      }
      return
    }
    loadData()
  }

  // ── vincular ─────────────────────────────────────────────────────────────────

  async function abrirModalVincular(grupo) {
    setShowVincularModal(grupo)
    setLoadingViagemModal(true)
    setViagemsTransito([])

    const { data: viagens } = await supabase
      .from('viagens')
      .select('id, motorista:profiles(nome), cavalo:cavalos(placa), carreta:carretas(placa)')
      .eq('status', 'em_transito')
      .order('created_at', { ascending: false })

    const ids = (viagens ?? []).map(v => v.id)
    let pedidosPorViagem = {}
    if (ids.length > 0) {
      const { data: peds } = await supabase
        .from('pedidos')
        .select('viagem_id, numero_pedido')
        .in('viagem_id', ids)
        .neq('status', 'cancelado')
      ;(peds ?? []).forEach(p => {
        if (!pedidosPorViagem[p.viagem_id]) pedidosPorViagem[p.viagem_id] = []
        if (!pedidosPorViagem[p.viagem_id].includes(p.numero_pedido))
          pedidosPorViagem[p.viagem_id].push(p.numero_pedido)
      })
    }

    setViagemsTransito((viagens ?? []).map(v => ({
      ...v,
      pedidos: pedidosPorViagem[v.id] ?? [],
    })))
    setLoadingViagemModal(false)
  }

  async function vincularPedido(viagem_id) {
    setVinculando(true)
    const { error } = await supabase.rpc('admin_vincular_pedido_viagem', {
      p_numero_pedido: showVincularModal.numero_pedido,
      p_viagem_id:     viagem_id,
    })
    setVinculando(false)
    if (error) { alert('Erro: ' + error.message); return }
    setShowVincularModal(null)
    loadData()
  }

  // ── render ──────────────────────────────────────────────────────────────────

  const pillBase =
    'px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors border'
  const pillActive =
    'bg-cobeb-navy border-orange-500 text-white'
  const pillInactive =
    'bg-transparent border-cobeb-border text-slate-500 hover:border-orange-500/50 hover:text-cobeb-text'

  const selCls =
    'bg-white border border-cobeb-border rounded-xl px-3 py-2 text-cobeb-text text-xs ' +
    'focus:outline-none focus:border-cobeb-blue appearance-none cursor-pointer'

  return (
    <AdminLayout title="Consulta de Pedidos">
      <div className="max-w-lg mx-auto">

        {/* ── Date filter ── */}
        <div className="px-4 pt-4">
          <div className="flex items-center gap-2">
            {[{ label: 'D-1', diff: -1 }, { label: 'D0', diff: 0 }, { label: 'D1', diff: 1 }].map(({ label, diff }) => {
              const iso = addDays(isoToday(), diff)
              const active = filtData === iso
              const hasData = datas.includes(iso)
              return (
                <button
                  key={label}
                  onClick={() => setFiltData(active ? '' : iso)}
                  className={`${pillBase} ${active ? pillActive : pillInactive} ${!hasData ? 'opacity-40' : ''}`}
                >
                  {label}
                </button>
              )
            })}

            <input
              type="date"
              value={filtData}
              onChange={e => setFiltData(e.target.value)}
              className="flex-1 bg-white border border-cobeb-border rounded-xl px-3 py-1.5 text-cobeb-text text-xs focus:outline-none focus:border-cobeb-blue transition-colors [color-scheme:light]"
            />

            {filtData && (
              <button onClick={() => setFiltData('')} className="text-slate-500 hover:text-cobeb-yellow transition-colors shrink-0">
                <X size={15} />
              </button>
            )}
          </div>
        </div>

        {/* ── Search + secondary filters ── */}
        <div className="px-4 pt-3 space-y-2">
          <div className="relative">
            <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar número do pedido..."
              className="w-full bg-white border border-cobeb-border rounded-xl pl-9 pr-4 py-2.5 text-cobeb-text text-sm placeholder-slate-400 focus:outline-none focus:border-cobeb-blue transition-colors"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-400"
              >
                <X size={14} />
              </button>
            )}
          </div>

          <div className="flex gap-2">
            <select value={filtUnidade} onChange={e => setFiltUnidade(e.target.value)} className={`flex-1 ${selCls}`}>
              <option value="">Todas unidades</option>
              {unidades.map(u => <option key={u.id} value={u.id}>{u.codigo}</option>)}
            </select>
            <select value={filtFabrica} onChange={e => setFiltFabrica(e.target.value)} className={`flex-1 ${selCls}`}>
              <option value="">Todas fábricas</option>
              {fabricas.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
          </div>
        </div>

        {/* ── Column header ── */}
        {!loading && agrupados.length > 0 && (
          <div className="px-4 pt-4 pb-1">
            <div className="grid items-center px-4 py-1"
              style={{ gridTemplateColumns: '1fr 1fr auto auto' }}>
              <span className="text-[10px] text-slate-500 font-semibold uppercase tracking-widest">Data · Fábrica</span>
              <span className="text-[10px] text-slate-500 font-semibold uppercase tracking-widest">Pedido · Placa</span>
              <span className="text-[10px] text-slate-500 font-semibold uppercase tracking-widest pr-6">Status</span>
              <span />
            </div>
          </div>
        )}

        {/* ── List ── */}
        {loading ? (
          <div className="flex justify-center py-20">
            <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : agrupados.length === 0 ? (
          <div className="text-center py-20 px-4">
            <div className="w-14 h-14 rounded-2xl bg-white border border-cobeb-border flex items-center justify-center mx-auto mb-4">
              <Package size={22} className="text-cobeb-border" />
            </div>
            <p className="text-slate-500 text-sm font-medium">Nenhum pedido encontrado</p>
            <p className="text-cobeb-border text-xs mt-1">
              {pedidos.length === 0 ? 'Acesse a guia Importação para adicionar bases' : 'Ajuste os filtros acima'}
            </p>
          </div>
        ) : (
          <div className="px-4 pt-1 pb-4 space-y-1.5">
            {agrupados.map(g => {
              const isOpen    = expanded.has(g.key)
              const unidade   = unidades.find(u => u.id === g.unidade_id)
              const vinculado = !!g.viagem_id
              const ehFuro    = g.itens.some(i => i.status === 'furo')

              const elegivelFuro = isAdminTotal && !vinculado && !ehFuro
                && g.data_puxada < isoToday()
                && g.itens.every(i => i.status !== 'cancelado')

              const elegivelVincular = isAdminTotal && !vinculado && !ehFuro
                && g.itens.every(i => i.status !== 'cancelado')

              // Desvincular: só para viagens ainda em transito ou iniciadas
              const podeDesvincular = isAdminTotal && vinculado
                && (g.viagem_status === 'iniciada' || g.viagem_status === 'em_transito')

              const isMarcando = marcandoFuro.has(g.key)

              return (
                <div key={g.key} className="bg-white rounded-2xl border border-cobeb-border overflow-hidden">
                  {/* Row */}
                  <button
                    onClick={() => toggleExpand(g.key)}
                    className="w-full text-left"
                  >
                    <div
                      className="grid items-center gap-x-2 px-4 py-3"
                      style={{ gridTemplateColumns: '1fr 1fr auto auto' }}
                    >
                      {/* Col 1: date + factory */}
                      <div className="min-w-0">
                        <p className="text-cobeb-text text-xs font-semibold">{ptDate(g.data_puxada)}</p>
                        <p className="text-slate-500 text-[11px] truncate mt-0.5">{g.fabrica}</p>
                        {unidade && (
                          <p className="text-slate-500 text-[10px] mt-0.5">{unidade.codigo}</p>
                        )}
                      </div>

                      {/* Col 2: pedido + plate */}
                      <div className="min-w-0">
                        <p className="text-cobeb-yellow font-mono text-xs font-semibold">
                          #{g.numero_pedido}
                        </p>
                        {g.placa && (
                          <p className="text-slate-400 font-mono text-[11px] mt-0.5">{g.placa}</p>
                        )}
                        <p className="text-slate-500 text-[10px] mt-0.5">
                          {g.itens.length} prod · {g.total_pallets.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} pal
                        </p>
                      </div>

                      {/* Col 3: status */}
                      <div className="flex items-center gap-1 pr-2">
                        {ehFuro ? (
                          <>
                            <AlertTriangle size={13} className="text-red-500 shrink-0" />
                            <span className="text-red-500 text-[10px] font-semibold whitespace-nowrap">Furo</span>
                            {isAdminTotal && (
                              <span
                                role="button"
                                tabIndex={0}
                                title="Desfazer furo"
                                onClick={e => { e.stopPropagation(); marcarFuro(g, true) }}
                                className="ml-0.5 cursor-pointer text-slate-400 hover:text-cobeb-navy transition-colors leading-none"
                              >
                                <RotateCcw size={10} />
                              </span>
                            )}
                          </>
                        ) : vinculado ? (
                          <>
                            <CheckCircle size={14} className="text-green-400 shrink-0" />
                            <span className="text-green-400 text-[10px] font-semibold whitespace-nowrap">Vinculado</span>
                            {podeDesvincular && (
                              <span
                                role="button"
                                tabIndex={0}
                                title="Desvincular viagem"
                                onClick={e => { e.stopPropagation(); setShowConfirmDesvincular(g) }}
                                className="ml-0.5 cursor-pointer text-slate-400 hover:text-red-400 transition-colors leading-none"
                              >
                                <Unlink2 size={10} />
                              </span>
                            )}
                          </>
                        ) : (
                          <>
                            <Clock size={14} className="text-slate-500 shrink-0" />
                            <span className="text-slate-500 text-[10px] font-semibold whitespace-nowrap">Pendente</span>
                            {elegivelFuro && (
                              <span
                                role="button"
                                tabIndex={0}
                                title="Marcar como furo"
                                onClick={e => { e.stopPropagation(); marcarFuro(g) }}
                                className={`ml-1 cursor-pointer leading-none transition-colors ${
                                  isMarcando ? 'text-slate-300' : 'text-orange-400 hover:text-red-500'
                                }`}
                              >
                                {isMarcando
                                  ? <div className="w-3 h-3 border border-slate-300 border-t-transparent rounded-full animate-spin" style={{ display: 'inline-block' }} />
                                  : <AlertTriangle size={11} />}
                              </span>
                            )}
                            {elegivelVincular && (
                              <span
                                role="button"
                                tabIndex={0}
                                title="Vincular a viagem em trânsito"
                                onClick={e => { e.stopPropagation(); abrirModalVincular(g) }}
                                className="ml-1 cursor-pointer leading-none text-blue-400 hover:text-cobeb-navy transition-colors"
                              >
                                <Link2 size={11} />
                              </span>
                            )}
                          </>
                        )}
                      </div>

                      {/* Col 4: chevron */}
                      <div className="text-slate-500">
                        {isOpen
                          ? <ChevronUp size={16} />
                          : <ChevronDown size={16} />}
                      </div>
                    </div>
                  </button>

                  {/* Expanded: product lines */}
                  {isOpen && (
                    <div className="border-t border-[#0B1929]">
                      {/* Sub-header */}
                      <div className="grid px-4 py-2 bg-[#EBF5FF]"
                        style={{ gridTemplateColumns: '1fr auto' }}>
                        <span className="text-[10px] text-slate-500 font-semibold uppercase tracking-widest">
                          Produto
                        </span>
                        <span className="text-[10px] text-slate-500 font-semibold uppercase tracking-widest text-right">
                          Pallets · Caixas
                        </span>
                      </div>
                      {g.itens.map((item, i) => (
                        <div
                          key={item.id}
                          className={`grid items-center gap-x-3 px-4 py-2.5 ${i < g.itens.length - 1 ? 'border-b border-[#0B1929]' : ''}`}
                          style={{ gridTemplateColumns: '1fr auto' }}
                        >
                          <div className="min-w-0">
                            <p className="text-cobeb-text text-xs font-medium truncate">{item.descricao}</p>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="text-slate-500 text-[10px] font-mono">{item.cod_produto}</span>
                              {item.embalagem && <span className="text-slate-500 text-[10px]">{item.embalagem}</span>}
                              {item.curva && (
                                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded leading-none ${
                                  item.curva === 'A' ? 'bg-cobeb-navy/10 text-cobeb-yellow' :
                                  item.curva === 'B' ? 'bg-blue-500/20 text-blue-400' :
                                  'bg-[#1E3A5F]/50 text-slate-500'
                                }`}>{item.curva}</span>
                              )}
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-cobeb-text text-xs font-semibold">
                              {Number(item.qtde_pallets).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}
                            </p>
                            <p className="text-slate-500 text-[10px]">
                              {Number(item.qtde_skus).toLocaleString('pt-BR')} cx
                            </p>
                          </div>
                        </div>
                      ))}

                      {/* Totais */}
                      <div className="grid items-center gap-x-3 px-4 py-2.5 bg-[#EBF5FF]"
                        style={{ gridTemplateColumns: '1fr auto' }}>
                        <span className="text-slate-500 text-[10px] font-semibold uppercase tracking-widest">
                          Total ({g.itens.length} produtos)
                        </span>
                        <div className="text-right">
                          <span className="text-cobeb-yellow text-xs font-bold">
                            {g.total_pallets.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} pal
                          </span>
                          <span className="text-slate-500 text-[10px] ml-2">
                            {g.total_skus.toLocaleString('pt-BR')} cx
                          </span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* ── Counter + refresh ── */}
        {!loading && (
          <div className="px-4 pb-6 flex items-center justify-between">
            <p className="text-slate-500 text-xs">
              Mostrando{' '}
              <span className="text-cobeb-text font-semibold">{agrupados.length}</span>
              {' '}de{' '}
              <span className="text-cobeb-text font-semibold">
                {[...new Set(pedidos.filter(p => {
                  if (filtData && p.data_puxada !== filtData) return false
                  if (filtUnidade && p.unidade_id !== filtUnidade) return false
                  if (filtFabrica && p.fabrica !== filtFabrica) return false
                  return true
                }).map(p => p.numero_pedido))].length}
              </span>
              {' '}pedidos
            </p>
            <button
              onClick={loadData}
              className="flex items-center gap-1.5 text-slate-500 hover:text-cobeb-yellow text-xs transition-colors"
            >
              <RefreshCw size={12} />
              Atualizar
            </button>
          </div>
        )}

      </div>

      {/* ── Modal: confirmar desvinculação ── */}
      {showConfirmDesvincular && (
        <ModalConfirmDesvincular
          grupo={showConfirmDesvincular}
          desvinculando={desvinculando}
          onConfirmar={desvincularViagem}
          onCancelar={() => setShowConfirmDesvincular(null)}
        />
      )}

      {/* ── Modal: vincular a viagem em trânsito ── */}
      {showVincularModal && (
        <ModalVincular
          grupo={showVincularModal}
          viagens={viagemsTransito}
          loading={loadingViagemModal}
          vinculando={vinculando}
          onVincular={vincularPedido}
          onCancelar={() => setShowVincularModal(null)}
        />
      )}

    </AdminLayout>
  )
}

// ── Modal: confirmar desvinculação ────────────────────────────────────────────

function ModalConfirmDesvincular({ grupo, desvinculando, onConfirmar, onCancelar }) {
  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-end">
      <div className="w-full max-w-lg mx-auto bg-white rounded-t-3xl p-6 space-y-5">
        <div className="w-10 h-1 bg-cobeb-border rounded-full mx-auto" />

        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-2xl bg-red-500/10 flex items-center justify-center shrink-0">
            <Unlink2 size={18} className="text-red-500" />
          </div>
          <div>
            <p className="text-cobeb-text font-semibold text-base">Desvincular pedido #{grupo.numero_pedido}?</p>
            <p className="text-slate-500 text-sm mt-1">
              A viagem será cancelada e o motorista retornará à tela de nova viagem. Todos os pedidos vinculados a ela serão liberados.
            </p>
          </div>
        </div>

        <div className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3">
          <p className="text-amber-700 text-xs font-semibold">Esta ação não pode ser desfeita.</p>
          <p className="text-amber-600 text-xs mt-0.5">Só é permitida enquanto o motorista ainda não chegou à fábrica.</p>
        </div>

        <div className="flex gap-3">
          <button
            onClick={onCancelar}
            disabled={desvinculando}
            className="flex-1 bg-[#EBF5FF] border border-cobeb-border text-slate-400 font-semibold py-4 rounded-2xl text-sm disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            onClick={onConfirmar}
            disabled={desvinculando}
            className="flex-1 bg-red-500 hover:bg-red-600 disabled:opacity-50 text-white font-semibold py-4 rounded-2xl text-sm transition-colors flex items-center justify-center gap-2"
          >
            {desvinculando
              ? <><div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />Desvinculando...</>
              : <><Unlink2 size={16} />Confirmar desvinculação</>}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Modal: vincular a viagem em trânsito ──────────────────────────────────────

function ModalVincular({ grupo, viagens, loading, vinculando, onVincular, onCancelar }) {
  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-end">
      <div className="w-full max-w-lg mx-auto bg-white rounded-t-3xl flex flex-col" style={{ maxHeight: '85vh' }}>

        {/* Header */}
        <div className="px-6 pt-5 pb-4 border-b border-cobeb-border shrink-0">
          <div className="w-10 h-1 bg-cobeb-border rounded-full mx-auto mb-4" />
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-cobeb-navy/10 flex items-center justify-center shrink-0">
              <Link2 size={16} className="text-cobeb-navy" />
            </div>
            <div>
              <p className="text-cobeb-text font-semibold text-base">Vincular pedido #{grupo.numero_pedido}</p>
              <p className="text-slate-500 text-xs mt-0.5">Selecione a viagem em trânsito de destino</p>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-2">
          {loading ? (
            <div className="flex justify-center py-10">
              <div className="w-7 h-7 border-2 border-cobeb-blue border-t-transparent rounded-full animate-spin" />
            </div>
          ) : viagens.length === 0 ? (
            <div className="text-center py-10">
              <Truck size={28} className="text-slate-300 mx-auto mb-3" />
              <p className="text-slate-500 text-sm font-medium">Nenhuma viagem em trânsito</p>
              <p className="text-slate-400 text-xs mt-1">Não há viagens com status "em trânsito" no momento.</p>
            </div>
          ) : (
            viagens.map(v => (
              <button
                key={v.id}
                onClick={() => !vinculando && onVincular(v.id)}
                disabled={vinculando}
                className="w-full flex items-center justify-between px-4 py-3.5 rounded-2xl border border-cobeb-border bg-white hover:border-cobeb-blue hover:bg-cobeb-navy/5 transition-all text-left disabled:opacity-50"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <User size={12} className="text-slate-400 shrink-0" />
                    <p className="text-cobeb-text text-sm font-semibold truncate">{v.motorista?.nome ?? '—'}</p>
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <Truck size={12} className="text-slate-400 shrink-0" />
                    <p className="text-slate-500 text-xs font-mono">
                      {v.carreta?.placa ?? '—'} · {v.cavalo?.placa ?? '—'}
                    </p>
                  </div>
                  {v.pedidos.length > 0 && (
                    <p className="text-[10px] text-slate-400 mt-1">
                      Pedidos: {v.pedidos.map(n => `#${n}`).join(' · ')}
                    </p>
                  )}
                </div>
                {vinculando
                  ? <div className="w-4 h-4 border-2 border-cobeb-blue border-t-transparent rounded-full animate-spin shrink-0" />
                  : <Link2 size={14} className="text-cobeb-blue shrink-0 ml-2" />}
              </button>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="px-6 pb-6 pt-3 border-t border-cobeb-border shrink-0">
          <button
            onClick={onCancelar}
            disabled={vinculando}
            className="w-full bg-[#EBF5FF] border border-cobeb-border text-slate-400 font-semibold py-4 rounded-2xl text-sm disabled:opacity-50"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  )
}
