import { useState, useEffect } from 'react'
import { Plus, Search, Pencil, Power, Copy, CheckCircle, Shield, MapPin, Trash2 } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import Modal from '../../components/Modal'
import { Field, inputClass, selectClass, gerarSenha } from '../../lib/form'
import { MODULOS } from '../SeletorModulo'

export default function Admins() {
  const { profile: meProfile } = useAuth()
  const isAdminTotal = meProfile?.acesso_total === true
  const [lista, setLista] = useState([])
  const [confirmar, setConfirmar] = useState(null)
  const [excluindo, setExcluindo] = useState(false)
  const [unidades, setUnidades] = useState([])
  const [loading, setLoading] = useState(true)
  const [busca, setBusca] = useState('')
  const [modal, setModal] = useState(false)
  const [editando, setEditando] = useState(null)
  const [nome, setNome] = useState('')
  const [email, setEmail] = useState('')
  const [acessoTotal, setAcessoTotal] = useState(false)
  const [modulosPermitidos, setModulosPermitidos] = useState([])
  const [gradePermitida, setGradePermitida] = useState(false)
  const [unidadeId, setUnidadeId] = useState('')
  const [senha, setSenha] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')
  const [senhaCriada, setSenhaCriada] = useState('')
  const [copiado, setCopiado] = useState(false)

  const carregar = async () => {
    setLoading(true)
    const [{ data: admins }, { data: unids }] = await Promise.all([
      supabase.from('profiles')
        .select('id, nome, email, ativo, acesso_total, modulos_permitidos, grade_permitida, unidade:unidades(id, nome, cidade)')
        .eq('perfil', 'admin').order('nome'),
      supabase.from('unidades').select('id, nome, cidade').eq('ativo', true).order('nome'),
    ])
    if (admins) setLista(admins)
    if (unids) { setUnidades(unids); if (!unidadeId && unids.length) setUnidadeId(unids[0].id) }
    setLoading(false)
  }

  useEffect(() => { carregar() }, [])

  const abrirNovo = () => {
    setEditando(null); setNome(''); setEmail('')
    setAcessoTotal(false); setModulosPermitidos([]); setGradePermitida(false)
    setUnidadeId(unidades[0]?.id || '')
    setSenha(gerarSenha()); setErro(''); setSenhaCriada(''); setCopiado(false)
    setModal(true)
  }

  const abrirEditar = (a) => {
    setEditando(a); setNome(a.nome); setEmail(a.email)
    setAcessoTotal(a.acesso_total); setModulosPermitidos(a.modulos_permitidos || [])
    setGradePermitida(a.grade_permitida || false)
    setUnidadeId(a.unidade?.id || unidades[0]?.id || '')
    setSenha(''); setErro(''); setSenhaCriada(''); setCopiado(false)
    setModal(true)
  }

  const toggleModulo = (key) => {
    setModulosPermitidos(prev =>
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
    )
  }

  const fechar = () => { setModal(false); setEditando(null); setSenhaCriada('') }
  const copiar = (t) => { navigator.clipboard.writeText(t); setCopiado(true); setTimeout(() => setCopiado(false), 2000) }

  const salvar = async (e) => {
    e.preventDefault()
    if (!acessoTotal && !unidadeId) { setErro('Selecione uma unidade.'); return }
    setSalvando(true); setErro('')

    if (editando) {
      const { error } = await supabase.from('profiles').update({
        nome, acesso_total: acessoTotal,
        unidade_id: acessoTotal ? null : unidadeId,
        modulos_permitidos: acessoTotal ? null : modulosPermitidos,
        grade_permitida: acessoTotal ? false : gradePermitida,
      }).eq('id', editando.id)
      if (error) setErro(error.message)
      else { await carregar(); fechar() }
    } else {
      const { data: userId, error: authErr } = await supabase.rpc('criar_usuario_auth', {
        p_email: email, p_senha: senha, p_nome: nome,
      })
      if (authErr) { setErro(authErr.message); setSalvando(false); return }

      const { error: profileErr } = await supabase.from('profiles').insert({
        id: userId, nome, email, perfil: 'admin',
        acesso_total: acessoTotal,
        unidade_id: acessoTotal ? null : unidadeId,
        modulos_permitidos: acessoTotal ? null : modulosPermitidos,
        grade_permitida: acessoTotal ? false : gradePermitida,
        primeiro_acesso: true,
      })
      if (profileErr) { setErro(profileErr.message); setSalvando(false); return }

      setSenhaCriada(senha); await carregar()
    }
    setSalvando(false)
  }

  const toggleAtivo = async (a) => {
    if (a.id === meProfile?.id) { setErro('Você não pode inativar sua própria conta.'); return }
    const novoAtivo = !a.ativo
    await supabase.from('profiles').update({ ativo: novoAtivo }).eq('id', a.id)
    await supabase.rpc('ativar_usuario', { p_user_id: a.id, p_ativo: novoAtivo })
    setLista(prev => prev.map(r => r.id === a.id ? { ...r, ativo: novoAtivo } : r))
  }

  const redefinirSenha = async () => {
    const nova = gerarSenha()
    await supabase.rpc('redefinir_senha_usuario', { p_user_id: editando.id, p_nova_senha: nova })
    setSenhaCriada(nova); setCopiado(false)
  }

  const excluir = async (item) => {
    if (item.id === meProfile?.id) return
    setExcluindo(true)
    const { error } = await supabase.rpc('excluir_usuario', { p_user_id: item.id })
    if (error) {
      alert('Erro ao excluir: ' + error.message)
      setExcluindo(false)
      return
    }
    setConfirmar(null)
    setExcluindo(false)
    await carregar()
  }

  const filtrados = lista.filter(a =>
    a.nome.toLowerCase().includes(busca.toLowerCase()) ||
    a.email.toLowerCase().includes(busca.toLowerCase())
  )

  return (
    <div className="px-5 py-4">
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-cobeb-text font-semibold text-sm">{lista.length} admin{lista.length !== 1 ? 's' : ''}</p>
          <p className="text-slate-500 text-xs">{lista.filter(a => a.ativo).length} ativo{lista.filter(a => a.ativo).length !== 1 ? 's' : ''}</p>
        </div>
        <button onClick={abrirNovo}
          className="flex items-center gap-1.5 bg-cobeb-navy hover:bg-cobeb-blue text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors">
          <Plus size={15} /> Novo
        </button>
      </div>

      {erro && !modal && (
        <div className="mb-4 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
          <p className="text-red-400 text-sm">{erro}</p>
        </div>
      )}

      <div className="relative mb-4">
        <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
        <input type="text" placeholder="Buscar por nome ou email..."
          value={busca} onChange={e => setBusca(e.target.value)}
          className="w-full bg-[#EBF5FF] border border-cobeb-border rounded-xl pl-9 pr-4 py-3 text-cobeb-text text-sm placeholder-blue-200 focus:outline-none focus:border-cobeb-blue transition-all" />
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-6 h-6 border-2 border-cobeb-navy border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filtrados.length === 0 ? (
        <p className="text-center text-slate-500 text-sm py-12">Nenhum admin encontrado</p>
      ) : (
        <div className="space-y-3">
          {filtrados.map(a => (
            <div key={a.id} className={`bg-gray-50 rounded-xl p-4 border ${a.id === meProfile?.id ? 'border-cobeb-yellow/40' : 'border-cobeb-border'}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-cobeb-text font-semibold text-sm truncate">{a.nome}</p>
                    {a.id === meProfile?.id && <span className="text-[10px] text-cobeb-yellow font-medium shrink-0">(você)</span>}
                  </div>
                  <p className="text-slate-500 text-xs mt-0.5 truncate">{a.email}</p>
                  <div className="flex items-center gap-1 mt-1.5">
                    {a.acesso_total ? (
                      <span className="flex items-center gap-1 text-[11px] bg-cobeb-navy/10 border border-cobeb-yellow/40 text-cobeb-yellow px-2 py-0.5 rounded-full font-medium">
                        <Shield size={10} /> Acesso Total
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-[11px] bg-white border border-gray-200 text-slate-500 px-2 py-0.5 rounded-full">
                        <MapPin size={10} /> {a.unidade?.nome || 'Sem unidade'}
                      </span>
                    )}
                    <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium border ${
                      a.ativo ? 'bg-green-500/10 text-green-400 border-green-500/20' : 'bg-red-500/10 text-red-400 border-red-500/20'
                    }`}>{a.ativo ? 'Ativo' : 'Inativo'}</span>
                  </div>
                </div>
                <div className="flex gap-1.5 shrink-0">
                  <ActionBtn onClick={() => abrirEditar(a)}><Pencil size={14} /></ActionBtn>
                  <ActionBtn
                    onClick={() => toggleAtivo(a)}
                    disabled={a.id === meProfile?.id}
                    className={a.id === meProfile?.id ? 'opacity-30 cursor-not-allowed' :
                      a.ativo ? 'hover:text-red-400 hover:border-red-500/40' : 'hover:text-green-400 hover:border-green-500/40'}>
                    <Power size={14} />
                  </ActionBtn>
                  {isAdminTotal && a.id !== meProfile?.id && (
                    <ActionBtn onClick={() => setConfirmar(a)} className="hover:text-red-400 hover:border-red-500/40">
                      <Trash2 size={14} />
                    </ActionBtn>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <ModalConfirmar confirmar={confirmar} excluindo={excluindo}
        onConfirm={excluir} onCancelar={() => setConfirmar(null)} />

      {modal && (
        <Modal title={editando ? 'Editar Admin' : 'Novo Admin'} onClose={fechar}>
          {senhaCriada && !editando ? (
            <SucessoSenha senha={senhaCriada} copiado={copiado} onCopy={() => copiar(senhaCriada)} onClose={fechar} />
          ) : (
            <form onSubmit={salvar} className="space-y-4">
              <Field label="Nome completo" required>
                <input type="text" value={nome} onChange={e => setNome(e.target.value)}
                  required placeholder="Ex: Carlos Lima" className={inputClass} />
              </Field>
              <Field label="Email" required>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                  required disabled={!!editando} placeholder="carlos@cobeb.com.br"
                  className={`${inputClass} ${editando ? 'opacity-50 cursor-not-allowed' : ''}`} />
              </Field>

              <div>
                <p className="block text-slate-500 text-[11px] font-semibold uppercase tracking-widest mb-2">Nível de acesso</p>
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" onClick={() => setAcessoTotal(false)}
                    className={`py-3 px-4 rounded-xl text-sm font-medium border transition-colors ${
                      !acessoTotal ? 'bg-[#EBF5FF] border-cobeb-navy text-cobeb-navy' : 'bg-[#EBF5FF] border-cobeb-border text-slate-500'
                    }`}>
                    Leitura
                  </button>
                  <button type="button" onClick={() => setAcessoTotal(true)}
                    className={`py-3 px-4 rounded-xl text-sm font-medium border transition-colors ${
                      acessoTotal ? 'bg-cobeb-navy/10 border-cobeb-navy text-cobeb-navy' : 'bg-[#EBF5FF] border-cobeb-border text-slate-500'
                    }`}>
                    Acesso Total
                  </button>
                </div>
                {acessoTotal && (
                  <p className="text-cobeb-yellow/70 text-xs mt-1.5">⚠ Acesso total permite criar e gerenciar todos os cadastros.</p>
                )}
              </div>

              {/* Módulos autorizados */}
              <div>
                <p className="block text-slate-500 text-[11px] font-semibold uppercase tracking-widest mb-2">
                  Módulos autorizados
                </p>
                {acessoTotal ? (
                  <p className="text-slate-400 text-xs bg-[#EBF5FF] border border-cobeb-border rounded-xl px-4 py-3">
                    Acesso total tem todos os módulos automaticamente.
                  </p>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    {MODULOS.map(m => {
                      const checked = modulosPermitidos.includes(m.key)
                      return (
                        <button
                          key={m.key}
                          type="button"
                          onClick={() => toggleModulo(m.key)}
                          className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-left text-xs font-medium transition-colors ${
                            checked
                              ? 'bg-cobeb-navy/10 border-cobeb-navy text-cobeb-navy'
                              : 'bg-[#EBF5FF] border-cobeb-border text-slate-500'
                          }`}
                        >
                          <span className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                            checked ? 'bg-cobeb-navy border-cobeb-navy' : 'border-cobeb-border bg-white'
                          }`}>
                            {checked && <CheckCircle size={11} className="text-white" />}
                          </span>
                          {m.label}
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* Permissão de Grade — visível só quando módulo Cadastros está marcado */}
              {!acessoTotal && modulosPermitidos.includes('cadastros') && (
                <div>
                  <p className="block text-slate-500 text-[11px] font-semibold uppercase tracking-widest mb-2">
                    Permissões dentro de Cadastros
                  </p>
                  <button
                    type="button"
                    onClick={() => setGradePermitida(v => !v)}
                    className={`flex items-center gap-2 w-full px-3 py-2.5 rounded-xl border text-left text-xs font-medium transition-colors ${
                      gradePermitida
                        ? 'bg-cobeb-navy/10 border-cobeb-navy text-cobeb-navy'
                        : 'bg-[#EBF5FF] border-cobeb-border text-slate-500'
                    }`}
                  >
                    <span className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                      gradePermitida ? 'bg-cobeb-navy border-cobeb-navy' : 'border-cobeb-border bg-white'
                    }`}>
                      {gradePermitida && <CheckCircle size={11} className="text-white" />}
                    </span>
                    Editar Grade de Horários
                  </button>
                </div>
              )}

              {!acessoTotal && (
                <Field label="Unidade" required>
                  <select value={unidadeId} onChange={e => setUnidadeId(e.target.value)} className={selectClass}>
                    {unidades.map(u => (
                      <option key={u.id} value={u.id}>{u.nome} — {u.cidade}</option>
                    ))}
                  </select>
                </Field>
              )}

              {!editando && (
                <div>
                  <p className="block text-slate-500 text-[11px] font-semibold uppercase tracking-widest mb-1.5">
                    Senha inicial <span className="text-cobeb-navy">*</span>
                  </p>
                  <div className="flex items-center gap-2 bg-[#EBF5FF] border border-cobeb-border rounded-xl px-4 py-3">
                    <code className="text-cobeb-yellow font-mono font-bold text-lg flex-1">{senha}</code>
                    <button type="button" onClick={() => copiar(senha)} className="text-slate-400 hover:text-white transition-colors">
                      {copiado ? <CheckCircle size={17} className="text-green-400" /> : <Copy size={17} />}
                    </button>
                  </div>
                  <p className="text-slate-500 text-xs mt-1">Copie a senha antes de salvar.</p>
                </div>
              )}

              {editando && (
                <div className="space-y-2">
                  <button type="button" onClick={redefinirSenha}
                    className="w-full bg-[#EBF5FF] border border-cobeb-border hover:border-cobeb-blue/40 text-slate-400 hover:text-cobeb-yellow text-sm py-3 rounded-xl transition-colors">
                    Redefinir senha
                  </button>
                  {senhaCriada && (
                    <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-3">
                      <p className="text-green-400 text-xs mb-1">Nova senha:</p>
                      <div className="flex items-center gap-2">
                        <code className="text-cobeb-yellow font-mono font-bold text-lg flex-1">{senhaCriada}</code>
                        <button type="button" onClick={() => copiar(senhaCriada)} className="text-slate-400 hover:text-white">
                          {copiado ? <CheckCircle size={16} className="text-green-400" /> : <Copy size={16} />}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {erro && <p className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-red-400 text-sm">{erro}</p>}
              <button type="submit" disabled={salvando}
                className="w-full bg-cobeb-navy hover:bg-cobeb-blue disabled:opacity-60 text-white font-semibold py-3 rounded-xl transition-colors text-sm">
                {salvando ? 'Salvando...' : editando ? 'Salvar alterações' : 'Criar admin'}
              </button>
            </form>
          )}
        </Modal>
      )}
    </div>
  )
}

function ActionBtn({ onClick, children, className = '', disabled = false }) {
  return (
    <button onClick={onClick} disabled={disabled}
      className={`w-8 h-8 rounded-lg bg-[#EBF5FF] border border-cobeb-border flex items-center justify-center text-slate-500 hover:text-cobeb-yellow hover:border-cobeb-blue/40 transition-colors ${className}`}>
      {children}
    </button>
  )
}

function SucessoSenha({ senha, copiado, onCopy, onClose }) {
  return (
    <div className="space-y-4">
      <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-4">
        <p className="text-green-400 text-xs font-semibold uppercase tracking-wider mb-3">Admin criado com sucesso!</p>
        <p className="text-slate-400 text-xs mb-2">Senha inicial — anote antes de fechar:</p>
        <div className="flex items-center gap-3 bg-[#EBF5FF] border border-cobeb-border rounded-xl px-4 py-3">
          <code className="text-cobeb-yellow font-mono font-bold text-2xl flex-1 tracking-wider">{senha}</code>
          <button onClick={onCopy} className="text-slate-400 hover:text-white transition-colors">
            {copiado ? <CheckCircle size={20} className="text-green-400" /> : <Copy size={20} />}
          </button>
        </div>
        <p className="text-slate-500 text-xs mt-2">Esta senha não será exibida novamente.</p>
      </div>
      <button onClick={onClose}
        className="w-full bg-cobeb-navy hover:bg-cobeb-blue text-white font-semibold py-3 rounded-xl transition-colors text-sm">
        Concluir
      </button>
    </div>
  )
}

function ModalConfirmar({ confirmar, excluindo, onConfirm, onCancelar }) {
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
