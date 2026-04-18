"use client"

import { useState, useEffect, Suspense, useRef } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import {
  ChevronLeft, Bookmark, Loader2, Check, ArrowRight,
  ChevronDown, ChevronRight, Plus, X, Target,
  Layers, Clipboard, FileText, Monitor, Package,
  RefreshCw, BookOpen, Calendar, Sparkles, Bot, Blocks,
  Send, Settings2, Wand2, KeyRound, ChevronUp,
  NotebookText, ExternalLink, Trash2, Library,
  Upload, FileUp, Zap, Lightbulb
} from "lucide-react"
import { cn } from "@/lib/utils"
import {
  guardarActividadClase, cargarActividadClase,
  cargarCronogramaUnidad, cargarVerUnidad,
  guardarLibroClases, cargarLibroClases,
  getUnidadCompleta, initOAs, mergeOAs, cargarBancoActividades,
  guardarSnapshotNotebookLm, cargarSnapshotsNotebookLm,
  eliminarSnapshotNotebookLm, incrementarUsoSnapshot,
} from "@/lib/curriculo"
import type {
  ActividadClase, OAEditado, ClaseCronograma, ActividadSugerida, EjemploEvaluacion,
  NotebookLmSnapshot, NotebookLmTipo
} from "@/lib/curriculo"
import { ASIGNATURA, UNIT_COLORS, buildUrl } from "@/lib/shared"
import { cargarNivelMapping, resolveNivel } from "@/lib/nivel-mapping"
import {
  DEFAULT_AI_CONFIG, AI_PROVIDER_OPTIONS, normalizeAiConfig, getProviderMeta,
  coerceGeneratedLesson, parseJsonResponse, htmlToPlainText,
  type StoredAiConfig,
} from "@/lib/ai/copilot"
import { useToast } from "@/hooks/use-toast"
import {
  extractTextFromFile, detectContentType, hasDelimitedFormat,
  buildFormatoGuiadoInstructions,
} from "@/lib/notebooklm-utils"
import dynamic from 'next/dynamic'

const ReactQuill = dynamic(() => import('react-quill-new'), { ssr: false })

const ESTADOS = [
  { key: "no_planificada", label: "No planificada", cls: "bg-background border border-border text-muted-foreground" },
  { key: "planificada", label: "Planificada", cls: "bg-blue-50 border border-blue-200 text-blue-700" },
  { key: "realizada", label: "Realizada", cls: "bg-green-50 border border-green-200 text-green-700" },
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
// `seleccionadosIds`: subconjunto de indicadores elegido para ESTA clase.
//   - undefined → comportamiento legacy: todos los indicadores seleccionados a nivel unidad
//     aparecen marcados; el filtro aguas abajo los incluye a todos.
//   - array → solo los ids en el array van marcados; el resto se mostrarán sin check.
// `onToggleIndicador`: callback para marcar/desmarcar un indicador.
function OACard({ oa, color, onRemove, seleccionadosIds, onToggleIndicador }: {
  oa: OAEditado
  color: string
  onRemove?: () => void
  seleccionadosIds?: string[]
  onToggleIndicador?: (indId: string) => void
}) {
  const [open, setOpen] = useState(false)
  const indicadoresSelec = oa.indicadores?.filter(i => i.seleccionado) || []
  const checkedCount = seleccionadosIds
    ? indicadoresSelec.filter(i => seleccionadosIds.includes(i.id)).length
    : indicadoresSelec.length
  const hasPartialSelection = seleccionadosIds !== undefined && checkedCount < indicadoresSelec.length

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
          {indicadoresSelec.length > 0 && (
            <button
              onClick={() => setOpen(v => !v)}
              className="flex items-center gap-1 mt-1.5 text-[11px] font-semibold text-primary hover:opacity-70 transition-opacity"
            >
              {open ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
              {hasPartialSelection
                ? `${checkedCount} de ${indicadoresSelec.length} indicador${indicadoresSelec.length !== 1 ? "es" : ""}`
                : `${indicadoresSelec.length} indicador${indicadoresSelec.length !== 1 ? "es" : ""}`}
            </button>
          )}
        </div>
        {onRemove && (
          <button onClick={onRemove} className="text-muted-foreground hover:text-red-500 transition-colors">
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
      {open && indicadoresSelec.length > 0 && (
        <div className="border-t border-border bg-card px-3 py-2.5 flex flex-col gap-1.5">
          {indicadoresSelec.map(ind => {
            // Si seleccionadosIds no existe (clase antigua / sin interacción), fallback = todos marcados.
            const checked = seleccionadosIds ? seleccionadosIds.includes(ind.id) : true
            return (
              <label
                key={ind.id}
                className="flex items-start gap-2 text-[11px] cursor-pointer hover:bg-muted/40 rounded px-1 py-0.5 -mx-1 transition-colors"
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => onToggleIndicador?.(ind.id)}
                  className="mt-0.5 accent-primary cursor-pointer"
                />
                <span className="font-semibold flex-shrink-0" style={{ color }}>
                  {oa.esPropio ? "Propio" : `OA ${oa.numero}`}
                </span>
                <span className="text-muted-foreground leading-snug">{ind.texto}</span>
              </label>
            )
          })}
        </div>
      )}
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
  const [nivelCurricular, setNivelCurricular] = useState<string>("")
  const [dispHabilidades, setDispHabilidades] = useState<string[]>([])
  const [dispActitudes, setDispActitudes] = useState<string[]>([])
  const [copilotWidth, setCopilotWidth] = useState(400)
  const [isResizing, setIsResizing] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
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
  // Fase de generación: "rico" mientras corre la call 1 (crear_inicial),
  // "simple" mientras corre la call 2 (destilar_simple), null cuando no se está generando.
  const [generationPhase, setGenerationPhase] = useState<"rico" | "simple" | null>(null)

  // ── Copiloto IA ──
  const [showCopilot, setShowCopilot] = useState(false)
  const [isClassesRailCollapsed, setIsClassesRailCollapsed] = useState(false)
  const [chatHistory, setChatHistory] = useState<Array<{ role: "user" | "ai"; text: string }>>([])
  const [chatInput, setChatInput] = useState("")
  const [isChatLoading, setIsChatLoading] = useState(false)
  const [isApplying, setIsApplying] = useState(false)
  const [showAiSettings, setShowAiSettings] = useState(false)
  const [aiConfig, setAiConfig] = useState<StoredAiConfig>(DEFAULT_AI_CONFIG)
  const chatEndRef = useRef<HTMLDivElement>(null)
  const generateAbortRef = useRef<AbortController | null>(null)
  const applyAbortRef = useRef<AbortController | null>(null)
  const [snapshot, setSnapshot] = useState<Partial<ActividadClase> | null>(null)

  // Colapsables de secciones pedagógicas (Bloom, Indicadores, Actividad evaluación)
  const [openBloom, setOpenBloom] = useState(false)
  const [openIndicadores, setOpenIndicadores] = useState(false)
  const [openActEval, setOpenActEval] = useState(false)

  // ── NotebookLM integration (tab alternativo al Copiloto IA) ──
  const [copilotTab, setCopilotTab] = useState<"ia" | "notebooklm">("ia")
  const [nbTexto, setNbTexto] = useState("")
  const [nbTipo, setNbTipo] = useState<NotebookLmTipo>("clase_completa")
  const [nbTitulo, setNbTitulo] = useState("")
  const [isStructuring, setIsStructuring] = useState(false)
  const [nbSnapshots, setNbSnapshots] = useState<NotebookLmSnapshot[]>([])
  const [showSnapshotsLibrary, setShowSnapshotsLibrary] = useState(false)
  const [loadingSnapshots, setLoadingSnapshots] = useState(false)
  const structureAbortRef = useRef<AbortController | null>(null)
  // Cache del último resultado de estructuración (para guardarlo en el snapshot y reutilizar sin IA)
  const [lastStructuredData, setLastStructuredData] = useState<Record<string, any> | null>(null)

  // v2 — Formato guiado: pide a NotebookLM que use etiquetas delimitadoras
  // para que EduPanel pueda parsear la respuesta sin depender 100% de la IA.
  const [nbFormatoGuiado, setNbFormatoGuiado] = useState(false)
  // v2 — Drag-and-drop / upload de archivos (PDF, TXT, MD)
  const [nbDragOver, setNbDragOver] = useState(false)
  const [nbUploadingFile, setNbUploadingFile] = useState(false)
  const nbFileInputRef = useRef<HTMLInputElement | null>(null)
  // v2 — Auto-detección de tipo de contenido al pegar/subir
  const [nbTipoSugerido, setNbTipoSugerido] = useState<NotebookLmTipo | null>(null)
  // v2 — Indica si el texto actual YA tiene delimitadores válidos (para mostrar badge ⚡)
  const [nbTieneDelimitadores, setNbTieneDelimitadores] = useState(false)

  const NB_MIN_CHARS = 30

  // Cargar config guardada
  useEffect(() => {
    const saved = localStorage.getItem("eduAiConfig")
    if (saved) {
      try { setAiConfig(normalizeAiConfig(JSON.parse(saved))) } catch {}
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
  }, [cursoParam, unidadParam, selectedClase])

  const saveAiConfig = (cfg: StoredAiConfig) => {
    setAiConfig(cfg)
    localStorage.setItem("eduAiConfig", JSON.stringify(cfg))
    setShowAiSettings(false)
  }

  const buildLessonPayload = () => {
    const oasSeleccionados = oasCurriculo.filter(oa => (actividad.oaIds || []).includes(oa.id))
    return {
      curso: cursoParam,
      asignatura: ASIGNATURA,
      numeroClase: selectedClase,
      oas: oasSeleccionados.map(oa => {
        // Respetar selección por clase. Si no hay selección (clase sin interacción o antigua),
        // fallback = todos los indicadores marcados a nivel unidad (comportamiento previo).
        const perClass = actividad.indicadoresPorOa?.[oa.id]
        return {
          numero: oa.numero,
          descripcion: oa.descripcion,
          indicadores: (oa.indicadores || [])
            .filter(i => i.seleccionado)
            .filter(i => perClass ? perClass.includes(i.id) : true)
            .map(i => ({ texto: i.texto })),
        }
      }),
      habilidades: actividad.habilidades || [],
      actitudes: actividad.actitudes || [],
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
        analisisBloom: actividad.analisisBloom,
        indicadoresEvaluacion: actividad.indicadoresEvaluacion,
        actividadEvaluacion: actividad.actividadEvaluacion || "",
        // Versión rica detallada — necesaria para que la IA preserve riqueza al editar
        // y para que la call 2 "destilar_simple" tenga la fuente desde la que destilar.
        inicioDetallado: actividad.inicioDetallado || "",
        desarrolloDetallado: actividad.desarrolloDetallado || "",
        cierreDetallado: actividad.cierreDetallado || "",
      },
      nivelCurricular,
      duracionMinutos: 90,
      modelProvider: aiConfig.provider,
      customToken: aiConfig.token,
      customModel: aiConfig.model,
      customEndpoint: aiConfig.endpoint,
    }
  }

  // Cancelar generación en curso
  const handleCancelGenerar = () => {
    generateAbortRef.current?.abort()
    generateAbortRef.current = null
  }
  const handleCancelAplicar = () => {
    applyAbortRef.current?.abort()
    applyAbortRef.current = null
  }

  // Generar clase inicial — flujo de 2 calls encadenadas:
  //  1) crear_inicial → versión RICA (Bloom, indicadores, actEval, inicioDetallado/desarrolloDetallado/cierreDetallado)
  //  2) destilar_simple → versión SIMPLE narrativa estilo DOCX oficial (inicio/desarrollo/cierre)
  // El AbortController es el mismo para ambas; cancelar interrumpe lo que esté en curso.
  const handleGenerarClase = async () => {
    const ctrl = new AbortController()
    generateAbortRef.current = ctrl
    setIsGeneratingAI(true)
    setGenerationPhase("rico")
    try {
      // ─── CALL 1: generar versión rica ──────────────────────────────────────
      const res1 = await fetch("/api/generar-clase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...buildLessonPayload(), modo: "crear_inicial" }),
        signal: ctrl.signal,
      })
      const data1 = await res1.json()
      if (!res1.ok) throw new Error(data1.error || "Error al generar")

      // Aplica todo lo rico (artefactos pedagógicos + 3 momentos detallados).
      // Los simples (inicio/desarrollo/cierre) se dejan VACÍOS de momento — los llena la call 2.
      setActividad(prev => ({
        ...prev,
        objetivo: data1.objetivo || prev.objetivo,
        inicioDetallado: data1.inicioDetallado || prev.inicioDetallado,
        desarrolloDetallado: data1.desarrolloDetallado || prev.desarrolloDetallado,
        cierreDetallado: data1.cierreDetallado || prev.cierreDetallado,
        materiales: data1.materiales?.length ? data1.materiales : prev.materiales,
        tics: data1.tics?.length ? data1.tics : prev.tics,
        adecuacion: data1.adecuacion || prev.adecuacion,
        analisisBloom: data1.analisisBloom || prev.analisisBloom,
        indicadoresEvaluacion: data1.indicadoresEvaluacion?.length ? data1.indicadoresEvaluacion : prev.indicadoresEvaluacion,
        actividadEvaluacion: data1.actividadEvaluacion || prev.actividadEvaluacion,
      }))
      // Abrir automáticamente las secciones pedagógicas si llegaron datos nuevos
      if (data1.analisisBloom) setOpenBloom(true)
      if (data1.indicadoresEvaluacion?.length) setOpenIndicadores(true)
      if (data1.actividadEvaluacion) setOpenActEval(true)

      // ─── CALL 2: destilar a formato narrativo simple ────────────────────────
      setGenerationPhase("simple")
      const res2 = await fetch("/api/generar-clase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...buildLessonPayload(),
          modo: "destilar_simple",
          // Pasamos la versión rica recién generada para que tenga material desde donde destilar.
          claseActual: {
            objetivo: data1.objetivo || actividad.objetivo || "",
            inicioDetallado: data1.inicioDetallado || "",
            desarrolloDetallado: data1.desarrolloDetallado || "",
            cierreDetallado: data1.cierreDetallado || "",
          },
        }),
        signal: ctrl.signal,
      })
      const data2 = await res2.json()
      if (!res2.ok) throw new Error(data2.error || "Error al destilar formato simple")

      setActividad(prev => ({
        ...prev,
        inicio: data2.inicio || prev.inicio,
        desarrollo: data2.desarrollo || prev.desarrollo,
        cierre: data2.cierre || prev.cierre,
      }))

      setChatHistory([{ role: "ai", text: "✅ He generado una propuesta completa: análisis Bloom, indicadores, actividad de evaluación y los 3 momentos en dos formatos (simple en 'Desarrollo' y detallado en 'Adecuación curricular'). Revísalos y pídeme ajustes si quieres." }])
    } catch (e: any) {
      if (e?.name === "AbortError") {
        setChatHistory([{ role: "ai", text: "⏹️ Generación cancelada." }])
      } else {
        setChatHistory([{ role: "ai", text: "❌ Error al generar: " + e.message }])
      }
    } finally {
      setIsGeneratingAI(false)
      setGenerationPhase(null)
      generateAbortRef.current = null
    }
  }

  // Enviar mensaje de chat (conversación libre)
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
          ...buildLessonPayload(),
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

  // Aplicar cambios a la clase — flujo de 2 calls encadenadas:
  //  1) aplicar_cambios → re-genera versión RICA según el chat (Bloom, indicadores, actEval, XXXDetallado)
  //  2) destilar_simple → re-destila los 3 momentos simples desde la rica recién aplicada
  // Snapshot antes de empezar permite Deshacer todo el bloque (rico + simple) si no convence.
  const handleAplicarCambios = async () => {
    if (chatHistory.length === 0 || isApplying) return
    // Snapshot antes de aplicar (permite Deshacer)
    setSnapshot({ ...actividad })
    const ctrl = new AbortController()
    applyAbortRef.current = ctrl
    setIsApplying(true)
    setGenerationPhase("rico")
    try {
      // ─── CALL 1: aplicar cambios a la versión rica ─────────────────────────
      const res1 = await fetch("/api/generar-clase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...buildLessonPayload(),
          modo: "aplicar_cambios",
          chatHistory,
        }),
        signal: ctrl.signal,
      })
      const data1 = await res1.json()
      if (!res1.ok) throw new Error(data1.error || "Error al aplicar cambios")

      setActividad(prev => ({
        ...prev,
        objetivo: data1.objetivo || prev.objetivo,
        inicioDetallado: data1.inicioDetallado || prev.inicioDetallado,
        desarrolloDetallado: data1.desarrolloDetallado || prev.desarrolloDetallado,
        cierreDetallado: data1.cierreDetallado || prev.cierreDetallado,
        materiales: data1.materiales?.length ? data1.materiales : prev.materiales,
        tics: data1.tics?.length ? data1.tics : prev.tics,
        adecuacion: data1.adecuacion || prev.adecuacion,
        analisisBloom: data1.analisisBloom || prev.analisisBloom,
        indicadoresEvaluacion: data1.indicadoresEvaluacion?.length ? data1.indicadoresEvaluacion : prev.indicadoresEvaluacion,
        actividadEvaluacion: data1.actividadEvaluacion || prev.actividadEvaluacion,
      }))

      // ─── CALL 2: re-destilar a formato narrativo simple ────────────────────
      setGenerationPhase("simple")
      const res2 = await fetch("/api/generar-clase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...buildLessonPayload(),
          modo: "destilar_simple",
          claseActual: {
            objetivo: data1.objetivo || actividad.objetivo || "",
            inicioDetallado: data1.inicioDetallado || actividad.inicioDetallado || "",
            desarrolloDetallado: data1.desarrolloDetallado || actividad.desarrolloDetallado || "",
            cierreDetallado: data1.cierreDetallado || actividad.cierreDetallado || "",
          },
        }),
        signal: ctrl.signal,
      })
      const data2 = await res2.json()
      if (!res2.ok) throw new Error(data2.error || "Error al destilar formato simple")

      setActividad(prev => ({
        ...prev,
        inicio: data2.inicio || prev.inicio,
        desarrollo: data2.desarrollo || prev.desarrollo,
        cierre: data2.cierre || prev.cierre,
      }))

      const resumen = data1.resumenCambios || "✅ Cambios aplicados (versión rica + narrativa simple)."
      setChatHistory(prev => [...prev, { role: "ai", text: resumen + " Puedes pulsar \"Deshacer\" si no te convencen." }])
    } catch (e: any) {
      if (e?.name === "AbortError") {
        setSnapshot(null) // si canceló, no hay que ofrecer deshacer
        setChatHistory(prev => [...prev, { role: "ai", text: "⏹️ Aplicación cancelada." }])
      } else {
        setSnapshot(null)
        setChatHistory(prev => [...prev, { role: "ai", text: "❌ " + e.message }])
      }
    } finally {
      setIsApplying(false)
      setGenerationPhase(null)
      applyAbortRef.current = null
    }
  }

  // Deshacer la última aplicación de cambios
  const handleDeshacer = () => {
    if (!snapshot) return
    setActividad(snapshot)
    setSnapshot(null)
    setChatHistory(prev => [...prev, { role: "ai", text: "↩️ He restaurado la clase al estado previo a los últimos cambios aplicados." }])
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // NotebookLM handlers
  // ═══════════════════════════════════════════════════════════════════════════

  // Etiqueta legible para los tipos NotebookLM (para toasts y UI)
  const tipoLabel = (t: NotebookLmTipo): string => {
    switch (t) {
      case "clase_completa":  return "una clase completa"
      case "rubrica":         return "una rúbrica"
      case "analisis_bloom":  return "un análisis Bloom"
      case "indicadores":     return "indicadores de evaluación"
      case "evaluacion":      return "una actividad de evaluación"
      case "otro":            return "otro contenido"
    }
  }

  // Abre NotebookLM en una PESTAÑA nueva (no popup).
  // El popup era molesto: bloqueado por algunos navegadores, no se integra con
  // el sistema de pestañas, ni permite split-screen. Una pestaña normal deja
  // al usuario manejar la ventana con las herramientas del SO (Snap, etc.).
  const handleOpenNotebookLm = () => {
    window.open("https://notebooklm.google.com", "_blank", "noopener,noreferrer")
  }

  // Copia un bloque de contexto pedagógico al portapapeles para que el profesor
  // lo pegue como prompt inicial en NotebookLM. Incluye OAs, unidad, nivel,
  // habilidades, conocimientos, actitudes. Si `nbFormatoGuiado` está activo,
  // agrega instrucciones de formato con etiquetas delimitadoras.
  const handleCopiarContexto = async () => {
    const oasSeleccionados = oasCurriculo.filter(oa => (actividad.oaIds || []).includes(oa.id))
    const lineasOA = oasSeleccionados.map(oa =>
      `• OA ${oa.numero}: ${oa.descripcion}`
    )

    // Extraer textos de habilidades/conocimientos/actitudes si existen
    const toText = (items: any[]): string[] => {
      if (!Array.isArray(items)) return []
      return items
        .map((it) => {
          if (typeof it === "string") return it
          if (typeof it === "object" && it) {
            return it.texto || it.descripcion || it.nombre || ""
          }
          return ""
        })
        .filter((s) => s && String(s).trim().length > 0)
    }

    const habilidades = toText(unidadData?.habilidades)
    const conocimientos = toText(unidadData?.conocimientos)
    const actitudes = toText(unidadData?.actitudes)

    const bloques: string[] = [
      `Soy docente de ${ASIGNATURA} de ${cursoParam} (nivel curricular: ${nivelCurricular || "no especificado"}).`,
      unidadData?.nombre_unidad ? `Unidad: "${unidadData.nombre_unidad}"` : "",
      unidadData?.proposito ? `Propósito: ${unidadData.proposito}` : "",
      `Clase N°${selectedClase} de la unidad.`,
      "",
      "Objetivos de Aprendizaje (OA) a abordar:",
      ...(lineasOA.length > 0 ? lineasOA : ["(sin OA seleccionados)"]),
    ]

    if (habilidades.length > 0) {
      bloques.push("", "Habilidades a desarrollar:", ...habilidades.map((h) => `• ${h}`))
    }
    if (conocimientos.length > 0) {
      bloques.push("", "Conocimientos involucrados:", ...conocimientos.map((c) => `• ${c}`))
    }
    if (actitudes.length > 0) {
      bloques.push("", "Actitudes a promover:", ...actitudes.map((a) => `• ${a}`))
    }

    bloques.push(
      "",
      nbTipo === "rubrica"
        ? "Por favor, genera una RÚBRICA de evaluación formativa (3 niveles: inicial/intermedio/avanzado) alineada a estos OA, usando las fuentes que te compartí."
        : nbTipo === "analisis_bloom"
        ? "Por favor, realiza un ANÁLISIS según la Taxonomía de Bloom revisada del OA (categoría cognitiva + justificación)."
        : nbTipo === "indicadores"
        ? "Por favor, genera 3-5 INDICADORES DE EVALUACIÓN (verbo observable + contenido + condición), cubriendo las tres dimensiones: saber / saber hacer / ser."
        : nbTipo === "evaluacion"
        ? "Por favor, diseña una ACTIVIDAD DE EVALUACIÓN FORMATIVA concreta, lúdica y activa, alineada al OA."
        : nbTipo === "otro"
        ? "Por favor, genera el contenido pedagógico que te indiqué, alineado a estos OA."
        : "Por favor, diseña una CLASE COMPLETA con inicio, desarrollo y cierre, incluyendo actividad de evaluación formativa."
    )

    // Si el profesor activó "Formato guiado", anexar instrucciones de etiquetas
    if (nbFormatoGuiado) {
      bloques.push(buildFormatoGuiadoInstructions(nbTipo))
    }

    const contexto = bloques.filter((b) => b !== null && b !== undefined).join("\n")

    try {
      await navigator.clipboard.writeText(contexto)
      toast({
        title: nbFormatoGuiado
          ? "📋 Contexto + formato guiado copiado"
          : "📋 Contexto copiado",
        description: nbFormatoGuiado
          ? "Pégalo en NotebookLM. Su respuesta vendrá con etiquetas para parseo automático."
          : "Pégalo en NotebookLM como primer mensaje.",
      })
    } catch {
      toast({ title: "No se pudo copiar", description: "Tu navegador bloqueó el portapapeles.", variant: "destructive" })
    }
  }

  // ─── Handlers de archivos (PDF/TXT/MD) ──────────────────────────────────
  const processNbFile = async (file: File) => {
    if (!file) return
    setNbUploadingFile(true)
    try {
      const result = await extractTextFromFile(file)
      setNbTexto(result.text)
      if (lastStructuredData) setLastStructuredData(null)
      // Sugerir un título basado en el archivo si aún no hay uno
      if (!nbTitulo) {
        const clean = result.fileName.replace(/\.[^.]+$/, "")
        setNbTitulo(clean.slice(0, 80))
      }
      // Auto-detectar tipo
      const sugerido = detectContentType(result.text)
      setNbTipoSugerido(sugerido && sugerido !== nbTipo ? sugerido : null)
      setNbTieneDelimitadores(hasDelimitedFormat(result.text))
      toast({
        title: "📄 Texto extraído del archivo",
        description: `${result.fileName} · ${result.wordCount.toLocaleString("es-CL")} palabras`,
      })
    } catch (e: any) {
      toast({
        title: "No se pudo leer el archivo",
        description: e?.message || "Error desconocido",
        variant: "destructive",
      })
    } finally {
      setNbUploadingFile(false)
    }
  }

  const handleNbFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) processNbFile(file)
    // Reset del input para permitir subir el mismo archivo de nuevo
    if (e.target) e.target.value = ""
  }

  const handleNbDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setNbDragOver(false)
    const file = e.dataTransfer?.files?.[0]
    if (file) processNbFile(file)
  }

  const handleNbDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    if (!nbDragOver) setNbDragOver(true)
  }

  const handleNbDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setNbDragOver(false)
  }

  // ─── Auto-detección al editar texto ─────────────────────────────────────
  // Se invoca desde el onChange del textarea. Debounce implícito por el
  // trigger del estado (React batching).
  const runAutoDetect = (texto: string) => {
    if (!texto || texto.trim().length < 40) {
      setNbTipoSugerido(null)
      setNbTieneDelimitadores(false)
      return
    }
    const sugerido = detectContentType(texto)
    setNbTipoSugerido(sugerido && sugerido !== nbTipo ? sugerido : null)
    setNbTieneDelimitadores(hasDelimitedFormat(texto))
  }

  const handleAplicarTipoSugerido = () => {
    if (!nbTipoSugerido) return
    setNbTipo(nbTipoSugerido)
    setNbTipoSugerido(null)
  }

  // Estructura el texto pegado de NotebookLM usando la IA y lo aplica a la clase
  const handleEstructurarNotebookLm = async () => {
    if (isStructuring) return
    const texto = nbTexto.trim()
    if (texto.length < NB_MIN_CHARS) {
      toast({
        title: "Texto demasiado corto",
        description: `Pega al menos ${NB_MIN_CHARS} caracteres del resultado de NotebookLM.`,
        variant: "destructive",
      })
      return
    }
    setSnapshot({ ...actividad })
    const ctrl = new AbortController()
    structureAbortRef.current = ctrl
    setIsStructuring(true)
    setGenerationPhase("rico")
    try {
      const res1 = await fetch("/api/generar-clase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...buildLessonPayload(),
          modo: "estructurar_notebook_lm",
          textoNotebookLm: texto,
          tipoContenido: nbTipo,
          modelProvider: aiConfig.provider,
          customToken: aiConfig.token,
          customModel: aiConfig.model,
          customEndpoint: aiConfig.endpoint,
        }),
        signal: ctrl.signal,
      })
      const data1 = await res1.json()
      if (!res1.ok) throw new Error(data1.error || "Error al estructurar")

      // Guardar cache del resultado para poder persistirlo en el snapshot
      setLastStructuredData(data1)

      // Aplicar solo los campos que vinieron rellenos (NO pisar con strings vacíos)
      setActividad(prev => ({
        ...prev,
        objetivo: data1.objetivo || prev.objetivo,
        inicioDetallado: data1.inicioDetallado || prev.inicioDetallado,
        desarrolloDetallado: data1.desarrolloDetallado || prev.desarrolloDetallado,
        cierreDetallado: data1.cierreDetallado || prev.cierreDetallado,
        materiales: data1.materiales?.length ? data1.materiales : prev.materiales,
        tics: data1.tics?.length ? data1.tics : prev.tics,
        adecuacion: data1.adecuacion || prev.adecuacion,
        analisisBloom: data1.analisisBloom || prev.analisisBloom,
        indicadoresEvaluacion: data1.indicadoresEvaluacion?.length ? data1.indicadoresEvaluacion : prev.indicadoresEvaluacion,
        actividadEvaluacion: data1.actividadEvaluacion || prev.actividadEvaluacion,
      }))

      // Solo re-destilar si rellenó los momentos detallados de clase completa
      const tieneMomentos = !!(data1.inicioDetallado || data1.desarrolloDetallado || data1.cierreDetallado)
      if (tieneMomentos) {
        setGenerationPhase("simple")
        const res2 = await fetch("/api/generar-clase", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...buildLessonPayload(),
            modo: "destilar_simple",
            claseActual: {
              objetivo: data1.objetivo || actividad.objetivo || "",
              inicioDetallado: data1.inicioDetallado || actividad.inicioDetallado || "",
              desarrolloDetallado: data1.desarrolloDetallado || actividad.desarrolloDetallado || "",
              cierreDetallado: data1.cierreDetallado || actividad.cierreDetallado || "",
            },
          }),
          signal: ctrl.signal,
        })
        const data2 = await res2.json()
        if (res2.ok) {
          setActividad(prev => ({
            ...prev,
            inicio: data2.inicio || prev.inicio,
            desarrollo: data2.desarrollo || prev.desarrollo,
            cierre: data2.cierre || prev.cierre,
          }))
        }
      }

      const resumen = data1.resumenCambios || "✅ Texto de NotebookLM estructurado y aplicado a la clase."
      setChatHistory(prev => [...prev, { role: "ai", text: `📓 ${resumen} Puedes pulsar "Deshacer" si no te convence.` }])
      toast({ title: "📓 Aplicado desde NotebookLM", description: "Revisa la clase. Puedes deshacer o guardar el snapshot." })
    } catch (e: any) {
      if (e?.name === "AbortError") {
        setSnapshot(null)
        toast({ title: "Cancelado", description: "Estructuración interrumpida." })
      } else {
        setSnapshot(null)
        toast({ title: "Error al estructurar", description: e.message || "Error desconocido", variant: "destructive" })
      }
    } finally {
      setIsStructuring(false)
      setGenerationPhase(null)
      structureAbortRef.current = null
    }
  }

  const handleCancelEstructurar = () => {
    structureAbortRef.current?.abort()
  }

  // Guarda el texto pegado como snapshot reutilizable en la biblioteca.
  // Si ya se estructuró en esta sesión, cachea también el JSON para reaplicar sin IA.
  const handleGuardarSnapshotActual = async () => {
    if (!nbTexto.trim()) return
    const titulo = nbTitulo.trim() || `Snapshot ${new Date().toLocaleDateString("es-CL")}`
    try {
      const saved = await guardarSnapshotNotebookLm({
        titulo,
        tipo: nbTipo,
        asignatura: ASIGNATURA,
        nivel: nivelCurricular || undefined,
        textoOriginal: nbTexto,
        textoEstructurado: lastStructuredData || undefined,
      })
      setNbSnapshots(prev => [saved, ...prev])
      setNbTitulo("")
      toast({
        title: `✅ Snapshot guardado`,
        description: `Código: ${saved.codigo}${lastStructuredData ? " (con caché IA)" : ""}`,
      })
    } catch (e: any) {
      toast({ title: "No se pudo guardar", description: e?.message || "Error desconocido", variant: "destructive" })
    }
  }

  // Carga la lista de snapshots de la biblioteca
  const handleCargarSnapshots = async () => {
    setLoadingSnapshots(true)
    try {
      const list = await cargarSnapshotsNotebookLm(ASIGNATURA)
      setNbSnapshots(list)
    } catch (e: any) {
      toast({ title: "Error cargando snapshots", description: e?.message || "Error", variant: "destructive" })
    } finally {
      setLoadingSnapshots(false)
    }
  }

  // "Cargar" un snapshot existente al editor (sin aplicar todavía)
  const handleAplicarSnapshot = async (snap: NotebookLmSnapshot) => {
    setNbTexto(snap.textoOriginal)
    setNbTipo(snap.tipo)
    setNbTitulo(snap.titulo)
    setLastStructuredData(snap.textoEstructurado || null)
    try { await incrementarUsoSnapshot(snap.id) } catch {}
    setShowSnapshotsLibrary(false)
    toast({
      title: `📥 Snapshot cargado: ${snap.codigo}`,
      description: snap.textoEstructurado
        ? "Tiene caché IA. Puedes aplicar sin llamar a la IA."
        : "Click 'Estructurar y aplicar' para procesar con IA.",
    })
  }

  // Aplica el cache estructurado directamente SIN llamar a la IA (0 tokens).
  // Se usa cuando el snapshot ya fue estructurado antes.
  const handleAplicarDesdeCache = () => {
    if (!lastStructuredData) return
    const data1 = lastStructuredData
    setSnapshot({ ...actividad })
    setActividad(prev => ({
      ...prev,
      objetivo: data1.objetivo || prev.objetivo,
      inicioDetallado: data1.inicioDetallado || prev.inicioDetallado,
      desarrolloDetallado: data1.desarrolloDetallado || prev.desarrolloDetallado,
      cierreDetallado: data1.cierreDetallado || prev.cierreDetallado,
      // Los momentos simples también vienen cacheados si la sesión anterior llegó a destilar
      inicio: data1.inicio || prev.inicio,
      desarrollo: data1.desarrollo || prev.desarrollo,
      cierre: data1.cierre || prev.cierre,
      materiales: data1.materiales?.length ? data1.materiales : prev.materiales,
      tics: data1.tics?.length ? data1.tics : prev.tics,
      adecuacion: data1.adecuacion || prev.adecuacion,
      analisisBloom: data1.analisisBloom || prev.analisisBloom,
      indicadoresEvaluacion: data1.indicadoresEvaluacion?.length ? data1.indicadoresEvaluacion : prev.indicadoresEvaluacion,
      actividadEvaluacion: data1.actividadEvaluacion || prev.actividadEvaluacion,
    }))
    toast({ title: "⚡ Aplicado desde caché", description: "Sin consumo de tokens IA. Puedes deshacer." })
  }

  const handleEliminarSnapshot = async (id: string) => {
    if (!confirm("¿Eliminar este snapshot de NotebookLM?")) return
    try {
      await eliminarSnapshotNotebookLm(id)
      setNbSnapshots(prev => prev.filter(s => s.id !== id))
      toast({ title: "🗑 Snapshot eliminado" })
    } catch (e: any) {
      toast({ title: "No se pudo eliminar", description: e?.message || "Error", variant: "destructive" })
    }
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
        if (!cancelled) setNivelCurricular(nivel || "")
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
        // Campos opcionales generados por la IA. Hay que listarlos explícitamente porque
        // `guardarActividadClase` hace setDoc (reemplaza doc completo); si no van aquí se pierden
        // en cada autosave. Backward-compat: si están vacíos, simplemente no se guardan.
        ...(actividad.analisisBloom ? { analisisBloom: actividad.analisisBloom } : {}),
        ...(actividad.indicadoresEvaluacion?.length ? { indicadoresEvaluacion: actividad.indicadoresEvaluacion } : {}),
        ...(actividad.actividadEvaluacion ? { actividadEvaluacion: actividad.actividadEvaluacion } : {}),
        ...(actividad.inicioDetallado ? { inicioDetallado: actividad.inicioDetallado } : {}),
        ...(actividad.desarrolloDetallado ? { desarrolloDetallado: actividad.desarrolloDetallado } : {}),
        ...(actividad.cierreDetallado ? { cierreDetallado: actividad.cierreDetallado } : {}),
        // Selección por clase de indicadores del currículum ministerial (checkbox por indicador en OACard).
        ...(actividad.indicadoresPorOa && Object.keys(actividad.indicadoresPorOa).length
          ? { indicadoresPorOa: actividad.indicadoresPorOa }
          : {}),
      })
      setActividad(p => ({ ...p, estado: "planificada" }))
      setSaveStatus("saved")
      setTimeout(() => setSaveStatus("idle"), 3000)
    } catch {
      setSaveStatus("error")
      setTimeout(() => setSaveStatus("idle"), 3000)
    } finally { setSaving(false) }
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

  if (loading) return (
    <div className="flex items-center justify-center h-64 gap-3 text-muted-foreground">
      <Loader2 className="w-5 h-5 animate-spin" />
      <span className="text-[14px]">Cargando actividades…</span>
    </div>
  )

  const estadoActual = ESTADOS.find(e => e.key === actividad.estado) || ESTADOS[0]

  const verUnidadParams: Record<string, string> = unidadCurricularParam !== unidadParam
    ? { curso: cursoParam, unidad: unidadCurricularParam, unitIdLocal: unidadParam }
    : { curso: cursoParam, unidad: unidadCurricularParam }
  const contentGridTemplate = isClassesRailCollapsed ? "84px minmax(0, 1fr)" : "220px minmax(0, 1fr)"

  return (
    <div
      className={cn("relative w-full overflow-y-auto h-[calc(100vh-64px)] transition-all", !isResizing && "duration-300")}
      style={{ paddingRight: showCopilot ? copilotWidth : 0 }}
    >
      <div className={cn("pb-10 pt-4", "mx-auto max-w-[1680px] px-4 md:px-6")}>
        {/* Header — oculto en modo compact */}
        <div className={compact ? "flex items-center justify-between mb-4 flex-wrap gap-2 print:hidden" : "flex items-center justify-between mb-6 flex-wrap gap-3 print:hidden"}>
          <div className="flex items-center gap-3">
            <Link
              href={buildUrl("/ver-unidad", verUnidadParams)}
              className="w-8 h-8 border-[1.5px] border-border rounded-lg bg-card grid place-items-center text-muted-foreground hover:bg-background transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </Link>
            <div>
              <p className="text-[11px] text-muted-foreground">
                <Link href={buildUrl("/planificaciones", { curso: cursoParam })} className="hover:text-primary">Mis planificaciones</Link>
                {" "}/ <Link href={buildUrl("/ver-unidad", verUnidadParams)} className="hover:text-primary">Unidad</Link>
              </p>
              <h1 className="text-[20px] font-extrabold leading-tight">
                Actividades · {ASIGNATURA} – {cursoParam}
              </h1>
            </div>
          </div>
          <div className="flex items-center gap-2.5">
            {saveStatus === "saving_silent" && <span className="flex items-center gap-1 text-[12px] text-muted-foreground font-semibold animate-pulse"><RefreshCw className="w-3.5 h-3.5 animate-spin" /> Guardando...</span>}
            {saveStatus === "saved" && <span className="flex items-center gap-1 text-[12px] text-green-600 font-semibold"><Check className="w-4 h-4" /> Guardado</span>}
            {saveStatus === "synced" && <span className="flex items-center gap-1 text-[12px] text-blue-600 font-semibold"><Check className="w-4 h-4" /> Sincronizado al Libro</span>}
            {saveStatus === "error" && <span className="text-[12px] text-red-500 font-semibold">Error al guardar</span>}
            <button
              onClick={() => handleGuardar(false)}
              disabled={saving || saveStatus === "saving_silent"}
              className="flex items-center gap-1.5 bg-primary text-white text-[13px] font-bold rounded-[10px] px-5 py-2.5 hover:bg-[#d6335e] transition-colors disabled:opacity-60"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Bookmark className="w-4 h-4" />}
              Guardar Manualmente
            </button>
          </div>
        </div>

        {/* Layout 3 paneles */}
        <div
          className="grid gap-4 items-start print:flex print:flex-col print:gap-6"
          style={{ gridTemplateColumns: contentGridTemplate }}
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
            <div className="overflow-y-auto max-h-[600px]">
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

              {/* Objetivo de la clase */}
              <div className="mb-3">
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide">Objetivo de la clase</label>
                  {oasDeEstaClase.length > 0 && (
                    <button
                      onClick={() => setActividad(p => ({ ...p, objetivo: oasDeEstaClase[0].indicadores?.find(i => i.seleccionado)?.texto || oasDeEstaClase[0].descripcion || "" }))}
                      className="text-[10px] text-primary font-semibold hover:opacity-70 border border-primary rounded-full px-2 py-0.5"
                    >
                      Sugerencia
                    </button>
                  )}
                </div>
                <RichArea
                  value={actividad.objetivo || ""}
                  onChange={v => setActividad(p => ({ ...p, objetivo: v }))}
                  placeholder="Redacta el objetivo de esta clase…"
                  rows={3}
                />
              </div>

              {/* ── Análisis curricular (Bloom) ── */}
              <div className="mb-3 bg-card border border-border rounded-[12px]">
                <button
                  type="button"
                  onClick={() => setOpenBloom(v => !v)}
                  className="w-full flex items-center justify-between px-4 py-2.5 text-left hover:bg-background transition-colors rounded-[12px]"
                >
                  <div className="flex items-center gap-2">
                    <Blocks className="w-3.5 h-3.5 text-violet-600" />
                    <span className="text-[12px] font-bold">Análisis curricular (Bloom)</span>
                    {actividad.analisisBloom?.categoria && (
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-violet-50 border border-violet-200 text-violet-700 capitalize">
                        {actividad.analisisBloom.categoria}
                      </span>
                    )}
                    {actividad.analisisBloom?.nivelGeneral && (
                      <span className={cn(
                        "text-[10px] font-bold px-2 py-0.5 rounded-full border",
                        actividad.analisisBloom.nivelGeneral === "BAJO" && "bg-green-50 border-green-200 text-green-700",
                        actividad.analisisBloom.nivelGeneral === "MEDIO" && "bg-amber-50 border-amber-200 text-amber-700",
                        actividad.analisisBloom.nivelGeneral === "ALTO" && "bg-violet-50 border-violet-200 text-violet-700",
                      )}>
                        {actividad.analisisBloom.nivelGeneral}
                      </span>
                    )}
                  </div>
                  {openBloom ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                </button>
                {openBloom && (
                  <div className="px-4 pb-3 pt-1 flex flex-col gap-2">
                    <div className="flex flex-wrap gap-2 items-center">
                      <label className="text-[10px] font-bold uppercase text-muted-foreground">Categoría</label>
                      <select
                        value={actividad.analisisBloom?.categoria || ""}
                        onChange={e => setActividad(p => ({ ...p, analisisBloom: { ...(p.analisisBloom || { nivelGeneral: "MEDIO", justificacion: "" }), categoria: e.target.value } }))}
                        className="text-[11px] border border-border rounded-md px-2 py-1 bg-background"
                      >
                        <option value="">—</option>
                        <option value="recordar">Recordar</option>
                        <option value="comprender">Comprender</option>
                        <option value="aplicar">Aplicar</option>
                        <option value="analizar">Analizar</option>
                        <option value="evaluar">Evaluar</option>
                        <option value="crear">Crear</option>
                      </select>
                      <label className="text-[10px] font-bold uppercase text-muted-foreground ml-2">Nivel</label>
                      <select
                        value={actividad.analisisBloom?.nivelGeneral || "MEDIO"}
                        onChange={e => setActividad(p => ({ ...p, analisisBloom: { ...(p.analisisBloom || { categoria: "", justificacion: "" }), nivelGeneral: e.target.value as "BAJO" | "MEDIO" | "ALTO" } }))}
                        className="text-[11px] border border-border rounded-md px-2 py-1 bg-background"
                      >
                        <option value="BAJO">BAJO</option>
                        <option value="MEDIO">MEDIO</option>
                        <option value="ALTO">ALTO</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-[10px] font-bold uppercase text-muted-foreground block mb-1">Justificación</label>
                      <textarea
                        value={actividad.analisisBloom?.justificacion || ""}
                        onChange={e => setActividad(p => ({ ...p, analisisBloom: { ...(p.analisisBloom || { categoria: "", nivelGeneral: "MEDIO" }), justificacion: e.target.value } }))}
                        placeholder="Verbo rector del OA y nivel cognitivo dominante…"
                        rows={3}
                        className="w-full text-[12px] border border-border rounded-md px-2.5 py-1.5 bg-background resize-y"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* ── Indicadores de evaluación ── */}
              <div className="mb-3 bg-card border border-border rounded-[12px]">
                <button
                  type="button"
                  onClick={() => setOpenIndicadores(v => !v)}
                  className="w-full flex items-center justify-between px-4 py-2.5 text-left hover:bg-background transition-colors rounded-[12px]"
                >
                  <div className="flex items-center gap-2">
                    <Target className="w-3.5 h-3.5 text-blue-600" />
                    <span className="text-[12px] font-bold">Indicadores de evaluación</span>
                    {(actividad.indicadoresEvaluacion?.length || 0) > 0 && (
                      <span className="text-[10px] text-muted-foreground bg-background border border-border rounded-full px-2 py-0.5">
                        {actividad.indicadoresEvaluacion?.length}
                      </span>
                    )}
                  </div>
                  {openIndicadores ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                </button>
                {openIndicadores && (
                  <div className="px-4 pb-3 pt-1 flex flex-col gap-2">
                    {(actividad.indicadoresEvaluacion || []).length === 0 ? (
                      <p className="text-[11px] text-muted-foreground italic">Aún no hay indicadores. Pulsa «+ Agregar» para crear uno o genera con IA.</p>
                    ) : (
                      (actividad.indicadoresEvaluacion || []).map((ind, idx) => (
                        <div key={idx} className="flex gap-2 items-start">
                          <select
                            value={ind.dimension}
                            onChange={e => setActividad(p => ({
                              ...p,
                              indicadoresEvaluacion: (p.indicadoresEvaluacion || []).map((x, i) => i === idx ? { ...x, dimension: e.target.value as "saber" | "saber_hacer" | "ser" } : x),
                            }))}
                            className={cn(
                              "text-[10px] font-bold border rounded-md px-2 py-1 bg-background shrink-0",
                              ind.dimension === "saber" && "border-blue-200 text-blue-700",
                              ind.dimension === "saber_hacer" && "border-emerald-200 text-emerald-700",
                              ind.dimension === "ser" && "border-amber-200 text-amber-700",
                            )}
                          >
                            <option value="saber">SABER</option>
                            <option value="saber_hacer">SABER HACER</option>
                            <option value="ser">SER</option>
                          </select>
                          <textarea
                            value={ind.texto}
                            onChange={e => setActividad(p => ({
                              ...p,
                              indicadoresEvaluacion: (p.indicadoresEvaluacion || []).map((x, i) => i === idx ? { ...x, texto: e.target.value } : x),
                            }))}
                            placeholder="Verbo observable + contenido + condición…"
                            rows={2}
                            className="flex-1 text-[12px] border border-border rounded-md px-2.5 py-1.5 bg-background resize-y"
                          />
                          <button
                            type="button"
                            onClick={() => setActividad(p => ({
                              ...p,
                              indicadoresEvaluacion: (p.indicadoresEvaluacion || []).filter((_, i) => i !== idx),
                            }))}
                            className="text-muted-foreground hover:text-red-600 p-1"
                            title="Eliminar indicador"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))
                    )}
                    <button
                      type="button"
                      onClick={() => setActividad(p => ({
                        ...p,
                        indicadoresEvaluacion: [...(p.indicadoresEvaluacion || []), { dimension: "saber_hacer", texto: "" }],
                      }))}
                      className="self-start text-[11px] font-bold text-primary border border-primary rounded-full px-3 py-1 hover:bg-pink-light transition-colors"
                    >
                      + Agregar indicador
                    </button>
                  </div>
                )}
              </div>

              {/* ── Actividad de evaluación formativa ── */}
              <div className="mb-3 bg-card border border-border rounded-[12px]">
                <button
                  type="button"
                  onClick={() => setOpenActEval(v => !v)}
                  className="w-full flex items-center justify-between px-4 py-2.5 text-left hover:bg-background transition-colors rounded-[12px]"
                >
                  <div className="flex items-center gap-2">
                    <Clipboard className="w-3.5 h-3.5 text-emerald-600" />
                    <span className="text-[12px] font-bold">Actividad de evaluación formativa</span>
                    {actividad.actividadEvaluacion && (
                      <span className="text-[10px] text-muted-foreground bg-background border border-border rounded-full px-2 py-0.5">
                        ✓
                      </span>
                    )}
                  </div>
                  {openActEval ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                </button>
                {openActEval && (
                  <div className="px-4 pb-3 pt-1">
                    <p className="text-[10px] text-muted-foreground mb-1.5">Alineada al objetivo y a los indicadores (MBE 4.1, 4.2, 9.2).</p>
                    <RichArea
                      value={actividad.actividadEvaluacion || ""}
                      onChange={v => setActividad(p => ({ ...p, actividadEvaluacion: v }))}
                      placeholder="Describe la actividad de evaluación formativa y cómo recogerás evidencia…"
                      rows={5}
                    />
                  </div>
                )}
              </div>
            </div>

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
                          seleccionadosIds={actividad.indicadoresPorOa?.[oa.id]}
                          onToggleIndicador={(indId) => {
                            setActividad(p => {
                              // Primera interacción: sembrar con "todos marcados" (indicadores seleccionados de la unidad).
                              const current = p.indicadoresPorOa?.[oa.id]
                                ?? (oa.indicadores || []).filter(i => i.seleccionado).map(i => i.id)
                              const next = current.includes(indId)
                                ? current.filter(x => x !== indId)
                                : [...current, indId]
                              return {
                                ...p,
                                indicadoresPorOa: { ...(p.indicadoresPorOa || {}), [oa.id]: next },
                              }
                            })
                          }}
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
                      <div className="flex flex-col gap-4">
                        {/* Memoria pedagógica detallada — versión RICA generada por la IA con MBE/Bloom/estrategias.
                            Se mantiene aquí como referencia para el docente; no se exporta al DOCX (que usa la simple). */}
                        <div className="rounded-xl border border-violet-100 bg-violet-50/40 p-3">
                          <p className="text-[11px] text-violet-700 font-semibold leading-snug">
                            Memoria pedagógica detallada
                          </p>
                          <p className="text-[10.5px] text-muted-foreground mt-0.5 leading-snug">
                            Versión rica con MBE, Bloom y estrategias. Se guarda como respaldo de tu diseño; el DOCX exporta la versión narrativa simple del tab Desarrollo.
                          </p>
                        </div>

                        <details className="rounded-[10px] border border-border bg-background p-3 group" open>
                          <summary className="flex items-center justify-between cursor-pointer text-[12px] font-bold text-foreground select-none">
                            <span className="flex items-center gap-1.5"><Sparkles className="w-3.5 h-3.5 text-violet-500" /> Inicio detallado</span>
                            <ChevronDown className="w-3.5 h-3.5 text-muted-foreground transition-transform group-open:rotate-180" />
                          </summary>
                          <div className="mt-2.5">
                            <RichArea
                              value={actividad.inicioDetallado || ""}
                              onChange={v => setActividad(p => ({ ...p, inicioDetallado: v }))}
                              placeholder="Versión rica del inicio (MBE, Bloom, estrategias)…"
                              rows={6}
                            />
                          </div>
                        </details>

                        <details className="rounded-[10px] border border-border bg-background p-3 group">
                          <summary className="flex items-center justify-between cursor-pointer text-[12px] font-bold text-foreground select-none">
                            <span className="flex items-center gap-1.5"><Sparkles className="w-3.5 h-3.5 text-violet-500" /> Desarrollo detallado</span>
                            <ChevronDown className="w-3.5 h-3.5 text-muted-foreground transition-transform group-open:rotate-180" />
                          </summary>
                          <div className="mt-2.5">
                            <RichArea
                              value={actividad.desarrolloDetallado || ""}
                              onChange={v => setActividad(p => ({ ...p, desarrolloDetallado: v }))}
                              placeholder="Versión rica del desarrollo (actividades, tiempos, estrategias)…"
                              rows={12}
                            />
                          </div>
                        </details>

                        <details className="rounded-[10px] border border-border bg-background p-3 group">
                          <summary className="flex items-center justify-between cursor-pointer text-[12px] font-bold text-foreground select-none">
                            <span className="flex items-center gap-1.5"><Sparkles className="w-3.5 h-3.5 text-violet-500" /> Cierre detallado</span>
                            <ChevronDown className="w-3.5 h-3.5 text-muted-foreground transition-transform group-open:rotate-180" />
                          </summary>
                          <div className="mt-2.5">
                            <RichArea
                              value={actividad.cierreDetallado || ""}
                              onChange={v => setActividad(p => ({ ...p, cierreDetallado: v }))}
                              placeholder="Versión rica del cierre (síntesis, metacognición)…"
                              rows={6}
                            />
                          </div>
                        </details>

                        {/* Adecuaciones DUA/PIE — espacio para la educadora diferencial. */}
                        <div className="border-t border-border pt-4 mt-1">
                          <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide mb-1">DUA / PIE</p>
                          <p className="text-[11px] text-muted-foreground mb-2 leading-snug">
                            Espacio para que la educadora diferencial registre las adecuaciones curriculares de esta sesión.
                          </p>
                          <RichArea value={actividad.adecuacion || ""} onChange={v => setActividad(p => ({ ...p, adecuacion: v }))} placeholder="Redactar adecuaciones curriculares…" rows={8} />
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
                                {(item.criterios_proceso?.length ?? 0) > 0 && (
                                  <div className="mt-3">
                                    <p className="text-[11px] font-semibold text-foreground mb-1">Criterios de proceso</p>
                                    <ul className="list-disc pl-4 text-[12px] text-muted-foreground space-y-1">
                                      {item.criterios_proceso?.map((criterio, index) => <li key={index}>{criterio}</li>)}
                                    </ul>
                                  </div>
                                )}
                                {(item.criterios_presentacion?.length ?? 0) > 0 && (
                                  <div className="mt-3">
                                    <p className="text-[11px] font-semibold text-foreground mb-1">Criterios de presentacion</p>
                                    <ul className="list-disc pl-4 text-[12px] text-muted-foreground space-y-1">
                                      {item.criterios_presentacion?.map((criterio, index) => <li key={index}>{criterio}</li>)}
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
              <div className="flex items-center justify-between px-7 py-5 border-b border-border flex-shrink-0">
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
              style={{ width: copilotWidth }}
              className={cn(
                "fixed top-0 right-0 z-[699] flex h-screen flex-col border-l border-slate-200/80 bg-white shadow-[-12px_0_40px_rgba(15,23,42,0.07)]",
                !isResizing && "transition-[width] duration-300"
              )}
            >
              {/* Resizer */}
              <div
                className="absolute left-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-purple-400/30 bg-transparent z-[700] transition-colors"
                onMouseDown={() => setIsResizing(true)}
              />

              {/* Header */}
              <div className="flex-shrink-0 px-4 py-3.5 border-b border-slate-100 flex items-center justify-between bg-white">
                <div className="flex items-center gap-2.5">
                  <div className={cn(
                    "grid h-8 w-8 place-items-center rounded-lg text-white shadow-sm",
                    copilotTab === "ia"
                      ? "bg-gradient-to-br from-violet-500 to-fuchsia-500"
                      : "bg-gradient-to-br from-amber-500 to-orange-500"
                  )}>
                    {copilotTab === "ia"
                      ? <Sparkles className="h-3.5 w-3.5" />
                      : <NotebookText className="h-3.5 w-3.5" />}
                  </div>
                  <div>
                    <p className="text-[13px] font-extrabold text-slate-900 leading-none">
                      {copilotTab === "ia" ? "Copiloto IA" : "NotebookLM"}
                    </p>
                    <p className="text-[10px] text-slate-400 mt-0.5">
                      {copilotTab === "ia"
                        ? `${getProviderMeta(aiConfig.provider).label} · ${aiConfig.model}`
                        : "Fuentes ancladas · Gratis"}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  {copilotTab === "ia" && (
                    <button
                      onClick={() => setShowAiSettings(v => !v)}
                      className={cn("grid h-7 w-7 place-items-center rounded-md transition-colors",
                        showAiSettings ? "bg-violet-100 text-violet-600" : "text-slate-400 hover:bg-slate-100"
                      )}
                      title="Configuración de IA"
                    >
                      <KeyRound className="h-3.5 w-3.5" />
                    </button>
                  )}
                  <button
                    onClick={() => setShowCopilot(false)}
                    className="grid h-7 w-7 place-items-center rounded-md text-slate-400 transition-colors hover:bg-red-50 hover:text-red-500"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              {/* Tabs: Copiloto IA | NotebookLM */}
              <div className="flex-shrink-0 flex border-b border-slate-100 bg-slate-50/60">
                <button
                  onClick={() => setCopilotTab("ia")}
                  className={cn(
                    "flex-1 flex items-center justify-center gap-1.5 py-2 text-[11px] font-bold transition-colors",
                    copilotTab === "ia"
                      ? "text-violet-700 bg-white border-b-2 border-violet-600"
                      : "text-slate-500 hover:text-slate-700"
                  )}
                >
                  <Sparkles className="h-3 w-3" /> Copiloto IA
                </button>
                <button
                  onClick={() => {
                    setCopilotTab("notebooklm")
                    if (nbSnapshots.length === 0) handleCargarSnapshots()
                  }}
                  className={cn(
                    "flex-1 flex items-center justify-center gap-1.5 py-2 text-[11px] font-bold transition-colors",
                    copilotTab === "notebooklm"
                      ? "text-amber-700 bg-white border-b-2 border-amber-600"
                      : "text-slate-500 hover:text-slate-700"
                  )}
                >
                  <NotebookText className="h-3 w-3" /> NotebookLM
                </button>
              </div>

              {/* Panel de configuración (colapsable) */}
              {copilotTab === "ia" && showAiSettings && (
                <div className="flex-shrink-0 border-b border-slate-100 bg-slate-50 px-4 py-4 space-y-3">
                  <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Tu IA personal (BYOK)</p>
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
                  <button
                    onClick={() => saveAiConfig(aiConfig)}
                    className="w-full rounded-lg bg-violet-600 px-3 py-2 text-[12px] font-bold text-white hover:bg-violet-700 transition-colors"
                  >
                    Guardar configuración
                  </button>
                </div>
              )}

              {copilotTab === "ia" && (<>
              {/* Área de mensajes */}
              <div className="flex-1 overflow-y-auto px-4 py-4 bg-slate-50/50 space-y-3">
                {chatHistory.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-center py-8">
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
                        <div className="mt-5 flex flex-col items-center gap-2">
                          <button
                            onClick={handleGenerarClase}
                            disabled={isGeneratingAI}
                            className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-violet-500 to-fuchsia-500 px-5 py-2.5 text-[13px] font-bold text-white shadow-md shadow-violet-200 transition-all hover:opacity-90 disabled:opacity-60"
                          >
                            {isGeneratingAI ? (
                              <>
                                <Loader2 className="h-4 w-4 animate-spin" />
                                {generationPhase === "simple"
                                  ? "Destilando formato final…"
                                  : "Generando propuesta…"}
                              </>
                            ) : (
                              <><Sparkles className="h-4 w-4" /> Generar primera propuesta</>
                            )}
                          </button>
                          {isGeneratingAI && (
                            <button
                              onClick={handleCancelGenerar}
                              className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-[11px] font-semibold text-slate-600 hover:bg-slate-50"
                            >
                              <X className="h-3 w-3" /> Cancelar
                            </button>
                          )}
                        </div>
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
                  <div className="flex gap-2">
                    <button
                      onClick={handleAplicarCambios}
                      disabled={isApplying}
                      className="flex-1 flex items-center justify-center gap-2 rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 text-[12px] font-bold text-violet-700 transition-colors hover:bg-violet-100 disabled:opacity-60"
                    >
                      {isApplying ? (
                        <>
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          {generationPhase === "simple"
                            ? "Destilando formato final…"
                            : "Aplicando cambios…"}
                        </>
                      ) : (
                        <><Wand2 className="h-3.5 w-3.5" /> Aplicar cambios a la clase</>
                      )}
                    </button>
                    {isApplying && (
                      <button
                        onClick={handleCancelAplicar}
                        className="flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-2 text-[11px] font-semibold text-slate-600 hover:bg-slate-50"
                      >
                        <X className="h-3 w-3" /> Cancelar
                      </button>
                    )}
                    {!isApplying && snapshot && (
                      <button
                        onClick={handleDeshacer}
                        className="flex items-center gap-1.5 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-[11px] font-semibold text-amber-700 hover:bg-amber-100"
                        title="Restaurar clase al estado previo a los últimos cambios"
                      >
                        ↩ Deshacer
                      </button>
                    )}
                  </div>
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
                    onClick={handleSendChat}
                    disabled={!chatInput.trim() || isChatLoading}
                    className="flex-shrink-0 grid h-10 w-10 place-items-center rounded-xl bg-violet-600 text-white shadow-sm transition-all hover:bg-violet-700 disabled:opacity-40"
                  >
                    <Send className="h-4 w-4" />
                  </button>
                </div>
              </div>
              </>)}

              {/* ─── Panel NotebookLM ────────────────────────────────────── */}
              {copilotTab === "notebooklm" && (
                <div className="flex-1 overflow-y-auto bg-slate-50/50">
                  {/* Intro + botón Abrir */}
                  <div className="px-4 py-4 bg-gradient-to-br from-amber-50 to-orange-50 border-b border-amber-100">
                    <p className="text-[12px] text-slate-700 leading-relaxed">
                      Usa <b>NotebookLM</b> con tus fuentes (PDFs Mineduc, textos escolares)
                      para generar rúbricas o análisis. Luego pega el resultado aquí (o sube
                      un PDF/TXT) y la IA lo estructura en la clase automáticamente.
                    </p>
                    <p className="mt-1.5 text-[10.5px] text-slate-500 italic">
                      💡 Tip: puedes dejar NotebookLM abierto en otra pestaña y alternar con split-screen.
                    </p>
                    <div className="mt-3 flex gap-2">
                      <button
                        onClick={handleOpenNotebookLm}
                        className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 px-3 py-2.5 text-[12px] font-bold text-white shadow-sm hover:opacity-90 transition-opacity"
                      >
                        <ExternalLink className="h-3.5 w-3.5" /> Abrir NotebookLM
                      </button>
                      <button
                        onClick={handleCopiarContexto}
                        className="flex items-center justify-center gap-1.5 rounded-xl border border-amber-300 bg-white px-3 py-2.5 text-[11px] font-bold text-amber-700 hover:bg-amber-50 transition-colors"
                        title={nbFormatoGuiado
                          ? "Copia contexto + instrucciones de formato guiado"
                          : "Copia OAs + unidad + nivel + habilidades/actitudes al portapapeles"}
                      >
                        <Clipboard className="h-3.5 w-3.5" /> Copiar contexto
                      </button>
                    </div>

                    {/* Toggle: Formato guiado */}
                    <label className="mt-3 flex items-start gap-2 cursor-pointer select-none rounded-lg border border-amber-200 bg-white/70 px-2.5 py-2 hover:bg-white transition-colors">
                      <input
                        type="checkbox"
                        checked={nbFormatoGuiado}
                        onChange={(e) => setNbFormatoGuiado(e.target.checked)}
                        className="mt-0.5 h-3.5 w-3.5 accent-amber-600"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <Zap className="h-3 w-3 text-amber-600" />
                          <span className="text-[11px] font-bold text-amber-900">Formato guiado</span>
                        </div>
                        <p className="text-[10px] text-slate-600 leading-tight mt-0.5">
                          Pide a NotebookLM responder con etiquetas [INICIO]...[/INICIO] para
                          parsear su respuesta automáticamente (menos tokens, más precisión).
                        </p>
                      </div>
                    </label>
                  </div>

                  {/* Biblioteca de snapshots (colapsable) */}
                  <div className="border-b border-slate-100">
                    <button
                      onClick={() => {
                        setShowSnapshotsLibrary(v => !v)
                        if (!showSnapshotsLibrary && nbSnapshots.length === 0) handleCargarSnapshots()
                      }}
                      className="w-full flex items-center justify-between px-4 py-2.5 text-[11px] font-bold text-slate-600 hover:bg-slate-100 transition-colors"
                    >
                      <span className="flex items-center gap-1.5">
                        <Library className="h-3.5 w-3.5" />
                        Biblioteca de snapshots {nbSnapshots.length > 0 && `(${nbSnapshots.length})`}
                      </span>
                      {showSnapshotsLibrary
                        ? <ChevronUp className="h-3.5 w-3.5" />
                        : <ChevronDown className="h-3.5 w-3.5" />}
                    </button>
                    {showSnapshotsLibrary && (
                      <div className="px-3 pb-3 space-y-1.5">
                        {loadingSnapshots ? (
                          <p className="text-[11px] text-slate-400 text-center py-3">Cargando…</p>
                        ) : nbSnapshots.length === 0 ? (
                          <p className="text-[11px] text-slate-400 text-center py-3">
                            Aún no tienes snapshots guardados.
                          </p>
                        ) : (
                          nbSnapshots.map(snap => (
                            <div key={snap.id} className="flex items-start gap-2 rounded-lg bg-white border border-slate-200 px-2.5 py-2">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="inline-flex rounded bg-amber-100 text-amber-700 px-1.5 py-0.5 text-[9px] font-bold">
                                    {snap.codigo}
                                  </span>
                                  <span className="text-[10px] text-slate-400">{snap.tipo}</span>
                                  {snap.textoEstructurado && (
                                    <span className="inline-flex rounded bg-emerald-100 text-emerald-700 px-1.5 py-0.5 text-[9px] font-bold" title="Incluye resultado IA cacheado — aplica sin consumir tokens">
                                      ⚡ caché
                                    </span>
                                  )}
                                </div>
                                <p className="text-[12px] font-semibold text-slate-800 mt-0.5 truncate">{snap.titulo}</p>
                                {snap.vecesUsado > 0 && (
                                  <p className="text-[9px] text-slate-400 mt-0.5">Usado {snap.vecesUsado} vez{snap.vecesUsado !== 1 ? "es" : ""}</p>
                                )}
                              </div>
                              <div className="flex gap-1">
                                <button
                                  onClick={() => handleAplicarSnapshot(snap)}
                                  className="rounded bg-amber-600 text-white px-2 py-1 text-[10px] font-bold hover:bg-amber-700"
                                  title="Cargar en el editor"
                                >
                                  Cargar
                                </button>
                                <button
                                  onClick={() => handleEliminarSnapshot(snap.id)}
                                  className="rounded text-slate-400 hover:text-red-500 hover:bg-red-50 px-1"
                                  title="Eliminar"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </div>

                  {/* Tipo de contenido */}
                  <div className="px-4 pt-3">
                    <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5 block">
                      Tipo de contenido
                    </label>
                    <select
                      value={nbTipo}
                      onChange={e => setNbTipo(e.target.value as NotebookLmTipo)}
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-[12px] font-semibold outline-none focus:border-amber-400"
                    >
                      <option value="clase_completa">Clase completa (inicio/desarrollo/cierre + artefactos)</option>
                      <option value="rubrica">Rúbrica de evaluación</option>
                      <option value="analisis_bloom">Análisis Bloom</option>
                      <option value="indicadores">Indicadores de evaluación</option>
                      <option value="evaluacion">Actividad de evaluación</option>
                      <option value="otro">Otro</option>
                    </select>
                  </div>

                  {/* Textarea + drag & drop + upload */}
                  <div className="px-4 pt-3">
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                        Pega o sube el resultado de NotebookLM
                      </label>
                      <button
                        type="button"
                        onClick={() => nbFileInputRef.current?.click()}
                        disabled={nbUploadingFile}
                        className="flex items-center gap-1 rounded-md border border-amber-300 bg-white px-2 py-0.5 text-[10px] font-bold text-amber-700 hover:bg-amber-50 disabled:opacity-50"
                        title="Subir PDF, TXT o Markdown"
                      >
                        {nbUploadingFile ? (
                          <><Loader2 className="h-3 w-3 animate-spin" /> Leyendo…</>
                        ) : (
                          <><FileUp className="h-3 w-3" /> Subir archivo</>
                        )}
                      </button>
                    </div>

                    <input
                      ref={nbFileInputRef}
                      type="file"
                      accept=".pdf,.txt,.md,.markdown,application/pdf,text/plain,text/markdown"
                      className="hidden"
                      onChange={handleNbFileInput}
                    />

                    <div
                      onDrop={handleNbDrop}
                      onDragOver={handleNbDragOver}
                      onDragLeave={handleNbDragLeave}
                      className={cn(
                        "relative rounded-lg border transition-all",
                        nbDragOver
                          ? "border-amber-500 ring-2 ring-amber-200 bg-amber-50/40"
                          : "border-slate-200 bg-white"
                      )}
                    >
                      <textarea
                        value={nbTexto}
                        onChange={e => {
                          const v = e.target.value
                          setNbTexto(v)
                          if (lastStructuredData) setLastStructuredData(null)
                          runAutoDetect(v)
                        }}
                        placeholder={nbDragOver
                          ? "Suelta aquí tu archivo (.pdf, .txt, .md)…"
                          : "Pega aquí el texto de NotebookLM, o arrastra un archivo .pdf / .txt / .md"}
                        rows={10}
                        className="w-full resize-y bg-transparent px-3 py-2.5 text-[12px] outline-none font-mono rounded-lg"
                      />
                      {nbDragOver && (
                        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-amber-100/70 rounded-lg">
                          <div className="flex flex-col items-center gap-1 text-amber-800">
                            <Upload className="h-6 w-6" />
                            <span className="text-[13px] font-bold">Suelta el archivo aquí</span>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Fila de indicadores: caracteres + delimitadores detectados */}
                    <div className="flex items-center flex-wrap gap-2 mt-1">
                      <p className={cn(
                        "text-[10px]",
                        nbTexto.trim().length < NB_MIN_CHARS ? "text-red-500" : "text-slate-400"
                      )}>
                        {nbTexto.length.toLocaleString("es-CL")} caracteres
                        {nbTexto.trim().length < NB_MIN_CHARS && ` · mínimo ${NB_MIN_CHARS}`}
                      </p>
                      {nbTieneDelimitadores && (
                        <span
                          className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[9.5px] font-bold text-emerald-700"
                          title="Se detectaron etiquetas [INICIO]...[/INICIO] u otras. Estructuración más precisa y con menos tokens."
                        >
                          <Zap className="h-2.5 w-2.5" /> formato guiado detectado
                        </span>
                      )}
                    </div>

                    {/* Sugerencia de tipo (auto-detectado) */}
                    {nbTipoSugerido && (
                      <div className="mt-2 flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-2">
                        <Lightbulb className="h-3.5 w-3.5 text-blue-600 mt-0.5 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-[11px] text-blue-900 font-semibold leading-tight">
                            Parece ser {tipoLabel(nbTipoSugerido)}. ¿Cambiar tipo?
                          </p>
                        </div>
                        <div className="flex gap-1">
                          <button
                            onClick={handleAplicarTipoSugerido}
                            className="rounded bg-blue-600 text-white px-2 py-0.5 text-[10px] font-bold hover:bg-blue-700"
                          >
                            Sí
                          </button>
                          <button
                            onClick={() => setNbTipoSugerido(null)}
                            className="rounded text-blue-600 hover:bg-blue-100 px-1.5 py-0.5 text-[10px]"
                          >
                            No
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Título del snapshot (para guardarlo) */}
                  <div className="px-4 pt-2 pb-4">
                    <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5 block">
                      Título (para guardar en biblioteca)
                    </label>
                    <input
                      value={nbTitulo}
                      onChange={e => setNbTitulo(e.target.value)}
                      placeholder="Ej: Rúbrica apreciación musical 4°B"
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-[12px] outline-none focus:border-amber-400"
                    />
                  </div>
                </div>
              )}

              {/* Footer NotebookLM: botones de acción */}
              {copilotTab === "notebooklm" && (
                <div className="flex-shrink-0 bg-white border-t border-slate-100 px-3 py-3 space-y-2">
                  {/* Botón de caché (solo si hay textoEstructurado cacheado disponible) */}
                  {lastStructuredData && !isStructuring && (
                    <button
                      onClick={handleAplicarDesdeCache}
                      className="w-full flex items-center justify-center gap-2 rounded-xl border-2 border-emerald-400 bg-emerald-50 px-3 py-2 text-[12px] font-bold text-emerald-700 hover:bg-emerald-100 transition-colors"
                      title="Aplicar el resultado IA cacheado — sin consumir tokens"
                    >
                      ⚡ Aplicar desde caché (0 tokens)
                    </button>
                  )}
                  <div className="flex gap-2">
                    <button
                      onClick={handleEstructurarNotebookLm}
                      disabled={nbTexto.trim().length < NB_MIN_CHARS || isStructuring}
                      className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 px-3 py-2.5 text-[12px] font-bold text-white shadow-sm hover:opacity-90 disabled:opacity-50 transition-opacity"
                    >
                      {isStructuring ? (
                        <>
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          {generationPhase === "simple" ? "Destilando…" : "Estructurando…"}
                        </>
                      ) : (
                        <><Wand2 className="h-3.5 w-3.5" /> Estructurar y aplicar a la clase</>
                      )}
                    </button>
                    {isStructuring && (
                      <button
                        onClick={handleCancelEstructurar}
                        className="flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-2 text-[11px] font-semibold text-slate-600 hover:bg-slate-50"
                      >
                        <X className="h-3 w-3" /> Cancelar
                      </button>
                    )}
                    {!isStructuring && snapshot && (
                      <button
                        onClick={handleDeshacer}
                        className="flex items-center gap-1.5 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-[11px] font-semibold text-amber-700 hover:bg-amber-100"
                        title="Restaurar clase al estado previo"
                      >
                        ↩ Deshacer
                      </button>
                    )}
                  </div>
                  <button
                    onClick={handleGuardarSnapshotActual}
                    disabled={!nbTexto.trim()}
                    className="w-full flex items-center justify-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-bold text-amber-700 transition-colors hover:bg-amber-100 disabled:opacity-50"
                  >
                    <Bookmark className="h-3 w-3" /> Guardar como snapshot reutilizable
                  </button>
                </div>
              )}
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
