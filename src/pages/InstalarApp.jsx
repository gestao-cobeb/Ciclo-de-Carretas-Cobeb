import { useState } from 'react'
import { Download, CheckCircle, Smartphone, Wifi, ChevronRight } from 'lucide-react'

// Link fixo do GitHub — sempre aponta para a release mais nova automaticamente.
// O workflow publica cobeb-ciclo.apk com nome fixo em cada release para isso.
const APK_URL = 'https://github.com/gestao-cobeb/Ciclo-de-Carretas-Cobeb/releases/latest/download/cobeb-ciclo.apk'

const PASSOS = [
  { n: 1, texto: 'Toque em "Baixar" quando o Android perguntar' },
  { n: 2, texto: 'Abra o arquivo baixado (notificação ou pasta Downloads)' },
  { n: 3, texto: 'Permita "Instalar de fontes desconhecidas" se solicitado' },
  { n: 4, texto: 'Toque em Instalar e aguarde concluir' },
  { n: 5, texto: 'Abra o app COBEB Ciclo e faça login normalmente' },
]

export default function InstalarApp({ onContinuar }) {
  const [baixando, setBaixando] = useState(false)
  const [baixou,   setBaixou]   = useState(false)

  function dispararDownload() {
    if (!APK_URL) return
    setBaixando(true)
    const a = document.createElement('a')
    a.href     = APK_URL
    a.download = 'cobeb-ciclo.apk'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    setTimeout(() => { setBaixando(false); setBaixou(true) }, 1500)
  }

  return (
    <div className="min-h-screen bg-cobeb-navy flex flex-col">

      {/* Header */}
      <div className="flex flex-col items-center pt-12 pb-8 px-6 text-center">
        <div className="w-20 h-20 rounded-3xl bg-white/10 border border-white/20 flex items-center justify-center mb-5">
          <Smartphone size={36} className="text-white" />
        </div>
        <p className="text-white font-bold text-xl leading-tight">Instale o App COBEB</p>
        <p className="text-blue-300/80 text-sm mt-2 max-w-xs leading-relaxed">
          Para rastreamento automático em tempo real, o app nativo precisa estar instalado no seu celular.
        </p>
      </div>

      {/* Corpo */}
      <div className="flex-1 bg-[#EBF5FF] rounded-t-3xl px-5 pt-6 pb-10 space-y-5">

        {/* Botão de download */}
        {APK_URL ? (
          <div className="space-y-3">
            <button
              onClick={dispararDownload}
              disabled={baixando}
              className="w-full flex items-center justify-center gap-3 bg-cobeb-navy hover:bg-cobeb-blue disabled:opacity-60 text-white font-bold py-5 rounded-2xl text-base transition-colors"
            >
              {baixando ? (
                <><div className="w-5 h-5 border-2 border-white/40 border-t-white rounded-full animate-spin" />Baixando...</>
              ) : baixou ? (
                <><CheckCircle size={20} />Download concluído!</>
              ) : (
                <><Download size={20} />Baixar App COBEB Ciclo (.apk)</>
              )}
            </button>
          </div>
        ) : (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-4 flex items-start gap-3">
            <Wifi size={16} className="text-amber-500 mt-0.5 shrink-0" />
            <p className="text-amber-700 text-sm">
              O arquivo de instalação ainda não está disponível. Peça ao administrador o link do APK.
            </p>
          </div>
        )}

        {/* Passos de instalação */}
        <div className="bg-white rounded-2xl border border-cobeb-border overflow-hidden">
          <div className="px-4 py-3 border-b border-cobeb-border bg-[#EBF5FF]">
            <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-widest">
              Como instalar
            </p>
          </div>
          {PASSOS.map(p => (
            <div key={p.n} className="flex items-start gap-3 px-4 py-3 border-b border-cobeb-border/50 last:border-0">
              <div className="w-5 h-5 rounded-full bg-cobeb-navy text-white text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                {p.n}
              </div>
              <p className="text-cobeb-text text-sm leading-snug">{p.texto}</p>
            </div>
          ))}
        </div>

        {/* Separador */}
        <div className="flex items-center gap-3">
          <div className="flex-1 h-px bg-cobeb-border" />
          <span className="text-slate-400 text-xs">ou</span>
          <div className="flex-1 h-px bg-cobeb-border" />
        </div>

        {/* Continuar no navegador */}
        <button
          onClick={onContinuar}
          className="w-full flex items-center justify-between px-4 py-4 bg-white border border-cobeb-border rounded-2xl hover:border-cobeb-blue/40 transition-colors"
        >
          <div className="text-left">
            <p className="text-cobeb-text text-sm font-semibold">Continuar no navegador</p>
            <p className="text-slate-400 text-xs mt-0.5">Sem rastreamento automático em background</p>
          </div>
          <ChevronRight size={16} className="text-slate-400 shrink-0" />
        </button>

      </div>
    </div>
  )
}
