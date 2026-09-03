import { useState, useEffect, useMemo } from 'react'
import { ClipboardCheck, Search, X, ChevronDown, ChevronUp, RefreshCw, Download, FileText, ShoppingCart } from 'lucide-react'
import AdminLayout from '../components/AdminLayout'
import { supabase } from '../lib/supabase'
import { gerarNRIPdf } from '../lib/nriPdf'

function ptDate(iso) {
  if (!iso) return '—'
  const s = String(iso).split('T')[0]
  const [y, m, d] = s.split('-')
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

function calcCaixas(qtdeRecebida, pedido) {
  const rec = Number(qtdeRecebida)
  const pal = Number(pedido.qtde_pallets)
  const cx  = Number(pedido.qtde_skus)
  if (!rec || !pal) return null
  return Math.round(rec * (cx / pal))
}

const selCls   = 'bg-white border border-cobeb-border rounded-xl px-3 py-2 text-cobeb-text text-xs focus:outline-none focus:border-cobeb-blue appearance-none cursor-pointer'
const pillBase = 'px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors border'
const pillOn   = 'bg-cobeb-navy border-orange-500 text-white'
const pillOff  = 'bg-transparent border-cobeb-border text-slate-500 hover:border-orange-500/50 hover:text-cobeb-text'

export default function CheckRecebimento() {
  const [grupos,       setGrupos]      = useState([])
  const [unidades,     setUnidades]    = useState([])
  const [loading,      setLoading]     = useState(true)
  const [expanded,     setExpanded]    = useState(new Set())
  const [filtData,     setFiltData]    = useState('')
  const [filtUnidade,  setFiltUnidade] = useState('')
  const [filtFabrica,  setFiltFabrica] = useState('')
  const [search,       setSearch]      = useState('')
  const [baixandoNRI,  setBaixandoNRI] = useState(null)

  useEffect(() => { load() }, [])

  useEffect(() => {
    const timer = setInterval(() => load(true), 30000)
    return () => clearInterval(timer)
  }, [])

  // Aplica data mais recente na primeira carga
  const datas = useMemo(
    () => [...new Set(grupos.map(g => g.data).filter(Boolean))].sort().reverse(),
    [grupos]
  )
  useEffect(() => {
    if (!filtData && datas.length > 0) setFiltData(datas[0])
  }, [datas])

  async function load(silent = false) {
    if (!silent) setLoading(true)
    if (!silent) setExpanded(new Set())

    // 1. Tarefas com conferência iniciada ou concluída
    const { data: tarefas } = await supabase
      .from('tarefas')
      .select('id, numero_nf, status, unidade_id, viagem_id, unidade:unidades(id, nome, cidade, codigo)')
      .in('status', ['concluida', 'aguardando_conferencia'])
      .order('created_at', { ascending: false })

    const lista = tarefas ?? []

    const tarefaIds = lista.map(t => t.id)
    const viagemIds = [...new Set(lista.map(t => t.viagem_id).filter(Boolean))]

    const [{ data: pedidos }, { data: itens }, { data: viagens }, { data: unis }, { data: emissoes }, { data: anos }] = await Promise.all([
      viagemIds.length
        ? supabase.from('pedidos')
            .select('id, cod_produto, descricao, embalagem, qtde_pallets, qtde_skus, fabrica, numero_pedido, viagem_id')
            .in('viagem_id', viagemIds)
            .neq('status', 'cancelado')
        : { data: [] },
      tarefaIds.length
        ? supabase.from('conferencia_itens')
            .select('id, tarefa_id, pedido_id, qtde_recebida, data_validade')
            .in('tarefa_id', tarefaIds)
        : { data: [] },
      viagemIds.length
        ? supabase.from('viagens')
            .select('id, dt_chegada_revenda, carreta:carretas(placa), cavalo:cavalos(placa), motorista:profiles(nome)')
            .in('id', viagemIds)
        : { data: [] },
      supabase.from('unidades').select('id, nome, cidade, codigo').order('nome'),
      tarefaIds.length
        ? supabase.from('nri_emissoes')
            .select('*')
            .in('tarefa_id', tarefaIds)
            .order('created_at', { ascending: false })
        : { data: [] },
      tarefaIds.length
        ? supabase.from('anomalias')
            .select('id, tarefa_id, pedido_id, tipo, substituto_codigo, substituto_descricao, substituto_qtde_pallets, substituto_qtde_caixas, substituto_data_validade')
            .in('tarefa_id', tarefaIds)
        : { data: [] },
    ])

    // Mapas de lookup
    const pedsByViagem = {}
    ;(pedidos ?? []).forEach(p => {
      if (!pedsByViagem[p.viagem_id]) pedsByViagem[p.viagem_id] = []
      pedsByViagem[p.viagem_id].push(p)
    })

    const itemByTarefaPedido = {}
    ;(itens ?? []).forEach(it => {
      if (!itemByTarefaPedido[it.tarefa_id]) itemByTarefaPedido[it.tarefa_id] = {}
      itemByTarefaPedido[it.tarefa_id][it.pedido_id] = it
    })

    const viagemById = {}
    ;(viagens ?? []).forEach(v => { viagemById[v.id] = v })

    // Mapa tarefa_id → emissão mais recente
    const nriByTarefa = {}
    ;(emissoes ?? []).forEach(e => { if (!nriByTarefa[e.tarefa_id]) nriByTarefa[e.tarefa_id] = e })

    // Mapa tarefa_id → lista de anomalias
    const anosByTarefa = {}
    ;(anos ?? []).forEach(a => {
      if (!anosByTarefa[a.tarefa_id]) anosByTarefa[a.tarefa_id] = []
      anosByTarefa[a.tarefa_id].push(a)
    })

    const result = lista
      .filter(t => (pedsByViagem[t.viagem_id] ?? []).length > 0)
      .map(t => {
        const viagem   = t.viagem_id ? viagemById[t.viagem_id] : null
        const peds     = pedsByViagem[t.viagem_id] ?? []
        const itemMap  = itemByTarefaPedido[t.id] ?? {}
        const data     = viagem?.dt_chegada_revenda?.split('T')[0] ?? null
        const fabricas = [...new Set(peds.map(p => p.fabrica).filter(Boolean))]

        const produtos = peds.map(p => ({ ...p, item: itemMap[p.id] ?? null }))

        const totalPrevPal    = peds.reduce((s, p) => s + (Number(p.qtde_pallets) || 0), 0)
        const totalRecPal     = produtos.reduce((s, p) => s + (Number(p.item?.qtde_recebida) || 0), 0)
        const conferidoCount  = produtos.filter(p => p.item?.qtde_recebida != null).length
        const temDivergencia  = produtos.some(p =>
          p.item?.qtde_recebida != null &&
          Math.abs(Number(p.item.qtde_recebida) - Number(p.qtde_pallets)) > 0.001
        )

        const anomalias        = anosByTarefa[t.id] ?? []
        const temQualidade     = anomalias.some(a => a.tipo === 'qualidade')
        const temInversao      = anomalias.some(a => a.tipo === 'inversao')
        // pedido_id → substituto (para exibir na linha do produto)
        const substituteByPedido = {}
        anomalias.forEach(a => {
          if (a.tipo === 'inversao' && a.pedido_id && a.substituto_codigo) {
            substituteByPedido[a.pedido_id] = a
          }
        })

        return {
          id: t.id,
          numero_nf: t.numero_nf,
          status: t.status,
          unidade_id: t.unidade_id,
          unidade: t.unidade,
          viagem_id: t.viagem_id,
          placa_carreta: viagem?.carreta?.placa ?? null,
          placa_cavalo:  viagem?.cavalo?.placa  ?? null,
          motorista:     viagem?.motorista?.nome ?? null,
          data,
          fabricas,
          produtos,
          totalPrevPal,
          totalRecPal,
          conferidoCount,
          totalProd: peds.length,
          temDivergencia,
          temQualidade,
          temInversao,
          substituteByPedido,
          nriEmissao: nriByTarefa[t.id] ?? null,
        }
      })

    // ── Marketplace: tarefas com NRI emitida (qualquer status) ──────────────
    const { data: marketRaw } = await supabase
      .from('tarefas')
      .select('id, numero_nf, status, unidade_id, tipo, placa_cavalo, placa_carreta, unidade:unidades(id, nome, cidade, codigo)')
      .eq('tipo', 'marketplace')
      .order('created_at', { ascending: false })

    const marketIds = (marketRaw ?? []).map(t => t.id)
    const { data: marketNris } = marketIds.length > 0
      ? await supabase.from('nri_emissoes').select('*').in('tarefa_id', marketIds).order('created_at', { ascending: false })
      : { data: [] }

    const seenMarket = new Set()
    const marketEmissoes = (marketNris ?? []).filter(e => {
      if (seenMarket.has(e.tarefa_id)) return false
      seenMarket.add(e.tarefa_id)
      return true
    })

    const marketGrupos = marketEmissoes.map(emissao => {
      const tarefa = (marketRaw ?? []).find(t => t.id === emissao.tarefa_id)
      if (!tarefa) return null
      return {
        id:                 tarefa.id,
        numero_nf:          tarefa.numero_nf,
        status:             tarefa.status,
        unidade_id:         tarefa.unidade_id,
        unidade:            tarefa.unidade,
        viagem_id:          null,
        placa_carreta:      tarefa.placa_carreta ?? null,
        placa_cavalo:       tarefa.placa_cavalo  ?? null,
        motorista:          null,
        data:               emissao.created_at.split('T')[0],
        fabricas:           [],
        produtos:           [],
        totalPrevPal:       0,
        totalRecPal:        0,
        conferidoCount:     0,
        totalProd:          0,
        temDivergencia:     false,
        temQualidade:       false,
        temInversao:        false,
        substituteByPedido: {},
        nriEmissao:         emissao,
        isMarketplace:      true,
        marketItens:        emissao.itens ?? null,
      }
    }).filter(Boolean)

    const allGrupos = [...result, ...marketGrupos].sort((a, b) => (b.data ?? '').localeCompare(a.data ?? ''))
    setGrupos(allGrupos)
    setUnidades(unis ?? [])
    if (!silent) setLoading(false)
  }

  const fabricas = useMemo(
    () => [...new Set(grupos.flatMap(g => g.fabricas))].sort(),
    [grupos]
  )

  const gruposFiltrados = useMemo(() => {
    return grupos.filter(g => {
      if (filtData    && g.data !== filtData)                        return false
      if (filtUnidade && g.unidade_id !== filtUnidade)               return false
      if (filtFabrica && !g.fabricas.includes(filtFabrica))          return false
      if (search.trim() && !String(g.numero_nf ?? '').includes(search.trim())) return false
      return true
    })
  }, [grupos, filtData, filtUnidade, filtFabrica, search])

  function toggleExpand(id) {
    setExpanded(prev => {
      const n = new Set(prev)
      n.has(id) ? n.delete(id) : n.add(id)
      return n
    })
  }

  async function baixarNRI(g) {
    const emissao = g.nriEmissao
    if (!emissao) return
    setBaixandoNRI(g.id)
    try {
      // ── Marketplace: reconstruir NRI a partir dos itens gravados ────────────
      if (g.isMarketplace) {
        const storedItens = g.marketItens ?? []
        const allNRIs = []
        let num = emissao.primeiro_numero
        if (storedItens.length > 0) {
          for (const item of storedItens) {
            const qtd = Math.ceil(Number(item.qtdePaletes))
            for (let p = 0; p < qtd; p++) {
              for (let n = 0; n < 3; n++) {
                allNRIs.push({ numero: num++, codigo: item.codigo ?? '', descricao: item.descricao ?? '', dataValidade: item.dataValidade ?? '', curva: item.curva ?? '' })
              }
            }
          }
        } else {
          for (let i = 0; i < emissao.total_nris; i++) {
            allNRIs.push({ numero: emissao.primeiro_numero + i, codigo: '', descricao: 'Item não registrado', dataValidade: '', curva: '' })
          }
        }
        const emissaoDate     = new Date(emissao.created_at)
        const dataRecebimento = emissaoDate.toLocaleDateString('pt-BR')
        const horaEmissao     = emissaoDate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
        const dateStr         = emissao.created_at.slice(0, 10).replace(/-/g, '')
        const filename        = `NRI_${g.numero_nf ?? 'MKT'}_${dateStr}.pdf`
        const doc = gerarNRIPdf({ allNRIs, cabecalho: { operador: emissao.operador, conferente: emissao.conferente, turno: emissao.turno }, placaCarreta: g.placa_carreta ?? '', placaCavalo: g.placa_cavalo ?? '', numeroNF: g.numero_nf ?? '', motorista: '', origem: 'Marketplace', dataRecebimento, horaEmissao, filename })
        window.open(doc.output('bloburl'), '_blank')
        return
      }

      // Produtos conferidos normalmente
      const { data: itens } = await supabase
        .from('conferencia_itens')
        .select('qtde_recebida, data_validade, pedido:pedidos(cod_produto, descricao, curva, fabrica)')
        .eq('tarefa_id', g.id)
        .gt('qtde_recebida', 0)

      // Produtos substitutos de anomalias de inversão
      const { data: inversoes } = await supabase
        .from('anomalias')
        .select('substituto_codigo, substituto_descricao, substituto_qtde_pallets, substituto_data_validade, pedido:pedidos(curva)')
        .eq('tarefa_id', g.id)
        .eq('tipo', 'inversao')
        .not('substituto_codigo', 'is', null)
        .gt('substituto_qtde_pallets', 0)

      const allNRIs = []
      let num = emissao.primeiro_numero

      // Itens regulares
      for (const item of (itens ?? [])) {
        const qtd = Math.ceil(Number(item.qtde_recebida))
        for (let p = 0; p < qtd; p++) {
          for (let n = 0; n < 3; n++) {
            allNRIs.push({
              numero:       num++,
              codigo:       item.pedido?.cod_produto ?? '',
              descricao:    item.pedido?.descricao   ?? '',
              dataValidade: item.data_validade        ?? '',
              curva:        item.pedido?.curva        ?? '',
            })
          }
        }
      }

      // Produtos substitutos (inversão)
      for (const inv of (inversoes ?? [])) {
        const qtd = Math.ceil(Number(inv.substituto_qtde_pallets))
        for (let p = 0; p < qtd; p++) {
          for (let n = 0; n < 3; n++) {
            allNRIs.push({
              numero:       num++,
              codigo:       inv.substituto_codigo    ?? '',
              descricao:    inv.substituto_descricao ?? '',
              dataValidade: inv.substituto_data_validade ?? '',
              curva:        inv.pedido?.curva        ?? '',
            })
          }
        }
      }

      const emissaoDate     = new Date(emissao.created_at)
      const dataRecebimento = emissaoDate.toLocaleDateString('pt-BR')
      const horaEmissao     = emissaoDate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
      const dateStr         = emissao.created_at.slice(0, 10).replace(/-/g, '')
      const filename        = `NRI_${g.numero_nf}_${dateStr}.pdf`
      const origem          = itens?.[0]?.pedido?.fabrica ?? ''

      const doc = gerarNRIPdf({
        allNRIs,
        cabecalho:    { operador: emissao.operador, conferente: emissao.conferente, turno: emissao.turno },
        placaCarreta: g.placa_carreta ?? '',
        placaCavalo:  g.placa_cavalo  ?? '',
        numeroNF:     g.numero_nf     ?? '',
        motorista:    g.motorista     ?? '',
        origem,
        dataRecebimento,
        horaEmissao,
        filename,
      })
      window.open(doc.output('bloburl'), '_blank')
    } finally {
      setBaixandoNRI(null)
    }
  }

  const temFiltroAtivo = filtData || filtUnidade || filtFabrica || search

  return (
    <AdminLayout title="Check de Recebimento">
      <div className="max-w-lg mx-auto">

        {/* Filtro data */}
        <div className="px-4 pt-4">
          <div className="flex items-center gap-2">
            {[{ label: 'D-1', diff: -1 }, { label: 'D0', diff: 0 }, { label: 'D1', diff: 1 }].map(({ label, diff }) => {
              const iso    = addDays(isoToday(), diff)
              const active = filtData === iso
              const hasData = datas.includes(iso)
              return (
                <button
                  key={label}
                  onClick={() => setFiltData(active ? '' : iso)}
                  className={`${pillBase} ${active ? pillOn : pillOff} ${!hasData ? 'opacity-40' : ''}`}
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

        {/* Busca + selects */}
        <div className="px-4 pt-3 space-y-2">
          <div className="relative">
            <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar NF..."
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

        {/* Lista */}
        {loading ? (
          <div className="flex justify-center py-20">
            <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : gruposFiltrados.length === 0 ? (
          <div className="text-center py-20 px-4">
            <div className="w-14 h-14 rounded-2xl bg-white border border-cobeb-border flex items-center justify-center mx-auto mb-4">
              <ClipboardCheck size={22} className="text-cobeb-border" />
            </div>
            <p className="text-slate-500 text-sm font-medium">
              {temFiltroAtivo ? 'Nenhuma conferência encontrada com esses filtros' : 'Nenhuma conferência registrada'}
            </p>
          </div>
        ) : (
          <div className="px-4 pt-4 pb-6 space-y-2">
            {gruposFiltrados.map(g => {
              const isOpen    = expanded.has(g.id)
              const concluida = g.status === 'concluida'

              return (
                <div key={g.id} className="bg-white rounded-2xl border border-cobeb-border overflow-hidden">

                  {/* Cabeçalho */}
                  <button onClick={() => toggleExpand(g.id)} className="w-full text-left px-4 py-3">
                    {/* Linha 1: NF + badges + data + chevron */}
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <div className="flex items-center gap-2 min-w-0 flex-wrap">
                        <span className="text-cobeb-yellow font-semibold text-sm shrink-0">
                          {g.numero_nf ? `NF ${g.numero_nf}` : '—'}
                        </span>
                        {g.isMarketplace ? (
                          <span className="text-[10px] font-semibold bg-cobeb-yellow/20 text-cobeb-yellow border border-cobeb-yellow/40 px-2 py-0.5 rounded-full shrink-0 flex items-center gap-1">
                            <ShoppingCart size={9} />Marketplace
                          </span>
                        ) : concluida ? (
                          <span className="text-[10px] font-semibold bg-green-500/15 text-green-400 border border-green-500/30 px-2 py-0.5 rounded-full shrink-0">
                            Concluída
                          </span>
                        ) : (
                          <span className="text-[10px] font-semibold bg-blue-500/15 text-blue-400 border border-blue-500/30 px-2 py-0.5 rounded-full shrink-0">
                            Em Conferência
                          </span>
                        )}
                        {g.temDivergencia && (
                          <span className="text-[10px] font-semibold bg-orange-500/15 text-orange-400 border border-orange-500/30 px-2 py-0.5 rounded-full shrink-0">
                            Divergência
                          </span>
                        )}
                        {g.temQualidade && (
                          <span className="text-[10px] font-semibold bg-red-500/15 text-red-400 border border-red-500/30 px-2 py-0.5 rounded-full shrink-0">
                            Qualidade
                          </span>
                        )}
                        {g.temInversao && (
                          <span className="text-[10px] font-semibold bg-orange-400/15 text-orange-500 border border-orange-400/30 px-2 py-0.5 rounded-full shrink-0">
                            Inversão
                          </span>
                        )}
                        {g.nriEmissao ? (
                          <span className="text-[10px] font-semibold bg-cobeb-navy/10 text-cobeb-navy border border-cobeb-navy/20 px-2 py-0.5 rounded-full shrink-0 flex items-center gap-1">
                            <FileText size={9} />NRI
                          </span>
                        ) : (
                          <span className="text-[10px] font-semibold bg-slate-100 text-slate-400 border border-slate-200 px-2 py-0.5 rounded-full shrink-0">
                            Sem NRI
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-slate-500 text-[10px]">{ptDate(g.data)}</span>
                        {isOpen
                          ? <ChevronUp size={15} className="text-slate-500" />
                          : <ChevronDown size={15} className="text-slate-500" />}
                      </div>
                    </div>

                    {/* Linha 2: unidade · placa · fábrica */}
                    <div className="flex items-center gap-1.5 flex-wrap text-[10px] text-slate-500">
                      {g.unidade && (
                        <span>{g.unidade.nome}{g.unidade.cidade ? ` — ${g.unidade.cidade}` : ''}</span>
                      )}
                      {g.placa_cavalo && <><span>·</span><span className="font-mono">{g.placa_cavalo}</span></>}
                      {g.fabricas.length > 0 && <><span>·</span><span>{g.fabricas.join(' · ')}</span></>}
                    </div>

                    {/* Linha 3: progresso */}
                    <div className="flex items-center gap-2 mt-1.5 text-[10px] text-slate-500">
                      {g.isMarketplace ? (
                        <>
                          <span>{g.nriEmissao?.total_nris ?? 0} NRIs emitidas</span>
                          <span>·</span>
                          <span>Nº {g.nriEmissao?.primeiro_numero}–{g.nriEmissao?.ultimo_numero}</span>
                        </>
                      ) : (
                        <>
                          <span>{g.conferidoCount}/{g.totalProd} prod. conferidos</span>
                          <span>·</span>
                          <span>Prev. {g.totalPrevPal.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} pal</span>
                          <span>·</span>
                          <span>Rec. {g.totalRecPal.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} pal</span>
                        </>
                      )}
                    </div>
                  </button>

                  {/* Produtos expandidos */}
                  {isOpen && (
                    <div className="border-t border-cobeb-border/50">
                      {/* Sub-header */}
                      <div className="grid px-4 py-2 bg-[#EBF5FF]" style={{ gridTemplateColumns: '1fr auto' }}>
                        <span className="text-[10px] text-slate-500 font-semibold uppercase tracking-widest">Produto</span>
                        <span className="text-[10px] text-slate-500 font-semibold uppercase tracking-widest text-right">
                          {g.isMarketplace ? 'Pal / Val.' : 'Prev / Rec / Val.'}
                        </span>
                      </div>

                      {g.isMarketplace ? (
                        // ── Marketplace: itens da NRI ──────────────────────────────────────────
                        g.marketItens && g.marketItens.length > 0 ? (
                          g.marketItens.map((item, i) => (
                            <div key={i} className={`grid items-start gap-x-3 px-4 py-2.5 ${i < g.marketItens.length - 1 ? 'border-b border-cobeb-border/30' : ''}`} style={{ gridTemplateColumns: '1fr auto' }}>
                              <div className="min-w-0">
                                <p className="text-cobeb-text text-xs font-medium truncate">{item.descricao ?? '—'}</p>
                                <span className="text-slate-500 text-[10px] font-mono">{item.codigo}</span>
                              </div>
                              <div className="text-right shrink-0">
                                <p className="text-xs font-semibold text-cobeb-text">
                                  {Number(item.qtdePaletes).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} pal
                                </p>
                                {item.qtdeCaixas != null && <p className="text-[10px] text-slate-500">{Number(item.qtdeCaixas).toLocaleString('pt-BR')} cx</p>}
                                {item.dataValidade && <p className="text-[10px] text-slate-500">Val: {ptDate(item.dataValidade)}</p>}
                              </div>
                            </div>
                          ))
                        ) : (
                          <div className="px-4 py-5 text-center">
                            <p className="text-slate-400 text-xs italic">Itens não disponíveis neste lançamento</p>
                          </div>
                        )
                      ) : (
                        // ── Normal: produtos do pedido ─────────────────────────────────────────
                        g.produtos.map((p, i) => {
                        const rec      = p.item?.qtde_recebida
                        const val      = p.item?.data_validade
                        const prevPal  = Number(p.qtde_pallets)
                        const recPal   = rec != null ? Number(rec) : null
                        const diff     = recPal != null ? recPal - prevPal : null
                        const cxRec    = recPal != null ? calcCaixas(recPal, p) : null
                        const okColor  = diff == null ? '' : diff === 0 ? 'text-green-500' : diff < 0 ? 'text-orange-400' : 'text-red-400'

                        const sub = g.substituteByPedido?.[p.id] ?? null
                        return (
                          <div key={p.id} className={i < g.produtos.length - 1 || sub ? 'border-b border-cobeb-border/30' : ''}>
                            {/* Linha produto */}
                            <div className="grid items-start gap-x-3 px-4 py-2.5" style={{ gridTemplateColumns: '1fr auto' }}>
                              <div className="min-w-0">
                                <p className="text-cobeb-text text-xs font-medium truncate">{p.descricao}</p>
                                <div className="flex items-center gap-2 mt-0.5">
                                  <span className="text-slate-500 text-[10px] font-mono">{p.cod_produto}</span>
                                  {p.embalagem && <span className="text-slate-500 text-[10px]">{p.embalagem}</span>}
                                </div>
                              </div>
                              <div className="text-right shrink-0 space-y-0.5">
                                <p className="text-slate-500 text-[10px]">
                                  Prev: {prevPal.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} pal
                                  {' / '}{Number(p.qtde_skus).toLocaleString('pt-BR')} cx
                                </p>
                                {recPal != null ? (
                                  <p className={`text-xs font-semibold ${okColor}`}>
                                    Rec: {recPal.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} pal
                                    {cxRec != null && <span className="text-[10px] ml-1">/ {cxRec.toLocaleString('pt-BR')} cx</span>}
                                    {diff !== 0 && diff != null && (
                                      <span className="text-[10px] ml-1">
                                        ({diff > 0 ? '+' : ''}{diff.toLocaleString('pt-BR', { maximumFractionDigits: 1 })})
                                      </span>
                                    )}
                                  </p>
                                ) : (
                                  <p className="text-[10px] text-slate-400 italic">Não conferido</p>
                                )}
                                {val && <p className="text-[10px] text-slate-500">Val: {ptDate(val)}</p>}
                              </div>
                            </div>

                            {/* Produto substituto (inversão) */}
                            {sub && (
                              <div className="mx-4 mb-2.5 pl-3 border-l-2 border-orange-400/60 space-y-0.5">
                                <p className="text-[9px] font-bold text-orange-500 uppercase tracking-widest">↳ Substituto recebido</p>
                                <p className="text-cobeb-text text-[11px] font-semibold">{sub.substituto_descricao}</p>
                                <div className="flex items-center gap-3 text-[10px] text-slate-500 flex-wrap">
                                  <span className="font-mono">{sub.substituto_codigo}</span>
                                  {sub.substituto_qtde_pallets != null && (
                                    <span className="font-semibold text-orange-500">
                                      {Number(sub.substituto_qtde_pallets).toLocaleString('pt-BR')} plt
                                      {sub.substituto_qtde_caixas != null && ` / ${Number(sub.substituto_qtde_caixas).toLocaleString('pt-BR')} cx`}
                                    </span>
                                  )}
                                  {sub.substituto_data_validade && <span>Val: {ptDate(sub.substituto_data_validade)}</span>}
                                </div>
                              </div>
                            )}
                          </div>
                        )
                      })
                      )}

                      {/* Totais */}
                      <div className="grid items-center gap-x-3 px-4 py-2.5 bg-[#EBF5FF]" style={{ gridTemplateColumns: '1fr auto' }}>
                        {g.isMarketplace ? (
                          <>
                            <span className="text-slate-500 text-[10px] font-semibold uppercase tracking-widest">
                              Total ({(g.marketItens ?? []).length} produto{(g.marketItens ?? []).length !== 1 ? 's' : ''} · {g.nriEmissao?.total_nris ?? 0} NRIs)
                            </span>
                            <span className="text-cobeb-yellow text-xs font-bold text-right">
                              {(g.marketItens ?? []).reduce((s, item) => s + Number(item.qtdePaletes || 0), 0).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} pal
                            </span>
                          </>
                        ) : (
                          <>
                            <span className="text-slate-500 text-[10px] font-semibold uppercase tracking-widest">
                              Total ({g.totalProd} produtos)
                            </span>
                            <div className="text-right">
                              <span className="text-slate-500 text-[10px]">
                                Prev: {g.totalPrevPal.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} pal
                              </span>
                              <span className={`text-xs font-bold ml-2 ${g.totalRecPal === g.totalPrevPal ? 'text-green-500' : 'text-cobeb-yellow'}`}>
                                Rec: {g.totalRecPal.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} pal
                              </span>
                            </div>
                          </>
                        )}
                      </div>

                      {/* NRI */}
                      <div className="px-4 py-3 border-t border-cobeb-border/40">
                        {g.nriEmissao ? (
                          <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-[10px] font-semibold text-cobeb-navy">NRI emitida</p>
                              <p className="text-slate-400 text-[10px]">
                                {g.nriEmissao.total_nris} NRIs · Nº {g.nriEmissao.primeiro_numero}–{g.nriEmissao.ultimo_numero}
                                {' · '}{new Date(g.nriEmissao.created_at).toLocaleDateString('pt-BR')}
                              </p>
                            </div>
                            <button
                              onClick={() => baixarNRI(g)}
                              disabled={baixandoNRI === g.id}
                              className="flex items-center gap-1.5 bg-cobeb-navy hover:bg-cobeb-blue disabled:opacity-50 text-white text-[11px] font-semibold px-3 py-2 rounded-xl transition-colors shrink-0"
                            >
                              {baixandoNRI === g.id
                                ? <div className="w-3 h-3 border border-white/40 border-t-white rounded-full animate-spin" />
                                : <><Download size={12} />Baixar NRI</>}
                            </button>
                          </div>
                        ) : (
                          <p className="text-slate-400 text-[11px] flex items-center gap-1.5">
                            <FileText size={11} />NRI não emitida
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* Rodapé */}
        {!loading && (
          <div className="px-4 pb-6 flex items-center justify-between">
            <p className="text-slate-500 text-xs">
              <span className="text-cobeb-text font-semibold">{gruposFiltrados.length}</span> conferência(s)
            </p>
            <button onClick={load} className="flex items-center gap-1.5 text-slate-500 hover:text-cobeb-yellow text-xs transition-colors">
              <RefreshCw size={12} />
              Atualizar
            </button>
          </div>
        )}

      </div>
    </AdminLayout>
  )
}
