import * as React from "react"

/**
 * Loading skeletons for the unified Pruebas/Guías experience.
 *
 * - `CardSkeleton`: matches the shape of a DocumentCard so the hub grid
 *   doesn't reflow when real data arrives.
 * - `HubSkeleton`: responsive grid of card skeletons used while the hub
 *   list is loading.
 * - `EditorSkeleton`: header + collapsible config + two section placeholders
 *   used while the editor view is hydrating.
 *
 * All animated bars use Tailwind `animate-pulse` together with
 * `motion-reduce:animate-none` so users with `prefers-reduced-motion: reduce`
 * see a static placeholder.
 *
 * Refs: Req 13.1, Req 13.2
 */

type Accent = "rose" | "violet"

const PULSE = "animate-pulse motion-reduce:animate-none"

/** Solid muted bar used as a placeholder line. */
function Bar({
  className = "",
  rounded = "rounded-md",
}: {
  className?: string
  rounded?: string
}) {
  return (
    <div
      aria-hidden="true"
      className={`bg-muted ${rounded} ${PULSE} ${className}`}
    />
  )
}

/**
 * Skeleton with the same outer shape as a DocumentCard:
 * badge area, 2-line title, curso/unidad line, 4-col mini-stats and action group.
 */
export function CardSkeleton() {
  return (
    <div
      role="status"
      aria-label="Cargando documento"
      className="flex min-h-[250px] flex-col gap-3 rounded-[16px] border border-border bg-card p-5"
    >
      {/* Badge area */}
      <div className="flex items-center gap-1.5">
        <Bar className="h-3.5 w-3.5" rounded="rounded-full" />
        <Bar className="h-4 w-20" rounded="rounded-full" />
      </div>

      {/* Title (2 lines) */}
      <div className="flex flex-col gap-1.5">
        <Bar className="h-4 w-[85%]" />
        <Bar className="h-4 w-[60%]" />
      </div>

      {/* Curso / unidad line */}
      <Bar className="h-3 w-2/5" />

      {/* Mini-stats grid (4 cols) */}
      <div className="grid grid-cols-4 gap-2">
        <Bar className="h-7" rounded="rounded-[8px]" />
        <Bar className="h-7" rounded="rounded-[8px]" />
        <Bar className="h-7" rounded="rounded-[8px]" />
        <Bar className="h-7" rounded="rounded-[8px]" />
      </div>

      {/* Action group */}
      <div className="mt-auto flex flex-wrap gap-1.5 pt-1">
        <Bar className="h-9 flex-1 min-w-0" rounded="rounded-[10px]" />
        <Bar className="h-9 w-20" rounded="rounded-[10px]" />
        <Bar className="h-9 w-9" rounded="rounded-[10px]" />
        <Bar className="h-9 w-9" rounded="rounded-[10px]" />
        <Bar className="h-9 w-9" rounded="rounded-[10px]" />
      </div>

      <span className="sr-only">Cargando…</span>
    </div>
  )
}

interface HubSkeletonProps {
  /** Number of card placeholders to render. Default 6. */
  count?: number
  /** Reserved for accent-aware variants (rose for Pruebas, violet for Guías). */
  accent?: Accent
}

/**
 * Responsive grid of card skeletons mirroring the hub layout.
 * Used while `cargarPruebas` / `cargarGuias` is in flight.
 */
export function HubSkeleton({ count = 6, accent }: HubSkeletonProps = {}) {
  const safeCount = Math.max(1, Math.min(24, Math.floor(count ?? 6)))
  // `accent` is currently presentational-only; documented for future
  // accent-tinted skeletons without changing the public API.
  void accent
  return (
    <div
      role="status"
      aria-label="Cargando lista"
      className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
    >
      {Array.from({ length: safeCount }).map((_, i) => (
        <CardSkeleton key={i} />
      ))}
      <span className="sr-only">Cargando documentos…</span>
    </div>
  )
}

/** Single section placeholder used inside the editor skeleton. */
function SectionSkeleton() {
  return (
    <div className="flex flex-col gap-3 rounded-[14px] border border-border bg-card p-5">
      {/* Section title bar */}
      <div className="flex items-center gap-2">
        <Bar className="h-5 w-5" rounded="rounded-full" />
        <Bar className="h-5 w-1/3" />
      </div>
      {/* Instructions bar */}
      <Bar className="h-3.5 w-3/4" />
      {/* Three item placeholders */}
      <div className="flex flex-col gap-2">
        <Bar className="h-12 w-full" rounded="rounded-[10px]" />
        <Bar className="h-12 w-full" rounded="rounded-[10px]" />
        <Bar className="h-12 w-full" rounded="rounded-[10px]" />
      </div>
    </div>
  )
}

/**
 * Skeleton for the editor view: sticky toolbar + collapsible config block +
 * two section placeholders. Used while `cargarPrueba` / `cargarGuia` resolves.
 */
export function EditorSkeleton() {
  return (
    <div role="status" aria-label="Cargando editor" className="flex flex-col gap-4">
      {/* Sticky toolbar placeholder */}
      <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-border bg-card/80 px-4 py-3 backdrop-blur">
        <Bar className="h-8 w-8" rounded="rounded-[10px]" />
        <Bar className="h-5 flex-1 max-w-md" />
        <Bar className="h-8 w-24" rounded="rounded-[10px]" />
        <Bar className="h-8 w-24" rounded="rounded-[10px]" />
      </div>

      {/* Collapsible config block placeholder */}
      <div className="flex flex-col gap-3 rounded-[14px] border border-border bg-card p-5">
        <div className="flex items-center justify-between gap-3">
          <Bar className="h-5 w-40" />
          <Bar className="h-5 w-5" rounded="rounded-full" />
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Bar className="h-9" rounded="rounded-[10px]" />
          <Bar className="h-9" rounded="rounded-[10px]" />
          <Bar className="h-9" rounded="rounded-[10px]" />
          <Bar className="h-9" rounded="rounded-[10px]" />
          <Bar className="h-9" rounded="rounded-[10px]" />
          <Bar className="h-9" rounded="rounded-[10px]" />
        </div>
      </div>

      {/* Two section placeholders */}
      <SectionSkeleton />
      <SectionSkeleton />

      <span className="sr-only">Cargando editor…</span>
    </div>
  )
}

const LoadingSkeleton = {
  CardSkeleton,
  HubSkeleton,
  EditorSkeleton,
}

export default LoadingSkeleton
