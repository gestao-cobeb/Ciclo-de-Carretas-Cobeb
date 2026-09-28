import { useState, useEffect } from 'react'
import { Plus, Search, Pencil, Power, Trash2, Clock } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import Modal from '../../components/Modal'
import { Field, inputClass, selectClass } from '../../lib/form'

export default function Turnos() {
  const [lista,         setLista]         = useState([])
  const [unidades,      setUnidades]      = useState([])
  const [loading,       setLoading]       = useState(true)
  const [busca,         setBusca]         = useState('')
  const [filtroUnidade, setFiltroUnidade] = useState('')
  const [modal,         setModal]         = useState(false)
  const [editando,      setEditando]      = useState(null)

  // campos do formulário
  const [nome,       setNome]       = useState('')
  const [unidadeId,  setUnidadeId]  = useState('')
  const [horaInicio, setHoraInicio] = useState('')
  const [horaFim,    setHoraFim]    = useState('')
  const [salvando,   setSalvando]   = useState(false)
  const [erro,       setErro]       = useState('')
  const [confirmar,  setConfirmar]  = useState(null)
  const [excluindo,  setExcluindo]  = useState(false)

  const carregar = async () => {
    setLoading(true)
    const [{ data: t }, { data: u }] = await Promise.all([
      supabase
        .from('turnos')
        .select('*, unidade:unidades(id, nome)')
        .order('unidade_id')
        .order('hora_inicio'),
      supabase
        .from('unidades')
        .select('id, nome')
        .eq('ativo', true)
        .order('nome'),
    ])
    if (t) setLista(t)
    if (u) setUnidades(u)
    setLoading(false)
  }

  useEffect(() => { carregar() }, [])

  const abrirNovo = () => {
    setEditando(null)
    setNome(''); setUnidadeId(''); setHoraInicio(''); setHoraFim(''); setErro('')
    setModal(true)
  }

  const abrirEditar = (t) => {
    setEditando(t)
    setNome(t.nome)
    setUnidadeId(t.unidade_id)
    setHoraInicio(t.hora_inicio?.slice(0, 5) ?? '')
    setHoraFim(t.hora_fim?.slice(0, 5) ?? '')
    setErro('')
    setModal(true)
  }

  const fechar = () => { setModal(false); setEditando(null) }

  const salvar = async (e) => {
    e.preventDefault()
    setSalvando(true); setErro('')
    const payload = {
      nome:        nome.trim(),
      unidade_id:  unidadeId,
      hora_inicio: horaInicio,
      hora_fim:    horaFim,
    }
    if (editando) {
      const { error } = await supabase.from('turnos').update(payload).eq('id', editando.id)
      if (error) { setErro(error.message); setSalvando(false); return }
    } else {
      const { error } = await supabase.from('turnos').insert(payload)
      if (error) { setErro(error.message); setSalvando(false); return }
    }
    await carregar(); fechar(); setSalvando(false)
  }

  const toggleAtivo = async (t) => {
    await supabase.from('turnos').update({ ativo: !t.ativo }).eq('id', t.id)
    setLista(prev => prev.map(r => r.id === t.id ? { ...r, ativo: !t.ativo } : r))
  }

  const excluir = async (item) => {
    setExcluindo(true)
    await supabase.from('turnos').delete().eq('id', item.id)
    setConfirmar(null); setExcluindo(false)
    await carregar()
  }

  const cruzaMeianoite = (inicio, fim) => inicio && fim && fim <= inicio

  const filtrados = lista.filter(t => {
    if (filtroUnidade && t.unidade_id !== filtroUnidade) return false
    if (busca) {
      const q = busca.toLowerCase()
      const matchNome    = t.nome.toLowerCase().includes(q)
      const matchUnidade = (t.unidade?.nome ?? '').toLowerCase().includes(q)
      if (!matchNome && !matchUnidade) return false
    }
    return true
  })

  return (
    <div className="px-5 py-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-cobeb-text font-semibold text-sm">
            {lista.length} turno{lista.length !== 1 ? 's' : ''}
          </p>
          <p className="text-slate-500 text-xs">
            {lista.filter(t => t.ativo).length} ativo{lista.filter(t => t.ativo).length !== 1 ? 's' : ''}
          </p>
        </div>
        <button onClick={abrirNovo}
          className="flex items-center gap-1.5 bg-cobeb-navy hover:bg-cobeb-blue text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors">
          <Plus size={15} /> Novo
        </button>
      </div>

      {/* Filtro por unidade */}
      <div className="mb-3">
        <select value={filtroUnidade} onChange={e => setFiltroUnidade(e.target.value)} className={selectClass}>
          <option value="">Todas as unidades</option>
          {unidades.map(u => (
            <option key={u.id} value={u.id}>{u.nome}</option>
          ))}
        </select>
      </div>

      {/* Busca */}
      <div className="relative mb-4">
        <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
        <input type="text" placeholder="Buscar por nome do turno ou unidade..."
          value={busca} onChange={e => setBusca(e.target.value)}
          className="w-full bg-[#EBF5FF] border border-cobeb-border rounded-xl pl-9 pr-4 py-3 text-cobeb-text text-sm placeholder-blue-200 focus:outline-none focus:border-cobeb-blue transition-all" />
      </div>

      {/* Lista */}
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-6 h-6 border-2 border-cobeb-navy border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filtrados.length === 0 ? (
        <div className="text-center py-12">
          <Clock size={28} className="text-cobeb-border mx-auto mb-3" />
          <p className="text-slate-500 text-sm">Nenhum turno encontrado</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtrados.map(t => (
            <div key={t.id} className="bg-gray-50 border border-cobeb-border rounded-xl p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-white border border-gray-200 flex items-center justify-center shrink-0">
                    <Clock size={16} className="text-cobeb-navy" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap mb-0.5">
                      <p className="text-cobeb-text font-bold text-sm">Turno {t.nome}</p>
                      <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium border ${
                        t.ativo
                          ? 'bg-green-500/10 text-green-400 border-green-500/20'
                          : 'bg-red-500/10 text-red-400 border-red-500/20'
                      }`}>{t.ativo ? 'Ativo' : 'Inativo'}</span>
                      {cruzaMeianoite(t.hora_inicio, t.hora_fim) && (
                        <span className="text-[11px] px-2 py-0.5 rounded-full font-medium border bg-amber-500/10 text-amber-600 border-amber-400/30">
                          Cruza meia-noite
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500">{t.unidade?.nome ?? '—'}</p>
                    <p className="text-xs font-mono text-cobeb-navy mt-0.5">
                      {t.hora_inicio?.slice(0, 5)} → {t.hora_fim?.slice(0, 5)}
                    </p>
                  </div>
                </div>

                <div className="flex gap-1.5 shrink-0">
                  <ActionBtn onClick={() => abrirEditar(t)} title="Editar">
                    <Pencil size={14} />
                  </ActionBtn>
                  <ActionBtn onClick={() => toggleAtivo(t)}
                    title={t.ativo ? 'Inativar' : 'Ativar'}
                    className={t.ativo ? 'hover:text-red-400 hover:border-red-500/40' : 'hover:text-green-400 hover:border-green-500/40'}>
                    <Power size={14} />
                  </ActionBtn>
                  <ActionBtn onClick={() => setConfirmar(t)} title="Excluir"
                    className="hover:text-red-400 hover:border-red-500/40">
                    <Trash2 size={14} />
                  </ActionBtn>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal novo / editar */}
      {modal && (
        <Modal title={editando ? 'Editar Turno' : 'Novo Turno'} onClose={fechar}>
          <form onSubmit={salvar} className="space-y-4">

            <Field label="Unidade" required>
              <select value={unidadeId} onChange={e => setUnidadeId(e.target.value)} required className={selectClass}>
                <option value="">Selecione a unidade</option>
                {unidades.map(u => (
                  <option key={u.id} value={u.id}>{u.nome}</option>
                ))}
              </select>
            </Field>

            <Field label="Turno" required>
              <select value={nome} onChange={e => setNome(e.target.value)} required className={selectClass}>
                <option value="">Selecione o turno</option>
                <option value="A">Turno A</option>
                <option value="B">Turno B</option>
                <option value="C">Turno C</option>
              </select>
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Hora de Início" required>
                <input type="time" value={horaInicio} onChange={e => setHoraInicio(e.target.value)}
                  required className={inputClass} />
              </Field>
              <Field label="Hora de Fim" required>
                <input type="time" value={horaFim} onChange={e => setHoraFim(e.target.value)}
                  required className={inputClass} />
              </Field>
            </div>

            {cruzaMeianoite(horaInicio, horaFim) && (
              <p className="text-amber-600 text-xs bg-amber-500/10 border border-amber-400/30 rounded-xl px-3 py-2">
                Turno cruza meia-noite: o horário de fim é no dia seguinte.
              </p>
            )}

            {erro && (
              <p className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-red-400 text-sm">{erro}</p>
            )}

            <button type="submit" disabled={salvando}
              className="w-full bg-cobeb-navy hover:bg-cobeb-blue disabled:opacity-60 text-white font-semibold py-3 rounded-xl transition-colors text-sm">
              {salvando ? 'Salvando...' : editando ? 'Salvar alterações' : 'Cadastrar turno'}
            </button>
          </form>
        </Modal>
      )}

      {/* Confirmação de exclusão */}
      {confirmar && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-end">
          <div className="w-full max-w-lg mx-auto bg-white rounded-t-2xl p-5 space-y-4">
            <div className="w-10 h-1 bg-cobeb-border rounded-full mx-auto" />
            <div>
              <p className="text-cobeb-text font-semibold text-base">Confirmar exclusão</p>
              <p className="text-slate-500 text-sm mt-1">
                Excluir o Turno{' '}
                <span className="font-semibold text-cobeb-text">{confirmar.nome}</span>
                {confirmar.unidade?.nome ? ` da ${confirmar.unidade.nome}` : ''}?
                {' '}Esta ação não pode ser desfeita.
              </p>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setConfirmar(null)}
                className="flex-1 bg-[#EBF5FF] border border-cobeb-border text-slate-500 font-semibold py-3 rounded-xl text-sm">
                Cancelar
              </button>
              <button onClick={() => excluir(confirmar)} disabled={excluindo}
                className="flex-1 bg-red-500 hover:bg-red-600 disabled:opacity-50 text-white font-semibold py-3 rounded-xl text-sm transition-colors">
                {excluindo ? 'Excluindo...' : 'Excluir'}
              </button>
            </div>
          </div>
        </div>
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
