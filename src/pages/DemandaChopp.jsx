import { Beer, LogOut, LayoutGrid } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

export default function DemandaChopp() {
  const { signOut, modoVisao, setModoVisao } = useAuth()
  const navigate = useNavigate()

  return (
    <div className="min-h-screen bg-[#EBF5FF]">

      {/* Header */}
      <header className="sticky top-0 z-40 bg-cobeb-navy border-b border-blue-800 px-3 py-2 sm:px-5 sm:py-3.5 flex items-center justify-between shadow-md shadow-cobeb-navy/20">
        <div className="flex items-center gap-2 min-w-0">
          <Beer size={16} className="text-yellow-400 shrink-0" />
          <p className="text-white text-sm font-semibold truncate">Demanda de Chopp</p>
        </div>
        <div className="flex items-center gap-1">
          {modoVisao && (
            <button onClick={() => { setModoVisao(null); navigate('/selecionar-modulo') }}
              className="text-cobeb-yellow hover:text-white transition-colors p-1.5 rounded-lg hover:bg-white/10"
              title="Trocar Módulo">
              <LayoutGrid size={16} />
            </button>
          )}
          <button onClick={signOut}
            className="text-blue-300/70 hover:text-white transition-colors p-1.5 rounded-lg hover:bg-white/10"
            title="Sair">
            <LogOut size={16} />
          </button>
        </div>
      </header>

      {/* Body */}
      <main className="max-w-lg mx-auto px-4 pt-8 pb-8">
        <div className="bg-white border border-cobeb-border rounded-2xl p-8 text-center">
          <div className="w-14 h-14 rounded-2xl bg-yellow-500 flex items-center justify-center mx-auto mb-4 shadow-lg shadow-yellow-500/30">
            <Beer size={26} className="text-white" />
          </div>
          <p className="text-cobeb-text font-bold text-base">Demanda de Chopp</p>
          <p className="text-slate-500 text-sm mt-2 leading-relaxed">
            Acompanhamento da demanda e do volume puxado de chopp por semana.
          </p>
          <p className="text-slate-400 text-xs mt-4">
            Módulo pronto — gestão em configuração.
          </p>
        </div>
      </main>
    </div>
  )
}
