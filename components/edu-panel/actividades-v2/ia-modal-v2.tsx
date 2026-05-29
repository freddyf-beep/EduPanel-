"use client"

import { useEffect, useMemo, useState } from "react"
import {
  AlertCircle,
  Bot,
  Check,
  CheckCircle2,
  ClipboardCopy,
  ExternalLink,
  GraduationCap,
  Loader2,
  Search,
  Settings2,
  Sparkles,
  Wand2,
} from "lucide-react"
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
import {
  buildPedagogicalBrief,
  type PedagogicalBrief,
  type PedagogicalExternalSource,
} from "@/lib/ai/pedagogical-engine"

const RECOGNIZED_FIELDS = [
  { key: "objetivo", label: "Objetivo de la Clase" },
  { key: "inicio", label: "Momento Inicio" },
  { key: "desarrollo", label: "Momento Desarrollo" },
  { key: "cierre", label: "Momento Cierre" },
  { key: "adecuacion", label: "Adecuación DUA" },
  { key: "materiales", label: "Materiales y Recursos" },
  { key: "tics", label: "Tecnologías (TIC)" },
  { key: "indicadoresEvaluacion", label: "Indicadores de Evaluación" },
  { key: "actividadEvaluacion", label: "Actividad de Evaluación" },
] as const

type IaPreference = "agent" | "integrated"
type FocoPedagogico = "dua" | "abp" | "activo" | "inclusion"

interface IaModalV2Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  requestBody: LessonRequestBody
  mode: CopilotMode
  hasConfiguredProvider: boolean
  isGenerating: boolean
  onApplyExternalJson: (rawJson: string) => Promise<void> | void
  onGenerateIntegrated: (options?: {
    foco?: string
    tono?: string
    pedagogicalBrief?: PedagogicalBrief
    allowExternalSearch?: boolean
  }) => Promise<void> | void
  onOpenIntegratedChat: () => void
  onConfigureProvider: () => void
}

export function IaModalV2({
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
}: IaModalV2Props) {
  const [tab, setTab] = useState<IaPreference>("agent")
  const [prompt, setPrompt] = useState("")
  const [loadingPrompt, setLoadingPrompt] = useState(false)
  const [promptError, setPromptError] = useState("")
  const [copied, setCopied] = useState(false)
  const [jsonInput, setJsonInput] = useState("")
  const [jsonError, setJsonError] = useState("")
  const [applying, setApplying] = useState(false)

  // Configuración de IA Integrada
  const [foco, setFoco] = useState<FocoPedagogico>("dua")
  const [tono, setTono] = useState<string>("ludico")
  const [brief, setBrief] = useState<PedagogicalBrief | null>(null)
  const [briefText, setBriefText] = useState("")
  const [externalSources, setExternalSources] = useState<PedagogicalExternalSource[]>([])
  const [externalSearchError, setExternalSearchError] = useState("")
  const [isSearchingExternal, setIsSearchingExternal] = useState(false)

  // Simulación de logs de progreso
  const [progressStep, setProgressStep] = useState(0)
  const progressLogs = useMemo(() => [
    "Analizando Objetivos de Aprendizaje (OAs) y Cobertura...",
    "Redactando Momentos Pedagógicos (Inicio, Desarrollo, Cierre)...",
    "Inyectando adecuaciones específicas de " + (
      foco === "dua" ? "Diseño Universal de Aprendizaje (DUA)" :
      foco === "abp" ? "Aprendizaje Basado en Proyectos (ABP)" :
      foco === "activo" ? "Metodología Activa y Aula Invertida" : "Inclusión PIE / Necesidades Especiales"
    ) + "...",
    "Calibrando taxonomía de Bloom y distribuciones de dificultad...",
    "Finalizando estructuración del JSON para EduPanel..."
  ], [foco])

  const requestKey = useMemo(() => JSON.stringify({ mode, requestBody }), [mode, requestBody])

  const integratedRequestBody = useMemo<LessonRequestBody>(() => ({
    ...requestBody,
    engine: "pedagogical_v1",
    focoPedagogico: foco,
    tono,
    allowExternalSearch: externalSources.length > 0,
    pedagogicalBrief: brief
      ? {
          ...brief,
          textoEditable: briefText || brief.textoEditable,
          fuentesExternas: externalSources,
        }
      : undefined,
    externalSources,
  }), [requestBody, foco, tono, brief, briefText, externalSources])

  // Carga preferencia de pestaña guardada
  useEffect(() => {
    if (!open) return
    const saved = window.localStorage.getItem("eduAiPreference")
    if (saved === "agent" || saved === "integrated") setTab(saved)
  }, [open])

  // Obtener prompt de copiloto externo
  useEffect(() => {
    if (!open || tab !== "agent") return
    let cancelled = false
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
    return () => { cancelled = true }
  }, [open, tab, mode, requestKey])

  // Preparar brief editable para el Motor Pedagogico v1.
  useEffect(() => {
    if (!open || tab !== "integrated") return
    const nextBrief = buildPedagogicalBrief({
      ...requestBody,
      engine: "pedagogical_v1",
      focoPedagogico: foco,
      tono,
    })
    setBrief(nextBrief)
    setBriefText(nextBrief.textoEditable)
    setExternalSources([])
    setExternalSearchError("")
  }, [open, tab, requestKey, foco, tono, requestBody])

  // Simular los pasos de progreso mientras genera la IA
  useEffect(() => {
    if (!isGenerating) {
      setProgressStep(0)
      return
    }
    const interval = setInterval(() => {
      setProgressStep(prev => (prev < progressLogs.length - 1 ? prev + 1 : prev))
    }, 2800)
    return () => clearInterval(interval)
  }, [isGenerating, progressLogs.length])

  // Validador y detector de JSON en tiempo real
  const detectedFields = useMemo(() => {
    if (!jsonInput.trim()) return {}
    try {
      const parsed = parseJsonResponse(jsonInput)
      const detected: Record<string, boolean> = {}
      RECOGNIZED_FIELDS.forEach(f => {
        detected[f.key] = Object.prototype.hasOwnProperty.call(parsed, f.key) && 
          parsed[f.key] !== null && 
          parsed[f.key] !== undefined && 
          parsed[f.key] !== ""
      })
      return detected
    } catch {
      return {}
    }
  }, [jsonInput])

  const isValidJson = useMemo(() => {
    return Object.values(detectedFields).some(val => val === true)
  }, [detectedFields])

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

  const handleApply = async () => {
    setJsonError("")
    try {
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

  const handleSearchExternal = async () => {
    const baseBrief = brief || buildPedagogicalBrief(integratedRequestBody)
    const currentBrief: PedagogicalBrief = {
      ...baseBrief,
      textoEditable: briefText || baseBrief.textoEditable,
      fuentesExternas: externalSources,
    }

    setIsSearchingExternal(true)
    setExternalSearchError("")

    try {
      const res = await apiFetch("/api/pedagogical-search", {
        method: "POST",
        body: JSON.stringify({
          query: currentBrief.textoEditable || currentBrief.diagnostico,
          lessonRequestBody: {
            ...integratedRequestBody,
            allowExternalSearch: true,
            pedagogicalBrief: currentBrief,
          },
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(typeof data.error === "string" ? data.error : "No pude buscar estrategias externas.")
      }

      const sources: PedagogicalExternalSource[] = Array.isArray(data.fuentes)
        ? data.fuentes
            .map((source: PedagogicalExternalSource) => ({
              title: typeof source.title === "string" ? source.title : "Fuente externa",
              uri: typeof source.uri === "string" ? source.uri : "",
              snippet: typeof source.snippet === "string" ? source.snippet : undefined,
            }))
            .filter((source: PedagogicalExternalSource) => source.uri)
            .slice(0, 6)
        : []
      const recommendations: string[] = Array.isArray(data.recomendaciones)
        ? data.recomendaciones.filter((item: unknown): item is string => typeof item === "string" && item.trim().length > 0)
        : []

      const externalBlock = [
        currentBrief.textoEditable,
        "",
        "Aportes externos controlados:",
        typeof data.resumen === "string" && data.resumen.trim() ? `- ${data.resumen.trim()}` : "",
        ...recommendations.map((item) => `- ${item.trim()}`),
      ].filter(Boolean).join("\n")

      const nextBrief: PedagogicalBrief = {
        ...currentBrief,
        textoEditable: externalBlock,
        fuentesExternas: sources,
      }
      setBrief(nextBrief)
      setBriefText(externalBlock)
      setExternalSources(sources)
    } catch (error) {
      setExternalSearchError(error instanceof Error ? error.message : "No pude buscar estrategias externas.")
    } finally {
      setIsSearchingExternal(false)
    }
  }

  const handleGenerateIntegrated = async () => {
    const baseBrief = brief || buildPedagogicalBrief(integratedRequestBody)
    setProgressStep(0)
    await onGenerateIntegrated({
      foco,
      tono,
      allowExternalSearch: externalSources.length > 0,
      pedagogicalBrief: {
        ...baseBrief,
        textoEditable: briefText || baseBrief.textoEditable,
        fuentesExternas: externalSources,
      },
    })
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-hidden sm:max-w-4xl border border-white/10 dark:border-white/5 bg-card/95 dark:bg-zinc-950/95 backdrop-blur-md rounded-2xl shadow-2xl p-0">
        
        {/* Header con estética premium */}
        <div className="relative overflow-hidden px-6 pt-6 pb-4 border-b border-border bg-gradient-to-r from-violet-600/10 via-fuchsia-600/5 to-transparent">
          <div className="absolute top-0 right-0 h-40 w-40 rounded-full bg-violet-500/10 blur-3xl -z-10" />
          <div className="absolute bottom-0 left-10 h-32 w-32 rounded-full bg-fuchsia-500/10 blur-3xl -z-10" />
          
          <DialogHeader>
            <div className="flex items-center gap-2.5">
              <div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white shadow-md shadow-violet-500/20">
                <Sparkles className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <DialogTitle className="text-[18px] font-extrabold tracking-tight">Asistente IA Avanzado</DialogTitle>
                <DialogDescription className="text-[12.5px] mt-0.5">
                  Planifica tu clase a tu medida utilizando el copiloto externo o generación interna.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
        </div>

        <div className="max-h-[68vh] overflow-y-auto px-6 py-4">
          <Tabs value={tab} onValueChange={handleTabChange} className="w-full">
            <TabsList className="grid w-full grid-cols-2 rounded-xl bg-muted/60 p-1 mb-4">
              <TabsTrigger 
                value="agent" 
                className="rounded-lg py-2.5 text-[13px] font-bold transition-all data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm flex items-center justify-center gap-2"
              >
                <GraduationCap className="h-4 w-4 text-violet-500" /> Mi Copiloto Externo (ChatGPT/Claude)
              </TabsTrigger>
              <TabsTrigger 
                value="integrated" 
                className="rounded-lg py-2.5 text-[13px] font-bold transition-all data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm flex items-center justify-center gap-2"
              >
                <Bot className="h-4 w-4 text-fuchsia-500" /> IA Integrada (Gemini 1-Clic)
              </TabsTrigger>
            </TabsList>

            {/* Pestaña: Mi Agente / Copiloto Externo */}
            <TabsContent value="agent" className="mt-0 space-y-4">
              <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
                {/* Lado izquierdo: Obtener prompt */}
                <div className="flex flex-col rounded-xl border border-border bg-background/50 p-4">
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <div>
                      <p className="text-[13px] font-bold text-foreground">1. Copia las Instrucciones</p>
                      <p className="text-[11px] text-muted-foreground">Llévate el prompt con todo el currículo cargado.</p>
                    </div>
                    <button
                      type="button"
                      onClick={handleCopyPrompt}
                      disabled={!prompt || loadingPrompt}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-primary/20 bg-primary/5 px-3 py-1.5 text-[12px] font-bold text-primary hover:bg-primary/10 disabled:opacity-50 transition-all cursor-pointer"
                    >
                      {copied ? <Check className="h-3.5 w-3.5" /> : <ClipboardCopy className="h-3.5 w-3.5" />}
                      {copied ? "¡Copiado!" : "Copiar Prompt"}
                    </button>
                  </div>
                  <textarea
                    readOnly
                    value={loadingPrompt ? "Generando contexto y prompt de la clase..." : prompt}
                    className="h-[250px] w-full resize-none rounded-lg border border-border bg-muted/40 p-3 font-mono text-[11px] leading-relaxed outline-none focus:border-violet-500/50"
                  />
                  {promptError && (
                    <p className="mt-2 flex items-center gap-1.5 text-[11px] font-semibold text-red-500">
                      <AlertCircle className="h-3.5 w-3.5" /> {promptError}
                    </p>
                  )}
                </div>

                {/* Lado derecho: Pegado Inteligente */}
                <div className="flex flex-col rounded-xl border border-border bg-background/50 p-4 justify-between">
                  <div>
                    <div className="mb-3">
                      <p className="text-[13px] font-bold text-foreground">2. Pega la Respuesta</p>
                      <p className="text-[11px] text-muted-foreground">Pega cualquier texto. Limpiaremos y detectaremos campos automáticamente.</p>
                    </div>
                    <textarea
                      value={jsonInput}
                      onChange={e => {
                        setJsonInput(e.target.value)
                        setJsonError("")
                      }}
                      placeholder='Pega la respuesta del chat aquí (formato libre o JSON)...'
                      className="h-[150px] w-full resize-none rounded-lg border border-border bg-background p-3 font-mono text-[11px] leading-relaxed outline-none focus:border-fuchsia-500/50"
                    />
                    {jsonError && (
                      <p className="mt-2 flex items-center gap-1.5 text-[11px] font-semibold text-red-500">
                        <AlertCircle className="h-3.5 w-3.5" /> {jsonError}
                      </p>
                    )}
                  </div>

                  {/* Checklist visual en tiempo real */}
                  <div className="mt-3 bg-muted/40 p-3 rounded-lg border border-border">
                    <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-2">Campos detectados</p>
                    <div className="grid grid-cols-2 gap-1.5">
                      {RECOGNIZED_FIELDS.map(f => {
                        const isDetected = detectedFields[f.key]
                        return (
                          <div key={f.key} className="flex items-center gap-1.5">
                            <CheckCircle2 className={`h-3.5 w-3.5 ${isDetected ? "text-emerald-500 fill-emerald-500/10" : "text-muted-foreground/30"}`} />
                            <span className={`text-[11px] font-medium leading-none ${isDetected ? "text-foreground font-semibold" : "text-muted-foreground/60"}`}>
                              {f.label}
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleApply}
                    disabled={!isValidJson || applying}
                    className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-violet-600 to-fuchsia-600 px-4 py-2.5 text-[13px] font-bold text-white hover:opacity-95 disabled:opacity-40 transition-all shadow-md shadow-violet-500/15 cursor-pointer"
                  >
                    {applying ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
                    Aplicar a la Clase
                  </button>
                </div>
              </div>
            </TabsContent>

            {/* Pestaña: IA Integrada */}
            <TabsContent value="integrated" className="mt-0 space-y-4">
              <div className="rounded-xl border border-border bg-background/50 p-4">
                <div className="mb-4">
                  <h3 className="text-[13px] font-bold text-foreground">Configura tu Foco Pedagógico</h3>
                  <p className="text-[11px] text-muted-foreground">La IA inyectará pautas metodológicas personalizadas en toda la sesión.</p>
                </div>

                {/* Grid de Focos Pedagógicos */}
                <div className="grid gap-3 grid-cols-2 sm:grid-cols-4 mb-5">
                  {[
                    { id: "dua", title: "DUA (Inclusión)", desc: "Diversidad y accesibilidad universal" },
                    { id: "abp", title: "ABP", desc: "Aprendizaje Basado en Proyectos" },
                    { id: "activo", title: "Aula Invertida", desc: "Gamificación y participación activa" },
                    { id: "inclusion", title: "PIE / NEE", desc: "Foco curricular adaptado y remedial" }
                  ].map(item => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setFoco(item.id as FocoPedagogico)}
                      className={`flex flex-col text-left p-3 rounded-xl border transition-all cursor-pointer ${
                        foco === item.id 
                          ? "border-violet-500/80 bg-violet-500/5 ring-2 ring-violet-500/20 shadow-sm" 
                          : "border-border bg-background hover:bg-muted/40 hover:border-muted-foreground/20"
                      }`}
                    >
                      <span className="text-[12px] font-extrabold text-foreground">{item.title}</span>
                      <span className="text-[10px] text-muted-foreground mt-1 leading-snug">{item.desc}</span>
                    </button>
                  ))}
                </div>

                {/* Foco de Tono */}
                <div className="mb-5">
                  <h3 className="text-[12.5px] font-bold text-foreground mb-2">Tono de la clase</h3>
                  <div className="flex gap-2">
                    {[
                      { id: "ludico", label: "Lúdico e interactivo" },
                      { id: "academico", label: "Académico y formal" },
                      { id: "tecnico", label: "Práctico y guiado" }
                    ].map(t => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => setTono(t.id)}
                        className={`px-3 py-1.5 rounded-lg text-[11.5px] font-bold border transition-colors cursor-pointer ${
                          tono === t.id 
                            ? "border-fuchsia-500 bg-fuchsia-500/5 text-fuchsia-600 dark:text-fuchsia-400 font-extrabold" 
                            : "border-border bg-background hover:bg-muted/55"
                        }`}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="mb-5 border-t border-border pt-4">
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h3 className="text-[12.5px] font-bold text-foreground">Brief pedagogico editable</h3>
                      <p className="text-[11px] text-muted-foreground">Diagnostico, estrategia, riesgos, adecuaciones y evidencia que alimentaran la clase completa.</p>
                    </div>
                    <button
                      type="button"
                      onClick={handleSearchExternal}
                      disabled={isSearchingExternal || isGenerating}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-[11.5px] font-bold text-foreground hover:bg-muted/50 disabled:opacity-50 cursor-pointer"
                    >
                      {isSearchingExternal ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
                      Buscar estrategias externas
                    </button>
                  </div>
                  <textarea
                    value={briefText}
                    onChange={(event) => setBriefText(event.target.value)}
                    placeholder="Prepara el brief pedagogico antes de generar..."
                    className="min-h-[170px] w-full resize-y rounded-lg border border-border bg-background p-3 text-[11.5px] leading-relaxed outline-none focus:border-violet-500/50"
                  />
                  {externalSearchError && (
                    <p className="mt-2 flex items-center gap-1.5 text-[11px] font-semibold text-red-500">
                      <AlertCircle className="h-3.5 w-3.5" /> {externalSearchError}
                    </p>
                  )}
                  {externalSources.length > 0 && (
                    <div className="mt-3 space-y-1.5">
                      <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Fuentes usadas</p>
                      {externalSources.map((source) => (
                        <a
                          key={source.uri}
                          href={source.uri}
                          target="_blank"
                          rel="noreferrer"
                          className="flex min-w-0 items-center gap-1.5 text-[11px] font-semibold text-primary hover:underline"
                        >
                          <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                          <span className="truncate">{source.title}</span>
                        </a>
                      ))}
                    </div>
                  )}
                </div>

                {/* Consola de Progreso Animada */}
                {isGenerating && (
                  <div className="mb-4 rounded-xl border border-zinc-800 bg-zinc-950 p-4 font-mono text-[11px] text-emerald-400 shadow-inner">
                    <div className="flex items-center gap-2 text-[12px] font-bold text-white mb-2">
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-fuchsia-500" />
                      <span>PROCESANDO EN GEMINI API v2</span>
                    </div>
                    <div className="space-y-1.5 text-zinc-300">
                      {progressLogs.map((log, idx) => {
                        const isCurrent = progressStep === idx
                        const isCompleted = progressStep > idx
                        return (
                          <div key={idx} className="flex items-start gap-1.5">
                            {isCompleted ? (
                              <span className="text-emerald-500">✓</span>
                            ) : isCurrent ? (
                              <span className="text-fuchsia-500 animate-pulse">❯</span>
                            ) : (
                              <span className="text-zinc-600">·</span>
                            )}
                            <span className={
                              isCompleted ? "text-emerald-500/80 line-through" :
                              isCurrent ? "text-white font-bold" : "text-zinc-500"
                            }>
                              {log}
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}

                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleGenerateIntegrated}
                      disabled={isGenerating}
                      className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-violet-600 to-fuchsia-600 px-5 py-2.5 text-[13px] font-bold text-white hover:opacity-95 disabled:opacity-55 shadow-md shadow-violet-500/10 cursor-pointer"
                    >
                      {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
                      Generar con Motor Pedagogico
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        onOpenIntegratedChat()
                        onOpenChange(false)
                      }}
                      className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2.5 text-[12.5px] font-bold bg-background hover:bg-muted/50 cursor-pointer"
                    >
                      <Bot className="h-4 w-4" /> Abrir Chat Lateral
                    </button>
                  </div>

                  {!hasConfiguredProvider && (
                    <button
                      type="button"
                      onClick={() => {
                        onConfigureProvider()
                        onOpenChange(false)
                      }}
                      className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground hover:text-foreground cursor-pointer"
                    >
                      <Settings2 className="h-3.5 w-3.5" /> Configurar API Key / Parámetros
                    </button>
                  )}
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </div>

        {/* Footer simple */}
        <div className="flex items-center justify-end gap-2 border-t border-border px-6 py-3.5 bg-muted/20">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="rounded-lg border border-border bg-background px-4 py-2 text-[12.5px] font-bold text-muted-foreground hover:bg-muted cursor-pointer"
          >
            Cerrar
          </button>
        </div>

      </DialogContent>
    </Dialog>
  )
}
