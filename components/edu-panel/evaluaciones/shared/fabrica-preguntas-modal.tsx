"use client"

import { useState } from "react"
import { apiFetch } from "@/lib/api-client"
import { 
  Sparkles, Loader2, X, PlusCircle, CheckCircle, 
  HelpCircle, Settings, BookOpen, Layers 
} from "lucide-react"

interface FabricaPreguntasModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void // Callback para recargar la lista de ítems del banco
  defaultAsignatura?: string
}

export function FabricaPreguntasModal({
  isOpen,
  onClose,
  onSuccess,
  defaultAsignatura = "General"
}: FabricaPreguntasModalProps) {
  const [asignatura, setAsignatura] = useState(defaultAsignatura)
  const [curso, setCurso] = useState("5° Básico")
  const [oa, setOa] = useState("")
  const [tema, setTema] = useState("")
  const [cantidad, setCantidad] = useState(5)
  const [tipoItems, setTipoItems] = useState<string[]>(["seleccion_multiple"])
  const [loading, setLoading] = useState(false)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  if (!isOpen) return null

  const handleToggleTipo = (tipo: string) => {
    if (tipoItems.includes(tipo)) {
      if (tipoItems.length > 1) {
        setTipoItems(tipoItems.filter(t => t !== tipo))
      }
    } else {
      setTipoItems([...tipoItems, tipo])
    }
  }

  const handleFabricate = async () => {
    if (!oa.trim()) {
      setError("Por favor ingresa un código de OA (ej. OA 01).")
      return
    }
    if (!tema.trim()) {
      setError("Por favor especifica el tema o contenido de las preguntas.")
      return
    }

    setLoading(true)
    setError(null)
    setSuccessMsg(null)

    try {
      const res = await apiFetch("/api/fabrica-preguntas", {
        method: "POST",
        body: JSON.stringify({
          asignatura,
          curso,
          oa,
          tema,
          cantidad,
          tipoItems
        })
      })

      if (!res.ok) {
        const errorData = await res.json()
        throw new Error(errorData.error || "Error al fabricar preguntas.")
      }

      const data = await res.json()
      setSuccessMsg(data.mensaje || "Preguntas fabricadas y guardadas con éxito.")
      onSuccess() // Recargar el banco de ítems
    } catch (err: any) {
      console.error(err)
      setError(err.message || "Ocurrió un error inesperado al fabricar las preguntas.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fadeIn">
      <div className="bg-card border border-border w-full max-w-lg rounded-[18px] shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-indigo-500 animate-pulse" />
            <h2 className="font-extrabold text-lg">Fábrica de Preguntas IA</h2>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 flex-1 overflow-y-auto space-y-4">
          {successMsg ? (
            <div className="py-8 text-center space-y-4">
              <div className="w-12 h-12 rounded-full bg-emerald-100 dark:bg-emerald-950/20 text-emerald-600 flex items-center justify-center mx-auto">
                <CheckCircle className="w-7 h-7" />
              </div>
              <h3 className="font-bold text-lg text-foreground">¡Fabricación Completa!</h3>
              <p className="text-sm text-muted-foreground leading-relaxed px-4">{successMsg}</p>
              <div className="pt-4 flex justify-center gap-3">
                <button
                  onClick={() => setSuccessMsg(null)}
                  className="px-4 py-2 border border-border rounded-lg bg-background hover:bg-muted text-xs font-bold"
                >
                  Fabricar más preguntas
                </button>
                <button
                  onClick={onClose}
                  className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-bold shadow-sm"
                >
                  Cerrar Fábrica
                </button>
              </div>
            </div>
          ) : (
            <>
              {error && (
                <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 p-3.5 rounded-xl text-xs text-red-800 dark:text-red-300">
                  {error}
                </div>
              )}

              {/* Form Fields */}
              <div className="space-y-3.5">
                {/* Asignatura y Curso */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] font-bold text-muted-foreground block mb-1 flex items-center gap-1">
                      <BookOpen className="w-3.5 h-3.5" /> Asignatura
                    </label>
                    <select
                      value={asignatura}
                      onChange={e => setAsignatura(e.target.value)}
                      className="h-9 w-full rounded-lg border border-border bg-background px-3 text-xs outline-none focus:border-indigo-500"
                    >
                      <option value="Lenguaje">Lenguaje</option>
                      <option value="Matemática">Matemática</option>
                      <option value="Historia">Historia</option>
                      <option value="Ciencias Naturales">Ciencias Naturales</option>
                      <option value="Inglés">Inglés</option>
                      <option value="Música">Música</option>
                      <option value="Artes Visuales">Artes Visuales</option>
                      <option value="Tecnología">Tecnología</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[11px] font-bold text-muted-foreground block mb-1 flex items-center gap-1">
                      <Layers className="w-3.5 h-3.5" /> Curso
                    </label>
                    <select
                      value={curso}
                      onChange={e => setCurso(e.target.value)}
                      className="h-9 w-full rounded-lg border border-border bg-background px-3 text-xs outline-none focus:border-indigo-500"
                    >
                      <option value="1° Básico">1° Básico</option>
                      <option value="2° Básico">2° Básico</option>
                      <option value="3° Básico">3° Básico</option>
                      <option value="4° Básico">4° Básico</option>
                      <option value="5° Básico">5° Básico</option>
                      <option value="6° Básico">6° Básico</option>
                      <option value="7° Básico">7° Básico</option>
                      <option value="8° Básico">8° Básico</option>
                      <option value="I Medio">I Medio</option>
                      <option value="II Medio">II Medio</option>
                      <option value="III Medio">III Medio</option>
                      <option value="IV Medio">IV Medio</option>
                    </select>
                  </div>
                </div>

                {/* OA */}
                <div>
                  <label className="text-[11px] font-bold text-muted-foreground block mb-1 flex items-center gap-1">
                    <Settings className="w-3.5 h-3.5" /> Objetivo de Aprendizaje (OA)
                  </label>
                  <input
                    type="text"
                    value={oa}
                    onChange={e => setOa(e.target.value)}
                    placeholder="Ej. OA 04 o OA 12"
                    className="h-9 w-full rounded-lg border border-border bg-background px-3 text-xs outline-none focus:border-indigo-500"
                  />
                </div>

                {/* Tema */}
                <div>
                  <label className="text-[11px] font-bold text-muted-foreground block mb-1 flex items-center gap-1">
                    <HelpCircle className="w-3.5 h-3.5" /> Tema / Contenido Específico
                  </label>
                  <input
                    type="text"
                    value={tema}
                    onChange={e => setTema(e.target.value)}
                    placeholder="Ej. El ciclo del agua, Fracciones impropias, Poesía romántica"
                    className="h-9 w-full rounded-lg border border-border bg-background px-3 text-xs outline-none focus:border-indigo-500"
                  />
                </div>

                {/* Cantidad de preguntas */}
                <div>
                  <label className="text-[11px] font-bold text-muted-foreground block mb-1.5">
                    Cantidad de preguntas a fabricar:
                  </label>
                  <div className="flex gap-2">
                    {[3, 5, 10].map(n => (
                      <button
                        key={n}
                        type="button"
                        onClick={() => setCantidad(n)}
                        className={`flex-1 py-1.5 rounded-lg border text-xs font-bold transition-all ${
                          cantidad === n
                            ? "bg-indigo-50 border-indigo-500 text-indigo-700 dark:bg-indigo-950/20 dark:text-indigo-400"
                            : "border-border bg-background text-muted-foreground hover:bg-muted"
                        }`}
                      >
                        {n} preguntas
                      </button>
                    ))}
                  </div>
                </div>

                {/* Tipos de ítem */}
                <div>
                  <label className="text-[11px] font-bold text-muted-foreground block mb-1.5">
                    Tipos de ítem admitidos:
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { key: "seleccion_multiple", label: "Sel. Múltiple" },
                      { key: "verdadero_falso", label: "Verdadero/Falso" },
                      { key: "desarrollo", label: "Desarrollo" }
                    ].map(t => (
                      <button
                        key={t.key}
                        type="button"
                        onClick={() => handleToggleTipo(t.key)}
                        className={`py-2 px-1 rounded-lg border text-[11px] font-semibold text-center transition-all ${
                          tipoItems.includes(t.key)
                            ? "bg-indigo-50 border-indigo-500 text-indigo-700 dark:bg-indigo-950/20 dark:text-indigo-400"
                            : "border-border bg-background text-muted-foreground hover:bg-muted"
                        }`}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Action Button */}
              <div className="pt-4">
                <button
                  onClick={handleFabricate}
                  disabled={loading}
                  className="w-full h-10 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold rounded-xl flex items-center justify-center gap-2 shadow-md transition-colors text-sm"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Fabricando preguntas de {tema}...
                    </>
                  ) : (
                    <>
                      <PlusCircle className="w-4 h-4" />
                      Fabricar con Gemini
                    </>
                  )}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
