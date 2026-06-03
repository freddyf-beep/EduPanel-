"use client"

import { useEffect, useMemo, useState } from "react"
import {
  AlertCircle,
  Bot,
  Check,
  CheckCircle2,
  ClipboardCopy,
  GraduationCap,
  Loader2,
  Sparkles,
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
import { parseJsonResponse } from "@/lib/ai/copilot"
import type { ListaCotejoTemplate } from "@/lib/listas-cotejo"

const RECOGNIZED_CHECKLIST_FIELDS = [
  { key: "nombre", label: "Nombre del Instrumento" },
  { key: "curso", label: "Curso" },
  { key: "asignatura", label: "Asignatura" },
  { key: "secciones", label: "Secciones e Indicadores" },
  { key: "instruccionesMetodologicas", label: "Instrucciones Metodológicas" },
  { key: "escalaDicotomica", label: "Escala Dicotómica" },
] as const

interface ListaCotejoIaModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  listaActual: ListaCotejoTemplate
  onApplyLista: (lista: ListaCotejoTemplate) => void
}

type IaPreference = "agent" | "integrated"

export function ListaCotejoIaModal({
  open,
  onOpenChange,
  listaActual,
  onApplyLista,
}: ListaCotejoIaModalProps) {
  const [tab, setTab] = useState<IaPreference>("agent")
  const [copied, setCopied] = useState(false)
  const [jsonInput, setJsonInput] = useState("")
  const [jsonError, setJsonError] = useState("")
  const [applying, setApplying] = useState(false)
  
  // IA Integrada
  const [isGenerating, setIsGenerating] = useState(false)
  const [generationError, setGenerationError] = useState("")
  const [progressStep, setProgressStep] = useState(0)

  const progressLogs = useMemo(() => [
    "Analizando objetivos y contenidos de la unidad...",
    "Redactando secciones de evaluación...",
    "Aplicando Decreto 67: Formulación de indicadores observables...",
    "Aplicando Decreto 83: Diseñando canales alternativos de salida...",
    "Integrando focos actitudinales (OAT)...",
    "Estructurando el JSON final para EduPanel..."
  ], [])

  // Load preference
  useEffect(() => {
    if (!open) return
    const saved = window.localStorage.getItem("eduAiPreference_lista")
    if (saved === "agent" || saved === "integrated") setTab(saved as IaPreference)
  }, [open])

  // Simulate progress when generating
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

  // Build the external prompt for the teacher
  const promptText = useMemo(() => {
    const oasText = listaActual.metadatosCurriculares?.objetivos?.join("\n") || "No especificados";
    return `Actúa como un Diseñador Instruccional Experto en Evaluación y Currículum Chileno (Decreto 67 y Decreto 83).
Quiero que adaptes o generes una Lista de Cotejo para el curso "${listaActual.curso || "1° Básico"}" y la asignatura "${listaActual.asignatura || "Educación Musical"}", enfocada en los siguientes objetivos/contenidos: "${listaActual.unidadNombre || "Cualidades del sonido (duración e intensidad), elementos del lenguaje musical"}".

Objetivos de Aprendizaje (OA) de Referencia:
${oasText}

Por favor, sigue estas directrices fundamentales de diseño pedagógico:
1. Formulación Observable (Decreto 67): Redacta indicadores que representen acciones empíricas observables de forma directa (ej. 'Representa', 'Produce', 'Identifica', 'Ajusta', 'Mantiene'). Evita estrictamente el uso de verbos mentalistas o inobservables (ej. 'comprende', 'entiende', 'sabe', 'conoce', 'valora', 'aprecia').
2. Indicadores Generales y Flexibles: Los indicadores NO deben ser ejemplos específicos o conductas rígidas (por ejemplo, evita 'estirando los brazos para sonidos largos y palmada para cortos' o 'percutiendo con lápices'). En su lugar, redacta indicadores generales (ej. 'Representa mediante movimientos corporales o gestos libres...') para que el estudiante interprete y demuestre la habilidad a su manera, promoviendo su autonomía.
3. Adecuaciones DUA (Decreto 83): Para cada indicador, proporciona un 'Mecanismo de Salida Alternativo' (Canal Alternativo) que permita demostrar la misma competencia si existen barreras expresivas, motoras o sensoriales.
4. Focos Actitudinales (OAT): Integra al menos 2 indicadores actitudinales transversales (OAT) alineados con la asignatura.
5. Formato de Salida JSON: Devuelve el resultado en un formato JSON estructurado que pueda ser importado directamente por la plataforma.

El JSON debe respetar estrictamente esta estructura:
{
  "nombre": "Lista de cotejo - ${listaActual.asignatura || "Educación Musical"} - ${listaActual.curso || "1° Básico"}",
  "curso": "${listaActual.curso || "1° Básico"}",
  "asignatura": "${listaActual.asignatura || "Educación Musical"}",
  "unidadNombre": "${listaActual.unidadNombre || ""}",
  "instruccionesMetodologicas": "Marque con una 'X' en la casilla correspondiente si el estudiante cumple (Sí) o no cumple (No) con la acción descrita de manera general. Permita que el estudiante elija o proponga formas alternativas de representar cada habilidad según sus propias capacidades de expresión.",
  "escalaDicotomica": ["Sí", "No"],
  "secciones": [
    {
      "nombre": "I. Nombre de la Sección (ej. Identifica y diferencia sonidos LARGOS y CORTOS)",
      "indicadores": [
        {
          "texto": "Texto del indicador observable y general (sin ejemplos rígidos).",
          "esTransversal": false,
          "focoDiferenciadoActivo": true,
          "focoDiferenciadoTexto": "Mecanismo alternativo de salida (ej: permite usar instrumentos, aplicaciones sonoras o señas táctiles)."
        }
      ]
    }
  ]
}`
  }, [listaActual])

  // Real-time JSON detector
  const detectedFields = useMemo(() => {
    if (!jsonInput.trim()) return {}
    try {
      const parsed = parseJsonResponse(jsonInput) as Record<string, any>
      const detected: Record<string, boolean> = {}
      RECOGNIZED_CHECKLIST_FIELDS.forEach(f => {
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
    window.localStorage.setItem("eduAiPreference_lista", next)
  }

  const handleCopyPrompt = async () => {
    await navigator.clipboard.writeText(promptText)
    setCopied(true)
    setTimeout(() => setCopied(false), 1800)
  }

  const handleApplyExternalJson = async () => {
    setJsonError("")
    try {
      setApplying(true)
      const parsed = parseJsonResponse(jsonInput) as unknown as ListaCotejoTemplate
      if (!parsed.secciones || parsed.secciones.length === 0) {
        throw new Error("El JSON debe contener al menos una sección con indicadores.")
      }
      onApplyLista(parsed)
      setJsonInput("")
      onOpenChange(false)
    } catch (error) {
      setJsonError(error instanceof Error ? error.message : "No pude aplicar ese JSON.")
    } finally {
      setApplying(false)
    }
  }

  const handleGenerateIntegrated = async () => {
    setIsGenerating(true)
    setGenerationError("")
    setProgressStep(0)
    
    // Load local AI config for provider token bypass
    let aiConfig: any = null
    try {
      const saved = window.localStorage.getItem("eduAiConfig")
      if (saved) aiConfig = JSON.parse(saved)
    } catch (e) {
      console.warn("Failed to load local AI settings", e)
    }

    try {
      const res = await apiFetch("/api/generar-evaluacion", {
        method: "POST",
        body: JSON.stringify({
          modo: "lista_cotejo_generar",
          tipoDoc: "lista_cotejo",
          contexto: {
            asignatura: listaActual.asignatura,
            curso: listaActual.curso,
            unidadNombre: listaActual.unidadNombre || "",
            oas: listaActual.oas || [],
            habilidades: [],
            conocimientos: [],
            actitudes: listaActual.metadatosCurriculares?.objetivosTransversales || []
          },
          modelProvider: aiConfig?.provider || "public",
          customToken: aiConfig?.token || "",
          customModel: aiConfig?.model || "",
          customEndpoint: aiConfig?.endpoint || "",
          customPrompt: aiConfig?.promptExtra || ""
        })
      })

      const data = await res.json() as ListaCotejoTemplate
      if (!data.secciones || data.secciones.length === 0) {
        throw new Error("La IA no generó secciones válidas.")
      }
      
      onApplyLista(data)
      onOpenChange(false)
    } catch (err) {
      setGenerationError(err instanceof Error ? err.message : "Error al generar con IA integrada.")
    } finally {
      setIsGenerating(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-hidden sm:max-w-4xl border border-white/10 dark:border-white/5 bg-card/95 dark:bg-zinc-950/95 backdrop-blur-md rounded-2xl shadow-2xl p-0">
        
        {/* Header premium */}
        <div className="relative overflow-hidden px-6 pt-6 pb-4 border-b border-border bg-gradient-to-r from-violet-600/10 via-fuchsia-600/5 to-transparent">
          <div className="absolute top-0 right-0 h-40 w-40 rounded-full bg-violet-500/10 blur-3xl -z-10" />
          
          <DialogHeader>
            <div className="flex items-center gap-2.5">
              <div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white shadow-md shadow-violet-500/20">
                <Sparkles className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <DialogTitle className="text-[18px] font-extrabold tracking-tight">Asistente IA Avanzado (Lista de Cotejo)</DialogTitle>
                <DialogDescription className="text-[12.5px] mt-0.5">
                  Crea e integra una pauta de evaluación basada en el DUA y Decreto 67 con un copiloto externo o generación interna.
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

            {/* Pestaña Copiloto Externo */}
            <TabsContent value="agent" className="mt-0 space-y-4">
              <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
                {/* Panel Izquierdo: Copiar Prompt */}
                <div className="space-y-3 rounded-xl border border-border bg-muted/20 p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-[12px] font-extrabold uppercase text-muted-foreground tracking-wider">1. Copia las instrucciones maestras</span>
                    <button
                      onClick={handleCopyPrompt}
                      className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-violet-600 px-3 text-[11px] font-bold text-white transition-opacity hover:opacity-90"
                    >
                      {copied ? <Check className="h-3.5 w-3.5" /> : <ClipboardCopy className="h-3.5 w-3.5" />}
                      {copied ? "Copiado!" : "Copiar Prompt"}
                    </button>
                  </div>
                  <div className="relative">
                    <textarea
                      readOnly
                      value={promptText}
                      className="h-64 w-full rounded-lg border border-border bg-background/50 p-3 text-[11px] font-mono leading-relaxed outline-none focus:border-violet-500/50 resize-none"
                    />
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-normal">
                    Este prompt le explica detalladamente a la IA externa cómo redactar indicadores generales y empíricos, aplicar mecanismos alternativos de Decreto 83, e inyectar OATs.
                  </p>
                </div>

                {/* Panel Derecho: Pegar JSON */}
                <div className="space-y-3 rounded-xl border border-border bg-muted/20 p-4">
                  <span className="text-[12px] font-extrabold uppercase text-muted-foreground tracking-wider block">2. Pega el JSON obtenido</span>
                  
                  <textarea
                    value={jsonInput}
                    onChange={e => setJsonInput(e.target.value)}
                    placeholder="Pega el bloque JSON aquí..."
                    className="h-48 w-full rounded-lg border border-border bg-background p-3 text-[11px] font-mono outline-none focus:border-primary"
                  />

                  {jsonError && (
                    <div className="flex items-start gap-2 rounded-lg bg-red-500/5 border border-red-500/20 p-2.5 text-[11px] text-red-500">
                      <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                      <span>{jsonError}</span>
                    </div>
                  )}

                  {/* Detector de campos */}
                  {jsonInput.trim() && (
                    <div className="space-y-2 rounded-lg border border-border bg-background/55 p-3 text-[11.5px]">
                      <span className="font-bold text-foreground block">Estructura del JSON detectado:</span>
                      <div className="grid grid-cols-2 gap-1.5">
                        {RECOGNIZED_CHECKLIST_FIELDS.map(f => {
                          const exists = !!detectedFields[f.key]
                          return (
                            <div key={f.key} className="flex items-center gap-1.5 text-muted-foreground">
                              {exists ? (
                                <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
                              ) : (
                                <AlertCircle className="h-3.5 w-3.5 shrink-0 text-amber-500" />
                              )}
                              <span className={exists ? "text-foreground font-medium" : "text-muted-foreground/60"}>
                                {f.label}
                              </span>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  <button
                    onClick={handleApplyExternalJson}
                    disabled={applying || !isValidJson}
                    className="w-full inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-[12.5px] font-extrabold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
                  >
                    {applying && <Loader2 className="h-4 w-4 animate-spin" />}
                    Aplicar en el Editor
                  </button>
                </div>
              </div>
            </TabsContent>

            {/* Pestaña IA Integrada */}
            <TabsContent value="integrated" className="mt-0 space-y-4">
              <div className="rounded-xl border border-border bg-muted/20 p-6 flex flex-col items-center justify-center text-center space-y-4">
                <div className="w-14 h-14 rounded-2xl bg-fuchsia-500/10 text-fuchsia-500 grid place-items-center shadow-inner">
                  <Bot className="h-8 w-8" />
                </div>
                
                <div className="max-w-md">
                  <h3 className="text-[15px] font-extrabold text-foreground">Generación Rápida con Gemini 1-Clic</h3>
                  <p className="text-[12px] text-muted-foreground mt-1">
                    Crea automáticamente la pauta completa con indicadores observables y adecuaciones DUA de forma nativa en segundos.
                  </p>
                </div>

                {isGenerating ? (
                  <div className="w-full max-w-md p-4 rounded-xl border border-fuchsia-500/10 bg-fuchsia-500/5 space-y-3">
                    <div className="flex items-center gap-2 text-fuchsia-600 dark:text-fuchsia-400 text-[12px] font-bold">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>{progressLogs[progressStep]}</span>
                    </div>
                    <div className="h-1.5 w-full bg-zinc-200 dark:bg-zinc-800 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-gradient-to-r from-violet-500 to-fuchsia-500 transition-all duration-500" 
                        style={{ width: `${((progressStep + 1) / progressLogs.length) * 100}%` }}
                      />
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={handleGenerateIntegrated}
                    className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 px-6 text-[13px] font-extrabold text-white shadow-lg shadow-violet-500/10 transition-opacity hover:opacity-90 cursor-pointer"
                  >
                    <Sparkles className="h-4 w-4 animate-pulse" />
                    Generar Lista de Cotejo con IA
                  </button>
                )}

                {generationError && (
                  <div className="w-full max-w-md flex items-start gap-2.5 rounded-lg bg-red-500/5 border border-red-500/20 p-3 text-[12px] text-red-500 text-left">
                    <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                    <span>{generationError}</span>
                  </div>
                )}
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </DialogContent>
    </Dialog>
  )
}
