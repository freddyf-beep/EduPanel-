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
import { Loader2, Sparkles, X } from "lucide-react"

import { cn } from "@/lib/utils"
import { apiFetch } from "@/lib/api-client"
import { ErrorBanner } from "@/components/edu-panel/evaluaciones/shared/error-banner"
import { CardSkeleton } from "@/components/edu-panel/evaluaciones/shared/loading-skeleton"
import { guardarPrueba, nuevaPrueba, nuevaSeccion, nuevoItem } from "@/lib/pruebas"
import type { PruebaTemplate, SeccionPrueba, ItemPrueba, TipoItem } from "@/lib/pruebas"

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
  const [oasSeleccionados, setOasSeleccionados] = useState<string[]>([])
  const [dificultad, setDificultad] = useState<Dificultad>(DEFAULT_DIFICULTAD)
  const [nivel, setNivel] = useState<string>("")
  const [errores, setErrores] = useState<{
    numero?: string
    tipos?: string
  }>({})

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
    setOasSeleccionados([])
    setDificultad(DEFAULT_DIFICULTAD)
    setNivel("")
    setErrores({})
    setErrorMsg(null)
    setGenerando(false)
    lastParamsRef.current = null
  }, [open])

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

  function toggleOA(code: string) {
    setOasSeleccionados((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code],
    )
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
      oasSeleccionados: [...oasSeleccionados],
      dificultad,
      nivel: nivel.trim(),
    }
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (isDisabled) return
    const params = validar()
    if (!params) return
    await ejecutarGeneracion(params)
  }

  async function ejecutarGeneracion(params: IAStructuredModalPruebaParams) {
    // Si el caller provee onSubmit externo, delegamos (modo legacy).
    if (onSubmit) {
      await onSubmit(params)
      return
    }

    lastParamsRef.current = params
    setGenerando(true)
    setErrorMsg(null)

    try {
      // Construir contexto mínimo para el endpoint
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

      const res = await apiFetch("/api/generar-evaluacion", {
        method: "POST",
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

  /** Construye secciones desde la respuesta del endpoint */
  function buildSecciones(data: Record<string, unknown>): SeccionPrueba[] {
    const rawSecciones = Array.isArray(data.secciones) ? data.secciones : []
    return rawSecciones.map((sec: any, idx: number) => {
      const items: ItemPrueba[] = (Array.isArray(sec.items) ? sec.items : []).map((it: any) => {
        const tipo = (it.tipo || "seleccion_multiple") as TipoItem
        const base = nuevoItem(tipo, it.puntaje ?? 1)
        return { ...base, ...it, tipo } as ItemPrueba
      })
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

        {/* Form */}
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

          {/* OAs sugeridos */}
          <Field
            label="OAs sugeridos de la unidad"
            hint={
              oasDisponibles.length > 0
                ? "Marca los OAs que quieras priorizar (opcional)."
                : undefined
            }
          >
            {oasDisponibles.length === 0 ? (
              <p className="rounded-[10px] border border-dashed border-border bg-background px-3 py-2.5 text-[12.5px] italic text-muted-foreground">
                No hay OAs definidos en esta unidad.
              </p>
            ) : (
              <div className="max-h-40 overflow-y-auto rounded-[10px] border border-border bg-background p-2">
                <ul className="flex flex-col gap-1">
                  {oasDisponibles.map((oa) => {
                    const checked = oasSeleccionados.includes(oa.code)
                    return (
                      <li key={oa.code}>
                        <CheckboxRow
                          label={
                            <span className="flex min-w-0 flex-1 items-baseline gap-2">
                              <span className="rounded-md border border-border bg-card px-1.5 py-0.5 text-[10.5px] font-black text-foreground">
                                {oa.code}
                              </span>
                              <span className="truncate text-[12.5px] text-foreground">
                                {oa.descripcion}
                              </span>
                            </span>
                          }
                          checked={checked}
                          onChange={() => toggleOA(oa.code)}
                          disabled={isDisabled}
                        />
                      </li>
                    )
                  })}
                </ul>
              </div>
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
