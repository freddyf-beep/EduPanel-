"use client"

import { useState } from "react"
import { apiFetch } from "@/lib/api-client"
import {
  Sparkles, Loader2, Target, BookOpen, AlertCircle, X, Check, ArrowRight, Lightbulb
} from "lucide-react"

interface RecomendadorSemanticoModalProps {
  isOpen: boolean
  onClose: () => void
  curso: string
  asignatura: string
}

interface OASugerido {
  id: string
  resumen: string
  explicacionMapeo: string
}

interface PropuestaRecurso {
  nombre: string
  tipo: string
  descripcion: string
}

interface RecomendacionResult {
  justificacion: string
  oasSugeridos: OASugerido[]
  propuestasRecursos: PropuestaRecurso[]
}

const SUGGESTIONS = [
  "Enseñar fracciones de manera aplicada y musical",
  "Comprensión lectora usando mitos y leyendas locales",
  "Procesos químicos cotidianos (cocina y fermentación)",
  "Geometría tridimensional en el diseño urbano"
]

export function RecomendadorSemanticoModal({
  isOpen,
  onClose,
  curso,
  asignatura
}: RecomendadorSemanticoModalProps) {
  const [query, setQuery] = useState("")
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<RecomendacionResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  if (!isOpen) return null

  const handleRecommend = async (customQuery?: string) => {
    const q = customQuery || query
    if (!q.trim()) return

    setLoading(true)
    setError(null)
    try {
      const res = await apiFetch("/api/recomendador-semantico", {
        method: "POST",
        body: JSON.stringify({
          query: q,
          curso,
          asignatura
        })
      })

      if (!res.ok) {
        const errData = await res.json()
        throw new Error(errData.error || "Error al obtener recomendaciones semánticas.")
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
      <div className="bg-card border border-border w-full max-w-3xl rounded-[18px] shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-border flex items-center justify-between bg-indigo-900/10">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-indigo-500 animate-pulse" />
            <h2 className="font-extrabold text-lg">Mapeador Semántico y Recomendador IA</h2>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 flex-1 overflow-y-auto space-y-6">
          {!result && !loading && (
            <div className="space-y-4">
              <div className="bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-200/50 p-4 rounded-xl text-xs text-indigo-800 dark:text-indigo-300 leading-relaxed">
                Escribe tu idea didáctica o el tema que quieres enseñar (ej: "fracciones con música", "leyes de Newton en skate"). Gemini buscará los Objetivos de Aprendizaje (OA) del currículo nacional que mejor se alinean semánticamente y te propondrá recursos pedagógicos y actividades de evaluación.
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-muted-foreground uppercase">Tema o consulta:</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Ej: Suma y resta de decimales usando compras de supermercado..."
                    className="flex-1 rounded-xl border border-border bg-background px-4 py-2.5 text-sm outline-none focus:border-primary"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleRecommend()
                    }}
                  />
                  <button
                    onClick={() => handleRecommend()}
                    disabled={!query.trim()}
                    className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold px-5 rounded-xl text-sm flex items-center gap-1.5 transition-colors"
                  >
                    Consultar IA
                  </button>
                </div>
              </div>

              {/* Sugerencias de ejemplo */}
              <div className="space-y-2 pt-2">
                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">Ideas sugeridas para probar:</span>
                <div className="grid gap-2 sm:grid-cols-2">
                  {SUGGESTIONS.map((s, idx) => (
                    <button
                      key={idx}
                      onClick={() => {
                        setQuery(s)
                        handleRecommend(s)
                      }}
                      className="text-left text-xs p-3 rounded-xl border border-border hover:border-indigo-400 bg-muted/20 hover:bg-indigo-50/10 transition-all flex items-center justify-between group"
                    >
                      <span className="text-muted-foreground group-hover:text-foreground line-clamp-1">{s}</span>
                      <ArrowRight className="w-3.5 h-3.5 text-muted-foreground/50 group-hover:text-indigo-500 transition-colors flex-shrink-0" />
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {loading && (
            <div className="py-20 text-center space-y-4">
              <Loader2 className="w-12 h-12 animate-spin mx-auto text-indigo-500" />
              <div className="font-bold text-base">Mapeando tu idea semánticamente...</div>
              <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                Gemini está analizando la cobertura pedagógica, los objetivos curriculares y diseñando propuestas de actividades.
              </p>
            </div>
          )}

          {error && (
            <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 p-4 rounded-xl flex gap-3 text-red-800 dark:text-red-300">
              <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
              <div>
                <div className="font-bold text-sm">Error en la recomendación</div>
                <p className="text-xs mt-1">{error}</p>
                <button onClick={() => handleRecommend()} className="text-xs font-bold underline mt-2 block">Reintentar</button>
              </div>
            </div>
          )}

          {result && !loading && (
            <div className="space-y-6">
              {/* Justificacion */}
              <div className="bg-muted/30 p-4 rounded-xl border border-border">
                <h4 className="font-bold text-sm text-foreground flex items-center gap-2 mb-1.5">
                  <Lightbulb className="w-4 h-4 text-indigo-500" /> Justificación Curricular
                </h4>
                <p className="text-sm leading-relaxed text-muted-foreground">{result.justificacion}</p>
              </div>

              {/* OAs sugeridos */}
              <div className="space-y-3">
                <h4 className="font-bold text-sm text-foreground flex items-center gap-2">
                  <Target className="w-4 h-4 text-emerald-500" /> Objetivos de Aprendizaje (OA) Vinculados
                </h4>
                <div className="space-y-2">
                  {result.oasSugeridos.map((oa, idx) => (
                    <div key={oa.id || idx} className="border border-border rounded-xl p-3 bg-card flex flex-col gap-1.5">
                      <div className="flex items-center gap-2">
                        <span className="bg-emerald-100 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-300 font-bold px-2 py-0.5 rounded text-xs">
                          {oa.id}
                        </span>
                        <span className="font-bold text-xs text-foreground line-clamp-1">{oa.resumen}</span>
                      </div>
                      <p className="text-xs text-muted-foreground leading-relaxed pl-1">{oa.explicacionMapeo}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Propuestas de recursos */}
              <div className="space-y-3">
                <h4 className="font-bold text-sm text-foreground flex items-center gap-2">
                  <BookOpen className="w-4 h-4 text-blue-500" /> Propuestas de Actividades y Recursos
                </h4>
                <div className="grid gap-3 sm:grid-cols-3">
                  {result.propuestasRecursos.map((r, idx) => (
                    <div key={idx} className="border border-border rounded-xl p-3.5 bg-muted/10 space-y-2 flex flex-col justify-between">
                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-[9px] font-bold uppercase tracking-wider text-indigo-500">{r.tipo}</span>
                        </div>
                        <h5 className="font-bold text-xs text-foreground leading-tight">{r.nombre}</h5>
                        <p className="text-[11px] text-muted-foreground leading-relaxed">{r.descripcion}</p>
                      </div>
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
              Realizar otra consulta
            </button>
          )}
          <button
            onClick={onClose}
            className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-5 py-2 rounded-xl text-sm shadow-sm transition-colors"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  )
}
