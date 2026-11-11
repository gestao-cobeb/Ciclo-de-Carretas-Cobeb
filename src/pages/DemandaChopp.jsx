import { useState, useEffect, useMemo } from 'react'
import {
  Beer, LogOut, LayoutGrid, Plus, Lock, Trash2, Pencil,
  ChevronLeft, ChevronRight, Check, X,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'

const MESES = [
  'Janeiro','Fevereiro','Março','Abril','Maio','Junho',
  'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro',
]

// Semana no padrão do Dashboard: dias 1–7, 8–14, 15–21, 22–fim do mês
function semanaLimites(sem, year, month0) {
  const ultimo = new Date(year, month0 + 1, 0).getDate()
  return { ini: (sem - 1) * 7 + 1, fim: sem < 4 ? sem * 7 : ultimo }
}
function semanaDoDia(day) {
  if (day <= 7)  return 1
  if (day <= 14) return 2
  if (day <= 21) return 3
  return 4
}

const pad  = n => String(n).padStart(2, '0')
const fmtL = n => Number(n || 0).toLocaleString('pt-BR', { maximumFractionDigits: 1 })
const fmtU = n => Number(n || 0).toLocaleString('pt-BR', { maximumFractionDigits: 2 })

export default function DemandaChopp() {
  const { profile, signOut, modoVisao, setModoVisao } = useAuth()
  const navigate = useNavigate()
  const isAdminTotal = profile?.acesso_total === true

  const now = useMemo(() => new Date(), [])
  const [aba,    setAba]    = useState('solicitar') // 'solicitar' | 'puxado'
  const [ano,    setAno]    = useState(now.getFullYear())
  const [mes,    setMes]    = useState(now.getMonth())           // 0–11
  const [semana, setSemana] = useState(semanaDoDia(now.getDate()))

  const [unidades,  setUnidades]  = useState([])
  const [deParaMap, setDeParaMap] = useState({}) // codigo -> { descricao, litros_por_barril, caixas_pallet }

  useEffect(() => {
    async function load() {
      const [{ data: unis }, { data: dep }] = await Promise.all([
        supabase.from('unidades').select('id, nome').eq('tipo', 'revenda').eq('ativo', true).order('nome'),
        supabase.from('chopp_litros').select('codigo, descricao, litros_por_barril'),
      ])
      setUnidades(unis ?? [])
      const codes = (dep ?? []).map(d => d.codigo)
      let catMap = {}
      if (codes.length) {
        const { data: cat } = await supabase
          .from('produtos_catalogo')
          .select('codigo, caixas_pallet')
          .in('codigo', codes)
        ;(cat ?? []).forEach(c => { catMap[c.codigo] = c.caixas_pallet })
      }
      const m = {}
      ;(dep ?? []).forEach(d => {
        m[d.codigo] = { ...d, caixas_pallet: catMap[d.codigo] ?? null }
      })
      setDeParaMap(m)
    }
    load()
  }, [])

  function navMes(dir) {
    let m = mes + dir, y = ano
    if (m < 0)  { m = 11; y-- }
    if (m > 11) { m = 0;  y++ }
    setMes(m); setAno(y)
  }

  return (
    <div className="min-h-screen bg-[#EBF5FF]">

      {/* Header */}
      <header className="sticky top-0 z-40 bg-cobeb-navy border-b border-blue-800 px-3 py-2 sm:px-5 sm:py-3.5 flex items-center justify-between shadow-md shadow-cobeb-navy/20">
        <div className="flex items-center gap-2 min-w-0">
          <Beer size={16} className="text-yellow-400 shrink-0" />
          <p className="text-white text-sm font-semibold truncate">Demanda de Chopp</p>
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

      <main className="max-w-lg mx-auto px-4 pt-4 pb-10 space-y-4">

        {/* Abas */}
        <div className="flex rounded-2xl border border-cobeb-border overflow-hidden text-sm font-semibold bg-white">
          {[
            { value: 'solicitar', label: 'Solicitar Demanda' },
            { value: 'puxado',    label: 'Volume Puxado' },
          ].map(({ value, label }) => (
            <button key={value} onClick={() => setAba(value)}
              className={`flex-1 py-2.5 transition-colors ${
                aba === value ? 'bg-cobeb-navy text-white' : 'text-slate-500 hover:bg-[#EBF5FF]'
              }`}>
              {label}
            </button>
          ))}
        </div>

        {/* Seletor de período (mês + semana) — compartilhado pelas duas abas */}
        <div className="bg-white rounded-2xl border border-cobeb-border p-3 space-y-3">
          <div className="flex items-center gap-2">
            <button onClick={() => navMes(-1)} className="p-1.5 rounded-xl border border-cobeb-border text-slate-500 hover:text-cobeb-navy transition-colors">
              <ChevronLeft size={15} />
            </button>
            <span className="text-cobeb-text font-semibold text-sm flex-1 text-center">{MESES[mes]} {ano}</span>
            <button onClick={() => navMes(1)} className="p-1.5 rounded-xl border border-cobeb-border text-slate-500 hover:text-cobeb-navy transition-colors">
              <ChevronRight size={15} />
            </button>
          </div>
          <div className="grid grid-cols-4 gap-2">
            {[1, 2, 3, 4].map(s => {
              const { ini, fim } = semanaLimites(s, ano, mes)
              return (
                <button key={s} onClick={() => setSemana(s)}
                  className={`py-1.5 rounded-xl border text-xs font-semibold transition-colors ${
                    semana === s ? 'bg-cobeb-navy border-cobeb-navy text-white' : 'bg-[#EBF5FF] border-cobeb-border text-slate-500'
                  }`}>
                  <span className="block">Sem. {s}</span>
                  <span className="block text-[9px] font-normal opacity-80">{pad(ini)}–{pad(fim)}</span>
                </button>
              )
            })}
          </div>
        </div>

        {aba === 'solicitar' ? (
          <SolicitarDemanda
            ano={ano} mes={mes} semana={semana}
            unidades={unidades} deParaMap={deParaMap}
            isAdminTotal={isAdminTotal} profile={profile}
          />
        ) : (
          <VolumePuxado
            ano={ano} mes={mes} semana={semana}
            unidades={unidades} deParaMap={deParaMap}
          />
        )}
      </main>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════
// ABA 1 — SOLICITAR DEMANDA
// ════════════════════════════════════════════════════════════════
function SolicitarDemanda({ ano, mes, semana, unidades, deParaMap, isAdminTotal, profile }) {
  const [unidadeId, setUnidadeId] = useState('')
  const [codigo,    setCodigo]    = useState('')
  const [descricao, setDescricao] = useState('')
  const [litrosBarril, setLitrosBarril] = useState(null)
  const [qtde,      setQtde]      = useState('')
  const [erro,      setErro]      = useState('')
  const [salvando,  setSalvando]  = useState(false)

  const [itens,    setItens]    = useState([])   // rascunho: vários itens numa única demanda

  const [demandas, setDemandas] = useState([])
  const [loading,  setLoading]  = useState(true)
  const [editId,   setEditId]   = useState(null)
  const [editQtde, setEditQtde] = useState('')
  const [excluindo, setExcluindo] = useState(null)

  const litros = (parseFloat(String(qtde).replace(',', '.')) || 0) * (litrosBarril || 0)

  // Já existe demanda enviada para esta unidade nesta semana? Então não pode enviar de novo.
  const jaEnviada = !!unidadeId && demandas.some(d => d.unidade_id === unidadeId)
  const totalUn   = itens.reduce((s, it) => s + it.qtde, 0)
  const totalL    = itens.reduce((s, it) => s + it.litros, 0)

  useEffect(() => { carregar() }, [ano, mes, semana])
  // Troca de unidade limpa o rascunho (evita misturar itens de unidades diferentes)
  useEffect(() => { setItens([]); setErro('') }, [unidadeId])

  async function carregar() {
    setLoading(true)
    const { data } = await supabase
      .from('demanda_chopp')
      .select('*, unidade:unidades(nome)')
      .eq('ano', ano).eq('mes', mes + 1).eq('semana', semana)
      .order('created_at', { ascending: false })
    setDemandas(data ?? [])
    setLoading(false)
  }

  // Ao sair do campo de código: busca no de-para; se não houver, busca a descrição do catálogo
  async function buscarCodigo() {
    const cod = codigo.trim()
    setErro('')
    if (!cod) { setDescricao(''); setLitrosBarril(null); return }
    const dep = deParaMap[cod]
    if (dep) {
      setDescricao(dep.descricao || '')
      setLitrosBarril(Number(dep.litros_por_barril))
      return
    }
    // Não está no de-para: mostra a descrição do catálogo (se existir) e avisa
    const { data } = await supabase
      .from('produtos_catalogo').select('descricao').eq('codigo', cod).maybeSingle()
    setDescricao(data?.descricao || '')
    setLitrosBarril(null)
    setErro(`Código ${cod} não tem litros cadastrados. Cadastre em Cadastros › Metas › De-para de Litros do Chopp.`)
  }

  function adicionarItem() {
    setErro('')
    const cod = codigo.trim()
    const q   = parseFloat(String(qtde).replace(',', '.'))
    if (!cod)          { setErro('Informe o código do chopp.'); return }
    if (!litrosBarril) { setErro('Código sem litros cadastrados no de-para (Cadastros › Metas).'); return }
    if (!(q > 0))      { setErro('Informe a quantidade em unidades (maior que zero).'); return }
    if (itens.some(it => it.codigo === cod)) { setErro(`Código ${cod} já está na lista.`); return }
    setItens(prev => [...prev, { codigo: cod, descricao, litrosBarril, qtde: q, litros: q * litrosBarril }])
    setCodigo(''); setDescricao(''); setLitrosBarril(null); setQtde('')
  }

  function removerItem(cod) {
    setItens(prev => prev.filter(it => it.codigo !== cod))
  }

  async function enviar() {
    setErro('')
    if (!unidadeId)         { setErro('Selecione a unidade.'); return }
    if (jaEnviada)          { setErro('Já existe demanda enviada para esta unidade nesta semana.'); return }
    if (itens.length === 0) { setErro('Adicione pelo menos um item à demanda.'); return }

    setSalvando(true)
    const rows = itens.map(it => ({
      unidade_id:          unidadeId,
      ano, mes: mes + 1, semana,
      codigo:              it.codigo,
      descricao:           it.descricao || null,
      qtde_unidades:       it.qtde,
      litros_por_barril:   it.litrosBarril,
      litros:              it.litros,
      solicitado_por:      profile?.id ?? null,
      solicitado_por_nome: profile?.nome ?? null,
    }))
    const { error } = await supabase.from('demanda_chopp').insert(rows)
    setSalvando(false)
    if (error) { setErro('Erro ao enviar: ' + error.message); return }
    setItens([])
    carregar()
  }

  async function salvarEdicao(d) {
    const q = parseFloat(String(editQtde).replace(',', '.'))
    if (!(q > 0)) { alert('Quantidade inválida.'); return }
    const { error } = await supabase.from('demanda_chopp').update({
      qtde_unidades: q,
      litros: q * (Number(d.litros_por_barril) || 0),
    }).eq('id', d.id)
    if (error) { alert('Erro ao salvar: ' + error.message); return }
    setEditId(null)
    carregar()
  }

  async function excluir(d) {
    if (!window.confirm(`Excluir a demanda de ${d.codigo} (${fmtU(d.qtde_unidades)} un)?`)) return
    setExcluindo(d.id)
    const { error } = await supabase.from('demanda_chopp').delete().eq('id', d.id)
    setExcluindo(null)
    if (error) { alert('Erro ao excluir: ' + error.message); return }
    setDemandas(prev => prev.filter(x => x.id !== d.id))
  }

  const inputCls = 'w-full bg-[#F5F9FF] border border-cobeb-border rounded-xl px-3 py-2.5 text-cobeb-text text-sm focus:outline-none focus:border-cobeb-blue transition-all'

  return (
    <div className="space-y-4">

      {/* Formulário */}
      <div className="bg-white rounded-2xl border border-cobeb-border p-4 space-y-3">
        <p className="text-cobeb-text font-semibold text-sm">
          Nova demanda — <span className="text-cobeb-navy">{MESES[mes]} • Semana {semana}</span>
        </p>

        <div>
          <label className="block text-slate-500 text-[11px] font-semibold uppercase tracking-widest mb-1.5">Unidade *</label>
          <select value={unidadeId} onChange={e => setUnidadeId(e.target.value)}
            className={`${inputCls} appearance-none cursor-pointer`}>
            <option value="">— Selecionar —</option>
            {unidades.map(u => <option key={u.id} value={u.id}>{u.nome}</option>)}
          </select>
        </div>

        {jaEnviada ? (
          <div className="bg-green-500/10 border border-green-500/20 rounded-xl px-4 py-3 text-sm text-green-700 flex items-start gap-2">
            <Lock size={15} className="shrink-0 mt-0.5" />
            <span>
              Demanda já enviada para esta unidade nesta semana — não é possível enviar novamente.
              {isAdminTotal && ' Para refazer, exclua os itens na lista abaixo.'}
            </span>
          </div>
        ) : (
          <>
            {/* Entrada de item */}
            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-1">
                <label className="block text-slate-500 text-[11px] font-semibold uppercase tracking-widest mb-1.5">Código *</label>
                <input type="text" value={codigo}
                  onChange={e => setCodigo(e.target.value)} onBlur={buscarCodigo}
                  placeholder="Código" className={inputCls} />
              </div>
              <div className="col-span-2">
                <label className="block text-slate-500 text-[11px] font-semibold uppercase tracking-widest mb-1.5">Descrição</label>
                <input type="text" value={descricao} readOnly
                  placeholder="— busca pelo código —"
                  className={`${inputCls} bg-slate-50 text-slate-500`} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-slate-500 text-[11px] font-semibold uppercase tracking-widest mb-1.5">Qtde (unidades) *</label>
                <input type="number" min="0" step="0.01" value={qtde}
                  onChange={e => setQtde(e.target.value)}
                  placeholder="0" className={`${inputCls} text-right [appearance:textfield]`} />
              </div>
              <div>
                <label className="block text-slate-500 text-[11px] font-semibold uppercase tracking-widest mb-1.5">Litros</label>
                <div className={`${inputCls} bg-slate-50 text-right font-semibold text-cobeb-navy`}>
                  {fmtL(litros)} L
                </div>
                {litrosBarril != null && (
                  <p className="text-[10px] text-slate-400 mt-1 text-right">{fmtL(litrosBarril)} L / barril</p>
                )}
              </div>
            </div>

            {erro && <p className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-2.5 text-red-500 text-sm">{erro}</p>}

            <button onClick={adicionarItem}
              className="w-full border border-cobeb-navy text-cobeb-navy hover:bg-cobeb-navy/5 font-semibold py-2.5 rounded-xl transition-colors text-sm flex items-center justify-center gap-1.5">
              <Plus size={15} /> Adicionar item
            </button>

            {/* Rascunho de itens */}
            {itens.length > 0 && (
              <div className="rounded-xl border border-cobeb-border divide-y divide-cobeb-border/50 overflow-hidden">
                {itens.map(it => (
                  <div key={it.codigo} className="flex items-center justify-between gap-2 px-3 py-2">
                    <div className="min-w-0">
                      <p className="text-sm text-cobeb-text truncate">
                        <span className="font-mono text-cobeb-navy">{it.codigo}</span>
                        {it.descricao ? ` — ${it.descricao}` : ''}
                      </p>
                      <p className="text-[11px] text-slate-500">{fmtU(it.qtde)} un · {fmtL(it.litros)} L</p>
                    </div>
                    <button onClick={() => removerItem(it.codigo)}
                      className="text-slate-400 hover:text-red-500 p-1 shrink-0" title="Remover item">
                      <Trash2 size={15} />
                    </button>
                  </div>
                ))}
                <div className="flex items-center justify-between px-3 py-2 bg-[#EBF5FF]/60">
                  <span className="text-xs font-semibold text-cobeb-text">{itens.length} item(ns)</span>
                  <span className="text-xs font-semibold text-cobeb-navy">{fmtU(totalUn)} un · {fmtL(totalL)} L</span>
                </div>
              </div>
            )}

            <div className="flex items-center gap-2 text-[11px] text-slate-400">
              <Lock size={12} className="shrink-0" />
              <span>Envie uma única vez. Após enviar, não dá para enviar de novo nesta semana; só o acesso total altera ou exclui.</span>
            </div>

            <button onClick={enviar} disabled={salvando || itens.length === 0}
              className="w-full bg-yellow-500 hover:bg-yellow-600 disabled:opacity-50 text-white font-semibold py-3 rounded-xl transition-colors text-sm flex items-center justify-center gap-1.5">
              <Plus size={15} /> {salvando ? 'Enviando...' : `Enviar demanda${itens.length ? ` (${itens.length})` : ''}`}
            </button>
          </>
        )}
      </div>

      {/* Lista da semana */}
      <div className="bg-white rounded-2xl border border-cobeb-border p-4">
        <p className="text-cobeb-text font-semibold text-sm mb-3">
          Demandas da semana {loading ? '' : `(${demandas.length})`}
        </p>
        {loading ? (
          <div className="flex justify-center py-6">
            <div className="w-5 h-5 border-2 border-cobeb-navy border-t-transparent rounded-full animate-spin" />
          </div>
        ) : demandas.length === 0 ? (
          <p className="text-slate-400 text-sm text-center py-4">Nenhuma demanda solicitada nesta semana.</p>
        ) : (
          <div className="space-y-2">
            {demandas.map(d => (
              <div key={d.id} className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl border border-cobeb-border bg-[#EBF5FF]/50">
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-cobeb-text font-medium truncate">
                    <span className="font-mono text-cobeb-navy">{d.codigo}</span>
                    {d.descricao ? ` — ${d.descricao}` : ''}
                  </p>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    {d.unidade?.nome ?? '—'} · {fmtU(d.qtde_unidades)} un · {fmtL(d.litros)} L
                    {d.solicitado_por_nome ? ` · ${d.solicitado_por_nome}` : ''}
                  </p>
                </div>
                {isAdminTotal ? (
                  editId === d.id ? (
                    <div className="flex items-center gap-1.5 shrink-0">
                      <input type="number" min="0" step="0.01" value={editQtde}
                        onChange={e => setEditQtde(e.target.value)}
                        className="w-20 text-sm border border-cobeb-border rounded-lg px-2 py-1 text-right [appearance:textfield]" />
                      <button onClick={() => salvarEdicao(d)} className="text-green-600 p-1"><Check size={16} /></button>
                      <button onClick={() => setEditId(null)} className="text-slate-400 p-1"><X size={16} /></button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1 shrink-0">
                      <button onClick={() => { setEditId(d.id); setEditQtde(String(d.qtde_unidades)) }}
                        className="text-slate-400 hover:text-cobeb-navy p-1" title="Editar"><Pencil size={15} /></button>
                      <button onClick={() => excluir(d)} disabled={excluindo === d.id}
                        className="text-slate-400 hover:text-red-500 p-1" title="Excluir">
                        {excluindo === d.id
                          ? <div className="w-4 h-4 border-2 border-red-300 border-t-red-500 rounded-full animate-spin" />
                          : <Trash2 size={15} />}
                      </button>
                    </div>
                  )
                ) : (
                  <Lock size={14} className="text-slate-300 shrink-0" title="Enviada — somente admin total edita" />
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════
// ABA 2 — VOLUME PUXADO (demanda x puxado da semana)
// ════════════════════════════════════════════════════════════════
function VolumePuxado({ ano, mes, semana, unidades, deParaMap }) {
  const [filtroUnidade, setFiltroUnidade] = useState('')
  const [loading, setLoading] = useState(true)
  const [linhas,  setLinhas]  = useState([])

  useEffect(() => { carregar() }, [ano, mes, semana, filtroUnidade, deParaMap])

  async function carregar() {
    setLoading(true)
    const { ini, fim } = semanaLimites(semana, ano, mes)
    const dataInicio = `${ano}-${pad(mes + 1)}-${pad(ini)}`
    const dataFim    = `${ano}-${pad(mes + 1)}-${pad(fim)}`

    // Demanda solicitada
    let qd = supabase.from('demanda_chopp')
      .select('codigo, descricao, qtde_unidades, litros, unidade_id')
      .eq('ano', ano).eq('mes', mes + 1).eq('semana', semana)
    if (filtroUnidade) qd = qd.eq('unidade_id', filtroUnidade)

    // Puxado (pedidos) no intervalo da semana
    let qp = supabase.from('pedidos')
      .select('cod_produto, qtde_pallets, qtde_skus, status, unidade_id')
      .gte('data_puxada', dataInicio).lte('data_puxada', dataFim)
      .neq('status', 'cancelado')
      .not('cod_produto', 'is', null)
    if (filtroUnidade) qp = qp.eq('unidade_id', filtroUnidade)

    const [{ data: dem }, { data: peds }] = await Promise.all([qd, qp])

    const acc = {}
    const linha = (cod) => {
      if (!acc[cod]) {
        acc[cod] = {
          codigo: cod,
          descricao: deParaMap[cod]?.descricao || cod,
          demUn: 0, demL: 0, puxUn: 0, puxL: 0,
        }
      }
      return acc[cod]
    }

    ;(dem ?? []).forEach(d => {
      const l = linha(d.codigo)
      l.demUn += Number(d.qtde_unidades) || 0
      l.demL  += Number(d.litros) || 0
    })

    ;(peds ?? []).forEach(p => {
      const dep = deParaMap[p.cod_produto]
      if (!dep) return // só conta o que está no de-para de chopp
      const barris = Number(p.qtde_skus) > 0
        ? Number(p.qtde_skus)
        : Math.round((Number(p.qtde_pallets) || 0) * (Number(dep.caixas_pallet) || 0))
      const l = linha(p.cod_produto)
      l.puxUn += barris
      l.puxL  += barris * (Number(dep.litros_por_barril) || 0)
    })

    const arr = Object.values(acc).sort((a, b) => b.puxL - a.puxL || b.demL - a.demL)
    setLinhas(arr)
    setLoading(false)
  }

  const tot = linhas.reduce((t, l) => ({
    demUn: t.demUn + l.demUn, demL: t.demL + l.demL,
    puxUn: t.puxUn + l.puxUn, puxL: t.puxL + l.puxL,
  }), { demUn: 0, demL: 0, puxUn: 0, puxL: 0 })

  return (
    <div className="space-y-4">

      {/* Filtro de unidade */}
      <div className="bg-white rounded-2xl border border-cobeb-border p-3">
        <label className="block text-slate-500 text-[11px] font-semibold uppercase tracking-widest mb-1.5">Unidade</label>
        <select value={filtroUnidade} onChange={e => setFiltroUnidade(e.target.value)}
          className="w-full bg-[#F5F9FF] border border-cobeb-border rounded-xl px-3 py-2.5 text-cobeb-text text-sm appearance-none cursor-pointer focus:outline-none focus:border-cobeb-blue">
          <option value="">Todas as unidades</option>
          {unidades.map(u => <option key={u.id} value={u.id}>{u.nome}</option>)}
        </select>
      </div>

      {/* Totais */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white rounded-2xl border border-cobeb-border p-4">
          <p className="text-[11px] text-slate-500 uppercase tracking-widest font-semibold">Demanda</p>
          <p className="text-xl font-bold text-cobeb-navy mt-1">{fmtL(tot.demL)} L</p>
          <p className="text-[11px] text-slate-400 mt-0.5">{fmtU(tot.demUn)} un</p>
        </div>
        <div className="bg-white rounded-2xl border border-cobeb-border p-4">
          <p className="text-[11px] text-slate-500 uppercase tracking-widest font-semibold">Puxado</p>
          <p className="text-xl font-bold text-yellow-600 mt-1">{fmtL(tot.puxL)} L</p>
          <p className="text-[11px] text-slate-400 mt-0.5">{fmtU(tot.puxUn)} un</p>
        </div>
      </div>

      {/* Tabela por código */}
      <div className="bg-white rounded-2xl border border-cobeb-border p-4">
        <p className="text-cobeb-text font-semibold text-sm mb-3">
          Demanda × Puxado — <span className="text-cobeb-navy">{MESES[mes]} • Semana {semana}</span>
        </p>
        {loading ? (
          <div className="flex justify-center py-6">
            <div className="w-5 h-5 border-2 border-cobeb-navy border-t-transparent rounded-full animate-spin" />
          </div>
        ) : linhas.length === 0 ? (
          <p className="text-slate-400 text-sm text-center py-4">Sem demanda ou puxada de chopp nesta semana.</p>
        ) : (
          <div className="overflow-x-auto -mx-1">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-[10px] text-slate-400 uppercase tracking-wide">
                  <th className="text-left font-semibold py-1.5 px-1">Produto</th>
                  <th className="text-right font-semibold py-1.5 px-1">Demanda (L)</th>
                  <th className="text-right font-semibold py-1.5 px-1">Puxado (L)</th>
                  <th className="text-right font-semibold py-1.5 px-1">Dif.</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-cobeb-border/40">
                {linhas.map(l => {
                  const dif = l.puxL - l.demL
                  return (
                    <tr key={l.codigo}>
                      <td className="py-2.5 px-1 align-top">
                        <p className="text-sm font-mono font-bold text-cobeb-navy leading-tight">{l.codigo}</p>
                        <p className="text-[13px] text-cobeb-text leading-snug break-words mt-0.5">{l.descricao}</p>
                      </td>
                      <td className="py-2.5 px-1 text-right text-slate-600 whitespace-nowrap align-top">{fmtL(l.demL)}</td>
                      <td className="py-2.5 px-1 text-right text-slate-600 whitespace-nowrap align-top">{fmtL(l.puxL)}</td>
                      <td className={`py-2.5 px-1 text-right font-semibold whitespace-nowrap align-top ${dif < 0 ? 'text-red-500' : 'text-green-600'}`}>
                        {dif > 0 ? '+' : ''}{fmtL(dif)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
