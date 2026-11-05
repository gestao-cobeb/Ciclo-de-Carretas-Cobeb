import { RotateCcw } from 'lucide-react'
import AdminLayout from '../components/AdminLayout'

export default function Retrabalho() {
  return (
    <AdminLayout title="Retrabalho">
      <div className="flex flex-col items-center justify-center min-h-[60vh] px-6 text-center">
        <div className="w-16 h-16 rounded-2xl bg-purple-600/10 border border-purple-600/20 flex items-center justify-center mb-5">
          <RotateCcw size={28} className="text-purple-600" />
        </div>
        <p className="text-cobeb-text font-bold text-lg mb-2">Retrabalho</p>
        <p className="text-slate-500 text-sm max-w-xs leading-relaxed">
          Este módulo receberá os paletes encaminhados para retrabalho durante a blitz de puxada.
          A funcionalidade está em desenvolvimento.
        </p>
      </div>
    </AdminLayout>
  )
}
