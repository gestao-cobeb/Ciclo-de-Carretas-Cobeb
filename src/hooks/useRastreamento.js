import { useRef, useEffect, useCallback } from 'react'
import { registerPlugin } from '@capacitor/core'
import { supabase } from '../lib/supabase'
import { config } from '../lib/config'

// Plugin nativo próprio do app — independente do WebView, com START_STICKY
const CobebGps = registerPlugin('CobebGps')

// Plugin de terceiro mantido apenas para callbacks JS de geofence (foreground)
const BackgroundGeolocation = registerPlugin('BackgroundGeolocation')

export const IS_NATIVE_APP =
  typeof window !== 'undefined' && window.Capacitor?.isNativePlatform?.() === true

const LAST_POS_KEY = 'cobeb_last_gps_pos'

function lerPosCache() {
  try {
    const stored = JSON.parse(localStorage.getItem(LAST_POS_KEY) ?? 'null')
    if (!stored) return null
    // Formato legado sem ts: considera imediatamente velho (10 min check vai falhar)
    return { lat: stored.lat, lng: stored.lng, ts: stored.ts ?? 0 }
  } catch { return null }
}

function salvarPosCache(lat, lng) {
  try {
    localStorage.setItem(LAST_POS_KEY, JSON.stringify({ lat, lng, ts: Date.now() }))
  } catch {}
}

// ── Haversine ─────────────────────────────────────────────────────────────────

function distanciaMetros(lat1, lng1, lat2, lng2) {
  const R  = 6371000
  const φ1 = (lat1 * Math.PI) / 180
  const φ2 = (lat2 * Math.PI) / 180
  const Δφ = ((lat2 - lat1) * Math.PI) / 180
  const Δλ = ((lng2 - lng1) * Math.PI) / 180
  const a  = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useRastreamento({ viagemId, statusRef, fabricasAlvo, isOnline, onMudarStatus }) {
  const ativoRef        = useRef(false)
  const watcherIdRef    = useRef(null)
  const syncTimerRef    = useRef(null)
  const posRef          = useRef(null)
  // Última posição GPS confirmada — persiste via localStorage entre reinicializações.
  // Task 4: nunca usar se ts > 10 min (pode ser muito antiga para o fallback JS).
  const lastKnownPosRef  = useRef(lerPosCache())
  const dentroFabRef     = useRef(false)
  const pontosForaRef    = useRef(0)
  const callbackRef      = useRef(null)
  const viagemIdRef      = useRef(null)
  const isOnlineRef      = useRef(isOnline)
  // Task 1: listener do evento tokenRefreshed emitido pelo nativo
  const tokenListenerRef = useRef(null)
  // Task 4: listener de visibilidade para detectar retorno ao foreground
  const visibilityHandlerRef = useRef(null)
  // Task 8: monitoramento de sem sinal no lado JS (só ativo quando nativo não está rodando)
  const motoristaIdRef   = useRef(null)
  const semSinalDesdeRef = useRef(null)

  callbackRef.current = onMudarStatus
  viagemIdRef.current = viagemId
  isOnlineRef.current = isOnline

  useEffect(() => {
    dentroFabRef.current = statusRef.current === 'na_fabrica'
  }, [statusRef.current])

  // Task 4: sincronizar() só faz PATCH quando o serviço nativo não está rodando.
  // Quando está rodando, o nativo é o único escritor de posição — o JS evita
  // sobrescrever com posição potencialmente mais velha ou de menor precisão.
  // Task 8: sem_sinal só é gravado pelo JS quando nativo não está rodando.
  const sincronizar = useCallback(async () => {
    const cached = lastKnownPosRef.current
    const TEN_MIN = 10 * 60 * 1000
    // Posição fresca do GPS ou última conhecida com menos de 10 min
    const pos = posRef.current
      ?? (cached && cached.ts && Date.now() - cached.ts < TEN_MIN ? cached : null)
    const vid = viagemIdRef.current

    if (!pos || !vid || !isOnlineRef.current) {
      if (!semSinalDesdeRef.current) semSinalDesdeRef.current = Date.now()
      return
    }

    // Nativo rodando: ele já está fazendo o PATCH; JS não interfere
    if (IS_NATIVE_APP) {
      try {
        const { running } = await CobebGps.isRunning()
        if (running) {
          semSinalDesdeRef.current = null
          return
        }
      } catch {}
      // Serviço parado: JS assume como fallback
    }

    const { error } = await supabase
      .from('viagens')
      .update({
        motorista_lat:          pos.lat,
        motorista_lng:          pos.lng,
        motorista_last_seen_at: new Date().toISOString(),
      })
      .eq('id', vid)

    if (error) {
      if (!semSinalDesdeRef.current) semSinalDesdeRef.current = Date.now()
      return
    }

    // Sync bem-sucedido: registra sem_sinal se durou > 5 min (apenas fallback JS)
    if (semSinalDesdeRef.current) {
      const duracaoMs = Date.now() - semSinalDesdeRef.current
      semSinalDesdeRef.current = null
      if (duracaoMs >= 5 * 60 * 1000 && motoristaIdRef.current) {
        supabase.from('gps_eventos').insert({
          viagem_id:        vid,
          motorista_id:     motoristaIdRef.current,
          evento:           'sem_sinal',
          duracao_segundos: Math.round(duracaoMs / 1000),
        })
      }
    }
  }, [])

  function processarPosicao(lat, lng) {
    posRef.current = { lat, lng }
    lastKnownPosRef.current = { lat, lng, ts: Date.now() }
    salvarPosCache(lat, lng)

    const status = statusRef.current
    if (!fabricasAlvo?.length) return

    const dentroAgora = fabricasAlvo.some(f => {
      if (!f.latitude || !f.longitude) return false
      return distanciaMetros(lat, lng, parseFloat(f.latitude), parseFloat(f.longitude))
             <= (f.raio_geofence || 100)
    })

    // em_transito → na_fabrica
    if (dentroAgora && !dentroFabRef.current && status === 'em_transito') {
      dentroFabRef.current  = true
      pontosForaRef.current = 0
      callbackRef.current?.({
        key: 'chegada_fabrica', field: 'dt_chegada_fabrica',
        nextStatus: 'na_fabrica', requireNF: false, closeCycle: false,
      })
      return
    }

    // na_fabrica: dentro → resetar contador (interferência descartada)
    if (dentroAgora && dentroFabRef.current && status === 'na_fabrica') {
      pontosForaRef.current = 0
      return
    }

    // na_fabrica: fora → debounce de 3 pontos consecutivos
    if (!dentroAgora && dentroFabRef.current && status === 'na_fabrica') {
      pontosForaRef.current += 1
      if (pontosForaRef.current >= 3) {
        dentroFabRef.current  = false
        pontosForaRef.current = 0
        callbackRef.current?.({
          key: 'saida_fabrica', field: 'dt_saida_fabrica',
          nextStatus: 'retornando', requireNF: false, closeCycle: false,
        })
      }
      return
    }

    // retornando → na_fabrica (voltou ao raio — sem limite de tempo)
    if (dentroAgora && status === 'retornando') {
      dentroFabRef.current  = true
      pontosForaRef.current = 0
      callbackRef.current?.({
        key: 'reentrada_fabrica', field: 'dt_saida_fabrica', fieldValue: null,
        nextStatus: 'na_fabrica', requireNF: false, closeCycle: false,
      })
    }
  }

  async function iniciar() {
    if (ativoRef.current) return
    ativoRef.current = true

    // Log para monitoramento de battery optimization (fire-and-forget)
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      motoristaIdRef.current = user.id
      if (viagemIdRef.current)
        supabase.from('gps_eventos').insert({
          viagem_id:    viagemIdRef.current,
          motorista_id: user.id,
          evento:       'iniciar',
        })
    })

    if (IS_NATIVE_APP) {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        // Task 1: o nativo passa a ser o único dono da renovação.
        // stopAutoRefresh() impede que o supabase-js (na WebView) renove por conta
        // própria e gire o refresh token — o que tornaria o token no nativo inválido.
        supabase.auth.stopAutoRefresh()

        await CobebGps.startTracking({
          supabaseUrl:   config().supabaseUrl,
          supabaseKey:   config().supabaseAnonKey,
          accessToken:   session?.access_token  ?? '',
          refreshToken:  session?.refresh_token ?? '',
          viagemId:      viagemIdRef.current,
        })

        // Task 1: escuta renovações feitas pelo nativo e sincroniza a sessão JS
        tokenListenerRef.current = await CobebGps.addListener(
          'tokenRefreshed',
          async ({ accessToken, refreshToken }) => {
            try {
              await supabase.auth.setSession({
                access_token:  accessToken,
                refresh_token: refreshToken,
              })
            } catch {}
          }
        )

        // Task 7: watchdog WorkManager — reinicia o serviço se o Android o matar
        try { await CobebGps.scheduleWatchdog() } catch {}

        // Task 6: solicita isenção de battery optimization na primeira viagem
        try {
          const { ignoring } = await CobebGps.isIgnoringBatteryOptimizations()
          if (!ignoring) await CobebGps.requestBatteryOptimizationExemption()
        } catch {}

      } catch (err) {
        console.error('[Rastreamento] Erro ao iniciar CobebGpsService:', err)
      }

      // Task 4: sync JS periódico — só envia PATCH se o nativo não estiver rodando
      sincronizar()
      syncTimerRef.current = setInterval(sincronizar, 30000)

      // Fallback de posição por rede (cell/WiFi): funciona em galpões e áreas sem GPS.
      // Task 4: enableHighAccuracy: true para maior precisão quando o JS assume
      if (!lastKnownPosRef.current) {
        navigator.geolocation?.getCurrentPosition(
          p => {
            if (!posRef.current)
              posRef.current = { lat: p.coords.latitude, lng: p.coords.longitude }
          },
          () => {},
          { enableHighAccuracy: true, timeout: 5000, maximumAge: 600000 },
        )
      }

      try {
        const id = await BackgroundGeolocation.addWatcher(
          {
            backgroundMessage:  'COBEB está rastreando sua localização',
            backgroundTitle:    'COBEB Ciclo — Rastreamento ativo',
            requestPermissions: true,
            stale:              true,
            distanceFilter:     20,
          },
          (location, error) => {
            if (error) {
              if (error.code === 'NOT_AUTHORIZED') BackgroundGeolocation.openSettings()
              return
            }
            if (location) {
              processarPosicao(location.latitude, location.longitude)
              sincronizar()
            }
          }
        )
        watcherIdRef.current = { type: 'capacitor', id }
      } catch (err) {
        console.error('[Rastreamento] Erro ao registrar watcher de geofence:', err)
      }

      // Task 4: ao voltar ao foreground, verifica se o nativo ainda está rodando.
      // Se parou (battery optimization), reinicia antes que o JS mande PATCH.
      const handleVisibility = async () => {
        if (document.visibilityState !== 'visible' || !ativoRef.current) return
        try {
          const { running } = await CobebGps.isRunning()
          if (!running && viagemIdRef.current) {
            console.warn('[Rastreamento] Nativo parado ao retornar ao foreground — reiniciando')
            const { data: { session } } = await supabase.auth.getSession()
            await CobebGps.startTracking({
              supabaseUrl:  config().supabaseUrl,
              supabaseKey:  config().supabaseAnonKey,
              accessToken:  session?.access_token  ?? '',
              refreshToken: session?.refresh_token ?? '',
              viagemId:     viagemIdRef.current,
            })
          }
        } catch {}
      }
      visibilityHandlerRef.current = handleVisibility
      document.addEventListener('visibilitychange', handleVisibility)

    } else {
      // Browser: sync JS periódico + watchPosition para geofence
      sincronizar()
      syncTimerRef.current = setInterval(sincronizar, 30000)

      if (!navigator.geolocation) return
      const watchId = navigator.geolocation.watchPosition(
        pos => { processarPosicao(pos.coords.latitude, pos.coords.longitude); sincronizar() },
        err => console.warn('[Rastreamento] Erro GPS:', err),
        { enableHighAccuracy: true, timeout: 30000, maximumAge: 0 }
      )
      watcherIdRef.current = { type: 'browser', id: watchId }
    }
  }

  async function parar() {
    if (!ativoRef.current) return
    ativoRef.current = false

    clearInterval(syncTimerRef.current)
    syncTimerRef.current = null

    if (IS_NATIVE_APP) {
      try { await CobebGps.stopTracking() } catch {}
      // Task 7: cancela o watchdog ao encerrar a viagem
      try { await CobebGps.cancelWatchdog() } catch {}
      // Task 1: restaura auto-refresh do supabase-js
      supabase.auth.startAutoRefresh()
      // Limpa listeners
      tokenListenerRef.current?.remove()
      tokenListenerRef.current = null
      if (visibilityHandlerRef.current) {
        document.removeEventListener('visibilitychange', visibilityHandlerRef.current)
        visibilityHandlerRef.current = null
      }
      const w = watcherIdRef.current
      if (w?.type === 'capacitor' && w.id) {
        try { await BackgroundGeolocation.removeWatcher({ id: w.id }) } catch {}
      }
    } else {
      await sincronizar()
      const w = watcherIdRef.current
      if (w?.type === 'browser') navigator.geolocation.clearWatch(w.id)
    }

    watcherIdRef.current = null

    const vid = viagemIdRef.current
    if (vid && isOnlineRef.current) {
      await supabase.from('viagens').update({
        motorista_lat: null, motorista_lng: null, motorista_last_seen_at: null,
      }).eq('id', vid)
    }
  }

  useEffect(() => {
    return () => { if (ativoRef.current) parar() }
  }, [])

  return { iniciar, parar }
}
