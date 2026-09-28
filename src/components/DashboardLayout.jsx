import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import {
  LayoutDashboard, LogOut, Package, AlertTriangle, History,
  ClipboardCheck, DoorOpen, LayoutGrid, Monitor, Table2,
  ChevronLeft, ChevronRight,
} from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'

export default function DashboardLayout({ children }) {
  const { profile, signOut, setModoVisao } = useAuth()
  const navigate  = useNavigate()
  const location  = useLocation()
  const [collapsed, setCollapsed] = useState(false)

  const isAdminTotal = profile?.acesso_total === true

  const navItems = [
    { path: '/dashboard',         icon: LayoutDashboard, label: 'Dashboard'  },
    { path: '/pedidos',           icon: Package,         label: 'Pedidos'    },
    { path: '/check-recebimento', icon: ClipboardCheck,  label: 'Check'      },
    { path: '/portaria-admin',    icon: DoorOpen,        label: 'Portaria'   },
    { path: '/anomalias',         icon: AlertTriangle,   label: 'Anomalias'  },
    { path: '/historico',         icon: History,         label: 'Histórico'  },
    ...(!isAdminTotal ? [
      { path: '/painel-realtime', icon: Monitor, label: 'Tempo Real' },
      { path: '/dados',           icon: Table2,  label: 'Dados'      },
    ] : []),
  ]

  const handleLogout = async () => {
    await signOut()
    navigate('/login', { replace: true })
  }

  const initial = (profile?.nome ?? 'A').charAt(0).toUpperCase()

  return (
    <div className="h-screen overflow-hidden flex flex-col">

      {/* Header */}
      <header className="shrink-0 bg-cobeb-navy border-b border-blue-800 px-3 py-2 sm:px-5 sm:py-3.5 flex items-center justify-between shadow-md shadow-cobeb-navy/20">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <img
            src={`${import.meta.env.BASE_URL}logos/logo-cobeb-v2.png`}
            alt="COBEB"
            className="h-7 sm:h-11 md:h-14 w-auto object-contain shrink-0"
            style={{ opacity: 0.92 }}
            onError={e => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'flex' }}
          />
          <div style={{ display: 'none' }}
            className="w-7 h-7 rounded-lg bg-white/20 items-center justify-center shrink-0">
            <span className="text-white text-xs font-black select-none">CB</span>
          </div>
          <div className="min-w-0">
            <p className="text-white text-xs sm:text-sm font-semibold leading-tight truncate">Dashboard</p>
            <p className="text-blue-300/60 text-[9px] sm:text-[10px] font-medium tracking-wide uppercase hidden sm:block">
              Ciclo de Carretas
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={() => { setModoVisao(null); navigate('/selecionar-modulo') }}
            className="text-cobeb-yellow hover:text-white transition-colors p-1.5 rounded-lg hover:bg-white/10"
            title="Trocar Módulo"
          >
            <LayoutGrid size={18} />
          </button>
          <button
            onClick={handleLogout}
            className="text-blue-300/70 hover:text-white transition-colors p-1.5 rounded-lg hover:bg-white/10"
            title="Sair"
          >
            <LogOut size={18} />
          </button>
        </div>
      </header>

      {/* Body: sidebar + content */}
      <div className="flex flex-1 overflow-hidden">

        {/* Sidebar esquerdo */}
        <aside className={`${collapsed ? 'w-16' : 'w-48'} shrink-0 bg-cobeb-navy border-r border-blue-800 flex flex-col transition-all duration-200`}>

          {/* Itens de navegação */}
          <nav className="flex-1 py-3 flex flex-col gap-0.5 px-2 overflow-y-auto">
            {navItems.map(({ path, icon: Icon, label }) => {
              const active =
                location.pathname === path ||
                (path !== '/dashboard' && location.pathname.startsWith(path))
              return (
                <button
                  key={path}
                  onClick={() => navigate(path)}
                  title={collapsed ? label : undefined}
                  className={`w-full flex items-center gap-3 px-2 py-2.5 rounded-xl transition-colors ${
                    active
                      ? 'bg-white/10 text-cobeb-yellow'
                      : 'text-blue-300/60 hover:text-blue-200 hover:bg-white/10'
                  }`}
                >
                  <Icon size={20} className="shrink-0" />
                  {!collapsed && (
                    <span className="text-xs font-semibold truncate">{label}</span>
                  )}
                </button>
              )
            })}
          </nav>

          {/* Rodapé: recolher + inicial do usuário */}
          <div className="shrink-0 border-t border-blue-800/60 px-2 py-3 flex flex-col items-center gap-3">
            <button
              onClick={() => setCollapsed(c => !c)}
              title={collapsed ? 'Expandir menu' : 'Recolher menu'}
              className="w-full flex items-center justify-center py-1.5 rounded-xl text-blue-300/50 hover:text-blue-200 hover:bg-white/10 transition-colors"
            >
              {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
            </button>
            <div
              className="w-9 h-9 rounded-xl bg-white/10 border border-cobeb-yellow/30 flex items-center justify-center"
              title={profile?.nome ?? 'Usuário'}
            >
              <span className="text-cobeb-yellow text-sm font-black select-none">{initial}</span>
            </div>
          </div>
        </aside>

        {/* Conteúdo principal */}
        <main className="flex-1 overflow-y-auto bg-[#EBF5FF]">
          {children}
        </main>
      </div>
    </div>
  )
}
