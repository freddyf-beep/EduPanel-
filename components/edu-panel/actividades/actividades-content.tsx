"use client"

import { useState, useEffect, Suspense, useRef } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import {
  ChevronLeft, Bookmark, Loader2, Check, ArrowRight,
  ChevronDown, ChevronRight, Plus, X, Target,
  Layers, Clipboard, FileText, Monitor, Package,
  RefreshCw, BookOpen, Calendar, Sparkles, Mic, MicOff,
  PanelRightOpen, SlidersHorizontal, RotateCcw, Save,
  BrainCircuit, Bot, Copy, PencilLine, Blocks
} from "lucide-react"
import { cn } from "@/lib/utils"
import {
  guardarActividadClase, cargarActividadClase,
  cargarCronogramaUnidad, cargarVerUnidad,
  guardarLibroClases, cargarLibroClases,
  getUnidadCompleta, initOAs, mergeOAs, cargarBancoActividades
} from "@/lib/curriculo"
import type { ActividadClase, OAEditado, ClaseCronograma, ActividadSugerida, EjemploEvaluacion } from "@/lib/curriculo"
import { ASIGNATURA, UNIT_COLORS, buildUrl } from "@/lib/shared"
import { cargarNivelMapping, resolveNivel } from "@/lib/nivel-mapping"
import {
  AI_PROVIDER_OPTIONS,
  DEFAULT_AI_CONFIG,
  PROMPT_MODE_LABELS,
  buildCopilotPrompt,
  getProviderMeta,
  htmlToPlainText,
  normalizeAiConfig,
  type CopilotMode,
  type LessonRequestBody,
} from "@/lib/ai/copilot"
import { MessageSquare, Settings2, Wand2 } from "lucide-react"

import dynamic from 'next/dynamic'
const ReactQuill = dynamic(() => import('react-quill-new'), { ssr: false })

const ESTADOS = [
  { key: "no_planificada", label: "No planificada", cls: "bg-background border border-border text-muted-foreground" },
  { key: "planificada",    label: "Planificada",    cls: "bg-blue-50 border border-blue-200 text-blue-700" },
  { key: "realizada",      label: "Realizada",      cls: "bg-green-50 border border-green-200 text-green-700" },
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
      <style dangerouslySetInnerHTML={{__html: `
        .edu-quill .ql-toolbar { border: none; border-bottom: 1.5px solid hsl(var(--border)); background: hsl(var(--muted)/0.3); border-radius: 10px 10px 0 0; }
        .edu-quill .ql-container { border: none !important; font-size: 13px; font-family: inherit; }
        .edu-quill .ql-editor { min-height: ${rows * 20}px; line-height: 1.6; }
        .edu-quill .ql-editor p { margin-bottom: 10px; }
      `}} />
    </div>
  )
}

// ─── OA Card con indicadores desplegables ─────────────────────────────────────
function OACard({ oa, color, onRemove }: {
  oa: OAEditado; color: string; onRemove?: () => void
}) {
  const [open, setOpen] = useState(false)
  const indicadoresSelec = oa.indicadores?.filter(i => i.seleccionado) || []

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
              {indicadoresSelec.length} indicador{indicadoresSelec.length !== 1 ? "es" : ""}
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
          {indicadoresSelec.map(ind => (
            <div key={ind.id} className="flex items-start gap-2 text-[11px]">
              <span className="font-semibold flex-shrink-0" style={{ color }}>
                {oa.esPropio ? "Propio" : `OA ${oa.numero}`}
              </span>
              <span className="text-muted-foreground leading-snug">{ind.texto}</span>
            </div>
          ))}
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
  const searchParams = useSearchParams()
  const cursoParam   = cursoOverride  || searchParams.get("curso")   || "1° A"
  const unidadParam  = unidadOverride || searchParams.get("unitIdLocal") || searchParams.get("unidad") || "unidad_1"
  const unidadCurricularParam = unidadCurricularOverride || searchParams.get("unidad") || unidadParam
  const claseParam   = claseOverride  || parseInt(searchParams.get("clase") || "1")

  const [clases, setClases]           = useState<ClaseCronograma[]>([])
  const [oasCurriculo, setOasCurriculo] = useState<OAEditado[]>([])
  const [selectedClase, setSelectedClase] = useState(claseParam)
  const [actividad, setActividad]     = useState<Partial<ActividadClase>>({
    estado: "no_planificada", inicio: "", desarrollo: "", cierre: "",
    adecuacion: "", objetivo: "", oaIds: [], habilidades: [], actitudes: [], materiales: [], tics: [], sincronizada: false
  })
  const [unidadData, setUnidadData]   = useState<any>(null)
  const [unidadDataStatus, setUnidadDataStatus] = useState<string | null>(null)
  const [unidadContextoDocente, setUnidadContextoDocente] = useState("")
  const [unidadObjetivoDocente, setUnidadObjetivoDocente] = useState("")
  const [dispHabilidades, setDispHabilidades] = useState<string[]>([])
  const [dispActitudes, setDispActitudes] = useState<string[]>([])
  const [copilotWidth, setCopilotWidth] = useState(400)
  const [isResizing, setIsResizing]   = useState(false)
  const [loading, setLoading]         = useState(true)
  const [saving, setSaving]           = useState(false)
  const [saveStatus, setSaveStatus]   = useState<"idle"|"saving_silent"|"saved"|"error"|"synced">("idle")
  const [tabDerecho, setTabDerecho]   = useState<"desarrollo"|"adecuacion">("desarrollo")
  const [tabRecursos, setTabRecursos] = useState<"materiales"|"tics">("materiales")
  const [tabSugerencias, setTabSugerencias] = useState<"actividades"|"evaluaciones">("actividades")
  const [nuevoMaterial, setNuevoMaterial] = useState("")
  const [nuevoTic, setNuevoTic]       = useState("")
  const [showEstadoMenu, setShowEstadoMenu] = useState(false)
  const [showBancoModal, setShowBancoModal] = useState(false)
  const [bancoActividades, setBancoActividades] = useState<ActividadClase[]>([])
  const [loadingBanco, setLoadingBanco] = useState(false)
  const [isGeneratingAI, setIsGeneratingAI] = useState(false)
  
  // Copiloto IA State
  const [showCopilot, setShowCopilot] = useState(false)
  const [isClassesRailCollapsed, setIsClassesRailCollapsed] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [copilotTab, setCopilotTab] = useState<"chat"|"prompt">("chat")
  const [promptMode, setPromptMode] = useState<CopilotMode>("crear_inicial")
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([])
  const [mensajeLocal, setMensajeLocal] = useState("")
  const [isListening, setIsListening] = useState(false)
  const [contextoPrevioIA, setContextoPrevioIA] = useState("")
  
  // BYOK (Bring Your Own Key) Config
  const [aiConfig, setAiConfig] = useState<any>(DEFAULT_AI_CONFIG)
  const [savedAiConfig, setSavedAiConfig] = useState<any>(DEFAULT_AI_CONFIG)

  useEffect(() => {
    const saved = localStorage.getItem("eduAiConfig")
    if (saved) {
      try {
        const normalized = normalizeAiConfig(JSON.parse(saved))
        setAiConfig(normalized)
        setSavedAiConfig(normalized)
      } catch (e) {
        console.error(e)
      }
    }
  }, [])

  const saveAiConfig = (configToSave = aiConfig, legacyToken?: string, legacyPrompt?: string) => {
    const legacyConfig = typeof configToSave === "string"
      ? {
          ...aiConfig,
          provider: configToSave,
          token: legacyToken || "",
          promptExtra: legacyPrompt || aiConfig.promptExtra,
        }
      : configToSave

    const fresh = normalizeAiConfig(legacyConfig)
    setAiConfig(fresh)
    setSavedAiConfig(fresh)
    localStorage.setItem("eduAiConfig", JSON.stringify(fresh))
    setShowSettings(false)
  }

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return
      const newWidth = document.body.clientWidth - e.clientX
      if (newWidth > 300 && newWidth < 800) setCopilotWidth(newWidth)
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
  
  // Ref para guardar la instancia de recognition y poder apagarla
  const recognitionRef = useRef<any>(null)

  const toggleListen = () => {
    if (isListening) {
      if (recognitionRef.current) recognitionRef.current.stop()
      setIsListening(false)
      return
    }

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SpeechRecognition) {
      alert("Tu navegador no soporta el dictado por voz (se recomienda Google Chrome).")
      return
    }

    const recognition = new SpeechRecognition()
    recognition.lang = "es-CL"
    recognition.continuous = true
    recognition.interimResults = true

    recognition.onresult = (event: any) => {
      let currentResult = ""
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          currentResult += event.results[i][0].transcript + " "
        }
      }
      if (currentResult) {
        setMensajeLocal(prev => (prev + " " + currentResult).trim())
      }
    }

    recognition.onerror = (event: any) => {
      setIsListening(false)
      if (event.error === 'not-allowed') {
        alert("El navegador bloqueó el micrófono. Si estás viendo un aviso de 'Sitio No Seguro', por favor entra explícitamente a http://localhost:3000 para que funcione en tu entorno local.")
      } else {
        console.error("Error de micrófono:", event.error)
      }
    }
    recognition.onend = () => setIsListening(false)

    recognition.start()
    recognitionRef.current = recognition
    setIsListening(true)
  }

  // Función unificada para Generar o Refinar o Charlar
  const buildUnidadPayload = () => {
    if (!unidadData && !unidadContextoDocente.trim() && !unidadObjetivoDocente.trim()) {
      return null
    }

    return {
      nombre_unidad: unidadData?.nombre_unidad || "",
      proposito: unidadData?.proposito || "",
      conocimientos: unidadData?.conocimientos || [],
      conocimientos_previos: unidadData?.conocimientos_previos || [],
      habilidades: unidadData?.habilidades || [],
      actitudes: unidadData?.actitudes || [],
      adecuaciones_dua: unidadData?.adecuaciones_dua || "",
      contexto_docente: unidadContextoDocente,
      objetivo_docente: unidadObjetivoDocente,
    }
  }

  const buildConversationHistory = (modo: CopilotMode, messageForConversation = "") => {
    const history = chatHistory
      .filter((msg) => msg.text.trim())
      .map((msg) => ({
        role: msg.role,
        text: msg.text,
      }))

    if ((modo === "chat" || modo === "edicion") && messageForConversation.trim()) {
      history.push({
        role: "user",
        text: messageForConversation.trim(),
      })
    }

    return history
  }

  const buildCopilotPayload = (modo: CopilotMode, customMessage: string, messageForConversation = customMessage): LessonRequestBody => {
    const oasSeleccionados = oasCurriculo.filter(oa => (actividad.oaIds || []).includes(oa.id))
    const payloadOas = oasSeleccionados.map(oa => ({
      numero: oa.numero,
      descripcion: oa.descripcion,
      indicadores: (oa.indicadores || []).filter(i => i.seleccionado).map(i => ({ texto: i.texto })),
    }))

    const payload: LessonRequestBody = {
      curso: cursoParam,
      asignatura: ASIGNATURA,
      numeroClase: selectedClase,
      oas: payloadOas,
      habilidades: actividad.habilidades || [],
      actitudes: actividad.actitudes || [],
      contextoAnterior: contextoPrevioIA,
      instruccionesAdicionales: customMessage.trim(),
      objetivoClase: stripRichText(actividad.objetivo || ""),
      modelProvider: aiConfig.provider,
      customToken: aiConfig.token,
      customPrompt: aiConfig.promptExtra,
      customModel: aiConfig.model,
      customEndpoint: aiConfig.endpoint,
      promptOverride: aiConfig.promptOverrides[modo],
      modo,
      unidad: buildUnidadPayload(),
      chatHistory: buildConversationHistory(modo, messageForConversation),
    }

    if (modo !== "crear_inicial") {
      payload.claseActual = actividad
    }

    return payload
  }

  const getEffectivePrompt = (modo: CopilotMode, customMessage = "") => (
    buildCopilotPrompt(buildCopilotPayload(modo, customMessage), modo)
  )

  const ejecutarAI = async (modo: CopilotMode, customMessage: string) => {
    const trimmedMessage = customMessage.trim()
    const hasUserConversation = chatHistory.some((msg) => msg.role === "user" && msg.text.trim())
    const latestUserInstruction = [...chatHistory]
      .reverse()
      .find((msg) => msg.role === "user" && msg.text.trim())
      ?.text
      ?.trim() || ""

    if (modo === "chat" && !trimmedMessage) return
    if (modo === "edicion" && !trimmedMessage && !hasUserConversation) return
    
    if (!aiConfig.token && aiConfig.provider !== "gemini") {
      alert("Para ese proveedor debes ingresar tu token personal primero.")
      setShowCopilot(true)
      setShowSettings(true)
      setCopilotTab("prompt")
      return
    }

    if (aiConfig.provider === "compatible" && !aiConfig.endpoint.trim()) {
      alert("Debes indicar la URL base del endpoint compatible.")
      setShowCopilot(true)
      setShowSettings(true)
      setCopilotTab("prompt")
      return
    }

    setIsGeneratingAI(true)
    const instructionForRequest = modo === "edicion"
      ? (trimmedMessage || latestUserInstruction || "Aplica a la clase actual las mejoras, correcciones y acuerdos conversados en este chat.")
      : trimmedMessage
    
    // Add user message to UI immediately para preguntas o edición manual
    if ((modo === "edicion" || modo === "chat") && trimmedMessage) {
      setChatHistory(p => [...p, { role: "user", text: trimmedMessage }])
    }
    setMensajeLocal("")

    try {
      const requestPayload = buildCopilotPayload(
        modo,
        instructionForRequest,
        trimmedMessage,
      )
      let contextoAnterior = ""

      if (!requestPayload.contextoAnterior && selectedClase > 1) {
        const prevClase = await cargarActividadClase(cursoParam, unidadParam, selectedClase - 1)
        if (prevClase && prevClase.desarrollo) {
          const objetivoAnterior = stripRichText(prevClase.objetivo || "")
          const desarrolloAnterior = stripRichText(prevClase.desarrollo || "")
          const cierreAnterior = stripRichText(prevClase.cierre || "")
          requestPayload.contextoAnterior = [
            `Clase anterior: ${selectedClase - 1}.`,
            objetivoAnterior ? `Objetivo: "${objetivoAnterior}".` : "",
            desarrolloAnterior ? `Desarrollo principal: ${desarrolloAnterior.substring(0, 550)}${desarrolloAnterior.length > 550 ? "..." : ""}` : "",
            cierreAnterior ? `Cierre: ${cierreAnterior.substring(0, 250)}${cierreAnterior.length > 250 ? "..." : ""}` : "",
          ].filter(Boolean).join(" ")
          contextoAnterior = `La clase anterior (${selectedClase - 1}) trató sobre: Objetivo: "${prevClase.objetivo || ''}". Desarrollo: ${prevClase.desarrollo.substring(0, 500)}...`
        }
      }
      
      const res = await fetch('/api/generar-clase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestPayload)
      })

      const data = await res.json()
      
      if (!res.ok) {
        throw new Error(data.error || "Error en la solicitud a IA")
      }

      if (data.promptUsado) {
        setAiConfig((prev: any) => ({
          ...prev,
          promptOverrides: {
            ...prev.promptOverrides,
            [modo]: data.promptUsado,
          },
        }))
      }

      if (modo === "chat") {
        setChatHistory(p => [...p, { role: "ai", text: data.respuestaChat || "No pude generar una respuesta." }])
        return
      }

      const nextActividad = {
        ...actividad,
        objetivo: data.objetivo || actividad.objetivo,
        inicio: data.inicio || actividad.inicio,
        desarrollo: data.desarrollo || actividad.desarrollo,
        cierre: data.cierre || actividad.cierre,
        materiales: data.materiales || actividad.materiales,
        tics: data.tics || actividad.tics,
        adecuacion: data.adecuacion || actividad.adecuacion,
      }

      const hasMeaningfulChanges =
        (nextActividad.objetivo || "") !== (actividad.objetivo || "") ||
        (nextActividad.inicio || "") !== (actividad.inicio || "") ||
        (nextActividad.desarrollo || "") !== (actividad.desarrollo || "") ||
        (nextActividad.cierre || "") !== (actividad.cierre || "") ||
        (nextActividad.adecuacion || "") !== (actividad.adecuacion || "") ||
        !listsEqual(nextActividad.materiales || [], actividad.materiales || []) ||
        !listsEqual(nextActividad.tics || [], actividad.tics || [])

      setActividad(nextActividad)

      if (modo === "edicion") {
        const aiMessage = data.explicacionCambios || "¡Listo! He re-escrito la clase aplicando tus peticiones. Revisa los cambios."
        setChatHistory(p => [...p, { role: "ai", text: aiMessage }])
      } else if (modo === "crear_inicial") {
        setChatHistory([{ role: "ai", text: "He generado una propuesta inicial para tu clase. ¿Gusta? Puedes pedirme en el chat que explique alguna actividad (botón 'Preguntar'), o decirme cómo mejorarla y pulsar 'Modificar Clase'." }])
      }

      if (modo === "edicion" && !hasMeaningfulChanges) {
        setChatHistory((p) => [
          ...p.slice(0, -1),
          {
            role: "ai",
            text: "Intenté aplicar el cambio, pero la respuesta volvió sin modificaciones reales sobre la clase. Reformula el pedido de forma más directa, por ejemplo: 'cambia solo el objetivo de la clase a...'.",
          },
        ])
      }

    } catch (e: any) {
      console.error(e)
      setChatHistory(p => [...p, { role: "ai", text: "❌ Lo siento, encontré un error: " + e.message }])
    } finally {
      setIsGeneratingAI(false)
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
            const dd  = String(hoy.getDate()).padStart(2,"0")
            const mm  = String(hoy.getMonth()+1).padStart(2,"0")
            const yy  = hoy.getFullYear()
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

  useEffect(() => {
    let cancelled = false

    if (selectedClase <= 1) {
      setContextoPrevioIA("")
      return
    }

    cargarActividadClase(cursoParam, unidadParam, selectedClase - 1)
      .then((prevClase) => {
        if (cancelled || !prevClase) return

        const objetivoAnterior = stripRichText(prevClase.objetivo || "")
        const desarrolloAnterior = stripRichText(prevClase.desarrollo || "")
        const cierreAnterior = stripRichText(prevClase.cierre || "")

        const resumen = [
          `Clase anterior: ${selectedClase - 1}.`,
          objetivoAnterior ? `Objetivo: "${objetivoAnterior}".` : "",
          desarrolloAnterior ? `Desarrollo principal: ${desarrolloAnterior.substring(0, 550)}${desarrolloAnterior.length > 550 ? "..." : ""}` : "",
          cierreAnterior ? `Cierre: ${cierreAnterior.substring(0, 250)}${cierreAnterior.length > 250 ? "..." : ""}` : "",
        ].filter(Boolean).join(" ")

        setContextoPrevioIA(resumen)
      })
      .catch(() => {
        if (!cancelled) setContextoPrevioIA("")
      })

    return () => {
      cancelled = true
    }
  }, [cursoParam, unidadParam, selectedClase])

  useEffect(() => {
    setChatHistory([])
    setMensajeLocal("")
    setCopilotTab("chat")
    setShowSettings(false)
  }, [cursoParam, unidadParam, selectedClase])

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

  // Validación Copiloto
  const requisitosCompletos = 
    (actividad.oaIds || []).length > 0 && 
    (actividad.habilidades || []).length > 0 && 
    (actividad.actitudes || []).length > 0 && 
    stripRichText(actividad.objetivo || "").length > 0;

  const hasExistingLessonContent = [
    stripRichText(actividad.objetivo || ""),
    stripRichText(actividad.inicio || ""),
    stripRichText(actividad.desarrollo || ""),
    stripRichText(actividad.cierre || ""),
    stripRichText(actividad.adecuacion || ""),
  ].some(Boolean) || (actividad.materiales || []).length > 0 || (actividad.tics || []).length > 0

  const showCopilotClassMode = hasExistingLessonContent || chatHistory.length > 0
  const hasUserConversation = chatHistory.some((msg) => msg.role === "user" && msg.text.trim())

  const handleOpenCopilot = () => {
    setShowSettings(false)
    setCopilotTab("chat")
    setShowCopilot(true)
  }

  const providerMeta = getProviderMeta(aiConfig.provider)
  const promptPreview = buildCopilotPrompt({ mode: promptMode, mensaje: mensajeLocal, aiConfig } as any, promptMode)
  const verUnidadParams: Record<string, string> = unidadCurricularParam !== unidadParam
    ? { curso: cursoParam, unidad: unidadCurricularParam, unitIdLocal: unidadParam }
    : { curso: cursoParam, unidad: unidadCurricularParam }
  const contentGridTemplate = isClassesRailCollapsed ? "84px minmax(0, 1fr)" : "220px minmax(0, 1fr)"
  const actividadesSugeridas = (unidadData?.actividades_sugeridas || []) as ActividadSugerida[]
  const evaluacionesSugeridas = (unidadData?.ejemplos_evaluacion || []) as EjemploEvaluacion[]

  if (loading) return (
    <div className="flex items-center justify-center h-64 gap-3 text-muted-foreground">
      <Loader2 className="w-5 h-5 animate-spin" />
      <span className="text-[14px]">Cargando actividades…</span>
    </div>
  )

  const estadoActual = ESTADOS.find(e => e.key === actividad.estado) || ESTADOS[0]

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
          {saveStatus === "error"  && <span className="text-[12px] text-red-500 font-semibold">Error al guardar</span>}
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
                            {clase.fecha.substring(0,5)}
                          </span>
                        )}
                        {oaDots.length > 0 && (
                          <div className="flex gap-1 justify-center">
                            {oaDots.slice(0,3).map((oa) => (
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
                              {clase.fecha.substring(0,5)}
                            </span>
                          )}
                        </div>
                        {oaDots.length > 0 && (
                          <div className="flex gap-1 mb-1.5">
                            {oaDots.slice(0,4).map((oa) => (
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
                onClick={() => { const h = prompt("Escribe una habilidad personalizada:"); if(h) setActividad(p => ({ ...p, habilidades: [...(p.habilidades||[]), h] })) }}
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
                  <button onClick={() => setActividad(p => ({ ...p, habilidades: (p.habilidades||[]).filter(x => x !== hab) }))}>
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
                onClick={() => { const a = prompt("Escribe una actitud personalizada:"); if(a) setActividad(p => ({ ...p, actitudes: [...(p.actitudes||[]), a] })) }}
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
                  <button onClick={() => setActividad(p => ({ ...p, actitudes: (p.actitudes||[]).filter(x => x !== act) }))}>
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
                    <RichArea value={actividad.inicio||""} onChange={v => setActividad(p => ({ ...p, inicio: v }))} placeholder="¿Cómo empezará la clase?" rows={6} />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide mb-1 block">Desarrollo</label>
                    <RichArea value={actividad.desarrollo||""} onChange={v => setActividad(p => ({ ...p, desarrollo: v }))} placeholder="Actividades principales de la clase…" rows={12} />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide mb-1 block">Cierre</label>
                    <RichArea value={actividad.cierre||""} onChange={v => setActividad(p => ({ ...p, cierre: v }))} placeholder="¿Cómo cerrará la clase?" rows={6} />
                  </div>
                </div>
              ) : (
                <div>
                  <p className="text-[11px] text-muted-foreground mb-2 leading-snug">
                    Espacio para que la educadora diferencial registre las adecuaciones curriculares de esta sesión (PIE).
                  </p>
                  <RichArea value={actividad.adecuacion||""} onChange={v => setActividad(p => ({ ...p, adecuacion: v }))} placeholder="Redactar adecuaciones curriculares…" rows={8} />
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
                    {(actividad.materiales||[]).length === 0
                      ? <p className="text-[12px] text-muted-foreground">Sin materiales aún.</p>
                      : (actividad.materiales||[]).map((m, i) => (
                          <div key={i} className="flex items-center justify-between bg-background rounded-lg px-3 py-2 text-[12px]">
                            <span>{m}</span>
                            <button onClick={() => setActividad(p => ({ ...p, materiales: (p.materiales||[]).filter((_,j) => j !== i) }))} className="text-muted-foreground hover:text-red-500">
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
                      onKeyDown={e => { if (e.key === "Enter" && nuevoMaterial.trim()) { setActividad(p => ({ ...p, materiales: [...(p.materiales||[]), nuevoMaterial.trim()] })); setNuevoMaterial("") }}}
                      placeholder="Agregar material…"
                      className="flex-1 border-[1.5px] border-border rounded-[8px] px-3 py-2 text-[12px] outline-none focus:border-primary"
                    />
                    <button
                      onClick={() => { if (nuevoMaterial.trim()) { setActividad(p => ({ ...p, materiales: [...(p.materiales||[]), nuevoMaterial.trim()] })); setNuevoMaterial("") }}}
                      className="bg-primary text-white rounded-[8px] px-3 py-2"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ) : (
                <div>
                  <div className="flex flex-col gap-1.5 mb-3">
                    {(actividad.tics||[]).length === 0
                      ? <p className="text-[12px] text-muted-foreground">Sin herramientas TIC aún.</p>
                      : (actividad.tics||[]).map((t, i) => (
                          <div key={i} className="flex items-center justify-between bg-background rounded-lg px-3 py-2 text-[12px]">
                            <span>{t}</span>
                            <button onClick={() => setActividad(p => ({ ...p, tics: (p.tics||[]).filter((_,j) => j !== i) }))} className="text-muted-foreground hover:text-red-500">
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
                      onKeyDown={e => { if (e.key === "Enter" && nuevoTic.trim()) { setActividad(p => ({ ...p, tics: [...(p.tics||[]), nuevoTic.trim()] })); setNuevoTic("") }}}
                      placeholder="Ej: Pizarra digital, Kahoot…"
                      className="flex-1 border-[1.5px] border-border rounded-[8px] px-3 py-2 text-[12px] outline-none focus:border-primary"
                    />
                    <button
                      onClick={() => { if (nuevoTic.trim()) { setActividad(p => ({ ...p, tics: [...(p.tics||[]), nuevoTic.trim()] })); setNuevoTic("") }}}
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
                              setMensajeLocal(`Considera esta actividad sugerida del curriculo: ${item.nombre}. Descripcion: ${item.descripcion}`)
                              setShowCopilot(true)
                              setCopilotTab("chat")
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
                              setMensajeLocal(`Integra una evaluacion inspirada en: ${item.titulo}. Actividad: ${item.actividad_evaluacion}`)
                              setShowCopilot(true)
                              setCopilotTab("chat")
                            }}
                            className="text-[10px] font-semibold text-primary border border-primary rounded-full px-2 py-1 hover:bg-pink-light transition-colors"
                          >
                            Llevar al copiloto
                          </button>
                        </div>
                        <p className="text-[12px] text-muted-foreground leading-relaxed">{item.actividad_evaluacion}</p>
                        {item.criterios_proceso?.length > 0 && (
                          <div className="mt-3">
                            <p className="text-[11px] font-semibold text-foreground mb-1">Criterios de proceso</p>
                            <ul className="list-disc pl-4 text-[12px] text-muted-foreground space-y-1">
                              {item.criterios_proceso.map((criterio, index) => <li key={index}>{criterio}</li>)}
                            </ul>
                          </div>
                        )}
                        {item.criterios_presentacion?.length > 0 && (
                          <div className="mt-3">
                            <p className="text-[11px] font-semibold text-foreground mb-1">Criterios de presentacion</p>
                            <ul className="list-disc pl-4 text-[12px] text-muted-foreground space-y-1">
                              {item.criterios_presentacion.map((criterio, index) => <li key={index}>{criterio}</li>)}
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

      {/* ── Copiloto: panel fijo lateral de pantalla completa (estilo Edge) ── */}
      {showCopilot && (
        <>
          {/* Overlay semitransparente solo en móvil */}
          <button
            type="button"
            aria-label="Cerrar copiloto"
            className="fixed inset-0 z-[698] bg-slate-950/30 backdrop-blur-[2px] md:hidden"
            onClick={() => setShowCopilot(false)}
          />
          {/* Panel fijo de pantalla completa — full viewport height */}
          <aside
            style={{ width: copilotWidth }}
            className={cn(
              "fixed top-0 right-0 z-[699] flex h-screen flex-col border-l border-slate-200 bg-white shadow-[-4px_0_24px_rgba(15,23,42,0.08)]",
              !isResizing && "transition-[width] duration-300"
            )}
          >
            {/* Resizer handle */}
            <div
              className="absolute left-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-indigo-400/40 bg-transparent z-[700]"
              onMouseDown={() => setIsResizing(true)}
            />

            {/* Header compacto estilo Edge */}
            <div className="border-b border-slate-200 bg-white px-4 py-3 flex-shrink-0">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <div className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-xl bg-gradient-to-br from-sky-500 via-indigo-500 to-fuchsia-500 text-white">
                    <Bot className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-[14px] font-extrabold text-slate-900 leading-none">Copiloto IA</p>
                    <p className="text-[11px] text-slate-400 leading-tight mt-0.5">{providerMeta.label} · {aiConfig.model}</p>
                  </div>
                </div>
                <div className="flex items-center gap-0.5">
                  <button
                    onClick={() => { setCopilotTab("prompt"); setShowSettings(true) }}
                    className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
                    title="Configuración"
                  >
                    <Settings2 className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => setShowCopilot(false)}
                    className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 transition-colors hover:bg-red-50 hover:text-red-500"
                    title="Cerrar"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <div className="mt-2.5 grid grid-cols-2 gap-1.5 rounded-xl bg-slate-100 p-1">
                <button
                  onClick={() => setCopilotTab("chat")}
                  className={cn(
                    "rounded-lg px-3 py-1.5 text-[12px] font-bold transition-colors",
                    copilotTab === "chat" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
                  )}
                >
                  Chat
                </button>
                <button
                  onClick={() => setCopilotTab("prompt")}
                  className={cn(
                    "rounded-lg px-3 py-1.5 text-[12px] font-bold transition-colors",
                    copilotTab === "prompt" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
                  )}
                >
                  Prompt y motor
                </button>
              </div>
            </div>

            {copilotTab === "prompt" ? (
              <div className="flex-1 overflow-y-auto bg-slate-50/70 p-5">
                <div className="space-y-4">
                  <div className="rounded-[18px] border border-slate-200 bg-white p-4 shadow-sm">
                    <div className="mb-3 flex items-center gap-2">
                      <SlidersHorizontal className="h-4 w-4 text-indigo-500" />
                      <h3 className="text-[13px] font-bold text-slate-900">Proveedor y acceso</h3>
                    </div>

                    <label className="mb-1 block text-[11px] font-semibold text-slate-500">Proveedor</label>
                    <select
                      value={aiConfig.provider}
                      onChange={e => {
                        const nextProvider = e.target.value as typeof aiConfig.provider
                        const meta = getProviderMeta(nextProvider)
                        setAiConfig((prev: any) => ({
                          ...prev,
                          provider: nextProvider,
                          model: meta.defaultModel,
                          endpoint: nextProvider === "compatible" ? prev.endpoint || "https://api.openai.com/v1" : prev.endpoint,
                        }))
                      }}
                      className="mb-3 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-[13px] font-semibold outline-none transition-colors focus:border-indigo-400"
                    >
                      {AI_PROVIDER_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>

                    <label className="mb-1 block text-[11px] font-semibold text-slate-500">Modelo</label>
                    <input
                      value={aiConfig.model}
                          onChange={e => setAiConfig((prev: any) => ({ ...prev, model: e.target.value }))}
                      className="mb-3 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-[13px] outline-none transition-colors focus:border-indigo-400"
                      placeholder={providerMeta.defaultModel}
                    />

                    {aiConfig.provider === "compatible" && (
                      <>
                        <label className="mb-1 block text-[11px] font-semibold text-slate-500">Endpoint base</label>
                        <input
                          value={aiConfig.endpoint}
                          onChange={e => setAiConfig((prev: any) => ({ ...prev, endpoint: e.target.value }))}
                          className="mb-3 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-[13px] outline-none transition-colors focus:border-indigo-400"
                          placeholder={providerMeta.endpointPlaceholder || "https://api.openai.com/v1"}
                        />
                      </>
                    )}

                    <label className="mb-1 block text-[11px] font-semibold text-slate-500">Token</label>
                    <input
                      type="password"
                      value={aiConfig.token}
                      onChange={e => setAiConfig((prev: any) => ({ ...prev, token: e.target.value }))}
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-[13px] outline-none transition-colors focus:border-indigo-400"
                      placeholder={aiConfig.provider === "gemini" ? "Opcional si quieres usar la llave del servidor" : "Tu token personal"}
                    />

                    <p className="mt-2 text-[11px] leading-relaxed text-slate-500">{providerMeta.helper}</p>

                    <div className="mt-4 flex gap-2">
                      <button
                        onClick={() => saveAiConfig(aiConfig)}
                        className="flex-1 rounded-xl bg-slate-900 px-3 py-2 text-[12px] font-bold text-white transition-colors hover:bg-slate-800"
                      >
                        <Save className="mr-1 inline h-3.5 w-3.5" /> Guardar
                      </button>
                      <button
                        onClick={() => setAiConfig(savedAiConfig)}
                        className="rounded-xl border border-slate-200 px-3 py-2 text-[12px] font-bold text-slate-600 transition-colors hover:bg-slate-100"
                      >
                        <RotateCcw className="mr-1 inline h-3.5 w-3.5" /> Volver
                      </button>
                    </div>
                  </div>

                  <div className="rounded-[18px] border border-slate-200 bg-white p-4 shadow-sm">
                    <div className="mb-3 flex items-center gap-2">
                      <BrainCircuit className="h-4 w-4 text-fuchsia-500" />
                      <h3 className="text-[13px] font-bold text-slate-900">Prompt que usa la IA</h3>
                    </div>

                    <label className="mb-1 block text-[11px] font-semibold text-slate-500">Instrucciones maestras</label>
                    <textarea
                      value={aiConfig.promptExtra}
                      onChange={e => setAiConfig((prev: any) => ({ ...prev, promptExtra: e.target.value }))}
                      className="mb-3 min-h-[88px] w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-[12px] leading-relaxed outline-none transition-colors focus:border-indigo-400"
                    />

                    <div className="mb-3 grid grid-cols-3 gap-2 rounded-2xl bg-slate-100 p-1">
                      {(Object.keys(PROMPT_MODE_LABELS) as CopilotMode[]).map((mode) => (
                        <button
                          key={mode}
                          onClick={() => setPromptMode(mode)}
                          className={cn(
                            "rounded-xl px-2 py-2 text-[11px] font-bold transition-colors",
                            promptMode === mode ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-900"
                          )}
                        >
                          {PROMPT_MODE_LABELS[mode]}
                        </button>
                      ))}
                    </div>

                    <label className="mb-1 block text-[11px] font-semibold text-slate-500">Prompt editable</label>
                    <textarea
                      value={aiConfig.promptOverrides[promptMode] || promptPreview}
                      onChange={e => {
                        const nextValue = e.target.value
                        setAiConfig((prev: any) => ({
                          ...prev,
                          promptOverrides: {
                            ...prev.promptOverrides,
                            [promptMode]: nextValue,
                          },
                        }))
                      }}
                      className="min-h-[240px] w-full rounded-2xl border border-slate-200 bg-slate-950 px-3 py-3 font-mono text-[11px] leading-relaxed text-slate-100 outline-none transition-colors focus:border-fuchsia-400"
                    />

                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        onClick={() => { void navigator.clipboard.writeText(aiConfig.promptOverrides[promptMode] || promptPreview) }}
                        className="rounded-xl border border-slate-200 px-3 py-2 text-[11px] font-bold text-slate-600 transition-colors hover:bg-slate-100"
                      >
                        <Copy className="mr-1 inline h-3.5 w-3.5" /> Copiar
                      </button>
                      <button
                        onClick={() => setAiConfig((prev: any) => ({
                          ...prev,
                          promptOverrides: {
                            ...prev.promptOverrides,
                            [promptMode]: "",
                          },
                        }))}
                        className="rounded-xl border border-slate-200 px-3 py-2 text-[11px] font-bold text-slate-600 transition-colors hover:bg-slate-100"
                      >
                        <RotateCcw className="mr-1 inline h-3.5 w-3.5" /> Usar automatico
                      </button>
                      <button
                        onClick={() => setAiConfig((prev: any) => ({
                          ...prev,
                          promptExtra: savedAiConfig.promptExtra,
                          promptOverrides: {
                            ...prev.promptOverrides,
                            [promptMode]: savedAiConfig.promptOverrides[promptMode],
                          },
                        }))}
                        className="rounded-xl border border-slate-200 px-3 py-2 text-[11px] font-bold text-slate-600 transition-colors hover:bg-slate-100"
                      >
                        <PencilLine className="mr-1 inline h-3.5 w-3.5" /> Volver al guardado
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <>
                <div className="flex-1 overflow-y-auto bg-slate-50 px-4 py-4">
                  {!showCopilotClassMode ? (
                    <div className="flex h-full flex-col items-center justify-center px-4 text-center">
                      <div className="mb-3 grid h-10 w-10 place-items-center rounded-2xl bg-gradient-to-br from-sky-500 via-indigo-500 to-fuchsia-500 text-white">
                        <Bot className="h-5 w-5" />
                      </div>
                      <p className="text-[14px] font-bold text-slate-800">Copiloto IA</p>
                      <p className="mt-1.5 max-w-[260px] text-[12px] leading-relaxed text-slate-500">
                        Genera una primera propuesta y luego usa el chat para preguntar o ajustar.
                      </p>
                    </div>
                  ) : chatHistory.length === 0 ? (
                    <div className="flex h-full flex-col justify-center px-2 py-4">
                      <p className="text-[14px] font-bold text-slate-800">Clase detectada</p>
                      <p className="mt-1.5 text-[12px] leading-relaxed text-slate-500">
                        Puedes pedirme ajustes, hacer preguntas pedagógicas o reescribir una parte.
                      </p>
                      <div className="mt-4 rounded-xl border border-slate-200 bg-white px-3 py-3">
                        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">Pruebas rápidas</p>
                        <div className="mt-2 flex flex-col gap-1.5 text-[12px] text-slate-600">
                          <p>"Mejora el inicio para que sea más breve y activo."</p>
                          <p>"Reescribe el cierre con un ticket de salida."</p>
                          <p>"Explica por qué esta secuencia responde a los OA."</p>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-3">
                      {chatHistory.map((msg, i) => (
                        <div key={i} className={cn("flex flex-col", msg.role === "user" ? "items-end" : "items-start")}>
                          <div className={cn(
                            "max-w-[92%] rounded-2xl px-3.5 py-2.5 text-[13px] leading-relaxed",
                            msg.role === "user"
                              ? "rounded-br-sm bg-indigo-600 text-white"
                              : "rounded-bl-sm border border-slate-200 bg-white text-slate-700"
                          )}>
                            {msg.role === "user" ? (
                              <p>{msg.text}</p>
                            ) : (
                              <div
                                className="prose prose-sm max-w-none prose-p:my-0 prose-p:leading-relaxed prose-ul:my-1.5 prose-li:my-0.5 prose-strong:text-slate-900"
                                dangerouslySetInnerHTML={{ __html: formatChatMessageHtml(msg.text) }}
                              />
                            )}
                          </div>
                        </div>
                      ))}
                      {isGeneratingAI && (
                        <div className="max-w-[92%] rounded-2xl rounded-bl-sm border border-slate-200 bg-white px-3.5 py-2.5 text-[13px] text-slate-500">
                          <Loader2 className="mr-2 inline h-4 w-4 animate-spin text-indigo-500" />
                          Analizando...
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div className="border-t border-slate-200 bg-white px-3 py-3 flex-shrink-0">
                  {!showCopilotClassMode ? (
                    <>
                      <button
                        onClick={() => ejecutarAI("crear_inicial", "")}
                        disabled={isGeneratingAI || !requisitosCompletos}
                        className="w-full rounded-xl bg-gradient-to-r from-indigo-500 to-fuchsia-600 px-4 py-2.5 text-[13px] font-bold text-white transition-all hover:opacity-90 disabled:opacity-60"
                      >
                        {isGeneratingAI ? <Loader2 className="mr-2 inline h-4 w-4 animate-spin" /> : <Wand2 className="mr-2 inline h-4 w-4" />}
                        {isGeneratingAI ? "Pensando..." : "Generar primera propuesta"}
                      </button>
                      {!requisitosCompletos && (
                        <p className="mt-2 text-center text-[11px] leading-relaxed text-slate-400">
                          Completa al menos un OA, una habilidad, una actitud y el objetivo de la clase.
                        </p>
                      )}
                    </>
                  ) : (
                    <div className="space-y-2">
                      <div className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 pr-1">
                        <input
                          type="text"
                          value={mensajeLocal}
                          onChange={e => setMensajeLocal(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === "Enter") ejecutarAI("chat", mensajeLocal)
                          }}
                          placeholder="Ej: detecta incoherencias, explica..."
                          disabled={isGeneratingAI}
                          className="flex-1 bg-transparent px-3 py-2.5 text-[13px] outline-none"
                        />
                        <button
                          onClick={toggleListen}
                          disabled={isGeneratingAI}
                          className={cn("grid h-8 w-8 flex-shrink-0 place-items-center rounded-lg text-slate-400 transition-colors hover:text-indigo-600", isListening && "text-red-500")}
                        >
                          {isListening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                        </button>
                      </div>
                      <div className="grid grid-cols-2 gap-1.5">
                        <button
                          onClick={() => ejecutarAI("chat", mensajeLocal)}
                          disabled={isGeneratingAI || !mensajeLocal.trim()}
                          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-[12px] font-bold text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50"
                        >
                          <MessageSquare className="mr-1 inline h-3.5 w-3.5" /> Preguntar
                        </button>
                        <button
                          onClick={() => ejecutarAI("edicion", mensajeLocal)}
                          disabled={isGeneratingAI || (!mensajeLocal.trim() && !hasUserConversation)}
                          className="rounded-xl bg-slate-900 px-3 py-2 text-[12px] font-bold text-white transition-colors hover:bg-slate-800 disabled:opacity-50"
                        >
                          <Wand2 className="mr-1 inline h-3.5 w-3.5" /> Modificar clase
                        </button>
                      </div>
                      <p className="px-0.5 text-[10px] leading-relaxed text-slate-400">
                        <b className="text-slate-500">Preguntar</b> responde sin tocar la clase. <b className="text-slate-500">Modificar clase</b> aplica el pedido y lo conversado.
                      </p>
                    </div>
                  )}
                </div>
              </>
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
