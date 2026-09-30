import { useState } from 'react'
import { X, ChevronLeft, ChevronRight, AlertTriangle } from 'lucide-react'
import { supabase } from '../lib/supabase'

const TIPO_DIA_LABEL = { SEMANA: 'Semana (Seg–Sex)', SÁBADO: 'Sábado', DOMINGO: 'Domingo' }

// noRevendaBack: quando true oculta o botão "Voltar" para seleção de revenda
//   (usado no painel admin onde a revenda já está pré-selecionada e não deve mudar aqui)
export default function ModalAgendamento({ unidades, onConfirmar, onCancelar, unidadePreSelecionada, noRevendaBack = false }) {
  const [step, setStep]             = useState(unidadePreSelecionada ? 'data' : 'revenda')
  const [revendaSel, setRevendaSel] = useState(unidadePreSelecionada ?? null)
  const [dataSel, setDataSel]       = useState('')
  const [tipoDia, setTipoDia]       = useState('')
  const [blocos, setBlocos]         = useState([])
  const [vagasUsadas, setVagasUsadas] = useState({})
  const [carregando, setCarregando] = useState(false)
  const [confirmando, setConfirmando] = useState(false)

  function calcTipoDia(dateStr) {
    const dow = new Date(dateStr + 'T12:00:00').getDay()
    if (dow === 0) return 'DOMINGO'
    if (dow === 6) return 'SÁBADO'
    return 'SEMANA'
  }

  async function carregarBlocos(revenda, date) {
    const tipo = calcTipoDia(date)
    setTipoDia(tipo)
    setCarregando(true)

    const { data: rows } = await supabase
      .from('grade_horarios')
      .select('id, bloco, status, motivo_criticidade, vagas, revenda_id')
      .eq('revenda_id', revenda.id)
      .eq('tipo_dia', tipo)
      .order('bloco')

    const disponiveis = (rows ?? []).filter(r => r.motivo_criticidade !== 'SEM ESCALA')

    const gradeIds = disponiveis.map(r => r.id)
    let usadas = {}
    if (gradeIds.length) {
      const { data: ags } = await supabase
        .from('agendamentos')
        .select('grade_id')
        .in('grade_id', gradeIds)
        .eq('data_agendamento', date)
        .neq('status', 'cancelado')
      ;(ags ?? []).forEach(a => { usadas[a.grade_id] = (usadas[a.grade_id] ?? 0) + 1 })
    }

    setBlocos(disponiveis)
    setVagasUsadas(usadas)
    setCarregando(false)
    setStep('blocos')
  }

  async function confirmar(bloco) {
    setConfirmando(true)
    await onConfirmar({
      revendaId:       revendaSel.id,
      gradeId:         bloco.id,
      dataAgendamento: dataSel,
      tipoDia,
      bloco:           bloco.bloco,
      revenda:         revendaSel,
    })
    setConfirmando(false)
  }

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-end">
      <div className="w-full max-w-lg mx-auto bg-white rounded-t-3xl flex flex-col" style={{ maxHeight: '90vh' }}>

        {/* Handle + header */}
        <div className="px-6 pt-5 pb-4 border-b border-cobeb-border shrink-0">
          <div className="w-10 h-1 bg-cobeb-border rounded-full mx-auto mb-4" />
          <div className="flex items-center justify-between">
            <div>
              <p className="text-cobeb-text font-semibold text-base">Agendar Horário</p>
              <p className="text-slate-500 text-xs mt-0.5">
                {step === 'revenda' && 'Selecione a revenda de destino'}
                {step === 'data'    && revendaSel?.nome}
                {step === 'blocos'  && `${revendaSel?.nome} · ${new Date(dataSel + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' })}`}
              </p>
            </div>
            <button onClick={onCancelar} className="p-2 text-slate-400 hover:text-slate-600 transition-colors">
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="overflow-y-auto flex-1 p-4 space-y-3">

          {/* Step: revenda */}
          {step === 'revenda' && (
            <>
              {unidades.map(u => (
                <button key={u.id} onClick={() => { setRevendaSel(u); setStep('data') }}
                  className="w-full flex items-center justify-between px-4 py-3.5 rounded-2xl border border-cobeb-border bg-white hover:border-cobeb-blue hover:bg-cobeb-navy/5 transition-all text-left">
                  <div>
                    <p className="text-cobeb-text text-sm font-semibold">{u.nome}</p>
                    <p className="text-slate-500 text-xs mt-0.5">{u.cidade}</p>
                  </div>
                  <ChevronRight size={16} className="text-slate-400" />
                </button>
              ))}
              {!unidades.length && <p className="text-slate-400 text-sm text-center py-6">Nenhuma revenda cadastrada</p>}
            </>
          )}

          {/* Step: data */}
          {step === 'data' && (
            <div className="space-y-4">
              <div>
                <label className="block text-slate-500 text-[11px] font-semibold uppercase tracking-widest mb-1.5">
                  Data de chegada prevista
                </label>
                <input
                  type="date"
                  value={dataSel}
                  min={new Date().toISOString().slice(0, 10)}
                  onChange={e => setDataSel(e.target.value)}
                  className="w-full bg-[#EBF5FF] border border-cobeb-border rounded-xl px-4 py-3 text-cobeb-text text-sm focus:outline-none focus:border-cobeb-blue"
                />
                {dataSel && (
                  <p className="text-slate-500 text-xs mt-2">
                    Tipo de dia: <span className="font-semibold text-cobeb-navy">{TIPO_DIA_LABEL[calcTipoDia(dataSel)]}</span>
                  </p>
                )}
              </div>
              <div className="flex gap-3">
                {!noRevendaBack && (
                  <button onClick={() => setStep('revenda')} className="flex-1 bg-[#EBF5FF] border border-cobeb-border text-slate-500 font-semibold py-3.5 rounded-xl text-sm">
                    Voltar
                  </button>
                )}
                <button
                  onClick={() => carregarBlocos(revendaSel, dataSel)}
                  disabled={!dataSel || carregando}
                  className="flex-1 bg-cobeb-navy hover:bg-cobeb-blue disabled:opacity-50 text-white font-semibold py-3.5 rounded-xl text-sm transition-colors flex items-center justify-center gap-2">
                  {carregando
                    ? <><div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />Carregando...</>
                    : 'Ver Horários'}
                </button>
              </div>
            </div>
          )}

          {/* Step: blocos */}
          {step === 'blocos' && (
            <>
              <button onClick={() => setStep('data')} className="flex items-center gap-1.5 text-slate-400 text-xs mb-1 hover:text-cobeb-navy transition-colors">
                <ChevronLeft size={13} />Alterar data
              </button>

              {blocos.length === 0 && !carregando && (
                <p className="text-slate-400 text-sm text-center py-6">Nenhum horário disponível para essa data na grade.</p>
              )}

              {blocos.map(b => {
                const usadas  = vagasUsadas[b.id] ?? 0
                const cheio   = usadas >= b.vagas
                const critico = b.status === 'CRÍTICO'
                return (
                  <div key={b.id} className={`rounded-2xl border p-4 space-y-2 ${cheio ? 'opacity-40 bg-slate-50 border-cobeb-border' : critico ? 'border-amber-300 bg-amber-50' : 'border-cobeb-border bg-white'}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-cobeb-text font-mono font-bold text-sm">{b.bloco}</p>
                        <p className="text-slate-500 text-xs mt-0.5">
                          {cheio ? 'Vagas esgotadas' : `${b.vagas - usadas} de ${b.vagas} vaga${b.vagas > 1 ? 's' : ''} disponível`}
                        </p>
                      </div>
                      {critico && !cheio && (
                        <span className="bg-amber-100 text-amber-700 text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0">CRÍTICO</span>
                      )}
                      {cheio && (
                        <span className="bg-slate-100 text-slate-400 text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0">LOTADO</span>
                      )}
                    </div>
                    {critico && b.motivo_criticidade && !cheio && (
                      <div className="flex items-start gap-1.5 bg-amber-100/60 rounded-lg px-2 py-1.5">
                        <AlertTriangle size={11} className="text-amber-600 shrink-0 mt-0.5" />
                        <p className="text-amber-700 text-[11px]">{b.motivo_criticidade}</p>
                      </div>
                    )}
                    {!cheio && (
                      <button
                        onClick={() => confirmar(b)}
                        disabled={confirmando}
                        className="w-full bg-cobeb-navy hover:bg-cobeb-blue disabled:opacity-50 text-white font-semibold py-3 rounded-xl text-sm transition-colors flex items-center justify-center gap-2">
                        {confirmando
                          ? <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                          : 'Confirmar este horário'}
                      </button>
                    )}
                  </div>
                )
              })}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
