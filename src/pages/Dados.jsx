import { Table2 } from 'lucide-react'
import AdminLayout from '../components/AdminLayout'

export default function Dados() {
  return (
    <AdminLayout title="Dados">
      <div className="flex flex-col items-center justify-center min-h-[55vh] gap-4 px-5">
        <div className="w-16 h-16 rounded-2xl bg-cobeb-navy/8 flex items-center justify-center">
          <Table2 size={32} className="text-cobeb-navy/30" />
        </div>
        <div className="text-center">
          <p className="text-slate-500 font-semibold text-sm">Em construção</p>
          <p className="text-slate-400 text-xs mt-1">As tabelas serão adicionadas em breve.</p>
        </div>
      </div>
    </AdminLayout>
  )
}
