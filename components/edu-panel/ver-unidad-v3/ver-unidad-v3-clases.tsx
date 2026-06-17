"use client"

import { useState, useEffect, Suspense, useRef, useMemo, useCallback } from "react"
import type { ReactNode } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import DOMPurify from "isomorphic-dompurify"
import { useAuth } from "@/components/auth/auth-context"
import {
  ChevronLeft, Bookmark, Loader2, Check, ArrowRight,
  ChevronDown, ChevronRight, Plus, X, Target,
  Layers, Clipboard, FileText, Monitor, Package,
  RefreshCw, BookOpen, Calendar, Sparkles, Bot, Blocks,
  Send, Settings2, Wand2, KeyRound, ChevronUp, Mic, MicOff,
  SlidersHorizontal, RotateCcw, BrainCircuit, Copy,
  Save, Trash2, Paperclip, UploadCloud, ExternalLink, HardDrive,
  Download, Eye, Play, AlertCircle, Info, Heart
} from "lucide-react"
import { cn } from "@/lib/utils"
import { useToast } from "@/hooks/use-toast"
import {
  guardarActividadClase, cargarActividadClase,
  cargarCronogramaUnidad, cargarVerUnidad,
  guardarLibroClases, cargarLibroClases,
  getUnidadCompleta, initOAs, mergeOAs, cargarBancoActividades,
  eliminarActividadClase
} from "@/lib/curriculo"
import type { ActividadClase, ArchivoAdjunto, OAEditado, ClaseCronograma, ActividadSugerida, EjemploEvaluacion } from "@/lib/curriculo"
import { ASIGNATURA, UNIT_COLORS, buildUrl, linkifyText, withAsignatura } from "@/lib/shared"
import { cargarNivelMapping, resolveNivel } from "@/lib/nivel-mapping"
import { apiFetch } from "@/lib/api-client"
import {
  DEFAULT_AI_CONFIG, AI_PROVIDER_OPTIONS, normalizeAiConfig, getProviderMeta,
  buildCopilotPrompt, htmlToPlainText, PROMPT_MODE_LABELS,
  parseJsonResponse, coerceGeneratedLesson,
  type CopilotMode, type StoredAiConfig,
} from "@/lib/ai/copilot"
import {
  buildAnonymousStudentSummary,
  type PedagogicalBrief,
  type PedagogicalEngine,
  type PedagogicalExternalSource,
  type StudentSummary,
} from "@/lib/ai/pedagogical-engine"
import { cargarEstudiantes } from "@/lib/estudiantes"
import { IaModal } from "@/components/edu-panel/actividades/ia-modal"
import { ImportWordModal } from "@/components/edu-panel/actividades/import-word-modal"
import { NotebookPptModal } from "@/components/edu-panel/actividades/notebook-ppt-modal"
import { GenerarEvaluacionIaModal } from "@/components/edu-panel/actividades/generar-evaluacion-ia-modal"
import { ModoClaseEnVivo } from "@/components/edu-panel/actividades/modo-clase-en-vivo"
import { DriveSheet } from "@/components/edu-panel/drive/drive-sheet"
import { eliminarArchivoClase, formatoTamaño } from "@/lib/storage"
import {
  buildDrivePreviewUrl,
  actualizarUnidadEnRespaldoVivoDrive,
  crearAccesoDirectoDrive,
  ensureEduPanelClassFolder,
  getGoogleDriveErrorMessage,
  getGoogleDriveToken,
  isGoogleDriveAutosaveEnabled,
  isGoogleDriveConnected,
  subirArchivoADrive,
  subirDocxADrive,
  subirDocxYPdfADrive,
  type DriveItem,
} from "@/lib/google-drive"
import dynamic from 'next/dynamic'

const ReactQuill = dynamic(() => import('react-quill-new'), { ssr: false })

const ESTADOS = [
  { key: "no_planificada", label: "No planificada", cls: "bg-background border border-border text-muted-foreground" },
  { key: "planificada", label: "Planificada", cls: "bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300" },
  { key: "realizada", label: "Realizada", cls: "bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-300" },
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

function sanitizeChatHtml(html: string) {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ["p", "ul", "ol", "li", "b", "strong", "em", "br"],
    ALLOWED_ATTR: [],
  })
}

function formatChatMessageHtml(text: string) {
  const source = text.trim()
  if (!source) return "<p></p>"
  if (/<(p|ul|ol|li|b|strong|em|br)\b/i.test(source)) return sanitizeChatHtml(source)

  const paragraphs = source.split(/\n{2,}/).map(block => block.trim()).filter(Boolean)

  const html = paragraphs.map((block) => {
    const lines = block.split("\n").map(line => line.trim()).filter(Boolean)
    const isList = lines.every(line => /^([-*•]|\d+\.)\s+/.test(line))

    if (isList) {
      return `<ul>${lines.map(line => `<li>${formatInlineHtml(line.replace(/^([-*•]|\d+\.)\s+/, ""))}</li>`).join("")}</ul>`
    }
    return `<p>${lines.map(line => formatInlineHtml(line)).join("<br/>")}</p>`
  }).join("")

  return sanitizeChatHtml(html)
}

function normalizeImportMatch(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
}

function RichArea({ value, onChange, placeholder, rows = 5 }: {
  value: string; onChange: (v: string) => void; placeholder?: string; rows?: number
}) {
  return (
    <div className="bg-card rounded-lg overflow-hidden border-[0.5px] border-border focus-within:border-primary transition-colors shadow-sm">
      <ReactQuill
        theme="snow"
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className="edu-quill"
      />
      <style dangerouslySetInnerHTML={{
        __html: `
        .edu-quill .ql-toolbar { border: none; border-bottom: 0.5px solid var(--border); background: hsl(var(--muted)/0.03); border-radius: 8px 8px 0 0; }
        .edu-quill .ql-container { border: none !important; font-size: 13px; font-family: inherit; }
        .edu-quill .ql-editor { min-height: ${rows * 20}px; line-height: 1.6; }
        .edu-quill .ql-editor p { margin-bottom: 10px; }
      `}} />
    </div>
  )
}

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
    <div className="border-[0.5px] border-border bg-card rounded-lg overflow-hidden shadow-sm hover:border-primary/20 transition-all">
      <div className="flex items-start gap-2.5 px-3 py-3">
        <div className="w-2.5 h-2.5 rounded-full mt-1.5 flex-shrink-0" style={{ background: color }} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-[11px] font-extrabold uppercase" style={{ color }}>
              {oa.esPropio ? "Propio" : `OA ${oa.numero}`}
            </span>
          </div>
          <p className="text-[12px] leading-snug text-foreground font-medium">{oa.descripcion}</p>
          {indicadoresDisponibles.length > 0 && (
            <button
              onClick={() => setOpen(v => !v)}
              className="flex items-center gap-1 mt-1.5 text-[11px] font-bold text-primary hover:opacity-75 transition-opacity"
            >
              {open ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
              {indicadoresSelec.length}/{indicadoresDisponibles.length} indicador{indicadoresDisponibles.length !== 1 ? "es" : ""}
            </button>
          )}
        </div>
        {onRemove && (
          <button onClick={onRemove} className="text-muted-foreground hover:text-red-500 transition-colors ml-1">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
      {open && indicadoresDisponibles.length > 0 && (
        <div className="border-t-[0.5px] border-border bg-muted/10 px-3 py-2 flex flex-col gap-1.5">
          {indicadoresDisponibles.map(ind => (
            <label key={ind.id} className="flex items-start gap-2 text-[11px] cursor-pointer rounded px-1.5 py-1 hover:bg-background transition-colors">
              <input
                type="checkbox"
                checked={activeIds.includes(ind.id)}
                onChange={() => onToggleIndicador?.(oa.id, ind.id)}
                className="mt-0.5 h-3.5 w-3.5 rounded border-border text-primary focus:ring-primary focus:ring-offset-0"
              />
              <span className="font-extrabold flex-shrink-0" style={{ color }}>
                {oa.esPropio ? "Propio" : `OA ${oa.numero}`}
              </span>
              <span className={cn("leading-snug font-medium", activeIds.includes(ind.id) ? "text-foreground" : "text-muted-foreground/50 line-through")}>
                {ind.texto}
              </span>
            </label>
          ))}
        </div>
      )}
    </div>
  )
}

function HtmlPreview({ html, empty = "Sin registro." }: { html?: string; empty?: string }) {
  const text = stripRichText(html || "")
  if (!text) return <p className="text-[12px] text-muted-foreground italic">{empty}</p>
  return (
    <div
      className="prose prose-sm max-w-none text-[12px] leading-relaxed prose-p:my-0.5 prose-ul:my-0.5 prose-li:my-0 text-slate-700 dark:text-slate-300"
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
      ? "border-emerald-250 bg-emerald-50 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-350"
      : nivel === "MEDIO"
        ? "border-sky-250 bg-sky-50 dark:bg-sky-950/20 text-sky-700 dark:text-sky-350"
        : "border-fuchsia-250 bg-fuchsia-50 dark:bg-fuchsia-950/20 text-fuchsia-700 dark:text-fuchsia-350"

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "group flex h-full min-h-[128px] flex-col rounded-lg border-[0.5px] p-3 text-left transition-all hover:-translate-y-0.5 hover:shadow-sm cursor-pointer",
        active ? "border-primary bg-primary/5 ring-1 ring-primary/20" : "border-border bg-card"
      )}
    >
      <div className="mb-2 flex items-center justify-between gap-2 w-full">
        <span className={cn("rounded border-[0.5px] px-1.5 py-0.5 text-[9.5px] font-extrabold uppercase", tone)}>
          {label}
        </span>
        <span className="text-[10px] font-bold text-muted-foreground">{nivel}</span>
      </div>
      <p className="flex-1 text-[12px] leading-relaxed text-foreground font-medium">{texto || "Pendiente de generar."}</p>
      <div className="mt-2.5 flex items-center justify-between w-full">
        {active ? <span className="text-[10px] font-extrabold text-primary">Recomendado</span> : <span />}
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
            "grid h-7 w-7 place-items-center rounded bg-muted/20 text-muted-foreground hover:text-primary transition-colors",
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
    <div className="rounded-lg border-[0.5px] border-border bg-card shadow-sm">
      <div className="flex items-center justify-between gap-2 border-b-[0.5px] border-border px-4 py-3">
        <button
          type="button"
          onClick={() => setOpen(v => !v)}
          className="flex min-w-0 items-center gap-2 text-left cursor-pointer"
        >
          {open ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
          <span className="text-primary">{icon}</span>
          <span className="truncate text-[13px] font-bold text-foreground">{title}</span>
        </button>
        {onRegenerate && (
          <button
            type="button"
            onClick={onRegenerate}
            disabled={disabled}
            className="flex items-center gap-1.5 rounded-lg border-[0.5px] border-border px-2.5 py-1.5 text-[11px] font-bold text-muted-foreground transition-colors hover:bg-muted/30 hover:text-primary disabled:opacity-50 cursor-pointer"
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

interface VerUnidadV3ClasesProps {
  cursoOverride?: string
  unidadOverride?: string
  unidadCurricularOverride?: string
  claseOverride?: number
  compact?: boolean
  oasOverride?: OAEditado[]
}

function VerUnidadV3ClasesInner({ cursoOverride, unidadOverride, unidadCurricularOverride, claseOverride, compact, oasOverride }: VerUnidadV3ClasesProps = {}) {
  const { toast } = useToast()
  const { signInWithGoogleDrive } = useAuth()
  const searchParams = useSearchParams()

  const [simpleMode, setSimpleMode] = useState(false)
  const [isObjectivesFloated, setIsObjectivesFloated] = useState(false)
  const [objectivesPanelHeight, setObjectivesPanelHeight] = useState<number | null>(null)
  const anchorRef = useRef<HTMLDivElement | null>(null)
  const floatingObjectivesRef = useRef<HTMLDivElement | null>(null)
  const cierreSectionRef = useRef<HTMLDivElement | null>(null)

  // Listen to simple mode changes
  useEffect(() => {
    setSimpleMode(localStorage.getItem("eduSimpleMode") === "true")
    const handler = () => {
      setSimpleMode(localStorage.getItem("eduSimpleMode") === "true")
    }
    window.addEventListener("eduSimpleModeChange", handler)
    return () => window.removeEventListener("eduSimpleModeChange", handler)
  }, [])

  // Scroll listener to toggle objectives float state
  useEffect(() => {
    const scrollContainer = document.querySelector("main")

    const handleScroll = () => {
      if (anchorRef.current) {
        const rect = anchorRef.current.getBoundingClientRect()
        setIsObjectivesFloated(rect.top < -180)
      }
    }

    scrollContainer?.addEventListener("scroll", handleScroll)
    window.addEventListener("scroll", handleScroll, { passive: true })
    // Run once after initial render/hydration
    const timer = setTimeout(handleScroll, 100)
    return () => {
      clearTimeout(timer)
      scrollContainer?.removeEventListener("scroll", handleScroll)
      window.removeEventListener("scroll", handleScroll)
    }
  }, [simpleMode])

  const cursoParam = cursoOverride || searchParams.get("curso") || "1° A"
  const rawUnitIdLocal = searchParams.get("unitIdLocal")
  const unidadParam = unidadOverride || searchParams.get("unidad") || rawUnitIdLocal || "unidad_1"
  const unidadCurricularParam = unidadCurricularOverride || searchParams.get("unidad") || unidadParam
  const claseParam = claseOverride || parseInt(searchParams.get("clase") || "1")

  const [clases, setClases] = useState<ClaseCronograma[]>([])
  const [oasCurriculo, setOasCurriculo] = useState<OAEditado[]>([])
  const [selectedClase, setSelectedClase] = useState(claseParam)
  const [actividad, setActividad] = useState<Partial<ActividadClase>>({
    estado: "no_planificada", inicio: "", desarrollo: "", cierre: "",
    adecuacion: "", objetivo: "", oaIds: [], habilidades: [], actitudes: [], materiales: [], tics: [], archivos: [], sincronizada: false
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
  const [exportingDrive, setExportingDrive] = useState(false)
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving_silent" | "saved" | "error" | "synced">("idle")
  const [tabDerecho, setTabDerecho] = useState<"desarrollo" | "adecuacion">("desarrollo")
  const [tabSugerencias, setTabSugerencias] = useState<"actividades" | "evaluaciones">("actividades")
  const [subiendoDrive, setSubiendoDrive] = useState(false)
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({})
  const [dragArchivoActivo, setDragArchivoActivo] = useState(false)
  const [showEstadoMenu, setShowEstadoMenu] = useState(false)
  const [showBancoModal, setShowBancoModal] = useState(false)
  const [previewArchivo, setPreviewArchivo] = useState<ArchivoAdjunto | null>(null)
  const [showImportWordModal, setShowImportWordModal] = useState(false)
  const [showNotebookPptModal, setShowNotebookPptModal] = useState(false)
  const [showGenerarEvaluacionIaModal, setShowGenerarEvaluacionIaModal] = useState(false)
  const [showModoClaseEnVivo, setShowModoClaseEnVivo] = useState(false)
  const [bancoActividades, setBancoActividades] = useState<ActividadClase[]>([])
  const [loadingBanco, setLoadingBanco] = useState(false)
  const [isGeneratingAI, setIsGeneratingAI] = useState(false)
  const [ideaInicial, setIdeaInicial] = useState("")

  // ── Copiloto IA ──
  const [showIaModal, setShowIaModal] = useState(false)
  const [showCopilot, setShowCopilot] = useState(false)
  const [isClassesRailCollapsed, setIsClassesRailCollapsed] = useState(false)
  const [chatHistory, setChatHistory] = useState<Array<{ role: "user" | "ai"; text: string }>>([])
  const [chatInput, setChatInput] = useState("")
  const [isChatLoading, setIsChatLoading] = useState(false)
  const [showAiSettings, setShowAiSettings] = useState(false)
  const [showExternalImport, setShowExternalImport] = useState(false)
  const [externalJsonInput, setExternalJsonInput] = useState("")
  const [externalImportError, setExternalImportError] = useState("")
  const [copilotTab, setCopilotTab] = useState<"chat" | "prompt">("chat")
  const [promptMode, setPromptMode] = useState<CopilotMode>("crear_inicial")
  const [isListening, setIsListening] = useState(false)
  const [aiConfig, setAiConfig] = useState<StoredAiConfig>(DEFAULT_AI_CONFIG)
  const [savedAiConfig, setSavedAiConfig] = useState<StoredAiConfig>(DEFAULT_AI_CONFIG)
  const [studentSummary, setStudentSummary] = useState<StudentSummary | undefined>(undefined)
  const chatEndRef = useRef<HTMLDivElement>(null)
  const generationAbortRef = useRef<AbortController | null>(null)
  const recognitionRef = useRef<any>(null)
  const driveFileInputRef = useRef<HTMLInputElement | null>(null)

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

  useEffect(() => {
    let cancelled = false
    if (!cursoParam) {
      setStudentSummary(undefined)
      return
    }
    cargarEstudiantes(cursoParam)
      .then((students) => {
        if (!cancelled) setStudentSummary(buildAnonymousStudentSummary(students as unknown as Array<Record<string, unknown>>))
      })
      .catch(() => {
        if (!cancelled) setStudentSummary(undefined)
      })
    return () => { cancelled = true }
  }, [cursoParam])

  // Scroll al fondo del chat
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
        alert("Micrófono bloqueado.")
      } else {
        console.error(event.error)
      }
    }
    recognition.onend = () => setIsListening(false)
    recognition.start()
    recognitionRef.current = recognition
    setIsListening(true)
  }

  const getIndicadoresSeleccionados = useCallback((oa: OAEditado) => {
    const indicadoresDisponibles = (oa.indicadores || []).filter(i => i.seleccionado)
    const selectedIds = actividad.indicadoresPorOa?.[oa.id]
    return selectedIds
      ? indicadoresDisponibles.filter(i => selectedIds.includes(i.id))
      : indicadoresDisponibles
  }, [actividad.indicadoresPorOa])

  const buildLessonPayload = useCallback((modo?: CopilotMode, customMessage = "") => {
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
      referenciasCurriculares: {
        actividadesSugeridas: ((unidadData?.actividades_sugeridas || []) as ActividadSugerida[]).slice(0, 6),
        ejemplosEvaluacion: ((unidadData?.ejemplos_evaluacion || []) as EjemploEvaluacion[]).slice(0, 4),
      },
      studentSummary,
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
  }, [actividad, aiConfig, clases.length, cursoParam, getIndicadoresSeleccionados, ideaInicial, nivelCurricular, oasCurriculo, selectedClase, studentSummary, unidadContextoDocente, unidadData, unidadObjetivoDocente])

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

  const runAiRequest = async (modo: CopilotMode, customMessage = "", options?: {
    onlyBloom?: boolean
    onlyIndicators?: boolean
    detailedOnly?: boolean
    engine?: PedagogicalEngine
    focoPedagogico?: string
    tono?: string
    allowExternalSearch?: boolean
    pedagogicalBrief?: PedagogicalBrief
    externalSources?: PedagogicalExternalSource[]
  }) => {
    const controller = new AbortController()
    generationAbortRef.current = controller
    setIsGeneratingAI(true)
    try {
      const res = await apiFetch("/api/generar-clase", {
        method: "POST",
        signal: controller.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...buildLessonPayload(modo, customMessage),
          modo,
          engine: options?.engine,
          focoPedagogico: options?.focoPedagogico,
          tono: options?.tono,
          allowExternalSearch: options?.allowExternalSearch ?? false,
          pedagogicalBrief: options?.pedagogicalBrief,
          externalSources: options?.externalSources,
          chatHistory,
        }),
      })
      const data = await res.json()
      if (data?.error === "json_parse_failed" && typeof data?.rawText === "string") {
        setExternalJsonInput(data.rawText)
        setExternalImportError(data.message || "La IA no devolvió JSON válido. Edita la respuesta y aplica manualmente.")
        setShowExternalImport(true)
        toast({
          title: "Respuesta IA con formato inválido",
          description: "Edita e importa a mano.",
          variant: "destructive",
        })
        return null
      }
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

  const handleGenerarClase = async (options?: {
    foco?: string
    tono?: string
    pedagogicalBrief?: PedagogicalBrief
    allowExternalSearch?: boolean
  }) => {
    try {
      await runAiRequest("crear_inicial", stripRichText(actividad.contextoProfesor || ideaInicial || ""), {
        engine: "pedagogical_v1",
        focoPedagogico: options?.foco,
        tono: options?.tono,
        pedagogicalBrief: options?.pedagogicalBrief,
        allowExternalSearch: options?.allowExternalSearch ?? false,
        externalSources: options?.pedagogicalBrief?.fuentesExternas,
      })
      setChatHistory([{ role: "ai", text: "✅ He generado una propuesta de clase. ¿Quieres que cambie algo?" }])
    } catch (e: any) {
      if (e?.name === "AbortError") return
      toast({
        title: "Error de IA",
        description: e.message || "No se pudo generar la clase.",
        variant: "destructive"
      })
    }
  }

  const aplicarRespuestaExterna = (raw: string, options?: { closeExternalImport?: boolean }) => {
    const rawInput = raw.trim()
    if (!rawInput) {
      setExternalImportError("Pega el JSON que entregó la IA.")
      return false
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

      if (lesson.objetivo?.trim()) importedData.objetivo = lesson.objetivo
      if (lesson.inicio?.trim()) importedData.inicio = lesson.inicio
      if (lesson.desarrollo?.trim()) importedData.desarrollo = lesson.desarrollo
      if (lesson.cierre?.trim()) importedData.cierre = lesson.cierre
      if (lesson.adecuacion?.trim()) importedData.adecuacion = lesson.adecuacion
      if (lesson.materiales?.length) importedData.materiales = lesson.materiales
      if (lesson.tics?.length) importedData.tics = lesson.tics
      if (lesson.objetivoMultinivel) importedData.objetivoMultinivel = lesson.objetivoMultinivel
      if (lesson.indicadoresEvaluacion?.length) importedData.indicadoresEvaluacion = lesson.indicadoresEvaluacion
      if (lesson.actividadEvaluacion) importedData.actividadEvaluacion = lesson.actividadEvaluacion
      if (lesson.analisisBloom?.length) importedData.analisisBloom = lesson.analisisBloom

      setActividad(prev => ({
        ...prev,
        ...importedData,
        desarrolloFormal: lesson.inicio || lesson.desarrollo || lesson.cierre
          ? { inicio: lesson.inicio || "", desarrollo: lesson.desarrollo || "", cierre: lesson.cierre || "" }
          : prev.desarrolloFormal,
      }))

      if (options?.closeExternalImport !== false) {
        setShowExternalImport(false)
        setExternalJsonInput("")
        setExternalImportError("")
      }
      toast({ title: "Cambios aplicados", description: "Se cargó el contenido de la IA." })
      return true
    } catch (e: any) {
      setExternalImportError(e.message || "Error al procesar el JSON. Valida el formato.")
      return false
    }
  }

  const handleImportarRespuestaExterna = () => {
    aplicarRespuestaExterna(externalJsonInput)
  }

  const handleSendChat = async () => {
    const msg = chatInput.trim()
    if (!msg || isChatLoading) return
    setChatInput("")
    setChatHistory(prev => [...prev, { role: "user", text: msg }])
    setIsChatLoading(true)
    try {
      const data = await runAiRequest("chat", msg)
      if (data) {
        setChatHistory(prev => [...prev, { role: "ai", text: data.respuestaChat || "Listo, apliqué los cambios solicitados." }])
      }
    } catch (e: any) {
      if (e?.name === "AbortError") return
      setChatHistory(prev => [...prev, { role: "ai", text: `❌ Lo siento, ocurrió un error: ${e.message || "No pude procesar tu solicitud."}` }])
    } finally {
      setIsChatLoading(false)
    }
  }

  const handleAplicarCambios = async () => {
    // Aplicar los cambios propuestos del copiloto
    toast({ title: "Cambios aplicados", description: "La planificación ha sido actualizada." })
  }

  const handleRegenerarBloom = async () => {
    try {
      await runAiRequest("regenerar_bloom", stripRichText(actividad.contextoProfesor || ""), { onlyBloom: true })
      toast({ title: "Bloom regenerado" })
    } catch (e: any) {
      toast({ title: "Error de IA", description: e.message || "No se pudo regenerar Bloom.", variant: "destructive" })
    }
  }

  const handleRegenerarIndicadores = async () => {
    try {
      await runAiRequest("regenerar_indicadores", stripRichText(actividad.contextoProfesor || ""), { onlyIndicators: true })
      toast({ title: "Indicadores regenerados" })
    } catch (e: any) {
      toast({ title: "Error de IA", description: e.message || "No se pudo regenerar los indicadores.", variant: "destructive" })
    }
  }

  const handleRegenerarDetallado = async () => {
    try {
      await runAiRequest("freddy_detallado", stripRichText(actividad.contextoProfesor || ""), { detailedOnly: true })
      toast({ title: "Detalle regenerado" })
    } catch (e: any) {
      toast({ title: "Error de IA", description: e.message || "No se pudo generar el detallado.", variant: "destructive" })
    }
  }

  const abrirBanco = async () => {
    setShowBancoModal(true)
    setLoadingBanco(true)
    try {
      const res = await cargarBancoActividades(ASIGNATURA)
      setBancoActividades(res || [])
    } catch {
      toast({ title: "Error al cargar banco", variant: "destructive" })
    } finally {
      setLoadingBanco(false)
    }
  }

  const importarDelBanco = (act: ActividadClase) => {
    setActividad(prev => ({
      ...prev,
      objetivo: act.objetivo || prev.objetivo,
      inicio: act.inicio || prev.inicio,
      desarrollo: act.desarrollo || prev.desarrollo,
      cierre: act.cierre || prev.cierre,
      adecuacion: act.adecuacion || prev.adecuacion,
      materiales: act.materiales?.length ? act.materiales : prev.materiales,
      tics: act.tics?.length ? act.tics : prev.tics,
      analisisBloom: act.analisisBloom || prev.analisisBloom,
      objetivoMultinivel: act.objetivoMultinivel || prev.objetivoMultinivel,
      indicadoresEvaluacion: act.indicadoresEvaluacion || prev.indicadoresEvaluacion,
      actividadEvaluacion: act.actividadEvaluacion || prev.actividadEvaluacion,
    }))
    setShowBancoModal(false)
    toast({ title: "Clase importada", description: `Se importó la planificación de la clase del curso ${act.curso}.` })
  }

  const handleToggleIndicador = (oaId: string, indicadorId: string) => {
    setActividad(prev => {
      const current = prev.indicadoresPorOa?.[oaId] || []
      const ya = current.includes(indicadorId)
      const nextIds = ya ? current.filter(id => id !== indicadorId) : [...current, indicadorId]
      return {
        ...prev,
        indicadoresPorOa: {
          ...(prev.indicadoresPorOa || {}),
          [oaId]: nextIds,
        }
      }
    })
  }

  const importarDesdeWord = (payload: Partial<Record<"objetivo" | "inicio" | "desarrollo" | "cierre" | "materiales" | "tics" | "adecuacion" | "oas" | "habilidades" | "actitudes", string | string[]>>) => {
    const importedOaText = Array.isArray(payload.oas) ? normalizeImportMatch(payload.oas.join(" ")) : ""
    const importedOaIds = importedOaText
      ? oasCurriculo
        .filter(oa => {
          const numero = oa.numero ? normalizeImportMatch(`oa ${oa.numero}`) : ""
          const id = normalizeImportMatch(oa.id)
          const descripcion = normalizeImportMatch(oa.descripcion || "").slice(0, 80)
          return (numero && importedOaText.includes(numero)) ||
            importedOaText.includes(id) ||
            (descripcion.length > 24 && importedOaText.includes(descripcion))
        })
        .map(oa => oa.id)
      : []
    setActividad(prev => ({
      ...prev,
      objetivo: typeof payload.objetivo === "string" && payload.objetivo.trim() ? htmlToPlainText(payload.objetivo) : prev.objetivo,
      inicio: typeof payload.inicio === "string" && payload.inicio.trim() ? payload.inicio : prev.inicio,
      desarrollo: typeof payload.desarrollo === "string" && payload.desarrollo.trim() ? payload.desarrollo : prev.desarrollo,
      cierre: typeof payload.cierre === "string" && payload.cierre.trim() ? payload.cierre : prev.cierre,
      adecuacion: typeof payload.adecuacion === "string" && payload.adecuacion.trim() ? payload.adecuacion : prev.adecuacion,
      oaIds: importedOaIds.length ? Array.from(new Set([...(prev.oaIds || []), ...importedOaIds])) : prev.oaIds,
      habilidades: Array.isArray(payload.habilidades) && payload.habilidades.length ? payload.habilidades : prev.habilidades,
      actitudes: Array.isArray(payload.actitudes) && payload.actitudes.length ? payload.actitudes : prev.actitudes,
      materiales: Array.isArray(payload.materiales) && payload.materiales.length ? payload.materiales : prev.materiales,
      tics: Array.isArray(payload.tics) && payload.tics.length ? payload.tics : prev.tics,
    }))
  }

  const tieneContenidoClase = useMemo(() => {
    return [
      actividad.objetivo,
      actividad.inicio,
      actividad.desarrollo,
      actividad.cierre,
      actividad.adecuacion,
      ...(actividad.materiales || []),
      ...(actividad.tics || []),
      ...(actividad.archivos || []).map(f => f.nombre),
    ].some(value => stripRichText(String(value || "")).trim().length > 0)
  }, [actividad])

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
        const nivel = resolveNivel(cursoParam, mapping, ASIGNATURA)
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
          setUnidadDataStatus(`No hay bases curriculares oficiales.`)
        } else if (!unidadCompleta) {
          setUnidadDataStatus(`No se encontró la unidad curricular ${unidadCurricularParam}.`)
        } else {
          const totalReferencias = (unidadCompleta.actividades_sugeridas?.length || 0) + (unidadCompleta.ejemplos_evaluacion?.length || 0)
          setUnidadData(unidadCompleta)
          setUnidadDataStatus(totalReferencias === 0 ? "Sin sugerencias oficiales cargadas." : null)
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
          setUnidadDataStatus("Ocurrió un problema al cargar el contexto.")
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void cargarContexto()
    return () => { cancelled = true }
  }, [cursoParam, unidadParam, unidadCurricularParam, claseOverride, oasOverride])

  // Cargar clase
  useEffect(() => {
    cargarActividadClase(cursoParam, unidadParam, selectedClase).then(data => {
      const claseData = clases.find(c => c.numero === selectedClase)
      if (data) {
        setActividad({
          ...data,
          oaIds: claseData?.oaIds || [],
        })
      } else {
        setActividad({
          estado: "no_planificada",
          inicio: "", desarrollo: "", cierre: "", adecuacion: "",
          objetivo: "",
          oaIds: claseData?.oaIds || [],
          habilidades: [], actitudes: [], materiales: [], tics: [], archivos: [], sincronizada: false,
        })
      }
      ignoreNextSaveRef.current = true;
    })
  }, [selectedClase, clases, cursoParam, unidadParam])

  // Autoguardado
  const ignoreNextSaveRef = useRef(true);
  const handleGuardarRef = useRef<((isAutoSave?: boolean) => Promise<void>) | null>(null)
  useEffect(() => {
    if (loading) return
    if (ignoreNextSaveRef.current) {
      ignoreNextSaveRef.current = false
      return
    }
    setSaveStatus("saving_silent")
    const timer = setTimeout(() => {
      void handleGuardarRef.current?.(true)
    }, 1600)
    return () => clearTimeout(timer)
  }, [actividad, loading])

  const handleGuardar = async (isAutoSave = false) => {
    if (!isAutoSave) setSaving(true)
    try {
      const claseData = clases.find(c => c.numero === selectedClase)
      const actGuardada = {
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
        archivos: actividad.archivos || [],
        estado: actividad.estado || "planificada",
        sincronizada: actividad.sincronizada || false,
        contextoProfesor: actividad.contextoProfesor || "",
        analisisBloom: actividad.analisisBloom,
        objetivoMultinivel: actividad.objetivoMultinivel,
        indicadoresEvaluacion: actividad.indicadoresEvaluacion,
        actividadEvaluacion: actividad.actividadEvaluacion,
        desarrolloFormal: actividad.desarrolloFormal,
        indicadoresPorOa: actividad.indicadoresPorOa,
      }
      await guardarActividadClase(actGuardada)
      await sincronizarPlanificacionClaseDrive(actGuardada)
      await sincronizarClaseEnRespaldoVivoDrive(actGuardada)
      ignoreNextSaveRef.current = true
      setActividad(p => ({ ...p, estado: actGuardada.estado }))
      setSaveStatus("saved")
      setTimeout(() => setSaveStatus("idle"), 2500)
    } catch {
      setSaveStatus("error")
      setTimeout(() => setSaveStatus("idle"), 3000)
    } finally { setSaving(false) }
  }

  useEffect(() => {
    handleGuardarRef.current = handleGuardar
  })

  const handleExportarClaseDrive = async () => {
    if (exportingDrive) return
    setExportingDrive(true)
    try {
      const token = await ensureDriveToken()
      const { classPlanificacionFolder } = await ensureEduPanelClassFolder(token, {
        ...driveContext,
        numeroClase: selectedClase,
      })

      const oasSeleccionados = oasCurriculo.filter(oa => (actividad.oaIds || []).includes(oa.id))
      const oasBasales = oasSeleccionados.filter(o => o.tipo !== "oat").map(o => `OA ${o.numero}: ${o.descripcion}`)
      const oasTransversales = oasSeleccionados.filter(o => o.tipo === "oat").map(o => `OA ${o.numero}: ${o.descripcion}`)
      const indicadores = oasSeleccionados.flatMap(oa => {
        const selectedIds = actividad.indicadoresPorOa?.[oa.id]
        return (oa.indicadores || [])
          .filter(ind => ind.seleccionado)
          .filter(ind => !selectedIds || selectedIds.includes(ind.id))
          .map(ind => `${oa.numero ? `OA ${oa.numero}` : oa.id}: ${ind.texto}`)
      })

      const res = await apiFetch("/api/export-planificacion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          formato: "detallado",
          nivel: nivelCurricular || cursoParam,
          asignatura: ASIGNATURA,
          unidades: [{
            numero: Number(unidadParam.replace(/\D/g, "")) || 1,
            nombre: unidadData?.nombre_unidad || unidadParam,
            oasBasales,
            oasTransversales,
            clases: [{
              numero: selectedClase,
              oasOcupados: oasBasales,
              indicadores,
              objetivo: stripRichText(actividad.objetivo || ""),
              inicio: stripRichText(actividad.inicio || ""),
              desarrollo: stripRichText(actividad.desarrollo || ""),
              cierre: stripRichText(actividad.cierre || ""),
              recursos: actividad.materiales || [],
              tics: actividad.tics || [],
            }],
          }],
        }),
      })

      if (!res.ok) throw new Error("No se pudo generar el documento.")
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `Clase_${String(selectedClase).padStart(2, "0")}_${ASIGNATURA}_${cursoParam}.docx`.replace(/\s+/g, "_")
      a.click()
      URL.revokeObjectURL(url)

      await subirDocxYPdfADrive(token, {
        docx: blob,
        folderId: classPlanificacionFolder.id,
        fileName: `Clase_${String(selectedClase).padStart(2, "0")}_Planificacion.docx`,
      })
      toast({ title: "Clase exportada", description: "Descargada y subida a Drive." })
    } catch (error) {
      toast({ title: "No se pudo exportar", description: getGoogleDriveErrorMessage(error), variant: "destructive" })
    } finally { setExportingDrive(false) }
  }

  const handleBorrarClase = async () => {
    if (!tieneContenidoClase) return
    const ok = window.confirm(`¿Borrar la planificación de la clase ${selectedClase}? Esta acción no se puede deshacer.`)
    if (!ok) return
    setDeleting(true)
    try {
      await Promise.allSettled((actividad.archivos || []).map(f => eliminarArchivoClase(f.storagePath)))
      await eliminarActividadClase(cursoParam, unidadParam, selectedClase, ASIGNATURA)
      const claseData = clases.find(c => c.numero === selectedClase)
      ignoreNextSaveRef.current = true
      setActividad({
        estado: "no_planificada", inicio: "", desarrollo: "", cierre: "", adecuacion: "", objetivo: "",
        oaIds: claseData?.oaIds || [], habilidades: [], actitudes: [], materiales: [], tics: [], archivos: [], sincronizada: false
      })
      setChatHistory([])
      setChatInput("")
      toast({ title: "Clase borrada" })
    } catch {
      toast({ title: "No se pudo borrar", variant: "destructive" })
    } finally { setDeleting(false) }
  }

  const handleSincronizar = async () => {
    const claseData = clases.find(c => c.numero === selectedClase)
    const fecha = claseData?.fecha || new Date().toLocaleDateString("es-CL")
    try {
      const existente = await cargarLibroClases(ASIGNATURA, cursoParam, fecha)
      const bloques = existente?.bloques || []
      const idx = bloques.findIndex(b => b.id.includes(`clase${selectedClase}`))
      if (idx >= 0) {
        bloques[idx] = {
          ...bloques[idx],
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
      setTimeout(() => setSaveStatus("idle"), 2500)
      toast({ title: "Sincronizado con libro de clases" })
    } catch {
      toast({ title: "Error al sincronizar", variant: "destructive" })
    }
  }

  const driveContext = {
    tipo: "unidad" as const,
    asignatura: ASIGNATURA,
    curso: cursoParam,
    unidadId: unidadParam,
    unidadNombre: unidadData?.nombre_unidad || unidadParam,
  }

  const ensureDriveToken = async () => {
    let token = getGoogleDriveToken()
    if (!token || !isGoogleDriveConnected()) {
      await signInWithGoogleDrive()
      token = getGoogleDriveToken()
    }
    if (!token) throw new Error("Google Drive no autorizado.")
    return token
  }

  const esArchivoTic = (file: File) => {
    const name = file.name.toLowerCase()
    const type = file.type.toLowerCase()
    return type.includes("presentation") || type.includes("video") || name.endsWith(".ppt") || name.endsWith(".pptx") || name.endsWith(".mp4")
  }

  const archivoAdjuntoDesdeDrive = (item: DriveItem, folderId?: string): ArchivoAdjunto => ({
    id: `drive_${item.id}_${Date.now()}`,
    nombre: item.name,
    url: item.webViewLink || buildDrivePreviewUrl(item) || "",
    storagePath: "",
    tipo: item.mimeType,
    tamaño: Number(item.size || 0),
    subidoEn: Date.now(),
    provider: "drive",
    driveFileId: item.id,
    driveFolderId: folderId || item.parents?.[0],
    webViewLink: item.webViewLink,
    previewUrl: buildDrivePreviewUrl(item) || undefined,
    syncedAt: Date.now(),
  })

  const handleAdjuntarDrive = async (item: DriveItem) => {
    if ((actividad.archivos || []).some(f => f.driveFileId === item.id)) {
      toast({ title: "Ya adjuntado" })
      return
    }
    setActividad(prev => ({
      ...prev,
      archivos: [...(prev.archivos || []), archivoAdjuntoDesdeDrive(item)],
      materiales: prev.materiales?.includes(item.name) ? prev.materiales : [...(prev.materiales || []), item.name],
    }))
    try {
      const token = getGoogleDriveToken()
      if (token && isGoogleDriveConnected()) {
        const { workspace } = await ensureEduPanelClassFolder(token, { ...driveContext, numeroClase: selectedClase })
        const isTic = esArchivoTic({ name: item.name, type: item.mimeType } as unknown as File)
        const parentId = isTic ? workspace.folders.tics?.id : workspace.folders.materiales?.id
        if (parentId) {
          await crearAccesoDirectoDrive(token, { targetId: item.id, parentId, name: item.name })
        }
      }
    } catch (e) {
      console.warn(e)
    }
  }

  const handleSubirArchivosDrive = async (files: FileList | File[]) => {
    const selectedFiles = Array.from(files)
    if (selectedFiles.length === 0 || subiendoDrive) return
    setSubiendoDrive(true)
    try {
      const token = await ensureDriveToken()
      const { workspace, classMaterialesFolder, classTicsFolder } = await ensureEduPanelClassFolder(token, { ...driveContext, numeroClase: selectedClase })
      for (const file of selectedFiles) {
        const progressKey = `drive_${file.name}_${file.lastModified}`
        const isTic = esArchivoTic(file)
        const folderId = isTic ? classTicsFolder.id : classMaterialesFolder.id
        const parentId = isTic ? workspace.folders.tics?.id : workspace.folders.materiales?.id
        setUploadProgress(prev => ({ ...prev, [progressKey]: 0 }))
        const driveFile = await subirArchivoADrive(token, {
          file,
          folderId,
          onProgress: progress => setUploadProgress(prev => ({ ...prev, [progressKey]: progress })),
        })
        if (parentId) {
          await crearAccesoDirectoDrive(token, { targetId: driveFile.id, parentId, name: driveFile.name }).catch(() => null)
        }
        setActividad(prev => ({
          ...prev,
          archivos: [...(prev.archivos || []), archivoAdjuntoDesdeDrive(driveFile, folderId)],
          materiales: prev.materiales?.includes(driveFile.name) ? prev.materiales : [...(prev.materiales || []), driveFile.name],
        }))
        setUploadProgress(prev => {
          const next = { ...prev }
          delete next[progressKey]
          return next
        })
      }
      toast({ title: "Subido a Google Drive" })
    } catch (error) {
      toast({ title: "Error al subir a Drive", description: getGoogleDriveErrorMessage(error), variant: "destructive" })
    } finally { setSubiendoDrive(false) }
  }

  const sincronizarPlanificacionClaseDrive = async (act: Partial<ActividadClase>) => {
    if (!isGoogleDriveAutosaveEnabled()) return
    const token = getGoogleDriveToken()
    if (!token) return
    const tieneContenido = [act.objetivo, act.inicio, act.desarrollo, act.cierre, act.adecuacion].some(v => stripRichText(String(v || "")).trim().length > 0)
    if (!tieneContenido) return
    try {
      const { classPlanificacionFolder } = await ensureEduPanelClassFolder(token, { ...driveContext, numeroClase: selectedClase })
      const oasSeleccionados = oasCurriculo.filter(oa => (act.oaIds || []).includes(oa.id))
      const oasBasales = oasSeleccionados.filter(o => o.tipo !== "oat").map(o => `OA ${o.numero}: ${o.descripcion}`)
      const oasTransversales = oasSeleccionados.filter(o => o.tipo === "oat").map(o => `OA ${o.numero}: ${o.descripcion}`)
      const indicadores = oasSeleccionados.flatMap(oa => {
        const selectedIds = act.indicadoresPorOa?.[oa.id]
        return (oa.indicadores || [])
          .filter(ind => ind.seleccionado)
          .filter(ind => !selectedIds || selectedIds.includes(ind.id))
          .map(ind => `${oa.numero ? `OA ${oa.numero}` : oa.id}: ${ind.texto}`)
      })

      const res = await apiFetch("/api/export-planificacion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          formato: "detallado",
          nivel: nivelCurricular || cursoParam,
          asignatura: ASIGNATURA,
          unidades: [{
            numero: Number(unidadParam.replace(/\D/g, "")) || 1,
            nombre: unidadData?.nombre_unidad || unidadParam,
            oasBasales,
            oasTransversales,
            clases: [{
              numero: selectedClase,
              oasOcupados: oasBasales,
              indicadores,
              objetivo: stripRichText(act.objetivo || ""),
              inicio: stripRichText(act.inicio || ""),
              desarrollo: stripRichText(act.desarrollo || ""),
              cierre: stripRichText(act.cierre || ""),
              recursos: act.materiales || [],
              tics: act.tics || [],
            }],
          }],
        }),
      })
      if (res.ok) {
        const blob = await res.blob()
        await subirDocxADrive(token, { docx: blob, folderId: classPlanificacionFolder.id, fileName: `Clase_${String(selectedClase).padStart(2, "0")}_Planificacion.docx` })
      }
    } catch (e) {
      console.warn(e)
    }
  }

  const sincronizarClaseEnRespaldoVivoDrive = async (act: Partial<ActividadClase>) => {
    if (!isGoogleDriveAutosaveEnabled()) return
    const token = getGoogleDriveToken()
    if (!token) return
    try {
      await actualizarUnidadEnRespaldoVivoDrive(token, {
        context: driveContext,
        data: {
          unidadId: unidadParam,
          unidadNombre: unidadData?.nombre_unidad || unidadParam,
          clases: { [String(selectedClase).padStart(2, "0")]: act },
        },
      })
    } catch (e) {
      console.warn(e)
    }
  }

  const handleEliminarArchivo = async (archivo: ArchivoAdjunto) => {
    try {
      if (archivo.provider !== "drive" && !archivo.driveFileId) {
        await eliminarArchivoClase(archivo.storagePath)
      }
      setActividad(prev => ({
        ...prev,
        archivos: (prev.archivos || []).filter(i => i.id !== archivo.id),
        materiales: (prev.materiales || []).filter(item => item !== archivo.nombre),
      }))
      toast({ title: "Archivo eliminado" })
    } catch {
      toast({ title: "Error al eliminar archivo", variant: "destructive" })
    }
  }

  const renderRecursosMateriales = () => {
    const archivos = actividad.archivos || []
    const nombresArchivos = new Set(archivos.map(archivo => archivo.nombre))
    const materialesTexto = (actividad.materiales || []).filter(material => !nombresArchivos.has(material))

    return (
      <div className="bg-card border border-border rounded-[18px] p-5.5 shadow-sm space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-[11.5px] font-extrabold text-foreground uppercase tracking-wider block">Recursos y Materiales</span>
          <DriveSheet
            context={driveContext}
            title="Materiales de la clase"
            description="Selecciona archivos desde Drive y adjuntalos a esta clase."
            label="Elegir de Drive"
            selectLabel="Adjuntar"
            onSelectFile={handleAdjuntarDrive}
            buttonClassName="h-8 px-2.5 py-1 text-[11px]"
          />
        </div>

        <div
          onDragOver={e => { e.preventDefault(); setDragArchivoActivo(true) }}
          onDragLeave={() => setDragArchivoActivo(false)}
          onDrop={e => { e.preventDefault(); setDragArchivoActivo(false); void handleSubirArchivosDrive(e.dataTransfer.files) }}
          onClick={() => driveFileInputRef.current?.click()}
          className={cn(
            "border border-dashed rounded-[12px] p-4 flex flex-col items-center justify-center text-center cursor-pointer transition-all",
            dragArchivoActivo ? "border-primary bg-primary/5" : "border-border bg-muted/10 hover:bg-muted/20"
          )}
        >
          <UploadCloud className={cn("mb-1 h-5 w-5", subiendoDrive ? "animate-pulse text-primary" : "text-muted-foreground")} />
          <span className="text-[11.5px] font-extrabold text-foreground">
            {subiendoDrive ? "Subiendo a Google Drive..." : "Subir material a Google Drive"}
          </span>
          <span className="mt-0.5 text-[10.5px] font-medium text-muted-foreground">Arrastra archivos o haz clic</span>
          <input
            ref={driveFileInputRef}
            type="file"
            className="hidden"
            multiple
            onChange={e => { if (e.target.files) void handleSubirArchivosDrive(e.target.files) }}
          />
        </div>

        {Object.entries(uploadProgress).length > 0 && (
          <div className="space-y-1.5">
            {Object.entries(uploadProgress).map(([key, progress]) => (
              <div key={key} className="rounded-lg border border-border bg-muted/10 px-2.5 py-2">
                <div className="mb-1 flex items-center justify-between text-[10.5px] font-bold text-muted-foreground">
                  <span className="truncate">{key.replace(/^drive_/, "").replace(/_\d+$/, "")}</span>
                  <span>{Math.round(progress)}%</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${progress}%` }} />
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="space-y-2">
          {archivos.map(f => (
            <div key={f.id} className="flex items-center justify-between gap-2 p-2.5 bg-muted/15 border-[0.5px] border-border rounded-xl shadow-sm">
              <div className="flex min-w-0 items-center gap-2">
                <FileText className="w-4 h-4 text-primary flex-shrink-0" />
                <div className="flex min-w-0 flex-col">
                  <span className="text-[11px] font-bold text-foreground truncate">{f.nombre}</span>
                  <span className="text-[9px] text-muted-foreground">
                    {f.provider === "drive" ? "Google Drive" : "Local"} · {formatoTamaño(f.tamaño || 0)}
                  </span>
                </div>
              </div>
              <div className="flex flex-shrink-0 items-center gap-1">
                <button
                  type="button"
                  onClick={() => setPreviewArchivo(f)}
                  className="grid h-7 w-7 place-items-center rounded-lg border border-border text-muted-foreground hover:border-primary hover:text-primary"
                  title="Ver material"
                >
                  <Eye className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => void handleEliminarArchivo(f)}
                  className="grid h-7 w-7 place-items-center rounded-lg border border-border text-muted-foreground hover:bg-status-red-bg hover:text-status-red-text"
                  title="Quitar material"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}

          {archivos.length === 0 && (
            <div className="rounded-xl border border-dashed border-border bg-muted/10 px-3 py-3 text-center">
              <HardDrive className="mx-auto mb-1 h-5 w-5 text-muted-foreground/50" />
              <span className="text-[11px] text-muted-foreground italic">Sin materiales subidos a Drive</span>
            </div>
          )}
        </div>

        {materialesTexto.length > 0 && (
          <div className="border-t border-border/70 pt-3">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Materiales registrados</span>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {materialesTexto.map((m, i) => (
                <button
                  key={`${m}_${i}`}
                  type="button"
                  onClick={() => setActividad(p => ({ ...p, materiales: (p.materiales || []).filter(item => item !== m) }))}
                  className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/20 px-2 py-1 text-[10.5px] font-bold text-muted-foreground hover:bg-status-red-bg hover:text-status-red-text"
                  title="Quitar material escrito"
                >
                  {m}
                  <X className="h-3 w-3" />
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    )
  }

  const setEstado = (est: ActividadClase["estado"]) => {
    setActividad(p => ({ ...p, estado: est }))
    setShowEstadoMenu(false)
  }

  const oasDeEstaClase = oasCurriculo.filter(oa => (actividad.oaIds || []).includes(oa.id))
  const hasFloatingObjectivesPanel = simpleMode && (oasDeEstaClase.length > 0 || dispActitudes.length > 0)
  const claseActualCronograma = clases.find(c => c.numero === selectedClase)
  const claseData = claseActualCronograma
  const estadoActual = ESTADOS.find(e => e.key === actividad.estado) || ESTADOS[0]

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

  const iaModalRequestBody = useMemo(() => {
    return buildLessonPayload(promptMode, chatInput)
  }, [promptMode, chatInput, buildLessonPayload])

  const hasConfiguredProvider = aiConfig.provider === "public" || !!aiConfig.token
  const promptPreview = useMemo(() => {
    try {
      return buildCopilotPrompt(buildLessonPayload(promptMode, chatInput), promptMode)
    } catch {
      return ""
    }
  }, [promptMode, chatInput, buildLessonPayload])

  useEffect(() => {
    if (!simpleMode) {
      setObjectivesPanelHeight(null)
      return
    }

    const scrollContainer = document.querySelector("main")
    let frame = 0

    const updatePanelHeight = () => {
      if (frame) cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const panel = floatingObjectivesRef.current
        const cierre = cierreSectionRef.current
        if (!panel || !cierre) {
          setObjectivesPanelHeight(null)
          return
        }

        const panelTop = panel.getBoundingClientRect().top
        const cierreTop = cierre.getBoundingClientRect().top
        const viewportLimit = window.innerHeight - panelTop - 18
        const targetHeight = cierreTop - panelTop - 18
        const nextHeight = Math.max(360, Math.min(targetHeight, viewportLimit))

        setObjectivesPanelHeight(Number.isFinite(nextHeight) ? Math.round(nextHeight) : null)
      })
    }

    updatePanelHeight()
    window.addEventListener("resize", updatePanelHeight)
    window.addEventListener("scroll", updatePanelHeight, { passive: true })
    scrollContainer?.addEventListener("scroll", updatePanelHeight, { passive: true })

    return () => {
      if (frame) cancelAnimationFrame(frame)
      window.removeEventListener("resize", updatePanelHeight)
      window.removeEventListener("scroll", updatePanelHeight)
      scrollContainer?.removeEventListener("scroll", updatePanelHeight)
    }
  }, [
    simpleMode,
    selectedClase,
    isObjectivesFloated,
    actividad.inicio,
    actividad.desarrollo,
    oasDeEstaClase.length,
    dispActitudes.length,
  ])

  const queryParams = { curso: cursoParam, unidad: unidadParam, unitIdLocal: rawUnitIdLocal || unidadParam }
  const unitIndex = Number(unidadParam.replace(/\D/g, "")) || 1
  const unitColor = UNIT_COLORS[(unitIndex - 1) % UNIT_COLORS.length]

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center gap-3 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span className="text-[14px] font-medium">Cargando editor de clases v3…</span>
      </div>
    )
  }

  return (
    <div
      className={cn("mx-auto max-w-[1400px] px-4 py-6 sm:px-6 transition-all duration-300", !simpleMode && "md:pr-[var(--copilot-pr)]")}
      style={{ ["--copilot-pr" as never]: (showCopilot && !simpleMode) ? `${copilotWidth}px` : "0px" }}
    >
      {/* Modals */}
      <IaModal
        open={showIaModal}
        onOpenChange={setShowIaModal}
        requestBody={iaModalRequestBody}
        mode={promptMode}
        hasConfiguredProvider={hasConfiguredProvider}
        isGenerating={isGeneratingAI}
        onApplyExternalJson={async rawJson => {
          const ok = aplicarRespuestaExterna(rawJson, { closeExternalImport: false })
          if (!ok) throw new Error(externalImportError || "JSON inválido.")
        }}
        onGenerateIntegrated={handleGenerarClase}
        onOpenIntegratedChat={handleOpenCopilot}
        onConfigureProvider={() => {
          setShowCopilot(true)
          setShowAiSettings(true)
        }}
      />
      <ImportWordModal
        open={showImportWordModal}
        onOpenChange={setShowImportWordModal}
        driveContext={driveContext}
        onImport={importarDesdeWord}
        oasDisponibles={oasCurriculo}
        habilidadesDisponibles={dispHabilidades}
        actitudesDisponibles={dispActitudes}
      />
      <NotebookPptModal
        open={showNotebookPptModal}
        onOpenChange={setShowNotebookPptModal}
        asignatura={ASIGNATURA}
        curso={cursoParam}
        unidadId={unidadParam}
        unidadNombre={unidadData?.nombre_unidad || unidadCurricularParam || unidadParam}
        unidadProposito={unidadData?.proposito || ""}
        nivelCurricular={nivelCurricular}
        numeroClase={selectedClase}
        totalClases={clases.length}
        claseCronograma={claseActualCronograma}
        actividad={actividad}
        oas={oasCurriculo}
        contextoDocente={unidadContextoDocente}
        objetivoDocente={unidadObjetivoDocente}
      />
      <GenerarEvaluacionIaModal
        open={showGenerarEvaluacionIaModal}
        onOpenChange={setShowGenerarEvaluacionIaModal}
        asignatura={ASIGNATURA}
        curso={cursoParam}
        unidadId={unidadParam}
        unidadNombre={unidadData?.nombre_unidad || unidadCurricularParam || unidadParam}
        unidadProposito={unidadData?.proposito || ""}
        nivelCurricular={nivelCurricular}
        numeroClase={selectedClase}
        totalClases={clases.length}
        claseCronograma={claseActualCronograma}
        actividad={actividad}
        oas={oasCurriculo}
        contextoDocente={unidadContextoDocente}
        objetivoDocente={unidadObjetivoDocente}
        aiConfig={aiConfig}
      />
      <ModoClaseEnVivo
        open={showModoClaseEnVivo}
        onClose={() => setShowModoClaseEnVivo(false)}
        actividad={actividad as ActividadClase | null}
        asignatura={ASIGNATURA}
        curso={cursoParam}
      />

      {/* Header */}
      <div className="mb-7 flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <Link href={buildUrl("/ver-unidad", withAsignatura(queryParams, ASIGNATURA))}
            className="w-9 h-9 border border-border rounded-xl bg-card grid place-items-center text-muted-foreground hover:bg-muted/40 transition-colors flex-shrink-0"
            title="Volver al Dashboard">
            <ChevronLeft className="w-5 h-5" />
          </Link>
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
              <span>{cursoParam}</span>
              <span>/</span>
              <span className="truncate">{unidadData?.nombre_unidad || unidadParam}</span>
              <span>/</span>
              <span className="text-foreground font-bold">Clases</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-extrabold truncate text-foreground mt-1 flex items-center gap-2">
              Planificación de Clase
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowImportWordModal(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-[12px] font-bold border border-border bg-card text-muted-foreground hover:bg-muted/30 transition-colors cursor-pointer"
          >
            <FileText className="w-4.5 h-4.5" /> Importar Word
          </button>

          <button
            onClick={handleExportarClaseDrive}
            disabled={exportingDrive || !tieneContenidoClase}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-[12px] font-bold border border-border bg-card text-muted-foreground hover:bg-muted/30 transition-colors cursor-pointer disabled:opacity-50"
          >
            {exportingDrive ? <Loader2 className="w-4.5 h-4.5 animate-spin" /> : <Download className="w-4.5 h-4.5" />}
            Exportar
          </button>

          {saveStatus === "saving_silent" && (
            <span className="flex items-center gap-1.5 text-[12px] font-semibold text-muted-foreground animate-pulse">
              <RefreshCw className="h-3.5 w-3.5 animate-spin" /> Guardando...
            </span>
          )}
          {saveStatus === "saved" && (
            <span className="flex items-center gap-1.5 text-[12px] font-semibold text-status-green-text bg-status-green-bg px-2.5 py-1 rounded-full border border-status-green-border">
              <Check className="w-3.5 h-3.5" /> Guardado
            </span>
          )}
          {saveStatus === "synced" && (
            <span className="flex items-center gap-1.5 text-[12px] font-semibold text-status-blue-text bg-status-blue-bg px-2.5 py-1 rounded-full border border-status-blue-border">
              <Check className="w-3.5 h-3.5" /> Sincronizado
            </span>
          )}

          <button
            onClick={() => handleGuardar(false)}
            disabled={saving || saveStatus === "saving_silent"}
            className="flex items-center gap-2 bg-primary text-primary-foreground border-none rounded-xl px-5 py-2.5 text-[13px] font-bold hover:bg-pink-dark transition-colors disabled:opacity-60 shadow-sm cursor-pointer"
          >
            {saving ? "Guardando…" : "Guardar cambios"}
          </button>
          
          <div className="relative group">
            <button className="w-9 h-9 border border-border rounded-xl bg-card grid place-items-center text-muted-foreground hover:bg-muted/40 transition-colors flex-shrink-0">
              <SlidersHorizontal className="h-4.5 w-4.5" />
            </button>
            <div className="absolute right-0 mt-1 w-48 bg-card border border-border rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50 py-1">
              <button
                onClick={handleSincronizar}
                className="w-full text-left px-4 py-2 hover:bg-muted/30 font-semibold text-[11.5px] flex items-center gap-2 border-none bg-transparent cursor-pointer text-foreground"
              >
                <RefreshCw className="w-4 h-4 text-success-emerald" /> Sincronizar Libro
              </button>
              <button
                onClick={() => setShowModoClaseEnVivo(true)}
                className="w-full text-left px-4 py-2 hover:bg-muted/30 font-semibold text-[11.5px] flex items-center gap-2 border-none bg-transparent cursor-pointer text-foreground"
              >
                <Play className="w-4 h-4 text-primary" /> Modo Clase en Vivo
              </button>
              <div className="h-[0.5px] bg-border my-1" />
              <button
                onClick={handleBorrarClase}
                disabled={deleting || !tieneContenidoClase}
                className="w-full text-left px-4 py-2 text-status-red-text hover:bg-status-red-bg font-bold text-[11.5px] flex items-center gap-2 border-none bg-transparent cursor-pointer"
              >
                <Trash2 className="w-4 h-4" /> Borrar clase
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Navigation Sub-Tabs */}
      {(() => {
        const qParams = { curso: cursoParam, unidad: unidadParam, unitIdLocal: rawUnitIdLocal || unidadParam }
        return (
          <div className="flex items-center gap-6 border-b border-border mb-6">
            <Link
              href={buildUrl("/ver-unidad", withAsignatura(qParams, ASIGNATURA))}
              className="font-semibold text-[13.5px] text-muted-foreground hover:text-primary transition-colors pb-3"
            >
              Unidad
            </Link>
            <Link
              href={buildUrl("/ver-unidad/cronograma", withAsignatura(qParams, ASIGNATURA))}
              className="font-semibold text-[13.5px] text-muted-foreground hover:text-primary transition-colors pb-3"
            >
              Cronograma
            </Link>
            <Link
              href={buildUrl("/ver-unidad/clases", withAsignatura(qParams, ASIGNATURA))}
              className="font-bold text-[13.5px] text-primary border-b-2 border-primary pb-3"
            >
              Clases
            </Link>
          </div>
        )
      })()}

      {/* Main Grid Content */}
      <div className={cn(
        "grid grid-cols-1 gap-6 items-start mt-6",
        isClassesRailCollapsed && !hasFloatingObjectivesPanel ? "lg:grid-cols-[64px_1fr]" : "lg:grid-cols-[220px_1fr]"
      )}>
        
        {/* Left Rail (Classes List) */}
        <div className="self-start">
          <div className={cn(
            "bg-card border border-border rounded-[18px] shadow-sm flex flex-col flex-shrink-0 transition-all duration-300 overflow-hidden",
            isClassesRailCollapsed ? "w-16 mx-auto" : "w-full"
          )}>
            <div className="border-b-[0.5px] border-border px-4 py-3 flex items-center justify-between bg-muted/5">
              {!isClassesRailCollapsed && <span className="text-[11px] font-extrabold text-muted-foreground uppercase tracking-wide">Clases</span>}
              <button
                onClick={() => setIsClassesRailCollapsed(!isClassesRailCollapsed)}
                className="p-1 text-muted-foreground hover:bg-muted/40 rounded transition-colors mx-auto cursor-pointer border-none bg-transparent"
              >
                {isClassesRailCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
              </button>
            </div>
            <div className="flex-1 overflow-y-auto no-scrollbar py-2 max-h-[600px]">
              {clases.map((c) => {
                const activeOas = oasCurriculo.filter(oa => c.oaIds.includes(oa.id))
                const active = c.numero === selectedClase
                return (
                  <button
                    key={c.numero}
                    onClick={() => setSelectedClase(c.numero)}
                    className={cn(
                      "w-full text-left py-2.5 px-4 border-b border-border last:border-0 transition-all flex flex-col cursor-pointer",
                      active ? "bg-primary/5 border-l-[3px] border-l-primary" : "hover:bg-muted/30"
                    )}
                  >
                    {isClassesRailCollapsed ? (
                      <div className="flex flex-col items-center justify-center gap-1.5 w-full">
                        <span className={cn("text-[13px] font-extrabold", active ? "text-primary" : "text-foreground")}>C{c.numero}</span>
                        {c.fecha && <span className="text-[9px] text-muted-foreground font-semibold bg-muted/40 rounded px-1.5 py-0.2">{c.fecha.substring(0, 5)}</span>}
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center justify-between w-full mb-1">
                          <span className={cn("text-[12.5px] font-bold", active ? "text-primary" : "text-foreground")}>Clase {c.numero}</span>
                          {c.fecha && <span className="text-[9.5px] text-muted-foreground font-semibold bg-muted/40 rounded-full px-2 py-0.5">{c.fecha.substring(0, 5)}</span>}
                        </div>
                        {activeOas.length > 0 && (
                          <div className="flex gap-1 flex-wrap mt-0.5">
                            {activeOas.slice(0, 5).map((o, idx) => (
                              <div key={o.id} className="w-2 h-2 rounded-full" style={{ background: UNIT_COLORS[oasCurriculo.indexOf(o) % UNIT_COLORS.length] }} />
                            ))}
                          </div>
                        )}
                      </>
                    )}
                  </button>
                )
              })}
            </div>
          </div>

          {hasFloatingObjectivesPanel && (
            <div
              ref={floatingObjectivesRef}
              className={cn(
                "hidden lg:block mt-4 w-full bg-card border border-border rounded-[18px] p-4 shadow-sm space-y-4 min-h-[360px] overflow-y-auto transition-all duration-300 ease-out",
                isObjectivesFloated
                  ? "opacity-100 translate-y-0 pointer-events-auto"
                  : "opacity-0 -translate-y-2 pointer-events-none"
              )}
              style={objectivesPanelHeight ? { height: `${objectivesPanelHeight}px` } : undefined}
            >
              <div className="space-y-3">
                <span className="text-[10px] font-extrabold text-muted-foreground uppercase tracking-wider block">Objetivos vinculados</span>
                <div className="flex flex-col gap-2.5">
                  {oasDeEstaClase.length === 0 ? (
                    <p className="text-[11px] text-muted-foreground italic text-center py-3 bg-muted/10 border border-dashed border-border rounded-lg">
                      Sin objetivos asignados en esta clase.
                    </p>
                  ) : (
                    oasDeEstaClase.map((oa) => (
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

              <div className="space-y-2 border-t border-border/60 pt-3">
                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">Actitudes</span>
                <div className="flex flex-wrap gap-1.5">
                  {dispActitudes.map((a, i) => {
                    const active = (actividad.actitudes || []).includes(a)
                    return (
                      <button
                        key={i}
                        onClick={() => setActividad(p => ({
                          ...p,
                          actitudes: p.actitudes?.includes(a) ? p.actitudes.filter(x => x !== a) : [...(p.actitudes || []), a]
                        }))}
                        className={cn(
                          "px-2.5 py-1 rounded-full border text-[10.5px] font-bold transition-all cursor-pointer",
                          active
                            ? "bg-amber-500 text-white border-amber-500"
                            : "bg-muted/10 text-muted-foreground border-border hover:bg-muted/30"
                        )}
                      >
                        {a}
                      </button>
                    )
                  })}
                  <button
                    onClick={() => { const a = prompt("Actitud personalizada:"); if (a) setActividad(p => ({ ...p, actitudes: [...(p.actitudes || []), a] })) }}
                    className="px-2.5 py-1 rounded-full border border-dashed border-border hover:border-primary text-muted-foreground hover:text-primary text-[10.5px] font-bold flex items-center gap-1 transition-colors cursor-pointer"
                  >
                    <Plus className="w-3 h-3" /> Agregar
                  </button>
                </div>
              </div>

              <div className="border-t border-border/60 pt-3">
                <button
                  onClick={() => setShowIaModal(true)}
                  className="w-full flex items-center justify-center gap-2 rounded-xl border border-primary/25 bg-primary/5 px-3 py-2.5 text-[11.5px] font-extrabold text-primary hover:bg-primary/10 hover:border-primary/45 transition-all cursor-pointer"
                >
                  <Sparkles className="h-4 w-4" />
                  Asistente IA
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Workspace: 1 or 2 Column Editor Grid */}
        <div className={cn(
          "min-w-0 gap-6 items-start",
          simpleMode ? "flex flex-col max-w-3xl mx-auto w-full" : "grid grid-cols-1 xl:grid-cols-[2.2fr_1fr]"
        )}>
          
          {/* Left/Main Column: Editor Workspace */}
          <div className="relative space-y-6 w-full">
            
            {/* Anchor point to detect scroll position */}
            <div ref={anchorRef} className="h-0 w-0" />

            {/* Inline Objectives Card (Shown inline at the top of the workspace. On desktop, it fades out when scrolled down but keeps its layout space to prevent layout shifts) */}
            {simpleMode && oasDeEstaClase.length > 0 && (
              <div
                className={cn(
                  "bg-card border border-border rounded-[18px] p-5.5 shadow-sm space-y-3 transition-all duration-300 ease-out origin-top",
                  isObjectivesFloated ? "lg:opacity-0 lg:scale-[0.98] lg:pointer-events-none" : "opacity-100 scale-100"
                )}
              >
                <span className="text-[10px] font-extrabold text-muted-foreground uppercase tracking-wider block">Objetivos de la clase (OA)</span>
                <div className="flex flex-col gap-3">
                  {oasDeEstaClase.map((oa) => {
                    const color = UNIT_COLORS[oasCurriculo.indexOf(oa) % UNIT_COLORS.length]
                    const selectedInds = getIndicadoresSeleccionados(oa)
                    return (
                      <div key={oa.id} className="space-y-1.5 border-b border-border/40 last:border-0 pb-2.5 last:pb-0">
                        <div className="text-[12.5px] font-semibold text-foreground flex items-start gap-2">
                          <span className="w-2.5 h-2.5 rounded-full mt-1 flex-shrink-0" style={{ background: color }} />
                          <span><b>OA {oa.numero}:</b> {oa.descripcion}</span>
                        </div>
                        {selectedInds.length > 0 && (
                          <div className="pl-4.5 space-y-1">
                            <span className="text-[9.5px] font-extrabold uppercase text-muted-foreground tracking-wider block">Indicadores seleccionados:</span>
                            <ul className="list-disc pl-4 text-[11.5px] text-muted-foreground space-y-0.5">
                              {selectedInds.map((ind) => (
                                <li key={ind.id} className="leading-relaxed">
                                  {ind.texto}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
            
            {/* Class metadata badge row */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-card border-[0.5px] border-border p-4.5 rounded-[18px] shadow-sm">
              <div className="flex items-center gap-2.5 flex-wrap">
                <span className="px-2.5 py-1 bg-muted/40 text-foreground font-bold text-[11px] rounded flex items-center gap-1 shadow-sm">
                  <Calendar className="w-3.5 h-3.5 text-muted-foreground" /> {claseData?.fecha || "Sin fecha"}
                </span>
                <span className="px-2.5 py-1 bg-primary/10 text-primary font-extrabold text-[11px] rounded shadow-sm uppercase tracking-wide">
                  CLASE {selectedClase}
                </span>
                <span className="px-2.5 py-1 bg-muted/40 text-muted-foreground font-bold text-[11px] rounded shadow-sm">
                  {unidadData?.horas ? `${unidadData.horas} HORAS` : "2 HORAS PEDAGÓGICAS"}
                </span>
              </div>
              
              {/* Selector de estado */}
              <div className="relative print:hidden">
                <button
                  onClick={() => setShowEstadoMenu(!showEstadoMenu)}
                  className={cn("flex items-center gap-1.5 text-[11px] font-extrabold rounded px-3 py-1.5 border transition-colors cursor-pointer", estadoActual.cls)}
                >
                  {estadoActual.label} <ChevronDown className="w-3 h-3" />
                </button>
                {showEstadoMenu && (
                  <div className="absolute right-0 top-full mt-1.5 z-50 bg-card border border-border rounded-lg shadow-lg overflow-hidden w-40">
                    {ESTADOS.map(e => (
                      <button key={e.key} onClick={() => setEstado(e.key)}
                        className="w-full text-left px-4 py-2.5 text-[12px] font-bold hover:bg-muted/20 transition-colors cursor-pointer">
                        {e.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>





            {/* Objetivo de la clase */}
            <div className="bg-card border border-border rounded-[18px] p-5.5 shadow-sm space-y-4">
              <div className="space-y-2">
                <label className="text-[11px] font-extrabold text-foreground uppercase tracking-wider block">Objetivo de la clase</label>
                <RichArea
                  value={actividad.objetivo || ""}
                  onChange={v => setActividad(p => ({ ...p, objetivo: v }))}
                  placeholder="Redacta el objetivo de aprendizaje para esta clase..."
                  rows={3}
                />
              </div>
              
              {/* Bloom Multinivel Cards - Omitidas en modo simple */}
              {!simpleMode && actividad.objetivoMultinivel && (
                <div className="mt-3.5 grid grid-cols-1 gap-3 md:grid-cols-3">
                  <BloomCard
                    label="Básico"
                    nivel="BAJO"
                    texto={actividad.objetivoMultinivel.basico}
                    active={actividad.objetivoMultinivel.recomendado === "basico"}
                    onSelect={() => setActividad(p => ({ ...p, objetivo: actividad.objetivoMultinivel?.basico || "" }))}
                    onRegenerate={handleRegenerarBloom}
                    disabled={isGeneratingAI}
                  />
                  <BloomCard
                    label="Intermedio"
                    nivel="MEDIO"
                    texto={actividad.objetivoMultinivel.intermedio}
                    active={actividad.objetivoMultinivel.recomendado === "intermedio"}
                    onSelect={() => setActividad(p => ({ ...p, objetivo: actividad.objetivoMultinivel?.intermedio || "" }))}
                    onRegenerate={handleRegenerarBloom}
                    disabled={isGeneratingAI}
                  />
                  <BloomCard
                    label="Avanzado"
                    nivel="ALTO"
                    texto={actividad.objetivoMultinivel.avanzado}
                    active={actividad.objetivoMultinivel.recomendado === "avanzado"}
                    onSelect={() => setActividad(p => ({ ...p, objetivo: actividad.objetivoMultinivel?.avanzado || "" }))}
                    onRegenerate={handleRegenerarBloom}
                    disabled={isGeneratingAI}
                  />
                </div>
              )}
            </div>

            {/* Pedagogy block: Bloom, Indicadores, Evaluacion - Omitidas en modo simple */}
            {!simpleMode && (actividad.analisisBloom?.length || actividad.indicadoresEvaluacion?.length || actividad.actividadEvaluacion) && (
              <div className="space-y-4">
                {actividad.analisisBloom?.length ? (
                  <PedagogySection
                    title="Análisis Bloom de los OA"
                    icon={<BrainCircuit className="h-4 w-4" />}
                    onRegenerate={handleRegenerarBloom}
                    disabled={isGeneratingAI}
                  >
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                      {actividad.analisisBloom.map((item, index) => (
                        <div key={`${item.oaId}-${index}`} className="rounded-xl border border-border bg-background p-3.5">
                          <div className="mb-2 flex items-center justify-between gap-2">
                            <span className="text-[11px] font-extrabold text-primary">{item.oaId}</span>
                            <span className="rounded-full bg-card px-2.5 py-0.5 text-[9.5px] font-bold text-muted-foreground border border-border">{item.categoria} · {item.nivel}</span>
                          </div>
                          <p className="text-[12px] leading-relaxed text-muted-foreground font-medium">{item.justificacion}</p>
                          {item.verbosSugeridos?.length > 0 && (
                            <div className="mt-2.5 flex flex-wrap gap-1.5">
                              {item.verbosSugeridos.map(verbo => (
                                <span key={verbo} className="rounded-full border border-border bg-card px-2 py-0.5 text-[9.5px] font-bold text-muted-foreground">{verbo}</span>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </PedagogySection>
                ) : null}

                {actividad.indicadoresEvaluacion?.length ? (
                  <PedagogySection
                    title="Indicadores de Evaluación Detallados"
                    icon={<Clipboard className="h-4 w-4" />}
                    onRegenerate={handleRegenerarIndicadores}
                    disabled={isGeneratingAI}
                  >
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                      {([
                        ["saber", "Saber"],
                        ["saber_hacer", "Saber Hacer"],
                        ["ser", "Ser"],
                      ] as const).map(([key, label]) => (
                        <div key={key} className="rounded-xl border border-border bg-background p-3.5 space-y-2">
                          <p className="text-[11px] font-extrabold uppercase tracking-wide text-foreground border-b border-border/60 pb-1.5">{label}</p>
                          <div className="space-y-2">
                            {indicadoresAgrupados[key].length ? indicadoresAgrupados[key].map(ind => (
                              <div key={ind.id} className="rounded-lg bg-card border border-border px-3 py-2 text-[11.5px] leading-snug text-muted-foreground font-medium shadow-sm">
                                <span className="font-bold text-primary">{ind.nivelBloom}</span> · {ind.texto}
                              </div>
                            )) : <p className="text-[11.5px] text-muted-foreground italic">Sin indicadores generados.</p>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </PedagogySection>
                ) : null}

                {actividad.actividadEvaluacion ? (
                  <PedagogySection
                    title="Actividad de Evaluación Propuesta"
                    icon={<Check className="h-4 w-4" />}
                    onRegenerate={handleRegenerarIndicadores}
                    disabled={isGeneratingAI}
                  >
                    <div className="rounded-xl border border-border bg-background p-4 space-y-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-primary/10 border border-primary/20 px-2.5 py-0.5 text-[9.5px] font-extrabold uppercase text-primary">{actividad.actividadEvaluacion.tipo}</span>
                        {(actividad.actividadEvaluacion.alineacionMBE || []).map(code => (
                          <span key={code} className="rounded-full border border-border bg-card px-2.5 py-0.5 text-[9.5px] font-bold text-muted-foreground">MBE {code}</span>
                        ))}
                      </div>
                      <p className="text-[12.5px] leading-relaxed text-slate-700 dark:text-slate-350 font-medium">{actividad.actividadEvaluacion.descripcion}</p>
                      {actividad.actividadEvaluacion.criterios?.length > 0 && (
                        <ul className="list-disc space-y-1 pl-4 text-[12px] text-muted-foreground font-medium">
                          {actividad.actividadEvaluacion.criterios.map(criterio => <li key={criterio}>{criterio}</li>)}
                        </ul>
                      )}
                    </div>
                  </PedagogySection>
                ) : null}
              </div>
            )}

            {/* Momentos de la clase */}
            {simpleMode ? (
              <div className="bg-card border border-border rounded-[18px] p-5.5 shadow-sm space-y-6">
                <div>
                  <span className="text-[10px] font-extrabold text-muted-foreground uppercase tracking-wider block mb-1.5">Inicio (15 min)</span>
                  <RichArea value={actividad.inicio || ""} onChange={v => setActividad(p => ({ ...p, inicio: v }))} placeholder="Inicio de la sesión..." rows={4} />
                </div>
                <div>
                  <span className="text-[10px] font-extrabold text-muted-foreground uppercase tracking-wider block mb-1.5">Desarrollo (60 min)</span>
                  <RichArea value={actividad.desarrollo || ""} onChange={v => setActividad(p => ({ ...p, desarrollo: v }))} placeholder="Actividades centrales..." rows={8} />
                </div>
                <div ref={cierreSectionRef}>
                  <span className="text-[10px] font-extrabold text-muted-foreground uppercase tracking-wider block mb-1.5">Cierre (15 min)</span>
                  <RichArea value={actividad.cierre || ""} onChange={v => setActividad(p => ({ ...p, cierre: v }))} placeholder="Cierre y retroalimentación..." rows={4} />
                </div>
                <div>
                  <span className="text-[10px] font-extrabold text-muted-foreground uppercase tracking-wider block mb-1.5">Adecuación Curricular (PIE / DUA)</span>
                  <RichArea value={actividad.adecuacion || ""} onChange={v => setActividad(p => ({ ...p, adecuacion: v }))} placeholder="Redactar adaptaciones metodológicas para inclusión..." rows={4} />
                </div>
              </div>
            ) : (
              <div className="bg-card border border-border rounded-[18px] overflow-hidden shadow-sm">
                <div className="flex border-b border-border bg-muted/10">
                  <button
                    onClick={() => setTabDerecho("desarrollo")}
                    className={cn("flex-1 py-3 text-[12.5px] font-extrabold border-b-2 -mb-[1px] transition-colors cursor-pointer",
                      tabDerecho === "desarrollo" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
                    )}
                  >
                    Desarrollo de Clase
                  </button>
                  <button
                    onClick={() => setTabDerecho("adecuacion")}
                    className={cn("flex-1 py-3 text-[12.5px] font-extrabold border-b-2 -mb-[1px] transition-colors cursor-pointer",
                      tabDerecho === "adecuacion" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
                    )}
                  >
                    Adecuación Curricular (PIE / DUA)
                  </button>
                </div>
                
                <div className="p-5">
                  {tabDerecho === "desarrollo" ? (
                    <div className="space-y-4">
                      <div>
                        <span className="text-[10px] font-extrabold text-muted-foreground uppercase tracking-wider block mb-1.5">Inicio (15 min)</span>
                        <RichArea value={actividad.inicio || ""} onChange={v => setActividad(p => ({ ...p, inicio: v }))} placeholder="Inicio de la sesión..." rows={4} />
                      </div>
                      <div>
                        <span className="text-[10px] font-extrabold text-muted-foreground uppercase tracking-wider block mb-1.5">Desarrollo (60 min)</span>
                        <RichArea value={actividad.desarrollo || ""} onChange={v => setActividad(p => ({ ...p, desarrollo: v }))} placeholder="Actividades centrales..." rows={8} />
                      </div>
                      <div>
                        <span className="text-[10px] font-extrabold text-muted-foreground uppercase tracking-wider block mb-1.5">Cierre (15 min)</span>
                        <RichArea value={actividad.cierre || ""} onChange={v => setActividad(p => ({ ...p, cierre: v }))} placeholder="Cierre y retroalimentación..." rows={4} />
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-5">
                      <div className="bg-primary/5 border border-primary/20 p-4.5 rounded-lg relative overflow-hidden">
                        <div className="flex items-center justify-between mb-3.5 w-full">
                          <span className="text-[12px] font-extrabold text-primary uppercase tracking-wide flex items-center gap-1.5">
                            <Sparkles className="w-4.5 h-4.5" /> Adecuación Curricular
                          </span>
                          <button
                            onClick={() => runAiRequest("chat", "Generar adecuaciones PIE basadas en los OAs", { detailedOnly: false })}
                            className="bg-card hover:bg-muted/30 border border-border text-[11px] font-bold text-foreground px-3 py-1.5 rounded-lg flex items-center gap-1 cursor-pointer transition-colors shadow-sm"
                          >
                            <Sparkles className="w-3.5 h-3.5 text-primary" /> Ayuda IA
                          </button>
                        </div>
                        <RichArea value={actividad.adecuacion || ""} onChange={v => setActividad(p => ({ ...p, adecuacion: v }))} placeholder="Redactar adaptaciones metodológicas para inclusión..." rows={6} />
                      </div>

                      {/* Desarrollo formal */}
                      <div className="bg-card border border-border p-4.5 rounded-lg space-y-4">
                        <div className="flex items-center justify-between w-full">
                          <div>
                            <h4 className="text-[12.5px] font-extrabold text-foreground">Desarrollo formal detallado</h4>
                            <p className="text-[11px] text-muted-foreground">Síntesis curricular avanzada para acreditaciones</p>
                          </div>
                          <button
                            onClick={handleRegenerarDetallado}
                            disabled={isGeneratingAI}
                            className="px-3 py-2 bg-slate-900 text-white font-bold text-[11px] rounded-lg hover:bg-slate-800 transition-colors disabled:opacity-50 flex items-center gap-1 cursor-pointer"
                          >
                            <BrainCircuit className="w-3.5 h-3.5" /> Generar detallado
                          </button>
                        </div>
                        
                        <div className="space-y-3.5">
                          {actividad.analisisBloom?.length ? (
                            <div className="bg-muted/10 border border-border p-3 rounded-lg">
                              <p className="text-[11.5px] font-extrabold text-foreground mb-1.5">Análisis de taxonomía de Bloom</p>
                              <div className="space-y-2.5">
                                {actividad.analisisBloom.map((item, index) => (
                                  <p key={index} className="text-[11.5px] text-muted-foreground leading-relaxed">
                                    <b>{item.oaId}</b>: {item.categoria} ({item.nivel}). {item.justificacion}
                                  </p>
                                ))}
                              </div>
                            </div>
                          ) : null}

                          {actividad.objetivoMultinivel && (
                            <div className="bg-muted/10 border border-border p-3 rounded-lg text-[11.5px] leading-relaxed text-muted-foreground space-y-1">
                              <p className="font-extrabold text-foreground mb-1.5">Redacción de Objetivos Multinivel</p>
                              <p><b>Básico:</b> {actividad.objetivoMultinivel.basico}</p>
                              <p><b>Intermedio:</b> {actividad.objetivoMultinivel.intermedio}</p>
                              <p><b>Avanzado:</b> {actividad.objetivoMultinivel.avanzado}</p>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Recursos y Materiales - Integrados abajo solo en modo simple */}
            {simpleMode && (
              renderRecursosMateriales()
            )}

            {/* Sugerencias Oficiales Block - Omitido en modo simple */}
            {!simpleMode && (
              <div className="bg-card border border-border rounded-[18px] p-5.5 space-y-4 shadow-sm">
                <span className="text-[11px] font-extrabold text-foreground uppercase tracking-wider block">Sugerencias curriculares de la unidad</span>
                {actividadesSugeridas.length === 0 && evaluacionesSugeridas.length === 0 ? (
                  <div className="flex items-center justify-center p-6 text-center text-muted-foreground text-[12px] gap-2">
                    <Info className="w-4 h-4" /> No hay sugerencias oficiales disponibles para esta unidad.
                  </div>
                ) : (
                  <div className="space-y-4.5 max-h-72 overflow-y-auto pr-1">
                    {actividadesSugeridas.map((item, index) => (
                      <div key={index} className="bg-muted/10 border border-border rounded-lg p-4 flex flex-col md:flex-row md:items-start justify-between gap-4 shadow-sm">
                        <div className="flex-1 space-y-1">
                          <h5 className="text-[12.5px] font-extrabold text-foreground leading-tight">{item.nombre}</h5>
                          <p className="text-[12px] text-muted-foreground leading-relaxed font-medium">{item.descripcion}</p>
                        </div>
                        <button
                          onClick={() => {
                            setChatInput(prev => `${prev} Incorporar la sugerencia oficial: ${item.nombre}.`.trim())
                            setShowCopilot(true)
                          }}
                          className="bg-card hover:bg-muted/30 border border-border text-[11px] font-bold text-primary px-3 py-1.5 rounded-lg flex-shrink-0 cursor-pointer shadow-sm"
                        >
                          Llevar a IA
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

          </div>

          {/* Right Column: Tools Sidebar - Omitido por completo en modo simple */}
          {!simpleMode && (
            <div className="space-y-6">
              
              {/* IA Pedagógica */}
              <div className="bg-card border border-border rounded-[18px] p-5.5 space-y-4 shadow-sm">
                <span className="text-[11px] font-extrabold text-muted-foreground uppercase tracking-wider block">IA Pedagógica</span>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setShowIaModal(true)}
                    className="flex flex-col items-center justify-center gap-1.5 p-3 rounded-lg border border-border bg-muted/10 hover:border-primary/50 hover:bg-primary/5 transition-all text-foreground group cursor-pointer"
                  >
                    <Sparkles className="h-5 w-5 text-primary group-hover:scale-110 transition-transform" />
                    <span className="text-[11px] font-bold text-center">Asistente IA</span>
                  </button>
                  <button
                    onClick={() => runAiRequest("regenerar_bloom", "Propón mejoras pedagógicas al objetivo", { onlyBloom: true })}
                    className="flex flex-col items-center justify-center gap-1.5 p-3 rounded-lg border border-border bg-muted/10 hover:border-primary/50 hover:bg-primary/5 transition-all text-foreground group cursor-pointer"
                  >
                    <Wand2 className="h-5 w-5 text-primary group-hover:scale-110 transition-transform" />
                    <span className="text-[11px] font-bold text-center">Mejorar Obj.</span>
                  </button>
                  <button
                    onClick={handleRegenerarBloom}
                    className="col-span-2 flex items-center justify-center gap-2 p-2.5 rounded-lg border border-border bg-muted/10 hover:bg-muted/40 transition-colors text-[11px] font-bold text-foreground cursor-pointer"
                  >
                    <BrainCircuit className="h-4 w-4 text-primary" /> Bloom Analysis
                  </button>
                </div>
              </div>

              {/* Objetivos de Aprendizaje */}
              <div className="bg-card border border-border rounded-[18px] p-5.5 space-y-4 shadow-sm">
                <span className="text-[11px] font-extrabold text-muted-foreground uppercase tracking-wider block">Objetivos vinculados</span>
                <div className="flex flex-col gap-2.5">
                  {oasDeEstaClase.length === 0 ? (
                    <p className="text-[11.5px] text-muted-foreground italic text-center py-3 bg-muted/10 border border-dashed border-border rounded-lg">
                      Sin objetivos asignados en esta clase. Vincúlalos desde el Cronograma.
                    </p>
                  ) : (
                    oasDeEstaClase.map((oa) => (
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

              {/* Habilidades y Actitudes */}
              <div className="bg-card border border-border rounded-[18px] p-5.5 space-y-4 shadow-sm">
                <span className="text-[11px] font-extrabold text-muted-foreground uppercase tracking-wider block">Currículo Transversal</span>
                
                {/* Habilidades */}
                <div className="space-y-2">
                  <span className="text-[10px] font-bold text-muted-foreground uppercase">Habilidades</span>
                  <div className="flex flex-wrap gap-1.5">
                    {dispHabilidades.map((h, i) => {
                      const active = (actividad.habilidades || []).includes(h)
                      return (
                        <button
                          key={i}
                          onClick={() => setActividad(p => ({
                            ...p,
                            habilidades: p.habilidades?.includes(h) ? p.habilidades.filter(x => x !== h) : [...(p.habilidades || []), h]
                          }))}
                          className={cn(
                            "px-2.5 py-1 rounded-full border text-[10.5px] font-bold transition-all cursor-pointer",
                            active
                              ? "bg-primary text-white border-primary"
                              : "bg-muted/10 text-muted-foreground border-border hover:bg-muted/30"
                          )}
                        >
                          {h}
                        </button>
                      )
                    })}
                    <button
                      onClick={() => { const h = prompt("Habilidad personalizada:"); if (h) setActividad(p => ({ ...p, habilidades: [...(p.habilidades || []), h] })) }}
                      className="px-2.5 py-1 rounded-full border border-dashed border-border hover:border-primary text-muted-foreground hover:text-primary text-[10.5px] font-bold flex items-center gap-1 transition-colors cursor-pointer"
                    >
                      <Plus className="w-3 h-3" /> Agregar
                    </button>
                  </div>
                </div>

                {/* Actitudes */}
                <div className="space-y-2">
                  <span className="text-[10px] font-bold text-muted-foreground uppercase">Actitudes</span>
                  <div className="flex flex-wrap gap-1.5">
                    {dispActitudes.map((a, i) => {
                      const active = (actividad.actitudes || []).includes(a)
                      return (
                        <button
                          key={i}
                          onClick={() => setActividad(p => ({
                            ...p,
                            actitudes: p.actitudes?.includes(a) ? p.actitudes.filter(x => x !== a) : [...(p.actitudes || []), a]
                          }))}
                          className={cn(
                            "px-2.5 py-1 rounded-full border text-[10.5px] font-bold transition-all cursor-pointer",
                            active
                              ? "bg-amber-500 text-white border-amber-500"
                              : "bg-muted/10 text-muted-foreground border-border hover:bg-muted/30"
                          )}
                        >
                          {a}
                        </button>
                      )
                    })}
                    <button
                      onClick={() => { const a = prompt("Actitud personalizada:"); if (a) setActividad(p => ({ ...p, actitudes: [...(p.actitudes || []), a] })) }}
                      className="px-2.5 py-1 rounded-full border border-dashed border-border hover:border-primary text-muted-foreground hover:text-primary text-[10.5px] font-bold flex items-center gap-1 transition-colors cursor-pointer"
                    >
                      <Plus className="w-3 h-3" /> Agregar
                    </button>
                  </div>
                </div>
              </div>

              {/* Recursos y Materiales */}
              {renderRecursosMateriales()}

              {/* Presentar y Acciones */}
              <div className="bg-card border border-border rounded-[18px] p-5.5 space-y-2 shadow-sm">
                <span className="text-[11px] font-extrabold text-muted-foreground uppercase tracking-wider block mb-1">Presentar y Exportar</span>
                <button
                  onClick={() => setShowNotebookPptModal(true)}
                  className="flex items-center gap-2.5 w-full p-2.5 rounded-xl border border-border bg-card hover:bg-muted/15 text-left transition-colors cursor-pointer text-[12px] font-bold"
                >
                  <Monitor className="w-4.5 h-4.5 text-amber-500" /> Generar Notebook (PPT)
                </button>
                <button
                  onClick={handleSincronizar}
                  className="flex items-center gap-2.5 w-full p-2.5 rounded-xl border border-border bg-card hover:bg-muted/15 text-left transition-colors cursor-pointer text-[12px] font-bold"
                >
                  <RefreshCw className="w-4.5 h-4.5 text-success-emerald" /> Sincronizar Libro
                </button>
                <button
                  onClick={() => setShowModoClaseEnVivo(true)}
                  className="flex items-center justify-center gap-2 w-full p-3 mt-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white transition-colors shadow cursor-pointer text-[12px] font-extrabold border-none"
                >
                  <Play className="w-4.5 h-4.5" /> Modo Clase en Vivo
                </button>
              </div>

            </div>
          )}

        </div>

      </div>

      {previewArchivo && (() => {
        const previewUrl = previewArchivo.previewUrl || previewArchivo.webViewLink || previewArchivo.url
        const isVideo = previewArchivo.tipo?.includes("video") || previewArchivo.nombre?.toLowerCase().endsWith(".mp4")
        const isImage = previewArchivo.tipo?.includes("image/")
        const externalUrl = previewArchivo.webViewLink || previewArchivo.url

        return (
          <div className="fixed inset-0 z-[700] flex items-center justify-center bg-black/60 p-3 sm:p-6">
            <div className="flex h-full max-h-[90vh] w-full max-w-[980px] flex-col overflow-hidden rounded-[18px] border border-border bg-card shadow-2xl">
              <div className="flex flex-shrink-0 items-center justify-between gap-3 border-b border-border px-4 py-3">
                <div className="flex min-w-0 items-center gap-2.5">
                  <FileText className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-extrabold text-foreground">{previewArchivo.nombre}</p>
                    <p className="text-[10px] text-muted-foreground">{previewArchivo.tipo || "archivo"}</p>
                  </div>
                  {(previewArchivo.provider === "drive" || previewArchivo.driveFileId) && (
                    <span className="flex-shrink-0 rounded-full border border-primary/30 bg-primary/10 px-1.5 py-0.5 text-[9px] font-extrabold uppercase text-primary">
                      Drive
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {externalUrl && (
                    <a
                      href={externalUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-[11px] font-bold text-muted-foreground hover:bg-muted hover:text-foreground"
                      title="Abrir en nueva pesta\u00f1a"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      <span className="hidden sm:inline">Abrir</span>
                    </a>
                  )}
                  <button
                    type="button"
                    onClick={() => setPreviewArchivo(null)}
                    className="grid h-8 w-8 place-items-center rounded-lg border border-border text-muted-foreground hover:bg-status-red-bg hover:text-status-red-text"
                    title="Cerrar"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <div className="relative min-h-0 flex-1 bg-muted/30">
                {isVideo ? (
                  <video src={previewArchivo.url} controls className="h-full w-full object-contain" />
                ) : isImage ? (
                  <div className="flex h-full items-center justify-center p-4">
                    {/* eslint-disable-next-line @next/next/no-img-element -- Preview uses arbitrary local, Drive, and blob URLs. */}
                    <img
                      src={previewArchivo.url}
                      alt={previewArchivo.nombre}
                      className="max-h-full max-w-full rounded-lg object-contain shadow-md"
                    />
                  </div>
                ) : previewUrl ? (
                  <iframe
                    src={previewUrl}
                    title={previewArchivo.nombre}
                    className="h-full w-full border-0 bg-white"
                    allow="autoplay"
                  />
                ) : (
                  <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
                    <FileText className="h-12 w-12 text-muted-foreground/40" />
                    <p className="text-[13px] font-bold text-foreground">Sin vista previa disponible</p>
                    {externalUrl && (
                      <a
                        href={externalUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-2 inline-flex items-center gap-2 rounded-[10px] border border-primary bg-primary/10 px-4 py-2 text-[12px] font-bold text-primary hover:bg-pink-light"
                      >
                        <ExternalLink className="h-4 w-4" />
                        Abrir en Drive
                      </a>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )
      })()}

      {/* Floating Chat Panel (Copiloto) - Omitido en modo simple */}
      {showCopilot && !simpleMode && (
        <>
          <button
            onClick={() => setShowCopilot(false)}
            className="fixed inset-0 z-40 bg-slate-950/20 backdrop-blur-[1px] md:hidden cursor-default"
          />
          <aside
            style={{ ["--copilot-w" as never]: `${copilotWidth}px` }}
            className={cn(
              "fixed top-0 right-0 z-50 flex h-screen flex-col border-l border-border bg-card shadow-xl w-full md:w-[var(--copilot-w)]",
              !isResizing && "transition-all duration-300"
            )}
          >
            {/* Resizer */}
            <div
              className="hidden md:block absolute left-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-primary/45 bg-transparent z-50 transition-colors"
              onMouseDown={() => setIsResizing(true)}
            />
            
            {/* Copiloto Header */}
            <div className="flex-shrink-0 px-4 py-3.5 border-b border-border flex items-center justify-between bg-card">
              <div className="flex items-center gap-2.5">
                <div className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white shadow-sm">
                  <Sparkles className="h-4.5 w-4.5" />
                </div>
                <div>
                  <span className="text-[13px] font-extrabold text-foreground leading-none block">Copiloto IA</span>
                  <span className="text-[10px] text-muted-foreground mt-0.5 block">{aiConfig.provider} · {aiConfig.model}</span>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setShowAiSettings(!showAiSettings)}
                  className={cn("grid h-7.5 w-7.5 place-items-center rounded-lg transition-colors border border-transparent",
                    showAiSettings ? "bg-primary/10 text-primary border-primary/20" : "text-muted-foreground hover:bg-muted/40"
                  )}
                  title="Configuración de IA"
                >
                  <KeyRound className="h-4 w-4" />
                </button>
                <button onClick={() => setShowCopilot(false)} className="grid h-7.5 w-7.5 place-items-center rounded-lg text-muted-foreground hover:bg-red-50 hover:text-red-500 transition-colors cursor-pointer">
                  <X className="h-4.5 w-4.5" />
                </button>
              </div>
            </div>

            {/* Chat settings box */}
            {showAiSettings && (
              <div className="flex-shrink-0 border-b border-border bg-muted/10 px-4 py-4 space-y-3.5">
                <span className="text-[10.5px] font-extrabold text-muted-foreground uppercase tracking-wider block">Proveedor de IA (BYOK)</span>
                <div className="grid grid-cols-2 gap-1 rounded bg-muted/20 p-1">
                  <button
                    onClick={() => setCopilotTab("chat")}
                    className={cn("rounded py-1 text-[11.5px] font-bold transition-colors cursor-pointer",
                      copilotTab === "chat" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    Chat
                  </button>
                  <button
                    onClick={() => setCopilotTab("prompt")}
                    className={cn("rounded py-1 text-[11.5px] font-bold transition-colors cursor-pointer",
                      copilotTab === "prompt" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    Prompts
                  </button>
                </div>
                <div>
                  <label className="text-[11px] font-extrabold text-muted-foreground mb-1 block">Modelo</label>
                  <input
                    value={aiConfig.model}
                    onChange={e => setAiConfig(prev => ({ ...prev, model: e.target.value }))}
                    placeholder="gemini-2.5-flash"
                    className="w-full rounded border border-border bg-background px-3 py-1.5 text-[11.5px] font-medium outline-none focus:border-primary"
                  />
                </div>
                <button
                  onClick={() => saveAiConfig(aiConfig)}
                  className="w-full py-1.5 bg-primary text-white font-bold text-[11.5px] rounded hover:bg-pink-dark transition-colors cursor-pointer"
                >
                  Guardar Configuración
                </button>
              </div>
            )}

            {/* Chat Message History */}
            <div className="flex-1 overflow-y-auto no-scrollbar p-4 space-y-4 bg-[#FAFBFF] dark:bg-background">
              {chatHistory.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full gap-2 text-center p-6 text-muted-foreground">
                  <Bot className="w-10 h-10 opacity-40 text-primary" />
                  <p className="text-[13px] font-bold">Conversación Pedagógica</p>
                  <p className="text-[11.5px] leading-relaxed">Pregúntame cómo estructurar la clase, pídeme dinámicas específicas o solicita que integre ideas personalizadas.</p>
                </div>
              ) : (
                chatHistory.map((msg, index) => (
                  <div key={index} className={cn("flex w-full", msg.role === "user" ? "justify-end" : "justify-start")}>
                    <div className={cn(
                      "max-w-[85%] rounded-lg p-3 text-[12px] leading-relaxed shadow-sm",
                      msg.role === "user"
                        ? "bg-primary text-white"
                        : "bg-card border border-border text-foreground font-medium"
                    )}>
                      <p>{msg.text}</p>
                    </div>
                  </div>
                ))
              )}
              {isChatLoading && (
                <div className="flex justify-start">
                  <div className="bg-card border border-border rounded-lg p-3 text-[12px] flex items-center gap-2 text-muted-foreground shadow-sm">
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" /> Generando propuesta...
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            {/* Chat Input Bar */}
            <div className="flex-shrink-0 p-3 border-t border-border bg-card">
              <div className="flex gap-2">
                <button
                  onClick={toggleListen}
                  className={cn("grid h-9 w-9 place-items-center rounded-lg border transition-colors cursor-pointer",
                    isListening ? "bg-status-red-bg text-status-red-text border-status-red-border" : "border-border text-muted-foreground hover:bg-muted/40"
                  )}
                >
                  {isListening ? <Mic className="h-4.5 w-4.5 animate-pulse" /> : <MicOff className="h-4.5 w-4.5" />}
                </button>
                <input
                  value={chatInput}
                  onChange={e => setChatInput(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter" && chatInput.trim()) void handleSendChat() }}
                  placeholder="Pregúntale al Copiloto..."
                  className="flex-1 bg-background border border-border rounded-lg px-3 text-[12px] font-medium outline-none focus:border-primary text-foreground"
                />
                <button
                  onClick={handleSendChat}
                  disabled={!chatInput.trim() || isChatLoading}
                  className="grid h-9 w-9 place-items-center rounded-lg bg-primary hover:bg-pink-dark text-white shadow transition-colors disabled:opacity-40 cursor-pointer"
                >
                  <Send className="h-4 w-4" />
                </button>
              </div>
            </div>

          </aside>
        </>
      )}

      {/* Floating Action Buttons for Simple Mode */}
      {simpleMode && (
        <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-3 pointer-events-none print:hidden">
          {/* Drive Button */}
          <button
            onClick={handleExportarClaseDrive}
            disabled={exportingDrive || !tieneContenidoClase}
            className="pointer-events-auto group flex items-center h-12 w-12 hover:w-48 rounded-full overflow-hidden transition-all duration-300 ease-out shadow-lg hover:shadow-xl cursor-pointer bg-blue-600 hover:bg-blue-700 disabled:bg-blue-600/50 disabled:cursor-not-allowed text-white pl-3.5 pr-4 gap-3 border-none outline-none"
            title="Exportar a Google Drive"
          >
            {exportingDrive ? (
              <Loader2 className="w-5 h-5 flex-shrink-0 animate-spin" />
            ) : (
              <Download className="w-5 h-5 flex-shrink-0" />
            )}
            <span className="opacity-0 group-hover:opacity-100 transition-opacity duration-300 whitespace-nowrap text-[12px] font-extrabold tracking-wide">
              Exportar a Drive
            </span>
          </button>

          {/* PPT Button */}
          <button
            onClick={() => setShowNotebookPptModal(true)}
            className="pointer-events-auto group flex items-center h-12 w-12 hover:w-48 rounded-full overflow-hidden transition-all duration-300 ease-out shadow-lg hover:shadow-xl cursor-pointer bg-amber-500 hover:bg-amber-600 text-white pl-3.5 pr-4 gap-3 border-none outline-none"
            title="Generar Notebook (PPT)"
          >
            <Monitor className="w-5 h-5 flex-shrink-0" />
            <span className="opacity-0 group-hover:opacity-100 transition-opacity duration-300 whitespace-nowrap text-[12px] font-extrabold tracking-wide">
              Generar PPT
            </span>
          </button>

          {/* Live Class Button */}
          <button
            onClick={() => setShowModoClaseEnVivo(true)}
            className="pointer-events-auto group flex items-center h-12 w-12 hover:w-48 rounded-full overflow-hidden transition-all duration-300 ease-out shadow-lg hover:shadow-xl cursor-pointer bg-indigo-600 hover:bg-indigo-700 text-white pl-3.5 pr-4 gap-3 border-none outline-none"
            title="Modo Clase en Vivo"
          >
            <Play className="w-5 h-5 flex-shrink-0" />
            <span className="opacity-0 group-hover:opacity-100 transition-opacity duration-300 whitespace-nowrap text-[12px] font-extrabold tracking-wide">
              Clase en Vivo
            </span>
          </button>

          {/* Sync Class Button */}
          <button
            onClick={handleSincronizar}
            className="pointer-events-auto group flex items-center h-12 w-12 hover:w-48 rounded-full overflow-hidden transition-all duration-300 ease-out shadow-lg hover:shadow-xl cursor-pointer bg-emerald-600 hover:bg-emerald-700 text-white pl-3.5 pr-4 gap-3 border-none outline-none"
            title="Sincronizar Libro"
          >
            <RefreshCw className="w-5 h-5 flex-shrink-0" />
            <span className="opacity-0 group-hover:opacity-100 transition-opacity duration-300 whitespace-nowrap text-[12px] font-extrabold tracking-wide">
              Sincronizar Libro
            </span>
          </button>
        </div>
      )}

    </div>
  )
}

export function VerUnidadV3Clases() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center h-64 gap-3 text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin" />
        <span className="text-[14px] font-medium">Cargando editor de clases v3…</span>
      </div>
    }>
      <VerUnidadV3ClasesInner />
    </Suspense>
  )
}
