"use client"

// ═══════════════════════════════════════════════════════════════════════════
// Panel lateral de IA para Pruebas y Guías
// ─────────────────────────────────────────────────────────────────────────
// Dos modos de uso:
//   1. ChatGPT: prompt + contexto .md en un solo chat
//   2. NotebookLM: genera 2 prompts separados (contexto y tarea)
//
// El panel genera el prompt completo con todo el contexto curricular
// vinculado (OAs, clases, ver_unidad) y lo envía a la API o lo muestra
// para copiar manualmente a ChatGPT/NotebookLM.
// ═══════════════════════════════════════════════════════════════════════════

import { useCallback, useEffect, useRef, useState } from "react"
import {
  Sparkles, Copy, Send, Loader2, X, ChevronDown, ChevronUp,
  ExternalLink, BookOpen, Clipboard, CheckCircle2, AlertCircle,
  Wand2, MessageSquare, FileText, ClipboardList, RefreshCw,
} from "lucide-react"
import type { ContextoCurricular } from "@/lib/ai/evaluaciones-copilot"
import type { EvalCopilotMode } from "@/lib/ai/evaluaciones-copilot"
import { apiFetch } from "@/lib/api-client"
import { cn } from "@/lib/utils"

type HerramientaIA = "api" | "chatgpt" | "notebooklm"

interface Props {
  tipoDoc: "prueba" | "guia"
  contexto: ContextoCurricular
  documentoActual?: Record<string, unknown>
  /** Callback cuando la IA genera contenido JSON para aplicar */
  onAplicar?: (data: Record<string, unknown>) => void
  /** Si el panel está visible */
  visible?: boolean
  onClose?: () => void
}

export function EvalCopilotPanel({
  tipoDoc, contexto, documentoActual, onAplicar, visible = true, onClose,
}: Props) {
  const [herramienta, setHerramienta] = useState<HerramientaIA>("api")
  const [instrucciones, setInstrucciones] = useState("")
  const [modo, setModo] = useState<EvalCopilotMode>(tipoDoc === "prueba" ? "prueba_generar" : "guia_generar")
  const [generando, setGenerando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [resultado, setResultado] = useState<Record<string, unknown> | null>(null)
  const [respuestaChat, setRespuestaChat] = useState<string | null>(null)
  const [copiado, setCopiado] = useState(false)
  const [promptGenerado, setPromptGenerado] = useState<string | null>(null)
  const [promptContexto, setPromptContexto] = useState<string | null>(null)
  const [mostrarPrompt, setMostrarPrompt] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Reset al cambiar tipo
  useEffect(() => {
    setModo(tipoDoc === "prueba" ? "prueba_generar" : "guia_generar")
  }, [tipoDoc])

  if (!visible) return null

  // ─── Generar prompt para mostrar/copiar ────────────────────────────

  const generarPromptCompleto = useCallback(() => {
    const oasTexto = contexto.oas
      .filter(oa => oa.seleccionado || oa.esPropio)
      .map(oa => {
        const num = oa.numero ? `OA ${oa.numero}` : oa.id
        const inds = (oa.indicadores || [])
          .filter(i => i.seleccionado)
          .map(i => i.texto)
          .filter(Boolean)
        return `- ${num}: ${oa.descripcion}${inds.length ? `\n  Indicadores: ${inds.join("; ")}` : ""}`
      }).join("\n")

    const clasesTexto = (contexto.clasesVinculadas || []).slice(0, 5).map(c =>
      `- Clase ${c.numero}${c.fecha ? ` (${c.fecha})` : ""}: OAs ${c.oaIds.join(", ")}${c.objetivo ? ` | Obj: ${c.objetivo}` : ""}`
    ).join("\n")

    const actTexto = contexto.actividadClaseVinculada
      ? `Clase ${contexto.actividadClaseVinculada.numeroClase}: ${contexto.actividadClaseVinculada.objetivo || ""}\nInicio: ${(contexto.actividadClaseVinculada.inicio || "").replace(/<[^>]+>/g, "").slice(0, 200)}\nDesarrollo: ${(contexto.actividadClaseVinculada.desarrollo || "").replace(/<[^>]+>/g, "").slice(0, 300)}`
      : "No hay actividad vinculada."

    // Contexto .md
    const contextMd = `# Contexto Curricular

## Datos generales
- Asignatura: ${contexto.asignatura}
- Curso: ${contexto.curso}
- Nivel: ${contexto.nivelCurricular || "No especificado"}
${contexto.unidadNombre ? `- Unidad: ${contexto.unidadNombre}` : ""}
${contexto.contextoDocente ? `- Contexto del docente: ${contexto.contextoDocente}` : ""}
${contexto.objetivoDocente ? `- Objetivo del docente: ${contexto.objetivoDocente}` : ""}

## Objetivos de Aprendizaje seleccionados
${oasTexto || "No hay OA seleccionados."}

## Habilidades priorizadas
${contexto.habilidades.length > 0 ? contexto.habilidades.map(h => `- ${h}`).join("\n") : "No especificadas."}

## Conocimientos clave
${contexto.conocimientos.length > 0 ? contexto.conocimientos.map(c => `- ${c}`).join("\n") : "No especificados."}

## Actitudes
${contexto.actitudes.length > 0 ? contexto.actitudes.map(a => `- ${a}`).join("\n") : "No especificadas."}

## Clases planificadas en esta unidad
${clasesTexto || "No hay clases planificadas."}

## Actividad de clase vinculada
${actTexto}
`

    // Prompt de tarea
    const tipoLabel = tipoDoc === "prueba" ? "prueba escrita" : "guía de aprendizaje"
    const formatoLabel = tipoDoc === "prueba"
      ? "secciones con ítems (selección múltiple, V/F, pareados, ordenar, completar, respuesta corta, desarrollo)"
      : "secciones con contenido didáctico + actividades intercaladas (selección múltiple, V/F, completar, ordenar, encerrar, marcar, colorear, dibujar, investigar, sopa de letras, abierta)"

    const promptTarea = `# Tarea

Genera una ${tipoLabel} completa para el curso ${contexto.curso} de ${contexto.asignatura}.

## Requisitos:
- Basada en los OA seleccionados del contexto curricular
- Vinculada a las clases planificadas
- Formato: ${formatoLabel}
- Nivel apropiado para el curso
- Puntajes coherentes
${instrucciones ? `\n## Instrucciones adicionales del docente:\n${instrucciones}` : ""}

## Formato de respuesta:
Responde SOLO en formato JSON válido con la siguiente estructura:
${tipoDoc === "prueba" ? `{
  "secciones": [
    {
      "titulo": "Ítem I: Selección múltiple",
      "instrucciones": "Marca con X la alternativa correcta. (1 pt c/u)",
      "tipoPredominante": "seleccion_multiple",
      "items": [
        {
          "tipo": "seleccion_multiple",
          "enunciado": "Pregunta...",
          "puntaje": 1,
          "oaVinculado": "OA1",
          "alternativas": [
            { "texto": "Opción a", "esCorrecta": false },
            { "texto": "Opción b", "esCorrecta": true },
            { "texto": "Opción c", "esCorrecta": false },
            { "texto": "Opción d", "esCorrecta": false }
          ]
        }
      ]
    }
  ]
}` : `{
  "seccionesGuia": [
    {
      "titulo": "I. Título",
      "descripcion": "Descripción",
      "contenidoHtml": "<p>Contenido explicativo...</p>",
      "actividades": [
        {
          "tipo": "seleccion_multiple",
          "enunciado": "Pregunta...",
          "puntaje": 1,
          "oaVinculado": "OA1",
          "datos": {
            "tipo": "seleccion_multiple",
            "alternativas": [
              { "id": "a1", "texto": "Opción", "correcta": true }
            ]
          }
        }
      ]
    }
  ]
}`}
`

    setPromptContexto(contextMd)
    setPromptGenerado(promptTarea)
    return { contextMd, promptTarea }
  }, [contexto, instrucciones, tipoDoc])

  // ─── Enviar a la API interna ───────────────────────────────────────

  const enviarAPI = async () => {
    setGenerando(true)
    setError(null)
    setResultado(null)
    setRespuestaChat(null)

    try {
      const response = await apiFetch("/api/generar-evaluacion", {
        method: "POST",
        body: JSON.stringify({
          modo,
          contexto,
          documentoActual,
          instrucciones,
          tipoDoc,
        }),
      })

      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data.error || `Error ${response.status}`)
      }

      const data = await response.json()

      if (data.respuestaChat) {
        setRespuestaChat(data.respuestaChat)
      } else if (data.error === "json_parse_failed") {
        setError(`La IA no devolvió JSON válido. Texto crudo disponible para copiar.`)
        setRespuestaChat(data.rawText || "")
      } else {
        setResultado(data)
      }
    } catch (e: any) {
      setError(e?.message || "Error al generar")
    } finally {
      setGenerando(false)
    }
  }

  // ─── Copiar al portapapeles ────────────────────────────────────────

  const copiar = async (texto: string) => {
    try {
      await navigator.clipboard.writeText(texto)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 2000)
    } catch {
      // Fallback
      const ta = document.createElement("textarea")
      ta.value = texto
      document.body.appendChild(ta)
      ta.select()
      document.execCommand("copy")
      document.body.removeChild(ta)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 2000)
    }
  }

  // ─── Aplicar resultado al editor ───────────────────────────────────

  const aplicarResultado = () => {
    if (resultado && onAplicar) {
      onAplicar(resultado)
      setResultado(null)
    }
  }

  // ─── Render ────────────────────────────────────────────────────────

  const modoOpciones = tipoDoc === "prueba"
    ? [
        { value: "prueba_generar", label: "Generar prueba completa", icon: Wand2 },
        { value: "prueba_seccion", label: "Generar una sección", icon: FileText },
        { value: "chat", label: "Preguntar / conversar", icon: MessageSquare },
      ]
    : [
        { value: "guia_generar", label: "Generar guía completa", icon: Wand2 },
        { value: "guia_seccion", label: "Generar una sección", icon: ClipboardList },
        { value: "chat", label: "Preguntar / conversar", icon: MessageSquare },
      ]

  return (
    <div className="rounded-[14px] border border-border bg-card p-4 shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <span className="text-[13px] font-extrabold uppercase tracking-wide text-foreground">
            Asistente IA
          </span>
        </div>
        {onClose && (
          <button type="button" onClick={onClose} className="rounded p-1 hover:bg-muted/40">
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        )}
      </div>

      {/* Selector de herramienta */}
      <div className="mb-3 flex gap-1 rounded-[10px] border border-border bg-background p-1">
        {([
          { key: "api" as const, label: "API interna" },
          { key: "chatgpt" as const, label: "ChatGPT" },
          { key: "notebooklm" as const, label: "NotebookLM" },
        ]).map(h => (
          <button
            key={h.key}
            type="button"
            onClick={() => setHerramienta(h.key)}
            className={cn(
              "flex-1 rounded-[8px] px-2 py-1.5 text-[11px] font-bold transition",
              herramienta === h.key
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted/40"
            )}
          >
            {h.label}
          </button>
        ))}
      </div>

      {/* Selector de modo */}
      <div className="mb-3">
        <label className="block mb-1 text-[10.5px] font-bold uppercase tracking-wide text-muted-foreground">
          Acción
        </label>
        <div className="flex flex-wrap gap-1">
          {modoOpciones.map(opt => {
            const Icon = opt.icon
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => setModo(opt.value as EvalCopilotMode)}
                className={cn(
                  "flex items-center gap-1 rounded-[8px] border px-2 py-1.5 text-[11px] font-semibold transition",
                  modo === opt.value
                    ? "border-primary bg-pink-light text-primary"
                    : "border-border bg-background text-muted-foreground hover:border-primary/40"
                )}
              >
                <Icon className="h-3 w-3" />
                {opt.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Contexto vinculado (resumen) */}
      <div className="mb-3 rounded-[10px] border border-border bg-muted/20 p-2.5">
        <div className="flex items-center gap-1.5 mb-1">
          <BookOpen className="h-3 w-3 text-primary" />
          <span className="text-[10.5px] font-bold text-muted-foreground uppercase tracking-wide">
            Contexto vinculado
          </span>
        </div>
        <div className="text-[11px] text-muted-foreground space-y-0.5">
          <div>{contexto.asignatura} · {contexto.curso}{contexto.unidadNombre ? ` · ${contexto.unidadNombre}` : ""}</div>
          <div>
            {contexto.oas.filter(o => o.seleccionado).length} OA seleccionados ·{" "}
            {contexto.habilidades.length} habilidades ·{" "}
            {(contexto.clasesVinculadas || []).length} clases vinculadas
          </div>
          {contexto.actividadClaseVinculada && (
            <div className="text-primary font-semibold">
              + Actividad de clase vinculada (Clase {contexto.actividadClaseVinculada.numeroClase})
            </div>
          )}
        </div>
      </div>

      {/* Instrucciones del docente */}
      <div className="mb-3">
        <label className="block mb-1 text-[10.5px] font-bold uppercase tracking-wide text-muted-foreground">
          Instrucciones adicionales (opcional)
        </label>
        <textarea
          ref={textareaRef}
          value={instrucciones}
          onChange={e => setInstrucciones(e.target.value)}
          rows={3}
          placeholder={tipoDoc === "prueba"
            ? "Ej: Enfócate en comprensión lectora, incluye un texto de lectura comprensiva..."
            : "Ej: Incluye actividades de colorear y dibujar para los más pequeños..."
          }
          className="w-full resize-y rounded border border-border bg-background px-3 py-2 text-[12px] outline-none focus:border-primary"
        />
      </div>

      {/* Botón de acción */}
      {herramienta === "api" ? (
        <button
          type="button"
          onClick={enviarAPI}
          disabled={generando}
          className="w-full flex items-center justify-center gap-2 rounded-[10px] bg-primary px-4 py-2.5 text-[12.5px] font-bold text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          {generando ? (
            <><Loader2 className="h-4 w-4 animate-spin" /> Generando...</>
          ) : (
            <><Sparkles className="h-4 w-4" /> Generar con IA</>
          )}
        </button>
      ) : (
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => { generarPromptCompleto(); setMostrarPrompt(true) }}
            className="w-full flex items-center justify-center gap-2 rounded-[10px] bg-violet-600 px-4 py-2.5 text-[12.5px] font-bold text-white hover:bg-violet-700"
          >
            <Clipboard className="h-4 w-4" />
            {herramienta === "chatgpt" ? "Generar prompt para ChatGPT" : "Generar prompts para NotebookLM"}
          </button>

          {herramienta === "chatgpt" && (
            <a
              href="https://chatgpt.com"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-1.5 text-[11px] font-semibold text-muted-foreground hover:text-primary"
            >
              <ExternalLink className="h-3 w-3" />
              Abrir ChatGPT
            </a>
          )}
          {herramienta === "notebooklm" && (
            <a
              href="https://notebooklm.google.com"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-1.5 text-[11px] font-semibold text-muted-foreground hover:text-primary"
            >
              <ExternalLink className="h-3 w-3" />
              Abrir NotebookLM
            </a>
          )}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="mt-3 flex items-start gap-2 rounded-[10px] border border-red-200 bg-red-50 p-3 text-[12px] text-red-700">
          <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
          <div>{error}</div>
        </div>
      )}

      {/* Resultado de la API */}
      {resultado && (
        <div className="mt-3 space-y-2">
          <div className="flex items-center gap-2 rounded-[10px] border border-emerald-200 bg-emerald-50 p-3 text-[12px] text-emerald-700">
            <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
            <span className="font-bold">Contenido generado correctamente</span>
          </div>
          {onAplicar && (
            <button
              type="button"
              onClick={aplicarResultado}
              className="w-full flex items-center justify-center gap-2 rounded-[10px] bg-emerald-600 px-4 py-2 text-[12px] font-bold text-white hover:bg-emerald-700"
            >
              <Wand2 className="h-3.5 w-3.5" />
              Aplicar al editor
            </button>
          )}
          <button
            type="button"
            onClick={() => copiar(JSON.stringify(resultado, null, 2))}
            className="w-full flex items-center justify-center gap-2 rounded-[10px] border border-border bg-background px-4 py-2 text-[12px] font-semibold hover:bg-muted/40"
          >
            <Copy className="h-3.5 w-3.5" />
            {copiado ? "Copiado" : "Copiar JSON"}
          </button>
        </div>
      )}

      {/* Respuesta chat */}
      {respuestaChat && (
        <div className="mt-3 rounded-[10px] border border-border bg-background p-3">
          <div className="text-[12px] leading-relaxed whitespace-pre-wrap">{respuestaChat}</div>
          <button
            type="button"
            onClick={() => copiar(respuestaChat)}
            className="mt-2 flex items-center gap-1 text-[11px] font-semibold text-primary hover:underline"
          >
            <Copy className="h-3 w-3" />
            {copiado ? "Copiado" : "Copiar respuesta"}
          </button>
        </div>
      )}

      {/* Prompts generados para ChatGPT / NotebookLM */}
      {mostrarPrompt && promptGenerado && (
        <div className="mt-3 space-y-3">
          {herramienta === "chatgpt" && (
            <div className="rounded-[10px] border border-violet-200 bg-violet-50/50 p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-bold text-violet-700 uppercase">
                  Prompt completo para ChatGPT (copiar todo junto)
                </span>
                <button
                  type="button"
                  onClick={() => copiar(`${promptContexto}\n\n---\n\n${promptGenerado}`)}
                  className="flex items-center gap-1 rounded bg-violet-600 px-2 py-1 text-[10.5px] font-bold text-white hover:bg-violet-700"
                >
                  <Copy className="h-3 w-3" />
                  {copiado ? "Copiado" : "Copiar"}
                </button>
              </div>
              <pre className="max-h-48 overflow-y-auto rounded border border-violet-200 bg-white p-2 text-[10.5px] whitespace-pre-wrap">
                {promptContexto}{"\n\n---\n\n"}{promptGenerado}
              </pre>
            </div>
          )}

          {herramienta === "notebooklm" && (
            <>
              <div className="rounded-[10px] border border-blue-200 bg-blue-50/50 p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] font-bold text-blue-700 uppercase">
                    Prompt 1: Contexto (subir como fuente .md)
                  </span>
                  <button
                    type="button"
                    onClick={() => copiar(promptContexto || "")}
                    className="flex items-center gap-1 rounded bg-blue-600 px-2 py-1 text-[10.5px] font-bold text-white hover:bg-blue-700"
                  >
                    <Copy className="h-3 w-3" />
                    {copiado ? "Copiado" : "Copiar"}
                  </button>
                </div>
                <pre className="max-h-32 overflow-y-auto rounded border border-blue-200 bg-white p-2 text-[10.5px] whitespace-pre-wrap">
                  {promptContexto}
                </pre>
              </div>
              <div className="rounded-[10px] border border-amber-200 bg-amber-50/50 p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] font-bold text-amber-700 uppercase">
                    Prompt 2: Tarea (pegar en el chat)
                  </span>
                  <button
                    type="button"
                    onClick={() => copiar(promptGenerado || "")}
                    className="flex items-center gap-1 rounded bg-amber-600 px-2 py-1 text-[10.5px] font-bold text-white hover:bg-amber-700"
                  >
                    <Copy className="h-3 w-3" />
                    {copiado ? "Copiado" : "Copiar"}
                  </button>
                </div>
                <pre className="max-h-32 overflow-y-auto rounded border border-amber-200 bg-white p-2 text-[10.5px] whitespace-pre-wrap">
                  {promptGenerado}
                </pre>
              </div>
            </>
          )}

          <button
            type="button"
            onClick={() => setMostrarPrompt(false)}
            className="w-full text-[11px] font-semibold text-muted-foreground hover:text-foreground"
          >
            Ocultar prompts
          </button>
        </div>
      )}

      {/* Instrucciones de uso */}
      {herramienta !== "api" && !mostrarPrompt && (
        <div className="mt-3 rounded-[10px] border border-border bg-muted/20 p-3 text-[11px] text-muted-foreground leading-relaxed">
          {herramienta === "chatgpt" ? (
            <>
              <b>Cómo usar con ChatGPT:</b>
              <ol className="mt-1 ml-3 space-y-0.5 list-decimal">
                <li>Haz click en "Generar prompt para ChatGPT"</li>
                <li>Copia el prompt completo (contexto + tarea)</li>
                <li>Pégalo en un chat nuevo de ChatGPT</li>
                <li>ChatGPT te devolverá el JSON con la {tipoDoc}</li>
                <li>Copia el JSON y pégalo aquí para aplicar</li>
              </ol>
            </>
          ) : (
            <>
              <b>Cómo usar con NotebookLM:</b>
              <ol className="mt-1 ml-3 space-y-0.5 list-decimal">
                <li>Haz click en "Generar prompts para NotebookLM"</li>
                <li>Copia el <b>Prompt 1</b> (contexto) y súbelo como fuente .md</li>
                <li>Copia el <b>Prompt 2</b> (tarea) y pégalo en el chat</li>
                <li>NotebookLM generará el contenido basado en tu contexto</li>
                <li>Copia el resultado JSON y aplícalo aquí</li>
              </ol>
            </>
          )}
        </div>
      )}

      {/* Input para pegar JSON externo */}
      <PegarJsonSection
        visible={true}
        onParsed={(data) => { setResultado(data); setError(null) }}
        onError={(msg) => setError(msg)}
      />
    </div>
  )
}

// ─── Componente para pegar JSON externo ──────────────────────────────────────

function PegarJsonSection({
  visible, onParsed, onError,
}: {
  visible: boolean
  onParsed: (data: Record<string, unknown>) => void
  onError: (msg: string) => void
}) {
  const [texto, setTexto] = useState("")
  const [parseOk, setParseOk] = useState(false)

  if (!visible) return null

  const intentarParsear = () => {
    const limpio = texto.trim()
    if (!limpio) {
      onError("Pega el JSON primero.")
      return
    }
    // Intentar extraer JSON de code fences si los tiene
    let jsonStr = limpio
    const fenceMatch = limpio.match(/```(?:json)?\s*([\s\S]*?)```/)
    if (fenceMatch) jsonStr = fenceMatch[1].trim()

    try {
      const parsed = JSON.parse(jsonStr)
      onParsed(parsed)
      setParseOk(true)
      setTimeout(() => setParseOk(false), 2000)
    } catch {
      onError("El texto no es JSON válido. Verifica que no tenga errores de formato.")
    }
  }

  return (
    <div className="mt-3 rounded-[10px] border border-border bg-background/50 p-3">
      <label className="block mb-1.5 text-[10.5px] font-bold uppercase tracking-wide text-muted-foreground">
        Pegar JSON generado (ChatGPT, NotebookLM u otra IA)
      </label>
      <textarea
        value={texto}
        onChange={e => { setTexto(e.target.value); setParseOk(false) }}
        rows={5}
        placeholder={'Pega aquí el JSON completo que te devolvió la IA...\n\nEj: { "secciones": [...] }'}
        className="w-full resize-y rounded border border-border bg-background px-3 py-2 text-[11px] font-mono outline-none focus:border-primary"
      />
      <div className="mt-2 flex items-center gap-2">
        <button
          type="button"
          onClick={intentarParsear}
          disabled={!texto.trim()}
          className={cn(
            "flex items-center gap-1.5 rounded-[8px] px-4 py-2 text-[12px] font-bold transition",
            parseOk
              ? "bg-emerald-600 text-white"
              : "bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50"
          )}
        >
          {parseOk ? (
            <><CheckCircle2 className="h-3.5 w-3.5" /> Parseado</>
          ) : (
            <><Wand2 className="h-3.5 w-3.5" /> Aplicar JSON al editor</>
          )}
        </button>
        {texto.trim() && (
          <button
            type="button"
            onClick={() => { setTexto(""); setParseOk(false) }}
            className="text-[11px] font-semibold text-muted-foreground hover:text-foreground"
          >
            Limpiar
          </button>
        )}
      </div>
    </div>
  )
}
