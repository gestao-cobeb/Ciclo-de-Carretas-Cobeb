import { useState, useEffect } from 'react'
import { Plus, Search, Pencil, Power, Copy, CheckCircle, MapPin, Trash2 } from 'lucide-react'
import { supabase } from '../../lib/supabase'

import { useAuth } from '../../contexts/AuthContext'
import Modal from '../../components/Modal'
import { Field, inputClass, selectClass, gerarSenha } from '../../lib/form'
import { MODULOS } from '../SeletorModulo'

export default function Conferentes() {
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
  const [emailUser, setEmailUser] = useState('')
  const [telefone, setTelefone] = useState('')
  const [unidadeId, setUnidadeId] = useState('')
  const [senha, setSenha] = useState('')
  const [modulosPermitidos, setModulosPermitidos] = useState([])
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')
  const [senhaCriada, setSenhaCriada] = useState('')
  const [copiado, setCopiado] = useState(false)

  const carregar = async () => {
    setLoading(true)
    const [{ data: conf }, { data: unids }] = await Promise.all([
      supabase.from('profiles')
        .select('id, nome, email, telefone, ativo, modulos_permitidos, unidade:unidades(id, nome, cidade)')
        .eq('perfil', 'conferente').order('nome'),
      supabase.from('unidades').select('id, nome, cidade').eq('ativo', true).order('nome'),
    ])
    if (conf) setLista(conf)
    if (unids) { setUnidades(unids); if (!unidadeId && unids.length) setUnidadeId(unids[0].id) }
    setLoading(false)
  }

  useEffect(() => { carregar() }, [])

  const abrirNovo = () => {
    setEditando(null)
    setNome(''); setEmailUser(''); setTelefone('')
    setUnidadeId(unidades[0]?.id || '')
    setModulosPermitidos([])
    setSenha(gerarSenha()); setErro(''); setSenhaCriada(''); setCopiado(false)
    setModal(true)
  }

  const abrirEditar = (c) => {
    setEditando(c)
    setNome(c.nome); setEmailUser(c.email?.split('@')[0] || ''); setTelefone(c.telefone || '')
    setUnidadeId(c.unidade?.id || '')
    setModulosPermitidos(c.modulos_permitidos || [])
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
    if (!unidadeId) { setErro('Selecione uma unidade.'); return }
    const emailCompleto = `${emailUser.toLowerCase().trim()}@cobeb.com.br`
    setSalvando(true); setErro('')

    if (editando) {
      const { error } = await supabase.from('profiles')
        .update({ nome, telefone, unidade_id: unidadeId, modulos_permitidos: modulosPermitidos.length ? modulosPermitidos : null }).eq('id', editando.id)
      if (error) setErro(error.message)
      else { await carregar(); fechar() }
    } else {
      if (!emailUser.trim()) { setErro('Informe o nome de acesso.'); setSalvando(false); return }
      const { data: userId, error: authErr } = await supabase.rpc('criar_usuario_auth', {
        p_email: emailCompleto, p_senha: senha, p_nome: nome,
      })
      if (authErr) { setErro(authErr.message); setSalvando(false); return }

      const { error: profileErr } = await supabase.from('profiles').insert({
        id: userId, nome, email: emailCompleto, telefone,
        perfil: 'conferente', unidade_id: unidadeId, primeiro_acesso: true,
        modulos_permitidos: modulosPermitidos.length ? modulosPermitidos : null,
      })
      if (profileErr) { setErro(profileErr.message); setSalvando(false); return }

      setSenhaCriada(senha); await carregar()
    }
    setSalvando(false)
  }

  const toggleAtivo = async (c) => {
    const novoAtivo = !c.ativo
    await supabase.from('profiles').update({ ativo: novoAtivo }).eq('id', c.id)
    await supabase.rpc('ativar_usuario', { p_user_id: c.id, p_ativo: novoAtivo })
    setLista(prev => prev.map(r => r.id === c.id ? { ...r, ativo: novoAtivo } : r))
  }

  const redefinirSenha = async () => {
    const nova = gerarSenha()
    const { error } = await supabase.rpc('redefinir_senha_usuario', { p_user_id: editando.id, p_nova_senha: nova })
    if (error) { setErro('Erro ao redefinir senha: ' + error.message); return }
    setSenhaCriada(nova); setCopiado(false)
  }

  const excluir = async (item) => {
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

  const filtrados = lista.filter(c =>
    c.nome.toLowerCase().includes(busca.toLowerCase()) ||
    c.email.toLowerCase().includes(busca.toLowerCase())
  )

  return (
    <div className="px-5 py-4">
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-cobeb-text font-semibold text-sm">{lista.length} conferente{lista.length !== 1 ? 's' : ''}</p>
          <p className="text-slate-500 text-xs">{lista.filter(c => c.ativo).length} ativo{lista.filter(c => c.ativo).length !== 1 ? 's' : ''}</p>
        </div>
        <button onClick={abrirNovo}
          className="flex items-center gap-1.5 bg-cobeb-navy hover:bg-cobeb-blue text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors">
          <Plus size={15} /> Novo
        </button>
      </div>

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
        <p className="text-center text-slate-500 text-sm py-12">Nenhum conferente encontrado</p>
      ) : (
        <div className="space-y-3">
          {filtrados.map(c => (
            <div key={c.id} className="bg-gray-50 rounded-xl p-4 border border-cobeb-border">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-cobeb-text font-semibold text-sm truncate">{c.nome}</p>
                  <p className="text-slate-500 text-xs mt-0.5 truncate">{c.email}</p>
                  {c.telefone && <p className="text-slate-500 text-xs mt-0.5">{c.telefone}</p>}
                  <div className="flex items-center gap-1 mt-1.5">
                    <MapPin size={11} className="text-cobeb-yellow shrink-0" />
                    <p className="text-slate-500 text-xs">{c.unidade?.nome} — {c.unidade?.cidade}</p>
                  </div>
                  <div className="mt-1.5">
                    <StatusBadge ativo={c.ativo} />
                  </div>
                </div>
                <div className="flex gap-1.5 shrink-0">
                  <ActionBtn onClick={() => abrirEditar(c)}><Pencil size={14} /></ActionBtn>
                  <ActionBtn onClick={() => toggleAtivo(c)}
                    className={c.ativo ? 'hover:text-red-400 hover:border-red-500/40' : 'hover:text-green-400 hover:border-green-500/40'}>
                    <Power size={14} />
                  </ActionBtn>
                  {isAdminTotal && (
                    <ActionBtn onClick={() => setConfirmar(c)} className="hover:text-red-400 hover:border-red-500/40">
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
        <Modal title={editando ? 'Editar Conferente' : 'Novo Conferente'} onClose={fechar}>
          {senhaCriada && !editando ? (
            <SucessoSenha email={`${emailUser.toLowerCase().trim()}@cobeb.com.br`} senha={senhaCriada} copiado={copiado} onCopy={() => copiar(senhaCriada)} onClose={fechar} />
          ) : (
            <form onSubmit={salvar} className="space-y-4">
              <Field label="Nome completo" required>
                <input type="text" value={nome} onChange={e => setNome(e.target.value)}
                  required placeholder="Ex: Maria Souza" className={inputClass} />
              </Field>
              <Field label="Acesso (email @cobeb.com.br)" required>
                <div className={`flex items-center bg-[#F5F9FF] border border-cobeb-border rounded-xl overflow-hidden focus-within:border-cobeb-blue focus-within:ring-1 focus-within:ring-cobeb-blue/20 transition-all ${editando ? 'opacity-50' : ''}`}>
                  <input
                    type="text"
                    value={emailUser}
                    onChange={e => setEmailUser(e.target.value.toLowerCase().replace(/@.*$/, '').replace(/\s/g, ''))}
                    required
                    disabled={!!editando}
                    placeholder="nome.sobrenome"
                    className="flex-1 bg-transparent px-4 py-3 text-cobeb-text text-sm placeholder-blue-200 outline-none disabled:cursor-not-allowed"
                  />
                  <span className="pr-4 text-slate-400 text-sm select-none whitespace-nowrap">@cobeb.com.br</span>
                </div>
              </Field>
              <Field label="Telefone">
                <input type="tel" value={telefone} onChange={e => setTelefone(e.target.value)}
                  placeholder="(31) 99999-9999" className={inputClass} />
              </Field>
              <Field label="Unidade" required>
                <select value={unidadeId} onChange={e => setUnidadeId(e.target.value)} className={selectClass}>
                  {unidades.map(u => (
                    <option key={u.id} value={u.id}>{u.nome} — {u.cidade}</option>
                  ))}
                </select>
              </Field>
              <div>
                <p className="block text-slate-500 text-[11px] font-semibold uppercase tracking-widest mb-2">
                  Módulos adicionais
                </p>
                <p className="text-slate-400 text-xs mb-2">
                  Sem seleção o conferente abre direto em Conferência. Com módulos, vê o seletor ao entrar.
                </p>
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
              </div>
              {!editando && <SenhaDisplay senha={senha} copiado={copiado} onCopy={() => copiar(senha)} />}
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
                {salvando ? 'Salvando...' : editando ? 'Salvar alterações' : 'Criar conferente'}
              </button>
            </form>
          )}
        </Modal>
      )}
    </div>
  )
}

function StatusBadge({ ativo }) {
  return (
    <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium border ${
      ativo ? 'bg-green-500/10 text-green-400 border-green-500/20' : 'bg-red-500/10 text-red-400 border-red-500/20'
    }`}>{ativo ? 'Ativo' : 'Inativo'}</span>
  )
}

function ActionBtn({ onClick, children, className = '' }) {
  return (
    <button onClick={onClick}
      className={`w-8 h-8 rounded-lg bg-[#EBF5FF] border border-cobeb-border flex items-center justify-center text-slate-500 hover:text-cobeb-yellow hover:border-cobeb-blue/40 transition-colors ${className}`}>
      {children}
    </button>
  )
}

function SenhaDisplay({ senha, copiado, onCopy }) {
  return (
    <div>
      <p className="block text-slate-500 text-[11px] font-semibold uppercase tracking-widest mb-1.5">
        Senha inicial <span className="text-cobeb-navy">*</span>
      </p>
      <div className="flex items-center gap-2 bg-[#EBF5FF] border border-cobeb-border rounded-xl px-4 py-3">
        <code className="text-cobeb-yellow font-mono font-bold text-lg flex-1">{senha}</code>
        <button type="button" onClick={onCopy} className="text-slate-400 hover:text-white transition-colors">
          {copiado ? <CheckCircle size={17} className="text-green-400" /> : <Copy size={17} />}
        </button>
      </div>
      <p className="text-slate-500 text-xs mt-1">Copie a senha antes de salvar.</p>
    </div>
  )
}

function SucessoSenha({ email, senha, copiado, onCopy, onClose }) {
  return (
    <div className="space-y-4">
      <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-4">
        <p className="text-green-400 text-xs font-semibold uppercase tracking-wider mb-3">Criado com sucesso!</p>
        <p className="text-slate-500 text-xs mb-1">Login do conferente:</p>
        <p className="text-cobeb-text font-mono font-semibold text-sm mb-3 break-all">{email}</p>
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
