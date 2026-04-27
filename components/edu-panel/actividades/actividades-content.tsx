"use client"

import { useState, useEffect, Suspense, useRef, useMemo } from "react"
import type { ReactNode } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import {
  ChevronLeft, Bookmark, Loader2, Check, ArrowRight,
  ChevronDown, ChevronRight, Plus, X, Target,
  Layers, Clipboard, FileText, Monitor, Package,
  RefreshCw, BookOpen, Calendar, Sparkles, Bot, Blocks,
  Send, Settings2, Wand2, KeyRound, ChevronUp, Mic, MicOff,
  PanelRightOpen, SlidersHorizontal, RotateCcw, BrainCircuit, Copy,
  Save, PencilLine, Trash2
} from "lucide-react"
import { cn } from "@/lib/utils"
import { useToast } from "@/components/ui/use-toast"
import {
  guardarActividadClase, cargarActividadClase,
  cargarCronogramaUnidad, cargarVerUnidad,
  guardarLibroClases, cargarLibroClases,
  getUnidadCompleta, initOAs, mergeOAs, cargarBancoActividades,
  eliminarActividadClase
} from "@/lib/curriculo"
import type { ActividadClase, OAEditado, ClaseCronograma, ActividadSugerida, EjemploEvaluacion } from "@/lib/curriculo"
import { ASIGNATURA, UNIT_COLORS, buildUrl } from "@/lib/shared"
import { cargarNivelMapping, resolveNivel } from "@/lib/nivel-mapping"
import {
  DEFAULT_AI_CONFIG, AI_PROVIDER_OPTIONS, normalizeAiConfig, getProviderMeta,
  buildCopilotPrompt, htmlToPlainText, PROMPT_MODE_LABELS,
  parseJsonResponse, coerceGeneratedLesson,
  type CopilotMode, type StoredAiConfig,
} from "@/lib/ai/copilot"
import dynamic from 'next/dynamic'

const ReactQuill = dynamic(() => import('react-quill-new'), { ssr: false })

const ESTADOS = [
  { key: "no_planificada", label: "No planificada", cls: "bg-background border border-border text-muted-foreground" },
  { key: "planificada", label: "Planificada", cls: "bg-blue-50 border border-blue-200 text-blue-700" },
  { key: "realizada", label: "Realizada", cls: "bg-green-50 border border-green-200 text-green-700" },
] as const

const EXTERNAL_AI_FIELDS = [
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

function stripRichText(value?: string) {
  if (!value) return ""

  return value
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6]|section)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim()
}

function formatInlineHtml(text: string) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\*\*(.+?)\*\*/g, "<b>$1</b>")
}

function formatChatMessageHtml(text: string) {
  const source = text.trim()
  if (!source) return "<p></p>"
  if (/<(p|ul|ol|li|b|strong|em|br)\b/i.test(source)) return source

  const paragraphs = source.split(/\n{2,}/).map(block => block.trim()).filter(Boolean)

  return paragraphs.map((block) => {
    const lines = block.split("\n").map(line => line.trim()).filter(Boolean)
    const isList = lines.every(line => /^([-*•]|\d+\.)\s+/.test(line))

    if (isList) {
      return `<ul>${lines.map(line => `<li>${formatInlineHtml(line.replace(/^([-*•]|\d+\.)\s+/, ""))}</li>`).join("")}</ul>`
    }

    return `<p>${lines.map(line => formatInlineHtml(line)).join("<br/>")}</p>`
  }).join("")
}

// ─── Simple Rich Text Area ────────────────────────────────────────────────────
function RichArea({ value, onChange, placeholder, rows = 5 }: {
  value: string; onChange: (v: string) => void; placeholder?: string; rows?: number
}) {
  return (
    <div className="bg-background rounded-[10px] overflow-hidden border-[1.5px] border-border focus-within:border-primary transition-colors">
      <ReactQuill
        theme="snow"
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className="edu-quill"
      />
      <style dangerouslySetInnerHTML={{
        __html: `
        .edu-quill .ql-toolbar { border: none; border-bottom: 1.5px solid hsl(var(--border)); background: hsl(var(--muted)/0.3); border-radius: 10px 10px 0 0; }
        .edu-quill .ql-container { border: none !important; font-size: 13px; font-family: inherit; }
        .edu-quill .ql-editor { min-height: ${rows * 20}px; line-height: 1.6; }
        .edu-quill .ql-editor p { margin-bottom: 10px; }
      `}} />
    </div>
  )
}

// ─── OA Card con indicadores desplegables ─────────────────────────────────────
function OACard({ oa, color, selectedIndicadores, onToggleIndicador, onRemove }: {
  oa: OAEditado
  color: string
  selectedIndicadores?: string[]
  onToggleIndicador?: (oaId: string, indicadorId: string) => void
  onRemove?: () => void
}) {
  const [open, setOpen] = useState(false)
  const indicadoresDisponibles = oa.indicadores?.filter(i => i.seleccionado) || []
  const activeIds = selectedIndicadores ?? indicadoresDisponibles.map(i => i.id)
  const indicadoresSelec = indicadoresDisponibles.filter(i => activeIds.includes(i.id))

  return (
    <div className="border border-border rounded-[10px] overflow-hidden">
      <div className="flex items-start gap-2.5 px-3 py-3 bg-background">
        <div className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0" style={{ background: color }} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-[12px] font-bold" style={{ color }}>
              {oa.esPropio ? "Propio" : `OA ${oa.numero}`}
            </span>
            <span className="text-[10px] text-muted-foreground">Música</span>
          </div>
          <p className="text-[12px] leading-snug text-foreground">{oa.descripcion}</p>
          {indicadoresDisponibles.length > 0 && (
            <button
              onClick={() => setOpen(v => !v)}
              className="flex items-center gap-1 mt-1.5 text-[11px] font-semibold text-primary hover:opacity-70 transition-opacity"
            >
              {open ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
              {indicadoresSelec.length}/{indicadoresDisponibles.length} indicador{indicadoresDisponibles.length !== 1 ? "es" : ""}
            </button>
          )}
        </div>
        {onRemove && (
          <button onClick={onRemove} className="text-muted-foreground hover:text-red-500 transition-colors">
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
      {open && indicadoresDisponibles.length > 0 && (
        <div className="border-t border-border bg-card px-3 py-2.5 flex flex-col gap-1.5">
          {indicadoresDisponibles.map(ind => (
            <label key={ind.id} className="flex items-start gap-2 text-[11px] cursor-pointer rounded-md px-1 py-1 hover:bg-background">
              <input
                type="checkbox"
                checked={activeIds.includes(ind.id)}
                onChange={() => onToggleIndicador?.(oa.id, ind.id)}
                className="mt-0.5 h-3.5 w-3.5 rounded border-border accent-primary"
              />
              <span className="font-semibold flex-shrink-0" style={{ color }}>
                {oa.esPropio ? "Propio" : `OA ${oa.numero}`}
              </span>
              <span className={cn("leading-snug", activeIds.includes(ind.id) ? "text-muted-foreground" : "text-muted-foreground/50 line-through")}>{ind.texto}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  )
}

function HtmlPreview({ html, empty = "Sin registro." }: { html?: string; empty?: string }) {
  const text = stripRichText(html || "")
  if (!text) return <p className="text-[12px] text-muted-foreground">{empty}</p>
  return (
    <div
      className="prose prose-sm max-w-none text-[12px] leading-relaxed prose-p:my-1 prose-ul:my-1 prose-li:my-0 text-slate-700"
      dangerouslySetInnerHTML={{ __html: formatChatMessageHtml(html || text) }}
    />
  )
}

function BloomCard({
  label,
  nivel,
  texto,
  active,
  onSelect,
  onRegenerate,
  disabled,
}: {
  label: string
  nivel: "BAJO" | "MEDIO" | "ALTO"
  texto: string
  active: boolean
  onSelect: () => void
  onRegenerate: () => void
  disabled?: boolean
}) {
  const tone =
    nivel === "BAJO"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : nivel === "MEDIO"
        ? "border-sky-200 bg-sky-50 text-sky-700"
        : "border-fuchsia-200 bg-fuchsia-50 text-fuchsia-700"

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "group flex h-full min-h-[132px] flex-col rounded-[10px] border p-3 text-left transition-all hover:-translate-y-0.5 hover:shadow-sm",
        active ? "border-primary bg-pink-light/40 ring-2 ring-primary/15" : "border-border bg-background"
      )}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className={cn("rounded-full border px-2 py-0.5 text-[10px] font-extrabold uppercase", tone)}>
          {label}
        </span>
        <span className="text-[10px] font-bold text-muted-foreground">{nivel}</span>
      </div>
      <p className="flex-1 text-[12px] leading-relaxed text-foreground">{texto || "Pendiente de generar."}</p>
      <div className="mt-2 flex items-center justify-between">
        {active ? <span className="text-[10px] font-bold text-primary">Recomendado/activo</span> : <span />}
        <span
          role="button"
          tabIndex={0}
          onClick={(event) => {
            event.stopPropagation()
            onRegenerate()
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault()
              event.stopPropagation()
              onRegenerate()
            }
          }}
          aria-disabled={disabled}
          className={cn(
            "grid h-7 w-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-card hover:text-primary",
            disabled && "pointer-events-none opacity-50"
          )}
          title="Regenerar objetivos Bloom"
        >
          <RefreshCw className="h-3.5 w-3.5" />
        </span>
      </div>
    </button>
  )
}

function PedagogySection({
  title,
  icon,
  children,
  onRegenerate,
  disabled,
}: {
  title: string
  icon: ReactNode
  children: ReactNode
  onRegenerate?: () => void
  disabled?: boolean
}) {
  const [open, setOpen] = useState(true)
  return (
    <div className="rounded-[12px] border border-border bg-card">
      <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
        <button
          type="button"
          onClick={() => setOpen(v => !v)}
          className="flex min-w-0 items-center gap-2 text-left"
        >
          {open ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
          <span className="text-primary">{icon}</span>
          <span className="truncate text-[13px] font-bold">{title}</span>
        </button>
        {onRegenerate && (
          <button
            type="button"
            onClick={onRegenerate}
            disabled={disabled}
            className="flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-[11px] font-bold text-muted-foreground transition-colors hover:bg-background hover:text-primary disabled:opacity-50"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", disabled && "animate-spin")} />
            Regenerar
          </button>
        )}
      </div>
      {open && <div className="px-4 py-3">{children}</div>}
    </div>
  )
}

// ─── Componente principal ─────────────────────────────────────────────────────
interface ActividadesInnerProps {
  cursoOverride?: string
  unidadOverride?: string
  unidadCurricularOverride?: string
  claseOverride?: number
  compact?: boolean
  oasOverride?: OAEditado[]
}

type ChatMessage = {
  role: "user" | "ai"
  text: string
}

function listsEqual(left: string[] = [], right: string[] = []) {
  if (left.length !== right.length) return false
  return left.every((item, index) => item === right[index])
}

function ActividadesInner({ cursoOverride, unidadOverride, unidadCurricularOverride, claseOverride, compact, oasOverride }: ActividadesInnerProps = {}) {
  const { toast } = useToast()
  const searchParams = useSearchParams()
  const cursoParam = cursoOverride || searchParams.get("curso") || "1° A"
  const unidadParam = unidadOverride || searchParams.get("unitIdLocal") || searchParams.get("unidad") || "unidad_1"
  const unidadCurricularParam = unidadCurricularOverride || searchParams.get("unidad") || unidadParam
  const claseParam = claseOverride || parseInt(searchParams.get("clase") || "1")

  const [clases, setClases] = useState<ClaseCronograma[]>([])
  const [oasCurriculo, setOasCurriculo] = useState<OAEditado[]>([])
  const [selectedClase, setSelectedClase] = useState(claseParam)
  const [actividad, setActividad] = useState<Partial<ActividadClase>>({
    estado: "no_planificada", inicio: "", desarrollo: "", cierre: "",
    adecuacion: "", objetivo: "", oaIds: [], habilidades: [], actitudes: [], materiales: [], tics: [], sincronizada: false
  })
  const [unidadData, setUnidadData] = useState<any>(null)
  const [unidadDataStatus, setUnidadDataStatus] = useState<string | null>(null)
  const [unidadContextoDocente, setUnidadContextoDocente] = useState("")
  const [unidadObjetivoDocente, setUnidadObjetivoDocente] = useState("")
  const [nivelCurricular, setNivelCurricular] = useState("")
  const [dispHabilidades, setDispHabilidades] = useState<string[]>([])
  const [dispActitudes, setDispActitudes] = useState<string[]>([])
  const [copilotWidth, setCopilotWidth] = useState(400)
  const [isResizing, setIsResizing] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving_silent" | "saved" | "error" | "synced">("idle")
  const [tabDerecho, setTabDerecho] = useState<"desarrollo" | "adecuacion">("desarrollo")
  const [tabRecursos, setTabRecursos] = useState<"materiales" | "tics">("materiales")
  const [tabSugerencias, setTabSugerencias] = useState<"actividades" | "evaluaciones">("actividades")
  const [nuevoMaterial, setNuevoMaterial] = useState("")
  const [nuevoTic, setNuevoTic] = useState("")
  const [showEstadoMenu, setShowEstadoMenu] = useState(false)
  const [showBancoModal, setShowBancoModal] = useState(false)
  const [bancoActividades, setBancoActividades] = useState<ActividadClase[]>([])
  const [loadingBanco, setLoadingBanco] = useState(false)
  const [isGeneratingAI, setIsGeneratingAI] = useState(false)
  const [ideaInicial, setIdeaInicial] = useState("")

  // ── Copiloto IA ──
  const [showCopilot, setShowCopilot] = useState(false)
  const [isClassesRailCollapsed, setIsClassesRailCollapsed] = useState(false)
  const [chatHistory, setChatHistory] = useState<Array<{ role: "user" | "ai"; text: string }>>([])
  const [chatInput, setChatInput] = useState("")
  const [isChatLoading, setIsChatLoading] = useState(false)
  const [isApplying, setIsApplying] = useState(false)
  const [showAiSettings, setShowAiSettings] = useState(false)
  const [showExternalImport, setShowExternalImport] = useState(false)
  const [externalJsonInput, setExternalJsonInput] = useState("")
  const [externalImportError, setExternalImportError] = useState("")
  const [copilotTab, setCopilotTab] = useState<"chat" | "prompt">("chat")
  const [promptMode, setPromptMode] = useState<CopilotMode>("crear_inicial")
  const [isListening, setIsListening] = useState(false)
  const [aiConfig, setAiConfig] = useState<StoredAiConfig>(DEFAULT_AI_CONFIG)
  const [savedAiConfig, setSavedAiConfig] = useState<StoredAiConfig>(DEFAULT_AI_CONFIG)
  const chatEndRef = useRef<HTMLDivElement>(null)
  const generationAbortRef = useRef<AbortController | null>(null)
  const recognitionRef = useRef<any>(null)

  // Cargar config guardada
  useEffect(() => {
    const saved = localStorage.getItem("eduAiConfig")
    if (saved) {
      try {
        const normalized = normalizeAiConfig(JSON.parse(saved))
        setAiConfig(normalized)
        setSavedAiConfig(normalized)
      } catch {}
    }
  }, [])

  // Scroll al fondo del chat cuando hay mensajes nuevos
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [chatHistory, isChatLoading])

  // Resetear chat al cambiar de clase
  useEffect(() => {
    setChatHistory([])
    setChatInput("")
    setShowAiSettings(false)
    setShowExternalImport(false)
    setExternalJsonInput("")
    setExternalImportError("")
  }, [cursoParam, unidadParam, selectedClase])

  const saveAiConfig = (cfg: StoredAiConfig) => {
    const normalized = normalizeAiConfig(cfg)
    setAiConfig(normalized)
    setSavedAiConfig(normalized)
    localStorage.setItem("eduAiConfig", JSON.stringify(normalized))
    setShowAiSettings(false)
  }

  useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
      if (!isResizing) return
      const nextWidth = document.body.clientWidth - event.clientX
      if (nextWidth >= 320 && nextWidth <= 820) setCopilotWidth(nextWidth)
    }
    const handleMouseUp = () => setIsResizing(false)

    if (isResizing) {
      document.addEventListener("mousemove", handleMouseMove)
      document.addEventListener("mouseup", handleMouseUp)
    }
    return () => {
      document.removeEventListener("mousemove", handleMouseMove)
      document.removeEventListener("mouseup", handleMouseUp)
    }
  }, [isResizing])

  const toggleListen = () => {
    if (isListening) {
      recognitionRef.current?.stop()
      setIsListening(false)
      return
    }

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SpeechRecognition) {
      alert("Tu navegador no soporta dictado por voz. Funciona mejor en Chrome.")
      return
    }

    const recognition = new SpeechRecognition()
    recognition.lang = "es-CL"
    recognition.continuous = true
    recognition.interimResults = true
    recognition.onresult = (event: any) => {
      let finalText = ""
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) finalText += `${event.results[i][0].transcript} `
      }
      if (finalText.trim()) setChatInput(prev => `${prev} ${finalText}`.trim())
    }
    recognition.onerror = (event: any) => {
      setIsListening(false)
      if (event.error === "not-allowed") {
        alert("El navegador bloqueó el micrófono. En local suele funcionar entrando explícitamente a http://localhost:3000.")
      } else {
        console.error("Error de micrófono:", event.error)
      }
    }
    recognition.onend = () => setIsListening(false)
    recognition.start()
    recognitionRef.current = recognition
    setIsListening(true)
  }

  const getIndicadoresSeleccionados = (oa: OAEditado) => {
    const indicadoresDisponibles = (oa.indicadores || []).filter(i => i.seleccionado)
    const selectedIds = actividad.indicadoresPorOa?.[oa.id]
    return selectedIds
      ? indicadoresDisponibles.filter(i => selectedIds.includes(i.id))
      : indicadoresDisponibles
  }

  const buildLessonPayload = (modo?: CopilotMode, customMessage = "") => {
    const oasSeleccionados = oasCurriculo.filter(oa => (actividad.oaIds || []).includes(oa.id))
    return {
      curso: cursoParam,
      asignatura: ASIGNATURA,
      numeroClase: selectedClase,
      totalClasesUnidad: clases.length || 8,
      nivelCurricular: nivelCurricular || cursoParam,
      duracionMinutos: 90,
      contextoProfesor: stripRichText(actividad.contextoProfesor || ideaInicial || ""),
      oas: oasSeleccionados.map(oa => ({
        numero: oa.numero,
        descripcion: oa.descripcion,
        indicadores: getIndicadoresSeleccionados(oa).map(i => ({ texto: i.texto })),
      })),
      habilidades: actividad.habilidades || [],
      actitudes: actividad.actitudes || [],
      objetivoClase: stripRichText(actividad.objetivo || ""),
      instruccionesAdicionales: customMessage,
      unidad: unidadData ? {
        nombre_unidad: unidadData.nombre_unidad || "",
        proposito: unidadData.proposito || "",
        conocimientos: unidadData.conocimientos || [],
        conocimientos_previos: unidadData.conocimientos_previos || [],
        habilidades: unidadData.habilidades || [],
        actitudes: unidadData.actitudes || [],
        adecuaciones_dua: unidadData.adecuaciones_dua || "",
        contexto_docente: unidadContextoDocente,
        objetivo_docente: unidadObjetivoDocente,
      } : null,
      claseActual: {
        objetivo: actividad.objetivo || "",
        inicio: actividad.inicio || "",
        desarrollo: actividad.desarrollo || "",
        cierre: actividad.cierre || "",
        adecuacion: actividad.adecuacion || "",
        materiales: actividad.materiales || [],
        tics: actividad.tics || [],
      },
      estadoActual: {
        analisisBloom: actividad.analisisBloom,
        objetivoMultinivel: actividad.objetivoMultinivel,
        indicadoresEvaluacion: actividad.indicadoresEvaluacion,
        actividadEvaluacion: actividad.actividadEvaluacion,
      },
      modelProvider: aiConfig.provider,
      customToken: aiConfig.token,
      customModel: aiConfig.model,
      customEndpoint: aiConfig.endpoint,
      customPrompt: aiConfig.promptExtra,
      promptOverride: modo ? aiConfig.promptOverrides?.[modo] : undefined,
    }
  }

  const applyGeneratedLesson = (data: any, options?: { onlyBloom?: boolean; onlyIndicators?: boolean; detailedOnly?: boolean }) => {
    setActividad(prev => {
      if (options?.onlyBloom) {
        const objetivoMultinivel = data.objetivoMultinivel || prev.objetivoMultinivel
        const recomendado = objetivoMultinivel?.recomendado
        const objetivo = recomendado ? objetivoMultinivel?.[recomendado] : data.objetivo
        return {
          ...prev,
          analisisBloom: data.analisisBloom || prev.analisisBloom,
          objetivoMultinivel,
          objetivo: objetivo || prev.objetivo,
        }
      }

      if (options?.onlyIndicators) {
        return {
          ...prev,
          indicadoresEvaluacion: data.indicadoresEvaluacion || prev.indicadoresEvaluacion,
          actividadEvaluacion: data.actividadEvaluacion || prev.actividadEvaluacion,
        }
      }

      if (options?.detailedOnly) {
        return {
          ...prev,
          desarrolloFormal: {
            inicio: data.inicio || prev.desarrolloFormal?.inicio || prev.inicio || "",
            desarrollo: data.desarrollo || prev.desarrolloFormal?.desarrollo || prev.desarrollo || "",
            cierre: data.cierre || prev.desarrolloFormal?.cierre || prev.cierre || "",
          },
          analisisBloom: data.analisisBloom || prev.analisisBloom,
          objetivoMultinivel: data.objetivoMultinivel || prev.objetivoMultinivel,
          indicadoresEvaluacion: data.indicadoresEvaluacion || prev.indicadoresEvaluacion,
          actividadEvaluacion: data.actividadEvaluacion || prev.actividadEvaluacion,
        }
      }

      return {
        ...prev,
        objetivo: data.objetivo || prev.objetivo,
        inicio: data.inicio || prev.inicio,
        desarrollo: data.desarrollo || prev.desarrollo,
        cierre: data.cierre || prev.cierre,
        materiales: data.materiales?.length ? data.materiales : prev.materiales,
        tics: data.tics?.length ? data.tics : prev.tics,
        adecuacion: data.adecuacion || prev.adecuacion,
        analisisBloom: data.analisisBloom || prev.analisisBloom,
        objetivoMultinivel: data.objetivoMultinivel || prev.objetivoMultinivel,
        indicadoresEvaluacion: data.indicadoresEvaluacion || prev.indicadoresEvaluacion,
        actividadEvaluacion: data.actividadEvaluacion || prev.actividadEvaluacion,
        desarrolloFormal: data.inicio || data.desarrollo || data.cierre
          ? { inicio: data.inicio || "", desarrollo: data.desarrollo || "", cierre: data.cierre || "" }
          : prev.desarrolloFormal,
      }
    })
  }

  const runAiRequest = async (modo: CopilotMode, customMessage = "", options?: { onlyBloom?: boolean; onlyIndicators?: boolean; detailedOnly?: boolean }) => {
    const controller = new AbortController()
    generationAbortRef.current = controller
    setIsGeneratingAI(true)
    try {
      const res = await fetch("/api/generar-clase", {
        method: "POST",
        signal: controller.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...buildLessonPayload(modo, customMessage),
          modo,
          chatHistory,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Error al generar")
      applyGeneratedLesson(data, options)
      return data
    } finally {
      if (generationAbortRef.current === controller) generationAbortRef.current = null
      setIsGeneratingAI(false)
    }
  }

  const cancelGeneration = () => {
    generationAbortRef.current?.abort()
    generationAbortRef.current = null
    setIsGeneratingAI(false)
  }

  // Generar clase inicial (prompt Freddy multinivel)
  const handleGenerarClase = async () => {
    try {
      await runAiRequest("crear_inicial", stripRichText(actividad.contextoProfesor || ideaInicial || ""))
      setChatHistory([{ role: "ai", text: "✅ He generado una propuesta de clase. Puedes preguntarme cualquier cosa o pedirme que cambie algo." }])
    } catch (e: any) {
      if (e?.name === "AbortError") return
      toast({
        title: "Error de IA",
        description: e.message || "No se pudo generar la clase.",
        variant: "destructive"
      })
    }
  }

  // Enviar mensaje de chat (conversación libre)
  const handleImportarRespuestaExterna = () => {
    const rawInput = externalJsonInput.trim()
    if (!rawInput) {
      setExternalImportError("Pega el JSON que te entrego tu IA.")
      return
    }

    try {
      const parsed = parseJsonResponse(rawInput)
      const hasRecognizedField = EXTERNAL_AI_FIELDS.some(field =>
        Object.prototype.hasOwnProperty.call(parsed, field)
      )

      if (!hasRecognizedField) {
        throw new Error("Ese JSON no trae campos reconocibles de una clase.")
      }

      const lesson = coerceGeneratedLesson(parsed)
      const importedData: any = {}
      const hasTextField = (field: "objetivo" | "inicio" | "desarrollo" | "cierre" | "adecuacion") =>
        typeof parsed[field] === "string" && stripRichText(parsed[field] as string).length > 0

      if (hasTextField("objetivo")) importedData.objetivo = lesson.objetivo
      if (hasTextField("inicio")) importedData.inicio = lesson.inicio
      if (hasTextField("desarrollo")) importedData.desarrollo = lesson.desarrollo
      if (hasTextField("cierre")) importedData.cierre = lesson.cierre
      if (hasTextField("adecuacion")) importedData.adecuacion = lesson.adecuacion
      if (lesson.materiales.length > 0) importedData.materiales = lesson.materiales
      if (lesson.tics.length > 0) importedData.tics = lesson.tics
      if (lesson.analisisBloom?.length) importedData.analisisBloom = lesson.analisisBloom
      if (lesson.objetivoMultinivel) {
        importedData.objetivoMultinivel = lesson.objetivoMultinivel
        const recomendado = lesson.objetivoMultinivel.recomendado
        if (!importedData.objetivo && lesson.objetivoMultinivel[recomendado]) {
          importedData.objetivo = lesson.objetivoMultinivel[recomendado]
        }
      }
      if (lesson.indicadoresEvaluacion?.length) importedData.indicadoresEvaluacion = lesson.indicadoresEvaluacion
      if (lesson.actividadEvaluacion) importedData.actividadEvaluacion = lesson.actividadEvaluacion

      if (Object.keys(importedData).length === 0) {
        throw new Error("El JSON se pudo leer, pero no trae contenido util para completar la clase.")
      }

      applyGeneratedLesson(importedData)
      setExternalJsonInput("")
      setExternalImportError("")
      setShowExternalImport(false)
      setChatHistory(prev => [
        ...prev,
        { role: "ai", text: "Importe la respuesta externa y complete la clase con el JSON pegado." },
      ])
      toast({
        title: "Respuesta importada",
        description: "La clase se completo con el JSON pegado.",
      })
    } catch (e: any) {
      setExternalImportError(e?.message || "No pude leer ese JSON.")
    }
  }

  const handleSendChat = async () => {
    const msg = chatInput.trim()
    if (!msg || isChatLoading) return
    setChatHistory(prev => [...prev, { role: "user", text: msg }])
    setChatInput("")
    setIsChatLoading(true)
    try {
      const res = await fetch("/api/generar-clase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...buildLessonPayload("chat", msg),
          modo: "chat",
          instruccionesAdicionales: msg,
          chatHistory: [...chatHistory, { role: "user", text: msg }],
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Error")
      setChatHistory(prev => [...prev, { role: "ai", text: data.respuestaChat || "No hubo respuesta." }])
    } catch (e: any) {
      setChatHistory(prev => [...prev, { role: "ai", text: "❌ " + e.message }])
    } finally {
      setIsChatLoading(false)
    }
  }

  // Aplicar cambios a la clase (extrae del historial lo que se acordó)
  const handleAplicarCambios = async () => {
    if (chatHistory.length === 0 || isApplying) return
    setIsApplying(true)
    try {
      const res = await fetch("/api/generar-clase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...buildLessonPayload("aplicar_cambios"),
          modo: "aplicar_cambios",
          chatHistory,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Error")
      applyGeneratedLesson(data)
      const resumen = data.resumenCambios || "✅ Cambios aplicados a la clase."
      setChatHistory(prev => [...prev, { role: "ai", text: resumen }])
    } catch (e: any) {
      setChatHistory(prev => [...prev, { role: "ai", text: "❌ " + e.message }])
    } finally {
      setIsApplying(false)
    }
  }

  const handleRegenerarBloom = async () => {
    try {
      await runAiRequest("regenerar_bloom", stripRichText(actividad.contextoProfesor || ""), { onlyBloom: true })
    } catch (e: any) {
      if (e?.name !== "AbortError") {
        toast({ title: "Error de IA", description: e.message || "No se pudo regenerar Bloom.", variant: "destructive" })
      }
    }
  }

  const handleRegenerarIndicadores = async () => {
    try {
      await runAiRequest("regenerar_indicadores", stripRichText(actividad.contextoProfesor || ""), { onlyIndicators: true })
    } catch (e: any) {
      if (e?.name !== "AbortError") {
        toast({ title: "Error de IA", description: e.message || "No se pudieron regenerar indicadores.", variant: "destructive" })
      }
    }
  }

  const handleRegenerarDetallado = async () => {
    try {
      await runAiRequest("freddy_detallado", stripRichText(actividad.contextoProfesor || ""), { detailedOnly: true })
    } catch (e: any) {
      if (e?.name !== "AbortError") {
        toast({ title: "Error de IA", description: e.message || "No se pudo generar la versión detallada.", variant: "destructive" })
      }
    }
  }

  const handleToggleIndicador = (oaId: string, indicadorId: string) => {
    const oa = oasCurriculo.find(item => item.id === oaId)
    const allIds = (oa?.indicadores || []).filter(ind => ind.seleccionado).map(ind => ind.id)
    setActividad(prev => {
      const current = prev.indicadoresPorOa?.[oaId] || allIds
      const next = current.includes(indicadorId)
        ? current.filter(id => id !== indicadorId)
        : [...current, indicadorId]
      return {
        ...prev,
        indicadoresPorOa: {
          ...(prev.indicadoresPorOa || {}),
          [oaId]: next,
        },
      }
    })
  }

  const handleSelectBloomObjective = (key: "basico" | "intermedio" | "avanzado") => {
    setActividad(prev => {
      const objetivoMultinivel = prev.objetivoMultinivel
      if (!objetivoMultinivel?.[key]) return prev
      return {
        ...prev,
        objetivo: objetivoMultinivel[key],
        objetivoMultinivel: {
          ...objetivoMultinivel,
          recomendado: key,
        },
      }
    })
  }

  const abrirBanco = async () => {
    setShowBancoModal(true)
    setLoadingBanco(true)
    try {
      const past = await cargarBancoActividades(ASIGNATURA)
      setBancoActividades(past)
    } finally {
      setLoadingBanco(false)
    }
  }

  const importarDelBanco = (actBanco: ActividadClase) => {
    setActividad(prev => ({
      ...prev,
      objetivo: actBanco.objetivo,
      inicio: actBanco.inicio,
      desarrollo: actBanco.desarrollo,
      cierre: actBanco.cierre,
      habilidades: actBanco.habilidades,
      materiales: actBanco.materiales,
      tics: actBanco.tics,
      contextoProfesor: actBanco.contextoProfesor,
      analisisBloom: actBanco.analisisBloom,
      objetivoMultinivel: actBanco.objetivoMultinivel,
      indicadoresEvaluacion: actBanco.indicadoresEvaluacion,
      actividadEvaluacion: actBanco.actividadEvaluacion,
      desarrolloFormal: actBanco.desarrolloFormal,
      indicadoresPorOa: actBanco.indicadoresPorOa,
      // No anulamos oaIds ni fecha, ya que el Cronograma dicta eso
    }))
    setShowBancoModal(false)
  }

  // Cargar cronograma + currículo
  useEffect(() => {
    let cancelled = false

    async function cargarContexto() {
      setLoading(true)
      setUnidadData(null)
      setUnidadDataStatus(null)
      setUnidadContextoDocente("")
      setUnidadObjetivoDocente("")

      try {
        const mapping = await cargarNivelMapping()
        const nivel = resolveNivel(cursoParam, mapping)
        setNivelCurricular(nivel || cursoParam)
        const [crono, verUnidad, unidadCompleta] = await Promise.all([
          cargarCronogramaUnidad(ASIGNATURA, cursoParam, unidadParam),
          cargarVerUnidad(ASIGNATURA, cursoParam, unidadParam),
          nivel ? getUnidadCompleta(ASIGNATURA, nivel, unidadCurricularParam).catch(() => null) : Promise.resolve(null),
        ])

        if (cancelled) return

        setUnidadContextoDocente(verUnidad?.contextoDocente || "")
        setUnidadObjetivoDocente(verUnidad?.objetivoDocente || "")

        if (crono) {
          setClases(crono.clases)
          if (!claseOverride) {
            const hoy = new Date()
            const dd = String(hoy.getDate()).padStart(2, "0")
            const mm = String(hoy.getMonth() + 1).padStart(2, "0")
            const yy = hoy.getFullYear()
            const fechaHoy = `${dd}/${mm}/${yy}`
            const claseHoy = crono.clases.find(c => c.fecha === fechaHoy)
            if (claseHoy) setSelectedClase(claseHoy.numero)
          }
        }

        if (!nivel) {
          setUnidadDataStatus(`No hay bases curriculares configuradas para "${cursoParam}". Por eso no puedo cargar sugerencias oficiales de la unidad.`)
        } else if (!unidadCompleta) {
          setUnidadDataStatus(`No pude encontrar la unidad curricular ${unidadCurricularParam} en ${nivel}.`)
        } else {
          const totalReferencias = (unidadCompleta.actividades_sugeridas?.length || 0) + (unidadCompleta.ejemplos_evaluacion?.length || 0)
          setUnidadData(unidadCompleta)
          setUnidadDataStatus(totalReferencias === 0 ? "Esta unidad no trae sugerencias oficiales cargadas en la base curricular actual." : null)
        }

        let finalHabs: string[] = []
        let finalActs: string[] = []

        if (verUnidad) {
          finalHabs = (verUnidad.habilidades || []).filter(h => h.seleccionado).map(h => h.texto)
          finalActs = (verUnidad.actitudes || []).filter(a => a.seleccionado).map(a => a.texto)
        } else if (unidadCompleta) {
          finalHabs = (unidadCompleta.habilidades as string[]) || []
          finalActs = (unidadCompleta.actitudes as string[]) || []
        }
        setDispHabilidades(finalHabs)
        setDispActitudes(finalActs)

        if (oasOverride) {
          setOasCurriculo(oasOverride)
        } else {
          let curOas: OAEditado[] = []
          if (unidadCompleta) {
            curOas = initOAs(unidadCompleta)
          }
          const oasCombinados = mergeOAs(curOas, verUnidad?.oas || [])
          setOasCurriculo(oasCombinados.filter(o => o.seleccionado))
        }
      } catch (error) {
        console.error(error)
        if (!cancelled) {
          setUnidadData(null)
          setUnidadDataStatus("Ocurrio un problema al cargar la base curricular de la unidad.")
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void cargarContexto()

    return () => {
      cancelled = true
    }
  }, [cursoParam, unidadParam, unidadCurricularParam, claseOverride, oasOverride])



  // Cargar actividad cuando cambia la clase seleccionada
  useEffect(() => {
    cargarActividadClase(cursoParam, unidadParam, selectedClase).then(data => {
      const claseData = clases.find(c => c.numero === selectedClase)
      if (data) {
        setActividad({
          ...data,
          // Forzamos fuente de verdad del cronograma 
          oaIds: claseData?.oaIds || [],
        })
      } else {
        // Inicializar desde el cronograma
        setActividad({
          estado: "no_planificada",
          inicio: "", desarrollo: "", cierre: "", adecuacion: "",
          objetivo: "",
          oaIds: claseData?.oaIds || [],
          habilidades: [], actitudes: [], materiales: [], tics: [], sincronizada: false,
        })
      }
      // Marcar que acabamos de cargar explícitamente para evitar autosave falso
      ignoreNextSaveRef.current = true;
    })
  }, [selectedClase, clases, cursoParam, unidadParam])

  // ==========================================
  // 🚀 AUTOGUARDADO INTELIGENTE (DEBOUNCE)
  // ==========================================
  const ignoreNextSaveRef = useRef(true);
  useEffect(() => {
    if (loading) return;

    // Si apenas cargó la clase, no la guardamos y reseteamos el flag
    if (ignoreNextSaveRef.current) {
      ignoreNextSaveRef.current = false;
      return;
    }

    setSaveStatus("saving_silent")
    const timer = setTimeout(() => {
      handleGuardar(true)
    }, 2500)

    return () => clearTimeout(timer)
  }, [actividad]) // Se dispara cada vez que el usuario teclea o Gemini modifica algo

  const handleGuardar = async (isAutoSave = false) => {
    if (!isAutoSave) setSaving(true)
    try {
      const claseData = clases.find(c => c.numero === selectedClase)
      await guardarActividadClase({
        id: `${cursoParam}_${unidadParam}_clase${selectedClase}`,
        asignatura: ASIGNATURA,
        curso: cursoParam,
        unidadId: unidadParam,
        numeroClase: selectedClase,
        fecha: claseData?.fecha || "",
        oaIds: actividad.oaIds || [],
        objetivo: actividad.objetivo || "",
        inicio: actividad.inicio || "",
        desarrollo: actividad.desarrollo || "",
        cierre: actividad.cierre || "",
        adecuacion: actividad.adecuacion || "",
        habilidades: actividad.habilidades || [],
        actitudes: actividad.actitudes || [],
        materiales: actividad.materiales || [],
        tics: actividad.tics || [],
        estado: actividad.estado || "planificada",
        sincronizada: actividad.sincronizada || false,
        contextoProfesor: actividad.contextoProfesor || "",
        analisisBloom: actividad.analisisBloom,
        objetivoMultinivel: actividad.objetivoMultinivel,
        indicadoresEvaluacion: actividad.indicadoresEvaluacion,
        actividadEvaluacion: actividad.actividadEvaluacion,
        desarrolloFormal: actividad.desarrolloFormal,
        indicadoresPorOa: actividad.indicadoresPorOa,
      })
      setActividad(p => ({ ...p, estado: "planificada" }))
      setSaveStatus("saved")
      setTimeout(() => setSaveStatus("idle"), 3000)
    } catch {
      setSaveStatus("error")
      setTimeout(() => setSaveStatus("idle"), 3000)
    } finally { setSaving(false) }
  }

  const handleBorrarClase = async () => {
    const tieneContenido = [
      actividad.objetivo,
      actividad.inicio,
      actividad.desarrollo,
      actividad.cierre,
      actividad.adecuacion,
      ...(actividad.materiales || []),
      ...(actividad.tics || []),
    ].some(value => stripRichText(String(value || "")).length > 0)

    if (!tieneContenido) return

    const ok = window.confirm(
      `¿Borrar la planificación de la clase ${selectedClase}? Esta acción elimina el documento guardado y no se puede deshacer.`
    )
    if (!ok) return

    setDeleting(true)
    try {
      await eliminarActividadClase(cursoParam, unidadParam, selectedClase, ASIGNATURA)
      const claseData = clases.find(c => c.numero === selectedClase)
      ignoreNextSaveRef.current = true
      setActividad({
        estado: "no_planificada",
        inicio: "",
        desarrollo: "",
        cierre: "",
        adecuacion: "",
        objetivo: "",
        oaIds: claseData?.oaIds || [],
        habilidades: [],
        actitudes: [],
        materiales: [],
        tics: [],
        sincronizada: false,
      })
      setChatHistory([])
      setChatInput("")
      setSaveStatus("idle")
      toast({ title: "Clase borrada", description: `La clase ${selectedClase} quedó vacía.` })
    } catch (error) {
      console.error(error)
      setSaveStatus("error")
      toast({
        title: "No se pudo borrar",
        description: "Intenta nuevamente en unos segundos.",
        variant: "destructive",
      })
    } finally {
      setDeleting(false)
    }
  }

  const handleSincronizar = async () => {
    // Sincronizar desarrollo → Libro de Clases
    const claseData = clases.find(c => c.numero === selectedClase)
    const fecha = claseData?.fecha || new Date().toLocaleDateString("es-CL").replace(/\//g, "/")
    try {
      const existente = await cargarLibroClases(ASIGNATURA, cursoParam, fecha)
      const bloques = existente?.bloques || []
      // Actualizar o agregar el bloque con el desarrollo
      const bloqueIdx = bloques.findIndex(b => b.id.includes(`clase${selectedClase}`))
      if (bloqueIdx >= 0) {
        bloques[bloqueIdx] = {
          ...bloques[bloqueIdx],
          objetivo: actividad.objetivo || "",
          actividad: actividad.desarrollo || "",
        }
      } else {
        bloques.push({
          id: `clase${selectedClase}_bloque1`,
          bloque: `Bloque 1`,
          horaInicio: "08:00",
          horaFin: "09:00",
          objetivo: actividad.objetivo || "",
          actividad: actividad.desarrollo || "",
          firmado: false,
          asistencia: [],
        })
      }
      await guardarLibroClases(ASIGNATURA, cursoParam, fecha, bloques)
      setActividad(p => ({ ...p, sincronizada: true, estado: "realizada" }))
      setSaveStatus("synced")
      setTimeout(() => setSaveStatus("idle"), 3000)
    } catch (e) {
      console.error(e)
    }
  }

  const setEstado = (est: ActividadClase["estado"]) => {
    setActividad(p => ({ ...p, estado: est }))
    setShowEstadoMenu(false)
  }

  const oasDeEstaClase = oasCurriculo.filter(oa =>
    (actividad.oaIds || []).includes(oa.id)
  )

  const claseData = clases.find(c => c.numero === selectedClase)

  const handleOpenCopilot = () => {
    setShowCopilot(true)
  }

  const actividadesSugeridas = (unidadData?.actividades_sugeridas || []) as ActividadSugerida[]
  const evaluacionesSugeridas = (unidadData?.ejemplos_evaluacion || []) as EjemploEvaluacion[]
  const indicadoresAgrupados = useMemo(() => {
    const base = { saber: [], saber_hacer: [], ser: [] } as Record<"saber" | "saber_hacer" | "ser", NonNullable<ActividadClase["indicadoresEvaluacion"]>>
    ;(actividad.indicadoresEvaluacion || []).forEach(ind => {
      const key = ind.dimension || "saber"
      base[key].push(ind)
    })
    return base
  }, [actividad.indicadoresEvaluacion])
  const promptPreview = useMemo(() => {
    try {
      return buildCopilotPrompt(buildLessonPayload(promptMode, chatInput), promptMode)
    } catch {
      return ""
    }
  }, [promptMode, chatInput, actividad, aiConfig, oasCurriculo, unidadData, unidadContextoDocente, unidadObjetivoDocente, clases.length, nivelCurricular])

  if (loading) return (
    <div className="flex items-center justify-center h-64 gap-3 text-muted-foreground">
      <Loader2 className="w-5 h-5 animate-spin" />
      <span className="text-[14px]">Cargando actividades…</span>
    </div>
  )

  const estadoActual = ESTADOS.find(e => e.key === actividad.estado) || ESTADOS[0]
  const tieneContenidoClase = [
    actividad.objetivo,
    actividad.inicio,
    actividad.desarrollo,
    actividad.cierre,
    actividad.adecuacion,
    ...(actividad.materiales || []),
    ...(actividad.tics || []),
  ].some(value => stripRichText(String(value || "")).length > 0)

  const verUnidadParams: Record<string, string> = unidadCurricularParam !== unidadParam
    ? { curso: cursoParam, unidad: unidadCurricularParam, unitIdLocal: unidadParam }
    : { curso: cursoParam, unidad: unidadCurricularParam }
  const contentGridTemplate = isClassesRailCollapsed ? "84px minmax(0, 1fr)" : "220px minmax(0, 1fr)"

  return (
    <div
      className={cn("relative w-full overflow-y-auto h-[calc(100vh-64px)] transition-all md:pr-[var(--copilot-pr)]", !isResizing && "duration-300")}
      style={{ ["--copilot-pr" as never]: showCopilot ? `${copilotWidth}px` : "0px" }}
    >
      <div className={cn("pb-10 pt-4", "mx-auto max-w-[1680px] px-3 sm:px-4 md:px-6")}>
        {/* Header — oculto en modo compact */}
        <div className={compact ? "flex items-center justify-between mb-4 flex-wrap gap-2 print:hidden" : "flex items-center justify-between mb-5 sm:mb-6 flex-wrap gap-2 sm:gap-3 print:hidden"}>
          <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
            <Link
              href={buildUrl("/ver-unidad", verUnidadParams)}
              className="w-8 h-8 border-[1.5px] border-border rounded-lg bg-card grid place-items-center text-muted-foreground hover:bg-background transition-colors flex-shrink-0"
            >
              <ChevronLeft className="w-4 h-4" />
            </Link>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] text-muted-foreground truncate">
                <Link href={buildUrl("/planificaciones", { curso: cursoParam })} className="hover:text-primary">Mis planificaciones</Link>
                {" "}/ <Link href={buildUrl("/ver-unidad", verUnidadParams)} className="hover:text-primary">Unidad</Link>
              </p>
              <h1 className="text-[16px] sm:text-[20px] font-extrabold leading-tight truncate">
                Actividades · {ASIGNATURA} – {cursoParam}
              </h1>
            </div>
          </div>
          <div className="flex items-center gap-2 sm:gap-2.5 flex-shrink-0">
            {saveStatus === "saving_silent" && <span className="hidden sm:flex items-center gap-1 text-[12px] text-muted-foreground font-semibold animate-pulse"><RefreshCw className="w-3.5 h-3.5 animate-spin" /> Guardando...</span>}
            {saveStatus === "saved" && <span className="hidden sm:flex items-center gap-1 text-[12px] text-green-600 font-semibold"><Check className="w-4 h-4" /> Guardado</span>}
            {saveStatus === "synced" && <span className="hidden sm:flex items-center gap-1 text-[12px] text-blue-600 font-semibold"><Check className="w-4 h-4" /> Sincronizado al Libro</span>}
            {saveStatus === "error" && <span className="text-[12px] text-red-500 font-semibold">Error</span>}
            <button
              onClick={handleBorrarClase}
              disabled={deleting || saving || saveStatus === "saving_silent" || !tieneContenidoClase}
              className="flex items-center gap-1.5 border-[1.5px] border-red-200 bg-red-50 text-red-600 text-[12px] sm:text-[13px] font-bold rounded-[10px] px-3 sm:px-4 py-2 sm:py-2.5 hover:bg-red-100 transition-colors disabled:opacity-50 disabled:hover:bg-red-50"
              title="Borrar la clase guardada"
            >
              {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
              <span className="hidden sm:inline">Borrar clase</span>
              <span className="sm:hidden">Borrar</span>
            </button>
            <button
              onClick={() => handleGuardar(false)}
              disabled={saving || saveStatus === "saving_silent"}
              className="flex items-center gap-1.5 bg-primary text-white text-[12px] sm:text-[13px] font-bold rounded-[10px] px-3 sm:px-5 py-2 sm:py-2.5 hover:bg-[#d6335e] transition-colors disabled:opacity-60"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Bookmark className="w-4 h-4" />}
              <span className="hidden sm:inline">Guardar Manualmente</span>
              <span className="sm:hidden">Guardar</span>
            </button>
          </div>
        </div>

        {/* Layout 3 paneles */}
        <div
          className={cn(
            "grid grid-cols-1 gap-4 items-start print:flex print:flex-col print:gap-6",
            isClassesRailCollapsed
              ? "lg:grid-cols-[84px_minmax(0,1fr)]"
              : "lg:grid-cols-[220px_minmax(0,1fr)]"
          )}
        >

          {/* ── Panel izquierdo: lista de clases ── */}
          <div className="bg-card border border-border rounded-[14px] overflow-hidden print:hidden transition-all duration-300">
            <div className={cn("border-b border-border bg-background", isClassesRailCollapsed ? "px-2 py-3" : "px-4 py-3")}>
              <div className={cn("flex items-center", isClassesRailCollapsed ? "justify-center" : "justify-between gap-2")}>
                {!isClassesRailCollapsed && (
                  <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide">Clases</p>
                )}
                <button
                  type="button"
                  onClick={() => setIsClassesRailCollapsed(prev => !prev)}
                  className="grid h-8 w-8 place-items-center rounded-full border border-border bg-card text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
                  aria-label={isClassesRailCollapsed ? "Expandir barra de clases" : "Recoger barra de clases"}
                  title={isClassesRailCollapsed ? "Expandir barra de clases" : "Recoger barra de clases"}
                >
                  {isClassesRailCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <div className="overflow-y-auto max-h-[200px] lg:max-h-[600px]">
              {clases.length === 0 ? (
                <div className={cn("text-center text-[12px] text-muted-foreground", isClassesRailCollapsed ? "px-2 py-6" : "px-4 py-6")}>
                  {isClassesRailCollapsed ? "Sin clases" : "Configura el cronograma primero."}
                </div>
              ) : (
                clases.map(clase => {
                  const oaDots = oasCurriculo.filter(oa => clase.oaIds.includes(oa.id))
                  const isSelected = clase.numero === selectedClase
                  return (
                    <button
                      key={clase.numero}
                      onClick={() => setSelectedClase(clase.numero)}
                      title={`Clase ${clase.numero}`}
                      className={cn(
                        "w-full border-b border-border last:border-b-0 transition-colors",
                        isClassesRailCollapsed ? "px-2 py-3" : "px-4 py-3.5 text-left",
                        isSelected ? "bg-pink-light/40 border-l-[3px] border-l-primary" : "hover:bg-background"
                      )}
                    >
                      {isClassesRailCollapsed ? (
                        <div className="flex flex-col items-center gap-1.5">
                          <span className={cn("text-[13px] font-extrabold leading-none", isSelected ? "text-primary" : "text-foreground")}>
                            {clase.numero}
                          </span>
                          {clase.fecha && (
                            <span className="text-[9px] text-muted-foreground bg-background border border-border rounded-full px-1.5 py-0.5 leading-none">
                              {clase.fecha.substring(0, 5)}
                            </span>
                          )}
                          {oaDots.length > 0 && (
                            <div className="flex gap-1 justify-center">
                              {oaDots.slice(0, 3).map((oa) => (
                                <div key={oa.id} className="w-1.5 h-1.5 rounded-full" style={{ background: UNIT_COLORS[oasCurriculo.indexOf(oa) % UNIT_COLORS.length] }} />
                              ))}
                            </div>
                          )}
                        </div>
                      ) : (
                        <>
                          <div className="flex items-center justify-between mb-1.5">
                            <span className={cn("text-[13px] font-bold", isSelected ? "text-primary" : "text-foreground")}>
                              Clase {clase.numero}
                            </span>
                            {clase.fecha && (
                              <span className="text-[10px] text-muted-foreground bg-background border border-border rounded-full px-2 py-0.5">
                                {clase.fecha.substring(0, 5)}
                              </span>
                            )}
                          </div>
                          {oaDots.length > 0 && (
                            <div className="flex gap-1 mb-1.5">
                              {oaDots.slice(0, 4).map((oa) => (
                                <div key={oa.id} className="w-2 h-2 rounded-full" style={{ background: UNIT_COLORS[oasCurriculo.indexOf(oa) % UNIT_COLORS.length] }} />
                              ))}
                            </div>
                          )}
                          {clase.duplicadaDe && (
                            <span className="text-[10px] text-amber-600 font-medium">Copia de Clase {clase.duplicadaDe}</span>
                          )}
                        </>
                      )}
                    </button>
                  )
                })
              )}
            </div>
          </div>

          {/* ── Panel central: contenido de la clase ── */}
          <div className="min-w-0 flex flex-col gap-4 print:w-full">
            {/* Cabecera clase */}
            <div className="bg-card border border-border rounded-[14px] px-5 py-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h2 className="text-[15px] font-extrabold">Clase {selectedClase}</h2>
                  {claseData?.fecha && (
                    <p className="text-[12px] text-muted-foreground flex items-center gap-1">
                      <Calendar className="w-3 h-3" />{claseData.fecha}
                    </p>
                  )}
                  <div className="flex items-center gap-2 mt-2 -ml-2 print:hidden">
                    <button
                      onClick={abrirBanco}
                      className="flex items-center gap-1.5 text-[11px] font-bold text-primary hover:bg-pink-light px-2 py-1 rounded transition-colors"
                    >
                      <BookOpen className="w-3.5 h-3.5" /> Banco de Clases
                    </button>
                    <button
                      onClick={handleOpenCopilot}
                      className="flex items-center gap-1.5 text-[11px] font-bold text-white bg-gradient-to-r from-indigo-500 to-purple-600 hover:opacity-90 px-3 py-1.5 rounded-full transition-opacity shadow-sm"
                    >
                      <Sparkles className="w-3.5 h-3.5 text-white" />
                      Copiloto IA
                    </button>
                  </div>
                </div>
                {/* Selector de estado */}
                <div className="relative print:hidden">
                  <button
                    onClick={() => setShowEstadoMenu(v => !v)}
                    className={cn("flex items-center gap-1.5 text-[11px] font-bold rounded-full px-3 py-1.5 border transition-colors", estadoActual.cls)}
                  >
                    {estadoActual.label}
                    <ChevronDown className="w-3 h-3" />
                  </button>
                  {showEstadoMenu && (
                    <div className="absolute right-0 top-full mt-1 z-50 bg-card border border-border rounded-[10px] shadow-lg overflow-hidden w-40">
                      {ESTADOS.map(e => (
                        <button key={e.key} onClick={() => setEstado(e.key)}
                          className="w-full text-left px-4 py-2.5 text-[12px] font-medium hover:bg-background transition-colors">
                          {e.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Contexto del profesor */}
              <div className="mb-3">
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide">Contexto del profesor</label>
                </div>
                <textarea
                  value={actividad.contextoProfesor || ideaInicial}
                  onChange={e => {
                    setIdeaInicial(e.target.value)
                    setActividad(p => ({ ...p, contextoProfesor: e.target.value }))
                  }}
                  placeholder="Ej: reproducir música por YouTube y que la representen corporalmente..."
                  rows={2}
                  className="w-full resize-none rounded-[10px] border-[1.5px] border-border bg-background px-3 py-2 text-[12px] outline-none transition-colors focus:border-primary"
                />
              </div>

              {/* Objetivo de la clase */}
              <div className="mb-3">
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide">Objetivo de la clase</label>
                </div>
                <RichArea
                  value={actividad.objetivo || ""}
                  onChange={v => setActividad(p => ({ ...p, objetivo: v }))}
                  placeholder="Redacta el objetivo de esta clase…"
                  rows={3}
                />
              </div>
              {actividad.objetivoMultinivel && (
                <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
                  <BloomCard
                    label="Básico"
                    nivel="BAJO"
                    texto={actividad.objetivoMultinivel.basico}
                    active={actividad.objetivoMultinivel.recomendado === "basico"}
                    onSelect={() => handleSelectBloomObjective("basico")}
                    onRegenerate={handleRegenerarBloom}
                    disabled={isGeneratingAI}
                  />
                  <BloomCard
                    label="Intermedio"
                    nivel="MEDIO"
                    texto={actividad.objetivoMultinivel.intermedio}
                    active={actividad.objetivoMultinivel.recomendado === "intermedio"}
                    onSelect={() => handleSelectBloomObjective("intermedio")}
                    onRegenerate={handleRegenerarBloom}
                    disabled={isGeneratingAI}
                  />
                  <BloomCard
                    label="Avanzado"
                    nivel="ALTO"
                    texto={actividad.objetivoMultinivel.avanzado}
                    active={actividad.objetivoMultinivel.recomendado === "avanzado"}
                    onSelect={() => handleSelectBloomObjective("avanzado")}
                    onRegenerate={handleRegenerarBloom}
                    disabled={isGeneratingAI}
                  />
                </div>
              )}
            </div>

            {(actividad.analisisBloom?.length || actividad.indicadoresEvaluacion?.length || actividad.actividadEvaluacion) && (
              <div className="grid grid-cols-1 gap-3">
                <PedagogySection
                  title="Análisis Bloom de los OA"
                  icon={<BrainCircuit className="h-4 w-4" />}
                  onRegenerate={handleRegenerarBloom}
                  disabled={isGeneratingAI}
                >
                  {actividad.analisisBloom?.length ? (
                    <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                      {actividad.analisisBloom.map((item, index) => (
                        <div key={`${item.oaId}-${index}`} className="rounded-[10px] border border-border bg-background p-3">
                          <div className="mb-1.5 flex items-center justify-between gap-2">
                            <span className="text-[11px] font-extrabold text-primary">{item.oaId}</span>
                            <span className="rounded-full bg-card px-2 py-0.5 text-[10px] font-bold text-muted-foreground">{item.categoria} · {item.nivel}</span>
                          </div>
                          <p className="text-[12px] leading-relaxed text-muted-foreground">{item.justificacion}</p>
                          {item.verbosSugeridos?.length > 0 && (
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              {item.verbosSugeridos.map(verbo => (
                                <span key={verbo} className="rounded-full border border-border bg-card px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">{verbo}</span>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : <p className="text-[12px] text-muted-foreground">Aún no hay análisis Bloom generado.</p>}
                </PedagogySection>

                <PedagogySection
                  title="Indicadores de evaluación"
                  icon={<Clipboard className="h-4 w-4" />}
                  onRegenerate={handleRegenerarIndicadores}
                  disabled={isGeneratingAI}
                >
                  {actividad.indicadoresEvaluacion?.length ? (
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                      {([
                        ["saber", "Saber"],
                        ["saber_hacer", "Saber hacer"],
                        ["ser", "Ser"],
                      ] as const).map(([key, label]) => (
                        <div key={key} className="rounded-[10px] border border-border bg-background p-3">
                          <p className="mb-2 text-[11px] font-extrabold uppercase tracking-wide text-foreground">{label}</p>
                          <div className="space-y-2">
                            {indicadoresAgrupados[key].length ? indicadoresAgrupados[key].map(ind => (
                              <div key={ind.id} className="rounded-md bg-card px-2.5 py-2 text-[12px] leading-snug text-muted-foreground">
                                <span className="font-bold text-primary">{ind.nivelBloom}</span> · {ind.texto}
                              </div>
                            )) : <p className="text-[11px] text-muted-foreground">Sin indicador.</p>}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : <p className="text-[12px] text-muted-foreground">Aún no hay indicadores generados.</p>}
                </PedagogySection>

                <PedagogySection
                  title="Actividad de evaluación"
                  icon={<Check className="h-4 w-4" />}
                  onRegenerate={handleRegenerarIndicadores}
                  disabled={isGeneratingAI}
                >
                  {actividad.actividadEvaluacion ? (
                    <div className="rounded-[10px] border border-border bg-background p-3">
                      <div className="mb-2 flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-violet-50 px-2 py-0.5 text-[10px] font-extrabold uppercase text-violet-700">{actividad.actividadEvaluacion.tipo}</span>
                        {(actividad.actividadEvaluacion.alineacionMBE || []).map(code => (
                          <span key={code} className="rounded-full border border-border bg-card px-2 py-0.5 text-[10px] font-bold text-muted-foreground">MBE {code}</span>
                        ))}
                      </div>
                      <p className="text-[12px] leading-relaxed text-muted-foreground">{actividad.actividadEvaluacion.descripcion}</p>
                      {actividad.actividadEvaluacion.criterios?.length > 0 && (
                        <ul className="mt-2 list-disc space-y-1 pl-4 text-[12px] text-muted-foreground">
                          {actividad.actividadEvaluacion.criterios.map(criterio => <li key={criterio}>{criterio}</li>)}
                        </ul>
                      )}
                    </div>
                  ) : <p className="text-[12px] text-muted-foreground">Aún no hay actividad de evaluación generada.</p>}
                </PedagogySection>
              </div>
            )}

            <div className="flex flex-col xl:flex-row gap-4 items-start">
              {/* Columna Derecha (Visual): OA, Habilidades, Actitudes */}
              <div className="flex-[1] min-w-[280px] w-full flex flex-col gap-4 order-2">

                {/* OA de esta clase con indicadores */}
                <div className="bg-card border border-border rounded-[14px] px-5 py-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Target className="w-4 h-4 text-primary" />
                      <h3 className="text-[13px] font-bold">Objetivos de Aprendizaje</h3>
                      <span className="text-[11px] text-muted-foreground bg-background border border-border rounded-full px-2 py-0.5">
                        {oasDeEstaClase.length}
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-col gap-2">
                    {oasDeEstaClase.length === 0 ? (
                      <p className="text-[12px] text-muted-foreground text-center py-3">
                        Sin OA para esta clase. Asígnalos en la pestaña <strong>Cronograma</strong>.
                      </p>
                    ) : (
                      oasDeEstaClase.map((oa, i) => (
                        <OACard
                          key={oa.id}
                          oa={oa}
                          color={UNIT_COLORS[oasCurriculo.indexOf(oa) % UNIT_COLORS.length]}
                          selectedIndicadores={actividad.indicadoresPorOa?.[oa.id]}
                          onToggleIndicador={handleToggleIndicador}
                        />
                      ))
                    )}
                  </div>
                </div>

                {/* Habilidades */}
                <div className="bg-card border border-border rounded-[14px] px-5 py-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Layers className="w-4 h-4 text-blue-600" />
                      <h3 className="text-[13px] font-bold">Habilidades de la Unidad</h3>
                    </div>
                    <button
                      onClick={() => { const h = prompt("Escribe una habilidad personalizada:"); if (h) setActividad(p => ({ ...p, habilidades: [...(p.habilidades || []), h] })) }}
                      className="text-[10px] font-bold text-primary border border-primary rounded-full px-2.5 py-1 hover:bg-pink-light transition-colors"
                    >
                      + Agregar Extra
                    </button>
                  </div>
                  {dispHabilidades.length === 0 ? (
                    <p className="text-[12px] text-muted-foreground mb-3">No hay habilidades configuradas en tu unidad para seleccionar.</p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {dispHabilidades.map((hab, i) => {
                        const isSelected = (actividad.habilidades || []).includes(hab)
                        return (
                          <button
                            key={i}
                            onClick={() => setActividad(p => ({
                              ...p,
                              habilidades: p.habilidades?.includes(hab)
                                ? p.habilidades.filter(x => x !== hab)
                                : [...(p.habilidades || []), hab]
                            }))}
                            className={cn(
                              "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-semibold transition-all border",
                              isSelected
                                ? "text-white shadow-sm"
                                : "bg-background text-muted-foreground border-dashed hover:border-primary/50"
                            )}
                            style={isSelected ? { background: UNIT_COLORS[i % UNIT_COLORS.length], borderColor: UNIT_COLORS[i % UNIT_COLORS.length] } : undefined!}
                          >
                            {hab}
                            {isSelected && <Check className="w-3 h-3" />}
                          </button>
                        )
                      })}
                    </div>
                  )}

                  <div className="flex flex-wrap gap-2 mt-2">
                    {/* Mostrar las manuales que no estén listadas oficialmente */}
                    {(actividad.habilidades || []).filter(h => !dispHabilidades.includes(h)).map((hab, i) => (
                      <span key={i} className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold text-white bg-blue-600 shadow-sm border border-blue-600">
                        {hab}
                        <button onClick={() => setActividad(p => ({ ...p, habilidades: (p.habilidades || []).filter(x => x !== hab) }))}>
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                </div>

                {/* Actitudes */}
                <div className="bg-card border border-border rounded-[14px] px-5 py-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Target className="w-4 h-4 text-amber-500" />
                      <h3 className="text-[13px] font-bold">Actitudes de la Unidad</h3>
                    </div>
                    <button
                      onClick={() => { const a = prompt("Escribe una actitud personalizada:"); if (a) setActividad(p => ({ ...p, actitudes: [...(p.actitudes || []), a] })) }}
                      className="text-[10px] font-bold text-primary border border-primary rounded-full px-2.5 py-1 hover:bg-pink-light transition-colors"
                    >
                      + Agregar Extra
                    </button>
                  </div>
                  {dispActitudes.length === 0 ? (
                    <p className="text-[12px] text-muted-foreground mb-3">No hay actitudes configuradas en tu unidad para seleccionar.</p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {dispActitudes.map((act, i) => {
                        const isSelected = (actividad.actitudes || []).includes(act)
                        return (
                          <button
                            key={i}
                            onClick={() => setActividad(p => ({
                              ...p,
                              actitudes: p.actitudes?.includes(act)
                                ? p.actitudes.filter(x => x !== act)
                                : [...(p.actitudes || []), act]
                            }))}
                            className={cn(
                              "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-semibold transition-all border",
                              isSelected
                                ? "bg-amber-500 text-white border-amber-500 shadow-sm"
                                : "bg-background text-muted-foreground border-dashed hover:border-amber-500/50"
                            )}
                          >
                            {act}
                            {isSelected && <Check className="w-3 h-3" />}
                          </button>
                        )
                      })}
                    </div>
                  )}

                  <div className="flex flex-wrap gap-2 mt-2">
                    {/* Mostrar las manuales que no estén listadas oficialmente */}
                    {(actividad.actitudes || []).filter(a => !dispActitudes.includes(a)).map((act, i) => (
                      <span key={i} className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold text-white bg-amber-500 shadow-sm border border-amber-500">
                        {act}
                        <button onClick={() => setActividad(p => ({ ...p, actitudes: (p.actitudes || []).filter(x => x !== act) }))}>
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              {/* Columna Izquierda (Visual): Editor, Recursos y Sugerencias */}
              <div className="flex-[2] min-w-[350px] w-full flex flex-col gap-4 order-1">
                {/* Editor de momentos */}
                <div className="bg-card border border-border rounded-[14px] overflow-hidden">
                  <div className="flex items-center border-b border-border">
                    <button
                      onClick={() => setTabDerecho("desarrollo")}
                      className={cn("flex items-center gap-1.5 px-4 py-3 text-[12px] font-semibold border-b-2 -mb-[1px] transition-colors",
                        tabDerecho === "desarrollo" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
                      )}
                    >
                      <FileText className="w-3.5 h-3.5" /> Desarrollo
                    </button>
                    <button
                      onClick={() => setTabDerecho("adecuacion")}
                      className={cn("flex items-center gap-1.5 px-4 py-3 text-[12px] font-semibold border-b-2 -mb-[1px] transition-colors",
                        tabDerecho === "adecuacion" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
                      )}
                    >
                      <Clipboard className="w-3.5 h-3.5" /> Adec. curricular
                    </button>
                  </div>

                  <div className="p-4">
                    {tabDerecho === "desarrollo" ? (
                      <div className="flex flex-col gap-3">
                        <div>
                          <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide mb-1 block">Inicio</label>
                          <RichArea value={actividad.inicio || ""} onChange={v => setActividad(p => ({ ...p, inicio: v }))} placeholder="¿Cómo empezará la clase?" rows={6} />
                        </div>
                        <div>
                          <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide mb-1 block">Desarrollo</label>
                          <RichArea value={actividad.desarrollo || ""} onChange={v => setActividad(p => ({ ...p, desarrollo: v }))} placeholder="Actividades principales de la clase…" rows={12} />
                        </div>
                        <div>
                          <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide mb-1 block">Cierre</label>
                          <RichArea value={actividad.cierre || ""} onChange={v => setActividad(p => ({ ...p, cierre: v }))} placeholder="¿Cómo cerrará la clase?" rows={6} />
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        <div className="rounded-[12px] border border-border bg-background p-4">
                          <div className="mb-2">
                            <p className="text-[11px] font-extrabold uppercase tracking-wide text-muted-foreground">Inclusión y diversidad</p>
                            <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
                              Espacio para registrar adecuaciones curriculares de esta sesión (PIE/DUA).
                            </p>
                          </div>
                          <RichArea value={actividad.adecuacion || ""} onChange={v => setActividad(p => ({ ...p, adecuacion: v }))} placeholder="Redactar adecuaciones curriculares..." rows={8} />
                        </div>

                        <div className="rounded-[12px] border border-border bg-card p-4">
                          <div className="mb-3 flex items-center justify-between gap-3">
                            <div>
                              <p className="text-[11px] font-extrabold uppercase tracking-wide text-muted-foreground">Desarrollo pedagógico formal</p>
                              <p className="mt-1 text-[11px] leading-snug text-muted-foreground">Síntesis metodológica Freddy para revisión pedagógica y adecuación curricular.</p>
                            </div>
                            <button
                              type="button"
                              onClick={handleRegenerarDetallado}
                              disabled={isGeneratingAI}
                              className="flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-[11px] font-bold text-white transition-colors hover:bg-slate-800 disabled:opacity-60"
                            >
                              {isGeneratingAI ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <BrainCircuit className="h-3.5 w-3.5" />}
                              Regenerar versión detallada
                            </button>
                          </div>

                          <div className="grid grid-cols-1 gap-3">
                            {actividad.analisisBloom?.length ? (
                              <div className="rounded-[10px] border border-border bg-background p-3">
                                <p className="mb-2 text-[11px] font-bold text-foreground">Análisis Bloom</p>
                                <div className="space-y-2">
                                  {actividad.analisisBloom.map((item, index) => (
                                    <p key={`${item.oaId}-${index}`} className="text-[12px] leading-relaxed text-muted-foreground">
                                      <b>{item.oaId}</b>: {item.categoria} ({item.nivel}). {item.justificacion}
                                    </p>
                                  ))}
                                </div>
                              </div>
                            ) : null}

                            {actividad.objetivoMultinivel && (
                              <div className="rounded-[10px] border border-border bg-background p-3">
                                <p className="mb-2 text-[11px] font-bold text-foreground">Objetivo redactado en 3 niveles</p>
                                <div className="space-y-1.5 text-[12px] leading-relaxed text-muted-foreground">
                                  <p><b>Básico:</b> {actividad.objetivoMultinivel.basico}</p>
                                  <p><b>Intermedio:</b> {actividad.objetivoMultinivel.intermedio}</p>
                                  <p><b>Avanzado:</b> {actividad.objetivoMultinivel.avanzado}</p>
                                </div>
                              </div>
                            )}

                            {actividad.indicadoresEvaluacion?.length ? (
                              <div className="rounded-[10px] border border-border bg-background p-3">
                                <p className="mb-2 text-[11px] font-bold text-foreground">Indicadores formales</p>
                                <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
                                  {([
                                    ["saber", "Saber"],
                                    ["saber_hacer", "Saber hacer"],
                                    ["ser", "Ser"],
                                  ] as const).map(([key, label]) => (
                                    <div key={key} className="rounded-md bg-card p-2">
                                      <p className="mb-1 text-[10px] font-extrabold uppercase text-muted-foreground">{label}</p>
                                      {indicadoresAgrupados[key].map(ind => (
                                        <p key={ind.id} className="mb-1 text-[11px] leading-snug text-muted-foreground">{ind.texto}</p>
                                      ))}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ) : null}

                            {actividad.actividadEvaluacion && (
                              <div className="rounded-[10px] border border-border bg-background p-3">
                                <p className="mb-1 text-[11px] font-bold text-foreground">Actividad de evaluación</p>
                                <p className="text-[12px] leading-relaxed text-muted-foreground">{actividad.actividadEvaluacion.descripcion}</p>
                              </div>
                            )}

                            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                              <div className="rounded-[10px] border border-border bg-background p-3">
                                <p className="mb-2 text-[11px] font-extrabold text-primary">Inicio</p>
                                <HtmlPreview html={actividad.desarrolloFormal?.inicio || actividad.inicio} />
                              </div>
                              <div className="rounded-[10px] border border-border bg-background p-3">
                                <p className="mb-2 text-[11px] font-extrabold text-primary">Desarrollo</p>
                                <HtmlPreview html={actividad.desarrolloFormal?.desarrollo || actividad.desarrollo} />
                              </div>
                              <div className="rounded-[10px] border border-border bg-background p-3">
                                <p className="mb-2 text-[11px] font-extrabold text-primary">Cierre</p>
                                <HtmlPreview html={actividad.desarrolloFormal?.cierre || actividad.cierre} />
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Botón sincronizar */}
                <button
                  onClick={handleSincronizar}
                  className="flex items-center justify-center gap-2 w-full border-[1.5px] border-primary text-primary font-bold text-[13px] rounded-[10px] px-5 py-3 hover:bg-pink-light transition-colors print:hidden"
                >
                  <RefreshCw className="w-4 h-4" />
                  Sincronizar con Libro de Clases
                </button>
                {actividad.sincronizada && (
                  <p className="text-[11px] text-green-600 text-center -mt-2 font-semibold flex items-center justify-center gap-1">
                    <Check className="w-3.5 h-3.5" /> Ya sincronizado — el Desarrollo está en el Leccionario
                  </p>
                )}

                {/* Materiales y TICs */}
                <div className="bg-card border border-border rounded-[14px] overflow-hidden">
                  <div className="flex border-b border-border">
                    <button
                      onClick={() => setTabRecursos("materiales")}
                      className={cn("flex items-center gap-1.5 px-4 py-3 text-[12px] font-semibold border-b-2 -mb-[1px] transition-colors",
                        tabRecursos === "materiales" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
                      )}
                    >
                      <Package className="w-3.5 h-3.5" /> Materiales
                    </button>
                    <button
                      onClick={() => setTabRecursos("tics")}
                      className={cn("flex items-center gap-1.5 px-4 py-3 text-[12px] font-semibold border-b-2 -mb-[1px] transition-colors",
                        tabRecursos === "tics" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
                      )}
                    >
                      <Monitor className="w-3.5 h-3.5" /> TICs
                    </button>
                  </div>
                  <div className="p-4">
                    {tabRecursos === "materiales" ? (
                      <div>
                        <div className="flex flex-col gap-1.5 mb-3">
                          {(actividad.materiales || []).length === 0
                            ? <p className="text-[12px] text-muted-foreground">Sin materiales aún.</p>
                            : (actividad.materiales || []).map((m, i) => (
                              <div key={i} className="flex items-center justify-between bg-background rounded-lg px-3 py-2 text-[12px]">
                                <span>{m}</span>
                                <button onClick={() => setActividad(p => ({ ...p, materiales: (p.materiales || []).filter((_, j) => j !== i) }))} className="text-muted-foreground hover:text-red-500">
                                  <X className="w-3 h-3" />
                                </button>
                              </div>
                            ))
                          }
                        </div>
                        <div className="flex gap-2">
                          <input
                            value={nuevoMaterial}
                            onChange={e => setNuevoMaterial(e.target.value)}
                            onKeyDown={e => { if (e.key === "Enter" && nuevoMaterial.trim()) { setActividad(p => ({ ...p, materiales: [...(p.materiales || []), nuevoMaterial.trim()] })); setNuevoMaterial("") } }}
                            placeholder="Agregar material…"
                            className="flex-1 border-[1.5px] border-border rounded-[8px] px-3 py-2 text-[12px] outline-none focus:border-primary"
                          />
                          <button
                            onClick={() => { if (nuevoMaterial.trim()) { setActividad(p => ({ ...p, materiales: [...(p.materiales || []), nuevoMaterial.trim()] })); setNuevoMaterial("") } }}
                            className="bg-primary text-white rounded-[8px] px-3 py-2"
                          >
                            <Plus className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div>
                        <div className="flex flex-col gap-1.5 mb-3">
                          {(actividad.tics || []).length === 0
                            ? <p className="text-[12px] text-muted-foreground">Sin herramientas TIC aún.</p>
                            : (actividad.tics || []).map((t, i) => (
                              <div key={i} className="flex items-center justify-between bg-background rounded-lg px-3 py-2 text-[12px]">
                                <span>{t}</span>
                                <button onClick={() => setActividad(p => ({ ...p, tics: (p.tics || []).filter((_, j) => j !== i) }))} className="text-muted-foreground hover:text-red-500">
                                  <X className="w-3 h-3" />
                                </button>
                              </div>
                            ))
                          }
                        </div>
                        <div className="flex gap-2">
                          <input
                            value={nuevoTic}
                            onChange={e => setNuevoTic(e.target.value)}
                            onKeyDown={e => { if (e.key === "Enter" && nuevoTic.trim()) { setActividad(p => ({ ...p, tics: [...(p.tics || []), nuevoTic.trim()] })); setNuevoTic("") } }}
                            placeholder="Ej: Pizarra digital, Kahoot…"
                            className="flex-1 border-[1.5px] border-border rounded-[8px] px-3 py-2 text-[12px] outline-none focus:border-primary"
                          />
                          <button
                            onClick={() => { if (nuevoTic.trim()) { setActividad(p => ({ ...p, tics: [...(p.tics || []), nuevoTic.trim()] })); setNuevoTic("") } }}
                            className="bg-primary text-white rounded-[8px] px-3 py-2"
                          >
                            <Plus className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div className="bg-card border border-border rounded-[14px] overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-background">
                    <div className="flex items-center gap-2">
                      <Blocks className="w-4 h-4 text-indigo-500" />
                      <h3 className="text-[13px] font-bold">Sugerencias Oficiales de la Unidad</h3>
                    </div>
                    <span className="text-[10px] text-muted-foreground">
                      {actividadesSugeridas.length + evaluacionesSugeridas.length} referencias
                    </span>
                  </div>
                  <div className="flex border-b border-border">
                    <button
                      onClick={() => setTabSugerencias("actividades")}
                      className={cn("flex-1 px-4 py-2.5 text-[12px] font-semibold transition-colors",
                        tabSugerencias === "actividades" ? "text-primary border-b-2 border-primary" : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      Actividades sugeridas
                    </button>
                    <button
                      onClick={() => setTabSugerencias("evaluaciones")}
                      className={cn("flex-1 px-4 py-2.5 text-[12px] font-semibold transition-colors",
                        tabSugerencias === "evaluaciones" ? "text-primary border-b-2 border-primary" : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      Evaluaciones sugeridas
                    </button>
                  </div>
                  <div className="p-4">
                    {unidadDataStatus && (
                      <div className="mb-4 rounded-[12px] border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] leading-relaxed text-amber-800">
                        {unidadDataStatus}
                      </div>
                    )}
                    <div className="max-h-[440px] overflow-y-auto pr-1">
                      {tabSugerencias === "actividades" ? (
                        actividadesSugeridas.length === 0 ? (
                          <p className="text-[12px] text-muted-foreground">No hay actividades sugeridas cargadas para esta unidad.</p>
                        ) : (
                          <div className="flex flex-col gap-3">
                            {actividadesSugeridas.map((item) => (
                              <div key={item.id} className="rounded-[12px] border border-border bg-background p-3">
                                <div className="flex items-center justify-between gap-3 mb-2">
                                  <h4 className="text-[13px] font-bold leading-snug">{item.nombre}</h4>
                                  <button
                                    onClick={() => {
                                      setShowCopilot(true)
                                    }}
                                    className="text-[10px] font-semibold text-primary border border-primary rounded-full px-2 py-1 hover:bg-pink-light transition-colors"
                                  >
                                    Llevar al copiloto
                                  </button>
                                </div>
                                <p className="text-[12px] text-muted-foreground leading-relaxed">{item.descripcion}</p>
                                {item.oas_asociados?.length > 0 && (
                                  <p className="mt-2 text-[11px] text-muted-foreground">
                                    OA asociados: {item.oas_asociados.map((oa) => `OA ${oa}`).join(", ")}
                                  </p>
                                )}
                              </div>
                            ))}
                          </div>
                        )
                      ) : (
                        evaluacionesSugeridas.length === 0 ? (
                          <p className="text-[12px] text-muted-foreground">No hay evaluaciones sugeridas cargadas para esta unidad.</p>
                        ) : (
                          <div className="flex flex-col gap-3">
                            {evaluacionesSugeridas.map((item) => (
                              <div key={item.id} className="rounded-[12px] border border-border bg-background p-3">
                                <div className="flex items-start justify-between gap-3 mb-2">
                                  <div>
                                    <h4 className="text-[13px] font-bold leading-snug">{item.titulo}</h4>
                                    {item.oas_evaluados?.length > 0 && (
                                      <p className="mt-1 text-[11px] text-muted-foreground">
                                        OA evaluados: {item.oas_evaluados.map((oa) => `OA ${oa}`).join(", ")}
                                      </p>
                                    )}
                                  </div>
                                  <button
                                    onClick={() => {
                                      setShowCopilot(true)
                                    }}
                                    className="text-[10px] font-semibold text-primary border border-primary rounded-full px-2 py-1 hover:bg-pink-light transition-colors"
                                  >
                                    Llevar al copiloto
                                  </button>
                                </div>
                                <p className="text-[12px] text-muted-foreground leading-relaxed">{item.actividad_evaluacion}</p>
                                {(item.criterios_proceso?.length || 0) > 0 && (
                                  <div className="mt-3">
                                    <p className="text-[11px] font-semibold text-foreground mb-1">Criterios de proceso</p>
                                    <ul className="list-disc pl-4 text-[12px] text-muted-foreground space-y-1">
                                      {(item.criterios_proceso || []).map((criterio, index) => <li key={index}>{criterio}</li>)}
                                    </ul>
                                  </div>
                                )}
                                {(item.criterios_presentacion?.length || 0) > 0 && (
                                  <div className="mt-3">
                                    <p className="text-[11px] font-semibold text-foreground mb-1">Criterios de presentacion</p>
                                    <ul className="list-disc pl-4 text-[12px] text-muted-foreground space-y-1">
                                      {(item.criterios_presentacion || []).map((criterio, index) => <li key={index}>{criterio}</li>)}
                                    </ul>
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        )
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Modal Banco de Clases */}
        {showBancoModal && (
          <div className="fixed inset-0 z-[600] bg-black/50 flex items-center justify-center p-4">
            <div className="bg-card rounded-[18px] shadow-2xl w-full max-w-[700px] h-[75vh] flex flex-col">
              <div className="flex items-center justify-between px-4 sm:px-7 py-4 sm:py-5 border-b border-border flex-shrink-0">
                <div>
                  <h2 className="text-[17px] font-extrabold flex items-center gap-2"><BookOpen className="w-5 h-5 text-primary" /> Banco de Clases</h2>
                  <p className="text-[12px] text-muted-foreground mt-0.5">Explora tus clases anteriores de {ASIGNATURA} e importa su diseño a la clase actual.</p>
                </div>
                <button onClick={() => setShowBancoModal(false)} className="w-7 h-7 rounded-full bg-background grid place-items-center text-muted-foreground hover:bg-border"><X className="w-4 h-4" /></button>
              </div>

              <div className="flex-1 overflow-y-auto bg-[#FAFBFF] p-5">
                {loadingBanco ? (
                  <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
                    <Loader2 className="w-6 h-6 animate-spin text-primary" />
                    <span className="text-[13px] font-semibold">Cargando tu banco de clases...</span>
                  </div>
                ) : bancoActividades.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
                    <FileText className="w-8 h-8 opacity-50" />
                    <span className="text-[13px]">Aún no tienes clases guardadas en {ASIGNATURA}.</span>
                  </div>
                ) : (
                  <div className="flex flex-col gap-3">
                    {bancoActividades.map((act) => (
                      <div key={act.id} className="bg-card border border-border rounded-[12px] p-4 flex flex-col gap-3 hover:border-primary/40 transition-colors">
                        <div className="flex justify-between items-start">
                          <div>
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-[10px] font-bold bg-pink-light text-primary px-2 py-0.5 rounded-full uppercase tracking-wider">{act.curso}</span>
                              <span className="text-[11px] font-semibold text-muted-foreground border border-border px-2 py-0.5 rounded-full">Clase {act.numeroClase}</span>
                            </div>
                            <h4 className="text-[13px] font-bold leading-snug">{act.objetivo}</h4>
                          </div>
                          <button
                            onClick={() => importarDelBanco(act)}
                            className="bg-primary text-white text-[11px] font-bold px-4 py-2 rounded-lg hover:bg-[#d6335e] transition-colors flex items-center gap-1.5 flex-shrink-0"
                          >
                            <ArrowRight className="w-3.5 h-3.5" /> Importar
                          </button>
                        </div>
                        <div className="text-[12px] text-muted-foreground">
                          {act.desarrollo?.substring(0, 150) || "Sin desarrollo..."}{act.desarrollo && act.desarrollo.length > 150 ? "..." : ""}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── Copiloto: panel fijo lateral de pantalla completa ── */}
        {showCopilot && (
          <>
            {/* Overlay en móvil */}
            <button
              type="button"
              aria-label="Cerrar copiloto"
              className="fixed inset-0 z-[698] bg-slate-950/30 backdrop-blur-[2px] md:hidden"
              onClick={() => setShowCopilot(false)}
            />

            <aside
              style={{ ["--copilot-w" as never]: `${copilotWidth}px` }}
              className={cn(
                "fixed top-0 right-0 z-[699] flex h-screen flex-col border-l border-slate-200/80 bg-white shadow-[-12px_0_40px_rgba(15,23,42,0.07)] w-full md:w-[var(--copilot-w)]",
                !isResizing && "transition-[width] duration-300"
              )}
            >
              {/* Resizer (oculto en móvil) */}
              <div
                className="hidden md:block absolute left-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-purple-400/30 bg-transparent z-[700] transition-colors"
                onMouseDown={() => setIsResizing(true)}
              />

              {/* Header */}
              <div className="flex-shrink-0 px-4 py-3.5 border-b border-slate-100 flex items-center justify-between bg-white">
                <div className="flex items-center gap-2.5">
                  <div className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white shadow-sm">
                    <Sparkles className="h-3.5 w-3.5" />
                  </div>
                  <div>
                    <p className="text-[13px] font-extrabold text-slate-900 leading-none">Copiloto IA</p>
                    <p className="text-[10px] text-slate-400 mt-0.5">{getProviderMeta(aiConfig.provider).label} · {aiConfig.model}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setShowAiSettings(v => !v)}
                    className={cn("grid h-7 w-7 place-items-center rounded-md transition-colors",
                      showAiSettings ? "bg-violet-100 text-violet-600" : "text-slate-400 hover:bg-slate-100"
                    )}
                    title="Configuración de IA"
                  >
                    <KeyRound className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => setShowCopilot(false)}
                    className="grid h-7 w-7 place-items-center rounded-md text-slate-400 transition-colors hover:bg-red-50 hover:text-red-500"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              {/* Panel de configuración (colapsable) */}
              {showAiSettings && (
                <div className="flex-shrink-0 border-b border-slate-100 bg-slate-50 px-4 py-4 space-y-3">
                  <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Tu IA personal (BYOK)</p>
                  <div className="grid grid-cols-2 gap-1 rounded-xl bg-slate-200/70 p-1">
                    <button
                      type="button"
                      onClick={() => setCopilotTab("chat")}
                      className={cn("rounded-lg px-3 py-1.5 text-[12px] font-bold transition-colors", copilotTab === "chat" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700")}
                    >
                      Chat
                    </button>
                    <button
                      type="button"
                      onClick={() => setCopilotTab("prompt")}
                      className={cn("rounded-lg px-3 py-1.5 text-[12px] font-bold transition-colors", copilotTab === "prompt" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700")}
                    >
                      Prompts
                    </button>
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold text-slate-500 mb-1 block">Proveedor</label>
                    <select
                      value={aiConfig.provider}
                      onChange={e => {
                        const p = e.target.value as StoredAiConfig["provider"]
                        setAiConfig(prev => ({ ...prev, provider: p, model: getProviderMeta(p).defaultModel }))
                      }}
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-[12px] font-semibold outline-none focus:border-violet-400"
                    >
                      {AI_PROVIDER_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </div>
                  {aiConfig.provider !== "public" && (
                    <>
                      <div>
                        <label className="text-[11px] font-semibold text-slate-500 mb-1 block">API Key</label>
                        <input
                          type="password"
                          value={aiConfig.token}
                          onChange={e => setAiConfig(prev => ({ ...prev, token: e.target.value }))}
                          placeholder="sk-... / AIza..."
                          className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-[12px] outline-none focus:border-violet-400"
                        />
                      </div>
                      <div>
                        <label className="text-[11px] font-semibold text-slate-500 mb-1 block">Modelo</label>
                        <input
                          value={aiConfig.model}
                          onChange={e => setAiConfig(prev => ({ ...prev, model: e.target.value }))}
                          placeholder={getProviderMeta(aiConfig.provider).defaultModel}
                          className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-[12px] outline-none focus:border-violet-400"
                        />
                      </div>
                    </>
                  )}
                  {aiConfig.provider === "compatible" && (
                    <div>
                      <label className="text-[11px] font-semibold text-slate-500 mb-1 block">Endpoint base</label>
                      <input
                        value={aiConfig.endpoint}
                        onChange={e => setAiConfig(prev => ({ ...prev, endpoint: e.target.value }))}
                        placeholder="https://api.openai.com/v1"
                        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-[12px] outline-none focus:border-violet-400"
                      />
                    </div>
                  )}
                  <div className="rounded-lg bg-slate-100 border border-slate-200 px-3 py-2.5 space-y-1.5">
                    <p className="text-[10px] text-slate-500 leading-relaxed">{getProviderMeta(aiConfig.provider).helper}</p>
                    {getProviderMeta(aiConfig.provider).apiKeyUrl && (
                      <a
                        href={getProviderMeta(aiConfig.provider).apiKeyUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-[11px] font-bold text-violet-600 hover:text-violet-700 hover:underline transition-colors"
                      >
                        <KeyRound className="w-3 h-3" />
                        Obtener API key →
                      </a>
                    )}
                  </div>
                  {copilotTab === "prompt" && (
                    <div className="rounded-xl border border-slate-200 bg-white p-3">
                      <div className="mb-2 flex items-center gap-2">
                        <BrainCircuit className="h-4 w-4 text-fuchsia-500" />
                        <p className="text-[12px] font-bold text-slate-900">Prompt editable</p>
                      </div>
                      <label className="mb-1 block text-[11px] font-semibold text-slate-500">Instrucciones maestras</label>
                      <textarea
                        value={aiConfig.promptExtra || ""}
                        onChange={e => setAiConfig(prev => ({ ...prev, promptExtra: e.target.value }))}
                        className="mb-3 min-h-[68px] w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-[12px] leading-relaxed outline-none focus:border-violet-400"
                        placeholder="Ej: prioriza actividades lúdicas, lenguaje simple, foco PIE..."
                      />
                      <div className="mb-2 grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1">
                        {(Object.keys(PROMPT_MODE_LABELS) as CopilotMode[]).map(mode => (
                          <button
                            key={mode}
                            type="button"
                            onClick={() => setPromptMode(mode)}
                            className={cn("rounded-lg px-2 py-1.5 text-[10px] font-bold transition-colors", promptMode === mode ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-900")}
                          >
                            {PROMPT_MODE_LABELS[mode]}
                          </button>
                        ))}
                      </div>
                      <textarea
                        value={aiConfig.promptOverrides?.[promptMode] || promptPreview}
                        onChange={e => setAiConfig(prev => ({
                          ...prev,
                          promptOverrides: {
                            ...(prev.promptOverrides || {}),
                            [promptMode]: e.target.value,
                          },
                        }))}
                        className="min-h-[180px] w-full rounded-xl border border-slate-200 bg-slate-950 px-3 py-3 font-mono text-[11px] leading-relaxed text-slate-100 outline-none focus:border-fuchsia-400"
                      />
                      <div className="mt-2 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => { void navigator.clipboard.writeText(aiConfig.promptOverrides?.[promptMode] || promptPreview) }}
                          className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-[11px] font-bold text-slate-600 hover:bg-slate-50"
                        >
                          <Copy className="mr-1 inline h-3.5 w-3.5" /> Copiar
                        </button>
                        <button
                          type="button"
                          onClick={() => setAiConfig(prev => ({
                            ...prev,
                            promptOverrides: {
                              ...(prev.promptOverrides || {}),
                              [promptMode]: "",
                            },
                          }))}
                          className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-[11px] font-bold text-slate-600 hover:bg-slate-50"
                        >
                          <RotateCcw className="mr-1 inline h-3.5 w-3.5" /> Usar automático
                        </button>
                        <button
                          type="button"
                          onClick={() => setAiConfig(prev => ({
                            ...prev,
                            promptExtra: savedAiConfig.promptExtra || "",
                            promptOverrides: {
                              ...(prev.promptOverrides || {}),
                              [promptMode]: savedAiConfig.promptOverrides?.[promptMode] || "",
                            },
                          }))}
                          className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-[11px] font-bold text-slate-600 hover:bg-slate-50"
                        >
                          <PencilLine className="mr-1 inline h-3.5 w-3.5" /> Volver al guardado
                        </button>
                      </div>
                    </div>
                  )}
                  <button
                    onClick={() => saveAiConfig(aiConfig)}
                    className="w-full rounded-lg bg-violet-600 px-3 py-2 text-[12px] font-bold text-white hover:bg-violet-700 transition-colors"
                  >
                    Guardar configuración
                  </button>
                </div>
              )}

              {/* Área de mensajes */}
              <div className="flex-1 overflow-y-auto px-4 py-4 bg-slate-50/50 space-y-3">
                <div className="rounded-2xl border border-violet-100 bg-white p-3 shadow-sm">
                  <div className="flex items-start gap-3">
                    <div className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-xl bg-violet-50 text-violet-600">
                      <Clipboard className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[12px] font-extrabold text-slate-800">Pegar respuesta de otra IA</p>
                      <p className="mt-0.5 text-[11px] leading-relaxed text-slate-500">
                        Pega el JSON de ChatGPT, Claude o Gemini y se completa la clase.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setShowExternalImport(prev => !prev)
                        setExternalImportError("")
                      }}
                      className="rounded-lg border border-violet-100 px-2.5 py-1.5 text-[11px] font-bold text-violet-700 hover:bg-violet-50"
                    >
                      {showExternalImport ? "Ocultar" : "Abrir"}
                    </button>
                  </div>

                  {showExternalImport && (
                    <div className="mt-3 space-y-2">
                      <textarea
                        value={externalJsonInput}
                        onChange={(event) => {
                          setExternalJsonInput(event.target.value)
                          if (externalImportError) setExternalImportError("")
                        }}
                        placeholder={'{\n  "analisisBloom": [],\n  "objetivoMultinivel": { ... },\n  "inicio": "<p>...</p>"\n}'}
                        className="min-h-[180px] w-full resize-y rounded-xl border border-slate-200 bg-slate-950 px-3 py-3 font-mono text-[11px] leading-relaxed text-slate-100 outline-none focus:border-violet-400"
                      />
                      {externalImportError && (
                        <p className="rounded-lg border border-red-100 bg-red-50 px-2.5 py-2 text-[11px] font-semibold text-red-600">
                          {externalImportError}
                        </p>
                      )}
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={handleImportarRespuestaExterna}
                          disabled={!externalJsonInput.trim()}
                          className="flex items-center gap-2 rounded-lg bg-violet-600 px-3 py-2 text-[12px] font-bold text-white hover:bg-violet-700 disabled:opacity-50"
                        >
                          <Save className="h-3.5 w-3.5" />
                          Importar y completar clase
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setExternalJsonInput("")
                            setExternalImportError("")
                          }}
                          className="rounded-lg border border-slate-200 px-3 py-2 text-[12px] font-bold text-slate-600 hover:bg-slate-50"
                        >
                          Limpiar
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {chatHistory.length === 0 ? (
                  <div className="flex min-h-[260px] flex-col items-center justify-center text-center py-8">
                    {/* Estado vacío: clase generada o no? */}
                    {[actividad.objetivo, actividad.inicio, actividad.desarrollo, actividad.cierre]
                      .some(f => stripRichText(f || "").length > 0) ? (
                      <>
                        <div className="grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white mb-4 shadow-lg shadow-violet-200">
                          <Sparkles className="h-5 w-5" />
                        </div>
                        <p className="text-[14px] font-bold text-slate-800">Clase detectada</p>
                        <p className="text-[12px] text-slate-500 mt-1.5 max-w-[240px] leading-relaxed">
                          Escríbeme cualquier cosa. ¿Quieres cambiar algo, entender una actividad o explorar otra idea?
                        </p>
                      </>
                    ) : (
                      <>
                        <div className="grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white mb-4 shadow-lg shadow-violet-200">
                          <Bot className="h-5 w-5" />
                        </div>
                        <p className="text-[14px] font-bold text-slate-800">¿Empezamos?</p>
                        <p className="text-[12px] text-slate-500 mt-1.5 max-w-[240px] leading-relaxed">
                          Genera la propuesta inicial y luego conversamos para afinarla.
                        </p>
                        <div className="w-full mt-4">
                          <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wide block mb-1 text-left">Tu propuesta base (Opcional)</label>
                          <textarea 
                            value={actividad.contextoProfesor || ideaInicial}
                            onChange={(e) => {
                              setIdeaInicial(e.target.value)
                              setActividad(p => ({ ...p, contextoProfesor: e.target.value }))
                            }}
                            placeholder="Ej: Quiero que hagamos un juego de mesa matemático..."
                            className="w-full text-[12px] p-2.5 bg-white border border-slate-200 rounded-xl resize-none outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-400/20 transition-all text-left"
                            rows={3}
                          />
                        </div>
                        <button
                          onClick={handleGenerarClase}
                          disabled={isGeneratingAI}
                          className="mt-3 w-full flex justify-center items-center gap-2 rounded-xl bg-gradient-to-r from-violet-500 to-fuchsia-500 px-5 py-2.5 text-[13px] font-bold text-white shadow-md shadow-violet-200 transition-all hover:opacity-90 disabled:opacity-60"
                        >
                          {isGeneratingAI
                            ? <><Loader2 className="h-4 w-4 animate-spin" /> Generando...</>
                            : <><Sparkles className="h-4 w-4" /> Generar primera propuesta</>
                          }
                        </button>
                        {isGeneratingAI && (
                          <button
                            type="button"
                            onClick={cancelGeneration}
                            className="mt-2 w-full rounded-xl border border-red-200 bg-red-50 px-5 py-2 text-[12px] font-bold text-red-600 transition-colors hover:bg-red-100"
                          >
                            Cancelar generación
                          </button>
                        )}
                      </>
                    )}
                  </div>
                ) : (
                  <>
                    {chatHistory.map((msg, i) => (
                      <div key={i} className={cn("flex", msg.role === "user" ? "justify-end" : "justify-start")}>
                        <div className={cn(
                          "max-w-[88%] rounded-2xl px-3.5 py-2.5 text-[13px] leading-relaxed",
                          msg.role === "user"
                            ? "bg-violet-600 text-white rounded-br-sm"
                            : "bg-white border border-slate-100 text-slate-700 shadow-sm rounded-bl-sm"
                        )}>
                          {msg.role === "user" ? (
                            <p>{msg.text}</p>
                          ) : (
                            <div
                              className="prose prose-sm max-w-none prose-p:my-0.5 prose-ul:my-1 prose-li:my-0 prose-strong:text-slate-900"
                              dangerouslySetInnerHTML={{ __html: formatChatMessageHtml(msg.text) }}
                            />
                          )}
                        </div>
                      </div>
                    ))}
                    {isChatLoading && (
                      <div className="flex justify-start">
                        <div className="bg-white border border-slate-100 shadow-sm rounded-2xl rounded-bl-sm px-4 py-3">
                          <div className="flex gap-1 items-center">
                            <span className="w-2 h-2 bg-violet-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                            <span className="w-2 h-2 bg-fuchsia-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                            <span className="w-2 h-2 bg-violet-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                          </div>
                        </div>
                      </div>
                    )}
                    <div ref={chatEndRef} />
                  </>
                )}
              </div>

              {/* Footer: input + botón aplicar */}
              <div className="flex-shrink-0 bg-white border-t border-slate-100 px-3 py-3 space-y-2">
                {/* Botón Aplicar cambios — solo visible cuando hay mensajes de IA */}
                {chatHistory.some(m => m.role === "ai") && (
                  <button
                    onClick={handleAplicarCambios}
                    disabled={isApplying}
                    className="w-full flex items-center justify-center gap-2 rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 text-[12px] font-bold text-violet-700 transition-colors hover:bg-violet-100 disabled:opacity-60"
                  >
                    {isApplying
                      ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Aplicando cambios...</>
                      : <><Wand2 className="h-3.5 w-3.5" /> Aplicar cambios a la clase</>
                    }
                  </button>
                )}

                {/* Input de chat */}
                <div className="flex items-end gap-2">
                  <textarea
                    value={chatInput}
                    onChange={e => setChatInput(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSendChat() }
                    }}
                    placeholder="Escribe tu mensaje... (Enter para enviar)"
                    rows={2}
                    disabled={isChatLoading}
                    className="flex-1 resize-none rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-[13px] outline-none transition-colors focus:border-violet-400 focus:bg-white disabled:opacity-60"
                  />
                  <button
                    type="button"
                    onClick={toggleListen}
                    disabled={isChatLoading}
                    className={cn("flex-shrink-0 grid h-10 w-10 place-items-center rounded-xl border border-slate-200 bg-white text-slate-400 transition-all hover:text-violet-700 disabled:opacity-40", isListening && "border-red-200 bg-red-50 text-red-500")}
                    title={isListening ? "Detener dictado" : "Dictar por voz"}
                  >
                    {isListening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                  </button>
                  <button
                    onClick={handleSendChat}
                    disabled={!chatInput.trim() || isChatLoading}
                    className="flex-shrink-0 grid h-10 w-10 place-items-center rounded-xl bg-violet-600 text-white shadow-sm transition-all hover:bg-violet-700 disabled:opacity-40"
                  >
                    <Send className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </aside>
          </>
        )}

      </div>
    </div>
  )
}

export { ActividadesInner as ActividadesEmbedded }

export function ActividadesContent() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center h-64 gap-3 text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin" />
        <span className="text-[14px]">Cargando…</span>
      </div>
    }>
      <ActividadesInner />
    </Suspense>
  )
}
