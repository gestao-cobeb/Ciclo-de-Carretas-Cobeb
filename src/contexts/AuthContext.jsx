import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext({})

const MODO_KEY = 'cobeb_modo_visao'

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [modoVisao, setModoVisaoState] = useState(
    () => localStorage.getItem(MODO_KEY) || null
  )

  // Distingue logout explícito (botão Sair) de SIGNED_OUT disparado pelo Supabase
  // quando a renovação do token falha por queda momentânea de rede. Sem isso, o
  // motorista é jogado para a tela de login toda vez que o Android retoma o app
  // e a rede ainda não está pronta — a viagem ativa fica visualmente quebrada.
  const signOutIntentional = useRef(false)

  function setModoVisao(modo) {
    if (modo) {
      localStorage.setItem(MODO_KEY, modo)
    } else {
      localStorage.removeItem(MODO_KEY)
    }
    setModoVisaoState(modo)
  }

  const fetchProfile = async (userId) => {
    const { data, error } = await supabase
      .from('profiles')
      .select('*, unidade:unidades(id, nome, cidade, codigo)')
      .eq('id', userId)
      .single()

    if (!error && data) {
      if (!data.ativo) {
        signOutIntentional.current = true
        await supabase.auth.signOut()
        setLoading(false)
        return
      }
      setProfile(data)
    }
    setLoading(false)
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      const u = session?.user ?? null
      setUser(u)
      if (u) fetchProfile(u.id)
      else setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      // SIGNED_OUT não intencional = falha de renovação de token por rede instável.
      // Manter a sessão; o auto-refresh tentará de novo quando a rede voltar.
      if (_event === 'SIGNED_OUT' && !signOutIntentional.current) return

      signOutIntentional.current = false
      const u = session?.user ?? null
      setUser(u)
      if (u) {
        fetchProfile(u.id)
      } else {
        setProfile(null)
        setModoVisao(null)
        setLoading(false)
      }
    })

    // Capacitor: quando o app volta ao foreground (resume), reativa o auto-refresh do token.
    // Quando vai para background (pause), para os timers — o Android os throttla de qualquer forma.
    // Sem isso, após longa inatividade o timer de refresh expira e o Supabase desconecta o usuário.
    const handleResume = () => supabase.auth.startAutoRefresh()
    const handlePause  = () => supabase.auth.stopAutoRefresh()
    document.addEventListener('resume', handleResume)
    document.addEventListener('pause',  handlePause)

    return () => {
      subscription.unsubscribe()
      document.removeEventListener('resume', handleResume)
      document.removeEventListener('pause',  handlePause)
    }
  }, [])

  const signIn = (email, password) =>
    supabase.auth.signInWithPassword({ email, password })

  const signOut = async () => {
    signOutIntentional.current = true
    setModoVisao(null)
    await supabase.auth.signOut()
  }

  return (
    <AuthContext.Provider value={{ user, profile, loading, modoVisao, setModoVisao, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
