import { useState, useEffect } from 'react'
import { Plus, Search, Pencil, Power, Building2, MapPin, Navigation } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import Modal from '../../components/Modal'
import { Field, inputClass, selectClass } from '../../lib/form'

const FILTROS = [
  { id: 'todas',    label: 'Todas'    },
  { id: 'revenda',  label: 'Revendas' },
  { id: 'fabrica',  label: 'Fábricas' },
]

function tipoBadge(tipo) {
  return tipo === 'revenda'
    ? 'bg-cobeb-navy/10 text-cobeb-navy border-cobeb-navy/20'
    : 'bg-amber-500/10 text-amber-600 border-amber-500/20'
}

function tipoLabel(tipo) {
  return tipo === 'revenda' ? 'Revenda' : 'Fábrica'
}

export default function Unidades() {
  const { profile: meProfile } = useAuth()
  const isAdminTotal = meProfile?.acesso_total === true

  const [lista,    setLista]    = useState([])
  const [loading,  setLoading]  = useState(true)
  const [busca,    setBusca]    = useState('')
  const [filtro,   setFiltro]   = useState('todas')
  const [modal,    setModal]    = useState(false)
  const [editando, setEditando] = useState(null)

  // campos do formulário
  const [nome,         setNome]         = useState('')
  const [tipo,         setTipo]         = useState('revenda')
  const [cidade,       setCidade]       = useState('')
  const [endereco,     setEndereco]     = useState('')
  const [latitude,     setLatitude]     = useState('')
  const [longitude,    setLongitude]    = useState('')
  const [raioGeofence, setRaioGeofence] = useState('100')
  const [codigoAmbev,  setCodigoAmbev]  = useState('')
  const [salvando,     setSalvando]     = useState(false)
  const [erro,         setErro]         = useState('')
  const [capturando,   setCapturando]   = useState(false)

  useEffect(() => { carregar() }, [])

  async function carregar() {
    setLoading(true)
    const { data } = await supabase
      .from('unidades')
      .select('id, nome, codigo, cidade, tipo, endereco, latitude, longitude, raio_geofence, ativo, codigo_ambev')
      .order('tipo')
      .order('nome')
    setLista(data ?? [])
    setLoading(false)
  }

  function abrirNovo() {
    setEditando(null)
    setNome(''); setTipo('revenda'); setCidade(''); setEndereco(''); setLatitude(''); setLongitude('')
    setRaioGeofence('100'); setCodigoAmbev(''); setErro('')
    setModal(true)
  }

  function abrirEditar(u) {
    setEditando(u)
    setNome(u.nome); setTipo(u.tipo); setCidade(u.cidade ?? ''); setEndereco(u.endereco ?? '')
    setLatitude(u.latitude != null ? String(u.latitude) : '')
    setLongitude(u.longitude != null ? String(u.longitude) : '')
    setRaioGeofence(String(u.raio_geofence ?? 100))
    setCodigoAmbev(u.codigo_ambev ?? '')
    setErro('')
    setModal(true)
  }

  function fechar() { setModal(false); setEditando(null) }

  function capturarGPS() {
    if (!navigator.geolocation) { setErro('GPS não disponível neste dispositivo.'); return }
    setCapturando(true)
    navigator.geolocation.getCurrentPosition(
      pos => {
        setLatitude(pos.coords.latitude.toFixed(7))
        setLongitude(pos.coords.longitude.toFixed(7))
        setCapturando(false)
      },
      () => { setErro('Não foi possível obter a localização. Verifique as permissões.'); setCapturando(false) },
      { enableHighAccuracy: true, timeout: 10000 }
    )
  }

  async function salvar(e) {
    e.preventDefault()
    setSalvando(true); setErro('')

    const payload = {
      nome:          nome.trim(),
      tipo,
      cidade:        cidade.trim(),
      endereco:      endereco.trim() || null,
      latitude:      latitude  !== '' ? parseFloat(latitude)  : null,
      longitude:     longitude !== '' ? parseFloat(longitude) : null,
      raio_geofence: parseInt(raioGeofence) || 100,
      codigo_ambev:  codigoAmbev.trim() || null,
    }

    if (editando) {
      const { error } = await supabase.from('unidades').update(payload).eq('id', editando.id)
      if (error) { setErro(error.message); setSalvando(false); return }
    } else {
      // Gera código único baseado no tipo + nome
      const base   = nome.trim().toUpperCase().replace(/[^A-Z0-9]/g, '_').slice(0, 15)
      const prefix = tipo === 'revenda' ? 'REV_' : 'FAB_'
      payload.codigo = prefix + base

      const { error } = await supabase.from('unidades').insert(payload)
      if (error) { setErro(error.message); setSalvando(false); return }
    }

    await carregar()
    fechar()
    setSalvando(false)
  }

  async function toggleAtivo(u) {
    await supabase.from('unidades').update({ ativo: !u.ativo }).eq('id', u.id)
    setLista(prev => prev.map(r => r.id === u.id ? { ...r, ativo: !u.ativo } : r))
  }

  const filtrados = lista.filter(u => {
    const matchFiltro = filtro === 'todas' || u.tipo === filtro
    const matchBusca  = !busca.trim() ||
      u.nome.toLowerCase().includes(busca.toLowerCase()) ||
      (u.cidade ?? '').toLowerCase().includes(busca.toLowerCase()) ||
      (u.codigo_ambev ?? '').includes(busca)
    return matchFiltro && matchBusca
  })

  return (
    <div className="px-5 py-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-cobeb-text font-semibold text-sm">{lista.length} unidade{lista.length !== 1 ? 's' : ''}</p>
          <p className="text-slate-500 text-xs">
            {lista.filter(u => u.tipo === 'revenda').length} revendas · {lista.filter(u => u.tipo === 'fabrica').length} fábricas
          </p>
        </div>
        {isAdminTotal && (
          <button onClick={abrirNovo}
            className="flex items-center gap-1.5 bg-cobeb-navy hover:bg-cobeb-blue text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors">
            <Plus size={15} /> Nova
          </button>
        )}
      </div>

      {/* Filtro por tipo */}
      <div className="flex gap-2 mb-3 overflow-x-auto pb-0.5">
        {FILTROS.map(f => (
          <button key={f.id} onClick={() => setFiltro(f.id)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors border ${
              filtro === f.id
                ? 'bg-cobeb-navy text-white border-cobeb-navy'
                : 'bg-[#EBF5FF] text-slate-500 border-cobeb-border hover:border-cobeb-blue/40'
            }`}>
            {f.label}
          </button>
        ))}
      </div>

      {/* Busca */}
      <div className="relative mb-4">
        <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
        <input type="text" placeholder="Buscar por nome, cidade ou código..."
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
          <Building2 size={28} className="text-cobeb-border mx-auto mb-3" />
          <p className="text-slate-500 text-sm">Nenhuma unidade encontrada</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtrados.map(u => (
            <CardUnidade key={u.id} u={u}
              onEdit={isAdminTotal ? () => abrirEditar(u) : null}
              onToggle={isAdminTotal ? () => toggleAtivo(u) : null}
            />
          ))}
        </div>
      )}

      {/* Modal */}
      {modal && (
        <Modal title={editando ? 'Editar Unidade' : 'Nova Unidade'} onClose={fechar}>
          <form onSubmit={salvar} className="space-y-4">

            <Field label="Nome" required>
              <input type="text" value={nome} onChange={e => setNome(e.target.value)}
                required placeholder="Ex: COBEB MATRIZ" className={inputClass} />
            </Field>

            <Field label="Tipo" required>
              <select value={tipo} onChange={e => setTipo(e.target.value)} className={selectClass}
                disabled={!!editando}>
                <option value="revenda">Revenda</option>
                <option value="fabrica">Fábrica</option>
              </select>
              {editando && <p className="text-slate-400 text-xs mt-1">O tipo não pode ser alterado após criação.</p>}
            </Field>

            <Field label="Cidade" required>
              <input type="text" value={cidade} onChange={e => setCidade(e.target.value)}
                required placeholder="Ex: PARÁ DE MINAS" className={inputClass} />
            </Field>

            <Field label="Endereço">
              <input type="text" value={endereco} onChange={e => setEndereco(e.target.value)}
                placeholder="Ex: Rua das Flores, 100 — Pará de Minas/MG" className={inputClass} />
            </Field>

            <div>
              <label className="block text-slate-500 text-[11px] font-semibold uppercase tracking-widest mb-1.5">
                Localização (GPS)
              </label>
              <button type="button" onClick={capturarGPS} disabled={capturando}
                className="w-full flex items-center justify-center gap-2 bg-[#EBF5FF] border border-cobeb-border hover:border-cobeb-blue/40 text-cobeb-navy text-sm font-semibold py-2.5 rounded-xl transition-colors disabled:opacity-50 mb-2">
                <Navigation size={14} className={capturando ? 'animate-pulse' : ''} />
                {capturando ? 'Obtendo localização...' : 'Capturar localização atual (GPS)'}
              </button>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-slate-400 text-[10px] uppercase tracking-wider mb-1">Latitude</label>
                  <input type="number" step="any" value={latitude} onChange={e => setLatitude(e.target.value)}
                    placeholder="-19.8641200" className={inputClass} />
                </div>
                <div>
                  <label className="block text-slate-400 text-[10px] uppercase tracking-wider mb-1">Longitude</label>
                  <input type="number" step="any" value={longitude} onChange={e => setLongitude(e.target.value)}
                    placeholder="-44.6069800" className={inputClass} />
                </div>
              </div>
            </div>

            <Field label="Raio de Geofence (metros)">
              <input type="number" min="50" max="5000" value={raioGeofence}
                onChange={e => setRaioGeofence(e.target.value)}
                className={inputClass} />
              <p className="text-slate-400 text-xs mt-1">Padrão: 100m. Usado futuramente para rastreamento automático.</p>
            </Field>

            <Field label={tipo === 'revenda' ? 'Código Ambev (Revenda)' : 'Código Ambev (Fábrica)'}>
              <input type="text" value={codigoAmbev} onChange={e => setCodigoAmbev(e.target.value)}
                placeholder={tipo === 'revenda' ? 'Ex: 77200' : 'Ex: 140'}
                className={inputClass} />
              <p className="text-slate-400 text-xs mt-1">Código numérico da BASE Ambev. Usado para vincular pedidos importados.</p>
            </Field>

            {erro && (
              <p className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-red-400 text-sm">{erro}</p>
            )}

            <button type="submit" disabled={salvando}
              className="w-full bg-cobeb-navy hover:bg-cobeb-blue disabled:opacity-60 text-white font-semibold py-3 rounded-xl transition-colors text-sm">
              {salvando ? 'Salvando...' : editando ? 'Salvar alterações' : 'Cadastrar unidade'}
            </button>
          </form>
        </Modal>
      )}
    </div>
  )
}

function CardUnidade({ u, onEdit, onToggle }) {
  const temCoords = u.latitude != null && u.longitude != null

  return (
    <div className={`rounded-xl p-4 border transition-colors ${
      u.ativo ? 'bg-gray-50 border-cobeb-border' : 'bg-white border-cobeb-border opacity-60'
    }`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <p className="text-cobeb-text font-semibold text-sm">{u.nome}</p>
            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${tipoBadge(u.tipo)}`}>
              {tipoLabel(u.tipo)}
            </span>
            <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${
              u.ativo
                ? 'bg-green-500/10 text-green-400 border-green-500/20'
                : 'bg-red-500/10 text-red-400 border-red-500/20'
            }`}>{u.ativo ? 'Ativa' : 'Inativa'}</span>
          </div>

          {u.cidade && <p className="text-slate-500 text-xs">{u.cidade}</p>}
          {u.endereco && <p className="text-slate-400 text-xs mt-0.5 truncate">{u.endereco}</p>}

          <div className="flex items-center gap-3 mt-2 flex-wrap">
            {temCoords ? (
              <span className="flex items-center gap-1 text-[10px] text-cobeb-navy font-medium">
                <MapPin size={10} />
                {parseFloat(u.latitude).toFixed(5)}, {parseFloat(u.longitude).toFixed(5)}
              </span>
            ) : (
              <span className="text-[10px] text-slate-400">Sem coordenadas</span>
            )}
            <span className="text-[10px] text-slate-400">Raio: {u.raio_geofence}m</span>
            {u.codigo_ambev && (
              <span className="text-[10px] font-mono text-slate-400">Ambev: {u.codigo_ambev}</span>
            )}
          </div>
        </div>

        {(onEdit || onToggle) && (
          <div className="flex gap-1.5 shrink-0">
            {onEdit && (
              <ActionBtn onClick={onEdit} title="Editar"><Pencil size={14} /></ActionBtn>
            )}
            {onToggle && (
              <ActionBtn onClick={onToggle} title={u.ativo ? 'Inativar' : 'Ativar'}
                className={u.ativo ? 'hover:text-red-400 hover:border-red-500/40' : 'hover:text-green-400 hover:border-green-500/40'}>
                <Power size={14} />
              </ActionBtn>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function ActionBtn({ onClick, children, title, className = '' }) {
  return (
    <button onClick={onClick} title={title}
      className={`w-8 h-8 rounded-lg bg-[#EBF5FF] border border-cobeb-border flex items-center justify-center text-slate-500 hover:text-cobeb-yellow hover:border-cobeb-blue/40 transition-colors ${className}`}>
      {children}
    </button>
  )
}
