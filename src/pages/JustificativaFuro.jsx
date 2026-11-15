import { useState, useEffect, useMemo, useRef } from 'react'
import { AlertTriangle, LogOut, LayoutGrid, Search, Check } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'

const fmtInt = n => Number(n || 0).toLocaleString('pt-BR', { maximumFractionDigits: 0 })
const fmtHl  = n => Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
const fmtPlt = n => Number(n || 0).toLocaleString('pt-BR', { maximumFractionDigits: 3 })

function fmtData(iso) {
  if (!iso) return '—'
  const [a, m, d] = String(iso).slice(0, 10).split('-')
  return d && m && a ? `${d}/${m}/${a}` : iso
}

export default function JustificativaFuro() {
  const { profile, signOut, modoVisao, setModoVisao } = useAuth()
  const navigate = useNavigate()

  const [linhas,   setLinhas]   = useState([])   // uma linha por pedido (SKU) com status furo
  const [motivos,  setMotivos]  = useState([])   // motivos ativos (dropdown)
  const [just,     setJust]     = useState({})   // pedido_id -> { motivo_id, observacao }
  const [loading,  setLoading]  = useState(true)

  // filtros
  const [filtData,    setFiltData]    = useState('')
  const [filtUnidade, setFiltUnidade] = useState('')
  const [filtFabrica, setFiltFabrica] = useState('')
  const [search,      setSearch]      = useState('')

  // feedback de salvamento por célula
  const [salvos, setSalvos] = useState({})   // pedido_id -> timestamp (pisca "✓")
  const salvoTimers = useRef({})

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)

    const [{ data: peds }, { data: unis }, { data: mots }] = await Promise.all([
      supabase.from('pedidos')
        .select('id, data_puxada, numero_pedido, fabrica, unidade_id, cod_produto, descricao, qtde_pallets, qtde_skus')
        .eq('status', 'furo')
        .order('data_puxada', { ascending: false })
        .order('numero_pedido'),
      supabase.from('unidades').select('id, nome, codigo').order('nome'),
      supabase.from('motivos_furo').select('id, descricao').eq('ativo', true).order('descricao'),
    ])

    const pedList = peds ?? []
    const uniMap  = Object.fromEntries((unis ?? []).map(u => [u.id, u]))

    // Catálogo para converter paletes -> caixas -> HL (mesmo cálculo do Dashboard Comercial)
    const skus = [...new Set(pedList.map(p => p.cod_produto).filter(Boolean))]
    let catMap = {}
    if (skus.length) {
      const { data: cat } = await supabase
        .from('produtos_catalogo')
        .select('codigo, caixas_pallet, nr_fator_conversao')
        .in('codigo', skus)
      catMap = Object.fromEntries((cat ?? []).map(c => [c.codigo, c]))
    }

    // Justificativas já registradas
    const ids = pedList.map(p => p.id)
    const jMap = {}
    if (ids.length) {
      const { data: js } = await supabase
        .from('pedido_furo_justificativa')
        .select('pedido_id, motivo_id, observacao')
        .in('pedido_id', ids)
      ;(js ?? []).forEach(j => { jMap[j.pedido_id] = { motivo_id: j.motivo_id ?? '', observacao: j.observacao ?? '' } })
    }

    const rows = pedList.map(p => {
      const cat    = catMap[p.cod_produto]
      const cxPlt  = cat?.caixas_pallet || 0
      const fator  = cat?.nr_fator_conversao || 0
      const pallets = Number(p.qtde_pallets) || 0
      const cx     = Number(p.qtde_skus) || Math.round(pallets * cxPlt)   // fallback: paletes × cx/plt
      const hl     = pallets * cxPlt * fator
      const uni    = uniMap[p.unidade_id]
      return {
        id:          p.id,
        data_puxada: p.data_puxada,
        numero_pedido: p.numero_pedido,
        fabrica:     p.fabrica,
        unidade:     uni ? (uni.codigo || uni.nome) : '—',
        unidade_id:  p.unidade_id,
        cod_produto: p.cod_produto,
        descricao:   p.descricao,
        hl,
        cx,
        pallets,
      }
    })

    setLinhas(rows)
    setMotivos(mots ?? [])
    setJust(jMap)
    setLoading(false)
  }

  // Unidades e fábricas presentes nos furos (para os filtros)
  const unidadesOpc = useMemo(() => {
    const m = new Map()
    linhas.forEach(l => { if (l.unidade_id) m.set(l.unidade_id, l.unidade) })
    return [...m.entries()].map(([id, label]) => ({ id, label })).sort((a, b) => a.label.localeCompare(b.label))
  }, [linhas])

  const fabricasOpc = useMemo(
    () => [...new Set(linhas.map(l => l.fabrica).filter(Boolean))].sort(),
    [linhas]
  )

  const datasOpc = useMemo(
    () => [...new Set(linhas.map(l => l.data_puxada).filter(Boolean))].sort().reverse(),
    [linhas]
  )

  const filtradas = useMemo(() => {
    let r = linhas
    if (filtData)    r = r.filter(l => l.data_puxada === filtData)
    if (filtUnidade) r = r.filter(l => l.unidade_id === filtUnidade)
    if (filtFabrica) r = r.filter(l => l.fabrica === filtFabrica)
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      r = r.filter(l =>
        String(l.numero_pedido).includes(q) ||
        String(l.cod_produto ?? '').toLowerCase().includes(q) ||
        String(l.descricao ?? '').toLowerCase().includes(q)
      )
    }
    return r
  }, [linhas, filtData, filtUnidade, filtFabrica, search])

  function piscarSalvo(pedidoId) {
    setSalvos(s => ({ ...s, [pedidoId]: true }))
    clearTimeout(salvoTimers.current[pedidoId])
    salvoTimers.current[pedidoId] = setTimeout(() => {
      setSalvos(s => { const n = { ...s }; delete n[pedidoId]; return n })
    }, 1800)
  }

  async function salvar(pedidoId, patch) {
    const atual = just[pedidoId] ?? { motivo_id: '', observacao: '' }
    const novo  = { ...atual, ...patch }
    setJust(j => ({ ...j, [pedidoId]: novo }))

    const { error } = await supabase
      .from('pedido_furo_justificativa')
      .upsert({
        pedido_id:      pedidoId,
        motivo_id:      novo.motivo_id || null,
        observacao:     novo.observacao?.trim() ? novo.observacao.trim() : null,
        atualizado_em:  new Date().toISOString(),
        atualizado_por: profile?.id ?? null,
      }, { onConflict: 'pedido_id' })

    if (error) { alert('Erro ao salvar: ' + error.message); return }
    piscarSalvo(pedidoId)
  }

  return (
    <div className="min-h-screen bg-[#EBF5FF]">

      {/* Header */}
      <header className="sticky top-0 z-40 bg-cobeb-navy border-b border-blue-800 px-3 py-2 sm:px-5 sm:py-3.5 flex items-center justify-between shadow-md shadow-cobeb-navy/20">
        <div className="flex items-center gap-2 min-w-0">
          <AlertTriangle size={16} className="text-cobeb-yellow shrink-0" />
          <p className="text-white text-sm font-semibold truncate">Justificativa de Furo</p>
        </div>
        <div className="flex items-center gap-1">
          {modoVisao && (
            <button onClick={() => { setModoVisao(null); navigate('/selecionar-modulo') }}
              className="text-cobeb-yellow hover:text-white transition-colors p-1.5 rounded-lg hover:bg-white/10"
              title="Trocar Módulo">
              <LayoutGrid size={16} />
            </button>
          )}
          <button onClick={signOut}
            className="text-blue-300/70 hover:text-white transition-colors p-1.5 rounded-lg hover:bg-white/10"
            title="Sair">
            <LogOut size={16} />
          </button>
        </div>
      </header>

      <main className="px-3 sm:px-5 pt-4 pb-10">

        {/* Filtros */}
        <div className="bg-white rounded-2xl border border-cobeb-border shadow-sm p-3 mb-4 flex flex-wrap gap-2">
          <select value={filtData} onChange={e => setFiltData(e.target.value)}
            className="text-sm border border-cobeb-border rounded-xl px-3 py-2 focus:outline-none focus:border-cobeb-blue">
            <option value="">Todas as datas</option>
            {datasOpc.map(d => <option key={d} value={d}>{fmtData(d)}</option>)}
          </select>
          <select value={filtUnidade} onChange={e => setFiltUnidade(e.target.value)}
            className="text-sm border border-cobeb-border rounded-xl px-3 py-2 focus:outline-none focus:border-cobeb-blue">
            <option value="">Todas as unidades</option>
            {unidadesOpc.map(u => <option key={u.id} value={u.id}>{u.label}</option>)}
          </select>
          <select value={filtFabrica} onChange={e => setFiltFabrica(e.target.value)}
            className="text-sm border border-cobeb-border rounded-xl px-3 py-2 focus:outline-none focus:border-cobeb-blue">
            <option value="">Todas as fábricas</option>
            {fabricasOpc.map(f => <option key={f} value={f}>{f}</option>)}
          </select>
          <div className="relative flex-1 min-w-[180px]">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Pedido, código ou descrição..."
              className="w-full text-sm border border-cobeb-border rounded-xl pl-9 pr-3 py-2 focus:outline-none focus:border-cobeb-blue" />
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <div className="w-8 h-8 border-2 border-cobeb-navy border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filtradas.length === 0 ? (
          <div className="bg-white border border-cobeb-border rounded-2xl p-10 text-center">
            <AlertTriangle size={26} className="text-slate-300 mx-auto mb-3" />
            <p className="text-cobeb-text font-semibold text-sm">Nenhum furo encontrado</p>
            <p className="text-slate-500 text-xs mt-1">
              Furos são os pedidos marcados como "furo" na guia Pedidos do módulo Administrador.
            </p>
          </div>
        ) : (
          <div className="bg-white border border-cobeb-border rounded-2xl shadow-sm overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-cobeb-navy text-white text-left text-xs">
                  <th className="px-3 py-2.5 font-semibold whitespace-nowrap">Data</th>
                  <th className="px-3 py-2.5 font-semibold whitespace-nowrap">Nº Pedido</th>
                  <th className="px-3 py-2.5 font-semibold whitespace-nowrap">Fábrica</th>
                  <th className="px-3 py-2.5 font-semibold whitespace-nowrap">Unidade CD</th>
                  <th className="px-3 py-2.5 font-semibold whitespace-nowrap">Código</th>
                  <th className="px-3 py-2.5 font-semibold">Descrição</th>
                  <th className="px-3 py-2.5 font-semibold text-right whitespace-nowrap">Qtde (hl)</th>
                  <th className="px-3 py-2.5 font-semibold text-right whitespace-nowrap">Qtde (cx)</th>
                  <th className="px-3 py-2.5 font-semibold text-right whitespace-nowrap">Paletes</th>
                  <th className="px-3 py-2.5 font-semibold whitespace-nowrap">Motivo do furo</th>
                  <th className="px-3 py-2.5 font-semibold whitespace-nowrap">Observação</th>
                </tr>
              </thead>
              <tbody>
                {filtradas.map((l, i) => {
                  const j = just[l.id] ?? { motivo_id: '', observacao: '' }
                  return (
                    <tr key={l.id} className={`border-t border-cobeb-border ${i % 2 ? 'bg-[#EBF5FF]/40' : 'bg-white'}`}>
                      <td className="px-3 py-2 whitespace-nowrap text-cobeb-text">{fmtData(l.data_puxada)}</td>
                      <td className="px-3 py-2 whitespace-nowrap font-semibold text-cobeb-navy">{l.numero_pedido}</td>
                      <td className="px-3 py-2 whitespace-nowrap text-cobeb-text">{l.fabrica || '—'}</td>
                      <td className="px-3 py-2 whitespace-nowrap text-cobeb-text">{l.unidade}</td>
                      <td className="px-3 py-2 whitespace-nowrap text-slate-600">{l.cod_produto || '—'}</td>
                      <td className="px-3 py-2 text-cobeb-text min-w-[180px]">{l.descricao || '—'}</td>
                      <td className="px-3 py-2 text-right whitespace-nowrap text-cobeb-text">{fmtHl(l.hl)}</td>
                      <td className="px-3 py-2 text-right whitespace-nowrap text-cobeb-text">{fmtInt(l.cx)}</td>
                      <td className="px-3 py-2 text-right whitespace-nowrap text-cobeb-text">{fmtPlt(l.pallets)}</td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        <select
                          value={j.motivo_id}
                          onChange={e => salvar(l.id, { motivo_id: e.target.value })}
                          className="text-sm border border-cobeb-border rounded-lg px-2 py-1.5 min-w-[150px] focus:outline-none focus:border-cobeb-blue bg-white">
                          <option value="">Selecione…</option>
                          {motivos.map(m => <option key={m.id} value={m.id}>{m.descricao}</option>)}
                          {/* Motivo salvo que foi desativado depois: ainda mostra o rótulo */}
                          {j.motivo_id && !motivos.some(m => m.id === j.motivo_id) && (
                            <option value={j.motivo_id}>(motivo inativo)</option>
                          )}
                        </select>
                      </td>
                      <td className="px-3 py-2">
                        <div className="relative">
                          <input
                            defaultValue={j.observacao}
                            onBlur={e => {
                              const v = e.target.value
                              if (v !== (j.observacao ?? '')) salvar(l.id, { observacao: v })
                            }}
                            placeholder="Digite uma observação…"
                            className="text-sm border border-cobeb-border rounded-lg px-2 py-1.5 min-w-[200px] w-full focus:outline-none focus:border-cobeb-blue" />
                          {salvos[l.id] && (
                            <Check size={14} className="text-green-500 absolute right-2 top-1/2 -translate-y-1/2" />
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {!loading && filtradas.length > 0 && (
          <p className="text-slate-400 text-xs mt-3 px-1">{filtradas.length} furo(s) listado(s)</p>
        )}
      </main>
    </div>
  )
}
