import { useState, useEffect } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { LayoutDashboard, Truck, ClipboardList, Shield, Monitor, LogOut, Wifi, Table2, Users } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'

const MODULOS = [
  {
    key:    'admin',
    rota:   '/dashboard',
    label:  'Administrador',
    desc:   'Painel, histórico e relatórios',
    Icon:   LayoutDashboard,
    cor:    'bg-cobeb-navy',
    borda:  'border-cobeb-navy/30',
    texto:  'text-cobeb-navy',
    fundo:  'bg-cobeb-navy/5 hover:bg-cobeb-navy/10',
  },
  {
    key:    'motorista',
    rota:   '/viagem',
    label:  'Motorista',
    desc:   'Wizard de viagem, etapas e ciclo de carretas',
    Icon:   Truck,
    cor:    'bg-blue-500',
    borda:  'border-blue-500/30',
    texto:  'text-blue-600',
    fundo:  'bg-blue-500/5 hover:bg-blue-500/10',
  },
  {
    key:    'conferente',
    rota:   '/tarefas',
    label:  'Conferente',
    desc:   'Conferência de carga e registro de anomalias',
    Icon:   ClipboardList,
    cor:    'bg-green-600',
    borda:  'border-green-600/30',
    texto:  'text-green-700',
    fundo:  'bg-green-600/5 hover:bg-green-600/10',
  },
  {
    key:    'portaria',
    rota:   '/portaria',
    label:  'Portaria',
    desc:   'Controle de entrada e saída de veículos',
    Icon:   Shield,
    cor:    'bg-cobeb-yellow',
    borda:  'border-cobeb-yellow/40',
    texto:  'text-yellow-700',
    fundo:  'bg-cobeb-yellow/5 hover:bg-cobeb-yellow/10',
  },
  {
    key:    'empilheira',
    rota:   '/estoque',
    label:  'Painel Tempo Real',
    desc:   'Monitoramento de veículos em tempo real',
    Icon:   Monitor,
    cor:    'bg-orange-500',
    borda:  'border-orange-500/30',
    texto:  'text-orange-600',
    fundo:  'bg-orange-500/5 hover:bg-orange-500/10',
  },
  {
    key:    'dados',
    rota:   '/dados',
    label:  'Dados',
    desc:   'Tabelas e consultas de dados operacionais',
    Icon:   Table2,
    cor:    'bg-teal-600',
    borda:  'border-teal-600/30',
    texto:  'text-teal-700',
    fundo:  'bg-teal-600/5 hover:bg-teal-600/10',
  },
  {
    key:    'cadastros',
    rota:   '/cadastros',
    label:  'Cadastros',
    desc:   'Motoristas, carretas, cavalos e usuários',
    Icon:   Users,
    cor:    'bg-slate-600',
    borda:  'border-slate-600/30',
    texto:  'text-slate-700',
    fundo:  'bg-slate-600/5 hover:bg-slate-600/10',
  },
]

function sinalGPS(lastSeen) {
  if (!lastSeen) return { cor: 'text-slate-400', label: 'Sem sinal GPS' }
  const mins = (Date.now() - new Date(lastSeen)) / 60000
  if (mins <= 5)  return { cor: 'text-green-500',  label: 'GPS ativo' }
  if (mins <= 30) return { cor: 'text-orange-500', label: `${Math.round(mins)}min sem atualizar` }
  return { cor: 'text-red-500', label: `${Math.round(mins)}min sem sinal` }
}

export default function SeletorModulo() {
  const { user, profile, loading, modoVisao, setModoVisao, signOut } = useAuth()
  const navigate = useNavigate()
  const [sinalLastSeen, setSinalLastSeen] = useState(undefined)

  useEffect(() => {
    async function fetchSinal() {
      const { data } = await supabase
        .from('viagens')
        .select('motorista_last_seen_at')
        .neq('status', 'concluida')
        .not('motorista_last_seen_at', 'is', null)
        .order('motorista_last_seen_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      setSinalLastSeen(data?.motorista_last_seen_at ?? null)
    }
    fetchSinal()
    const timer = setInterval(fetchSinal, 30000)
    return () => clearInterval(timer)
  }, [])

  if (loading) {
    return (
      <div className="min-h-screen bg-[#EBF5FF] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!user || !profile?.acesso_total) return <Navigate to="/login" replace />

  // Se já tem modo, redireciona
  if (modoVisao) {
    const mod = MODULOS.find(m => m.key === modoVisao)
    return <Navigate to={mod?.rota ?? '/dashboard'} replace />
  }

  function entrar(modulo) {
    setModoVisao(modulo.key)
    navigate(modulo.rota, { replace: true })
  }

  return (
    <div className="min-h-screen bg-[#EBF5FF] flex flex-col">

      {/* Header */}
      <header className="bg-cobeb-navy px-5 py-4 flex items-center justify-between shadow-md shadow-cobeb-navy/20">
        <div>
          <p className="text-cobeb-yellow text-xl font-black tracking-tight leading-none">COBEB</p>
          <p className="text-blue-300/70 text-[10px] font-semibold tracking-widest uppercase">Distribuidora</p>
        </div>
        <button
          onClick={signOut}
          className="flex items-center gap-2 text-blue-300/70 hover:text-white text-xs transition-colors p-1.5 rounded-lg hover:bg-white/10"
        >
          <LogOut size={16} />
          <span className="hidden sm:inline">Sair</span>
        </button>
      </header>

      {/* Body */}
      <main className="flex-1 flex flex-col items-center justify-start px-5 pt-8 pb-10">
        <div className="w-full max-w-sm">

          {/* Saudação */}
          <div className="mb-8 text-center">
            <div className="w-14 h-14 rounded-2xl bg-cobeb-navy flex items-center justify-center mx-auto mb-3 shadow-lg shadow-cobeb-navy/30">
              <span className="text-cobeb-yellow text-xl font-black">
                {(profile.nome ?? 'A').charAt(0).toUpperCase()}
              </span>
            </div>
            <p className="text-cobeb-text font-bold text-base">
              {profile.nome ?? 'Administrador'}
            </p>
            <p className="text-slate-500 text-sm mt-0.5">Selecione o módulo de acesso</p>
          </div>

          {/* Cards de módulo */}
          <div className="grid grid-cols-2 gap-3">
            {MODULOS.map(mod => {
              const { Icon } = mod
              const isRealtime = mod.key === 'empilheira'
              const sinal = isRealtime && sinalLastSeen !== undefined ? sinalGPS(sinalLastSeen) : null
              return (
                <button
                  key={mod.key}
                  onClick={() => entrar(mod)}
                  className={`${mod.fundo} border ${mod.borda} rounded-2xl p-4 text-left flex flex-col gap-3 transition-all active:scale-95`}
                >
                  <div className={`w-10 h-10 rounded-xl ${mod.cor} flex items-center justify-center shadow-sm`}>
                    <Icon size={20} className="text-white" />
                  </div>
                  <div>
                    <p className={`text-sm font-bold ${mod.texto}`}>{mod.label}</p>
                    <p className="text-slate-500 text-[10px] leading-snug mt-0.5">{mod.desc}</p>
                  </div>
                  {isRealtime && sinal && (
                    <div className={`flex items-center gap-1.5 border-t border-orange-500/20 pt-2 -mt-1`}>
                      <Wifi size={12} className={sinal.cor} />
                      <span className={`text-[10px] font-semibold ${sinal.cor}`}>{sinal.label}</span>
                    </div>
                  )}
                </button>
              )
            })}
          </div>
        </div>
      </main>
    </div>
  )
}
