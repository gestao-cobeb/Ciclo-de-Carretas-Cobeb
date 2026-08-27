import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { carregarConfig } from './lib/config'
import './index.css'

const isNative = window.Capacitor?.isNativePlatform?.() === true
const basename = isNative ? '/' : (import.meta.env.VITE_BASE_URL ?? '/Ciclo-de-Carretas-Cobeb')

/**
 * A configuracao e' carregada ANTES do `App`, e o `App` entra por import
 * DINAMICO -- os dois detalhes sao o mesmo cuidado, e nenhum e' estilo.
 *
 * `src/lib/supabase.js` chama `createClient` no instante em que e' avaliado, e
 * ele e' avaliado no primeiro `import` que o alcanca. Com `import App from
 * './App'` estatico no topo, isso aconteceria ANTES da configuracao existir, e
 * o cliente nasceria com o endereco de compilacao. A tela abriria normalmente,
 * falando com o servidor errado, e nada na interface diria isso.
 *
 * ⚠ Sem `await` no nivel do modulo: o alvo do build e' es2020, que nao o tem.
 * O proprio `vite build` recusa -- e foi ele que pegou. Dai a funcao async.
 */
async function subir() {
  await carregarConfig()
  const { default: App } = await import('./App')
  ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
      <BrowserRouter basename={basename}>
        <App />
      </BrowserRouter>
    </React.StrictMode>
  )
}

subir().catch((e) => {
  /**
   * Falhar aqui e' raro, mas o sintoma padrao seria TELA BRANCA -- e tela
   * branca nao diz nada a quem esta' na portaria as 6h da manha. Um `catch`
   * silencioso aqui e' literalmente como o painel do Alo ficou dois meses
   * em branco sem ninguem saber por que.
   */
  console.error('[boot] o aplicativo nao subiu:', e)
  const raiz = document.getElementById('root')
  if (raiz) {
    raiz.innerHTML =
      '<div style="font:15px/1.6 system-ui,sans-serif;max-width:34rem;margin:18vh auto;'
      + 'padding:0 1.5rem;color:#1f2937">'
      + '<h1 style="font-size:1.15rem;margin:0 0 .6rem">O aplicativo nao conseguiu iniciar</h1>'
      + '<p style="margin:0 0 .6rem">Verifique a conexao e recarregue a pagina.</p>'
      + '<p style="margin:0;color:#6b7280;font-size:.85rem">Se continuar, avise a TI e '
      + 'informe esta mensagem: <code>' + String(e?.message ?? e).slice(0, 200) + '</code></p>'
      + '</div>'
  }
})
