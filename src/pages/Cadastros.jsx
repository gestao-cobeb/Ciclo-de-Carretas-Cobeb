import { useState } from 'react'
import { Truck, Users, ClipboardList, Tractor, Shield, DoorOpen, Forklift, Building2, LayoutGrid } from 'lucide-react'
import AdminLayout from '../components/AdminLayout'
import ErrorBoundary from '../components/ErrorBoundary'
import { useAuth } from '../contexts/AuthContext'
import Motoristas from './cadastros/Motoristas'
import Conferentes from './cadastros/Conferentes'
import Portaria from './cadastros/Portaria'
import Empilhadeiras from './cadastros/Empilhadeiras'
import Carretas from './cadastros/Carretas'
import Cavalos from './cadastros/Cavalos'
import Admins from './cadastros/Admins'
import Unidades from './cadastros/Unidades'
import Grade from './cadastros/Grade'

const TABS_BASE = [
  { id: 'motoristas',    label: 'Motoristas',    icon: Users,        adminTotal: false },
  { id: 'conferentes',   label: 'Conferentes',   icon: ClipboardList, adminTotal: false },
  { id: 'portaria',      label: 'Portaria',      icon: DoorOpen,     adminTotal: false },
  { id: 'empilhadeiras', label: 'Empilhadeiras', icon: Forklift,     adminTotal: false },
  { id: 'carretas',      label: 'Carretas',      icon: Truck,        adminTotal: false },
  { id: 'cavalos',       label: 'Cavalos',       icon: Tractor,      adminTotal: false },
  { id: 'admins',        label: 'Usuários',      icon: Shield,       adminTotal: true  },
  { id: 'unidades',      label: 'Unidades',      icon: Building2,    adminTotal: true  },
  { id: 'grade',         label: 'Grade',         icon: LayoutGrid,   adminTotal: true  },
]

export default function Cadastros() {
  const { profile } = useAuth()
  const isAdminTotal = profile?.acesso_total === true
  const TABS = TABS_BASE.filter(t => !t.adminTotal || isAdminTotal)
  const [abaAtiva, setAbaAtiva] = useState('motoristas')

  return (
    <AdminLayout title="Cadastros">
      {/* Tab bar */}
      <div className="bg-white border-b border-cobeb-border overflow-x-auto">
        <div className="flex min-w-max px-2">
          {TABS.map(({ id, label, icon: Icon }) => {
            const ativa = id === abaAtiva
            return (
              <button
                key={id}
                onClick={() => setAbaAtiva(id)}
                className={`flex items-center gap-1.5 px-4 py-3.5 text-xs font-semibold border-b-2 whitespace-nowrap transition-colors ${
                  ativa
                    ? 'text-cobeb-navy border-cobeb-navy'
                    : 'text-slate-500 border-transparent hover:text-slate-400'
                }`}
              >
                <Icon size={14} />
                {label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Conteúdo da aba — ErrorBoundary para capturar erros de render */}
      <ErrorBoundary>
        {abaAtiva === 'motoristas'    && <Motoristas />}
        {abaAtiva === 'conferentes'   && <Conferentes />}
        {abaAtiva === 'portaria'      && <Portaria />}
        {abaAtiva === 'empilhadeiras' && <Empilhadeiras />}
        {abaAtiva === 'carretas'      && <Carretas />}
        {abaAtiva === 'cavalos'       && <Cavalos />}
        {abaAtiva === 'admins'        && <Admins />}
        {abaAtiva === 'unidades'      && <Unidades />}
        {abaAtiva === 'grade'         && <Grade />}
      </ErrorBoundary>
    </AdminLayout>
  )
}
