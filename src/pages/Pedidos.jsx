import { useState, useEffect, useMemo } from 'react'
import {
  ChevronDown, ChevronUp, X, Search, RefreshCw,
  CheckCircle, Clock, Package, AlertTriangle, RotateCcw,
  Unlink2, Truck,
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

  const [unidades,          setUnidades]          = useState([])
  const [pedidos,           setPedidos]           = useState([])
  const [loading,           setLoading]           = useState(true)
  const [marcandoFuro,      setMarcandoFuro]      = useState(new Set())
  const [marcandoRealizado, setMarcandoRealizado] = useState(new Set())

  // filter state
  const [filtData,    setFiltData]    = useState('')
  const [filtUnidade, setFiltUnidade] = useState('')
  const [filtFabrica, setFiltFabrica] = useState('')
  const [search,      setSearch]      = useState('')

  const [expanded, setExpanded] = useState(new Set())

  // desvincular
  const [showConfirmDesvincular, setShowConfirmDesvincular] = useState(null)
  const [desvinculando,          setDesvinculando]          = useState(false)

  // ação (furo ou realizado)
  const [showAcaoModal, setShowAcaoModal] = useState(null)

  // vincular a viagem em trânsito
  const [showVincularViagem,  setShowVincularViagem]  = useState(null)
  const [viagensTransito,     setViagensTransito]     = useState([])
  const [loadingViagens,      setLoadingViagens]      = useState(false)
  const [vinculandoViagemId,  setVinculandoViagemId]  = useState(null)

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

  async function marcarRealizado(grupo, desfazer = false) {
    const key = grupo.key
    setMarcandoRealizado(prev => new Set([...prev, key]))
    const ids = grupo.itens.filter(i => i.status !== 'cancelado').map(i => i.id)
    const { error } = await supabase
      .from('pedidos')
      .update({ status: desfazer ? 'ativo' : 'realizado' })
      .in('id', ids)
    setMarcandoRealizado(prev => { const n = new Set(prev); n.delete(key); return n })
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

  // ── vincular a viagem em trânsito ───────────────────────────────────────────

  async function abrirVincularViagem(grupo) {
    setShowVincularViagem(grupo)
    setViagensTransito([])
    setLoadingViagens(true)
    const { data } = await supabase
      .from('viagens')
      .select('id, status, cavalo:cavalos(placa), carreta:carretas(placa), motorista:profiles(nome), unidade:unidades(nome, codigo)')
      .in('status', ['em_transito', 'na_fabrica', 'retornando'])
      .order('created_at', { ascending: false })
    setViagensTransito(data ?? [])
    setLoadingViagens(false)
  }

  async function vincularPedidoViagem(viagem_id) {
    if (!showVincularViagem) return
    setVinculandoViagemId(viagem_id)
    const { error } = await supabase.rpc('admin_vincular_pedido_viagem', {
      p_numero_pedido: showVincularViagem.numero_pedido,
      p_viagem_id:     viagem_id,
    })
    setVinculandoViagemId(null)
    if (error) {
      if (error.message?.includes('Pedido já vinculado')) {
        alert('Este pedido já está vinculado a outra viagem.')
      } else {
        alert('Erro ao vincular: ' + error.message)
      }
      return
    }
    setShowVincularViagem(null)
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

  const filtrosJSX = (
    <div className="max-w-lg mx-auto px-4 pt-3 pb-3 space-y-2 border-b border-cobeb-border/40">
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
      <div className="relative">
        <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Buscar número do pedido..."
          className="w-full bg-white border border-cobeb-border rounded-xl pl-9 pr-4 py-2.5 text-cobeb-text text-sm placeholder-slate-400 focus:outline-none focus:border-cobeb-blue transition-colors"
        />
        {search && (
          <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-400">
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
  )

  return (
    <AdminLayout title="Consulta de Pedidos" subheader={filtrosJSX}>
      <div className="max-w-lg mx-auto">

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
              const isOpen      = expanded.has(g.key)
              const unidade     = unidades.find(u => u.id === g.unidade_id)
              const vinculado   = !!g.viagem_id
              const ehFuro      = g.itens.some(i => i.status === 'furo')
              const ehRealizado = !g.viagem_id && g.itens.some(i => i.status === 'realizado')
              const isPast      = g.data_puxada < isoToday()

              // pedido pendente do dia atual ou anterior: admin pode registrar situação
              const elegivelAcao = isAdminTotal && !vinculado && !ehFuro && !ehRealizado
                && g.itens.every(i => i.status !== 'cancelado')
                && g.data_puxada <= isoToday()

              // desvincular: só para viagens ainda em transito ou iniciadas
              const podeDesvincular = isAdminTotal && vinculado
                && (g.viagem_status === 'iniciada' || g.viagem_status === 'em_transito')

              const isMarcando = marcandoFuro.has(g.key) || marcandoRealizado.has(g.key)

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
                        ) : ehRealizado ? (
                          <>
                            <CheckCircle size={14} className="text-green-400 shrink-0" />
                            <span className="text-green-400 text-[10px] font-semibold whitespace-nowrap">Vinculado</span>
                            {isAdminTotal && (
                              <span
                                role="button"
                                tabIndex={0}
                                title="Desfazer vínculo manual"
                                onClick={e => { e.stopPropagation(); marcarRealizado(g, true) }}
                                className="ml-0.5 cursor-pointer text-slate-400 hover:text-red-400 transition-colors leading-none"
                              >
                                <RotateCcw size={10} />
                              </span>
                            )}
                          </>
                        ) : (
                          <>
                            <Clock size={14} className="text-slate-500 shrink-0" />
                            <span className="text-slate-500 text-[10px] font-semibold whitespace-nowrap">Pendente</span>
                            {elegivelAcao && (
                              <span
                                role="button"
                                tabIndex={0}
                                title={isPast ? 'Registrar situação' : 'Vincular como realizado'}
                                onClick={e => { e.stopPropagation(); setShowAcaoModal(g) }}
                                className={`ml-1 cursor-pointer leading-none transition-colors ${
                                  isMarcando ? 'text-slate-300' : 'text-orange-400 hover:text-orange-500'
                                }`}
                              >
                                {isMarcando
                                  ? <div className="w-3 h-3 border border-slate-300 border-t-transparent rounded-full animate-spin" style={{ display: 'inline-block' }} />
                                  : <AlertTriangle size={11} />}
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

      {/* ── Modal: registrar situação do pedido ── */}
      {showAcaoModal && (
        <ModalAcaoPedido
          grupo={showAcaoModal}
          onFuro={() => { const g = showAcaoModal; setShowAcaoModal(null); marcarFuro(g) }}
          onVincular={() => { const g = showAcaoModal; setShowAcaoModal(null); marcarRealizado(g) }}
          onVincularViagem={() => { const g = showAcaoModal; setShowAcaoModal(null); abrirVincularViagem(g) }}
          onCancelar={() => setShowAcaoModal(null)}
        />
      )}

      {/* ── Modal: selecionar viagem em trânsito ── */}
      {showVincularViagem && (
        <ModalSelecionarViagem
          grupo={showVincularViagem}
          viagens={viagensTransito}
          loading={loadingViagens}
          vinculandoId={vinculandoViagemId}
          onVincular={vincularPedidoViagem}
          onCancelar={() => setShowVincularViagem(null)}
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

// ── Modal: registrar situação do pedido (furo ou realizado) ───────────────────

function ModalAcaoPedido({ grupo, onFuro, onVincular, onVincularViagem, onCancelar }) {
  const isPast = grupo.data_puxada < isoToday()

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-end">
      <div className="w-full max-w-lg mx-auto bg-white rounded-t-3xl p-6 space-y-4">
        <div className="w-10 h-1 bg-cobeb-border rounded-full mx-auto" />

        <div className="text-center">
          <p className="text-cobeb-text font-semibold text-base">O que aconteceu com este pedido?</p>
          <p className="text-slate-500 text-xs mt-1">
            #{grupo.numero_pedido} · {ptDate(grupo.data_puxada)} · {grupo.fabrica}
          </p>
        </div>

        <div className="space-y-2">
          <button
            onClick={onVincular}
            className="w-full flex items-center gap-3 px-4 py-4 rounded-2xl border border-cobeb-border bg-white hover:border-green-400 hover:bg-green-50 transition-all text-left"
          >
            <div className="w-10 h-10 rounded-xl bg-green-500/10 flex items-center justify-center shrink-0">
              <CheckCircle size={20} className="text-green-500" />
            </div>
            <div>
              <p className="text-cobeb-text font-semibold text-sm">Vincular como realizado</p>
              <p className="text-slate-500 text-xs mt-0.5">A viagem foi feita mas o motorista não vinculou o pedido</p>
            </div>
          </button>

          <button
            onClick={onVincularViagem}
            className="w-full flex items-center gap-3 px-4 py-4 rounded-2xl border border-cobeb-border bg-white hover:border-cobeb-blue/50 hover:bg-[#EBF5FF] transition-all text-left"
          >
            <div className="w-10 h-10 rounded-xl bg-cobeb-navy/10 flex items-center justify-center shrink-0">
              <Truck size={20} className="text-cobeb-navy" />
            </div>
            <div>
              <p className="text-cobeb-text font-semibold text-sm">Vincular a viagem em trânsito</p>
              <p className="text-slate-500 text-xs mt-0.5">O motorista esqueceu de vincular — o pedido vai aparecer no app dele</p>
            </div>
          </button>

          {isPast && (
            <button
              onClick={onFuro}
              className="w-full flex items-center gap-3 px-4 py-4 rounded-2xl border border-cobeb-border bg-white hover:border-red-300 hover:bg-red-50 transition-all text-left"
            >
              <div className="w-10 h-10 rounded-xl bg-red-500/10 flex items-center justify-center shrink-0">
                <AlertTriangle size={20} className="text-red-500" />
              </div>
              <div>
                <p className="text-cobeb-text font-semibold text-sm">Marcar como furo</p>
                <p className="text-slate-500 text-xs mt-0.5">O pedido não foi atendido — nenhuma viagem foi realizada</p>
              </div>
            </button>
          )}
        </div>

        <button
          onClick={onCancelar}
          className="w-full bg-[#EBF5FF] border border-cobeb-border text-slate-400 font-semibold py-4 rounded-2xl text-sm transition-colors hover:bg-slate-100"
        >
          Cancelar
        </button>
      </div>
    </div>
  )
}

// ── Modal: selecionar viagem em trânsito ──────────────────────────────────────

function ModalSelecionarViagem({ grupo, viagens, loading, vinculandoId, onVincular, onCancelar }) {
  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-end">
      <div className="w-full max-w-lg mx-auto bg-white rounded-t-3xl px-5 pt-4 pb-8 flex flex-col max-h-[80vh]">
        <div className="w-10 h-1 bg-cobeb-border rounded-full mx-auto mb-4 shrink-0" />

        <div className="text-center mb-4 shrink-0">
          <p className="text-cobeb-text font-semibold text-base">Selecionar viagem ativa</p>
          <p className="text-slate-500 text-xs mt-1">Pedido #{grupo.numero_pedido} · {grupo.fabrica}</p>
        </div>

        {loading ? (
          <div className="flex justify-center py-10">
            <div className="w-7 h-7 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : viagens.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center py-8 text-center">
            <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-3">
              <Truck size={20} className="text-slate-400" />
            </div>
            <p className="text-cobeb-text font-semibold text-sm">Nenhuma viagem ativa</p>
            <p className="text-slate-500 text-xs mt-1 max-w-xs">
              Não há viagens em trânsito, na fábrica ou retornando no momento.
            </p>
          </div>
        ) : (
          <div className="overflow-y-auto flex-1 space-y-2 mb-2">
            {viagens.map(v => {
              const placas = [v.cavalo?.placa, v.carreta?.placa].filter(Boolean).join(' / ')
              const unidadeLabel = v.unidade?.codigo ?? v.unidade?.nome ?? null
              const isLinking = vinculandoId === v.id
              const statusCfg = {
                em_transito: { label: 'Em trânsito',  cls: 'bg-blue-50 border-blue-200 text-blue-600'   },
                na_fabrica:  { label: 'Na fábrica',   cls: 'bg-amber-50 border-amber-200 text-amber-600' },
                retornando:  { label: 'Retornando',   cls: 'bg-green-50 border-green-200 text-green-600' },
              }[v.status]
              return (
                <button
                  key={v.id}
                  onClick={() => !vinculandoId && onVincular(v.id)}
                  disabled={!!vinculandoId}
                  className="w-full flex items-center gap-3 px-4 py-4 rounded-2xl border border-cobeb-border bg-white hover:border-cobeb-blue/40 hover:bg-[#EBF5FF]/60 transition-all text-left disabled:opacity-60"
                >
                  <div className="w-10 h-10 rounded-xl bg-cobeb-navy/10 flex items-center justify-center shrink-0">
                    {isLinking
                      ? <div className="w-4 h-4 border-2 border-cobeb-navy/40 border-t-cobeb-navy rounded-full animate-spin" />
                      : <Truck size={18} className="text-cobeb-navy" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-cobeb-text font-semibold text-sm font-mono">{placas || '—'}</p>
                      {statusCfg && (
                        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${statusCfg.cls}`}>
                          {statusCfg.label}
                        </span>
                      )}
                    </div>
                    <p className="text-slate-500 text-xs mt-0.5 truncate">
                      {v.motorista?.nome ?? '—'}{unidadeLabel ? ` · ${unidadeLabel}` : ''}
                    </p>
                  </div>
                </button>
              )
            })}
          </div>
        )}

        <button
          onClick={onCancelar}
          disabled={!!vinculandoId}
          className="mt-4 shrink-0 w-full bg-[#EBF5FF] border border-cobeb-border text-slate-400 font-semibold py-4 rounded-2xl text-sm transition-colors hover:bg-slate-100 disabled:opacity-50"
        >
          Cancelar
        </button>
      </div>
    </div>
  )
}
