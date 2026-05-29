"use client"

// ═══════════════════════════════════════════════════════════════════════════
// IAStructuredModalGuia — modal de creación de guía con IA
// ─────────────────────────────────────────────────────────────────────────
// Formulario estructurado que recoge los parámetros para generar una guía
// con IA: tipo de guía, objetivo, número de secciones, tipos de actividades,
// OAs sugeridos de la unidad activa y duración. Al confirmar, llama al
// endpoint `/api/generar-evaluacion`, guarda la guía en Firestore y navega
// al editor.
//
// Características:
//  • "use client" REQUERIDO (estado, efectos, document.addEventListener).
//  • Acento VIOLET (`--accent-guias` / `--accent-guias-soft`) coherente con
//    el flujo Guías.
//  • Validación inline en español.
//  • Overlay "Generando con IA..." mientras se espera la respuesta del API.
//  • ErrorBanner con botón "Reintentar" si el POST falla.
//  • Tecla `Escape` cierra el modal (no envía).
//  • Click en backdrop cierra el modal.
//
// Refs: Req 4.4, Req 4.5, Req 4.6, Req 4.7
// ═══════════════════════════════════════════════════════════════════════════

import { useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Sparkles, X, Loader2 } from "lucide-react"

import { cn } from "@/lib/utils"
import { ErrorBanner } from "@/components/edu-panel/evaluaciones/shared/error-banner"
import { CardSkeleton } from "@/components/edu-panel/evaluaciones/shared/loading-skeleton"
import { guardarGuia, nuevaGuia, nuevaSeccionGuia, nuevaActividadGuia } from "@/lib/guias"
import type { GuiaTemplate, SeccionGuia, TipoActividadGuia } from "@/lib/guias"

// ─── Tipos públicos ─────────────────────────────────────────────────────────

export type TipoGuiaIA =
  | "aprendizaje"
  | "refuerzo"
  | "ejercitacion"
  | "evaluacion_formativa"

export interface IAStructuredModalGuiaParams {
  tipoGuia: TipoGuiaIA
  objetivo: string
  numeroSecciones: number
  tiposActividades: string[]
  oasSeleccionados: string[]
  duracionMin: number
}

export interface IAStructuredModalGuiaProps {
  open: boolean
  onClose: () => void
  /**
   * Callback opcional invocado con los parámetros validados antes de llamar
   * al endpoint. Si se omite, el modal gestiona el POST internamente.
   */
  onSubmit?: (params: IAStructuredModalGuiaParams) => void | Promise<void>
  /** OAs disponibles en la unidad activa para sugerir como vinculación. */
  oasDisponibles: Array<{ code: string; descripcion: string }>
  /** Etiqueta del curso activo (mostrada en el header como contexto). */
  cursoLabel?: string
  /** Etiqueta de la unidad activa (mostrada en el header como contexto). */
  unidadLabel?: string
  /** Asignatura activa (necesaria para crear la guía en Firestore). */
  asignatura?: string
  /** Curso activo (necesario para crear la guía en Firestore). */
  curso?: string
  /** Si es `true`, el formulario se bloquea externamente. */
  submitting?: boolean
}

// ─── Constantes de configuración ────────────────────────────────────────────

const TIPOS_GUIA: Array<{ value: TipoGuiaIA; label: string }> = [
  { value: "aprendizaje", label: "Aprendizaje" },
  { value: "refuerzo", label: "Refuerzo" },
  { value: "ejercitacion", label: "Ejercitación" },
  { value: "evaluacion_formativa", label: "Eval. formativa" },
]

// 13 tipos según `TipoActividadGuia` en `lib/guias.ts`.
const TIPOS_ACTIVIDAD: Array<{ value: string; label: string }> = [
  { value: "seleccion_multiple", label: "Selección múltiple" },
  { value: "verdadero_falso", label: "Verdadero / Falso" },
  { value: "completar", label: "Completar" },
  { value: "respuesta_corta", label: "Respuesta corta" },
  { value: "ordenar", label: "Ordenar" },
  { value: "pareados", label: "Pareados" },
  { value: "encerrar", label: "Encerrar" },
  { value: "marcar", label: "Marcar con X" },
  { value: "colorear", label: "Colorear" },
  { value: "dibujar", label: "Dibujar" },
  { value: "investigar", label: "Investigar" },
  { value: "sopa_letras", label: "Sopa de letras" },
  { value: "abierta", label: "Pregunta abierta" },
]

const OBJETIVO_MIN = 10
const OBJETIVO_MAX = 500
const SECCIONES_MIN = 1
const SECCIONES_MAX = 20
const DURACION_MIN = 15
const DURACION_MAX = 180

// ─── Componente principal ───────────────────────────────────────────────────

export function IAStructuredModalGuia({
  open,
  onClose,
  onSubmit,
  oasDisponibles,
  cursoLabel,
  unidadLabel,
  asignatura = "",
  curso = "",
  submitting = false,
}: IAStructuredModalGuiaProps) {
  // ── Estado del formulario ────────────────────────────────────────────────
  const [tipoGuia, setTipoGuia] = useState<TipoGuiaIA>("aprendizaje")
  const [objetivo, setObjetivo] = useState("")
  const [numeroSecciones, setNumeroSecciones] = useState<number>(3)
  const [tiposActividades, setTiposActividades] = useState<string[]>([
    "seleccion_multiple",
    "completar",
  ])
  const [oasSeleccionados, setOasSeleccionados] = useState<string[]>([])
  const [duracionMin, setDuracionMin] = useState<number>(45)

  // ── Errores de validación ────────────────────────────────────────────────
  const [errors, setErrors] = useState<{
    objetivo?: string
    numeroSecciones?: string
    tiposActividades?: string
    duracionMin?: string
  }>({})

  const [submitAttempted, setSubmitAttempted] = useState(false)

  // ── Estado de generación IA (Tarea 5.3 + 5.4) ───────────────────────────
  const [generando, setGenerando] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const lastParamsRef = useRef<IAStructuredModalGuiaParams | null>(null)

  const isDisabled = generando || submitting

  const router = useRouter()
  const dialogRef = useRef<HTMLDivElement | null>(null)
  const objetivoRef = useRef<HTMLTextAreaElement | null>(null)

  // Reset del formulario cuando se abre/cierra el modal.
  useEffect(() => {
    if (!open) {
      setSubmitAttempted(false)
      setErrors({})
      setErrorMsg(null)
      setGenerando(false)
      lastParamsRef.current = null
    }
  }, [open])

  // Auto-focus en el textarea al abrir.
  useEffect(() => {
    if (!open) return
    const raf = requestAnimationFrame(() => {
      objetivoRef.current?.focus()
    })
    return () => cancelAnimationFrame(raf)
  }, [open])

  // ESC cierra el modal (siempre que no esté enviando).
  useEffect(() => {
    if (!open) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault()
        if (!isDisabled) onClose()
      }
    }
    document.addEventListener("keydown", onKeyDown)
    return () => document.removeEventListener("keydown", onKeyDown)
  }, [open, onClose, isDisabled])

  // ── Validación derivada (re-evaluada en cada cambio si ya se intentó) ────
  const objetivoLen = objetivo.trim().length

  const computedErrors = useMemo(() => {
    const e: typeof errors = {}
    if (objetivoLen < OBJETIVO_MIN) {
      e.objetivo = `El objetivo debe tener al menos ${OBJETIVO_MIN} caracteres.`
    } else if (objetivoLen > OBJETIVO_MAX) {
      e.objetivo = `El objetivo no puede superar los ${OBJETIVO_MAX} caracteres.`
    }
    if (
      !Number.isFinite(numeroSecciones) ||
      numeroSecciones < SECCIONES_MIN ||
      numeroSecciones > SECCIONES_MAX
    ) {
      e.numeroSecciones = `Indica un número entre ${SECCIONES_MIN} y ${SECCIONES_MAX}.`
    }
    if (tiposActividades.length === 0) {
      e.tiposActividades = "Selecciona al menos un tipo de actividad."
    }
    if (
      !Number.isFinite(duracionMin) ||
      duracionMin < DURACION_MIN ||
      duracionMin > DURACION_MAX
    ) {
      e.duracionMin = `Indica una duración entre ${DURACION_MIN} y ${DURACION_MAX} minutos.`
    }
    return e
  }, [objetivoLen, numeroSecciones, tiposActividades, duracionMin])

  const isValid = Object.keys(computedErrors).length === 0
  const visibleErrors = submitAttempted ? computedErrors : errors

  // ── Handlers ─────────────────────────────────────────────────────────────
  const toggleActividad = (value: string) => {
    setTiposActividades((prev) =>
      prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value],
    )
  }

  const toggleOA = (code: string) => {
    setOasSeleccionados((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code],
    )
  }

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault()
    setSubmitAttempted(true)
    setErrors(computedErrors)
    if (!isValid || isDisabled) return
    const params: IAStructuredModalGuiaParams = {
      tipoGuia,
      objetivo: objetivo.trim(),
      numeroSecciones,
      tiposActividades,
      oasSeleccionados,
      duracionMin,
    }
    await ejecutarGeneracion(params)
  }

  async function ejecutarGeneracion(params: IAStructuredModalGuiaParams) {
    // Si el caller provee onSubmit externo, delegamos (modo legacy).
    if (onSubmit) {
      await onSubmit(params)
      return
    }

    lastParamsRef.current = params
    setGenerando(true)
    setErrorMsg(null)

    try {
      const oasCtx = params.oasSeleccionados.map(code => ({
        id: code,
        numero: code.replace(/\D/g, ""),
        descripcion: oasDisponibles.find(o => o.code === code)?.descripcion ?? code,
        seleccionado: true,
        esPropio: false,
        indicadores: [],
        habilidades: [],
      }))

      const body = {
        modo: "guia_generar" as const,
        tipoDoc: "guia" as const,
        contexto: {
          asignatura: asignatura || cursoLabel || "Sin asignatura",
          curso: curso || unidadLabel || "Sin curso",
          oas: oasCtx,
          habilidades: [],
          conocimientos: [],
          actitudes: [],
        },
        documentoActual: {
          tipoGuia: params.tipoGuia,
          objetivo: params.objetivo,
          tiempoMinutos: params.duracionMin,
        },
        instrucciones: [
          `Número de secciones: ${params.numeroSecciones}`,
          `Tipos de actividades: ${params.tiposActividades.join(", ")}`,
          `Duración: ${params.duracionMin} minutos`,
        ].join(". "),
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

      // Construir GuiaTemplate desde la respuesta
      const base = nuevaGuia(asignatura || "Sin asignatura", curso || "Sin curso")
      const guia: GuiaTemplate = {
        ...base,
        nombre: `Guía ${params.tipoGuia} — ${params.objetivo.slice(0, 40)}`.trim(),
        tipoGuia: params.tipoGuia,
        objetivo: params.objetivo,
        tiempoMinutos: params.duracionMin,
        estado: "borrador",
        unidadNombre: unidadLabel,
        secciones: buildSecciones(data),
        puntajeMaximo: 0,
      }

      await guardarGuia(guia)
      onClose()
      router.push(`/evaluaciones?tab=guias&view=editor&guiaId=${guia.id}`)
    } catch (err: any) {
      setErrorMsg(err?.message || "Error al generar la guía con IA.")
    } finally {
      setGenerando(false)
    }
  }

  function buildSecciones(data: Record<string, unknown>): SeccionGuia[] {
    const rawSecciones = Array.isArray(data.seccionesGuia) ? data.seccionesGuia : []
    return rawSecciones.map((sec: any, idx: number) => {
      const actividades = (Array.isArray(sec.actividades) ? sec.actividades : []).map((act: any) => {
        const tipo = (act.tipo || "abierta") as TipoActividadGuia
        const base = nuevaActividadGuia(tipo, act.puntaje)
        return { ...base, ...act, tipo }
      })
      const seccion = nuevaSeccionGuia(idx + 1)
      return {
        ...seccion,
        titulo: sec.titulo || seccion.titulo,
        descripcion: sec.descripcion || "",
        contenido: sec.contenidoHtml
          ? [{ id: `bloque_${idx}`, tipo: "texto" as const, data: { html: sec.contenidoHtml } }]
          : [],
        actividades,
      }
    })
  }

  if (!open) return null

  const headerSubtitle = [cursoLabel, unidadLabel].filter(Boolean).join(" · ")

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Crear guía con IA"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-0 sm:p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isDisabled) onClose()
      }}
    >
      <div
        ref={dialogRef}
        className={cn(
          "relative flex h-full w-full max-w-2xl flex-col overflow-hidden bg-card shadow-xl",
          "sm:h-auto sm:max-h-[90vh] sm:rounded-[16px] sm:border sm:border-border",
        )}
      >
        {/* Loading skeleton mientras se genera (Tarea 5.4) */}
        {generando && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 rounded-[16px] bg-card/95 backdrop-blur-sm">
            <Loader2 aria-hidden="true" className="h-8 w-8 animate-spin" style={{ color: "var(--accent-guias)" }} />
            <p className="text-[13px] font-bold text-foreground">Generando con IA...</p>
          </div>
        )}

        {/* Header */}
        <header className="flex items-start justify-between gap-3 border-b border-border bg-card px-5 py-4 sm:px-6 sm:py-5">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <Sparkles
                aria-hidden="true"
                className="h-4 w-4"
                style={{ color: "var(--accent-guias)" }}
              />
              <h2
                id="ia-structured-modal-guia-title"
                className="text-[18px] font-black tracking-tight text-foreground"
              >
                Crear guía con IA
              </h2>
            </div>
            {headerSubtitle ? (
              <p className="mt-0.5 truncate text-[13px] text-muted-foreground">
                {headerSubtitle}
              </p>
            ) : (
              <p className="mt-0.5 text-[13px] text-muted-foreground">
                Configura los parámetros y la IA generará una guía base como
                borrador.
              </p>
            )}
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            disabled={isDisabled}
            className={cn(
              "grid h-9 w-9 flex-shrink-0 place-items-center rounded-[10px] border border-border bg-card text-muted-foreground",
              "transition-colors hover:bg-muted/60 disabled:opacity-50",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:ring-foreground",
            )}
          >
            <X aria-hidden="true" className="h-4 w-4" />
          </button>
        </header>

        {/* Body con scroll */}
        <form
          onSubmit={handleSubmit}
          className="flex flex-1 flex-col overflow-hidden"
          noValidate
        >
          <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4 sm:px-6 sm:py-5">
            {/* Error banner (Tarea 5.4) */}
            {errorMsg && (
              <ErrorBanner
                message={errorMsg}
                onRetry={lastParamsRef.current ? () => ejecutarGeneracion(lastParamsRef.current!) : undefined}
                onDismiss={() => setErrorMsg(null)}
              />
            )}
            {/* Tipo de guía */}
            <Field
              id="tipoGuia"
              label="Tipo de guía"
            >
              <div
                role="radiogroup"
                aria-label="Tipo de guía"
                className="grid grid-cols-2 gap-2 sm:grid-cols-4"
              >
                {TIPOS_GUIA.map((t) => (
                  <SegmentButton
                    key={t.value}
                    selected={tipoGuia === t.value}
                    onClick={() => setTipoGuia(t.value)}
                    label={t.label}
                  />
                ))}
              </div>
            </Field>

            {/* Objetivo */}
            <Field
              id="objetivo"
              label="Objetivo de la guía"
              hint={`${objetivoLen}/${OBJETIVO_MAX}`}
              error={visibleErrors.objetivo}
            >
              <textarea
                ref={objetivoRef}
                id="objetivo"
                rows={3}
                value={objetivo}
                onChange={(e) => setObjetivo(e.target.value)}
                aria-invalid={Boolean(visibleErrors.objetivo)}
                aria-describedby={
                  visibleErrors.objetivo ? "objetivo-error" : "objetivo-hint"
                }
                placeholder="Ej: Reconocer los componentes del sistema solar y describir su movimiento."
                maxLength={OBJETIVO_MAX + 50}
                className={cn(
                  "w-full resize-y rounded-[10px] border border-border bg-background px-3 py-2 text-[13px] text-foreground",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                  visibleErrors.objetivo
                    ? "border-rose-400"
                    : "focus-visible:ring-[var(--accent-guias)]",
                )}
              />
            </Field>

            {/* Grid: secciones + duración */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field
                id="numeroSecciones"
                label="Número de secciones"
                hint={`Entre ${SECCIONES_MIN} y ${SECCIONES_MAX}`}
                error={visibleErrors.numeroSecciones}
              >
                <input
                  id="numeroSecciones"
                  type="number"
                  inputMode="numeric"
                  min={SECCIONES_MIN}
                  max={SECCIONES_MAX}
                  step={1}
                  value={Number.isFinite(numeroSecciones) ? numeroSecciones : ""}
                  onChange={(e) => {
                    const n = Number.parseInt(e.target.value, 10)
                    setNumeroSecciones(Number.isFinite(n) ? n : NaN)
                  }}
                  aria-invalid={Boolean(visibleErrors.numeroSecciones)}
                  className={cn(
                    "w-full rounded-[10px] border border-border bg-background px-3 py-2 text-[13px] text-foreground",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                    visibleErrors.numeroSecciones
                      ? "border-rose-400"
                      : "focus-visible:ring-[var(--accent-guias)]",
                  )}
                />
              </Field>

              <Field
                id="duracionMin"
                label="Duración estimada"
                hint={`Entre ${DURACION_MIN} y ${DURACION_MAX} min`}
                error={visibleErrors.duracionMin}
              >
                <div className="relative">
                  <input
                    id="duracionMin"
                    type="number"
                    inputMode="numeric"
                    min={DURACION_MIN}
                    max={DURACION_MAX}
                    step={5}
                    value={Number.isFinite(duracionMin) ? duracionMin : ""}
                    onChange={(e) => {
                      const n = Number.parseInt(e.target.value, 10)
                      setDuracionMin(Number.isFinite(n) ? n : NaN)
                    }}
                    aria-invalid={Boolean(visibleErrors.duracionMin)}
                    className={cn(
                      "w-full rounded-[10px] border border-border bg-background px-3 py-2 pr-12 text-[13px] text-foreground",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                      visibleErrors.duracionMin
                        ? "border-rose-400"
                        : "focus-visible:ring-[var(--accent-guias)]",
                    )}
                  />
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[12px] font-bold text-muted-foreground"
                  >
                    min
                  </span>
                </div>
              </Field>
            </div>

            {/* Tipos de actividades */}
            <Field
              id="tiposActividades"
              label="Tipos de actividades"
              hint={`${tiposActividades.length} seleccionados`}
              error={visibleErrors.tiposActividades}
            >
              <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 sm:grid-cols-3">
                {TIPOS_ACTIVIDAD.map((t) => (
                  <CheckRow
                    key={t.value}
                    checked={tiposActividades.includes(t.value)}
                    onChange={() => toggleActividad(t.value)}
                    label={t.label}
                  />
                ))}
              </div>
            </Field>

            {/* OAs sugeridos */}
            <Field
              id="oas"
              label="OAs sugeridos"
              hint={
                oasDisponibles.length === 0
                  ? "Sin OAs disponibles para esta unidad"
                  : `${oasSeleccionados.length} de ${oasDisponibles.length} seleccionados`
              }
            >
              {oasDisponibles.length === 0 ? (
                <div className="rounded-[10px] border border-dashed border-border bg-muted/40 px-3 py-3 text-[12px] text-muted-foreground">
                  Selecciona una unidad con OAs configurados para vincular
                  actividades al currículum.
                </div>
              ) : (
                <div className="max-h-40 overflow-y-auto rounded-[10px] border border-border bg-background">
                  <ul className="divide-y divide-border">
                    {oasDisponibles.map((oa) => (
                      <li key={oa.code}>
                        <CheckRow
                          checked={oasSeleccionados.includes(oa.code)}
                          onChange={() => toggleOA(oa.code)}
                          label={
                            <span className="flex min-w-0 items-start gap-2">
                              <span className="rounded-md border border-border bg-card px-1.5 py-0.5 text-[10.5px] font-black text-foreground">
                                {oa.code}
                              </span>
                              <span className="min-w-0 flex-1 text-[12px] leading-5 text-muted-foreground">
                                {oa.descripcion}
                              </span>
                            </span>
                          }
                          dense
                        />
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </Field>
          </div>

          {/* Footer */}
          <footer className="flex items-center justify-end gap-2 border-t border-border bg-card px-5 py-3 sm:px-6 sm:py-4">
            <button
              type="button"
              onClick={onClose}
              disabled={isDisabled}
              className={cn(
                "rounded-[10px] border border-border bg-card px-4 py-2 text-[12.5px] font-bold text-foreground",
                "transition-colors hover:bg-muted/60 disabled:opacity-50",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:ring-foreground",
              )}
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isDisabled}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-[10px] px-4 py-2 text-[12.5px] font-bold text-white shadow-sm",
                "transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:ring-[var(--accent-guias)]",
              )}
              style={{ backgroundColor: "var(--accent-guias)" }}
            >
              {isDisabled ? (
                <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles aria-hidden="true" className="h-4 w-4" />
              )}
              Crear con IA
            </button>
          </footer>
        </form>
      </div>
    </div>
  )
}

export default IAStructuredModalGuia

// ─── Subcomponentes ─────────────────────────────────────────────────────────

interface FieldProps {
  id: string
  label: string
  hint?: string
  error?: string
  children: React.ReactNode
}

function Field({ id, label, hint, error, children }: FieldProps) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <label
          htmlFor={id}
          className="text-[12px] font-black uppercase tracking-wide text-foreground"
        >
          {label}
        </label>
        {hint ? (
          <span
            id={`${id}-hint`}
            className="text-[11px] font-bold text-muted-foreground"
          >
            {hint}
          </span>
        ) : null}
      </div>
      {children}
      {error ? (
        <p
          id={`${id}-error`}
          role="alert"
          className="mt-1 text-[11.5px] font-bold text-rose-600 dark:text-rose-400"
        >
          {error}
        </p>
      ) : null}
    </div>
  )
}

interface SegmentButtonProps {
  selected: boolean
  onClick: () => void
  label: string
}

function SegmentButton({ selected, onClick, label }: SegmentButtonProps) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onClick}
      className={cn(
        "rounded-[10px] border px-3 py-2 text-[12.5px] font-bold transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:ring-[var(--accent-guias)]",
        selected
          ? "border-[var(--accent-guias)] text-[var(--accent-guias)]"
          : "border-border bg-card text-foreground hover:bg-muted/60",
      )}
      style={
        selected ? { backgroundColor: "var(--accent-guias-soft)" } : undefined
      }
    >
      {label}
    </button>
  )
}

interface CheckRowProps {
  checked: boolean
  onChange: () => void
  label: React.ReactNode
  dense?: boolean
}

function CheckRow({ checked, onChange, label, dense }: CheckRowProps) {
  return (
    <label
      className={cn(
        "flex cursor-pointer items-center gap-2 rounded-[8px] text-[12.5px] text-foreground transition-colors",
        dense ? "px-3 py-2 hover:bg-muted/40" : "px-1 py-1 hover:bg-muted/40",
      )}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        className={cn(
          "h-4 w-4 flex-shrink-0 cursor-pointer rounded border-border",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-offset-background focus-visible:ring-[var(--accent-guias)]",
        )}
        style={{ accentColor: "var(--accent-guias)" }}
      />
      <span className="min-w-0 flex-1">{label}</span>
    </label>
  )
}
