"use client"

import Link from "next/link"
import { useEffect, useMemo, useState, type ReactNode } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { useActiveSubject } from "@/hooks/use-active-subject"
import { cargarHorarioSemanal, esTipoLibre } from "@/lib/horario"
import { cargarPlanCurso, type UnidadPlan } from "@/lib/curriculo"
import { buildUrl, withAsignatura } from "@/lib/shared"

/**
 * Selector sticky de Curso + Unidad para el shell unificado de Evaluaciones.
 *
 * - Carga la lista de cursos desde `cargarHorarioSemanal()` filtrando los
 *   bloques no lectivos con `esTipoLibre`.
 * - Carga las unidades del curso seleccionado vía `cargarPlanCurso(asignatura, curso)`.
 * - Es controlado: el padre (shell unificado) provee `curso` y `unidadId` desde
 *   los query params y los actualiza al recibir cambios. Como conveniencia, este
 *   componente también empuja los cambios al URL con `router.replace`, preservando
 *   el resto de los params (`tab`, `asignatura`, etc.).
 * - Cuando el `curso` cambia, RESETEA el `unidadId` a "" (Req 1.8). El select
 *   muestra "Todas las unidades" como opción por defecto.
 * - Layout: sticky bar (top-2, z-20) con backdrop blur, ideal para mantenerse
 *   visible mientras el docente scrollea por listas largas en los hubs.
 *
 * Refs: Req 1.6, Req 1.7, Req 1.8
 */

interface CursoOpt {
  nombre: string
  color: string
}

export interface CursoUnidadSelectorProps {
  /** Curso actualmente seleccionado (controlled). */
  curso: string
  /** Setter del curso (controlled). */
  setCurso: (s: string) => void
  /** unidadId actualmente seleccionado (controlled). */
  unidadId: string
  /** Setter del unidadId (controlled). */
  setUnidadId: (s: string) => void
  /** "rose" para Pruebas, "violet" para Guías; default "rose". */
  accent?: "rose" | "violet"
  /** Slot extra a la derecha (p.ej. botón "Ver cobertura"). */
  extra?: ReactNode
}

export function CursoUnidadSelector({
  curso,
  setCurso,
  unidadId,
  setUnidadId,
  accent = "rose",
  extra,
}: CursoUnidadSelectorProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { asignatura } = useActiveSubject()

  const [cursos, setCursos] = useState<CursoOpt[]>([])
  const [unidades, setUnidades] = useState<UnidadPlan[]>([])
  const [cargandoCursos, setCargandoCursos] = useState(true)
  const [cargandoUnidades, setCargandoUnidades] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // ─── Cargar cursos al montar ──────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false
    setCargandoCursos(true)
    setError(null)
    cargarHorarioSemanal()
      .then(horario => {
        if (cancelled) return
        const map = new Map<string, string>()
        horario
          .filter(h => !esTipoLibre(h.tipo))
          .forEach(h => {
            const nombre = h.resumen?.trim()
            if (nombre && !map.has(nombre)) {
              map.set(nombre, h.color || "#4f46e5")
            }
          })
        const next = Array.from(map.entries()).map(([nombre, color]) => ({ nombre, color }))
        setCursos(next)
        // Si no hay curso seleccionado pero hay cursos disponibles, seleccionar el primero.
        if (!curso && next.length > 0) {
          setCurso(next[0].nombre)
        }
      })
      .catch((e: Error) => {
        if (cancelled) return
        setCursos([])
        setError(e?.message || "No pude cargar los cursos.")
      })
      .finally(() => {
        if (!cancelled) setCargandoCursos(false)
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ─── Cargar unidades cuando cambia curso o asignatura ─────────────────────
  useEffect(() => {
    if (!curso) {
      setUnidades([])
      return
    }
    let cancelled = false
    setCargandoUnidades(true)
    cargarPlanCurso(asignatura, curso)
      .then(plan => {
        if (cancelled) return
        setUnidades(plan?.units || [])
      })
      .catch(() => {
        if (!cancelled) setUnidades([])
      })
      .finally(() => {
        if (!cancelled) setCargandoUnidades(false)
      })
    return () => {
      cancelled = true
    }
  }, [asignatura, curso])

  // ─── Helper: actualiza URL preservando todos los demás query params ───────
  const updateUrl = (nextCurso: string, nextUnidadId: string) => {
    const params: Record<string, string | undefined> = {}
    searchParams.forEach((value, key) => {
      params[key] = value
    })
    params.curso = nextCurso || undefined
    params.unidadId = nextUnidadId || undefined
    router.replace(buildUrl("/evaluaciones", withAsignatura(params, asignatura)))
  }

  const handleCursoChange = (next: string) => {
    // Req 1.8: al cambiar de curso, reseteamos la unidad activa.
    setCurso(next)
    setUnidadId("")
    updateUrl(next, "")
  }

  const handleUnidadChange = (next: string) => {
    setUnidadId(next)
    updateUrl(curso, next)
  }

  const sinCursos = !cargandoCursos && cursos.length === 0 && !error

  // ─── Estilos por acento (clases estáticas para Tailwind JIT) ──────────────
  const focusRing = useMemo(
    () =>
      accent === "violet"
        ? "focus-visible:ring-[var(--accent-guias)]"
        : "focus-visible:ring-[var(--accent-pruebas)]",
    [accent],
  )
  const dotColor = useMemo(
    () =>
      accent === "violet"
        ? "bg-[var(--accent-guias)]"
        : "bg-[var(--accent-pruebas)]",
    [accent],
  )

  return (
    <div className="sticky top-2 z-20 flex flex-wrap items-end gap-2 rounded-[14px] border border-border bg-card/95 backdrop-blur p-3 shadow-sm">
      {/* ─── Curso ───────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-1">
        <label
          htmlFor="curso-unidad-selector-curso"
          className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground"
        >
          Curso
        </label>

        {cargandoCursos ? (
          <div className="flex h-9 items-center gap-2 rounded-[10px] border border-border bg-background px-3 text-[12px] text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Cargando…
          </div>
        ) : error ? (
          <div className="rounded-[10px] border border-border bg-background px-3 py-2 text-[11px] font-medium text-destructive">
            {error}
          </div>
        ) : sinCursos ? (
          <div className="rounded-[10px] border border-border bg-background px-3 py-2 text-[11px] text-muted-foreground">
            Configura cursos en{" "}
            <Link
              href="/perfil"
              className="font-bold text-foreground underline-offset-2 hover:underline"
            >
              Mi Perfil
            </Link>
          </div>
        ) : (
          <select
            id="curso-unidad-selector-curso"
            aria-label="Curso"
            value={curso}
            onChange={e => handleCursoChange(e.target.value)}
            className={cn(
              "h-9 rounded-[10px] border border-border bg-background px-3 text-[13px] font-semibold text-foreground",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1",
              focusRing,
            )}
          >
            {cursos.map(c => (
              <option key={c.nombre} value={c.nombre}>
                {c.nombre}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* ─── Unidad ──────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-1">
        <label
          htmlFor="curso-unidad-selector-unidad"
          className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground"
        >
          Unidad
        </label>

        {cargandoUnidades ? (
          <div className="flex h-9 items-center gap-2 rounded-[10px] border border-border bg-background px-3 text-[12px] text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Cargando…
          </div>
        ) : (
          <select
            id="curso-unidad-selector-unidad"
            aria-label="Unidad"
            value={unidadId}
            onChange={e => handleUnidadChange(e.target.value)}
            disabled={!curso || sinCursos}
            className={cn(
              "h-9 rounded-[10px] border border-border bg-background px-3 text-[13px] font-semibold text-foreground",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1",
              focusRing,
              "disabled:opacity-50 disabled:cursor-not-allowed",
            )}
          >
            <option value="">Todas las unidades</option>
            {unidades.map(u => (
              <option key={u.id} value={String(u.id)}>
                {u.name}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* ─── Asignatura badge + slot extra a la derecha ──────────────────── */}
      <div className="ml-auto flex items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1.5 text-[11px] font-bold text-foreground">
          <span aria-hidden="true" className={cn("h-2 w-2 rounded-full", dotColor)} />
          {asignatura}
        </span>
        {extra}
      </div>
    </div>
  )
}

export default CursoUnidadSelector
