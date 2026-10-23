import { useState, useEffect } from 'react'
import { Plus, Search, Pencil, Power, Truck, Trash2, Wrench, Clock, CheckCircle2, ChevronDown, ChevronUp, LogOut, RotateCcw } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import Modal from '../../components/Modal'
import { Field, inputClass, selectClass } from '../../lib/form'

const MOTIVOS_LABEL = {
  pneu:      'Pneu',
  freio:     'Freio',
  eletrica:  'Elétrica',
  funilaria: 'Funilaria',
  outros:    'Outros',
}

function tempoParado(dtEntrada) {
  const diff = Date.now() - new Date(dtEntrada).getTime()
  const totalMin = Math.floor(diff / 60000)
  const h = Math.floor(totalMin / 60)
  const d = Math.floor(h / 24)
  if (d > 0) return `${d}d ${h % 24}h`
  if (h > 0) return `${h}h ${totalMin % 60}min`
  return `${totalMin}min`
}

function duracaoTotal(dtEntrada, dtRetorno) {
  const diff = new Date(dtRetorno) - new Date(dtEntrada)
  const totalMin = Math.floor(diff / 60000)
  const h = Math.floor(totalMin / 60)
  const d = Math.floor(h / 24)
  if (d > 0) return `${d}d ${h % 24}h`
  if (h > 0) return `${h}h ${totalMin % 60}min`
  return `${totalMin}min`
}

function formatDT(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  const p = n => String(n).padStart(2, '0')
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} às ${p(d.getHours())}:${p(d.getMinutes())}`
}

function localNow() {
  const d = new Date()
  const p = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

export default function Carretas() {
  const { profile: meProfile } = useAuth()
  const isAdminTotal = meProfile?.acesso_total === true
  const podeExcluir  = isAdminTotal && meProfile?.email === 'admin@cobeb.com.br'

  // Cadastro state
  const [lista, setLista] = useState([])
  const [loading, setLoading] = useState(true)
  const [busca, setBusca] = useState('')
  const [modal, setModal] = useState(false)
  const [editando, setEditando] = useState(null)
  const [placa, setPlaca] = useState('')
  const [tipo, setTipo] = useState('FF')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')
  const [confirmar,   setConfirmar]   = useState(null)
  const [excluindo,   setExcluindo]   = useState(false)
  const [erroExcluir, setErroExcluir] = useState('')

  // Manutenção state
  const [manutencoesAtivas, setManutencoesAtivas] = useState([])
  const [modalMan, setModalMan] = useState(false)
  const [carretaMan, setCarretaMan] = useState(null)
  const [tipoMan, setTipoMan] = useState('corretiva')
  const [motivoMan, setMotivoMan] = useState('pneu')
  const [dtEntradaMan, setDtEntradaMan] = useState('')
  const [obsMan, setObsMan] = useState('')
  const [furoMan, setFuroMan] = useState(false)
  const [salvandoMan, setSalvandoMan] = useState(false)
  const [erroMan, setErroMan] = useState('')
  const [confirmarBaixa, setConfirmarBaixa] = useState(null)
  const [dandoBaixa, setDandoBaixa] = useState(false)

  // Histórico state
  const [historico, setHistorico] = useState([])
  const [showHistorico, setShowHistorico] = useState(false)
  const [loadingHistorico, setLoadingHistorico] = useState(false)

  const carregar = async () => {
    setLoading(true)
    const [{ data: c }, { data: m }] = await Promise.all([
      supabase.from('carretas').select('*').order('placa'),
      supabase
        .from('manutencoes_carretas')
        .select('*, responsavel:profiles(nome)')
        .eq('status', 'em_manutencao'),
    ])
    if (c) setLista(c)
    if (m) setManutencoesAtivas(m)
    setLoading(false)
  }

  const carregarHistorico = async () => {
    setLoadingHistorico(true)
    const { data } = await supabase
      .from('manutencoes_carretas')
      .select('*, carreta:carretas(placa, tipo), responsavel:profiles(nome)')
      .eq('status', 'finalizada')
      .order('dt_retorno', { ascending: false })
    if (data) setHistorico(data)
    setLoadingHistorico(false)
  }

  useEffect(() => { carregar() }, [])

  useEffect(() => {
    if (showHistorico && historico.length === 0) carregarHistorico()
  }, [showHistorico])

  // ── Cadastro ────────────────────────────────────────────────────────────────

  const abrirNovo = () => {
    setEditando(null); setPlaca(''); setTipo('FF'); setErro(''); setModal(true)
  }

  const abrirEditar = (c) => {
    setEditando(c); setPlaca(c.placa); setTipo(c.tipo); setErro(''); setModal(true)
  }

  const fechar = () => { setModal(false); setEditando(null) }

  const salvar = async (e) => {
    e.preventDefault()
    const placaFormatada = placa.toUpperCase().replace(/\s/g, '')
    setSalvando(true); setErro('')
    if (editando) {
      const { error } = await supabase.from('carretas')
        .update({ placa: placaFormatada, tipo }).eq('id', editando.id)
      if (error) setErro(error.message.includes('duplicate key') ? 'Já existe uma carreta com esta placa.' : error.message)
      else { await carregar(); fechar() }
    } else {
      const { error } = await supabase.from('carretas').insert({ placa: placaFormatada, tipo })
      if (error) setErro(error.message.includes('duplicate key') ? 'Já existe uma carreta com esta placa.' : error.message)
      else { await carregar(); fechar() }
    }
    setSalvando(false)
  }

  const toggleAtivo = async (c) => {
    const novoAtivo = !c.ativo
    await supabase.from('carretas').update({ ativo: novoAtivo }).eq('id', c.id)
    setLista(prev => prev.map(r => r.id === c.id ? { ...r, ativo: novoAtivo } : r))
  }

  const desligar = async (c) => {
    await supabase.from('carretas').update({ desligado: true, ativo: false }).eq('id', c.id)
    setLista(prev => prev.map(r => r.id === c.id ? { ...r, desligado: true, ativo: false } : r))
  }

  const reativar = async (c) => {
    await supabase.from('carretas').update({ desligado: false }).eq('id', c.id)
    setLista(prev => prev.map(r => r.id === c.id ? { ...r, desligado: false } : r))
  }

  const excluir = async (item) => {
    setExcluindo(true)
    setErroExcluir('')

    // 1. Desvincular viagens (dados ficam, só o link some)
    const { error: errVinculo } = await supabase
      .from('viagens')
      .update({ carreta_id: null })
      .eq('carreta_id', item.id)
    if (errVinculo) {
      setErroExcluir('Erro ao desvincular viagens: ' + errVinculo.message)
      setExcluindo(false)
      return
    }

    // 2. Remover manutenções da carreta
    await supabase.from('manutencoes_carretas').delete().eq('carreta_id', item.id)

    // 3. Excluir o cadastro
    const { error } = await supabase.from('carretas').delete().eq('id', item.id)
    if (error) {
      setErroExcluir(error.message)
      setExcluindo(false)
      return
    }

    setConfirmar(null)
    setErroExcluir('')
    setExcluindo(false)
    await carregar()
  }

  // ── Manutenção ──────────────────────────────────────────────────────────────

  const abrirModalMan = (c) => {
    setCarretaMan(c)
    setTipoMan('corretiva')
    setMotivoMan('pneu')
    setDtEntradaMan(localNow())
    setObsMan('')
    setFuroMan(false)
    setErroMan('')
    setModalMan(true)
  }

  const fecharModalMan = () => { setModalMan(false); setCarretaMan(null) }

  const registrarManutencao = async (e) => {
    e.preventDefault()
    setSalvandoMan(true); setErroMan('')
    const { error } = await supabase.rpc('registrar_manutencao', {
      p_carreta_id:  carretaMan.id,
      p_tipo:        tipoMan,
      p_motivo:      motivoMan,
      p_observacoes: obsMan || null,
      p_dt_entrada:  new Date(dtEntradaMan).toISOString(),
      p_furo_puxada: furoMan,
    })
    if (error) setErroMan(error.message)
    else { await carregar(); fecharModalMan() }
    setSalvandoMan(false)
  }

  const darBaixa = async (man) => {
    setDandoBaixa(true)
    const { error } = await supabase.rpc('dar_baixa_manutencao', {
      p_manutencao_id: man.id,
    })
    if (error) alert('Erro ao dar baixa: ' + error.message)
    else {
      if (showHistorico) setHistorico([])
      await carregar()
    }
    setConfirmarBaixa(null)
    setDandoBaixa(false)
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  const [filtroTipo,  setFiltroTipo]  = useState('')
  const [filtroMan,   setFiltroMan]   = useState('')
  const [filtroAtivo, setFiltroAtivo] = useState('')

  const filtrados = lista.filter(c => {
    if (!c.placa.toLowerCase().includes(busca.toLowerCase())) return false
    if (filtroTipo && c.tipo !== filtroTipo) return false
    if (filtroMan === 'sim' && !c.em_manutencao) return false
    if (filtroMan === 'nao' &&  c.em_manutencao) return false
    if (filtroAtivo === 'ativo'      && (!c.ativo || c.desligado)) return false
    if (filtroAtivo === 'inativo'    && ( c.ativo || c.desligado)) return false
    if (filtroAtivo === 'desligado'  && !c.desligado) return false
    if (filtroAtivo === ''           &&  c.desligado) return false
    return true
  })

  const emManutencaoCount = lista.filter(c => c.em_manutencao).length

  const chipCls = (ativo) =>
    `px-3 py-1 rounded-full text-xs font-semibold border transition-colors ${
      ativo
        ? 'bg-cobeb-navy text-white border-cobeb-navy'
        : 'bg-white text-slate-500 border-cobeb-border hover:border-cobeb-blue/40'
    }`

  return (
    <div className="px-5 py-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-cobeb-text font-semibold text-sm">
            {lista.length} carreta{lista.length !== 1 ? 's' : ''}
          </p>
          <p className="text-slate-500 text-xs">
            {lista.filter(c => c.ativo && !c.em_manutencao && !c.desligado).length} ativa{lista.filter(c => c.ativo && !c.em_manutencao && !c.desligado).length !== 1 ? 's' : ''}
            {emManutencaoCount > 0 && (
              <span className="text-amber-500 ml-1.5">· {emManutencaoCount} em manutenção</span>
            )}
            {lista.filter(c => c.desligado).length > 0 && (
              <span className="text-slate-400 ml-1.5">· {lista.filter(c => c.desligado).length} não vinculada{lista.filter(c => c.desligado).length !== 1 ? 's' : ''}</span>
            )}
          </p>
        </div>
        <button onClick={abrirNovo}
          className="flex items-center gap-1.5 bg-cobeb-navy hover:bg-cobeb-blue text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors">
          <Plus size={15} /> Nova
        </button>
      </div>

      {/* Busca */}
      <div className="relative mb-3">
        <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
        <input type="text" placeholder="Buscar por placa..."
          value={busca} onChange={e => setBusca(e.target.value)}
          className="w-full bg-[#EBF5FF] border border-cobeb-border rounded-xl pl-9 pr-4 py-3 text-cobeb-text text-sm placeholder-blue-200 focus:outline-none focus:border-cobeb-blue transition-all" />
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-2 mb-4">
        <button onClick={() => setFiltroTipo('')}       className={chipCls(filtroTipo === '')}>Todos</button>
        <button onClick={() => setFiltroTipo('FF')}     className={chipCls(filtroTipo === 'FF')}>Frota Fixa</button>
        <button onClick={() => setFiltroTipo('SPOT')}   className={chipCls(filtroTipo === 'SPOT')}>SPOT</button>
        <span className="text-cobeb-border">|</span>
        <button onClick={() => setFiltroMan('')}        className={chipCls(filtroMan === '')}>Todos</button>
        <button onClick={() => setFiltroMan('sim')}     className={chipCls(filtroMan === 'sim')}>Em Manutenção</button>
        <button onClick={() => setFiltroMan('nao')}     className={chipCls(filtroMan === 'nao')}>Disponíveis</button>
        <span className="text-cobeb-border">|</span>
        <button onClick={() => setFiltroAtivo('')}           className={chipCls(filtroAtivo === '')}>Em frota</button>
        <button onClick={() => setFiltroAtivo('ativo')}      className={chipCls(filtroAtivo === 'ativo')}>Ativo</button>
        <button onClick={() => setFiltroAtivo('inativo')}    className={chipCls(filtroAtivo === 'inativo')}>Inativo</button>
        <button onClick={() => setFiltroAtivo('desligado')}  className={chipCls(filtroAtivo === 'desligado')}>Não vinculado</button>
      </div>

      {/* Lista */}
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-6 h-6 border-2 border-cobeb-navy border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filtrados.length === 0 ? (
        <p className="text-center text-slate-500 text-sm py-12">Nenhuma carreta encontrada</p>
      ) : (
        <div className="space-y-3">
          {filtrados.map(c => {
            const man = manutencoesAtivas.find(m => m.carreta_id === c.id)
            return (
              <div key={c.id} className={`rounded-xl p-4 border transition-colors ${
                c.desligado
                  ? 'bg-slate-50 border-slate-200 opacity-75'
                  : c.em_manutencao
                    ? 'bg-amber-50/60 border-amber-300'
                    : 'bg-gray-50 border-cobeb-border'
              }`}>
                {/* Linha principal */}
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className={`w-9 h-9 rounded-lg border flex items-center justify-center shrink-0 ${
                      c.desligado ? 'bg-slate-100 border-slate-200' :
                      c.em_manutencao ? 'bg-amber-100 border-amber-200' : 'bg-white border-gray-200'
                    }`}>
                      {c.desligado
                        ? <Truck size={16} className="text-slate-300" />
                        : c.em_manutencao
                          ? <Wrench size={16} className="text-amber-500" />
                          : <Truck size={16} className="text-slate-500" />}
                    </div>
                    <div>
                      <p className="text-cobeb-text font-bold text-base tracking-wider font-mono">{c.placa}</p>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <span className="text-[11px] bg-white border border-gray-200 text-slate-500 px-2 py-0.5 rounded-full font-medium">{c.tipo}</span>
                        {c.desligado ? (
                          <span className="text-[11px] px-2 py-0.5 rounded-full font-medium border bg-slate-100 text-slate-400 border-slate-300">
                            Não vinculada
                          </span>
                        ) : c.em_manutencao ? (
                          <span className="text-[11px] px-2 py-0.5 rounded-full font-medium border bg-amber-500/10 text-amber-600 border-amber-400/30">
                            Em Manutenção
                          </span>
                        ) : (
                          <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium border ${
                            c.ativo
                              ? 'bg-green-500/10 text-green-400 border-green-500/20'
                              : 'bg-red-500/10 text-red-400 border-red-500/20'
                          }`}>{c.ativo ? 'Ativa' : 'Inativa'}</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Ações */}
                  <div className="flex gap-1.5 shrink-0">
                    {c.desligado ? (
                      <>
                        {isAdminTotal && (
                          <button onClick={() => reativar(c)} title="Reativar na frota"
                            className="flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-lg bg-[#EBF5FF] border border-cobeb-border text-cobeb-navy hover:bg-cobeb-navy hover:text-white transition-colors">
                            <RotateCcw size={13} /> Reativar
                          </button>
                        )}
                        {podeExcluir && (
                          <ActionBtn onClick={() => setConfirmar({ ...c, nome: c.placa })}
                            className="hover:text-red-400 hover:border-red-500/40">
                            <Trash2 size={14} />
                          </ActionBtn>
                        )}
                      </>
                    ) : c.em_manutencao ? (
                      /* Carreta bloqueada: só dar baixa */
                      isAdminTotal && (
                        <button onClick={() => setConfirmarBaixa(man)}
                          className="flex items-center gap-1.5 bg-green-500 hover:bg-green-600 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors">
                          <CheckCircle2 size={13} /> Dar Baixa
                        </button>
                      )
                    ) : (
                      /* Carreta livre: ações normais + registrar manutenção */
                      <>
                        {isAdminTotal && (
                          <ActionBtn onClick={() => abrirModalMan(c)} title="Registrar Manutenção"
                            className="hover:text-amber-500 hover:border-amber-400/40">
                            <Wrench size={14} />
                          </ActionBtn>
                        )}
                        <ActionBtn onClick={() => abrirEditar(c)}><Pencil size={14} /></ActionBtn>
                        <ActionBtn onClick={() => toggleAtivo(c)}
                          className={c.ativo ? 'hover:text-red-400 hover:border-red-500/40' : 'hover:text-green-400 hover:border-green-500/40'}>
                          <Power size={14} />
                        </ActionBtn>
                        {isAdminTotal && (
                          <ActionBtn onClick={() => desligar(c)} title="Não vinculada — saiu da frota"
                            className="hover:text-slate-500 hover:border-slate-400/40">
                            <LogOut size={14} />
                          </ActionBtn>
                        )}
                        {podeExcluir && (
                          <ActionBtn onClick={() => setConfirmar({ ...c, nome: c.placa })}
                            className="hover:text-red-400 hover:border-red-500/40">
                            <Trash2 size={14} />
                          </ActionBtn>
                        )}
                      </>
                    )}
                  </div>
                </div>

                {/* Detalhes da manutenção ativa */}
                {c.em_manutencao && man && (
                  <div className="mt-3 pt-3 border-t border-amber-200 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-xs font-semibold text-amber-700 capitalize">
                        {man.tipo} · {MOTIVOS_LABEL[man.motivo] ?? man.motivo}
                      </p>
                      {man.furo_puxada && (
                        <span className="text-[11px] px-2 py-0.5 rounded-full font-semibold border bg-red-500/10 text-red-500 border-red-400/30">
                          Furo de Puxada
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-amber-600">
                      <Clock size={11} />
                      <span>Entrada: {formatDT(man.dt_entrada)}</span>
                    </div>
                    <p className="text-xs text-amber-600">
                      Parada há <span className="font-semibold">{tempoParado(man.dt_entrada)}</span>
                      {man.responsavel?.nome && (
                        <span className="text-amber-500"> · Resp: {man.responsavel.nome}</span>
                      )}
                    </p>
                    {man.observacoes && (
                      <p className="text-xs text-slate-500 italic">"{man.observacoes}"</p>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Histórico */}
      {isAdminTotal && (
        <div className="mt-6">
          <button
            onClick={() => setShowHistorico(v => !v)}
            className="flex items-center gap-2 w-full text-left py-3 border-t border-cobeb-border">
            <span className="text-cobeb-text font-semibold text-sm flex-1">Histórico de Manutenções</span>
            {showHistorico
              ? <ChevronUp size={16} className="text-slate-500" />
              : <ChevronDown size={16} className="text-slate-500" />}
          </button>

          {showHistorico && (
            <div className="mt-1 pb-4">
              {loadingHistorico ? (
                <div className="flex justify-center py-8">
                  <div className="w-5 h-5 border-2 border-cobeb-navy border-t-transparent rounded-full animate-spin" />
                </div>
              ) : historico.length === 0 ? (
                <p className="text-center text-slate-500 text-sm py-6">Nenhuma manutenção finalizada</p>
              ) : (
                <div className="space-y-2">
                  {historico.map(h => (
                    <div key={h.id} className="bg-white rounded-xl p-3.5 border border-cobeb-border">
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <p className="font-mono font-bold text-cobeb-text text-sm tracking-wider">
                          {h.carreta?.placa}
                        </p>
                        <span className="text-[11px] bg-green-500/10 text-green-600 border border-green-500/20 px-2 py-0.5 rounded-full font-medium">
                          Finalizada
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
                        <p className="text-[11px] text-slate-500">
                          <span className="text-slate-400">Tipo: </span>
                          <span className="capitalize">{h.tipo}</span>
                        </p>
                        <p className="text-[11px] text-slate-500">
                          <span className="text-slate-400">Motivo: </span>
                          {MOTIVOS_LABEL[h.motivo] ?? h.motivo}
                        </p>
                        <p className="text-[11px] text-slate-500 col-span-2">
                          <span className="text-slate-400">Entrada: </span>
                          {formatDT(h.dt_entrada)}
                        </p>
                        <p className="text-[11px] text-slate-500 col-span-2">
                          <span className="text-slate-400">Retorno: </span>
                          {formatDT(h.dt_retorno)}
                        </p>
                        <p className="text-[11px] text-slate-500 col-span-2">
                          <span className="text-slate-400">Total parado: </span>
                          <span className="font-semibold text-cobeb-text">
                            {duracaoTotal(h.dt_entrada, h.dt_retorno)}
                          </span>
                        </p>
                        <p className="text-[11px] col-span-2">
                          <span className="text-slate-400">Furo de puxada: </span>
                          {h.furo_puxada
                            ? <span className="font-semibold text-red-500">Sim</span>
                            : <span className="text-slate-500">Não</span>}
                        </p>
                        {h.responsavel?.nome && (
                          <p className="text-[11px] text-slate-500 col-span-2">
                            <span className="text-slate-400">Resp: </span>
                            {h.responsavel.nome}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Modais */}
      <ModalConfirmar confirmar={confirmar} excluindo={excluindo} erro={erroExcluir}
        onConfirm={excluir} onCancelar={() => { setConfirmar(null); setErroExcluir('') }} />

      <ModalConfirmarBaixa confirmar={confirmarBaixa} dando={dandoBaixa}
        onConfirm={darBaixa} onCancelar={() => setConfirmarBaixa(null)} />

      {/* Modal editar / novo cadastro */}
      {modal && (
        <Modal title={editando ? 'Editar Carreta' : 'Nova Carreta'} onClose={fechar}>
          <form onSubmit={salvar} className="space-y-4">
            <Field label="Placa" required>
              <input type="text" value={placa}
                onChange={e => setPlaca(e.target.value.toUpperCase())}
                required maxLength={8} placeholder="Ex: ABC1D23"
                className={`${inputClass} font-mono uppercase tracking-widest`} />
              <p className="text-slate-500 text-xs mt-1">Formato antigo: ABC1234 · Mercosul: ABC1D23</p>
            </Field>
            <Field label="Tipo" required>
              <select value={tipo} onChange={e => setTipo(e.target.value)} className={selectClass}>
                <option value="FF">FF — Frota Fixa</option>
                <option value="SPOT">SPOT — Freteiro</option>
              </select>
            </Field>
            {erro && (
              <p className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-red-400 text-sm">{erro}</p>
            )}
            <button type="submit" disabled={salvando}
              className="w-full bg-cobeb-navy hover:bg-cobeb-blue disabled:opacity-60 text-white font-semibold py-3 rounded-xl transition-colors text-sm">
              {salvando ? 'Salvando...' : editando ? 'Salvar alterações' : 'Cadastrar carreta'}
            </button>
          </form>
        </Modal>
      )}

      {/* Modal registrar manutenção */}
      {modalMan && carretaMan && (
        <Modal title={`Manutenção — ${carretaMan.placa}`} onClose={fecharModalMan}>
          <form onSubmit={registrarManutencao} className="space-y-4">
            <Field label="Tipo de Manutenção" required>
              <select value={tipoMan} onChange={e => setTipoMan(e.target.value)} className={selectClass}>
                <option value="corretiva">Corretiva</option>
                <option value="preventiva">Preventiva</option>
              </select>
            </Field>
            <Field label="Motivo" required>
              <select value={motivoMan} onChange={e => setMotivoMan(e.target.value)} className={selectClass}>
                <option value="pneu">Pneu</option>
                <option value="freio">Freio</option>
                <option value="eletrica">Elétrica</option>
                <option value="funilaria">Funilaria</option>
                <option value="outros">Outros</option>
              </select>
            </Field>
            <Field label="Data e Hora de Entrada" required>
              <input type="datetime-local" value={dtEntradaMan}
                onChange={e => setDtEntradaMan(e.target.value)}
                required className={inputClass} />
            </Field>
            <Field label="Observações">
              <textarea value={obsMan} onChange={e => setObsMan(e.target.value)}
                rows={3} placeholder="Descreva o problema..."
                className={`${inputClass} resize-none`} />
            </Field>
            <Field label="Impactou viagem no dia?" required>
              <div className="flex gap-2">
                <button type="button" onClick={() => setFuroMan(false)}
                  className={`flex-1 py-2.5 rounded-xl text-sm font-semibold border transition-colors ${
                    !furoMan
                      ? 'bg-cobeb-navy text-white border-cobeb-navy'
                      : 'bg-[#F5F9FF] text-slate-500 border-cobeb-border'
                  }`}>
                  Não
                </button>
                <button type="button" onClick={() => setFuroMan(true)}
                  className={`flex-1 py-2.5 rounded-xl text-sm font-semibold border transition-colors ${
                    furoMan
                      ? 'bg-red-500 text-white border-red-500'
                      : 'bg-[#F5F9FF] text-slate-500 border-cobeb-border'
                  }`}>
                  Sim — Furo de Puxada
                </button>
              </div>
            </Field>
            <Field label="Responsável pelo Registro">
              <input type="text" value={meProfile?.nome ?? ''} disabled
                className={`${inputClass} opacity-60 cursor-not-allowed`} />
            </Field>
            {erroMan && (
              <p className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-red-400 text-sm">{erroMan}</p>
            )}
            <button type="submit" disabled={salvandoMan}
              className="w-full bg-amber-500 hover:bg-amber-600 disabled:opacity-60 text-white font-semibold py-3 rounded-xl transition-colors text-sm">
              {salvandoMan ? 'Registrando...' : 'Registrar Manutenção'}
            </button>
          </form>
        </Modal>
      )}
    </div>
  )
}

function ActionBtn({ onClick, children, className = '', title }) {
  return (
    <button onClick={onClick} title={title}
      className={`w-8 h-8 rounded-lg bg-[#EBF5FF] border border-cobeb-border flex items-center justify-center text-slate-500 hover:text-cobeb-yellow hover:border-cobeb-blue/40 transition-colors ${className}`}>
      {children}
    </button>
  )
}

function ModalConfirmar({ confirmar, excluindo, erro, onConfirm, onCancelar }) {
  if (!confirmar) return null
  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-end">
      <div className="w-full max-w-lg mx-auto bg-white rounded-t-2xl p-5 space-y-4">
        <div className="w-10 h-1 bg-cobeb-border rounded-full mx-auto" />
        <div>
          <p className="text-cobeb-text font-semibold text-base">Confirmar exclusão</p>
          <p className="text-slate-500 text-sm mt-1">
            Excluir <span className="font-semibold text-cobeb-text">{confirmar.nome}</span>? Esta ação não pode ser desfeita.
          </p>
        </div>
        {erro && (
          <p className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-red-400 text-sm">{erro}</p>
        )}
        <div className="flex gap-3">
          <button onClick={onCancelar}
            className="flex-1 bg-[#EBF5FF] border border-cobeb-border text-slate-500 font-semibold py-3 rounded-xl text-sm">
            Cancelar
          </button>
          <button onClick={() => onConfirm(confirmar)} disabled={excluindo}
            className="flex-1 bg-red-500 hover:bg-red-600 disabled:opacity-50 text-white font-semibold py-3 rounded-xl text-sm transition-colors">
            {excluindo ? 'Excluindo...' : 'Excluir'}
          </button>
        </div>
      </div>
    </div>
  )
}

function ModalConfirmarBaixa({ confirmar, dando, onConfirm, onCancelar }) {
  if (!confirmar) return null
  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-end">
      <div className="w-full max-w-lg mx-auto bg-white rounded-t-2xl p-5 space-y-4">
        <div className="w-10 h-1 bg-cobeb-border rounded-full mx-auto" />
        <div>
          <p className="text-cobeb-text font-semibold text-base">Confirmar Baixa</p>
          <p className="text-slate-500 text-sm mt-1">
            Liberar a carreta para operação? A data e hora de retorno será registrada agora.
          </p>
        </div>
        <div className="flex gap-3">
          <button onClick={onCancelar}
            className="flex-1 bg-[#EBF5FF] border border-cobeb-border text-slate-500 font-semibold py-3 rounded-xl text-sm">
            Cancelar
          </button>
          <button onClick={() => onConfirm(confirmar)} disabled={dando}
            className="flex-1 bg-green-500 hover:bg-green-600 disabled:opacity-50 text-white font-semibold py-3 rounded-xl text-sm transition-colors">
            {dando ? 'Baixando...' : 'Confirmar Baixa'}
          </button>
        </div>
      </div>
    </div>
  )
}
