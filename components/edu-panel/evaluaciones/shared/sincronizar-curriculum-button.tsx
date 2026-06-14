"use client"

import { useState } from "react"
import { Loader2, RefreshCw } from "lucide-react"

import {
  cargarOAsParaPrueba,
  resolverMetadatosCurricularesPrueba,
} from "@/lib/pruebas"
import {
  cargarOAsParaGuia,
  resolverMetadatosCurricularesGuia,
} from "@/lib/guias"
import {
  metadatosCurricularesVaciosEval,
  type MetadatosCurricularesEval,
} from "@/lib/evaluaciones-tipos"
import type { OAEditado } from "@/lib/curriculo"
import { cn } from "@/lib/utils"

import { ErrorBanner } from "./error-banner"

/**
 * Acento visual del botón. `rose` para Pruebas, `violet` para Guías.
 */
type Accent = "rose" | "violet"

/**
 * Props del botón de sincronización con currículum.
 *
 * Refs: Req 9.1 (vinculación curricular desde editores).
 */
export interface SincronizarCurriculumButtonProps {
  /** Asignatura del documento actual (ej. "Música"). */
  asignatura: string
  /** Curso del documento actual (ej. "3ro Básico"). */
  curso: string
  /**
   * Nombre de la unidad activa. Puede venir vacío si el usuario aún no la
   * eligió; en ese caso el botón queda deshabilitado y se omite la llamada.
   */
  unidadNombre?: string
  /**
   * Callback que recibe los metadatos resueltos y los OAs cargados desde el
   * currículum oficial. El editor usa estos datos para poblar
   * `metadatosCurriculares` y la lista `oas[]` del documento.
   */
  onResolved: (
    metadatos: MetadatosCurricularesEval,
    oas: OAEditado[],
  ) => void
  /** Acento visual contextual al tipo de documento. */
  accent: Accent
  /**
   * `"prueba"` o `"guia"` — determina qué par de funciones del lib se
   * invoca (`resolverMetadatosCurricularesPrueba`/`cargarOAsParaPrueba` vs.
   * sus equivalentes de Guía).
   */
  tipo: "prueba" | "guia"
  /** Permite al editor deshabilitar el botón externamente. */
  disabled?: boolean
}

/**
 * Botón compacto "Sincronizar con currículum" para los editores de Prueba y
 * Guía. Al hacer clic:
 *
 * 1. Resuelve los metadatos curriculares de la unidad activa
 *    (`resolverMetadatosCurricularesPrueba` o `resolverMetadatosCurricularesGuia`).
 *    Esta resolución devuelve además el `unidadId` real desde la base
 *    curricular.
 * 2. Si la unidad fue resuelta exitosamente, carga los OAs editables de esa
 *    unidad (`cargarOAsParaPrueba` o `cargarOAsParaGuia`).
 * 3. Invoca `onResolved(metadatos, oas)` para que el editor aplique los
 *    cambios al documento en memoria.
 *
 * Las dos llamadas se hacen en secuencia porque `cargarOAsPara*` requiere
 * `unidadId`, que solo se conoce tras `resolverMetadatosCurriculares*`.
 *
 * El componente maneja su propio estado de loading y error con un
 * `ErrorBanner` inline reusable. El error banner ofrece un retry que
 * reintenta la sincronización con los mismos parámetros.
 *
 * Refs: Req 9.1, Req 5.5, Req 6.4
 */
export function SincronizarCurriculumButton({
  asignatura,
  curso,
  unidadNombre,
  onResolved,
  accent,
  tipo,
  disabled,
}: SincronizarCurriculumButtonProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const styles = getAccentStyles(accent)
  const isDisabled =
    Boolean(disabled) || loading || !asignatura.trim() || !curso.trim()

  const handleSync = async () => {
    if (isDisabled) return
    setLoading(true)
    setError(null)

    try {
      const fallback: MetadatosCurricularesEval = metadatosCurricularesVaciosEval()

      // Paso 1: resolver metadatos curriculares (devuelve unidadId).
      const resolucion =
        tipo === "prueba"
          ? await resolverMetadatosCurricularesPrueba({
              asignatura,
              curso,
              unidadNombre,
              metadatosCurriculares: fallback,
            })
          : await resolverMetadatosCurricularesGuia({
              asignatura,
              curso,
              unidadNombre,
              metadatosCurriculares: fallback,
            })

      // Paso 2: si la unidad fue resuelta en BD, cargar OAs editables.
      let oas: OAEditado[] = []
      if (resolucion.resolvedFromDatabase && resolucion.unidadId) {
        oas =
          tipo === "prueba"
            ? await cargarOAsParaPrueba(asignatura, curso, resolucion.unidadId)
            : await cargarOAsParaGuia(asignatura, curso, resolucion.unidadId)
      }

      onResolved(resolucion.metadatosCurriculares, oas)
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "No fue posible sincronizar con el currículum."
      setError(message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={handleSync}
        disabled={isDisabled}
        aria-label="Sincronizar con currículum"
        className={cn(
          "inline-flex w-fit items-center gap-2 rounded-[10px] border px-3 py-2",
          "text-[12px] font-black transition-colors",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
          styles.button,
          styles.focusRing,
          "disabled:opacity-50 disabled:cursor-not-allowed",
        )}
      >
        {loading ? (
          <Loader2
            aria-hidden="true"
            className="h-4 w-4 animate-spin"
          />
        ) : (
          <RefreshCw aria-hidden="true" className="h-4 w-4" />
        )}
        {loading ? "Sincronizando..." : "Sincronizar con currículum"}
      </button>

      {error ? (
        <ErrorBanner
          message={error}
          onRetry={handleSync}
          onDismiss={() => setError(null)}
        />
      ) : null}
    </div>
  )
}

export default SincronizarCurriculumButton

interface AccentStyles {
  button: string
  focusRing: string
}

function getAccentStyles(accent: Accent): AccentStyles {
  if (accent === "violet") {
    return {
      button:
        "border-[var(--accent-guias-soft)] bg-[var(--accent-guias-soft)] text-[var(--accent-guias)] hover:bg-[var(--accent-guias)] hover:text-white hover:border-[var(--accent-guias)]",
      focusRing: "focus-visible:ring-[var(--accent-guias)]",
    }
  }

  return {
    button:
      "border-[var(--accent-pruebas-soft)] bg-[var(--accent-pruebas-soft)] text-[var(--accent-pruebas)] hover:bg-[var(--accent-pruebas)] hover:text-white hover:border-[var(--accent-pruebas)]",
    focusRing: "focus-visible:ring-[var(--accent-pruebas)]",
  }
}
