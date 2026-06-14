"use client"

import { useState } from "react"
import { apiFetch } from "@/lib/api-client"
import {
  Sparkles, Loader2, X, Clipboard, Check, Send, AlertCircle, MessageSquare
} from "lucide-react"

interface BotApoderadosModalProps {
  isOpen: boolean
  onClose: () => void
  student: {
    id: string
    nombre: string
    promedio?: number
    porcentajeAsistencia?: number
    pie?: boolean
  }
  observaciones: string[]
  curso: string
  asignatura: string
}

interface BotResult {
  asunto: string
  mensaje: string
  consejoHogar: string
}

export function BotApoderadosModal({
  isOpen,
  onClose,
  student,
  observaciones,
  curso,
  asignatura
}: BotApoderadosModalProps) {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<BotResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  if (!isOpen) return null

  const handleGenerate = async () => {
    setLoading(true)
    setError(null)
    setResult(null)
    setCopied(false)
    try {
      const res = await apiFetch("/api/bot-apoderados", {
        method: "POST",
        body: JSON.stringify({
          student,
          observaciones,
          curso,
          asignatura
        })
      })

      if (!res.ok) {
        const errData = await res.json()
        throw new Error(errData.error || "Error al redactar el mensaje para el apoderado.")
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

  const handleCopy = () => {
    if (!result) return
    const textToCopy = `Asunto: ${result.asunto}\n\n${result.mensaje}\n\nConsejo de apoyo en el hogar:\n${result.consejoHogar}`
    navigator.clipboard.writeText(textToCopy)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleWhatsApp = () => {
    if (!result) return
    const text = encodeURIComponent(result.mensaje)
    window.open(`https://api.whatsapp.com/send?text=${text}`, "_blank")
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-card border border-border w-full max-w-2xl rounded-[18px] shadow-2xl flex flex-col max-h-[85vh] overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-border flex items-center justify-between bg-violet-900/10">
          <div className="flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-violet-500" />
            <h2 className="font-extrabold text-lg">Redactor de Mensaje para Apoderados</h2>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 flex-1 overflow-y-auto space-y-5">
          {!result && !loading && (
            <div className="space-y-4">
              <div className="bg-violet-50/50 dark:bg-violet-950/20 border border-violet-200/50 p-4 rounded-xl text-xs text-violet-800 dark:text-violet-300 leading-relaxed">
                Esta función redactará automáticamente un mensaje constructivo y empático dirigido al apoderado de <strong>{student.nombre}</strong>. Utilizará su asistencia académica ({student.porcentajeAsistencia || "N/A"}%), su promedio actual ({student.promedio || "N/A"}) y las observaciones registradas por ti para proponer una vía de colaboración directa con el hogar.
              </div>

              <div className="space-y-2">
                <span className="text-xs font-bold text-muted-foreground uppercase">Observaciones del docente que se incluirán:</span>
                <div className="border border-border rounded-xl p-3 bg-muted/20 max-h-36 overflow-y-auto text-xs space-y-1.5">
                  {observaciones && observaciones.length > 0 ? (
                    observaciones.map((obs, idx) => (
                      <div key={idx} className="flex gap-2">
                        <span className="text-violet-500">•</span>
                        <span>{obs}</span>
                      </div>
                    ))
                  ) : (
                    <span className="text-muted-foreground italic">No hay observaciones específicas cargadas. Se redactará un reporte de avance académico estándar.</span>
                  )}
                </div>
              </div>

              <button
                onClick={handleGenerate}
                className="w-full bg-violet-600 hover:bg-violet-700 text-white font-bold py-2.5 rounded-xl text-sm flex items-center justify-center gap-2 transition-colors shadow-sm"
              >
                <Sparkles className="w-4 h-4 text-white animate-pulse" />
                Redactar Mensaje con IA
              </button>
            </div>
          )}

          {loading && (
            <div className="py-16 text-center space-y-4">
              <Loader2 className="w-10 h-10 animate-spin mx-auto text-violet-500" />
              <div className="font-bold text-sm">Redactando mensaje empático...</div>
              <p className="text-xs text-muted-foreground max-w-xs mx-auto">
                Gemini está adaptando el tono y estructurando consejos de apoyo escolar para la familia.
              </p>
            </div>
          )}

          {error && (
            <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 p-4 rounded-xl flex gap-3 text-red-800 dark:text-red-300">
              <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
              <div>
                <div className="font-bold text-sm">Error al redactar</div>
                <p className="text-xs mt-1">{error}</p>
                <button onClick={handleGenerate} className="text-xs font-bold underline mt-2 block">Reintentar</button>
              </div>
            </div>
          )}

          {result && !loading && (
            <div className="space-y-4">
              {/* Asunto y Mensaje */}
              <div className="border border-border rounded-xl bg-card overflow-hidden">
                <div className="bg-muted px-4 py-2 border-b border-border flex items-center justify-between">
                  <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Vista Previa</span>
                  <div className="flex gap-2">
                    <button
                      onClick={handleCopy}
                      className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 font-semibold"
                    >
                      {copied ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-500" />
                          <span>Copiado</span>
                        </>
                      ) : (
                        <>
                          <Clipboard className="w-3.5 h-3.5" />
                          <span>Copiar</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
                <div className="p-4 space-y-3 font-sans text-xs text-foreground">
                  <div>
                    <strong>Asunto:</strong> {result.asunto}
                  </div>
                  <hr className="border-border" />
                  <div className="whitespace-pre-wrap leading-relaxed text-muted-foreground">
                    {result.mensaje}
                  </div>
                </div>
              </div>

              {/* Consejos */}
              <div className="bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-200/50 p-4 rounded-xl">
                <h4 className="font-bold text-xs text-emerald-800 dark:text-emerald-300 mb-1">💡 Sugerencia de Apoyo en el Hogar:</h4>
                <p className="text-xs text-emerald-700 dark:text-emerald-400 leading-relaxed">{result.consejoHogar}</p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-border flex justify-between bg-muted/20">
          <div>
            {result && (
              <button
                onClick={handleWhatsApp}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-4 py-2 rounded-xl text-xs flex items-center gap-1.5 transition-colors shadow-sm"
              >
                <Send className="w-3 h-3 text-white" />
                Enviar por WhatsApp
              </button>
            )}
          </div>
          <div className="flex gap-2">
            {result && (
              <button
                onClick={() => setResult(null)}
                className="text-xs text-muted-foreground hover:text-foreground font-semibold px-3"
              >
                Volver a generar
              </button>
            )}
            <button
              onClick={onClose}
              className="border border-border hover:bg-muted text-foreground font-bold px-4 py-2 rounded-xl text-xs transition-colors"
            >
              Cerrar
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
