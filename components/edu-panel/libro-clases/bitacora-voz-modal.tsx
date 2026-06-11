"use client"

import { useState, useRef, useEffect } from "react"
import { AlertCircle, CheckCircle2, Loader2, Mic, MicOff, Square, Wand2, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { apiFetch } from "@/lib/api-client"
import { toast } from "@/hooks/use-toast"

interface BitacoraVozModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  asignatura: string
  curso: string
  estudiantes: Array<{ id: string; nombre: string }>
  onApply: (data: {
    objetivo: string
    actividad: string
    asistenciaCambios: Array<{ id: string; estado: "ausente" | "atraso" }>
  }) => void
}

export function BitacoraVozModal({
  open,
  onOpenChange,
  asignatura,
  curso,
  estudiantes,
  onApply,
}: BitacoraVozModalProps) {
  const [isRecording, setIsRecording] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [error, setError] = useState("")
  const [recordingTime, setRecordingTime] = useState(0)

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<BlobPart[]>([])
  const timerRef = useRef<NodeJS.Timeout | null>(null)

  // Manejar timer de grabación
  useEffect(() => {
    if (isRecording) {
      setRecordingTime(0)
      timerRef.current = setInterval(() => {
        setRecordingTime((prev) => prev + 1)
      }, 1000)
    } else {
      if (timerRef.current) clearInterval(timerRef.current)
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [isRecording])

  // Detener la grabación forzosamente al desmontar o cerrar modal
  useEffect(() => {
    if (!open && isRecording) {
      stopRecording()
    }
  }, [open])

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60).toString().padStart(2, "0")
    const s = (seconds % 60).toString().padStart(2, "0")
    return `${m}:${s}`
  }

  const startRecording = async () => {
    setError("")
    chunksRef.current = []
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      
      // Intentar usar un codec compatible, webm por defecto
      let options = { mimeType: "audio/webm" }
      if (MediaRecorder.isTypeSupported("audio/webm;codecs=opus")) {
        options = { mimeType: "audio/webm;codecs=opus" }
      } else if (MediaRecorder.isTypeSupported("audio/mp4")) {
        options = { mimeType: "audio/mp4" } // Safari
      }

      const mediaRecorder = new MediaRecorder(stream, options)
      mediaRecorderRef.current = mediaRecorder

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data)
        }
      }

      mediaRecorder.onstop = async () => {
        // Liberar el micrófono
        stream.getTracks().forEach((track) => track.stop())
        
        const audioBlob = new Blob(chunksRef.current, { type: mediaRecorder.mimeType })
        await processAudio(audioBlob, mediaRecorder.mimeType)
      }

      mediaRecorder.start(200) // recolectar chunks cada 200ms
      setIsRecording(true)
    } catch (err: any) {
      console.error("Error al acceder al micrófono:", err)
      setError("No se pudo acceder al micrófono. Verifica los permisos de tu navegador.")
      setIsRecording(false)
    }
  }

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop()
      setIsRecording(false)
      setIsProcessing(true)
    }
  }

  const blobToBase64 = (blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onloadend = () => {
        const dataUrl = reader.result as string
        const base64 = dataUrl.split(",")[1]
        resolve(base64)
      }
      reader.onerror = reject
      reader.readAsDataURL(blob)
    })
  }

  const processAudio = async (audioBlob: Blob, mimeType: string) => {
    try {
      const audioBase64 = await blobToBase64(audioBlob)

      const res = await apiFetch("/api/bitacora-por-voz", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          audioBase64,
          mimeType,
          asignatura,
          curso,
          estudiantes: estudiantes.map((e) => ({ id: e.id, nombre: e.nombre })),
        }),
      })

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.error || "Error al procesar el audio con la IA.")
      }

      const data = await res.json()
      
      toast({
        title: "¡Análisis completado!",
        description: "Se han extraído el objetivo, actividad y la asistencia del relato.",
      })

      onApply({
        objetivo: data.objetivo || "",
        actividad: data.actividad || "",
        asistenciaCambios: data.asistenciaCambios || [],
      })
      onOpenChange(false)
      setIsProcessing(false)
    } catch (err: any) {
      console.error(err)
      setError(err.message || "Error al procesar la grabación.")
      setIsProcessing(false)
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[700] flex items-center justify-center bg-black/60 backdrop-blur-sm p-3 sm:p-4 print:hidden animate-fade-in">
      <div className="flex w-full max-w-lg flex-col overflow-hidden rounded-[24px] border border-white/10 bg-card/95 shadow-2xl backdrop-blur-md">
        
        {/* Cabecera */}
        <div className="flex items-start justify-between gap-4 border-b border-border/60 px-6 py-5">
          <div className="min-w-0">
            <div className="mb-1 flex items-center gap-2.5">
              <div className="grid h-10 w-10 place-items-center rounded-xl bg-violet-500/10 text-violet-500 ring-1 ring-violet-500/20 shadow-[0_0_15px_rgba(139,92,246,0.15)]">
                <Mic className="h-5 w-5" />
              </div>
              <h2 className="text-[18px] font-extrabold bg-gradient-to-br from-violet-500 to-fuchsia-500 bg-clip-text text-transparent">
                Bitácora por Voz
              </h2>
            </div>
            <p className="text-[13px] leading-relaxed text-muted-foreground mt-2">
              Relata brevemente qué enseñaste hoy, las actividades que hicieron tus alumnos, y quiénes faltaron o llegaron tarde. La IA escribirá el leccionario por ti.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              if (isRecording) stopRecording()
              onOpenChange(false)
            }}
            disabled={isProcessing}
            className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-full bg-muted/60 text-muted-foreground hover:bg-muted transition-colors disabled:opacity-50 mt-1"
            title="Cerrar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Contenido Principal */}
        <div className="px-6 py-8 flex flex-col items-center justify-center bg-gradient-to-b from-card to-muted/20">
          
          {error && (
            <div className="mb-6 flex w-full items-start gap-2.5 rounded-[12px] border border-red-500/20 bg-red-500/5 px-4 py-3 text-[13px] text-red-500 font-medium">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {isProcessing ? (
            <div className="flex flex-col items-center py-6">
              <div className="relative grid h-24 w-24 place-items-center mb-6">
                <div className="absolute inset-0 rounded-full bg-violet-500/10 animate-ping duration-[2000ms]"></div>
                <div className="absolute inset-2 rounded-full border-2 border-violet-500/20 border-t-violet-500 animate-spin"></div>
                <div className="absolute inset-0 rounded-full flex items-center justify-center">
                  <Wand2 className="h-8 w-8 text-violet-500" />
                </div>
              </div>
              <h3 className="text-[16px] font-bold text-foreground mb-1">Gemini está analizando el audio...</h3>
              <p className="text-[13px] text-muted-foreground text-center max-w-[280px]">
                Redactando el objetivo, la actividad pedagógica y detectando la asistencia mencionada.
              </p>
            </div>
          ) : (
            <div className="flex flex-col items-center w-full">
              {/* Micrófono Botón Principal */}
              <div className="relative flex items-center justify-center mb-8 mt-2">
                {isRecording && (
                  <>
                    <div className="absolute inset-0 scale-[1.8] rounded-full bg-red-500/10 animate-ping duration-1000"></div>
                    <div className="absolute inset-0 scale-[1.4] rounded-full bg-red-500/20 animate-pulse"></div>
                  </>
                )}
                
                <button
                  type="button"
                  onClick={isRecording ? stopRecording : startRecording}
                  className={cn(
                    "relative z-10 flex h-24 w-24 flex-col items-center justify-center gap-1 rounded-full shadow-xl transition-all duration-300",
                    isRecording 
                      ? "bg-red-500 text-white hover:bg-red-600 scale-110 shadow-red-500/30 ring-4 ring-red-500/20" 
                      : "bg-gradient-to-br from-violet-500 to-indigo-600 text-white hover:scale-105 hover:shadow-violet-500/25 ring-4 ring-violet-500/10"
                  )}
                >
                  {isRecording ? <Square className="h-8 w-8 fill-current" /> : <Mic className="h-10 w-10" />}
                </button>
              </div>

              {/* Temporizador e Instrucciones */}
              <div className="text-center h-[60px]">
                {isRecording ? (
                  <div className="flex flex-col items-center animate-fade-in">
                    <span className="text-red-500 font-bold tracking-widest text-[20px] drop-shadow-sm font-mono">
                      {formatTime(recordingTime)}
                    </span>
                    <span className="text-[13px] font-medium text-muted-foreground mt-1">
                      Grabando... Toca el cuadro para detener
                    </span>
                  </div>
                ) : (
                  <div className="flex flex-col items-center text-muted-foreground">
                    <span className="text-[15px] font-bold text-foreground mb-1">
                      Toca el micrófono para hablar
                    </span>
                    <span className="text-[13px] max-w-[250px] leading-tight">
                      Ej: "Hoy vimos figuras rítmicas. Sofía y Juan no vinieron."
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

        </div>
        
        {/* Footer */}
        {!isProcessing && (
          <div className="border-t border-border/60 bg-muted/30 px-6 py-4 flex justify-end">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="rounded-[12px] px-5 py-2.5 text-[13px] font-bold text-muted-foreground hover:bg-muted transition-colors hover:text-foreground"
            >
              Cancelar
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
