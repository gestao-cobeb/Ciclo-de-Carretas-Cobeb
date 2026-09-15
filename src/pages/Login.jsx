import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Eye, EyeOff, Loader2, AlertCircle, ArrowLeft, CheckCircle2 } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'

const PERFIL_ROTA = {
  admin:      '/dashboard',
  motorista:  '/viagem',
  conferente: '/tarefas',
}

function LogoCobeb({ baseUrl }) {
  const [failed, setFailed] = useState(false)
  if (failed) {
    return (
      <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-cobeb-navy to-cobeb-blue flex items-center justify-center mb-4 shadow-2xl shadow-cobeb-navy/30">
        <span className="text-white text-3xl font-black tracking-tighter select-none">CB</span>
      </div>
    )
  }
  return (
    <img
      src={`${baseUrl}logos/logo-cobeb-transparent.png`}
      alt="COBEB Distribuidora"
      className="h-40 sm:h-44 md:h-52 w-auto object-contain mb-1"
      style={{ filter: 'brightness(0) invert(1)', opacity: 0.95 }}
      onError={() => setFailed(true)}
    />
  )
}

function TruckSceneBg() {
  return (
    <svg
      className="absolute inset-0 w-full h-full"
      viewBox="0 0 1440 900"
      preserveAspectRatio="xMidYMid slice"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      {/* Gradient background */}
      <defs>
        <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#C7DEFF" />
          <stop offset="50%" stopColor="#EBF5FF" />
          <stop offset="100%" stopColor="#D9ECFF" />
        </linearGradient>
        <linearGradient id="roadGrad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#C9D8EF" stopOpacity="0" />
          <stop offset="20%" stopColor="#B8CCE8" stopOpacity="1" />
          <stop offset="80%" stopColor="#B8CCE8" stopOpacity="1" />
          <stop offset="100%" stopColor="#C9D8EF" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="truckGrad" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#003DA5" stopOpacity="0.13" />
          <stop offset="100%" stopColor="#003DA5" stopOpacity="0.07" />
        </linearGradient>
        <linearGradient id="cabGrad" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#003DA5" stopOpacity="0.18" />
          <stop offset="100%" stopColor="#003DA5" stopOpacity="0.10" />
        </linearGradient>
        <filter id="blur1">
          <feGaussianBlur stdDeviation="2" />
        </filter>
      </defs>

      <rect width="1440" height="900" fill="url(#bgGrad)" />

      {/* Diagonal speed lines (top left corner accent) */}
      {[0,1,2,3,4].map(i => (
        <line key={i}
          x1={-40 + i * 60} y1="0"
          x2={200 + i * 60} y2="300"
          stroke="#003DA5" strokeOpacity="0.04" strokeWidth="60"
        />
      ))}

      {/* === ROAD BAND === */}
      <rect x="0" y="490" width="1440" height="130" fill="url(#roadGrad)" rx="2" />

      {/* Road center dashes */}
      {Array.from({ length: 20 }).map((_, i) => (
        <rect key={i}
          x={i * 80} y="552" width="50" height="8"
          fill="#003DA5" fillOpacity="0.12" rx="4"
        />
      ))}

      {/* Road top edge line */}
      <line x1="0" y1="492" x2="1440" y2="492" stroke="#003DA5" strokeOpacity="0.10" strokeWidth="2" />
      {/* Road bottom edge line */}
      <line x1="0" y1="618" x2="1440" y2="618" stroke="#003DA5" strokeOpacity="0.10" strokeWidth="2" />

      {/* === TRUCK 1 — carreta de puxada grande (posição central-direita) === */}
      {/* Trailer body */}
      <rect x="680" y="496" width="480" height="90" fill="url(#truckGrad)" rx="6" />
      {/* Trailer ribbing lines */}
      {[0,1,2,3,4,5,6,7,8].map(i => (
        <line key={i}
          x1={690 + i * 52} y1="500"
          x2={690 + i * 52} y2="582"
          stroke="#003DA5" strokeOpacity="0.07" strokeWidth="1.5"
        />
      ))}
      {/* Trailer top stripe yellow */}
      <rect x="680" y="496" width="480" height="10" fill="#FFB81C" fillOpacity="0.20" rx="4" />
      {/* Trailer bottom reflector stripe */}
      <rect x="680" y="576" width="480" height="6" fill="#FFB81C" fillOpacity="0.15" rx="2" />
      {/* Trailer rear door lines */}
      <line x1="1156" y1="500" x2="1156" y2="582" stroke="#003DA5" strokeOpacity="0.15" strokeWidth="3" />
      {/* Trailer hitch */}
      <rect x="665" y="546" width="20" height="10" fill="#003DA5" fillOpacity="0.15" rx="3" />

      {/* Cab body */}
      <rect x="560" y="502" width="118" height="84" fill="url(#cabGrad)" rx="8" />
      {/* Cab roof aero */}
      <path d="M560 502 Q560 488 574 484 L658 480 Q672 479 678 490 L678 502 Z"
        fill="#003DA5" fillOpacity="0.12" />
      {/* Cab windshield */}
      <rect x="568" y="506" width="68" height="38" fill="#003DA5" fillOpacity="0.08" rx="4" />
      {/* Cab windshield divider */}
      <line x1="602" y1="506" x2="602" y2="544" stroke="#003DA5" strokeOpacity="0.10" strokeWidth="1.5" />
      {/* Cab exhaust stack */}
      <rect x="640" y="470" width="7" height="30" fill="#003DA5" fillOpacity="0.10" rx="3" />
      {/* Truck wheels */}
      {[590, 630, 730, 820, 930, 1060, 1110].map((cx, i) => (
        <g key={i}>
          <circle cx={cx} cy="590" r="18" fill="#003DA5" fillOpacity="0.12" />
          <circle cx={cx} cy="590" r="10" fill="#EBF5FF" fillOpacity="0.6" />
          <circle cx={cx} cy="590" r="4" fill="#003DA5" fillOpacity="0.12" />
        </g>
      ))}

      {/* === TRUCK 2 — carreta menor ao fundo (posição esquerda) === */}
      <rect x="-60" y="508" width="320" height="68" fill="#003DA5" fillOpacity="0.06" rx="5" />
      <rect x="-60" y="508" width="320" height="8" fill="#FFB81C" fillOpacity="0.12" rx="3" />
      <rect x="258" y="514" width="75" height="62" fill="#003DA5" fillOpacity="0.08" rx="6" />
      {[0, 60, 150, 240].map((cx, i) => (
        <circle key={i} cx={cx} cy="580" r="14" fill="#003DA5" fillOpacity="0.08" />
      ))}

      {/* === WAREHOUSE / FABRICA — right side === */}
      <g opacity="0.08">
        {/* Building main */}
        <rect x="1280" y="370" width="180" height="130" fill="#003DA5" rx="4" />
        {/* Roof triangle */}
        <polygon points="1270,370 1370,320 1470,370" fill="#003DA5" />
        {/* Door */}
        <rect x="1340" y="448" width="60" height="52" fill="#EBF5FF" rx="3" />
        {/* Windows */}
        {[0,1,2].map(i => (
          <rect key={i} x={1296 + i * 50} y="390" width="32" height="24" fill="#EBF5FF" rx="2" />
        ))}
        {/* Chimney */}
        <rect x="1400" y="330" width="16" height="42" fill="#003DA5" rx="3" />
        <circle cx="1408" cy="326" r="8" fill="#003DA5" />
      </g>

      {/* === FLOW ARROWS === */}
      {[200, 420, 640, 860].map((x, i) => (
        <g key={i} opacity="0.12">
          <line x1={x} y1="460" x2={x + 80} y2="460" stroke="#003DA5" strokeWidth="2" />
          <polygon points={`${x+80},455 ${x+96},460 ${x+80},465`} fill="#003DA5" />
        </g>
      ))}

      {/* === DISTANCE MARKERS === */}
      {[140, 380, 620, 860, 1100].map((x, i) => (
        <g key={i} opacity="0.08">
          <rect x={x} y="630" width="2" height="16" fill="#003DA5" />
          <rect x={x - 6} y="630" width="14" height="2" fill="#003DA5" />
        </g>
      ))}

      {/* Decorative dots / nodes */}
      {[
        [140, 460], [380, 460], [620, 460], [860, 460], [1100, 460],
      ].map(([cx, cy], i) => (
        <g key={i}>
          <circle cx={cx} cy={cy} r="6" fill="#003DA5" fillOpacity="0.15" />
          <circle cx={cx} cy={cy} r="3" fill="#FFB81C" fillOpacity="0.25" />
        </g>
      ))}

      {/* Top-right corner decorative rings */}
      <circle cx="1340" cy="120" r="90" stroke="#003DA5" strokeOpacity="0.05" strokeWidth="24" fill="none" />
      <circle cx="1340" cy="120" r="140" stroke="#003DA5" strokeOpacity="0.03" strokeWidth="16" fill="none" />

      {/* Bottom-left corner decorative rings */}
      <circle cx="100" cy="800" r="80" stroke="#003DA5" strokeOpacity="0.05" strokeWidth="20" fill="none" />
      <circle cx="100" cy="800" r="130" stroke="#003DA5" strokeOpacity="0.03" strokeWidth="12" fill="none" />
    </svg>
  )
}

export default function Login() {
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [loading, setLoading]   = useState(false)
  const [erro, setErro]         = useState('')

  // view: 'login' | 'esqueci' | 'primeiro_acesso'
  const [view, setView]           = useState('login')
  const [novaSenha, setNovaSenha] = useState('')
  const [confirmar, setConfirmar] = useState('')
  const [showNova, setShowNova]   = useState(false)
  const [showConf, setShowConf]   = useState(false)
  const [resetLoading, setResetLoading] = useState(false)
  const [resetErro, setResetErro] = useState('')

  const { signIn, profile } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    if (!profile) return
    if (profile.primeiro_acesso) {
      setView('primeiro_acesso')
    } else {
      navigate(PERFIL_ROTA[profile.perfil] ?? '/login', { replace: true })
    }
  }, [profile, navigate])

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!email.trim() || !password) { setErro('Preencha o acesso e a senha.'); return }
    setLoading(true); setErro('')
    const digits = email.trim().replace(/\D/g, '')
    const emailLogin = (!email.trim().includes('@') && digits.length === 11)
      ? `${digits}@motorista.cobeb.com.br`
      : email.trim()
    const { error } = await signIn(emailLogin, password)
    if (error) { setErro('Acesso ou senha inválidos. Verifique e tente novamente.'); setLoading(false) }
  }

  const handleNovaSenha = async (e) => {
    e.preventDefault()
    if (novaSenha.length < 6) { setResetErro('Mínimo 6 caracteres.'); return }
    if (novaSenha !== confirmar) { setResetErro('As senhas não coincidem.'); return }
    setResetLoading(true); setResetErro('')
    const { error } = await supabase.auth.updateUser({ password: novaSenha })
    if (error) { setResetErro('Erro: ' + error.message); setResetLoading(false); return }
    await supabase.from('profiles').update({ primeiro_acesso: false }).eq('id', profile.id)
    setResetLoading(false)
    navigate(PERFIL_ROTA[profile.perfil] ?? '/login', { replace: true })
  }

  const base = import.meta.env.BASE_URL

  return (
    <div className="min-h-[100dvh] relative flex flex-col items-center justify-center px-5 py-4 sm:py-8 overflow-y-auto">

      {/* Foto real do galpão Ambev como fundo */}
      <div
        className="absolute inset-0 bg-cover bg-center bg-no-repeat"
        style={{ backgroundImage: `url(${base}bg-login.jpg)` }}
      />

      {/* Overlay azul COBEB para legibilidade e identidade de marca */}
      <div className="absolute inset-0 bg-gradient-to-b from-cobeb-navy/85 via-cobeb-navy/70 to-cobeb-navy/90" />

      <div className="relative z-10 w-full max-w-[380px]">

        {/* Logotipo — sem espaço excessivo */}
        <div className="flex flex-col items-center mb-3 sm:mb-5">
          <LogoCobeb baseUrl={base} />
          <p className="text-white/80 text-sm tracking-[0.3em] uppercase font-semibold -mt-1">
            Ciclo de Carretas
          </p>
        </div>

        {/* Card */}
        <div className="bg-white/95 backdrop-blur-sm rounded-2xl p-4 sm:p-6 border border-white/20 shadow-2xl shadow-black/30">

          {/* ── VIEW: LOGIN ── */}
          {view === 'login' && (
            <>
              <p className="text-slate-500 text-sm mb-6 leading-relaxed">
                Entre com suas credenciais para acessar o sistema.
              </p>
              <form onSubmit={handleSubmit} noValidate className="space-y-4">
                <div className="space-y-1.5">
                  <label className="block text-cobeb-navy/60 text-[11px] font-semibold uppercase tracking-widest">Email / CPF</label>
                  <input type="text" value={email} onChange={e => { setEmail(e.target.value); setErro('') }}
                    placeholder="Email ou CPF do motorista" autoComplete="username" autoCapitalize="none" inputMode="email"
                    className="w-full bg-[#F5F9FF] border border-cobeb-border rounded-xl px-4 py-3.5 text-cobeb-text text-sm placeholder-blue-200 focus:outline-none focus:border-cobeb-blue focus:ring-2 focus:ring-cobeb-blue/20 transition-all" />
                </div>
                <div className="space-y-1.5">
                  <label className="block text-cobeb-navy/60 text-[11px] font-semibold uppercase tracking-widest">Senha</label>
                  <div className="relative">
                    <input type={showPass ? 'text' : 'password'} value={password}
                      onChange={e => { setPassword(e.target.value); setErro('') }}
                      placeholder="••••••••" autoComplete="current-password"
                      className="w-full bg-[#F5F9FF] border border-cobeb-border rounded-xl px-4 py-3.5 pr-12 text-cobeb-text text-sm placeholder-blue-200 focus:outline-none focus:border-cobeb-blue focus:ring-2 focus:ring-cobeb-blue/20 transition-all" />
                    <button type="button" onClick={() => setShowPass(!showPass)} tabIndex={-1}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-cobeb-navy transition-colors">
                      {showPass ? <EyeOff size={17} /> : <Eye size={17} />}
                    </button>
                  </div>
                </div>
                {erro && (
                  <div className="flex items-start gap-2.5 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
                    <AlertCircle size={15} className="text-red-500 mt-0.5 shrink-0" />
                    <p className="text-red-600 text-sm">{erro}</p>
                  </div>
                )}
                <button type="submit" disabled={loading}
                  className="w-full bg-cobeb-navy hover:bg-cobeb-blue disabled:opacity-60 disabled:cursor-not-allowed text-white font-semibold py-3.5 rounded-xl transition-all flex items-center justify-center gap-2 text-sm shadow-lg shadow-cobeb-navy/25 mt-1">
                  {loading ? <><Loader2 size={16} className="animate-spin" />Entrando…</> : 'Entrar'}
                </button>
                <button type="button" onClick={() => setView('esqueci')}
                  className="w-full text-cobeb-navy/60 hover:text-cobeb-navy text-xs font-medium transition-colors pt-1">
                  Esqueceu sua senha?
                </button>
              </form>
            </>
          )}

          {/* ── VIEW: ESQUECI A SENHA ── */}
          {view === 'esqueci' && (
            <>
              <button onClick={() => setView('login')} className="flex items-center gap-1.5 text-cobeb-navy/60 hover:text-cobeb-navy text-xs font-medium mb-4 transition-colors">
                <ArrowLeft size={14} /> Voltar
              </button>
              <h3 className="text-cobeb-text font-semibold text-base mb-1">Esqueceu sua senha?</h3>
              <p className="text-slate-500 text-sm mt-3 leading-relaxed">
                Entre em contato com o administrador do sistema para redefinir sua senha de acesso.
              </p>
              <a href="mailto:victor.soares@cobeb.com.br"
                className="mt-4 flex items-center justify-center gap-2 w-full bg-cobeb-navy hover:bg-cobeb-blue text-white font-semibold py-3.5 rounded-xl transition-all text-sm">
                victor.soares@cobeb.com.br
              </a>
              <button onClick={() => setView('login')} className="w-full text-cobeb-navy/60 hover:text-cobeb-navy text-xs font-medium transition-colors pt-3">
                Voltar ao login
              </button>
            </>
          )}

          {/* ── VIEW: PRIMEIRO ACESSO ── */}
          {view === 'primeiro_acesso' && (
            <>
              <div className="flex items-center gap-2 mb-1">
                <CheckCircle2 size={18} className="text-cobeb-navy shrink-0" />
                <h3 className="text-cobeb-text font-semibold text-base">Bem-vindo!</h3>
              </div>
              <p className="text-slate-500 text-sm mt-1 mb-4 leading-relaxed">
                Este é seu primeiro acesso. Por segurança, defina uma senha pessoal antes de continuar.
              </p>
              <form onSubmit={handleNovaSenha} noValidate className="space-y-4">
                <div className="space-y-1.5">
                  <label className="block text-cobeb-navy/60 text-[11px] font-semibold uppercase tracking-widest">Nova senha</label>
                  <div className="relative">
                    <input type={showNova ? 'text' : 'password'} value={novaSenha}
                      onChange={e => { setNovaSenha(e.target.value); setResetErro('') }}
                      placeholder="Mínimo 6 caracteres" autoFocus
                      className="w-full bg-[#F5F9FF] border border-cobeb-border rounded-xl px-4 py-3.5 pr-12 text-cobeb-text text-sm placeholder-blue-200 focus:outline-none focus:border-cobeb-blue focus:ring-2 focus:ring-cobeb-blue/20 transition-all" />
                    <button type="button" onClick={() => setShowNova(!showNova)} tabIndex={-1}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-cobeb-navy transition-colors">
                      {showNova ? <EyeOff size={17} /> : <Eye size={17} />}
                    </button>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="block text-cobeb-navy/60 text-[11px] font-semibold uppercase tracking-widest">Confirmar senha</label>
                  <div className="relative">
                    <input type={showConf ? 'text' : 'password'} value={confirmar}
                      onChange={e => { setConfirmar(e.target.value); setResetErro('') }}
                      placeholder="Repita a nova senha"
                      className="w-full bg-[#F5F9FF] border border-cobeb-border rounded-xl px-4 py-3.5 pr-12 text-cobeb-text text-sm placeholder-blue-200 focus:outline-none focus:border-cobeb-blue focus:ring-2 focus:ring-cobeb-blue/20 transition-all" />
                    <button type="button" onClick={() => setShowConf(!showConf)} tabIndex={-1}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-cobeb-navy transition-colors">
                      {showConf ? <EyeOff size={17} /> : <Eye size={17} />}
                    </button>
                  </div>
                </div>
                {resetErro && (
                  <div className="flex items-start gap-2.5 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
                    <AlertCircle size={15} className="text-red-500 mt-0.5 shrink-0" />
                    <p className="text-red-600 text-sm">{resetErro}</p>
                  </div>
                )}
                <button type="submit" disabled={resetLoading}
                  className="w-full bg-cobeb-navy hover:bg-cobeb-blue disabled:opacity-60 text-white font-semibold py-3.5 rounded-xl transition-all flex items-center justify-center gap-2 text-sm">
                  {resetLoading ? <><Loader2 size={16} className="animate-spin" />Salvando…</> : 'Definir senha e entrar'}
                </button>
              </form>
            </>
          )}

        </div>

        {/* Rodapé com logo Ambev */}
        <div className="flex flex-col items-center mt-4 sm:mt-6 gap-2">
          <p className="text-white/40 text-[10px] font-semibold uppercase tracking-widest">
            Distribuidora Oficial
          </p>
          <img
            src={`${base}logos/logo-ambev.png`}
            alt="Ambev"
            className="h-6 object-contain"
            style={{ filter: 'brightness(0) invert(1)', opacity: 0.35 }}
            onError={(e) => { e.target.style.display = 'none' }}
          />
        </div>

      </div>
    </div>
  )
}
