import { useState, useEffect } from 'react'
import { Plus, Search, Pencil, Power, Copy, CheckCircle, MapPin, Trash2 } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import Modal from '../../components/Modal'
import { Field, inputClass, selectClass, gerarSenha } from '../../lib/form'
import { MODULOS } from '../SeletorModulo'

function formatarCPF(digits) {
  const d = (digits || '').replace(/\D/g, '')
  if (d.length !== 11) return d
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`
}

function cpfDigitos(v) {
  return (v || '').replace(/\D/g, '')
}

export default function AjudantesArmazem() {
  const { profile: meProfile } = useAuth()
  const isAdminTotal = meProfile?.acesso_total === true
  const [lista,          setLista]          = useState([])
  const [confirmar,      setConfirmar]      = useState(null)
  const [excluindo,      setExcluindo]      = useState(false)
  const [unidades,       setUnidades]       = useState([])
  const [loading,        setLoading]        = useState(true)
  const [busca,          setBusca]          = useState('')
  const [modal,          setModal]          = useState(false)
  const [editando,       setEditando]       = useState(null)
  const [nome,           setNome]           = useState('')
  const [cpf,            setCpf]            = useState('')
  const [telefone,       setTelefone]       = useState('')
  const [unidadeId,      setUnidadeId]      = useState('')
  const [modulosPermitidos, setModulosPermitidos] = useState([])
  const [senha,          setSenha]          = useState('')
  const [salvando,       setSalvando]       = useState(false)
  const [erro,           setErro]           = useState('')
  const [senhaCriada,    setSenhaCriada]    = useState('')
  const [copiado,        setCopiado]        = useState(false)

  const carregar = async () => {
    setLoading(true)
    const [{ data: ajud }, { data: unids }] = await Promise.all([
      supabase.from('profiles')
        .select('id, nome, cpf, email, telefone, ativo, modulos_permitidos, unidade:unidades(id, nome, cidade)')
        .eq('perfil', 'ajudante').order('nome'),
      supabase.from('unidades').select('id, nome, cidade').eq('ativo', true).order('nome'),
    ])
    if (ajud)  setLista(ajud)
    if (unids) { setUnidades(unids); if (!unidadeId && unids.length) setUnidadeId(unids[0].id) }
    setLoading(false)
  }

  useEffect(() => { carregar() }, [])

  const abrirNovo = () => {
    setEditando(null)
    setNome(''); setCpf(''); setTelefone('')
    setUnidadeId(unidades[0]?.id || '')
    setModulosPermitidos([])
    setSenha(gerarSenha()); setErro(''); setSenhaCriada(''); setCopiado(false)
    setModal(true)
  }

  const abrirEditar = (a) => {
    setEditando(a)
    setNome(a.nome); setCpf(formatarCPF(a.cpf)); setTelefone(a.telefone || '')
    setUnidadeId(a.unidade?.id || '')
    setModulosPermitidos(a.modulos_permitidos || [])
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

  const handleCpfChange = (e) => {
    const raw = e.target.value.replace(/\D/g, '').slice(0, 11)
    let fmt = raw
    if (raw.length > 9)      fmt = `${raw.slice(0,3)}.${raw.slice(3,6)}.${raw.slice(6,9)}-${raw.slice(9)}`
    else if (raw.length > 6) fmt = `${raw.slice(0,3)}.${raw.slice(3,6)}.${raw.slice(6)}`
    else if (raw.length > 3) fmt = `${raw.slice(0,3)}.${raw.slice(3)}`
    setCpf(fmt)
  }

  const salvar = async (e) => {
    e.preventDefault()
    if (!unidadeId) { setErro('Selecione uma unidade.'); return }
    const digits = cpfDigitos(cpf)
    if (!editando && digits.length !== 11) { setErro('CPF deve ter 11 dígitos.'); return }
    setSalvando(true); setErro('')

    if (editando) {
      const { error } = await supabase.from('profiles').update({
        nome, telefone, unidade_id: unidadeId,
        modulos_permitidos: modulosPermitidos.length ? modulosPermitidos : null,
      }).eq('id', editando.id)
      if (error) setErro(error.message)
      else { await carregar(); fechar() }
    } else {
      const emailCompleto = `${digits}@cobeb.com.br`
      const { data: userId, error: authErr } = await supabase.rpc('criar_usuario_auth', {
        p_email: emailCompleto, p_senha: senha, p_nome: nome,
      })
      if (authErr) { setErro(authErr.message); setSalvando(false); return }

      const { error: profileErr } = await supabase.from('profiles').insert({
        id: userId, nome, email: emailCompleto, telefone, cpf: digits,
        perfil: 'ajudante', unidade_id: unidadeId, primeiro_acesso: true,
        modulos_permitidos: modulosPermitidos.length ? modulosPermitidos : null,
      })
      if (profileErr) { setErro(profileErr.message); setSalvando(false); return }

      setSenhaCriada(senha); await carregar()
    }
    setSalvando(false)
  }

  const toggleAtivo = async (a) => {
    const novoAtivo = !a.ativo
    await supabase.from('profiles').update({ ativo: novoAtivo }).eq('id', a.id)
    await supabase.rpc('ativar_usuario', { p_user_id: a.id, p_ativo: novoAtivo })
    setLista(prev => prev.map(r => r.id === a.id ? { ...r, ativo: novoAtivo } : r))
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
    if (error) { alert('Erro ao excluir: ' + error.message); setExcluindo(false); return }
    setConfirmar(null); setExcluindo(false); await carregar()
  }

  const filtrados = lista.filter(a =>
    a.nome.toLowerCase().includes(busca.toLowerCase()) ||
    cpfDigitos(a.cpf || '').includes(cpfDigitos(busca))
  )

  return (
    <div className="px-5 py-4">
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-cobeb-text font-semibold text-sm">{lista.length} ajudante{lista.length !== 1 ? 's' : ''}</p>
          <p className="text-slate-500 text-xs">{lista.filter(a => a.ativo).length} ativo{lista.filter(a => a.ativo).length !== 1 ? 's' : ''}</p>
        </div>
        <button onClick={abrirNovo}
          className="flex items-center gap-1.5 bg-cobeb-navy hover:bg-cobeb-blue text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors">
          <Plus size={15} /> Novo
        </button>
      </div>

      <div className="relative mb-4">
        <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
        <input type="text" placeholder="Buscar por nome ou CPF..."
          value={busca} onChange={e => setBusca(e.target.value)}
          className="w-full bg-[#EBF5FF] border border-cobeb-border rounded-xl pl-9 pr-4 py-3 text-cobeb-text text-sm placeholder-blue-200 focus:outline-none focus:border-cobeb-blue transition-all" />
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-6 h-6 border-2 border-cobeb-navy border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filtrados.length === 0 ? (
        <p className="text-center text-slate-500 text-sm py-12">Nenhum ajudante encontrado</p>
      ) : (
        <div className="space-y-3">
          {filtrados.map(a => (
            <div key={a.id} className="bg-gray-50 rounded-xl p-4 border border-cobeb-border">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-cobeb-text font-semibold text-sm truncate">{a.nome}</p>
                  <p className="text-slate-500 text-xs mt-0.5 font-mono">{a.cpf ? formatarCPF(a.cpf) : '—'}</p>
                  {a.telefone && <p className="text-slate-500 text-xs mt-0.5">{a.telefone}</p>}
                  <div className="flex items-center gap-1 mt-1.5">
                    <MapPin size={11} className="text-cobeb-yellow shrink-0" />
                    <p className="text-slate-500 text-xs">{a.unidade?.nome} — {a.unidade?.cidade}</p>
                  </div>
                  <div className="mt-1.5">
                    <StatusBadge ativo={a.ativo} />
                  </div>
                </div>
                <div className="flex gap-1.5 shrink-0">
                  <ActionBtn onClick={() => abrirEditar(a)}><Pencil size={14} /></ActionBtn>
                  <ActionBtn onClick={() => toggleAtivo(a)}
                    className={a.ativo ? 'hover:text-red-400 hover:border-red-500/40' : 'hover:text-green-400 hover:border-green-500/40'}>
                    <Power size={14} />
                  </ActionBtn>
                  {isAdminTotal && (
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
        <Modal title={editando ? 'Editar Ajudante' : 'Novo Ajudante'} onClose={fechar}>
          {senhaCriada && !editando ? (
            <SucessoSenha cpf={cpf} senha={senhaCriada} copiado={copiado} onCopy={() => copiar(senhaCriada)} onClose={fechar} />
          ) : (
            <form onSubmit={salvar} className="space-y-4">
              <Field label="Nome completo" required>
                <input type="text" value={nome} onChange={e => setNome(e.target.value)}
                  required placeholder="Ex: Pedro Alves" className={inputClass} />
              </Field>

              <Field label="CPF" required>
                <input
                  type="text"
                  value={cpf}
                  onChange={handleCpfChange}
                  required
                  disabled={!!editando}
                  placeholder="000.000.000-00"
                  inputMode="numeric"
                  className={`${inputClass} font-mono ${editando ? 'opacity-50 cursor-not-allowed' : ''}`}
                />
              </Field>

              <Field label="Telefone">
                <input type="tel" value={telefone} onChange={e => setTelefone(e.target.value)}
                  placeholder="(31) 99999-9999" className={inputClass} />
              </Field>

              <Field label="Unidade" required>
                <select value={unidadeId} onChange={e => setUnidadeId(e.target.value)} required className={selectClass}>
                  <option value="">— Selecionar —</option>
                  {unidades.map(u => (
                    <option key={u.id} value={u.id}>{u.nome} — {u.cidade}</option>
                  ))}
                </select>
              </Field>

              <div>
                <p className="block text-slate-500 text-[11px] font-semibold uppercase tracking-widest mb-2">
                  Módulos autorizados
                </p>
                <p className="text-slate-400 text-xs mb-2">
                  Selecione os módulos que este ajudante poderá acessar.
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
                {salvando ? 'Salvando...' : editando ? 'Salvar alterações' : 'Criar ajudante'}
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

function SucessoSenha({ cpf, senha, copiado, onCopy, onClose }) {
  return (
    <div className="space-y-4">
      <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-4">
        <p className="text-green-400 text-xs font-semibold uppercase tracking-wider mb-3">Ajudante criado com sucesso!</p>
        <p className="text-slate-500 text-xs mb-1">CPF (login):</p>
        <p className="text-cobeb-text font-mono font-semibold text-sm mb-3">{cpf}</p>
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
