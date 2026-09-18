import { Forklift, LayoutGrid, LogOut } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useNavigate } from 'react-router-dom'

export default function OperadoresPage() {
  const { signOut, modoVisao, setModoVisao } = useAuth()
  const navigate = useNavigate()

  const handleSair = async () => {
    await signOut()
    navigate('/login', { replace: true })
  }

  return (
    <div className="min-h-screen bg-[#EBF5FF] flex flex-col">
      <header className="sticky top-0 z-40 bg-cobeb-navy px-3 py-3 sm:px-5 sm:py-4 flex items-center justify-between shadow-md shadow-cobeb-navy/20">
        <img
          src={`${import.meta.env.BASE_URL}logos/logo-cobeb-v2.png`}
          alt="COBEB Distribuidora"
          className="h-7 sm:h-9 w-auto object-contain"
          style={{ opacity: 0.92 }}
        />
        <div className="flex items-center gap-1">
          {modoVisao && (
            <button
              onClick={() => { setModoVisao(null); navigate('/selecionar-modulo') }}
              className="text-cobeb-yellow hover:text-white transition-colors p-1.5 rounded-lg hover:bg-white/10"
              title="Trocar Módulo"
            >
              <LayoutGrid size={18} />
            </button>
          )}
          <button
            onClick={handleSair}
            className="text-blue-300/70 hover:text-white transition-colors p-1.5 rounded-lg hover:bg-white/10"
            title="Sair"
          >
            <LogOut size={16} />
          </button>
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center px-5 pb-16">
        <div className="w-16 h-16 rounded-2xl bg-amber-500 flex items-center justify-center mb-5 shadow-lg shadow-amber-500/30">
          <Forklift size={30} className="text-white" />
        </div>
        <p className="text-cobeb-text font-bold text-lg mb-1">Operadores</p>
        <p className="text-slate-500 text-sm text-center max-w-xs leading-relaxed">
          Módulo em criação. Em breve as funcionalidades estarão disponíveis aqui.
        </p>
      </main>
    </div>
  )
}
