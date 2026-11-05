import { useState, useEffect } from 'react'
import { ChevronLeft, LogOut, CheckCircle, AlertTriangle, Package, X, RotateCcw, LayoutGrid } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

function formatData(iso) {
  if (!iso) return null
  return new Date(iso + 'T12:00:00').toLocaleDateString('pt-BR')
}

export default function BlitzView({ tarefa, onVoltar }) {
  const { profile, signOut, modoVisao, setModoVisao } = useAuth()
  const navigate = useNavigate()

  const [itens,       setItens]       = useState([])
  const [pedidoMap,   setPedidoMap]   = useState({})
  const [motivos,     setMotivos]     = useState([])
  const [blitzState,  setBlitzState]  = useState({}) // confItem.id → apontamento local
  const [loading,     setLoading]     = useState(true)
  const [modalData,   setModalData]   = useState(null)
  const [salvando,    setSalvando]    = useState(false)

  const readOnly = !!tarefa.blitz_concluida

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const viagemId = tarefa.viagem?.id ?? tarefa.viagem_id
    const [{ data: itemsD }, { data: pedsD }, { data: motivosD }, { data: apoD }] = await Promise.all([
      supabase.from('conferencia_itens')
        .select('*').eq('tarefa_id', tarefa.id).gt('qtde_recebida', 0).order('created_at'),
      viagemId
        ? supabase.from('pedidos')
            .select('id, cod_produto, descricao, qtde_pallets, qtde_skus, embalagem')
            .eq('viagem_id', viagemId)
        : Promise.resolve({ data: [] }),
      supabase.from('motivos_blitz').select('id, descricao').eq('ativo', true).order('descricao'),
      supabase.from('blitz_apontamentos').select('*').eq('tarefa_id', tarefa.id),
    ])

    setItens(itemsD ?? [])

    const pm = {}
    ;(pedsD ?? []).forEach(p => { pm[p.id] = p })
    setPedidoMap(pm)

    setMotivos(motivosD ?? [])

    const bs = {}
    ;(apoD ?? []).forEach(a => { bs[a.conferencia_item_id] = a })
    setBlitzState(bs)

    setLoading(false)
  }

  function marcarSemAnomalia(confItem) {
    if (readOnly) return
    setBlitzState(prev => ({
      ...prev,
      [confItem.id]: { sem_anomalia: true, motivo_id: null, qtde_unidades: null, qtde_paletes_retrabalho: null },
    }))
  }

  function resetItem(itemId) {
    setBlitzState(prev => {
      const next = { ...prev }
      delete next[itemId]
      return next
    })
  }

  function abrirModal(confItem) {
    if (readOnly) return
    const existing = blitzState[confItem.id]
    const pedido   = pedidoMap[confItem.pedido_id]
    setModalData({
      confItem,
      pedido,
      maxPaletes:              Math.ceil(Number(confItem.qtde_recebida)),
      motivo_id:               existing?.motivo_id              ?? '',
      qtde_unidades:           existing?.qtde_unidades          != null ? String(existing.qtde_unidades) : '',
      qtde_paletes_retrabalho: existing?.qtde_paletes_retrabalho != null ? String(existing.qtde_paletes_retrabalho) : '',
    })
  }

  function confirmarAnomalia() {
    const { confItem, motivo_id, qtde_unidades, qtde_paletes_retrabalho } = modalData
    setBlitzState(prev => ({
      ...prev,
      [confItem.id]: {
        sem_anomalia:            false,
        motivo_id,
        qtde_unidades:           Number(qtde_unidades),
        qtde_paletes_retrabalho: Number(qtde_paletes_retrabalho),
      },
    }))
    setModalData(null)
  }

  const todosApontados = itens.length > 0 && itens.every(i => blitzState[i.id])

  async function finalizar() {
    if (!todosApontados || salvando) return
    setSalvando(true)

    const motivoMap = {}
    motivos.forEach(m => { motivoMap[m.id] = m.descricao })

    const apontamentos = itens.map(item => ({
      tarefa_id:               tarefa.id,
      conferencia_item_id:     item.id,
      pedido_id:               item.pedido_id,
      sem_anomalia:            blitzState[item.id].sem_anomalia,
      motivo_id:               blitzState[item.id].motivo_id               ?? null,
      qtde_unidades:           blitzState[item.id].qtde_unidades            ?? null,
      qtde_paletes_retrabalho: blitzState[item.id].qtde_paletes_retrabalho  ?? null,
      conferente_id:           profile.id,
    }))

    const { error: apoErr } = await supabase.from('blitz_apontamentos').insert(apontamentos)
    if (apoErr) { alert('Erro ao salvar: ' + apoErr.message); setSalvando(false); return }

    const comAnomalia = itens.filter(i => !blitzState[i.id].sem_anomalia)
    if (comAnomalia.length > 0) {
      const retrabalhos = comAnomalia.map(item => ({
        tarefa_id:           tarefa.id,
        conferencia_item_id: item.id,
        pedido_id:           item.pedido_id,
        motivo_id:           blitzState[item.id].motivo_id ?? null,
        descricao_motivo:    motivoMap[blitzState[item.id].motivo_id] ?? '',
        qtde_unidades:       blitzState[item.id].qtde_unidades,
        qtde_paletes:        blitzState[item.id].qtde_paletes_retrabalho,
        data_validade:       item.data_validade ?? null,
        unidade_id:          tarefa.unidade_id,
      }))
      const { error: retErr } = await supabase.from('tarefas_retrabalho').insert(retrabalhos)
      if (retErr) { alert('Erro ao criar retrabalho: ' + retErr.message); setSalvando(false); return }
    }

    await supabase.from('tarefas').update({ blitz_concluida: true }).eq('id', tarefa.id)
    setSalvando(false)
    onVoltar()
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#EBF5FF] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-purple-600 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  const apontados    = Object.keys(blitzState).length
  const comAnomalia  = itens.filter(i => blitzState[i.id] && !blitzState[i.id].sem_anomalia).length

  return (
    <div className="min-h-screen bg-[#EBF5FF]">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-cobeb-navy border-b border-blue-800 px-4 py-3 shadow-md shadow-cobeb-navy/20">
        <div className="flex items-center gap-3 mb-1">
          <button onClick={onVoltar}
            className="text-blue-300/70 hover:text-white transition-colors p-1.5 rounded-lg hover:bg-white/10 -ml-1">
            <ChevronLeft size={20} />
          </button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <RotateCcw size={13} className="text-purple-400 shrink-0" />
              <p className="text-white text-sm font-semibold truncate">
                Blitz Puxada — NF {tarefa.numero_nf}
              </p>
            </div>
            <p className="text-blue-300/60 text-[11px] truncate">
              {tarefa.viagem?.motorista?.nome ?? ''}
              {tarefa.viagem?.carreta?.placa  && ` · ${tarefa.viagem.carreta.placa}`}
              {tarefa.viagem?.cavalo?.placa   && ` / ${tarefa.viagem.cavalo.placa}`}
            </p>
          </div>
          {readOnly && (
            <span className="text-[10px] font-semibold bg-green-500/20 text-green-400 border border-green-500/30 px-2 py-0.5 rounded-full shrink-0">
              Concluída
            </span>
          )}
          <div className="flex gap-1">
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
        </div>
      </header>

      {/* Body */}
      <main className="max-w-lg mx-auto px-4 pt-4 pb-32 space-y-3">

        {/* Resumo */}
        <div className="bg-white rounded-2xl border border-cobeb-border px-4 py-3 flex items-center justify-between">
          <span className="text-xs text-slate-500 flex items-center gap-2">
            <Package size={13} className="text-purple-500" />
            <span className="text-cobeb-text font-semibold">{itens.length}</span> item(ns)
          </span>
          <div className="flex items-center gap-3 text-xs text-slate-500">
            <span>
              <span className="text-cobeb-text font-semibold">{apontados}</span> apontado(s)
            </span>
            {comAnomalia > 0 && (
              <span className="text-orange-500 font-semibold">{comAnomalia} c/ anomalia</span>
            )}
          </div>
        </div>

        {/* Cards de itens */}
        {itens.length === 0 ? (
          <div className="bg-white rounded-2xl border border-cobeb-border px-4 py-8 text-center">
            <p className="text-slate-500 text-sm">Nenhum item conferido encontrado</p>
          </div>
        ) : (
          itens.map(confItem => {
            const pedido      = pedidoMap[confItem.pedido_id]
            const apo         = blitzState[confItem.id]
            const cxPallet    = pedido?.qtde_pallets > 0 ? pedido.qtde_skus / pedido.qtde_pallets : null
            const qtdePlt     = Number(confItem.qtde_recebida)
            const qtdeCx      = cxPallet ? Math.round(qtdePlt * cxPallet) : null
            const apontado    = !!apo
            const semAnomalia = apo?.sem_anomalia
            const motivoLabel = !semAnomalia && apo?.motivo_id
              ? motivos.find(m => m.id === apo.motivo_id)?.descricao
              : null

            return (
              <div key={confItem.id} className={`bg-white rounded-2xl border overflow-hidden ${
                !apontado        ? 'border-cobeb-border'
                : semAnomalia    ? 'border-green-500/40'
                : 'border-orange-500/40'
              }`}>
                {/* Cabeçalho do item */}
                <div className="px-4 pt-3 pb-2.5 border-b border-cobeb-border/50">
                  <p className="text-cobeb-text text-xs font-medium leading-snug">
                    {pedido?.descricao ?? 'Produto não encontrado'}
                  </p>
                  <p className="text-slate-500 text-[10px] font-mono mt-0.5">
                    {pedido?.cod_produto}
                    {pedido?.embalagem ? ` · ${pedido.embalagem}` : ''}
                  </p>
                  <div className="flex items-center gap-3 mt-1 text-[10px] text-slate-500 flex-wrap">
                    <span>
                      <span className="text-cobeb-text font-semibold">
                        {qtdePlt.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}
                      </span> plt
                      {qtdeCx != null && <span className="ml-1">· {qtdeCx.toLocaleString('pt-BR')} cx</span>}
                    </span>
                    {confItem.data_validade && (
                      <span>Val: {formatData(confItem.data_validade)}</span>
                    )}
                  </div>
                </div>

                {/* Área de apontamento */}
                <div className="px-4 py-3">
                  {!apontado ? (
                    !readOnly && (
                      <div className="flex gap-2">
                        <button onClick={() => marcarSemAnomalia(confItem)}
                          className="flex-1 bg-green-500/10 border border-green-500/30 hover:border-green-500/60 text-green-600 text-xs font-semibold py-2.5 rounded-xl transition-colors flex items-center justify-center gap-1.5">
                          <CheckCircle size={13} /> Sem Anomalia
                        </button>
                        <button onClick={() => abrirModal(confItem)}
                          className="flex-1 bg-orange-500/10 border border-orange-500/30 hover:border-orange-500/60 text-orange-600 text-xs font-semibold py-2.5 rounded-xl transition-colors flex items-center justify-center gap-1.5">
                          <AlertTriangle size={13} /> Apontar Anomalia
                        </button>
                      </div>
                    )
                  ) : (
                    <div className="flex items-center justify-between gap-2">
                      {semAnomalia ? (
                        <span className="flex items-center gap-1.5 text-xs font-semibold text-green-600">
                          <CheckCircle size={13} /> Sem Anomalia
                        </span>
                      ) : (
                        <div>
                          <span className="flex items-center gap-1.5 text-xs font-semibold text-orange-600">
                            <AlertTriangle size={13} /> {motivoLabel ?? 'Anomalia'}
                          </span>
                          <p className="text-[10px] text-slate-500 mt-0.5">
                            {apo.qtde_unidades?.toLocaleString('pt-BR')} und ·{' '}
                            {apo.qtde_paletes_retrabalho} plt para retrabalho
                          </p>
                        </div>
                      )}
                      {!readOnly && (
                        <button onClick={() => resetItem(confItem.id)}
                          className="text-[10px] text-slate-400 hover:text-cobeb-navy underline shrink-0 transition-colors">
                          Alterar
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )
          })
        )}
      </main>

      {/* Rodapé */}
      {!readOnly && (
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-cobeb-border px-4 py-3 z-30">
          <div className="max-w-lg mx-auto">
            {!todosApontados && (
              <p className="text-slate-500 text-[10px] text-center mb-2">
                Aponte todos os itens para finalizar a blitz
              </p>
            )}
            <button
              onClick={finalizar}
              disabled={!todosApontados || salvando}
              className="w-full bg-purple-600 hover:bg-purple-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold py-3 rounded-2xl transition-colors flex items-center justify-center gap-2">
              {salvando
                ? <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                : <><RotateCcw size={16} /> Finalizar Blitz</>}
            </button>
          </div>
        </div>
      )}

      {/* Modal de anomalia */}
      {modalData && (
        <AnomaliaModal
          modal={modalData}
          motivos={motivos}
          onChange={setModalData}
          onConfirm={confirmarAnomalia}
          onClose={() => setModalData(null)}
        />
      )}
    </div>
  )
}

// ── Modal de apontamento de anomalia ─────────────────────────────────────────

function AnomaliaModal({ modal, motivos, onChange, onConfirm, onClose }) {
  const { confItem, pedido, maxPaletes, motivo_id, qtde_unidades, qtde_paletes_retrabalho } = modal

  const qtdePltNum = Number(qtde_paletes_retrabalho)
  const excede     = qtdePltNum > maxPaletes
  const canSave    = motivo_id
    && qtde_unidades   && Number(qtde_unidades) > 0
    && qtde_paletes_retrabalho && qtdePltNum > 0 && !excede

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-white rounded-t-3xl border-t border-cobeb-border px-5 pt-4 pb-8 max-h-[88vh] overflow-y-auto">
        <div className="w-10 h-1 bg-cobeb-border rounded-full mx-auto mb-4" />

        <div className="flex items-center justify-between mb-4">
          <p className="text-cobeb-text font-semibold text-sm">Apontar Anomalia</p>
          <button onClick={onClose} className="text-slate-500 hover:text-cobeb-text p-1 transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Info do produto */}
        <div className="bg-[#EBF5FF] rounded-xl px-3 py-2.5 border border-cobeb-border mb-5">
          <p className="text-cobeb-text text-xs font-medium">{pedido?.descricao ?? 'Produto'}</p>
          <p className="text-slate-500 text-[10px] font-mono mt-0.5">{pedido?.cod_produto}</p>
          <p className="text-slate-500 text-[10px] mt-0.5">
            {Number(confItem.qtde_recebida).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} plt conferido(s)
            {confItem.data_validade && ` · Val: ${formatData(confItem.data_validade)}`}
          </p>
        </div>

        <div className="space-y-5">
          {/* Motivo */}
          <div>
            <label className="text-slate-500 text-[11px] font-semibold uppercase tracking-widest block mb-2">
              Motivo da anomalia <span className="text-cobeb-yellow">*</span>
            </label>
            {motivos.length === 0 ? (
              <p className="text-slate-400 text-xs bg-[#EBF5FF] border border-cobeb-border rounded-xl px-3 py-3">
                Nenhum motivo cadastrado. Acesse Cadastros → Metas para adicionar.
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {motivos.map(m => (
                  <button key={m.id} type="button"
                    onClick={() => onChange(prev => ({ ...prev, motivo_id: m.id }))}
                    className={`px-3 py-2.5 rounded-xl border text-xs font-medium text-left transition-colors ${
                      motivo_id === m.id
                        ? 'bg-orange-500/10 border-orange-500/50 text-orange-700'
                        : 'bg-[#EBF5FF] border-cobeb-border text-slate-500 hover:border-orange-500/30'
                    }`}>
                    {m.descricao}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Qtde unidades */}
          <div>
            <label className="text-slate-500 text-[11px] font-semibold uppercase tracking-widest block mb-1.5">
              Quantidade afetada <span className="text-cobeb-yellow">*</span>
            </label>
            <p className="text-orange-500/80 text-[10px] font-semibold mb-2">
              ⚠ Informe em <strong>unidades</strong> (caixas, barris, etc.) — não em paletes.
            </p>
            <div className="flex items-center gap-2">
              <input
                type="number" min="1" step="1" placeholder="0"
                value={qtde_unidades}
                onChange={e => onChange(prev => ({ ...prev, qtde_unidades: e.target.value }))}
                className="w-28 bg-[#EBF5FF] border border-cobeb-border rounded-xl px-3 py-2.5 text-sm text-cobeb-text focus:outline-none focus:border-cobeb-blue transition-colors text-right"
              />
              <span className="text-slate-500 text-sm">unidades</span>
            </div>
          </div>

          {/* Qtde paletes retrabalho */}
          <div>
            <label className="text-slate-500 text-[11px] font-semibold uppercase tracking-widest block mb-1.5">
              Paletes para retrabalho <span className="text-cobeb-yellow">*</span>
            </label>
            <p className="text-slate-400 text-[10px] mb-2">
              Máximo: {maxPaletes} plt (quantidade conferida neste item)
            </p>
            <div className="flex items-center gap-2">
              <input
                type="number" min="1" max={maxPaletes} step="1" placeholder="0"
                value={qtde_paletes_retrabalho}
                onChange={e => onChange(prev => ({ ...prev, qtde_paletes_retrabalho: e.target.value }))}
                className={`w-28 bg-[#EBF5FF] border rounded-xl px-3 py-2.5 text-sm text-cobeb-text focus:outline-none transition-colors text-right ${
                  excede ? 'border-red-500/60 focus:border-red-500' : 'border-cobeb-border focus:border-cobeb-blue'
                }`}
              />
              <span className="text-slate-500 text-sm">plt</span>
            </div>
            {excede && (
              <p className="text-red-400 text-xs mt-1">Não pode exceder {maxPaletes} plt</p>
            )}
          </div>

          <div className="flex gap-3 pt-1">
            <button onClick={onClose}
              className="flex-1 bg-[#EBF5FF] border border-cobeb-border text-slate-400 text-sm font-semibold py-3 rounded-2xl">
              Cancelar
            </button>
            <button onClick={onConfirm} disabled={!canSave}
              className="flex-1 bg-orange-500 hover:bg-orange-600 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold py-3 rounded-2xl transition-colors">
              Confirmar
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
