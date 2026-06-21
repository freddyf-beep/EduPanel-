"use client"

import { useEffect, useMemo, useState } from "react"
import { AlertCircle, Bot, Check, ClipboardCopy, Columns3, Loader2, Settings2, Wand2, X } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { buildCopilotPrompt, parseJsonResponse, type CopilotMode, type LessonRequestBody } from "@/lib/ai/copilot"

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

const SUBJECT_STYLES = [
  { bg: "bg-rose-50", border: "border-rose-200", text: "text-rose-700", pill: "bg-rose-100 text-rose-700", header: "from-rose-50 to-pink-50" },
  { bg: "bg-amber-50", border: "border-amber-200", text: "text-amber-700", pill: "bg-amber-100 text-amber-800", header: "from-amber-50 to-orange-50" },
  { bg: "bg-emerald-50", border: "border-emerald-200", text: "text-emerald-700", pill: "bg-emerald-100 text-emerald-700", header: "from-emerald-50 to-teal-50" },
  { bg: "bg-sky-50", border: "border-sky-200", text: "text-sky-700", pill: "bg-sky-100 text-sky-700", header: "from-sky-50 to-cyan-50" },
  { bg: "bg-violet-50", border: "border-violet-200", text: "text-violet-700", pill: "bg-violet-100 text-violet-700", header: "from-violet-50 to-fuchsia-50" },
] as const

export interface RelatedCurriculumPromptOption {
  id: string
  asignatura: string
  unidad: string
  resumen: string
  oas: string[]
}

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
  relatedCurriculumOptions?: RelatedCurriculumPromptOption[]
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
  relatedCurriculumOptions = [],
}: IaModalProps) {
  const [tab, setTab] = useState<IaPreference>("agent")
  const [copied, setCopied] = useState(false)
  const [jsonInput, setJsonInput] = useState("")
  const [jsonError, setJsonError] = useState("")
  const [applying, setApplying] = useState(false)
  const [includeExternalResearch, setIncludeExternalResearch] = useState(false)
  const [selectedRelatedIds, setSelectedRelatedIds] = useState<string[]>([])
  const [showRelatedCurriculum, setShowRelatedCurriculum] = useState(false)
  const [activeSubject, setActiveSubject] = useState("")

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
    if (!open) return
    setSelectedRelatedIds(prev => prev.filter(id => relatedCurriculumOptions.some(option => option.id === id)))
  }, [open, relatedCurriculumOptions])

  const selectedRelated = useMemo(
    () => relatedCurriculumOptions.filter(option => selectedRelatedIds.includes(option.id)),
    [relatedCurriculumOptions, selectedRelatedIds],
  )

  const relatedBySubject = useMemo(() => {
    return relatedCurriculumOptions.reduce<Record<string, RelatedCurriculumPromptOption[]>>((acc, option) => {
      acc[option.asignatura] = [...(acc[option.asignatura] || []), option]
      return acc
    }, {})
  }, [relatedCurriculumOptions])

  const relatedSubjects = useMemo(() => Object.keys(relatedBySubject), [relatedBySubject])

  const subjectStyle = (subject: string) => {
    const index = Math.max(relatedSubjects.indexOf(subject), 0)
    return SUBJECT_STYLES[index % SUBJECT_STYLES.length]
  }

  useEffect(() => {
    if (!activeSubject || !relatedBySubject[activeSubject]) {
      setActiveSubject(relatedSubjects[0] || "")
    }
  }, [activeSubject, relatedBySubject, relatedSubjects])

  const toggleRelatedOption = (id: string, checked: boolean) => {
    setSelectedRelatedIds(prev => checked ? [...new Set([...prev, id])] : prev.filter(item => item !== id))
  }

  const prompt = useMemo(() => {
    const base = `// Prompt v2 - EduPanel\n\n${buildCopilotPrompt(requestBody, mode)}`
    const extras: string[] = []

    if (selectedRelated.length > 0) {
      extras.push([
        "CURRICULO RELACIONADO SELECCIONADO POR EL DOCENTE:",
        "Usa estas conexiones solo si aportan a la clase. No fuerces integracion interdisciplinaria.",
        ...selectedRelated.map(option => [
          `- ${option.asignatura} / ${option.unidad}: ${option.resumen}`,
          option.oas.length ? `  OA o focos relevantes: ${option.oas.join(" | ")}` : "",
        ].filter(Boolean).join("\n")),
      ].join("\n"))
    }

    if (includeExternalResearch) {
      extras.push([
        "INVESTIGACION EXTERNA SOLICITADA:",
        "Busca o verifica recursos reales antes de proponerlos.",
        "Si recomiendas canciones, videos, sitios o estrategias, entrega nombres concretos, enlaces verificables cuando corresponda y una justificacion pedagogica breve.",
        "No inventes enlaces, autores ni videos. Si no puedes verificar algo, dilo y propone criterios de busqueda.",
        "Prioriza recursos realistas para sala de clases chilena y alternativas de baja complejidad.",
      ].join("\n"))
    }

    return extras.length ? `${base}\n\n---\n${extras.join("\n\n")}` : base
  }, [includeExternalResearch, mode, requestBody, selectedRelated])

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
                    disabled={!prompt}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-[11px] font-bold hover:bg-muted/60 disabled:opacity-50"
                  >
                    {copied ? <Check className="h-3.5 w-3.5" /> : <ClipboardCopy className="h-3.5 w-3.5" />}
                    {copied ? "Copiado" : "Copiar"}
                  </button>
                </div>
                <textarea
                  readOnly
                  value={prompt}
                  className="h-[320px] w-full resize-none rounded-[10px] border border-border bg-muted/30 p-3 font-mono text-[11px] leading-relaxed outline-none"
                />
                <div className="mt-3 rounded-[12px] border border-border bg-background p-3">
                  <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Contexto extra del prompt</p>
                  <label className="mb-2 flex items-start gap-2 text-[11.5px] font-semibold text-foreground">
                    <input type="checkbox" checked disabled className="mt-0.5" />
                    <span>
                      Continuidad de clases anteriores
                      <span className="block text-[10.5px] font-medium text-muted-foreground">Siempre incluida cuando existen clases previas guardadas.</span>
                    </span>
                  </label>
                  <div className="mb-2">
                    <button
                      type="button"
                      onClick={() => setShowRelatedCurriculum(true)}
                      className="flex w-full items-center justify-between rounded-[10px] border border-sky-200 bg-sky-50 px-3 py-2 text-left text-[11.5px] font-bold text-sky-800 hover:border-sky-300 hover:bg-sky-100"
                    >
                      <span>Curriculo relacionado ({selectedRelatedIds.length})</span>
                      <Columns3 className="h-4 w-4" />
                    </button>
                    <p className="mt-1 text-[10.5px] font-medium text-muted-foreground">
                      Abre una vista por asignaturas para elegir unidades que alimentan el prompt.
                    </p>
                  </div>
                  <label className="flex items-start gap-2 text-[11.5px] font-semibold text-foreground">
                    <input
                      type="checkbox"
                      checked={includeExternalResearch}
                      onChange={e => setIncludeExternalResearch(e.target.checked)}
                      className="mt-0.5"
                    />
                    <span>
                      Investigacion externa
                      <span className="block text-[10.5px] font-medium text-muted-foreground">Pide buscar/verificar recursos reales, enlaces, canciones, videos o didacticas.</span>
                    </span>
                  </label>
                </div>
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

        {showRelatedCurriculum && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
            <div className="flex h-[86vh] w-full max-w-6xl flex-col overflow-hidden rounded-[18px] border border-border bg-background shadow-2xl">
              <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
                <div>
                  <p className="text-[15px] font-extrabold text-foreground">Curriculo relacionado</p>
                  <p className="mt-1 text-[12px] font-medium text-muted-foreground">
                    Selecciona unidades de otras asignaturas para sumar su contexto al prompt de Mi agente.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowRelatedCurriculum(false)}
                  className="rounded-full border border-border p-2 text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                  aria-label="Cerrar curriculo relacionado"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {relatedCurriculumOptions.length === 0 ? (
                <div className="flex min-h-72 items-center justify-center p-8 text-center">
                  <p className="max-w-md text-[13px] font-semibold text-muted-foreground">
                    No hay curriculum relacionado cargado para este nivel. Cuando existan unidades de otras asignaturas, apareceran aqui.
                  </p>
                </div>
              ) : (
                <div className="min-h-0 flex-1 overflow-hidden">
                    <div className="grid h-full min-h-0 grid-cols-[230px_1fr] overflow-hidden">
                      <div className="border-r border-border bg-gradient-to-b from-slate-50 to-white p-3">
                        <p className="mb-2 text-[10.5px] font-extrabold uppercase tracking-wide text-muted-foreground">Asignaturas</p>
                        <div className="space-y-2">
                          {relatedSubjects.map(subject => {
                            const style = subjectStyle(subject)
                            const selectedCount = relatedBySubject[subject].filter(option => selectedRelatedIds.includes(option.id)).length
                            return (
                              <button
                                key={subject}
                                type="button"
                                onClick={() => setActiveSubject(subject)}
                                className={`w-full rounded-[12px] border px-3 py-2 text-left transition-colors ${activeSubject === subject ? `${style.bg} ${style.border} shadow-sm` : "border-transparent bg-white hover:border-border"}`}
                              >
                                <span className={`block text-[12px] font-extrabold ${activeSubject === subject ? style.text : "text-foreground"}`}>{subject}</span>
                                <span className="mt-1 flex items-center justify-between gap-2 text-[10.5px] font-bold text-muted-foreground">
                                  <span>{relatedBySubject[subject].length} unidades</span>
                                  <span className={`rounded-full px-2 py-0.5 ${style.pill}`}>{selectedCount} elegidas</span>
                                </span>
                              </button>
                            )
                          })}
                        </div>
                      </div>

                      <div className="overflow-auto p-4">
                        {(() => {
                          const subject = activeSubject || relatedSubjects[0] || ""
                          const style = subjectStyle(subject)
                          const options = relatedBySubject[subject] || []
                          return (
                            <div className={`overflow-hidden rounded-[16px] border ${style.border} bg-white`}>
                              <div className={`border-b ${style.border} bg-gradient-to-r ${style.header} px-4 py-3`}>
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <div>
                                    <p className={`text-[15px] font-extrabold ${style.text}`}>{subject}</p>
                                    <p className="text-[11px] font-semibold text-muted-foreground">Comparador por unidades y foco curricular</p>
                                  </div>
                                  <span className={`rounded-full px-3 py-1 text-[11px] font-extrabold ${style.pill}`}>
                                    {options.filter(option => selectedRelatedIds.includes(option.id)).length}/{options.length} seleccionadas
                                  </span>
                                </div>
                              </div>

                              <div className="grid grid-cols-[44px_minmax(170px,220px)_1fr] border-b border-border bg-white px-3 py-2 text-[10px] font-extrabold uppercase tracking-wide text-muted-foreground">
                                <span></span>
                                <span>Unidad</span>
                                <span>Foco curricular</span>
                              </div>

                              {options.map(option => {
                                const checked = selectedRelatedIds.includes(option.id)
                                return (
                                  <label
                                    key={option.id}
                                    className={`grid cursor-pointer grid-cols-[44px_minmax(170px,220px)_1fr] border-b border-border px-3 py-3 last:border-b-0 ${checked ? style.bg : "hover:bg-slate-50"}`}
                                  >
                                    <span>
                                      <input
                                        type="checkbox"
                                        checked={checked}
                                        onChange={e => toggleRelatedOption(option.id, e.target.checked)}
                                      />
                                    </span>
                                    <span className="pr-3">
                                      <span className="block text-[12px] font-extrabold text-foreground">{option.unidad}</span>
                                      <span className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-[9.5px] font-extrabold ${style.pill}`}>{option.asignatura}</span>
                                    </span>
                                    <span className="text-[11.5px] leading-relaxed text-muted-foreground">
                                      {option.resumen}
                                      {option.oas.length > 0 && (
                                        <span className="mt-2 block rounded-[10px] bg-white/70 px-2.5 py-2 text-[10.5px] font-semibold leading-relaxed text-muted-foreground">
                                          OA: {option.oas.slice(0, 2).join(" | ")}
                                        </span>
                                      )}
                                    </span>
                                  </label>
                                )
                              })}
                            </div>
                          )
                        })()}
                      </div>
                    </div>
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-5 py-3">
                <p className="text-[11.5px] font-bold text-muted-foreground">
                  {selectedRelatedIds.length} unidades seleccionadas para el prompt.
                </p>
                <button
                  type="button"
                  onClick={() => setShowRelatedCurriculum(false)}
                  className="rounded-[10px] bg-primary px-4 py-2 text-[12px] font-bold text-white hover:opacity-90"
                >
                  Usar seleccion
                </button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
