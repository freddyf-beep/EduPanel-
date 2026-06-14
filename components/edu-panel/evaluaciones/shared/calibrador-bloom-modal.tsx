"use client"

import { useState } from "react"
import { apiFetch } from "@/lib/api-client"
import {
  Sparkles, Loader2, Award, ChevronRight, X, ShieldAlert, BookOpen, AlertTriangle
} from "lucide-react"

interface CalibradorBloomModalProps {
  isOpen: boolean
  onClose: () => void
  documento: any // La prueba completa
}

interface AuditoriaPregunta {
  preguntaId: string
  enunciadoCorto: string
  nivelIdentificado: string
  explicacion: string
  sugerenciaSubirNivel: string
}

interface BloomResult {
  diagnosticoGeneral: string
  distribucion: {
    Recordar: number
    Comprender: number
    Aplicar: number
    Analizar: number
    Evaluar: number
    Crear: number
  }
  auditoriaPreguntas: AuditoriaPregunta[]
  recomendaciones: string[]
}

const BLOOM_COLORS: Record<string, string> = {
  Recordar: "bg-blue-500",
  Comprender: "bg-cyan-500",
  Aplicar: "bg-emerald-500",
  Analizar: "bg-amber-500",
  Evaluar: "bg-orange-500",
  Crear: "bg-rose-500"
}

const BLOOM_LIGHT_BG: Record<string, string> = {
  Recordar: "bg-blue-50 dark:bg-blue-950/20 text-blue-800 dark:text-blue-300 border-blue-200/50",
  Comprender: "bg-cyan-50 dark:bg-cyan-950/20 text-cyan-800 dark:text-cyan-300 border-cyan-200/50",
  Aplicar: "bg-emerald-50 dark:bg-emerald-950/20 text-emerald-800 dark:text-emerald-300 border-emerald-200/50",
  Analizar: "bg-amber-50 dark:bg-amber-950/20 text-amber-800 dark:text-amber-300 border-amber-200/50",
  Evaluar: "bg-orange-50 dark:bg-orange-950/20 text-orange-800 dark:text-orange-300 border-orange-200/50",
  Crear: "bg-rose-50 dark:bg-rose-950/20 text-rose-800 dark:text-rose-300 border-rose-200/50"
}

export function CalibradorBloomModal({
  isOpen,
  onClose,
  documento
}: CalibradorBloomModalProps) {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<BloomResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  if (!isOpen) return null

  const handleCalibrate = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await apiFetch("/api/calibrar-bloom", {
        method: "POST",
        body: JSON.stringify({ documento })
      })

      if (!res.ok) {
        const errData = await res.json()
        throw new Error(errData.error || "Error al analizar la taxonomía de Bloom.")
      }

      const data = await res.json()
      setResult(data)
    } catch (err: any) {
      console.error(err)
      setError(err.message || "Ocurrió un error inesperado.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-card border border-border w-full max-w-4xl rounded-[18px] shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Award className="w-5 h-5 text-indigo-500 animate-pulse" />
            <h2 className="font-extrabold text-lg">Calibrador de Rigor Cognitivo (Bloom IA)</h2>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 flex-1 overflow-y-auto space-y-6">
          {!result && !loading && (
            <div className="space-y-6 text-center py-10">
              <Award className="w-16 h-16 mx-auto text-indigo-500 opacity-80" />
              <div className="max-w-md mx-auto space-y-2">
                <h3 className="font-bold text-lg text-foreground">Audita el Rigor Cognitivo de tu Evaluación</h3>
                <p className="text-xs text-muted-foreground">
                  Esta herramienta analiza las preguntas de tu evaluación según la Taxonomía de Bloom revisada para asegurar que evalúes habilidades de orden superior (HOTS) y no solo memoria a corto plazo.
                </p>
              </div>

              <div className="flex justify-center pt-4">
                <button
                  onClick={handleCalibrate}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-6 py-3 rounded-xl flex items-center gap-2 shadow-md transition-colors"
                >
                  <Sparkles className="w-4 h-4" />
                  Iniciar Auditoría Cognitiva con Gemini
                </button>
              </div>
            </div>
          )}

          {loading && (
            <div className="py-20 text-center space-y-4">
              <Loader2 className="w-12 h-12 animate-spin mx-auto text-primary" />
              <div className="font-bold text-base">Analizando reactivos de la prueba...</div>
              <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                Gemini está clasificando cada ítem según la Taxonomía de Bloom y calculando la distribución psicométrica.
              </p>
            </div>
          )}

          {error && (
            <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 p-4 rounded-xl flex gap-3 text-red-800 dark:text-red-300">
              <ShieldAlert className="w-5 h-5 flex-shrink-0 mt-0.5" />
              <div>
                <div className="font-bold text-sm">Error al calibrar</div>
                <p className="text-xs mt-1">{error}</p>
                <button onClick={handleCalibrate} className="text-xs font-bold underline mt-2 block">Reintentar</button>
              </div>
            </div>
          )}

          {result && !loading && (
            <div className="space-y-6">
              {/* Diagnostico General */}
              <div className="bg-muted/30 p-4 rounded-xl border border-border">
                <h4 className="font-bold text-sm text-foreground flex items-center gap-2 mb-1.5">
                  <BookOpen className="w-4 h-4 text-primary" /> Diagnóstico Psicométrico General
                </h4>
                <p className="text-sm leading-relaxed text-muted-foreground">{result.diagnosticoGeneral}</p>
              </div>

              {/* Distribucion Cognitiva */}
              <div className="space-y-3">
                <h4 className="font-bold text-sm text-foreground">Distribución Cognitiva de la Prueba</h4>
                <div className="h-6 w-full rounded-full bg-muted overflow-hidden flex">
                  {Object.entries(result.distribucion).map(([level, val]) => (
                    val > 0 ? (
                      <div
                        key={level}
                        className={`${BLOOM_COLORS[level]} h-full transition-all`}
                        style={{ width: `${val}%` }}
                        title={`${level}: ${val}%`}
                      />
                    ) : null
                  ))}
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-6 gap-2">
                  {Object.entries(result.distribucion).map(([level, val]) => (
                    <div key={level} className="flex items-center gap-2 text-xs">
                      <div className={`w-3 h-3 rounded-full ${BLOOM_COLORS[level]}`} />
                      <span className="font-semibold text-muted-foreground">{level}: {val}%</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Recomendaciones */}
              <div className="space-y-2">
                <h4 className="font-bold text-sm text-foreground flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-500" /> Recomendaciones de Optimización
                </h4>
                <ul className="text-xs space-y-1.5 list-disc list-inside bg-amber-50/20 border border-amber-500/10 p-4 rounded-xl">
                  {result.recomendaciones.map((rec, i) => (
                    <li key={i} className="text-muted-foreground leading-relaxed">{rec}</li>
                  ))}
                </ul>
              </div>

              {/* Auditoria por Pregunta */}
              <div className="space-y-3">
                <h4 className="font-bold text-sm text-foreground">Análisis de Reactivos Individuales</h4>
                <div className="space-y-3">
                  {result.auditoriaPreguntas.map((q, idx) => (
                    <div key={q.preguntaId || idx} className="border border-border rounded-xl p-4 space-y-2">
                      <div className="flex items-start justify-between gap-3">
                        <div className="text-sm font-bold truncate max-w-[70%]">
                          Pregunta {idx+1}: <span className="font-normal text-muted-foreground italic">"{q.enunciadoCorto}"</span>
                        </div>
                        <div className={`px-2.5 py-0.5 rounded-full text-xs font-bold border ${BLOOM_LIGHT_BG[q.nivelIdentificado] || "bg-muted"}`}>
                          {q.nivelIdentificado}
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground leading-relaxed bg-muted/20 p-2.5 rounded-lg border border-border/50">
                        {q.explicacion}
                      </p>
                      {q.sugerenciaSubirNivel && (
                        <div className="text-xs pt-1.5 border-t border-border/50">
                          <div className="font-bold text-indigo-500 flex items-center gap-1.5 mb-1">
                            <Sparkles className="w-3.5 h-3.5 animate-pulse" /> Sugerencia de rigurosidad cognitiva (DUA/Bloom):
                          </div>
                          <div className="text-muted-foreground pl-5 leading-relaxed">{q.sugerenciaSubirNivel}</div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-border flex justify-end bg-muted/20">
          {result && (
            <button
              onClick={() => setResult(null)}
              className="text-xs text-muted-foreground hover:text-foreground font-semibold mr-4"
            >
              Auditar de nuevo
            </button>
          )}
          <button
            onClick={onClose}
            className="bg-primary text-primary-foreground font-bold px-5 py-2 rounded-xl text-sm hover:bg-pink-dark shadow-sm"
          >
            Entendido
          </button>
        </div>
      </div>
    </div>
  )
}
