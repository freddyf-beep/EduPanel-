"use client"

// ═══════════════════════════════════════════════════════════════════════════
// IAStructuredModalPrueba — modal de creación de prueba con IA estructurada
// ─────────────────────────────────────────────────────────────────────────
// Modal con formulario estructurado para que el docente parametrice la
// generación de una nueva PruebaTemplate vía IA. Recoge los siguientes
// campos antes de invocar `onSubmit`:
//
//   • tipoEvaluacion   → sumativa | formativa | diagnostica (segmented)
//   • numeroPreguntas  → entero en [1, 50] (number input + validación)
//   • tiposIncluir     → siete tipos de ítem (multi-select, ≥1 requerido)
//   • oasSeleccionados → OAs sugeridos de la unidad activa (checkboxes)
//   • dificultad       → baja | media | alta (segmented)
//   • nivel            → texto libre opcional (ej. "1° Básico")
//
// Características:
//   • "use client" REQUERIDO (estado, efectos y document.addEventListener).
//   • role="dialog" + aria-modal="true" + aria-labelledby al título.
//   • Tecla Escape cierra el modal (deshabilitada mientras `generando`).
//   • Click sobre el backdrop cierra el modal (deshabilitado mientras
//     `generando`).
//   • Validación inline en español: número fuera de rango y "selecciona al
//     menos un tipo" se muestran como errores aria-described bajo cada campo.
//   • Footer con "Cancelar" + "Crear con IA"; el primary muestra spinner y
//     el texto "Generando…" cuando `generando` es true (botón deshabilitado).
//   • Overlay "Generando con IA..." mientras se espera la respuesta del API.
//   • ErrorBanner con botón "Reintentar" si el POST falla.
//   • Acento rose (`--accent-pruebas` / `--accent-pruebas-soft`) en
//     segmented buttons activos, focus rings y botón primary.
//
// Refs: Req 4.3, Req 4.5, Req 4.6, Req 4.7
// ═══════════════════════════════════════════════════════════════════════════

import { useEffect, useId, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Bot, Check, ClipboardCopy, Loader2, Sparkles, Wand2, X } from "lucide-react"

import { cn } from "@/lib/utils"
import { ErrorBanner } from "@/components/edu-panel/evaluaciones/shared/error-banner"
import { CardSkeleton } from "@/components/edu-panel/evaluaciones/shared/loading-skeleton"
import { guardarPrueba, nuevaPrueba, nuevaSeccion, nuevoItem } from "@/lib/pruebas"
import type { PruebaTemplate, SeccionPrueba, ItemPrueba, TipoItem } from "@/lib/pruebas"
import { parseJsonResponse } from "@/lib/ai/copilot"
import type { OAEditado } from "@/lib/curriculo"
import { cargarOAsParaPrueba } from "@/lib/pruebas"
import { RubricaOAEditor } from "@/components/edu-panel/shared/oa-editor"
import { convertirItemIA } from "@/lib/ia-item-converter"

// ─── Tipos exportados ───────────────────────────────────────────────────────

export interface IAStructuredModalPruebaParams {
  tipoEvaluacion: "sumativa" | "formativa" | "diagnostica"
  numeroPreguntas: number
  /** Códigos `TipoItem` (string literals de `lib/pruebas.ts`). */
  tiposIncluir: string[]
  /** Códigos OA como "OA1", "OA2", … */
  oasSeleccionados: string[]
  dificultad: "baja" | "media" | "alta"
  /** Nivel libre, ej. "1° Básico", "2° Medio". Puede estar vacío. */
  nivel: string
}

export interface IAStructuredModalPruebaProps {
  open: boolean
  onClose: () => void
  /**
   * Callback opcional invocado con los parámetros validados antes de llamar
   * al endpoint. Si se omite, el modal gestiona el POST internamente.
   */
  onSubmit?: (params: IAStructuredModalPruebaParams) => void | Promise<void>
  /** OAs disponibles de la unidad actual (para sugerir). */
  oasDisponibles: Array<{ code: string; descripcion: string }>
  /** Curso/unidad context, mostrado como header informativo no editable. */
  cursoLabel?: string
  unidadLabel?: string
  /** Asignatura activa (necesaria para crear la prueba en Firestore). */
  asignatura?: string
  /** Curso activo (necesario para crear la prueba en Firestore). */
  curso?: string
  /** Si está procesando IA externamente, deshabilita el formulario. */
  submitting?: boolean
  /** Unidad activa: el modal la usa para cargar los OAs correctos. */
  unidadId?: string
}

// ─── Constantes del formulario ──────────────────────────────────────────────

type TipoEvaluacion = IAStructuredModalPruebaParams["tipoEvaluacion"]
type Dificultad = IAStructuredModalPruebaParams["dificultad"]

const TIPOS_EVALUACION: Array<{ key: TipoEvaluacion; label: string }> = [
  { key: "sumativa", label: "Sumativa" },
  { key: "formativa", label: "Formativa" },
  { key: "diagnostica", label: "Diagnóstica" },
]

const DIFICULTADES: Array<{ key: Dificultad; label: string }> = [
  { key: "baja", label: "Baja" },
  { key: "media", label: "Media" },
  { key: "alta", label: "Alta" },
]

/**
 * Los siete tipos de `TipoItem` de `lib/pruebas.ts`, con su etiqueta en
 * español para mostrarlas en el multi-select del modal.
 */
const TIPOS_PREGUNTA: Array<{ key: string; label: string }> = [
  { key: "seleccion_multiple", label: "Selección múltiple" },
  { key: "verdadero_falso", label: "Verdadero / Falso" },
  { key: "pareados", label: "Pareados" },
  { key: "ordenar", label: "Ordenar" },
  { key: "completar", label: "Completar" },
  { key: "respuesta_corta", label: "Respuesta corta" },
  { key: "desarrollo", label: "Desarrollo" },
]

const MIN_PREGUNTAS = 1
const MAX_PREGUNTAS = 50
const DEFAULT_PREGUNTAS = 10
const DEFAULT_TIPOS: string[] = ["seleccion_multiple"]
const DEFAULT_TIPO_EVAL: TipoEvaluacion = "sumativa"
const DEFAULT_DIFICULTAD: Dificultad = "media"

// ─── Componente principal ───────────────────────────────────────────────────

export function IAStructuredModalPrueba({
  open,
  onClose,
  onSubmit,
  oasDisponibles,
  cursoLabel,
  unidadLabel,
  asignatura = "",
  curso = "",
  submitting = false,
  unidadId,
}: IAStructuredModalPruebaProps) {
  const titleId = useId()
  const numeroErrorId = useId()
  const tiposErrorId = useId()

  const router = useRouter()

  const [tipoEvaluacion, setTipoEvaluacion] =
    useState<TipoEvaluacion>(DEFAULT_TIPO_EVAL)
  const [numeroInput, setNumeroInput] = useState<string>(
    String(DEFAULT_PREGUNTAS),
  )
  const [tiposIncluir, setTiposIncluir] = useState<string[]>(DEFAULT_TIPOS)
  const [dificultad, setDificultad] = useState<Dificultad>(DEFAULT_DIFICULTAD)
  const [nivel, setNivel] = useState<string>("")
  const [errores, setErrores] = useState<{
    numero?: string
    tipos?: string
  }>({})

  // ── OAs (estado rico, editable como en Rúbricas) ───────────────────────
  const [oas, setOas] = useState<OAEditado[]>([])
  const [oasCargando, setOasCargando] = useState(false)

  // ── Vista: form (rellenar) → choose (elegir modo) → agent (pegar) ──
  const [view, setView] = useState<"form" | "choose" | "agent">("form")
  const [pastedJson, setPastedJson] = useState("")
  const [applying, setApplying] = useState(false)
  const [pasteError, setPasteError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  // ── Estado de generación IA (Tarea 5.3 + 5.4) ───────────────────────────
  const [generando, setGenerando] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  // Guardamos los últimos params para el botón "Reintentar"
  const lastParamsRef = useRef<IAStructuredModalPruebaParams | null>(null)

  const isDisabled = generando || submitting
  // Reset del formulario cada vez que se reabre el modal, para no arrastrar
  // estado entre invocaciones consecutivas (p. ej. distintas unidades).
  useEffect(() => {
    if (!open) return
    setTipoEvaluacion(DEFAULT_TIPO_EVAL)
    setNumeroInput(String(DEFAULT_PREGUNTAS))
    setTiposIncluir(DEFAULT_TIPOS)
    setDificultad(DEFAULT_DIFICULTAD)
    setNivel("")
    setErrores({})
    setErrorMsg(null)
    setGenerando(false)
    lastParamsRef.current = null
    setView("form")
    setPastedJson("")
    setPasteError(null)
    setApplying(false)
    setCopied(false)
  }, [open])

  // ── Cargar OAs sugeridos de la unidad cuando se abre el modal ─────────
  useEffect(() => {
    if (!open) return
    if (!asignatura || !curso) {
      setOas([])
      return
    }
    let cancelled = false
    setOasCargando(true)
    cargarOAsParaPrueba(asignatura, curso, unidadId || "")
      .then(list => {
        if (cancelled) return
        // Pre-selecciona los OAs del tipo "oa" (no OAT transversales)
        setOas(list.map(o => ({ ...o, seleccionado: o.tipo !== "oat" })))
      })
      .catch(() => {
        if (!cancelled) setOas([])
      })
      .finally(() => {
        if (!cancelled) setOasCargando(false)
      })
    return () => {
      cancelled = true
    }
  }, [open, asignatura, curso, unidadId])

  // ── OAs seleccionados (los marcados en el OaEditor) ───────────────
  const oasSeleccionados = useMemo(
    () => oas.filter(o => o.seleccionado),
    [oas],
  )

  // ── Prompt generado para modo Agente ────────────────────────────────
  const agentPrompt = useMemo(
    () =>
      buildPruebaPrompt({
        tipoEvaluacion,
        numeroPreguntas: Number(numeroInput) || DEFAULT_PREGUNTAS,
        tiposIncluir,
        dificultad,
        nivel: nivel.trim(),
        oas: oasSeleccionados.map(o => ({
          code: o.id,
          numero: o.numero,
          descripcion: o.descripcion,
          indicadores: (o.indicadores || [])
            .filter(i => i.seleccionado)
            .map(i => i.texto),
        })),
        asignatura: asignatura || "Sin asignatura",
        curso: curso || "Sin curso",
      }),
    [
      tipoEvaluacion,
      numeroInput,
      tiposIncluir,
      dificultad,
      nivel,
      oasSeleccionados,
      asignatura,
      curso,
    ],
  )

  const handleCopyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(agentPrompt)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      // Fallback silencioso.
    }
  }

  const handleApplyPasted = async () => {
    setPasteError(null)
    setApplying(true)
    try {
      const parsed = parseJsonResponse(pastedJson) as Record<string, unknown>
      console.log("[IAStructuredModalPrueba] JSON parseado:", parsed)
      if (!parsed.secciones) {
        throw new Error(
          "El JSON no tiene la clave 'secciones' (raíz esperada: { secciones: [...] }). " +
          "Asegúrate de pegar la respuesta completa del modelo, sin texto adicional.",
        )
      }
      const base = nuevaPrueba(asignatura || "Sin asignatura", curso || "Sin curso")
      const oasFinales = oas.length > 0 ? oas : undefined
      const prueba: PruebaTemplate = {
        ...base,
        nombre: `Prueba ${tipoEvaluacion} — ${nivel.trim() || curso || ""}`.trim(),
        tipoEvaluacion,
        estado: "borrador",
        unidadNombre: unidadLabel,
        oas: oasFinales,
        metadatosCurriculares: {
          objetivos: oas.filter(o => o.seleccionado).map(o =>
            o.numero ? `OA ${o.numero}: ${o.descripcion}` : o.descripcion,
          ),
          indicadores: oas
            .flatMap(o => o.indicadores || [])
            .filter(i => i.seleccionado)
            .map(i => i.texto),
          objetivosTransversales: oas
            .filter(o => o.seleccionado && o.tipo === "oat")
            .map(o =>
              o.numero ? `OAA ${o.numero}: ${o.descripcion}` : o.descripcion,
            ),
        },
        secciones: buildSecciones(parsed),
        puntajeMaximo: 0,
      }
      console.log("[IAStructuredModalPrueba] Prueba a guardar:", {
        id: prueba.id,
        secciones: prueba.secciones.length,
        items: prueba.secciones.reduce((a, s) => a + s.items.length, 0),
        primerItem: prueba.secciones[0]?.items[0],
      })
      await guardarPrueba(prueba)
      console.log("[IAStructuredModalPrueba] Guardado OK, navegando a:", prueba.id)
      onClose()
      const targetUrl = `/evaluaciones?tab=pruebas&view=editor&pruebaId=${prueba.id}`
      // Forzamos navegación real: router.push a veces no re-renderiza la
      // misma ruta cuando solo cambian los query params. window.location.href
      // siempre navega.
      window.location.href = targetUrl
    } catch (err: any) {
      console.error("[IAStructuredModalPrueba] Error:", err)
      setPasteError(err?.message || "No pude aplicar ese JSON.")
    } finally {
      setApplying(false)
    }
  }

  const isAgent = view === "agent"
  const canApplyPasted = isAgent && pastedJson.trim().length > 0 && !applying

  // Esc cierra el modal (mientras no esté generando).
  useEffect(() => {
    if (!open) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isDisabled) {
        e.preventDefault()
        onClose()
      }
    }
    document.addEventListener("keydown", onKeyDown)
    return () => document.removeEventListener("keydown", onKeyDown)
  }, [open, onClose, isDisabled])

  const subtitulo = useMemo(() => {
    return [cursoLabel, unidadLabel].filter(Boolean).join(" · ")
  }, [cursoLabel, unidadLabel])

  if (!open) return null

  function toggleTipo(tipo: string) {
    setTiposIncluir((prev) =>
      prev.includes(tipo) ? prev.filter((t) => t !== tipo) : [...prev, tipo],
    )
    if (errores.tipos) {
      setErrores((prev) => ({ ...prev, tipos: undefined }))
    }
  }

  function handleNumeroChange(raw: string) {
    // Permitir solo dígitos en el campo, hasta 3 caracteres.
    const sanitized = raw.replace(/[^0-9]/g, "").slice(0, 3)
    setNumeroInput(sanitized)
    if (errores.numero) {
      setErrores((prev) => ({ ...prev, numero: undefined }))
    }
  }

  function validar(): IAStructuredModalPruebaParams | null {
    const next: { numero?: string; tipos?: string } = {}

    const parsed = numeroInput === "" ? NaN : Number(numeroInput)
    const numeroValido =
      Number.isInteger(parsed) &&
      parsed >= MIN_PREGUNTAS &&
      parsed <= MAX_PREGUNTAS

    if (!numeroValido) {
      next.numero = `Ingresa un número entre ${MIN_PREGUNTAS} y ${MAX_PREGUNTAS}.`
    }

    if (tiposIncluir.length === 0) {
      next.tipos = "Selecciona al menos un tipo de pregunta."
    }

    if (next.numero || next.tipos) {
      setErrores(next)
      return null
    }

    setErrores({})
    return {
      tipoEvaluacion,
      numeroPreguntas: parsed,
      tiposIncluir: [...tiposIncluir],
      oasSeleccionados: oasSeleccionados.map(o => o.id),
      dificultad,
      nivel: nivel.trim(),
    }
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (isDisabled) return
    const params = validar()
    if (!params) return
    // Modo legacy: si el caller provee onSubmit, lo invocamos directamente.
    if (onSubmit) {
      await onSubmit(params)
      return
    }
    // Flujo nuevo: tras validar, avanzamos al paso de elegir modo.
    setView("choose")
  }

  function handleChooseMode(mode: "integrated" | "agent") {
    if (mode === "integrated") {
      const params = validar()
      if (!params) {
        setView("form")
        return
      }
      void ejecutarGeneracion(params)
    } else {
      setView("agent")
    }
  }

  async function ejecutarGeneracion(params: IAStructuredModalPruebaParams) {
    lastParamsRef.current = params
    setGenerando(true)
    setErrorMsg(null)

    try {
      // Construir contexto con OAs enriquecidos (descripción + indicadores)
      const oasCtx = oasSeleccionados.map(o => ({
        id: o.id,
        numero: o.numero,
        descripcion: o.descripcion,
        seleccionado: true,
        esPropio: o.esPropio,
        indicadores: (o.indicadores || [])
          .filter(i => i.seleccionado)
          .map(i => ({ id: i.id, texto: i.texto, seleccionado: true })),
        habilidades: [],
      }))

      const body = {
        modo: "prueba_generar" as const,
        tipoDoc: "prueba" as const,
        contexto: {
          asignatura: asignatura || cursoLabel || "Sin asignatura",
          curso: curso || unidadLabel || "Sin curso",
          oas: oasCtx,
          habilidades: [],
          conocimientos: [],
          actitudes: [],
        },
        documentoActual: {
          tipoEvaluacion: params.tipoEvaluacion,
          tiempoMinutos: 90,
          exigencia: 0.6,
          ponderacion: 15,
        },
        instrucciones: [
          `Número de preguntas: ${params.numeroPreguntas}`,
          `Tipos a incluir: ${params.tiposIncluir.join(", ")}`,
          `Dificultad: ${params.dificultad}`,
          params.nivel ? `Nivel: ${params.nivel}` : "",
        ].filter(Boolean).join(". "),
      }

      const res = await fetch("/api/generar-evaluacion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || `Error ${res.status}`)
      }

      const data = await res.json()

      if (data.error) {
        throw new Error(data.message || data.error)
      }

      // Construir PruebaTemplate desde la respuesta
      const base = nuevaPrueba(asignatura || "Sin asignatura", curso || "Sin curso")
      const prueba: PruebaTemplate = {
        ...base,
        nombre: `Prueba ${params.tipoEvaluacion} — ${params.nivel || curso || ""}`.trim(),
        tipoEvaluacion: params.tipoEvaluacion,
        estado: "borrador",
        unidadNombre: unidadLabel,
        oas: oas.length > 0 ? oas : undefined,
        metadatosCurriculares: {
          objetivos: oasSeleccionados.map(o =>
            o.numero ? `OA ${o.numero}: ${o.descripcion}` : o.descripcion,
          ),
          indicadores: oasSeleccionados
            .flatMap(o => o.indicadores || [])
            .filter(i => i.seleccionado)
            .map(i => i.texto),
          objetivosTransversales: oasSeleccionados
            .filter(o => o.tipo === "oat")
            .map(o =>
              o.numero ? `OAA ${o.numero}: ${o.descripcion}` : o.descripcion,
            ),
        },
        secciones: buildSecciones(data),
        puntajeMaximo: 0,
      }

      // Guardar en Firestore y navegar al editor
      await guardarPrueba(prueba)
      onClose()
      router.push(`/evaluaciones?tab=pruebas&view=editor&pruebaId=${prueba.id}`)
    } catch (err: any) {
      setErrorMsg(err?.message || "Error al generar la prueba con IA.")
    } finally {
      setGenerando(false)
    }
  }

  /** Construye secciones desde la respuesta del endpoint o JSON pegado. */
  function buildSecciones(data: Record<string, unknown>): SeccionPrueba[] {
    const rawSecciones = Array.isArray(data.secciones) ? data.secciones : []
    return rawSecciones.map((sec: any, idx: number) => {
      const items: ItemPrueba[] = (Array.isArray(sec.items) ? sec.items : []).map(
        (it: any) => convertirItemIA(it),
      )
      const seccion = nuevaSeccion(idx + 1, sec.tipoPredominante || "mixto")
      return {
        ...seccion,
        titulo: sec.titulo || seccion.titulo,
        instrucciones: sec.instrucciones || seccion.instrucciones,
        items,
      }
    })
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isDisabled) onClose()
      }}
    >
      <div
        className="max-w-lg w-full rounded-[16px] border border-border bg-card p-6 shadow-xl relative"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Loading skeleton mientras se genera (Tarea 5.4) */}
        {generando && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 rounded-[16px] bg-card/95 backdrop-blur-sm">
            <Loader2 aria-hidden="true" className="h-8 w-8 animate-spin text-[var(--accent-pruebas)]" />
            <p className="text-[13px] font-bold text-foreground">Generando con IA...</p>
          </div>
        )}

        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <Sparkles
                aria-hidden="true"
                className="h-4 w-4 text-[var(--accent-pruebas)]"
              />
              <h2
                id={titleId}
                className="text-[16px] font-extrabold tracking-tight text-foreground"
              >
                Crear prueba con IA
              </h2>
            </div>
            {subtitulo ? (
              <p className="mt-1 truncate text-[12.5px] text-muted-foreground">
                {subtitulo}
              </p>
            ) : null}
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={isDisabled}
            aria-label="Cerrar"
            className={cn(
              "grid h-8 w-8 flex-shrink-0 place-items-center rounded-[10px] border border-border bg-card text-muted-foreground",
              "transition-colors hover:bg-muted/60",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:ring-[var(--accent-pruebas)]",
              "disabled:cursor-not-allowed disabled:opacity-60",
            )}
          >
            <X aria-hidden="true" className="h-4 w-4" />
          </button>
        </div>

        {/* Error banner (Tarea 5.4) */}
        {errorMsg && (
          <div className="mt-4">
            <ErrorBanner
              message={errorMsg}
              onRetry={lastParamsRef.current ? () => ejecutarGeneracion(lastParamsRef.current!) : undefined}
              onDismiss={() => setErrorMsg(null)}
            />
          </div>
        )}

        {/* ── Vista: FORM (rellenar parámetros) ─────────────────────── */}
        {view === "form" && (
          <form
            onSubmit={handleSubmit}
            className="mt-5 flex flex-col gap-4"
            noValidate
          >
          {/* Tipo de evaluación */}
          <Field label="Tipo de evaluación">
            <SegmentedGroup
              ariaLabel="Tipo de evaluación"
              value={tipoEvaluacion}
              options={TIPOS_EVALUACION}
              onChange={(v) => setTipoEvaluacion(v)}
              disabled={isDisabled}
            />
          </Field>

          {/* Número de preguntas */}
          <Field
            label="Número de preguntas"
            hint={`Entre ${MIN_PREGUNTAS} y ${MAX_PREGUNTAS}.`}
            error={errores.numero}
            errorId={numeroErrorId}
          >
            <input
              type="number"
              inputMode="numeric"
              min={MIN_PREGUNTAS}
              max={MAX_PREGUNTAS}
              step={1}
              value={numeroInput}
              onChange={(e) => handleNumeroChange(e.target.value)}
              disabled={isDisabled}
              aria-invalid={errores.numero ? true : undefined}
              aria-describedby={errores.numero ? numeroErrorId : undefined}
              className={cn(
                "h-10 w-28 rounded-[10px] border bg-background px-3 text-[13px] font-semibold text-foreground",
                "outline-none transition focus:border-border",
                "focus-visible:ring-2 focus-visible:ring-[var(--accent-pruebas)] focus-visible:ring-offset-1",
                "disabled:cursor-not-allowed disabled:opacity-60",
                errores.numero
                  ? "border-red-400 dark:border-red-500/70"
                  : "border-border",
              )}
            />
          </Field>

          {/* Tipos de preguntas a incluir */}
          <Field
            label="Tipos de preguntas a incluir"
            hint="Selecciona uno o más tipos."
            error={errores.tipos}
            errorId={tiposErrorId}
          >
            <div
              role="group"
              aria-label="Tipos de preguntas"
              aria-describedby={errores.tipos ? tiposErrorId : undefined}
              className="grid grid-cols-1 gap-1.5 sm:grid-cols-2"
            >
              {TIPOS_PREGUNTA.map((t) => {
                const checked = tiposIncluir.includes(t.key)
                return (
                  <CheckboxRow
                    key={t.key}
                    label={t.label}
                    checked={checked}
                    onChange={() => toggleTipo(t.key)}
                    disabled={isDisabled}
                  />
                )
              })}
            </div>
          </Field>

          {/* OAs sugeridos (editor rico estilo Rúbricas) */}
          <Field
            label="OAs y objetivos de la unidad"
            hint={
              oas.length > 0
                ? "Marca los OAs (y sus indicadores) que quieres priorizar. Se usarán para generar la prueba y para alimentar el prompt del agente."
                : "Estos OAs también se incluirán en el prompt cuando uses tu agente externo."
            }
          >
            {oas.length === 0 ? (
              <p className="rounded-[10px] border border-dashed border-border bg-background px-3 py-2.5 text-[12.5px] italic text-muted-foreground">
                {oasCargando
                  ? "Cargando OAs de la unidad…"
                  : "No hay OAs definidos en esta unidad."}
              </p>
            ) : (
              <RubricaOAEditor
                oas={oas}
                onChange={setOas}
                asignatura={asignatura || "Música"}
                cargando={oasCargando}
              />
            )}
          </Field>

          {/* Dificultad */}
          <Field label="Dificultad">
            <SegmentedGroup
              ariaLabel="Dificultad"
              value={dificultad}
              options={DIFICULTADES}
              onChange={(v) => setDificultad(v)}
              disabled={isDisabled}
            />
          </Field>

          {/* Nivel (opcional) */}
          <Field label="Nivel (opcional)">
            <input
              type="text"
              value={nivel}
              onChange={(e) => setNivel(e.target.value.slice(0, 60))}
              maxLength={60}
              disabled={isDisabled}
              placeholder="Ej: 4° Básico"
              className={cn(
                "h-10 w-full rounded-[10px] border border-border bg-background px-3 text-[13px] font-medium text-foreground placeholder:text-muted-foreground",
                "outline-none transition focus:border-border",
                "focus-visible:ring-2 focus-visible:ring-[var(--accent-pruebas)] focus-visible:ring-offset-1",
                "disabled:cursor-not-allowed disabled:opacity-60",
              )}
            />
          </Field>

          {/* Footer */}
          <div className="mt-2 flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
            <button
              type="button"
              onClick={onClose}
              disabled={isDisabled}
              aria-label="Cancelar"
              className={cn(
                "inline-flex items-center justify-center rounded-[10px] border border-border bg-card px-4 py-2 text-[12px] font-medium text-foreground transition-colors hover:bg-muted/60",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:ring-[var(--accent-pruebas)]",
                "disabled:cursor-not-allowed disabled:opacity-60",
              )}
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isDisabled}
              aria-label="Crear con IA"
              className={cn(
                "inline-flex items-center justify-center gap-1.5 rounded-[10px] px-4 py-2 text-[12px] font-bold text-white transition-opacity",
                "bg-[var(--accent-pruebas)] hover:opacity-90",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:ring-[var(--accent-pruebas)]",
                "disabled:cursor-not-allowed disabled:opacity-60",
              )}
            >
              {isDisabled ? (
                <>
                  <Loader2
                    aria-hidden="true"
                    className="h-3.5 w-3.5 animate-spin"
                  />
                  Generando…
                </>
              ) : (
                <>
                  <Sparkles aria-hidden="true" className="h-3.5 w-3.5" />
                  Crear con IA
                </>
              )}
            </button>
          </div>
          </form>
        )}

        {/* ── Vista: CHOOSE MODE (elegir cómo generar) ────────────── */}
        {view === "choose" && (
          <div className="mt-5 flex flex-col gap-3">
            <p className="text-[12px] font-bold text-foreground">
              ¿Cómo quieres generar la prueba?
            </p>
            <p className="text-[11.5px] text-muted-foreground">
              Usaremos los parámetros que completaste (incluidos los OAs
              seleccionados arriba) para construir el contenido.
            </p>
            <button
              type="button"
              onClick={() => handleChooseMode("integrated")}
              className={cn(
                "flex items-start gap-3 rounded-[12px] border border-border bg-card p-4 text-left transition-colors",
                "hover:border-[var(--accent-pruebas)] hover:bg-[var(--accent-pruebas-soft)]/30",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[var(--accent-pruebas)]",
              )}
            >
              <Sparkles className="mt-0.5 h-5 w-5 text-[var(--accent-pruebas)]" />
              <div>
                <div className="text-[13px] font-extrabold text-foreground">
                  IA Integrada (Gemini 1-click)
                </div>
                <div className="text-[11.5px] text-muted-foreground">
                  Más económico. Generamos la prueba con la API key de la
                  página en 1-click.
                </div>
              </div>
            </button>
            <button
              type="button"
              onClick={() => handleChooseMode("agent")}
              className={cn(
                "flex items-start gap-3 rounded-[12px] border border-border bg-card p-4 text-left transition-colors",
                "hover:border-[var(--accent-pruebas)] hover:bg-[var(--accent-pruebas-soft)]/30",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[var(--accent-pruebas)]",
              )}
            >
              <Bot className="mt-0.5 h-5 w-5 text-[var(--accent-pruebas)]" />
              <div>
                <div className="text-[13px] font-extrabold text-foreground">
                  Mi Agente Externo (ChatGPT / Claude)
                </div>
                <div className="text-[11.5px] text-muted-foreground">
                  Te damos un prompt listo para copiar. Tú lo pegas en tu
                  modelo premium y traes la respuesta. Costo en tu cuenta.
                </div>
              </div>
            </button>
            <button
              type="button"
              onClick={() => setView("form")}
              className="text-[11.5px] text-muted-foreground hover:text-foreground self-center"
            >
              ← Volver a editar parámetros
            </button>
          </div>
        )}

        {/* ── Vista: AGENT (prompt copiable + paste) ──────────────── */}
        {view === "agent" && (
          <div className="mt-5 flex flex-col gap-3">
            <div className="rounded-[10px] border border-border bg-background/60 p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-[12px] font-bold text-foreground">
                  1. Copia este prompt y pégalo en tu modelo preferido
                </p>
                <button
                  type="button"
                  onClick={handleCopyPrompt}
                  className="inline-flex items-center gap-1.5 rounded-[8px] border border-[var(--accent-pruebas)]/30 bg-[var(--accent-pruebas-soft)] px-2.5 py-1.5 text-[11.5px] font-bold text-[var(--accent-pruebas)] hover:opacity-90 transition-opacity"
                >
                  {copied ? (
                    <Check className="h-3.5 w-3.5" />
                  ) : (
                    <ClipboardCopy className="h-3.5 w-3.5" />
                  )}
                  {copied ? "¡Copiado!" : "Copiar prompt"}
                </button>
              </div>
              <textarea
                readOnly
                value={agentPrompt}
                className="h-[200px] w-full resize-none rounded-[8px] border border-border bg-muted/30 p-2.5 font-mono text-[11px] leading-relaxed outline-none"
              />
            </div>

            <div className="rounded-[10px] border border-border bg-background/60 p-3">
              <p className="text-[12px] font-bold text-foreground">
                2. Pega la respuesta del modelo (JSON)
              </p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                Acepta JSON puro o con fences. Detectamos la estructura
                automáticamente.
              </p>
              <textarea
                value={pastedJson}
                onChange={e => {
                  setPastedJson(e.target.value)
                  setPasteError(null)
                }}
                placeholder='{"secciones": [...]}'
                className="mt-2 h-[150px] w-full resize-y rounded-[8px] border border-border bg-background p-2.5 font-mono text-[11px] leading-relaxed outline-none focus:border-[var(--accent-pruebas)]"
              />
              {pasteError && (
                <p className="mt-2 text-[11.5px] font-semibold text-red-600 dark:text-red-300">
                  {pasteError}
                </p>
              )}
              <button
                type="button"
                onClick={handleApplyPasted}
                disabled={!canApplyPasted}
                className={cn(
                  "mt-3 inline-flex w-full items-center justify-center gap-2 rounded-[10px] px-4 py-2 text-[12px] font-bold text-white transition-opacity",
                  "bg-[var(--accent-pruebas)] hover:opacity-90",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:ring-[var(--accent-pruebas)]",
                  "disabled:cursor-not-allowed disabled:opacity-60",
                )}
              >
                {applying ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Wand2 className="h-3.5 w-3.5" />
                )}
                {applying ? "Aplicando…" : "Aplicar JSON a la prueba"}
              </button>
            </div>

            <button
              type="button"
              onClick={() => setView("choose")}
              className="text-[11.5px] text-muted-foreground hover:text-foreground self-center"
            >
              ← Volver a elegir modo
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

export default IAStructuredModalPrueba

// ─── Subcomponentes presentacionales ────────────────────────────────────────

interface FieldProps {
  label: string
  hint?: string
  error?: string
  errorId?: string
  children: React.ReactNode
}

function Field({ label, hint, error, errorId, children }: FieldProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[12px] font-black uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      {children}
      {error ? (
        <p
          id={errorId}
          role="alert"
          className="text-[11.5px] font-semibold text-red-600 dark:text-red-300"
        >
          {error}
        </p>
      ) : hint ? (
        <p className="text-[11.5px] text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  )
}

interface SegmentedGroupProps<T extends string> {
  ariaLabel: string
  value: T
  options: Array<{ key: T; label: string }>
  onChange: (next: T) => void
  disabled?: boolean
}

function SegmentedGroup<T extends string>({
  ariaLabel,
  value,
  options,
  onChange,
  disabled,
}: SegmentedGroupProps<T>) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className="flex flex-wrap gap-1 rounded-[10px] border border-border bg-background p-1"
    >
      {options.map((opt) => {
        const active = value === opt.key
        return (
          <button
            key={opt.key}
            type="button"
            aria-pressed={active}
            disabled={disabled}
            onClick={() => onChange(opt.key)}
            className={cn(
              "flex-1 whitespace-nowrap rounded-[8px] px-3 py-1.5 text-[12px] font-bold transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-[var(--accent-pruebas)]",
              "disabled:cursor-not-allowed disabled:opacity-60",
              active
                ? "bg-[var(--accent-pruebas-soft)] text-[var(--accent-pruebas)]"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}

interface CheckboxRowProps {
  label: React.ReactNode
  checked: boolean
  onChange: () => void
  disabled?: boolean
}

function CheckboxRow({ label, checked, onChange, disabled }: CheckboxRowProps) {
  return (
    <label
      className={cn(
        "flex cursor-pointer items-center gap-2 rounded-[8px] px-2 py-1.5 transition-colors hover:bg-muted/40",
        disabled && "cursor-not-allowed opacity-60 hover:bg-transparent",
      )}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        disabled={disabled}
        className={cn(
          "h-4 w-4 flex-shrink-0 rounded border-border text-[var(--accent-pruebas)]",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-[var(--accent-pruebas)]",
          "accent-[var(--accent-pruebas)]",
        )}
      />
      <span className="min-w-0 flex-1 text-[13px] font-medium text-foreground">
        {label}
      </span>
    </label>
  )
}

// ─── Constructor del prompt para modo Agente ────────────────────────────────

interface BuildPruebaPromptInput {
  tipoEvaluacion: TipoEvaluacion
  numeroPreguntas: number
  tiposIncluir: string[]
  dificultad: Dificultad
  nivel: string
  oas: Array<{ code: string; descripcion: string }>
  asignatura: string
  curso: string
}

function buildPruebaPrompt(input: BuildPruebaPromptInput): string {
  const oasTexto =
    input.oas.length > 0
      ? input.oas.map(o => `- ${o.code}: ${o.descripcion}`).join("\n")
      : "(sin OAs seleccionados)"

  return `Eres un asistente que diseña pruebas para profesores chilenos.
Devuelve EXCLUSIVAMENTE un objeto JSON válido con la siguiente estructura, sin markdown ni explicaciones previas o posteriores:

{
  "secciones": [
    {
      "titulo": "string",
      "instrucciones": "string",
      "tipoPredominante": "seleccion_multiple" | "verdadero_falso" | "pareados" | "ordenar" | "completar" | "respuesta_corta" | "desarrollo" | "mixto",
      "items": [
        {
          "tipo": "seleccion_multiple" | "verdadero_falso" | "pareados" | "ordenar" | "completar" | "respuesta_corta" | "desarrollo",
          "enunciado": "string",
          "puntaje": number,
          "oaVinculado": "OA1" | "OA2" | ...,
          "alternativas?": [{ "id": "a1", "texto": "...", "esCorrecta": boolean }],
          "respuestaCorrecta?": boolean,
          "pideJustificacion?": boolean,
          "afirmaciones?": [{ "id": "af1", "texto": "...", "correcta": boolean }],
          "columnaA?": [{ "id": "c1a", "texto": "..." }],
          "columnaB?": [{ "id": "c1b", "texto": "...", "correctaParaAId": "c1a" }],
          "pasos?": [{ "id": "p1", "texto": "..." }],
          "textoConBlancos?": "string con __ para los espacios en blanco",
          "respuestas?": ["palabra1", "palabra2"],
          "bancoPalabras?": ["op1", "op2"],
          "respuestaEsperada?": "string",
          "lineasRespuesta?": number,
          "pautaCorreccion?": "string",
          "criterios?": [{ "id": "crit1", "texto": "...", "puntaje": number }]
        }
      ]
    }
  ]
}

Parámetros del docente:
- Asignatura: ${input.asignatura}
- Curso: ${input.curso}
- Tipo de evaluación: ${input.tipoEvaluacion}
- Número total de preguntas: ${input.numeroPreguntas}
- Tipos de ítem a incluir: ${input.tiposIncluir.join(", ")}
- Dificultad: ${input.dificultad}
- Nivel: ${input.nivel || "no especificado"}

OAs sugeridos (priorízalos si son relevantes):
${oasTexto}

Instrucciones:
- Distribuye el número de preguntas entre los tipos seleccionados.
- Cada ítem debe ser claro, sin ambigüedad, y adecuado al nivel escolar chileno.
- Vincula cada ítem a un OA cuando sea posible.
- Asigna puntajes coherentes (sugerido 1-3 pts por ítem).
- IMPORTANTE: responde SOLO con el JSON, sin \`\`\`json ni texto adicional.`
}
