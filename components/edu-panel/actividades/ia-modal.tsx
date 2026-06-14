"use client"

import { useEffect, useMemo, useState } from "react"
import { AlertCircle, Bot, Check, ClipboardCopy, Loader2, Settings2, Wand2 } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { apiFetch } from "@/lib/api-client"
import { parseJsonResponse, type CopilotMode, type LessonRequestBody } from "@/lib/ai/copilot"

const RECOGNIZED_FIELDS = [
  "analisisBloom",
  "objetivoMultinivel",
  "objetivo",
  "indicadoresEvaluacion",
  "actividadEvaluacion",
  "inicio",
  "desarrollo",
  "cierre",
  "materiales",
  "tics",
  "adecuacion",
] as const

type IaPreference = "agent" | "integrated"

interface IaModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  requestBody: LessonRequestBody
  mode: CopilotMode
  hasConfiguredProvider: boolean
  isGenerating: boolean
  onApplyExternalJson: (rawJson: string) => Promise<void> | void
  onGenerateIntegrated: () => Promise<void> | void
  onOpenIntegratedChat: () => void
  onConfigureProvider: () => void
}

export function IaModal({
  open,
  onOpenChange,
  requestBody,
  mode,
  hasConfiguredProvider,
  isGenerating,
  onApplyExternalJson,
  onGenerateIntegrated,
  onOpenIntegratedChat,
  onConfigureProvider,
}: IaModalProps) {
  const [tab, setTab] = useState<IaPreference>("agent")
  const [prompt, setPrompt] = useState("")
  const [loadingPrompt, setLoadingPrompt] = useState(false)
  const [promptError, setPromptError] = useState("")
  const [copied, setCopied] = useState(false)
  const [jsonInput, setJsonInput] = useState("")
  const [jsonError, setJsonError] = useState("")
  const [applying, setApplying] = useState(false)

  const requestKey = useMemo(() => JSON.stringify({ mode, requestBody }), [mode, requestBody])

  useEffect(() => {
    if (!open) return
    let cancelled = false
    void Promise.resolve().then(() => {
      if (cancelled) return
      const saved = window.localStorage.getItem("eduAiPreference")
      if (saved === "agent" || saved === "integrated") setTab(saved)
    })
    return () => {
      cancelled = true
    }
  }, [open])

  useEffect(() => {
    if (!open || tab !== "agent") return
    let cancelled = false
    void Promise.resolve().then(() => {
      if (cancelled) return
      setLoadingPrompt(true)
      setPromptError("")
      apiFetch("/api/preview-prompt", {
        method: "POST",
        body: JSON.stringify({ lessonRequestBody: requestBody, mode }),
      })
        .then(res => res.json())
        .then(data => {
          if (cancelled) return
          setPrompt(typeof data.prompt === "string" ? data.prompt : "")
        })
        .catch(error => {
          if (cancelled) return
          setPromptError(error instanceof Error ? error.message : "No pude generar el prompt.")
        })
        .finally(() => {
          if (!cancelled) setLoadingPrompt(false)
        })
    })
    return () => { cancelled = true }
  }, [open, tab, mode, requestKey, requestBody])

  const handleTabChange = (value: string) => {
    const next = value === "integrated" ? "integrated" : "agent"
    setTab(next)
    window.localStorage.setItem("eduAiPreference", next)
  }

  const handleCopyPrompt = async () => {
    await navigator.clipboard.writeText(prompt)
    setCopied(true)
    setTimeout(() => setCopied(false), 1800)
  }

  const validateJson = (raw: string) => {
    const parsed = parseJsonResponse(raw)
    const hasRecognizedField = RECOGNIZED_FIELDS.some(field =>
      Object.prototype.hasOwnProperty.call(parsed, field)
    )
    if (!hasRecognizedField) throw new Error("Ese JSON no trae campos reconocibles de una clase.")
  }

  const handleApply = async () => {
    setJsonError("")
    try {
      validateJson(jsonInput)
      setApplying(true)
      await onApplyExternalJson(jsonInput)
      setJsonInput("")
      onOpenChange(false)
    } catch (error) {
      setJsonError(error instanceof Error ? error.message : "No pude aplicar ese JSON.")
    } finally {
      setApplying(false)
    }
  }

  const handleGenerateIntegrated = async () => {
    await onGenerateIntegrated()
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] overflow-hidden sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Asistente IA</DialogTitle>
          <DialogDescription>Elige como quieres trabajar esta clase.</DialogDescription>
        </DialogHeader>

        <Tabs value={tab} onValueChange={handleTabChange} className="min-h-0">
          <TabsList className="w-full">
            <TabsTrigger value="agent" className="flex-1">
              <ClipboardCopy className="h-4 w-4" /> Mi agente
            </TabsTrigger>
            <TabsTrigger value="integrated" className="flex-1">
              <Bot className="h-4 w-4" /> IA integrada
            </TabsTrigger>
          </TabsList>

          <TabsContent value="agent" className="mt-3 min-h-0 space-y-3">
            <div className="grid gap-3 lg:grid-cols-[1fr_1fr]">
              <div className="min-h-0">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="text-[12px] font-bold text-muted-foreground uppercase tracking-wide">Prompt</p>
                  <button
                    type="button"
                    onClick={handleCopyPrompt}
                    disabled={!prompt || loadingPrompt}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-[11px] font-bold hover:bg-muted/60 disabled:opacity-50"
                  >
                    {copied ? <Check className="h-3.5 w-3.5" /> : <ClipboardCopy className="h-3.5 w-3.5" />}
                    {copied ? "Copiado" : "Copiar"}
                  </button>
                </div>
                <textarea
                  readOnly
                  value={loadingPrompt ? "Generando prompt..." : prompt}
                  className="h-[320px] w-full resize-none rounded-[10px] border border-border bg-muted/30 p-3 font-mono text-[11px] leading-relaxed outline-none"
                />
                {promptError && (
                  <p className="mt-2 flex items-center gap-1.5 text-[11px] font-semibold text-red-600">
                    <AlertCircle className="h-3.5 w-3.5" /> {promptError}
                  </p>
                )}
              </div>

              <div>
                <p className="mb-2 text-[12px] font-bold text-muted-foreground uppercase tracking-wide">Respuesta JSON</p>
                <textarea
                  value={jsonInput}
                  onChange={e => {
                    setJsonInput(e.target.value)
                    setJsonError("")
                  }}
                  placeholder='{"objetivo":"...","inicio":"<p>...</p>"}'
                  className="h-[320px] w-full resize-none rounded-[10px] border border-border bg-background p-3 font-mono text-[11px] leading-relaxed outline-none focus:border-primary"
                />
                {jsonError && (
                  <p className="mt-2 flex items-center gap-1.5 text-[11px] font-semibold text-red-600">
                    <AlertCircle className="h-3.5 w-3.5" /> {jsonError}
                  </p>
                )}
                <button
                  type="button"
                  onClick={handleApply}
                  disabled={!jsonInput.trim() || applying}
                  className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-[10px] bg-primary px-4 py-2.5 text-[12px] font-bold text-white hover:opacity-90 disabled:opacity-50"
                >
                  {applying ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
                  Aplicar a la clase
                </button>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="integrated" className="mt-3 space-y-3">
            <div className="rounded-[12px] border border-border bg-background p-4">
              <p className="text-[13px] font-bold text-foreground">Generacion directa</p>
              <p className="mt-1 text-[12px] text-muted-foreground">
                Usa el proveedor configurado en EduPanel para completar la clase sin salir de esta pantalla.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={handleGenerateIntegrated}
                  disabled={isGenerating}
                  className="inline-flex items-center gap-2 rounded-[10px] bg-primary px-4 py-2.5 text-[12px] font-bold text-white hover:opacity-90 disabled:opacity-60"
                >
                  {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
                  Generar
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onOpenIntegratedChat()
                    onOpenChange(false)
                  }}
                  className="inline-flex items-center gap-2 rounded-[10px] border border-border px-4 py-2.5 text-[12px] font-bold hover:bg-muted/60"
                >
                  <Bot className="h-4 w-4" /> Abrir chat
                </button>
                {!hasConfiguredProvider && (
                  <button
                    type="button"
                    onClick={() => {
                      onConfigureProvider()
                      onOpenChange(false)
                    }}
                    className="inline-flex items-center gap-2 rounded-[10px] border border-border px-4 py-2.5 text-[12px] font-bold hover:bg-muted/60"
                  >
                    <Settings2 className="h-4 w-4" /> Configurar proveedor
                  </button>
                )}
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}
