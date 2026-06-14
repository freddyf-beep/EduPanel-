"use client"

// ═══════════════════════════════════════════════════════════════════════════
// Primitivos UI compartidos por los editores de Pruebas y Guías.
// ─────────────────────────────────────────────────────────────────────────
// Son componentes "tontos": no tienen estado ni lógica; sólo reciben props
// y renderizan. Sirven para homogeneizar la toolbar, las secciones
// colapsables y los campos de formulario de cualquier editor.
// ═══════════════════════════════════════════════════════════════════════════

import type { ComponentType, ReactNode } from "react"
import { ChevronDown, ChevronUp } from "lucide-react"
import { cn } from "@/lib/utils"
import { formatShortcut } from "@/lib/keyboard-shortcuts"

// ─── ToolbarButton ──────────────────────────────────────────────────────────

interface ToolbarButtonProps {
  icon: ComponentType<{ className?: string; style?: React.CSSProperties }>
  label: string
  onClick: () => void
  shortcut?: string
  disabled?: boolean
  primary?: boolean
  active?: boolean
  danger?: boolean
  /** Token CSS de acento. Default "rose" (Pruebas). */
  accent?: "rose" | "violet"
  /** Si `true`, agrega clase `animate-spin` al icono. */
  spinning?: boolean
  /** Variante de peligro. */
  tone?: "danger"
}

/**
 * Botón compacto del cluster derecho de la toolbar. Muestra el icono
 * siempre y la etiqueta a partir de `md:`. Usa el acento configurado para
 * `primary`/`active` y rojo para `tone="danger"` (eliminar).
 */
export function ToolbarButton({
  icon: Icon,
  label,
  onClick,
  shortcut,
  disabled,
  primary,
  active,
  danger,
  accent = "rose",
  spinning,
  tone,
}: ToolbarButtonProps) {
  const titleText = shortcut ? `${label} (${formatShortcut(shortcut)})` : label
  const isDanger = tone === "danger"
  const accentVar = `var(--accent-${accent === "rose" ? "pruebas" : "guias"})`
  const accentFocus =
    accent === "violet"
      ? "focus-visible:ring-[var(--accent-guias)]"
      : "focus-visible:ring-[var(--accent-pruebas)]"

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={titleText}
      aria-label={label}
      className={cn(
        "inline-flex items-center gap-1 rounded-[8px] px-2.5 py-1.5 text-[11px] font-semibold transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        "disabled:cursor-not-allowed disabled:opacity-50",
        !isDanger && accentFocus,
        primary && "text-white hover:opacity-90",
        !primary &&
          active &&
          "text-white",
        !primary &&
          !active &&
          !isDanger &&
          "border border-border bg-card text-foreground hover:bg-muted/60",
        isDanger &&
          !danger &&
          "border border-red-200 bg-red-50 text-red-600 hover:bg-red-100 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300 focus-visible:ring-red-500",
        isDanger &&
          danger &&
          "border border-red-500 bg-red-500 text-white focus-visible:ring-red-500",
      )}
      style={
        primary || (active && !primary)
          ? { backgroundColor: accentVar }
          : !primary && !active && !isDanger
            ? undefined
            : undefined
      }
    >
      <Icon
        className={cn("h-3.5 w-3.5", spinning && "animate-spin")}
        {...(primary || (active && !primary)
          ? { style: { color: "white" } }
          : {})}
      />
      <span className="hidden md:inline">{label}</span>
    </button>
  )
}

// ─── Section ────────────────────────────────────────────────────────────────

interface SectionProps {
  title: string
  children: ReactNode
  icon?: ComponentType<{ className?: string; style?: React.CSSProperties }>
  /** Si no se provee, la sección siempre está expandida sin toggle. */
  expanded?: boolean
  onToggle?: () => void
  accent?: "rose" | "violet"
}

/** Sección colapsable con cabecera. Si no se provee onToggle, siempre expandida. */
export function Section({
  title,
  children,
  icon: Icon,
  expanded = true,
  onToggle,
  accent = "rose",
}: SectionProps) {
  const accentVar = `var(--accent-${accent === "rose" ? "pruebas" : "guias"})`
  const collapsible = typeof onToggle === "function"
  const HeaderTag = collapsible ? "button" : "div"
  return (
    <div className="rounded-[14px] border border-border bg-card p-4 shadow-sm">
      <HeaderTag
        {...(collapsible ? { type: "button" as const, onClick: onToggle } : {})}
        className={cn(
          "mb-3 flex w-full items-center gap-2 text-[13px] font-extrabold uppercase tracking-wide text-foreground",
          collapsible && "hover:opacity-80",
        )}
        style={collapsible && expanded ? { color: accentVar } : undefined}
      >
        {Icon && <Icon className="h-4 w-4" style={{ color: accentVar }} />}
        {title}
        {collapsible && (
          <span className="ml-auto">
            {expanded ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </span>
        )}
      </HeaderTag>
      {expanded && children}
    </div>
  )
}

// ─── Field ──────────────────────────────────────────────────────────────────

interface FieldProps {
  label: string
  children: ReactNode
}

/** Etiqueta + slot para un control de formulario. */
export function Field({ label, children }: FieldProps) {
  return (
    <div>
      <label className="block mb-1 text-[10.5px] font-bold uppercase tracking-wide text-muted-foreground">
        {label}
      </label>
      {children}
    </div>
  )
}

// ─── IconButton ─────────────────────────────────────────────────────────────

interface IconButtonProps {
  icon: ComponentType<{ className?: string }>
  label: string
  onClick: () => void
  disabled?: boolean
  variant?: "default" | "accent" | "dashed" | "ghost"
  accent?: "rose" | "violet"
  danger?: boolean
}

/** Botón compacto con icono para acciones fuera del toolbar (secciones, ítems, etc.). */
export function IconButton({
  icon: Icon,
  label,
  onClick,
  disabled,
  variant = "default",
  accent = "rose",
  danger,
}: IconButtonProps) {
  const accentVar = `var(--accent-${accent === "rose" ? "pruebas" : "guias"})`
  const accentSoft = `var(--accent-${accent === "rose" ? "pruebas" : "guias"}-soft)`
  const accentFocus =
    accent === "violet"
      ? "focus-visible:ring-[var(--accent-guias)]"
      : "focus-visible:ring-[var(--accent-pruebas)]"
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-[8px] px-2.5 py-1.5 text-[11px] font-bold transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        "disabled:cursor-not-allowed disabled:opacity-50",
        !danger && (variant === "accent" || variant === "dashed") && accentFocus,
        variant === "accent" && !danger && "border hover:opacity-90",
        variant === "dashed" && !danger && "border-2 border-dashed hover:opacity-90",
        variant === "ghost" && "border border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/60",
        variant === "default" && !danger && "border border-border bg-card text-foreground hover:bg-muted/60",
        danger && "border border-red-200 bg-red-50 text-red-600 hover:bg-red-100 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300",
      )}
      style={
        !danger && (variant === "accent" || variant === "dashed")
          ? { borderColor: accentVar, backgroundColor: accentSoft, color: accentVar }
          : undefined
      }
    >
      <Icon className="h-3.5 w-3.5" />
      <span>{label}</span>
    </button>
  )
}
