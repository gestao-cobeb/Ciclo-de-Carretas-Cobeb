import { useState, useEffect, useMemo } from 'react'
import { AlertTriangle, RefreshCw, MapPin, X, Trash2, Factory } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { assinarFotos, caminhoDaFoto } from '../lib/fotos'
import AdminLayout from '../components/AdminLayout'

function formatTs(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

const selCls  = 'bg-white border border-cobeb-border rounded-xl px-3 py-2 text-cobeb-text text-xs focus:outline-none focus:border-cobeb-blue appearance-none cursor-pointer'
const dateCls = 'flex-1 bg-white border border-cobeb-border rounded-xl px-3 py-1.5 text-cobeb-text text-xs focus:outline-none focus:border-cobeb-blue transition-colors [color-scheme:light]'

export default function Anomalias() {
  const [anomalias,     setAnomalias]     = useState([])
  const [unidades,      setUnidades]      = useState([])
  const [todasPlacas,   setTodasPlacas]   = useState([])
  const [filtroUnidade, setFiltroUnidade] = useState('')
  const [filtroPlaca,   setFiltroPlaca]   = useState('')
  const [filtroDataDe,  setFiltroDataDe]  = useState('')
  const [filtroDataAte, setFiltroDataAte] = useState('')
  const [loading,       setLoading]       = useState(true)
  const [fotoAmpliada,  setFotoAmpliada]  = useState(null)
  const [modalExcluir,  setModalExcluir]  = useState(null) // anomalia object
  /**
   * `valor guardado -> URL assinada`.
   *
   * O bucket é privado: o que está no banco não abre sozinho. A assinatura vale
   * uma hora e é refeita a cada carga da lista (que já recarrega de 30 em 30
   * segundos), então a tela nunca chega a segurar um link vencido.
   */
  const [fotoUrl,       setFotoUrl]       = useState(new Map())
  const [excluindo,     setExcluindo]     = useState(false)

  useEffect(() => { load() }, [])

  useEffect(() => {
    const timer = setInterval(() => load(true), 30000)
    return () => clearInterval(timer)
  }, [])

  async function load(silent = false) {
    if (!silent) setLoading(true)

    const [{ data: anos }, { data: uns }, { data: cavalos }] = await Promise.all([
      supabase
        .from('anomalias')
        .select(`
          *,
          tarefa:tarefas(numero_nf, viagem_id),
          pedido:pedidos(descricao, cod_produto, fabrica),
          conferente:profiles(nome),
          unidade:unidades(id, nome, cidade)
        `)
        .order('created_at', { ascending: false }),
      supabase.from('unidades').select('id, nome, cidade').eq('ativo', true).order('nome'),
      supabase.from('cavalos').select('placa').order('placa'),
    ])

    const lista = anos ?? []

    // Resolve placa do cavalo: anomalia → tarefa.viagem_id → viagem.cavalo
    const viagemIds = [...new Set(lista.map(a => a.tarefa?.viagem_id).filter(Boolean))]
    let placacMap = {}
    if (viagemIds.length) {
      const { data: viagens } = await supabase
        .from('viagens')
        .select('id, cavalo:cavalos(placa)')
        .in('id', viagemIds)
      ;(viagens ?? []).forEach(v => {
        if (v.cavalo?.placa) placacMap[v.id] = v.cavalo.placa
      })
    }

    setAnomalias(lista.map(a => ({
      ...a,
      placa_cavalo: placacMap[a.tarefa?.viagem_id] ?? null,
    })))
    // As assinaturas de TODAS as fotos da lista, numa chamada só. Ver
    // `assinarFotos` -- uma requisição por miniatura viraria uma saraivada.
    setFotoUrl(await assinarFotos(lista.flatMap(a => a.fotos ?? [])))
    setUnidades(uns ?? [])
    setTodasPlacas((cavalos ?? []).map(c => c.placa).filter(Boolean))
    if (!silent) setLoading(false)
  }

  const anomaliasFiltradas = useMemo(() => {
    return anomalias.filter(a => {
      if (filtroUnidade && a.unidade_id !== filtroUnidade) return false
      if (filtroPlaca   && a.placa_cavalo !== filtroPlaca) return false
      const ref = (a.created_at ?? '').slice(0, 10)
      if (filtroDataDe  && ref < filtroDataDe)  return false
      if (filtroDataAte && ref > filtroDataAte) return false
      return true
    })
  }, [anomalias, filtroUnidade, filtroPlaca, filtroDataDe, filtroDataAte])

  async function confirmarExclusao() {
    const ano = modalExcluir
    setModalExcluir(null)
    setExcluindo(true)

    // Remove fotos do storage
    const paths = (ano.fotos ?? []).map(caminhoDaFoto).filter(Boolean)
    if (paths.length) {
      await supabase.storage.from('anomalias-fotos').remove(paths)
    }

    // Remove registro da tabela
    const { error } = await supabase.from('anomalias').delete().eq('id', ano.id)
    if (!error) {
      setAnomalias(prev => prev.filter(a => a.id !== ano.id))
    }

    setExcluindo(false)
  }

  const temFiltroAtivo = filtroUnidade || filtroPlaca || filtroDataDe || filtroDataAte

  function resetFiltros() {
    setFiltroUnidade('')
    setFiltroPlaca('')
    setFiltroDataDe('')
    setFiltroDataAte('')
  }

  return (
    <AdminLayout title="Anomalias">
      <div className="max-w-2xl mx-auto px-4 pt-5 pb-8 space-y-4">

        {/* Header strip */}
        <div className="flex items-center justify-between">
          <p className="text-slate-500 text-xs">
            {anomaliasFiltradas.length} anomalia(s)
          </p>
          <button onClick={load} className="text-slate-500 hover:text-cobeb-yellow transition-colors">
            <RefreshCw size={15} />
          </button>
        </div>

        {/* Filtros — Unidade + Placa */}
        <div className="flex gap-2">
          <select
            value={filtroUnidade}
            onChange={e => setFiltroUnidade(e.target.value)}
            className={`flex-1 ${selCls}`}>
            <option value="">Todas as unidades</option>
            {unidades.map(u => (
              <option key={u.id} value={u.id}>{u.nome} — {u.cidade}</option>
            ))}
          </select>
          <select
            value={filtroPlaca}
            onChange={e => setFiltroPlaca(e.target.value)}
            className={`flex-1 ${selCls}`}>
            <option value="">Todas as placas</option>
            {todasPlacas.map(p => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </div>

        {/* Filtro Período */}
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={filtroDataDe}
            max={filtroDataAte || undefined}
            onChange={e => setFiltroDataDe(e.target.value)}
            className={dateCls}
          />
          <span className="text-slate-400 text-xs shrink-0">até</span>
          <input
            type="date"
            value={filtroDataAte}
            min={filtroDataDe || undefined}
            onChange={e => setFiltroDataAte(e.target.value)}
            className={dateCls}
          />
          {(filtroDataDe || filtroDataAte) && (
            <button
              onClick={() => { setFiltroDataDe(''); setFiltroDataAte('') }}
              className="text-slate-500 hover:text-cobeb-yellow transition-colors shrink-0">
              <X size={15} />
            </button>
          )}
        </div>

        {/* Limpar todos os filtros */}
        {temFiltroAtivo && (
          <div className="-mt-1">
            <button onClick={resetFiltros} className="text-xs text-slate-500 hover:text-cobeb-yellow transition-colors">
              Limpar filtros
            </button>
          </div>
        )}

        {/* List */}
        {loading ? (
          <div className="flex justify-center py-16">
            <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : anomaliasFiltradas.length === 0 ? (
          <div className="text-center py-16">
            <div className="w-14 h-14 rounded-2xl bg-white border border-cobeb-border flex items-center justify-center mx-auto mb-4">
              <AlertTriangle size={22} className="text-cobeb-border" />
            </div>
            <p className="text-slate-500 text-sm font-medium">
              {temFiltroAtivo ? 'Nenhuma anomalia encontrada com esses filtros' : 'Nenhuma anomalia registrada'}
            </p>
            {!temFiltroAtivo && (
              <p className="text-cobeb-border text-xs mt-1">As anomalias aparecem durante a conferência de chegada</p>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {anomaliasFiltradas.map(ano => (
              <div key={ano.id} className="bg-white rounded-2xl border border-orange-500/20 overflow-hidden">
                <div className="px-4 py-3 border-b border-cobeb-border/50">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        {ano.tarefa?.numero_nf && (
                          <span className="text-cobeb-yellow font-semibold text-sm">NF {ano.tarefa.numero_nf}</span>
                        )}
                        {ano.unidade && (
                          <span className="text-slate-500 text-[10px] flex items-center gap-1">
                            <MapPin size={9} />{ano.unidade.nome}{ano.unidade.cidade ? ` — ${ano.unidade.cidade}` : ''}
                          </span>
                        )}
                        {ano.placa_cavalo && (
                          <span className="text-slate-500 text-[10px] font-mono">{ano.placa_cavalo}</span>
                        )}
                      </div>
                      <div className="mb-1.5">
                        {ano.tipo === 'inversao'
                          ? <span className="text-[10px] font-semibold bg-orange-500/10 text-orange-400 border border-orange-500/20 px-2 py-0.5 rounded-full">Inversão de Produto</span>
                          : <span className="text-[10px] font-semibold bg-red-500/10 text-red-400 border border-red-500/20 px-2 py-0.5 rounded-full">Problema de Qualidade</span>
                        }
                      </div>
                      {ano.pedido && (
                        <p className="text-slate-500 text-[10px] font-mono mb-1.5">
                          {ano.pedido.cod_produto} — {ano.pedido.descricao}
                        </p>
                      )}
                      {ano.pedido?.fabrica && (
                        <p className="flex items-center gap-1 text-slate-500 text-[10px] mb-1.5">
                          <Factory size={9} className="shrink-0" />
                          {ano.pedido.fabrica}
                        </p>
                      )}
                      {ano.lote && (
                        <p className="text-slate-500 text-[10px] mb-1.5">
                          Lote: <span className="font-mono text-cobeb-text">{ano.lote}</span>
                        </p>
                      )}
                      <p className="text-cobeb-text text-xs leading-relaxed">{ano.descricao}</p>
                      {ano.substituto_codigo && (
                        <div className="mt-1.5 bg-[#EBF5FF] rounded-xl px-3 py-2 border border-cobeb-border">
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
                      {ano.conferente?.nome && (
                        <p className="text-slate-500 text-[10px] mt-1.5">Conferente: {ano.conferente.nome}</p>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-2 shrink-0">
                      <span className="text-slate-500 text-[10px] whitespace-nowrap">{formatTs(ano.created_at)}</span>
                      <button
                        onClick={() => setModalExcluir(ano)}
                        disabled={excluindo}
                        className="text-slate-500 hover:text-red-400 transition-colors disabled:opacity-40">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Photos */}
                {ano.fotos?.length > 0 && (
                  <div className="flex gap-3 px-4 py-3">
                    {ano.fotos.map((guardada, i) => {
                      /**
                       * Sem assinatura a miniatura NÃO é desenhada.
                       *
                       * Um `<img>` com `src` vazio ou vencido rende o ícone de
                       * imagem quebrada, que se lê como "a foto sumiu" -- e o
                       * que aconteceu foi outra coisa (o link expirou, o
                       * arquivo foi apagado, a rede caiu). O quadro com o traço
                       * diz o que se sabe: não deu para abrir esta.
                       */
                      const url = fotoUrl.get(guardada)
                      if (!url) return (
                        <div
                          key={i}
                          title="não consegui abrir esta foto"
                          className="w-20 h-20 rounded-xl border border-dashed border-cobeb-border shrink-0
                                     flex items-center justify-center text-cobeb-text/40 text-xs"
                        >
                          —
                        </div>
                      )
                      return (
                        <button
                          key={i}
                          onClick={() => setFotoAmpliada(url)}
                          className="w-20 h-20 rounded-xl overflow-hidden border border-cobeb-border shrink-0 hover:border-cobeb-blue/40 transition-colors"
                        >
                          <img src={url} alt={`Foto ${i + 1}`} className="w-full h-full object-cover" />
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

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
                <p className="text-cobeb-text font-semibold text-base">Excluir anomalia</p>
                <p className="text-slate-500 text-sm mt-1">
                  Esta anomalia será excluída permanentemente
                  {modalExcluir.fotos?.length > 0 && `, incluindo ${modalExcluir.fotos.length} foto(s) arquivada(s)`}.
                </p>
                <p className="text-red-400 text-xs mt-2 font-medium">Esta ação não pode ser desfeita.</p>
              </div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setModalExcluir(null)}
                className="flex-1 bg-[#EBF5FF] border border-cobeb-border text-slate-400 font-semibold py-4 rounded-2xl text-sm">
                Cancelar
              </button>
              <button
                onClick={confirmarExclusao}
                className="flex-1 bg-red-500 hover:bg-red-600 text-white font-semibold py-4 rounded-2xl text-sm transition-colors">
                Excluir
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Lightbox */}
      {fotoAmpliada && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
          onClick={() => setFotoAmpliada(null)}
        >
          <button className="absolute top-4 right-4 text-white/70 hover:text-white transition-colors z-10">
            <X size={24} />
          </button>
          <img
            src={fotoAmpliada}
            alt="Foto anomalia"
            className="max-w-full max-h-full rounded-2xl object-contain"
            onClick={e => e.stopPropagation()}
          />
        </div>
      )}
    </AdminLayout>
  )
}
