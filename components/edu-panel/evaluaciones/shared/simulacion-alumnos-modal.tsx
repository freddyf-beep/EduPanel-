"use client"

import { useState } from "react"
import { apiFetch } from "@/lib/api-client"
import {
  Sparkles, Loader2, Award, AlertTriangle,
  CheckCircle2, X, Clock, HelpCircle, ArrowRight, RefreshCw
} from "lucide-react"

interface ErrorCometido {
  item: string
  causa: string
}

interface SimulacionEstudiante {
  alumno: string
  perfil: string
  notaEstimada: number
  tiempoEstimadoMinutos: number
  erroresCometidos: ErrorCometido[]
  comentarioComprension: string
}

interface SimulacionResult {
  indiceClaridad: number
  diagnosticoGeneral: string
  simulaciones: SimulacionEstudiante[]
  recomendaciones: string[]
}

interface SimulacionAlumnosModalProps {
  isOpen: boolean
  onClose: () => void
  documento: Record<string, any>
  tipo: "prueba" | "guia"
}

export function SimulacionAlumnosModal({
  isOpen,
  onClose,
  documento,
  tipo
}: SimulacionAlumnosModalProps) {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<SimulacionResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  if (!isOpen) return null

  const handleSimulate = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await apiFetch("/api/simular-alumnos", {
        method: "POST",
        body: JSON.stringify({
          documento,
          tipo
        })
      })

      if (!res.ok) {
        const errorData = await res.json()
        throw new Error(errorData.error || "Error al generar la simulación.")
      }

      const data = await res.json()
      setResult(data)
    } catch (err: any) {
      console.error(err)
      setError(err.message || "Error al conectar con la simulación.")
    } finally {
      setLoading(false)
    }
  }

  const getNotaColor = (nota: number) => {
    if (nota >= 6.0) return "text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/20"
    if (nota >= 4.0) return "text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/20"
    return "text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/20"
  }

  const getClaridadColor = (score: number) => {
    if (score >= 85) return "text-emerald-600 border-emerald-500/20 bg-emerald-50/50 dark:bg-emerald-950/10"
    if (score >= 70) return "text-amber-600 border-amber-500/20 bg-amber-50/50 dark:bg-amber-950/10"
    return "text-red-600 border-red-500/20 bg-red-50/50 dark:bg-red-950/10"
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-card border border-border w-full max-w-5xl rounded-[18px] shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-indigo-500" />
            <h2 className="font-extrabold text-lg">Testeador de Alumnos Simulados (IA)</h2>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 flex-1 overflow-y-auto space-y-6">
          {!result && !loading && (
            <div className="py-12 text-center max-w-lg mx-auto space-y-4">
              <div className="w-16 h-16 rounded-2xl bg-indigo-50 dark:bg-indigo-950/20 text-indigo-500 flex items-center justify-center mx-auto shadow-sm">
                <HelpCircle className="w-8 h-8" />
              </div>
              <h3 className="font-bold text-lg">¿Cómo responderán tus alumnos?</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Antes de imprimir la evaluación, simula las respuestas de 3 perfiles típicos de alumnos (Destacado, Promedio, y con TDAH/PIE) para detectar preguntas redactadas con ambigüedad o sobrecarga visual.
              </p>
              <button
                onClick={handleSimulate}
                className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-6 py-3 rounded-xl flex items-center gap-2 mx-auto shadow-md transition-colors"
              >
                <Sparkles className="w-4 h-4" />
                Iniciar Simulación IA
              </button>
            </div>
          )}

          {loading && (
            <div className="py-20 text-center space-y-4">
              <Loader2 className="w-12 h-12 animate-spin mx-auto text-indigo-500" />
              <div className="font-bold text-base">Alumnos resolviendo la evaluación...</div>
              <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                Gemini está analizando la prueba y ejecutando la simulación cognitiva del comportamiento de Mateo, Sofía y Lucas.
              </p>
            </div>
          )}

          {error && (
            <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 p-4 rounded-xl flex gap-3 text-red-800 dark:text-red-300 max-w-lg mx-auto">
              <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
              <div>
                <div className="font-bold text-sm">Error al simular</div>
                <p className="text-xs mt-1">{error}</p>
                <button onClick={handleSimulate} className="text-xs font-bold underline mt-2 block">Reintentar</button>
              </div>
            </div>
          )}

          {result && !loading && (
            <div className="space-y-6 animate-fadeIn">
              {/* Resumen de Claridad */}
              <div className={`border rounded-xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-6 ${getClaridadColor(result.indiceClaridad)}`}>
                <div className="flex-1 space-y-2">
                  <h3 className="font-bold text-base flex items-center gap-2">
                    Diagnóstico General del Instrumento
                  </h3>
                  <p className="text-sm text-foreground/80 leading-relaxed">{result.diagnosticoGeneral}</p>
                </div>
                <div className="flex flex-col items-center justify-center p-4 border border-current/10 rounded-xl bg-card/50 min-w-[120px]">
                  <div className="text-[32px] font-extrabold">{result.indiceClaridad}</div>
                  <div className="text-[10px] uppercase font-bold tracking-wider opacity-70">Claridad</div>
                </div>
              </div>

              {/* Las 3 simulaciones */}
              <div className="grid md:grid-cols-3 gap-5">
                {result.simulaciones.map((sim, i) => (
                  <div key={i} className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-4 flex flex-col justify-between">
                    <div>
                      {/* Alumno Header */}
                      <div className="flex justify-between items-start gap-2 mb-3">
                        <div>
                          <h4 className="font-bold text-base">{sim.alumno}</h4>
                          <span className="text-[11px] text-muted-foreground font-semibold">{sim.perfil}</span>
                        </div>
                        <div className={`px-2.5 py-1 rounded-lg text-sm font-extrabold ${getNotaColor(sim.notaEstimada)}`}>
                          Nota {sim.notaEstimada.toFixed(1)}
                        </div>
                      </div>

                      {/* Info de tiempo */}
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-4">
                        <Clock className="w-3.5 h-3.5" />
                        <span>Resolvió en {sim.tiempoEstimadoMinutos} min.</span>
                      </div>

                      {/* Comentario */}
                      <p className="text-xs italic bg-muted/30 border border-border/50 rounded-lg p-3 leading-relaxed mb-4">
                        "{sim.comentarioComprension}"
                      </p>

                      {/* Errores */}
                      <div className="space-y-2">
                        <div className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Errores Cometidos:</div>
                        {sim.erroresCometidos.length === 0 ? (
                          <div className="flex items-center gap-1 text-xs text-emerald-600 font-medium">
                            <CheckCircle2 className="w-3.5 h-3.5" /> Sin errores graves
                          </div>
                        ) : (
                          <div className="space-y-2">
                            {sim.erroresCometidos.map((err, idx) => (
                              <div key={idx} className="bg-red-50/50 dark:bg-red-950/10 border border-red-500/10 rounded-lg p-2.5 space-y-1">
                                <div className="text-[10px] font-bold text-red-600 dark:text-red-400">{err.item}</div>
                                <p className="text-[11px] text-muted-foreground leading-relaxed">{err.causa}</p>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Recomendaciones */}
              <div className="bg-indigo-50/40 dark:bg-indigo-950/10 border border-indigo-500/20 rounded-xl p-5 space-y-3">
                <h4 className="font-bold text-sm text-indigo-700 dark:text-indigo-400 flex items-center gap-2">
                  <Sparkles className="w-4 h-4" /> Recomendaciones del Auditor IA para mejorar la evaluación:
                </h4>
                <ul className="space-y-2">
                  {result.recomendaciones.map((rec, i) => (
                    <li key={i} className="flex gap-2 text-xs leading-relaxed text-muted-foreground">
                      <ArrowRight className="w-3.5 h-3.5 text-indigo-500 flex-shrink-0 mt-0.5" />
                      <span>{rec}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-border flex justify-between bg-muted/20">
          <button
            onClick={() => setResult(null)}
            disabled={!result || loading}
            className="text-xs text-muted-foreground hover:text-foreground disabled:opacity-50 flex items-center gap-1.5"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Volver a simular
          </button>
          <button
            onClick={onClose}
            className="bg-slate-900 text-white font-bold px-5 py-2 rounded-lg hover:bg-slate-800 text-sm shadow-sm"
          >
            Entendido
          </button>
        </div>
      </div>
    </div>
  )
}
