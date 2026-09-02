import { useState } from 'react'
import { ChevronLeft, Plus, X, Download, Printer, AlertCircle, Loader2, FileText } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { fmt2Y, minus30, gerarNRIPdf } from '../lib/nriPdf'

function fmt4Y(iso) {
  if (!iso) return ''
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

const uid = () => Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2)

function newGrupo() {
  return {
    _id:          uid(),
    codigo:       '',
    descricao:    null,
    cxPallet:     null,
    qtdePaletes:  '',
    qtdeCaixas:   null,
    unidade:      'PLT',
    qtdaCxInput:  '',
    dataValidade: '',
    curva:        null,
    buscando:     false,
    erroCodigo:   null,
    erroQtd:      false,
    erroData:     false,
  }
}

const isMarketplace = (tarefa) => tarefa?.tipo === 'marketplace'

export default function EmissaoNRI({ tarefa, pedidos, profileNome, gruposIniciais, onVoltar }) {
  const [cab, setCab]           = useState({ operador: '', conferente: profileNome, turno: '' })
  const [grupos, setGrupos]     = useState(() =>
    gruposIniciais?.length > 0 ? gruposIniciais : [newGrupo()]
  )
  const [errCab, setErrCab]     = useState({})
  const [gerando, setGerando]   = useState(false)
  const [pdfUrl, setPdfUrl]     = useState(null)
  const [pdfFilename, setPdfFn] = useState('')

  const placaCarreta = tarefa.viagem?.carreta?.placa ?? tarefa.placa_carreta ?? ''
  const placaCavalo  = tarefa.viagem?.cavalo?.placa  ?? tarefa.placa_cavalo  ?? ''
  const placa        = [placaCarreta, placaCavalo].filter(Boolean).join(' / ') || 'Não informada'
  const motorista    = tarefa.viagem?.motorista?.nome ?? ''
  const origem       = pedidos[0]?.fabrica ?? (tarefa.tipo === 'marketplace' ? 'Marketplace' : '')
  const numeroNF     = tarefa.numero_nf ?? ''

  // ─── Busca produto ──────────────────────────────────────────────────────────

  async function buscarProduto(idx) {
    const codigo = grupos[idx].codigo.trim()
    if (!codigo) return
    setGrupos(g => g.map((gr, i) => i === idx ? { ...gr, buscando: true, erroCodigo: null } : gr))
    const { data } = await supabase
      .from('produtos_catalogo')
      .select('codigo, descricao, caixas_pallet')
      .eq('codigo', codigo)
      .maybeSingle()
    const pedidoCurva = pedidos.find(p => p.cod_produto === codigo)
    setGrupos(g => g.map((gr, i) => {
      if (i !== idx) return gr
      if (data) {
        const cxPallet   = Number(data.caixas_pallet) || null
        const qtdeCaixas = gr.qtdePaletes && cxPallet ? Math.round(Number(gr.qtdePaletes) * cxPallet) : null
        return { ...gr, buscando: false, descricao: data.descricao, cxPallet, qtdeCaixas, curva: pedidoCurva?.curva ?? null, erroCodigo: null }
      }
      return { ...gr, buscando: false, descricao: null, cxPallet: null, qtdeCaixas: null, curva: null, erroCodigo: 'Produto não encontrado' }
    }))
  }

  function updateGrupo(idx, field, value) {
    setGrupos(g => g.map((gr, i) => {
      if (i !== idx) return gr
      const next = { ...gr, [field]: value }

      if (field === 'qtdePaletes' && gr.unidade === 'PLT') {
        next.qtdeCaixas = value && gr.cxPallet ? Math.round(Number(value) * gr.cxPallet) : null
      }

      if (field === 'unidade') {
        next.qtdePaletes = ''
        next.qtdaCxInput = ''
        next.qtdeCaixas  = null
      }

      if (field === 'qtdaCxInput') {
        const cx = Number(value)
        if (cx > 0 && gr.cxPallet) {
          next.qtdePaletes = String(Math.ceil(cx / gr.cxPallet))
        } else {
          next.qtdePaletes = ''
        }
        next.qtdeCaixas = cx > 0 ? cx : null
      }

      return next
    }))
  }

  // ─── Validação ──────────────────────────────────────────────────────────────

  function validar() {
    const ec = {}
    if (!cab.operador.trim())   ec.operador   = true
    if (!cab.conferente.trim()) ec.conferente = true
    if (!cab.turno)             ec.turno      = true
    setErrCab(ec)
    const gruposV = grupos.map(gr => ({
      ...gr,
      erroCodigo: !(gr.codigo ?? '').trim() ? 'Obrigatório' : (!gr.descricao ? (gr.erroCodigo || 'Busque o produto') : null),
      erroQtd:    !gr.qtdePaletes || Number(gr.qtdePaletes) <= 0,
      erroData:   !gr.dataValidade,
    }))
    setGrupos(gruposV)
    return Object.keys(ec).length === 0 && gruposV.every(gr => !gr.erroCodigo && !gr.erroQtd && !gr.erroData)
  }

  // ─── Geração do PDF ─────────────────────────────────────────────────────────

  async function gerarPDF() {
    setGerando(true)
    setPdfUrl(null)
    try {
      if (!validar()) return

      const totalNRIs = grupos.reduce((s, gr) => s + Number(gr.qtdePaletes) * 3, 0)
      const { data: primeiro, error } = await supabase.rpc('get_next_nri_batch', { p_quantidade: totalNRIs })
      if (error) throw error

      const { error: errInsert } = await supabase.from('nri_emissoes').insert({
        tarefa_id: tarefa.id, numero_nf: tarefa.numero_nf ?? '',
        operador: cab.operador.trim(), conferente: cab.conferente.trim(), turno: cab.turno,
        total_nris: totalNRIs, primeiro_numero: primeiro, ultimo_numero: primeiro + totalNRIs - 1,
      })
      if (errInsert) throw errInsert

      const allNRIs = []
      let num = primeiro
      for (const gr of grupos) {
        for (let p = 0; p < Number(gr.qtdePaletes); p++) {
          for (let n = 0; n < 3; n++) {
            allNRIs.push({ numero: num++, codigo: gr.codigo, descricao: gr.descricao, dataValidade: gr.dataValidade, curva: gr.curva ?? '' })
          }
        }
      }

      const now             = new Date()
      const horaEmissao     = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
      const dataRecebimento = now.toLocaleDateString('pt-BR')
      const dateStr         = now.toISOString().slice(0, 10).replace(/-/g, '')
      const filename        = `NRI_${tarefa.numero_nf}_${dateStr}.pdf`
      setPdfFn(filename)

      const doc = gerarNRIPdf({ allNRIs, cabecalho: cab, placaCarreta, placaCavalo, numeroNF, motorista, origem, dataRecebimento, horaEmissao, filename })

      const blobUrl = doc.output('bloburl')
      setPdfUrl(blobUrl)
    } catch (err) {
      console.error('Erro ao gerar NRI:', err)
      alert('Erro ao gerar o PDF. Tente novamente.')
    } finally {
      setGerando(false)
    }
  }

  function baixarPdf() {
    if (!pdfUrl) return
    window.open(pdfUrl, '_blank')
  }

  function imprimirPdf() {
    if (!pdfUrl) return
    const iframe = document.createElement('iframe')
    iframe.style.cssText = 'position:fixed;width:0;height:0;border:none;opacity:0'
    iframe.src = pdfUrl
    document.body.appendChild(iframe)
    iframe.onload = () => {
      iframe.contentWindow.focus(); iframe.contentWindow.print()
      setTimeout(() => document.body.removeChild(iframe), 2000)
    }
  }

  const totalNRIs   = grupos.reduce((s, gr) => s + (Number(gr.qtdePaletes) > 0 ? Number(gr.qtdePaletes) * 3 : 0), 0)
  const totalFolhas = Math.ceil(totalNRIs / 3)

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-[#EBF5FF] flex flex-col">
      <header className="bg-cobeb-navy border-b border-blue-800 px-4 py-3 shrink-0 shadow-md shadow-cobeb-navy/20">
        <div className="flex items-center gap-3">
          <button onClick={onVoltar} className="text-blue-300/70 hover:text-white transition-colors p-1.5 rounded-lg hover:bg-white/10 -ml-1">
            <ChevronLeft size={20} />
          </button>
          <div className="flex-1 min-w-0">
            <p className="text-white text-sm font-semibold truncate">Emissão de NRI — NF {tarefa.numero_nf}</p>
            <p className="text-blue-300/60 text-[11px] truncate">{motorista && `${motorista} · `}{placa}</p>
          </div>
          <div className="flex items-center gap-2 text-blue-300/60 text-[10px]">
            <FileText size={12} />
            <span>{totalNRIs > 0 ? `${totalNRIs} NRIs · ${totalFolhas} fl.` : '—'}</span>
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto">
        <div className="max-w-lg mx-auto px-4 pt-5 pb-36 space-y-5">

          {(placa || motorista || origem) && (
            <div className="bg-white rounded-2xl border border-cobeb-border px-4 py-3">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 mb-2">Dados da Viagem</p>
              <div className="grid grid-cols-3 gap-3 text-xs">
                {placa     && <div><p className="text-slate-400 text-[10px]">Placa</p><p className="text-cobeb-text font-semibold font-mono">{placa}</p></div>}
                {motorista && <div><p className="text-slate-400 text-[10px]">Motorista</p><p className="text-cobeb-text font-semibold truncate">{motorista}</p></div>}
                {origem    && <div><p className="text-slate-400 text-[10px]">Origem</p><p className="text-cobeb-text font-semibold truncate">{origem}</p></div>}
              </div>
            </div>
          )}

          {/* Cabeçalho */}
          <section className="bg-white rounded-2xl border border-cobeb-border px-4 py-4 space-y-4">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">Cabeçalho</p>
            <div>
              <label className="text-[11px] font-semibold uppercase tracking-widest text-slate-500 block mb-1.5">Operador do Turno <span className="text-cobeb-yellow">*</span></label>
              <input type="text" value={cab.operador} onChange={e => setCab(c => ({ ...c, operador: e.target.value }))} placeholder="Nome do operador"
                className={`w-full bg-[#EBF5FF] border rounded-xl px-3 py-2.5 text-xs text-cobeb-text placeholder-slate-400 focus:outline-none focus:border-cobeb-blue transition-colors ${errCab.operador ? 'border-red-400' : 'border-cobeb-border'}`} />
              {errCab.operador && <p className="text-red-400 text-[10px] mt-1">Obrigatório</p>}
            </div>
            <div>
              <label className="text-[11px] font-semibold uppercase tracking-widest text-slate-500 block mb-1.5">Conferente <span className="text-cobeb-yellow">*</span></label>
              <input type="text" value={cab.conferente} onChange={e => setCab(c => ({ ...c, conferente: e.target.value }))} placeholder="Nome do conferente"
                className={`w-full bg-[#EBF5FF] border rounded-xl px-3 py-2.5 text-xs text-cobeb-text placeholder-slate-400 focus:outline-none focus:border-cobeb-blue transition-colors ${errCab.conferente ? 'border-red-400' : 'border-cobeb-border'}`} />
              {errCab.conferente && <p className="text-red-400 text-[10px] mt-1">Obrigatório</p>}
            </div>
            <div>
              <label className="text-[11px] font-semibold uppercase tracking-widest text-slate-500 block mb-2">Turno <span className="text-cobeb-yellow">*</span></label>
              <div className="flex gap-2">
                {['A', 'B', 'C'].map(t => (
                  <button key={t} type="button" onClick={() => setCab(c => ({ ...c, turno: t }))}
                    className={`flex-1 py-2.5 rounded-xl text-sm font-bold border transition-colors ${
                      cab.turno === t ? 'bg-cobeb-navy text-white border-cobeb-navy'
                      : errCab.turno ? 'bg-white text-red-400 border-red-400/50'
                      : 'bg-white text-slate-500 border-cobeb-border hover:border-cobeb-blue/50'}`}>
                    {t}
                  </button>
                ))}
              </div>
              {errCab.turno && <p className="text-red-400 text-[10px] mt-1">Selecione o turno</p>}
            </div>
          </section>

          {/* Grupos */}
          <section>
            <div className="flex items-center justify-between mb-3 px-1">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">Produtos</p>
              <span className="text-[10px] text-slate-400">{grupos.length} grupo(s)</span>
            </div>
            <div className="space-y-4">
              {grupos.map((gr, idx) => (
                <div key={gr._id} className="bg-white rounded-2xl border border-cobeb-border overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-3 border-b border-cobeb-border/60 bg-[#EBF5FF]/50">
                    <span className="text-[11px] font-semibold text-cobeb-navy">Produto {idx + 1}</span>
                    <div className="flex items-center gap-2">
                      {isMarketplace(tarefa) && (
                        <div className="flex rounded-lg border border-cobeb-border overflow-hidden text-[10px] font-bold">
                          {['PLT', 'CX'].map(u => (
                            <button key={u} type="button"
                              onClick={() => updateGrupo(idx, 'unidade', u)}
                              className={`px-2.5 py-1 transition-colors ${gr.unidade === u ? 'bg-cobeb-navy text-white' : 'bg-white text-slate-500 hover:bg-[#EBF5FF]'}`}>
                              {u}
                            </button>
                          ))}
                        </div>
                      )}
                      {grupos.length > 1 && (
                        <button onClick={() => setGrupos(g => g.filter((_, i) => i !== idx))} className="text-slate-400 hover:text-red-400 transition-colors p-1">
                          <X size={14} />
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="px-4 py-4 space-y-4">
                    <div>
                      <label className="text-[11px] font-semibold uppercase tracking-widest text-slate-500 block mb-1.5">Código do Produto <span className="text-cobeb-yellow">*</span></label>
                      <div className="flex gap-2">
                        <input type="text" value={gr.codigo} onChange={e => updateGrupo(idx, 'codigo', e.target.value)} onBlur={() => buscarProduto(idx)} placeholder="Ex: 38026"
                          className={`flex-1 bg-[#EBF5FF] border rounded-xl px-3 py-2.5 text-xs font-mono text-cobeb-text placeholder-slate-400 focus:outline-none focus:border-cobeb-blue transition-colors ${gr.erroCodigo ? 'border-red-400' : 'border-cobeb-border'}`} />
                        <button type="button" onClick={() => buscarProduto(idx)} disabled={gr.buscando || !gr.codigo.trim()}
                          className="px-3 py-2.5 bg-cobeb-navy text-white text-xs font-semibold rounded-xl disabled:opacity-40 transition-colors whitespace-nowrap">
                          {gr.buscando ? <Loader2 size={12} className="animate-spin" /> : 'Buscar'}
                        </button>
                      </div>
                      {gr.descricao && <p className="text-cobeb-text text-xs mt-1.5 font-medium">{gr.descricao}</p>}
                      {gr.erroCodigo && <p className="text-red-400 text-xs mt-1 flex items-center gap-1"><AlertCircle size={10} />{gr.erroCodigo}</p>}
                      {gr.curva && (
                        <span className={`inline-block mt-1 text-[9px] font-bold px-1.5 py-0.5 rounded leading-none ${
                          gr.curva === 'A' ? 'bg-cobeb-navy/10 text-cobeb-yellow' : gr.curva === 'B' ? 'bg-blue-500/20 text-blue-400' : 'bg-slate-500/10 text-slate-500'}`}>
                          Curva {gr.curva}
                        </span>
                      )}
                    </div>
                    <div>
                      <label className="text-[11px] font-semibold uppercase tracking-widest text-slate-500 block mb-1.5">
                        {gr.unidade === 'CX' ? 'Qtde de Caixas' : 'Qtde de Paletes'} <span className="text-cobeb-yellow">*</span>
                      </label>
                      {gr.unidade === 'CX' ? (
                        <div className="space-y-1.5">
                          <div className="flex items-center gap-3">
                            <input type="number" min="1" step="1" value={gr.qtdaCxInput} onChange={e => updateGrupo(idx, 'qtdaCxInput', e.target.value)} placeholder="0"
                              className={`w-24 bg-[#EBF5FF] border rounded-xl px-3 py-2.5 text-xs text-right text-cobeb-text focus:outline-none focus:border-cobeb-blue transition-colors ${gr.erroQtd ? 'border-red-400' : 'border-cobeb-border'}`} />
                            <span className="text-slate-500 text-xs">cx</span>
                            {gr.cxPallet && <span className="text-slate-400 text-[10px]">({gr.cxPallet} cx/plt)</span>}
                          </div>
                          {gr.qtdePaletes && Number(gr.qtdePaletes) > 0 && (
                            <p className="text-cobeb-navy text-[11px] font-semibold">
                              = {gr.qtdePaletes} plt → {Number(gr.qtdePaletes) * 3} NRIs
                            </p>
                          )}
                          {!gr.cxPallet && gr.qtdaCxInput && (
                            <p className="text-amber-500 text-[10px]">Busque o produto para calcular a conversão</p>
                          )}
                        </div>
                      ) : (
                        <div className="flex items-center gap-3">
                          <input type="number" min="1" step="1" value={gr.qtdePaletes} onChange={e => updateGrupo(idx, 'qtdePaletes', e.target.value)} placeholder="0"
                            className={`w-24 bg-[#EBF5FF] border rounded-xl px-3 py-2.5 text-xs text-right text-cobeb-text focus:outline-none focus:border-cobeb-blue transition-colors ${gr.erroQtd ? 'border-red-400' : 'border-cobeb-border'}`} />
                          <span className="text-slate-500 text-xs">plt</span>
                          {gr.qtdeCaixas !== null && <span className="text-slate-400 text-xs">= {gr.qtdeCaixas.toLocaleString('pt-BR')} cx</span>}
                          {gr.qtdePaletes && Number(gr.qtdePaletes) > 0 && <span className="text-cobeb-navy/60 text-[10px] ml-auto">→ {Number(gr.qtdePaletes) * 3} NRIs</span>}
                        </div>
                      )}
                      {gr.erroQtd && <p className="text-red-400 text-[10px] mt-1">Informe uma quantidade válida</p>}
                    </div>
                    <div>
                      <label className="text-[11px] font-semibold uppercase tracking-widest text-slate-500 block mb-1.5">Data de Validade <span className="text-cobeb-yellow">*</span></label>
                      <input type="date" value={gr.dataValidade} onChange={e => updateGrupo(idx, 'dataValidade', e.target.value)}
                        className={`bg-[#EBF5FF] border rounded-xl px-3 py-2.5 text-xs text-cobeb-text focus:outline-none focus:border-cobeb-blue transition-colors [color-scheme:light] ${gr.erroData ? 'border-red-400' : 'border-cobeb-border'}`} />
                      {gr.dataValidade && <p className="text-slate-400 text-[10px] mt-1">Carregar até: {fmt4Y(minus30(gr.dataValidade))}</p>}
                      {gr.erroData && <p className="text-red-400 text-[10px] mt-1">Obrigatório</p>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <button onClick={() => setGrupos(g => [...g, newGrupo()])}
              className="mt-3 w-full border-2 border-dashed border-cobeb-border hover:border-cobeb-blue/40 text-slate-500 hover:text-cobeb-navy text-xs font-semibold py-3 rounded-2xl transition-colors flex items-center justify-center gap-2">
              <Plus size={14} />Adicionar Produto
            </button>
          </section>

          {pdfUrl && (
            <section className="bg-green-500/10 border border-green-500/30 rounded-2xl px-4 py-4 space-y-3">
              <p className="text-green-400 text-xs font-semibold flex items-center gap-2">
                <FileText size={13} />PDF gerado — {totalNRIs} NRIs · {totalFolhas} folha(s)
              </p>
              <p className="text-slate-500 text-[10px] font-mono">{pdfFilename}</p>
              <div className="flex gap-3">
                <button onClick={baixarPdf} className="flex-1 bg-cobeb-navy text-white text-xs font-semibold py-2.5 rounded-xl flex items-center justify-center gap-2 hover:bg-cobeb-blue transition-colors">
                  <Download size={13} />Baixar PDF
                </button>
                <button onClick={imprimirPdf} className="flex-1 border border-cobeb-border text-cobeb-navy text-xs font-semibold py-2.5 rounded-xl flex items-center justify-center gap-2 hover:bg-cobeb-navy/5 transition-colors">
                  <Printer size={13} />Imprimir
                </button>
              </div>
            </section>
          )}
        </div>
      </main>

      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-cobeb-border px-4 py-3 z-30">
        <div className="max-w-lg mx-auto flex gap-3">
          <button onClick={onVoltar} className="flex-1 border border-cobeb-border text-slate-500 text-sm font-semibold py-3 rounded-2xl transition-colors hover:bg-[#EBF5FF]">
            Voltar à Lista
          </button>
          <button onClick={gerarPDF} disabled={gerando}
            className="flex-1 bg-cobeb-navy hover:bg-cobeb-blue disabled:opacity-50 text-white text-sm font-semibold py-3 rounded-2xl transition-colors flex items-center justify-center gap-2">
            {gerando ? <><Loader2 size={15} className="animate-spin" />Gerando...</> : <><FileText size={15} />{pdfUrl ? 'Gerar Novamente' : 'Gerar NRI'}</>}
          </button>
        </div>
      </div>
    </div>
  )
}
