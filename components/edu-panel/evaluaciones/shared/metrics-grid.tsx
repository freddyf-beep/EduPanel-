import { cn } from "@/lib/utils"

export interface MetricsGridItem {
  label: string
  value: number | string
  hint?: string
}

interface MetricsGridProps {
  items: MetricsGridItem[]
  accent: "rose" | "violet"
}

/**
 * Grid responsive de métricas para Hubs de Pruebas y Guías.
 *
 * - 2 columnas en mobile/tablet (>= sm), 4 en desktop (>= lg).
 * - El primer valor usa color foreground (neutral); el resto usa el color de
 *   acento contextual (`--accent-pruebas` para rose, `--accent-guias` para
 *   violet) definido en `app/globals.css`.
 * - Soporta `hint` opcional como texto muted bajo el valor.
 */
export function MetricsGrid({ items, accent }: MetricsGridProps) {
  const accentColor =
    accent === "violet"
      ? "text-[var(--accent-guias)]"
      : "text-[var(--accent-pruebas)]"

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {items.map((item, idx) => (
        <div
          key={item.label}
          className="rounded-[14px] border border-border bg-card p-4 shadow-sm"
        >
          <div className="text-[10px] font-black uppercase tracking-wide text-muted-foreground">
            {item.label}
          </div>
          <div
            className={cn(
              "mt-1 text-[24px] font-black",
              idx === 0 ? "text-foreground" : accentColor,
            )}
          >
            {item.value}
          </div>
          {item.hint ? (
            <div className="mt-1 text-[11px] font-medium text-muted-foreground">
              {item.hint}
            </div>
          ) : null}
        </div>
      ))}
    </div>
  )
}

export default MetricsGrid
