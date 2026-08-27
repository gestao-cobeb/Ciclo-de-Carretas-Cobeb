import { createClient } from '@supabase/supabase-js'
import { config } from './config'

/**
 * O cliente do Supabase.
 *
 * O endereço vem do `config()` — lido em tempo de execução —, e NÃO mais de
 * `import.meta.env`. Ver `src/lib/config.js` para o porquê.
 *
 * ⚠ Este módulo é avaliado no primeiro `import`, e é aí que o `createClient`
 * congela o endereço. Por isso o `main.jsx` carrega a configuração ANTES de
 * importar o `App` — se importasse antes, o cliente nasceria com o valor de
 * compilação e nada denunciaria: a tela abriria e falaria com o servidor
 * errado.
 */
const { supabaseUrl, supabaseAnonKey } = config()

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
