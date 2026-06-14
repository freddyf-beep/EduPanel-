"use client"

import { useEffect, useRef, useState, type ReactNode } from "react"
import { Search } from "lucide-react"
import { cn } from "@/lib/utils"

/**
 * Shared FilterBar for the unified Pruebas/Guías hubs.
 *
 * - Búsqueda con estado local controlado y propagación debounced (300ms)
 *   hacia `setQ`, evitando re-renderizar listas grandes en cada tecla.
 * - Filtros segmentados como `<button aria-pressed>` con tinte de acento
 *   contextual (`rose` para Pruebas, `violet` para Guías).
 * - Normaliza la consulta (NFD + sin marcas combinantes + lowercase + trim)
 *   y la expone vía `onNormalizedChange` para los hubs que comparan contra
 *   `nombre`, `unidadNombre`, `objetivo`, OAs.
 * - Soporte teclado nativo (Tab para navegar, Enter para activar el botón
 *   enfocado), input acotado a 120 caracteres tanto por `maxLength` como
 *   por slicing en `onChange`.
 * - Slot `extra` a la derecha reservado para componentes futuros como el
 *   menú de filtros guardados.
 *
 * Refs: Req 2.4, Req 2.5, Req 3.4, Req 3.5
 */

const MAX_QUERY_LENGTH = 120
const DEBOUNCE_MS = 300

/**
 * Normaliza una consulta para comparar sin acentos ni mayúsculas:
 * descompone a NFD, elimina marcas combinantes (\u0300-\u036f),
 * pasa a lowercase y recorta espacios.
 */
function normalizeQuery(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
}

export interface FilterBarProps {
  /** Valor canónico de la búsqueda (controlado por el hub padre). */
  q: string
  /** Callback invocado tras el debounce con el texto crudo. */
  setQ: (v: string) => void
  /**
   * Filtros segmentados como tuplas `[key, label]`. La key se compara
   * contra `active`; la label se renderiza tal cual.
   */
  filters: Array<[string, string]>
  /** Key del filtro activo. */
  active: string
  /** Setter para cambiar el filtro activo. */
  setActive: (v: string) => void
  /** Placeholder del input de búsqueda. */
  placeholder: string
  /** Acento contextual; default `"rose"` (Pruebas). */
  accent?: "rose" | "violet"
  /** Slot opcional renderizado a la derecha (p.ej. SavedFiltersMenu). */
  extra?: ReactNode
  /**
   * Callback opcional con la versión normalizada (lowercase + sin tildes
   * + trim) del texto, disparado junto al debounce.
   */
  onNormalizedChange?: (normalized: string) => void
}

export function FilterBar({
  q,
  setQ,
  filters,
  active,
  setActive,
  placeholder,
  accent = "rose",
  extra,
  onNormalizedChange,
}: FilterBarProps) {
  const [text, setText] = useState(q)
  // Último valor que ya propagamos al padre (o que llegó del padre).
  // Sirve para diferenciar cambios externos (resets de filtros) del
  // tipeo del usuario, sin disparar bucles entre los dos efectos.
  const lastPropagated = useRef(q)

  // Sync desde `q` externo cuando cambia fuera del componente
  // (p.ej. al limpiar filtros desde un EmptyState).
  useEffect(() => {
    if (q !== lastPropagated.current) {
      lastPropagated.current = q
      setText(q)
    }
  }, [q])

  // Debounce: propaga el texto local 300ms después de la última tecla.
  useEffect(() => {
    if (text === lastPropagated.current) return
    const handle = setTimeout(() => {
      lastPropagated.current = text
      setQ(text)
      onNormalizedChange?.(normalizeQuery(text))
    }, DEBOUNCE_MS)
    return () => clearTimeout(handle)
  }, [text, setQ, onNormalizedChange])

  // Clases estáticas para que Tailwind detecte los arbitrary values en build.
  const inputFocusRing =
    accent === "violet"
      ? "focus-visible:ring-2 focus-visible:ring-[var(--accent-guias)] focus-visible:ring-offset-1"
      : "focus-visible:ring-2 focus-visible:ring-[var(--accent-pruebas)] focus-visible:ring-offset-1"
  const btnFocusRing =
    accent === "violet"
      ? "focus-visible:ring-[var(--accent-guias)]"
      : "focus-visible:ring-[var(--accent-pruebas)]"
  const activeBtnClass =
    accent === "violet"
      ? "bg-[var(--accent-guias-soft)] text-[var(--accent-guias)]"
      : "bg-[var(--accent-pruebas-soft)] text-[var(--accent-pruebas)]"

  return (
    <div className="flex flex-col gap-2 rounded-[14px] border border-border bg-card p-2 shadow-sm lg:flex-row lg:items-center">
      <div className="relative min-w-[240px] flex-1">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value.slice(0, MAX_QUERY_LENGTH))}
          maxLength={MAX_QUERY_LENGTH}
          placeholder={placeholder}
          aria-label="Buscar"
          className={cn(
            "h-10 w-full rounded-[10px] border border-transparent bg-background pl-9 pr-3",
            "text-[13px] font-semibold text-foreground placeholder:text-muted-foreground",
            "outline-none transition focus:border-border",
            inputFocusRing,
          )}
        />
      </div>

      <div
        role="group"
        aria-label="Filtros"
        className="flex gap-1 overflow-x-auto"
      >
        {filters.map(([key, label]) => {
          const isActive = active === key
          return (
            <button
              key={key}
              type="button"
              aria-pressed={isActive}
              onClick={() => setActive(key)}
              className={cn(
                "whitespace-nowrap rounded-[9px] px-3 py-2 text-[11px] font-black transition",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1",
                btnFocusRing,
                isActive
                  ? activeBtnClass
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              {label}
            </button>
          )
        })}
      </div>

      {extra && (
        <div className="flex items-center gap-1 lg:ml-auto">
          {extra}
        </div>
      )}
    </div>
  )
}

export default FilterBar
