import { Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import ProtectedRoute from './components/ProtectedRoute'
import ErrorBoundary from './components/ErrorBoundary'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Cadastros from './pages/Cadastros'
import Pedidos from './pages/Pedidos'
import Viagem from './pages/Viagem'
import Tarefas from './pages/Tarefas'
import Anomalias from './pages/Anomalias'
import Historico from './pages/Historico'
import CheckRecebimento from './pages/CheckRecebimento'
import PortariaPage from './pages/PortariaPage'
import Importacao from './pages/Importacao'
import PortariaAdmin from './pages/PortariaAdmin'
import SeletorModulo from './pages/SeletorModulo'
import EstoqueRealtime from './pages/EstoqueRealtime'
import AdminLayout from './components/AdminLayout'
import Dados from './pages/Dados'

const PERFIL_ROTA = {
  admin:      '/dashboard',
  motorista:  '/viagem',
  conferente: '/tarefas',
  portaria:   '/portaria',
  empilheira: '/estoque',
}

const MODO_ROTA = {
  admin:      '/dashboard',
  motorista:  '/viagem',
  conferente: '/tarefas',
  portaria:   '/portaria',
  empilheira: '/estoque',
  dados:      '/dados',
  cadastros:  '/cadastros',
}

function Spinner() {
  return (
    <div className="min-h-screen bg-[#EBF5FF] flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )
}

function AppRoutes() {
  const { user, profile, loading, modoVisao } = useAuth()

  if (loading) return <Spinner />

  let home = '/login'
  if (profile) {
    if (profile.acesso_total) {
      home = modoVisao ? (MODO_ROTA[modoVisao] ?? '/selecionar-modulo') : '/selecionar-modulo'
    } else {
      home = PERFIL_ROTA[profile.perfil] ?? '/login'
    }
  }

  return (
    <Routes>
      <Route
        path="/login"
        element={user && profile ? <Navigate to={home} replace /> : <Login />}
      />

      {/* Seletor de módulo — exclusivo para admin total, sem ProtectedRoute padrão */}
      <Route path="/selecionar-modulo" element={<SeletorModulo />} />

      <Route path="/dashboard"
        element={<ProtectedRoute allowedRoles={['admin']}><Dashboard /></ProtectedRoute>}
      />
      <Route path="/pedidos"
        element={<ProtectedRoute allowedRoles={['admin']}><Pedidos /></ProtectedRoute>}
      />
      <Route path="/cadastros"
        element={<ProtectedRoute allowedRoles={['admin']} requireAdminTotal><Cadastros /></ProtectedRoute>}
      />
      <Route path="/viagem"
        element={<ProtectedRoute allowedRoles={['motorista']}><Viagem /></ProtectedRoute>}
      />
      <Route path="/tarefas"
        element={<ProtectedRoute allowedRoles={['conferente']}><Tarefas /></ProtectedRoute>}
      />
      <Route path="/anomalias"
        element={<ProtectedRoute allowedRoles={['admin']}><Anomalias /></ProtectedRoute>}
      />
      <Route path="/historico"
        element={<ProtectedRoute allowedRoles={['admin']}><Historico /></ProtectedRoute>}
      />
      <Route path="/check-recebimento"
        element={<ProtectedRoute allowedRoles={['admin']}><CheckRecebimento /></ProtectedRoute>}
      />
      <Route path="/portaria"
        element={<ProtectedRoute allowedRoles={['portaria']}><PortariaPage /></ProtectedRoute>}
      />
      <Route path="/importacao"
        element={<ProtectedRoute allowedRoles={['admin']} requireAdminTotal><Importacao /></ProtectedRoute>}
      />
      <Route path="/portaria-admin"
        element={<ProtectedRoute allowedRoles={['admin']}><PortariaAdmin /></ProtectedRoute>}
      />
      <Route path="/estoque"
        element={<ProtectedRoute allowedRoles={['empilheira']}><EstoqueRealtime /></ProtectedRoute>}
      />
      <Route path="/painel-realtime"
        element={<ProtectedRoute allowedRoles={['admin']}><AdminLayout title="Painel Tempo Real"><EstoqueRealtime adminMode /></AdminLayout></ProtectedRoute>}
      />
      <Route path="/dados"
        element={<ProtectedRoute allowedRoles={['admin']}><Dados /></ProtectedRoute>}
      />

      <Route path="/"  element={<Navigate to={home} replace />} />
      <Route path="*"  element={<Navigate to={home} replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </ErrorBoundary>
  )
}
