"use client"

import { useState } from "react"
import { apiFetch } from "@/lib/api-client"
import {
  Sparkles, Loader2, X, AlertCircle, Award, Check
} from "lucide-react"
import type { RubricaTemplate, RubricaParte } from "@/lib/rubricas"

interface CrearRubricaSelloModalProps {
  isOpen: boolean
  onClose: () => void
  curso: string
  asignatura: string
  onSelectRubrica: (partes: RubricaParte[], titulo: string) => void
}

const SELLO_OPTIONS = [
  { value: "Medioambiental / Ecológico", label: "🌱 Medioambiental / Ecológico (Cuidado del entorno, reciclaje, sustentabilidad)" },
  { value: "Artístico / Creativo", label: "🎨 Artístico / Creativo (Expresión artística, originalidad, sensibilidad estética)" },
  { value: "Tecnológico / Innovación", label: "💻 Tecnológico / Innovación (Uso ético y creativo de TICs, resolución de problemas)" },
  { value: "Deportivo / Vida Saludable", label: "⚽ Deportivo / Vida Saludable (Trabajo en equipo, autocuidado, hábitos sanos)" },
  { value: "Inclusión / Interculturalidad", label: "🤝 Inclusión / Interculturalidad (Respeto a la diversidad, valoración cultural)" },
  { value: "Ciudadanía Democrática / Cívico", label: "🗳️ Ciudadanía Democrática / Cívico (Participación, debate respetuoso, DDHH)" }
]

export function CrearRubricaSelloModal({
  isOpen,
  onClose,
  curso,
  asignatura,
  onSelectRubrica
}: CrearRubricaSelloModalProps) {
  const [objetivo, setObjetivo] = useState("")
  const [sello, setSello] = useState(SELLO_OPTIONS[0].value)
  const [niveles, setNiveles] = useState(4)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!isOpen) return null

  const handleGenerate = async () => {
    if (!objetivo.trim()) {
      setError("Por favor describe el objetivo pedagógico de la evaluación.")
      return
    }

    setLoading(true)
    setError(null)
    try {
      const res = await apiFetch("/api/rubricas-sello", {
        method: "POST",
        body: JSON.stringify({
          objetivo,
          sello,
          niveles,
          curso,
          asignatura
        })
      })

      if (!res.ok) {
        const errData = await res.json()
        throw new Error(errData.error || "Error al generar la rúbrica sello.")
      }

      const data = await res.json()
      if (!data.criterios || !Array.isArray(data.criterios)) {
        throw new Error("La rúbrica generada no tiene el formato correcto.")
      }

      // Convertir el JSON de Gemini al modelo interno de RubricaParte[]
      const nuevaParteId = `parte_${Date.now()}`
      const criteriosFormateados = data.criterios.map((c: any, idx: number) => {
        // Encontrar descriptores correspondientes a cada nivel
        const findDescriptor = (keywords: string[], points: number) => {
          const matched = c.desempenos?.find((d: any) => {
            const nivelName = d.nivel?.toLowerCase() || ""
            return keywords.some(k => nivelName.includes(k)) || d.puntaje === points
          })
          return matched?.descriptor || ""
        }

        return {
          id: `crit_${Date.now()}_${idx}`,
          orden: idx + 1,
          nombre: c.nombre || `Criterio ${idx + 1}`,
          ponderacion: Math.floor(100 / data.criterios.length),
          niveles: {
            logrado: {
              descripcion: findDescriptor(["logrado", "destacado", "competente", "excelente"], 4),
              puntos: 4
            },
            casiLogrado: {
              descripcion: findDescriptor(["casi", "bueno", "satisfactorio"], 3),
              puntos: 3
            },
            parcialmenteLogrado: {
              descripcion: findDescriptor(["parcial", "suficiente", "regular"], 2),
              puntos: 2
            },
            porLograr: {
              descripcion: findDescriptor(["por lograr", "insatisfactorio", "deficiente"], 1),
              puntos: 1
            }
          }
        }
      })

      const parteGenerada: RubricaParte = {
        id: nuevaParteId,
        orden: 1,
        nombre: data.titulo || "Evaluación con Sello",
        oasVinculados: [],
        criterios: criteriosFormateados
      }

      onSelectRubrica([parteGenerada], data.titulo || "Rúbrica con Sello")
      onClose()
    } catch (err: any) {
      console.error(err)
      setError(err.message || "Error al conectar con la IA.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-card border border-border w-full max-w-xl rounded-[18px] shadow-2xl flex flex-col max-h-[85vh] overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-border flex items-center justify-between bg-emerald-900/10">
          <div className="flex items-center gap-2">
            <Award className="w-5 h-5 text-emerald-500" />
            <h2 className="font-extrabold text-lg">Diseñador de Rúbricas Sello (IA)</h2>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 flex-1 overflow-y-auto space-y-5">
          <div className="bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-200/50 p-4 rounded-xl text-xs text-emerald-800 dark:text-emerald-300 leading-relaxed">
            Esta función Premium diseña una rúbrica analítica alineada con el <strong>sello identitario</strong> de tu establecimiento (PEI). Al menos uno de los criterios evaluará explícitamente cómo los estudiantes demuestran este sello identitario de forma práctica y transversal en el objetivo curricular especificado.
          </div>

          {error && (
            <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 p-3.5 rounded-xl flex gap-2.5 text-red-800 dark:text-red-300 text-xs">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {!loading ? (
            <div className="space-y-4">
              {/* Objetivo Pedagógico */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-muted-foreground uppercase">Objetivo curricular o actividad a evaluar:</label>
                <textarea
                  value={objetivo}
                  onChange={(e) => setObjetivo(e.target.value)}
                  placeholder="Ej: Exposición grupal sobre biodiversidad local o ensayo crítico sobre sustentabilidad..."
                  className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm h-24 outline-none focus:border-primary resize-none"
                />
              </div>

              {/* Sello Institucional */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-muted-foreground uppercase">Sello educativo del establecimiento:</label>
                <select
                  value={sello}
                  onChange={(e) => setSello(e.target.value)}
                  className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary"
                >
                  {SELLO_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          ) : (
            <div className="py-16 text-center space-y-4">
              <Loader2 className="w-10 h-10 animate-spin mx-auto text-emerald-500" />
              <div className="font-bold text-sm">Creando criterios de evaluación con Sello identitario...</div>
              <p className="text-xs text-muted-foreground max-w-xs mx-auto">
                Gemini está redactando los descriptores pedagógicos para cada nivel de desempeño.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-border flex justify-end gap-2 bg-muted/20">
          <button
            onClick={onClose}
            disabled={loading}
            className="border border-border hover:bg-muted text-foreground font-bold px-4 py-2 rounded-xl text-xs transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleGenerate}
            disabled={loading || !objetivo.trim()}
            className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold px-5 py-2 rounded-xl text-xs flex items-center gap-1.5 transition-colors shadow-sm"
          >
            <Sparkles className="w-3.5 h-3.5 text-white animate-pulse" />
            Crear Rúbrica Sello
          </button>
        </div>
      </div>
    </div>
  )
}
