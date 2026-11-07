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
  try { return JSON.parse(localStorage.getItem(LAST_POS_KEY) ?? 'null') }
  catch { return null }
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
  // Última posição GPS confirmada — persiste entre reinicializações do app via
  // localStorage. Permite que sincronizar() atualize last_seen_at mesmo quando
  // o GPS perde sinal temporariamente (galpão, área coberta, zona rural).
  const lastKnownPosRef  = useRef(lerPosCache())
  const dentroFabRef     = useRef(false)
  const pontosForaRef    = useRef(0)
  const callbackRef      = useRef(null)
  const viagemIdRef      = useRef(null)
  const isOnlineRef      = useRef(isOnline)
  const authListenerRef  = useRef(null)
  // Monitoramento de sem sinal: id do motorista (setado em iniciar) e
  // timestamp de quando o sync começou a falhar (null = sincronizando ok).
  const motoristaIdRef   = useRef(null)
  const semSinalDesdeRef = useRef(null)

  callbackRef.current = onMudarStatus
  viagemIdRef.current = viagemId
  isOnlineRef.current = isOnline

  useEffect(() => {
    dentroFabRef.current = statusRef.current === 'na_fabrica'
  }, [statusRef.current])

  // Sync JS — fallback para browser e sync imediata na abertura do app.
  // Usa posRef (GPS fresco) se disponível, senão lastKnownPosRef (última posição
  // confirmada). Isso mantém last_seen_at vivo mesmo em áreas sem cobertura GPS.
  // Rastreia períodos sem sinal (> 5 min) e grava em gps_eventos ao recuperar.
  const sincronizar = useCallback(async () => {
    const pos = posRef.current ?? lastKnownPosRef.current
    const vid = viagemIdRef.current
    if (!pos || !vid || !isOnlineRef.current) {
      if (!semSinalDesdeRef.current) semSinalDesdeRef.current = Date.now()
      return
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
    // Sync bem-sucedido: registra período sem sinal se durou mais de 5 min
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
    lastKnownPosRef.current = { lat, lng }
    try { localStorage.setItem(LAST_POS_KEY, JSON.stringify({ lat, lng })) } catch {}
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
        supabase.from('gps_eventos').insert({ viagem_id: viagemIdRef.current, motorista_id: user.id, evento: 'iniciar' })
    })

    if (IS_NATIVE_APP) {
      // 1. Serviço nativo próprio — rastreia e sincroniza com Supabase independente
      //    do WebView, com START_STICKY, WakeLock e timer de 30s próprios.
      try {
        const { data: { session } } = await supabase.auth.getSession()
        // Do `config()`, e nao de `import.meta.env`: o servico nativo guarda o
        // endereco no aparelho e continua usando-o depois que o Android o
        // reinicia. Se ele nascesse com o valor de compilacao, o celular
        // seguiria gravando no servidor antigo depois da migracao -- com o
        // aplicativo funcionando e nada denunciando.
        await CobebGps.startTracking({
          supabaseUrl:   config().supabaseUrl,
          supabaseKey:   config().supabaseAnonKey,
          accessToken:   session?.access_token  ?? '',
          refreshToken:  session?.refresh_token ?? '',
          viagemId:      viagemIdRef.current,
        })
      } catch (err) {
        console.error('[Rastreamento] Erro ao iniciar CobebGpsService:', err)
      }

      // Atualiza o token no serviço nativo sempre que o Supabase o renovar
      const { data: listener } = supabase.auth.onAuthStateChange(async (event, session) => {
        if (event === 'TOKEN_REFRESHED' && session && ativoRef.current) {
          try {
            await CobebGps.updateToken({
              accessToken:  session.access_token,
              refreshToken: session.refresh_token ?? '',
            })
          } catch {}
        }
      })
      authListenerRef.current = listener

      // 2. Watcher do plugin de terceiro — apenas para callbacks JS de geofence
      //    enquanto o app está em foreground (tela ligada).
      // Sync imediato ao iniciar (garante posição mesmo antes do primeiro callback)
      sincronizar()
      syncTimerRef.current = setInterval(sincronizar, 30000)

      // Fallback de posição por rede (cell/WiFi): funciona em galpões e áreas sem
      // GPS. Não bloqueia — dispara e esquece. Só popula posRef se o watcher ainda
      // não entregou uma posição mais precisa.
      if (!lastKnownPosRef.current) {
        navigator.geolocation?.getCurrentPosition(
          (p) => {
            if (!posRef.current) {
              posRef.current = { lat: p.coords.latitude, lng: p.coords.longitude }
            }
          },
          () => {},
          { enableHighAccuracy: false, timeout: 5000, maximumAge: 600000 },
        )
      }

      try {
        const id = await BackgroundGeolocation.addWatcher(
          {
            backgroundMessage:  'COBEB está rastreando sua localização',
            backgroundTitle:    'COBEB Ciclo — Rastreamento ativo',
            requestPermissions: true,
            // stale: true entrega a última posição cacheada pelo Android
            // imediatamente, sem esperar um fix GPS fresco. Reduz o tempo inicial
            // em que posRef fica nulo (e last_seen_at para de atualizar).
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
              // Sync JS enquanto tela está ligada (fallback se o serviço nativo falhar)
              sincronizar()
            }
          }
        )
        watcherIdRef.current = { type: 'capacitor', id }
      } catch (err) {
        console.error('[Rastreamento] Erro ao registrar watcher de geofence:', err)
      }

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
      authListenerRef.current?.subscription?.unsubscribe()
      authListenerRef.current = null
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
