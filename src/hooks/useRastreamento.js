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
  const dentroFabRef    = useRef(false)
  const callbackRef     = useRef(null)
  const viagemIdRef     = useRef(null)
  const isOnlineRef     = useRef(isOnline)
  const authListenerRef = useRef(null)

  callbackRef.current = onMudarStatus
  viagemIdRef.current = viagemId
  isOnlineRef.current = isOnline

  useEffect(() => {
    dentroFabRef.current = statusRef.current === 'na_fabrica'
  }, [statusRef.current])

  // Sync JS — fallback para browser e sync imediata na abertura do app
  const sincronizar = useCallback(async () => {
    const pos = posRef.current
    const vid = viagemIdRef.current
    if (!pos || !vid || !isOnlineRef.current) return
    await supabase
      .from('viagens')
      .update({
        motorista_lat:          pos.lat,
        motorista_lng:          pos.lng,
        motorista_last_seen_at: new Date().toISOString(),
      })
      .eq('id', vid)
  }, [])

  function processarPosicao(lat, lng) {
    posRef.current = { lat, lng }
    const status = statusRef.current
    if (!fabricasAlvo?.length) return

    const dentroAgora = fabricasAlvo.some(f => {
      if (!f.latitude || !f.longitude) return false
      return distanciaMetros(lat, lng, parseFloat(f.latitude), parseFloat(f.longitude))
             <= (f.raio_geofence || 100)
    })

    if (dentroAgora && !dentroFabRef.current && status === 'em_transito') {
      dentroFabRef.current = true
      callbackRef.current?.({
        key: 'chegada_fabrica', field: 'dt_chegada_fabrica',
        nextStatus: 'na_fabrica', requireNF: false, closeCycle: false,
      })
    }
    if (!dentroAgora && dentroFabRef.current && status === 'na_fabrica') {
      dentroFabRef.current = false
      callbackRef.current?.({
        key: 'saida_fabrica', field: 'dt_saida_fabrica',
        nextStatus: 'retornando', requireNF: false, closeCycle: false,
      })
    }
  }

  async function iniciar() {
    if (ativoRef.current) return
    ativoRef.current = true

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

      try {
        const id = await BackgroundGeolocation.addWatcher(
          {
            backgroundMessage:  'COBEB está rastreando sua localização',
            backgroundTitle:    'COBEB Ciclo — Rastreamento ativo',
            requestPermissions: true,
            stale:              false,
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
