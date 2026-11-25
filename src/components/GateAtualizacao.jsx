import { useState, useEffect } from 'react'
import { Download, RefreshCw } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { IS_NATIVE_APP } from '../hooks/useRastreamento'
import { VERSAO_APP, URL_APK_LATEST, versaoMenor } from '../lib/versaoApp'

/**
 * Atualização obrigatória do APK.
 *
 * Checa `app_versao.versao_minima` (SQL 128) no startup. Se o APK instalado for
 * ANTERIOR à mínima, troca TODA a tela por um bloqueio com botão de baixar a
 * versão nova — o motorista não acessa até atualizar. Assim ninguém precisa
 * cobrar instalação manual a cada release.
 *
 * Regras de segurança:
 * - Só no app nativo (`IS_NATIVE_APP`). No navegador, nunca bloqueia.
 * - Fail-open: qualquer erro/ausência de rede/sem linha no banco → libera.
 *   Nunca trancar um motorista por falha de rede.
 * - Não adiciona espera no startup: renderiza os filhos já, e só vira a tela
 *   de bloqueio se confirmar que está desatualizado.
 *
 * ⚠ Só vale para APKs que JÁ têm este gate (>= v1.0.40). Versões anteriores
 *   não têm como se autobloquear.
 */
export default function GateAtualizacao({ children }) {
  const [bloqueado, setBloqueado] = useState(false)

  useEffect(() => {
    if (!IS_NATIVE_APP) return
    let vivo = true
    supabase
      .from('app_versao')
      .select('versao_minima')
      .eq('id', 1)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!vivo || error) return
        if (versaoMenor(VERSAO_APP, data?.versao_minima)) setBloqueado(true)
      })
    return () => { vivo = false }
  }, [])

  if (!bloqueado) return children

  return (
    <div className="min-h-screen bg-[#EBF5FF] flex flex-col items-center justify-center px-6 text-center">
      <div className="w-16 h-16 rounded-2xl bg-cobeb-navy flex items-center justify-center mb-6">
        <RefreshCw size={32} className="text-white" />
      </div>
      <h1 className="text-cobeb-text text-xl font-bold mb-2">Atualização obrigatória</h1>
      <p className="text-slate-600 text-sm max-w-xs mb-1">
        Saiu uma versão nova do aplicativo. Para continuar, baixe e instale a
        atualização.
      </p>
      <p className="text-slate-400 text-xs mb-8">Sua versão: {VERSAO_APP}</p>

      <a
        href={URL_APK_LATEST}
        className="w-full max-w-xs bg-cobeb-navy hover:bg-cobeb-blue text-white font-bold py-4 rounded-xl text-base transition-colors flex items-center justify-center gap-3">
        <Download size={20} />Baixar atualização
      </a>

      <p className="text-slate-400 text-xs mt-6 max-w-xs">
        Após baixar, toque no arquivo para instalar. Se pedir, permita instalar
        de "fontes desconhecidas".
      </p>
    </div>
  )
}
