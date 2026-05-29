"use client"

import { useEffect, useRef, useState } from "react"
import { Bookmark, Loader2, Plus, X } from "lucide-react"

import { cn } from "@/lib/utils"
import {
  cargarFiltrosPorTab,
  eliminarFiltro,
  guardarFiltro,
  MAX_NOMBRE_FILTRO,
  type FiltroGuardado,
  type FiltroTab,
} from "@/lib/saved-filters"

type Accent = "rose" | "violet"

export interface SavedFiltersMenuProps {
  /** Tab al que pertenecen los filtros mostrados ("pruebas" | "guias"). */
  tab: FiltroTab
  /** Filtros activos en el hub (se persisten al "Guardar filtros actuales"). */
  currentFilters: {
    curso?: string
    unidadId?: string
    tipo?: string
    busqueda?: string
  }
  /** Callback invocado al seleccionar un filtro de la lista. */
  onApply: (filtro: FiltroGuardado) => void
  /** Color de acento contextual ("rose" para Pruebas, "violet" para Guías). */
  accent: Accent
}

/**
 * Menú "Filtros guardados" para los hubs de Pruebas/Guías.
 *
 * - Carga al montar `cargarFiltrosPorTab(tab)` para listar los filtros del tab actual.
 * - Permite guardar la combinación de filtros actuales con un nombre (≤ 60 caracteres).
 * - Aplica un filtro al hacer click en una fila (`onApply`) y cierra el popover.
 * - Permite eliminar un filtro guardado con la "X".
 *
 * Refs: Req 14.5, Req 14.6, Req 14.7
 */
export function SavedFiltersMenu({
  tab,
  currentFilters,
  onApply,
  accent,
}: SavedFiltersMenuProps) {
  const [open, setOpen] = useState(false)
  const [filtros, setFiltros] = useState<FiltroGuardado[]>([])
  const [cargando, setCargando] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [eliminandoId, setEliminandoId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [mostrarInput, setMostrarInput] = useState(false)
  const [nombreNuevo, setNombreNuevo] = useState("")

  const containerRef = useRef<HTMLDivElement>(null)
  const styles = getAccentStyles(accent)

  // Carga inicial al montar; recarga si cambia el tab.
  useEffect(() => {
    let cancelado = false
    setCargando(true)
    setError(null)
    cargarFiltrosPorTab(tab)
      .then(lista => {
        if (!cancelado) setFiltros(lista)
      })
      .catch(e => {
        if (!cancelado) setError(e?.message || "No se pudieron cargar los filtros guardados.")
      })
      .finally(() => {
        if (!cancelado) setCargando(false)
      })
    return () => { cancelado = true }
  }, [tab])

  // Click fuera cierra el popover.
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
        setMostrarInput(false)
        setNombreNuevo("")
        setError(null)
      }
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [open])

  const refrescar = async () => {
    try {
      const lista = await cargarFiltrosPorTab(tab)
      setFiltros(lista)
    } catch (e: any) {
      setError(e?.message || "No se pudieron cargar los filtros guardados.")
    }
  }

  const onGuardar = async () => {
    const nombre = nombreNuevo.trim()
    if (!nombre) {
      setError("El nombre del filtro no puede estar vacío.")
      return
    }
    if (nombre.length > MAX_NOMBRE_FILTRO) {
      setError(`El nombre no puede superar los ${MAX_NOMBRE_FILTRO} caracteres.`)
      return
    }
    setGuardando(true)
    setError(null)
    try {
      await guardarFiltro({
        nombre,
        tab,
        curso: currentFilters.curso,
        unidadId: currentFilters.unidadId,
        tipo: currentFilters.tipo,
        busqueda: currentFilters.busqueda,
      })
      setNombreNuevo("")
      setMostrarInput(false)
      await refrescar()
    } catch (e: any) {
      setError(e?.message || "No se pudo guardar el filtro.")
    } finally {
      setGuardando(false)
    }
  }

  const onEliminar = async (id: string) => {
    setEliminandoId(id)
    setError(null)
    try {
      await eliminarFiltro(id)
      setFiltros(prev => prev.filter(f => f.id !== id))
    } catch (e: any) {
      setError(e?.message || "No se pudo eliminar el filtro.")
    } finally {
      setEliminandoId(null)
    }
  }

  const onAplicar = (filtro: FiltroGuardado) => {
    onApply(filtro)
    setOpen(false)
    setMostrarInput(false)
    setNombreNuevo("")
    setError(null)
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        aria-label="Filtros guardados"
        aria-haspopup="menu"
        aria-expanded={open}
        className={cn(
          "inline-flex h-9 items-center gap-1.5 rounded-[10px] border border-border bg-card px-3 text-[12.5px] font-bold text-foreground transition-colors hover:bg-muted/40",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
          styles.triggerFocus,
        )}
      >
        <Bookmark className={cn("h-3.5 w-3.5", styles.icon)} aria-hidden="true" />
        Filtros guardados
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-50 mt-1.5 w-80 rounded-[12px] border border-border bg-card p-2 shadow-[0_8px_28px_rgba(0,0,0,0.12)]"
        >
          {/* Cabecera: guardar filtros actuales */}
          <div className="px-1.5 pb-2">
            {!mostrarInput ? (
              <button
                type="button"
                onClick={() => {
                  setMostrarInput(true)
                  setError(null)
                }}
                className={cn(
                  "inline-flex w-full items-center justify-center gap-1.5 rounded-[10px] px-3 py-2 text-[12px] font-bold transition-opacity",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                  styles.primaryButton,
                )}
              >
                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                Guardar filtros actuales
              </button>
            ) : (
              <div className="flex items-center gap-1.5">
                <input
                  type="text"
                  value={nombreNuevo}
                  onChange={e => setNombreNuevo(e.target.value.slice(0, MAX_NOMBRE_FILTRO))}
                  onKeyDown={e => {
                    if (e.key === "Enter") {
                      e.preventDefault()
                      void onGuardar()
                    } else if (e.key === "Escape") {
                      e.preventDefault()
                      setMostrarInput(false)
                      setNombreNuevo("")
                      setError(null)
                    }
                  }}
                  maxLength={MAX_NOMBRE_FILTRO}
                  placeholder="Nombre del filtro…"
                  autoFocus
                  className={cn(
                    "h-8 flex-1 rounded border border-border bg-background px-2 text-[12.5px] text-foreground",
                    "focus-visible:outline-none focus-visible:ring-2",
                    styles.inputFocus,
                  )}
                />
                <button
                  type="button"
                  onClick={() => void onGuardar()}
                  disabled={guardando || !nombreNuevo.trim()}
                  className={cn(
                    "inline-flex h-8 items-center gap-1 rounded-[8px] px-2.5 text-[11.5px] font-bold transition-opacity disabled:opacity-50",
                    styles.primaryButton,
                  )}
                >
                  {guardando ? (
                    <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
                  ) : null}
                  Guardar
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMostrarInput(false)
                    setNombreNuevo("")
                    setError(null)
                  }}
                  aria-label="Cancelar"
                  className="grid h-8 w-8 place-items-center rounded-[8px] border border-border bg-background text-muted-foreground hover:bg-muted/50"
                >
                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </div>
            )}
            {mostrarInput ? (
              <p className="mt-1 text-right text-[10.5px] text-muted-foreground">
                {nombreNuevo.length}/{MAX_NOMBRE_FILTRO}
              </p>
            ) : null}
          </div>

          {error ? (
            <div
              role="alert"
              className="mx-1.5 mb-2 rounded-md border border-red-200 bg-red-50 px-2.5 py-1.5 text-[11.5px] text-red-700 dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-200"
            >
              {error}
            </div>
          ) : null}

          <div className="my-1 h-px bg-border" />

          {/* Lista de filtros */}
          {cargando ? (
            <div className="flex items-center justify-center gap-2 px-3 py-4 text-[12px] text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              Cargando filtros…
            </div>
          ) : filtros.length === 0 ? (
            <div className="px-3 py-4 text-center text-[12px] text-muted-foreground">
              No hay filtros guardados todavía.
            </div>
          ) : (
            <ul className="max-h-72 overflow-y-auto py-1">
              {filtros.map(f => {
                const partes = [f.curso, f.unidadId, f.tipo].filter(Boolean) as string[]
                const resumen = partes.length > 0 ? partes.join(" · ") : "Sin filtros aplicados"
                return (
                  <li key={f.id} className="px-1.5">
                    <div
                      className={cn(
                        "group flex items-start gap-2 rounded-[10px] px-2.5 py-2 transition-colors hover:bg-background",
                        styles.rowHover,
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => onAplicar(f)}
                        className="flex-1 min-w-0 text-left focus-visible:outline-none"
                        aria-label={`Aplicar filtro ${f.nombre}`}
                      >
                        <div className="truncate text-[12.5px] font-bold text-foreground">
                          {f.nombre}
                        </div>
                        <div className="mt-0.5 truncate text-[11px] text-muted-foreground">
                          {resumen}
                          {f.busqueda ? ` · "${f.busqueda}"` : ""}
                        </div>
                      </button>
                      <button
                        type="button"
                        onClick={() => void onEliminar(f.id)}
                        disabled={eliminandoId === f.id}
                        aria-label={`Eliminar filtro ${f.nombre}`}
                        className="grid h-7 w-7 flex-shrink-0 place-items-center rounded-[8px] border border-transparent text-muted-foreground transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-600 disabled:opacity-50 dark:hover:border-red-900/50 dark:hover:bg-red-900/20"
                      >
                        {eliminandoId === f.id ? (
                          <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
                        ) : (
                          <X className="h-3.5 w-3.5" aria-hidden="true" />
                        )}
                      </button>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

export default SavedFiltersMenu

interface AccentStyles {
  icon: string
  triggerFocus: string
  primaryButton: string
  inputFocus: string
  rowHover: string
}

function getAccentStyles(accent: Accent): AccentStyles {
  if (accent === "violet") {
    return {
      icon: "text-[var(--accent-guias)]",
      triggerFocus: "focus-visible:ring-[var(--accent-guias)]",
      primaryButton:
        "bg-[var(--accent-guias)] text-white hover:opacity-90 focus-visible:ring-[var(--accent-guias)]",
      inputFocus: "focus-visible:ring-[var(--accent-guias)]",
      rowHover: "hover:bg-[var(--accent-guias-soft)]/30",
    }
  }
  return {
    icon: "text-[var(--accent-pruebas)]",
    triggerFocus: "focus-visible:ring-[var(--accent-pruebas)]",
    primaryButton:
      "bg-[var(--accent-pruebas)] text-white hover:opacity-90 focus-visible:ring-[var(--accent-pruebas)]",
    inputFocus: "focus-visible:ring-[var(--accent-pruebas)]",
    rowHover: "hover:bg-[var(--accent-pruebas-soft)]/30",
  }
}
