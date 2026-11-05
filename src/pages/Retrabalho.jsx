import { useState, useEffect } from 'react'
import { RotateCcw, Package, RefreshCw, LogOut, LayoutGrid } from 'lucide-react'
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

export default function Retrabalho() {
  const { profile, signOut, modoVisao, setModoVisao } = useAuth()
  const navigate = useNavigate()
  const [itens,   setItens]   = useState([])
  const [loading, setLoading] = useState(true)
  const [filtro,  setFiltro]  = useState('7dias')
  const [erro,    setErro]    = useState(null)

  useEffect(() => { load() }, [filtro])

  async function load() {
    setLoading(true)
    setErro(null)
    let q = supabase
      .from('tarefas_retrabalho')
      .select(`
        id, qtde_unidades, qtde_paletes, data_validade, descricao_motivo,
        cod_produto, descricao_produto, embalagem_produto,
        numero_nf, motorista_nome, placa_carreta, created_at
      `)
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
      <main className="max-w-lg mx-auto px-4 pt-4 pb-8 space-y-4">

        {/* Filtro de período */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <p className="text-cobeb-text font-semibold text-sm">
            Paletes para Retrabalho
            {!loading && <span className="text-slate-500 font-normal ml-2">({itens.length})</span>}
          </p>
          <div className="flex rounded-xl border border-cobeb-border overflow-hidden text-xs font-semibold bg-white">
            {[
              { value: 'hoje',  label: 'Hoje' },
              { value: '7dias', label: '7 dias' },
              { value: 'tudo',  label: 'Tudo' },
            ].map(({ value, label }) => (
              <button key={value} onClick={() => setFiltro(value)}
                className={`px-3 py-1.5 transition-colors ${
                  filtro === value
                    ? 'bg-cobeb-navy text-white'
                    : 'text-slate-500 hover:bg-[#EBF5FF]'
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
            <p className="text-cobeb-text font-semibold text-sm">Nenhum palete no período</p>
            <p className="text-slate-500 text-xs mt-1">Paletes com anomalia na blitz de puxada aparecem aqui</p>
          </div>
        ) : (
          <div className="space-y-3">
            {itens.map(item => (
              <div key={item.id} className="bg-white rounded-2xl border border-purple-500/20 overflow-hidden">
                <div className="px-4 pt-3 pb-2.5 border-b border-cobeb-border/50">
                  <p className="text-cobeb-text text-xs font-medium leading-snug">
                    {item.descricao_produto ?? 'Produto'}
                  </p>
                  <p className="text-slate-500 text-[10px] font-mono mt-0.5">
                    {item.cod_produto}
                    {item.embalagem_produto ? ` · ${item.embalagem_produto}` : ''}
                  </p>
                </div>
                <div className="px-4 py-3 space-y-1.5">
                  <div className="flex items-center gap-2 flex-wrap text-xs text-slate-500">
                    <span className="flex items-center gap-1">
                      <Package size={11} className="text-purple-500" />
                      <span className="text-cobeb-text font-semibold">{Number(item.qtde_paletes).toLocaleString('pt-BR')}</span> plt
                      {item.qtde_unidades != null && (
                        <span className="ml-1">· <span className="text-cobeb-text font-semibold">{Number(item.qtde_unidades).toLocaleString('pt-BR')}</span> und</span>
                      )}
                    </span>
                    {item.data_validade && (
                      <span>Val: {formatData(item.data_validade)}</span>
                    )}
                  </div>
                  {item.descricao_motivo && (
                    <span className="inline-flex text-[10px] font-semibold bg-orange-500/10 text-orange-600 border border-orange-500/20 px-2 py-0.5 rounded-full">
                      {item.descricao_motivo}
                    </span>
                  )}
                  <div className="flex items-center gap-2 text-[10px] text-slate-400 pt-0.5 flex-wrap">
                    {item.numero_nf      && <span>NF {item.numero_nf}</span>}
                    {item.motorista_nome && <span>· {item.motorista_nome}</span>}
                    {item.placa_carreta  && <span>· {item.placa_carreta}</span>}
                    <span className="ml-auto">{formatTs(item.created_at)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
