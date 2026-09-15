import { useNavigate, useLocation } from 'react-router-dom'
import { LayoutDashboard, LogOut, Package, AlertTriangle, History, ClipboardCheck, DoorOpen, LayoutGrid, Monitor, Table2 } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'

export default function AdminLayout({ title, subheader, children }) {
  const { profile, signOut, setModoVisao } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const handleLogout = async () => {
    await signOut()
    navigate('/login', { replace: true })
  }

  const isAdminTotal = profile?.acesso_total === true

  const navItems = [
    { path: '/dashboard',         icon: LayoutDashboard, label: 'Dashboard' },
    { path: '/pedidos',           icon: Package,         label: 'Pedidos'   },
    { path: '/check-recebimento', icon: ClipboardCheck,  label: 'Check'     },
    { path: '/portaria-admin',    icon: DoorOpen,        label: 'Portaria'  },
    { path: '/anomalias',         icon: AlertTriangle,   label: 'Anomalias' },
    { path: '/historico',         icon: History,         label: 'Histórico' },
    ...(!isAdminTotal ? [
      { path: '/painel-realtime', icon: Monitor, label: 'Tempo Real' },
      { path: '/dados',           icon: Table2,  label: 'Dados'     },
    ] : []),
  ]

  return (
    <div className="min-h-screen bg-[#EBF5FF]">

      {/* Header + filtros fixos no topo */}
      <div className="sticky top-0 z-40">
      <header className="bg-cobeb-navy border-b border-blue-800 px-3 py-2 sm:px-5 sm:py-3.5 flex items-center justify-between shadow-md shadow-cobeb-navy/20">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <img
            src={`${import.meta.env.BASE_URL}logos/logo-cobeb-v2.png`}
            alt="COBEB"
            className="h-7 sm:h-11 md:h-14 w-auto object-contain shrink-0"
            style={{ opacity: 0.92 }}
            onError={(e) => {
              e.target.style.display = 'none'
              e.target.nextSibling.style.display = 'flex'
            }}
          />
          {/* Fallback */}
          <div
            style={{ display: 'none' }}
            className="w-7 h-7 rounded-lg bg-white/20 items-center justify-center shrink-0"
          >
            <span className="text-white text-xs font-black select-none">CB</span>
          </div>

          <div className="min-w-0">
            <p className="text-white text-xs sm:text-sm font-semibold leading-tight truncate">{title}</p>
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
      {subheader && <div className="bg-[#EBF5FF]">{subheader}</div>}
      </div>

      <main className="pb-20">
        {children}
      </main>

      {/* Bottom nav azul com ativo amarelo */}
      <nav className="fixed bottom-0 left-0 right-0 bg-cobeb-navy border-t border-blue-800 flex z-40 max-w-2xl mx-auto shadow-lg shadow-cobeb-navy/30">
        {navItems.map(({ path, icon: Icon, label }) => {
          const active =
            location.pathname === path ||
            (path !== '/dashboard' && location.pathname.startsWith(path))
          return (
            <button
              key={path}
              onClick={() => navigate(path)}
              className={`flex-1 flex flex-col items-center justify-center py-3 gap-1 transition-colors ${
                active
                  ? 'text-cobeb-yellow'
                  : 'text-blue-300/60 hover:text-blue-200'
              }`}
            >
              <Icon size={20} />
              <span className="text-[10px] font-semibold">{label}</span>
            </button>
          )
        })}
      </nav>
    </div>
  )
}
