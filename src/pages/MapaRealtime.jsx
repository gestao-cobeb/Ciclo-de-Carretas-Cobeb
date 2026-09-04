import { useState, useEffect, useMemo, Fragment } from 'react'
import { MapContainer, TileLayer, Marker, Popup, Circle, Polyline, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { ChevronLeft, ChevronDown, ChevronUp, Truck, AlertTriangle, Navigation, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

const ORS_KEY = import.meta.env.VITE_ORS_API_KEY ?? null

// ── Configuração de status (espelha EstoqueRealtime) ─────────────────────────

const STATUS_LABEL = {
  iniciada:               'Aguardando Saída',
  em_transito:            'Em Rota p/ Fábrica',
  na_fabrica:             'Na Fábrica',
  retornando:             'Retornando',
  aguardando_conferencia: 'Chegou',
}

const STATUS_COR = {
  iniciada:               'bg-slate-100 text-slate-500 border-slate-200',
  em_transito:            'bg-blue-50 text-blue-500 border-blue-200',
  na_fabrica:             'bg-blue-50 text-blue-600 border-blue-200',
  retornando:             'bg-yellow-50 text-yellow-600 border-yellow-200',
  aguardando_conferencia: 'bg-green-50 text-green-600 border-green-200',
}

// ── Ícones personalizados via DivIcon ────────────────────────────────────────

function criarIcone(tipo) {
  const cor   = tipo === 'revenda' ? '#003DA5' : '#F97316'
  const letra = tipo === 'revenda' ? 'R' : 'F'
  return L.divIcon({
    html: `<div style="
      width:36px;height:36px;
      background:${cor};
      border:3px solid white;
      border-radius:50%;
      box-shadow:0 2px 10px rgba(0,0,0,0.35);
      display:flex;align-items:center;justify-content:center;
      color:white;font-weight:900;font-size:15px;font-family:system-ui,sans-serif;
    ">${letra}</div>`,
    className: '',
    iconSize:    [36, 36],
    iconAnchor:  [18, 18],
    popupAnchor: [0, -22],
  })
}

// ── Ícone de caminhão ─────────────────────────────────────────────────────────

function criarIconeCaminhao(status) {
  const urgente = status === 'retornando'
  const cor     = urgente ? '#F97316' : '#FFB81C'
  return L.divIcon({
    html: `<div style="
      width:40px;height:40px;
      background:${cor};
      border:3px solid white;
      border-radius:12px;
      box-shadow:0 3px 12px rgba(0,0,0,0.4);
      display:flex;align-items:center;justify-content:center;
      font-size:20px;
    ">🚛</div>`,
    className:   '',
    iconSize:    [40, 40],
    iconAnchor:  [20, 20],
    popupAnchor: [0, -24],
  })
}

// ── Busca rota no OpenRouteService ────────────────────────────────────────────

async function buscarRota(fromLat, fromLng, toLat, toLng) {
  if (!ORS_KEY) return null
  try {
    const resp = await fetch(
      `https://api.openrouteservice.org/v2/directions/driving-hgv?api_key=${ORS_KEY}&start=${fromLng},${fromLat}&end=${toLng},${toLat}`,
      { headers: { Accept: 'application/geo+json' } }
    )
    const data = await resp.json()
    const coords = data?.features?.[0]?.geometry?.coordinates
    if (!coords) return null
    return coords.map(([lng, lat]) => [lat, lng]) // ORS retorna [lng, lat]
  } catch {
    return null
  }
}

// ── Ajusta o mapa para mostrar todos os marcadores ───────────────────────────

function FitBounds({ positions }) {
  const map = useMap()
  useEffect(() => {
    if (positions.length > 1) {
      const bounds = L.latLngBounds(positions)
      map.fitBounds(bounds, { padding: [60, 60] })
    } else if (positions.length === 1) {
      map.setView(positions[0], 12)
    }
  }, [positions.length]) // eslint-disable-line react-hooks/exhaustive-deps
  return null
}

// ── Componente principal ──────────────────────────────────────────────────────

export default function MapaRealtime({ onVoltar }) {
  const { profile } = useAuth()
  const isAdminTotal = profile?.acesso_total === true

  const [unidades,        setUnidades]        = useState([])
  const [viagens,         setViagens]         = useState([])
  const [loading,         setLoading]         = useState(true)
  const [painelAberto,    setPainelAberto]    = useState(false)
  const [viagemSelecionada, setViagemSelecionada] = useState(null)
  const [buscandoRota,    setBuscandoRota]    = useState(false)

  useEffect(() => {
    carregar()
    const timer = setInterval(carregarViagens, 30000)
    return () => clearInterval(timer)
  }, [])

  function filtrarPorUnidade(lista) {
    if (isAdminTotal || profile?.todas_unidades === true) return lista ?? []
    return (lista ?? []).filter(v => v.unidade_descarga_id === profile?.unidade_id)
  }

  async function carregar() {
    const [{ data: u }, { data: v }] = await Promise.all([
      supabase
        .from('unidades')
        .select('id, nome, tipo, endereco, latitude, longitude, raio_geofence, ativo')
        .eq('ativo', true)
        .not('latitude', 'is', null),
      supabase.rpc('get_painel_viagens'),
    ])
    setUnidades(u ?? [])
    setViagens(filtrarPorUnidade(v))
    setLoading(false)
  }

  async function carregarViagens() {
    const { data } = await supabase.rpc('get_painel_viagens')
    if (data) setViagens(filtrarPorUnidade(data))
  }

  // Abre/fecha rota ao clicar no marcador de caminhão
  async function selecionarViagem(viagem) {
    if (viagemSelecionada?.id === viagem.id) {
      setViagemSelecionada(null)
      return
    }
    setViagemSelecionada({ id: viagem.id, rota: null })
    if (viagem.motorista_lat && viagem.fab_lat && ORS_KEY) {
      setBuscandoRota(true)
      const pontos = await buscarRota(
        parseFloat(viagem.motorista_lat), parseFloat(viagem.motorista_lng),
        parseFloat(viagem.fab_lat),       parseFloat(viagem.fab_lng)
      )
      setViagemSelecionada({ id: viagem.id, rota: pontos })
      setBuscandoRota(false)
    }
  }

  const { centro, posicoes } = useMemo(() => {
    const pts = [
      ...unidades.map(u => [parseFloat(u.latitude), parseFloat(u.longitude)]),
      ...viagens
        .filter(v => v.motorista_lat && v.motorista_lng)
        .map(v => [parseFloat(v.motorista_lat), parseFloat(v.motorista_lng)]),
    ]
    if (!pts.length) return { centro: [-19.88, -44.61], posicoes: [] }
    const lat = pts.reduce((s, p) => s + p[0], 0) / pts.length
    const lng = pts.reduce((s, p) => s + p[1], 0) / pts.length
    return { centro: [lat, lng], posicoes: pts }
  }, [unidades, viagens])

  const urgentes = viagens.filter(v => v.status === 'retornando').length

  return (
    <div className="absolute inset-0 overflow-hidden">

      {/* Spinner de carregamento inicial */}
      {loading && (
        <div className="absolute inset-0 bg-[#EBF5FF] flex flex-col items-center justify-center z-[1000] gap-3">
          <div className="w-8 h-8 border-2 border-cobeb-navy border-t-transparent rounded-full animate-spin" />
          <p className="text-slate-500 text-sm">Carregando mapa...</p>
        </div>
      )}

      {/* Mapa Leaflet */}
      <MapContainer
        center={centro}
        zoom={9}
        style={{ width: '100%', height: '100%' }}
        zoomControl={false}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {posicoes.length > 0 && <FitBounds positions={posicoes} />}

        {/* ── Rota do caminhão selecionado ──────────────────────────────── */}
        {viagemSelecionada?.rota && (
          <Polyline
            positions={viagemSelecionada.rota}
            pathOptions={{ color: '#F97316', weight: 5, opacity: 0.85, dashArray: '10 6' }}
          />
        )}

        {/* ── Marcadores de caminhão (viagens com GPS ativo) ───────────── */}
        {viagens
          .filter(v => v.motorista_lat && v.motorista_lng)
          .map(v => (
            <Marker
              key={`cam-${v.id}`}
              position={[parseFloat(v.motorista_lat), parseFloat(v.motorista_lng)]}
              icon={criarIconeCaminhao(v.status)}
              eventHandlers={{ click: () => selecionarViagem(v) }}
            >
              <Popup>
                <div style={{ minWidth: 190, fontFamily: 'system-ui, sans-serif' }}>
                  <p style={{ fontWeight: 700, color: '#1E3A6E', fontSize: 13, marginBottom: 4 }}>
                    {v.placa_cavalo ?? '—'}
                    {v.placa_carreta ? ` · ${v.placa_carreta}` : ''}
                  </p>
                  {v.motorista_nome && (
                    <p style={{ fontSize: 11, color: '#64748b', marginBottom: 4 }}>{v.motorista_nome}</p>
                  )}
                  <p style={{
                    fontSize: 11, fontWeight: 600, marginBottom: 6,
                    color: v.status === 'retornando' ? '#F97316' : '#003DA5',
                  }}>
                    {STATUS_LABEL[v.status] ?? v.status}
                  </p>
                  {v.fab_nome && (
                    <p style={{ fontSize: 10, color: '#94a3b8' }}>Destino: {v.fab_nome}</p>
                  )}
                  {v.motorista_last_seen_at && (
                    <p style={{ fontSize: 10, color: '#94a3b8', marginTop: 2 }}>
                      Atualizado: {new Date(v.motorista_last_seen_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  )}
                  {ORS_KEY && v.fab_lat && (
                    <button
                      onClick={() => selecionarViagem(v)}
                      style={{
                        marginTop: 8, width: '100%', background: '#003DA5', color: 'white',
                        border: 'none', borderRadius: 8, padding: '6px 10px',
                        fontSize: 11, fontWeight: 700, cursor: 'pointer',
                      }}
                    >
                      {viagemSelecionada?.id === v.id ? '✕ Fechar rota' : '🗺 Ver rota até a fábrica'}
                    </button>
                  )}
                </div>
              </Popup>
            </Marker>
          ))
        }

        {/* ── Marcadores de unidades (fábricas e revendas) ─────────────── */}
        {unidades.map(u => (
          <Fragment key={u.id}>
            <Circle
              center={[parseFloat(u.latitude), parseFloat(u.longitude)]}
              radius={u.raio_geofence}
              pathOptions={{
                color:       u.tipo === 'revenda' ? '#003DA5' : '#F97316',
                fillColor:   u.tipo === 'revenda' ? '#003DA5' : '#F97316',
                fillOpacity: 0.07,
                weight:      1.5,
                dashArray:   '5 5',
              }}
            />
            <Marker
              position={[parseFloat(u.latitude), parseFloat(u.longitude)]}
              icon={criarIcone(u.tipo)}
            >
              <Popup>
                <div style={{ minWidth: 180, fontFamily: 'system-ui, sans-serif' }}>
                  <p style={{ fontWeight: 700, color: '#1E3A6E', fontSize: 13, marginBottom: 4 }}>{u.nome}</p>
                  <p style={{
                    fontSize: 11, fontWeight: 600, marginBottom: 6,
                    color: u.tipo === 'revenda' ? '#003DA5' : '#F97316',
                  }}>
                    {u.tipo === 'revenda' ? '🏢 Revenda' : '🏭 Fábrica'}
                  </p>
                  {u.endereco && (
                    <p style={{ fontSize: 11, color: '#64748b', marginBottom: 4 }}>{u.endereco}</p>
                  )}
                  <p style={{ fontSize: 10, color: '#94a3b8', fontFamily: 'monospace' }}>
                    {parseFloat(u.latitude).toFixed(5)}, {parseFloat(u.longitude).toFixed(5)}
                  </p>
                  <p style={{ fontSize: 10, color: '#94a3b8', marginTop: 2 }}>
                    Geofence: {u.raio_geofence}m
                  </p>
                </div>
              </Popup>
            </Marker>
          </Fragment>
        ))}
      </MapContainer>

      {/* Botão Voltar — flutuante sobre o mapa */}
      <div className="absolute top-3 left-3 z-[999]">
        <button
          onClick={onVoltar}
          className="flex items-center gap-1.5 bg-white/95 backdrop-blur-sm border border-cobeb-border rounded-xl shadow-md px-3 py-2 text-cobeb-navy text-sm font-semibold hover:bg-white transition-colors"
        >
          <ChevronLeft size={16} />
          Voltar
        </button>
      </div>

      {/* Legenda — flutuante topo direito */}
      <div className="absolute top-3 right-3 z-[999] bg-white/95 backdrop-blur-sm border border-cobeb-border rounded-xl shadow-md px-3 py-2.5 space-y-1.5">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded-full bg-cobeb-navy border-2 border-white shadow-sm shrink-0" />
          <span className="text-[11px] text-cobeb-text font-semibold">Revenda</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded-full bg-orange-500 border-2 border-white shadow-sm shrink-0" />
          <span className="text-[11px] text-cobeb-text font-semibold">Fábrica</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm leading-none">🚛</span>
          <span className="text-[11px] text-cobeb-text font-semibold">Caminhão</span>
        </div>
        <div className="border-t border-cobeb-border/50 pt-1.5 flex items-center gap-2">
          <Truck size={11} className="text-cobeb-navy shrink-0" />
          <span className="text-[11px] text-slate-500">{viagens.length} ativo{viagens.length !== 1 ? 's' : ''}</span>
          {urgentes > 0 && (
            <span className="text-[10px] text-yellow-600 font-bold">⚠ {urgentes}</span>
          )}
        </div>
      </div>

      {/* Badge "buscando rota" */}
      {buscandoRota && (
        <div className="absolute top-14 left-1/2 -translate-x-1/2 z-[999] bg-cobeb-navy text-white text-xs font-semibold px-4 py-2 rounded-full shadow-lg flex items-center gap-2">
          <div className="w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" />
          Calculando rota…
        </div>
      )}

      {/* Badge "rota ativa" com botão de fechar */}
      {viagemSelecionada?.rota && !buscandoRota && (
        <div className="absolute top-14 left-1/2 -translate-x-1/2 z-[999] bg-orange-500 text-white text-xs font-semibold px-4 py-2 rounded-full shadow-lg flex items-center gap-2">
          <span>Rota traçada até a fábrica</span>
          <button onClick={() => setViagemSelecionada(null)} className="hover:opacity-70">
            <X size={12} />
          </button>
        </div>
      )}

      {/* Painel de viagens — barra inferior */}
      <div className="absolute bottom-0 left-0 right-0 z-[999]">
        <div className="bg-white/95 backdrop-blur-sm border-t border-cobeb-border shadow-xl">

          {/* Handle / cabeçalho colapsável */}
          <button
            onClick={() => setPainelAberto(p => !p)}
            className="w-full flex items-center justify-between px-5 py-3"
          >
            <div className="flex items-center gap-2 flex-wrap">
              <Truck size={14} className="text-cobeb-navy shrink-0" />
              <span className="text-cobeb-text text-sm font-semibold">
                {viagens.length} veículo{viagens.length !== 1 ? 's' : ''} ativo{viagens.length !== 1 ? 's' : ''}
              </span>
              {urgentes > 0 && (
                <span className="flex items-center gap-1 text-[10px] font-bold text-yellow-600 bg-yellow-50 border border-yellow-200 px-2 py-0.5 rounded-full">
                  <AlertTriangle size={9} />
                  {urgentes} retornando
                </span>
              )}
            </div>
            {painelAberto
              ? <ChevronDown size={16} className="text-slate-400 shrink-0" />
              : <ChevronUp   size={16} className="text-slate-400 shrink-0" />
            }
          </button>

          {/* Lista de viagens expandida */}
          {painelAberto && (
            <div className="max-h-52 overflow-y-auto border-t border-cobeb-border/40">
              {viagens.length === 0 ? (
                <p className="text-center text-slate-400 text-sm py-5">Nenhum veículo ativo no momento</p>
              ) : viagens.map(v => (
                <div key={v.id} className="px-5 py-2.5 flex items-center justify-between gap-3 border-b border-cobeb-border/30 last:border-0">
                  <div className="min-w-0">
                    <p className="text-cobeb-text text-xs font-bold font-mono">
                      {v.placa_cavalo ?? '—'}{v.placa_carreta ? ` · ${v.placa_carreta}` : ''}
                    </p>
                    {v.motorista_nome && (
                      <p className="text-slate-400 text-[10px] truncate">{v.motorista_nome}</p>
                    )}
                  </div>
                  <span className={`text-[10px] font-semibold px-2 py-1 rounded-full border whitespace-nowrap ${STATUS_COR[v.status] ?? 'bg-slate-100 text-slate-500 border-slate-200'}`}>
                    {STATUS_LABEL[v.status] ?? v.status}
                  </span>
                </div>
              ))}
              <div className="px-5 py-2 text-center border-t border-cobeb-border/20">
                <p className="text-[10px] text-slate-300 flex items-center justify-center gap-1">
                  <Navigation size={9} />
                  Rastreamento GPS em breve
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
