"use client"

import type { KeyboardEvent } from "react"
import type { LucideIcon } from "lucide-react"

import { cn } from "@/lib/utils"

/**
 * DocumentCard compartido para los hubs de Pruebas y Guías.
 *
 * - Render consistente con `bg-card`, badges de tipo y estado, contadores en
 *   mini-grid (1–4 columnas según `miniStats.length`), action group abajo.
 * - Acento contextual (`rose` para Pruebas, `violet` para Guías) consumido
 *   desde tokens CSS (`--accent-pruebas*`, `--accent-guias*`) — tarea 1.1.
 * - Soporta `onClick` a nivel de tarjeta sin atrapar el click de los botones
 *   internos (cada acción se detiene con `stopPropagation`).
 * - Cada acción del action group expone `aria-label` + `title` y un anillo
 *   `focus-visible`. Los tonos `danger` usan rojos, `primary` usa el acento.
 *
 * Refs: Req 2.8, Req 2.9, Req 3.7, Req 3.8
 */

type Variant = "prueba" | "guia"
type Accent = "rose" | "violet"
type BadgeTone = "primary" | "neutral" | "success" | "warning" | "danger"
type ActionTone = "primary" | "danger" | "neutral"

export interface DocumentCardBadge {
  label: string
  tone: BadgeTone
}

export interface DocumentCardMiniStat {
  label: string
  value: number | string
}

export interface DocumentCardCobertura {
  cubiertos: number
  total: number
}

export interface DocumentCardAction {
  label: string
  icon: LucideIcon
  onClick: () => void
  tone?: ActionTone
  disabled?: boolean
}

export interface DocumentCardProps {
  variant: Variant
  accent: Accent
  icon: LucideIcon
  badges: DocumentCardBadge[]
  title: string
  subtitle?: string
  /** Etiqueta opcional tipo "Guía 1" mostrada como chip neutro. */
  numeroLabel?: string
  /** Preview del objetivo limitado a 2 líneas vía `line-clamp-2`. */
  objetivoPreview?: string
  miniStats: DocumentCardMiniStat[]
  coberturaOA?: DocumentCardCobertura
  topActions?: DocumentCardAction[]
  actions: DocumentCardAction[]
  onClick?: () => void
}

export function DocumentCard({
  variant,
  accent,
  icon: Icon,
  badges,
  title,
  subtitle,
  numeroLabel,
  objetivoPreview,
  miniStats,
  coberturaOA,
  topActions = [],
  actions,
  onClick,
}: DocumentCardProps) {
  const accentStyles = getAccentStyles(accent)
  const interactive = typeof onClick === "function"

  // Clamp del número de columnas del mini-grid a [1..4].
  const cols = clampCols(miniStats.length)
  const gridColsClass =
    cols === 1
      ? "grid-cols-1"
      : cols === 2
        ? "grid-cols-2"
        : cols === 3
          ? "grid-cols-3"
          : "grid-cols-4"

  const handleKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    if (!interactive) return
    if (e.target !== e.currentTarget) return
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault()
      onClick?.()
    }
  }

  return (
    <article
      data-variant={variant}
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      onClick={interactive ? onClick : undefined}
      onKeyDown={interactive ? handleKeyDown : undefined}
      aria-label={interactive ? title : undefined}
      className={cn(
        "flex min-h-[250px] flex-col rounded-[16px] border border-border bg-card p-4 shadow-sm transition",
        "hover:shadow-md",
        accentStyles.cardHover,
        interactive &&
          cn(
            "cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
            accentStyles.focusRing,
          ),
      )}
    >
      {/* Header: badges + título + subtitle a la izquierda; icono al borde superior derecho. */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          {(badges.length > 0 || numeroLabel) && (
            <div className="flex flex-wrap items-center gap-1.5">
              {badges.map((b, i) => (
                <Badge key={`${b.label}-${i}`} badge={b} accent={accent} />
              ))}
              {numeroLabel ? (
                <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-muted-foreground">
                  {numeroLabel}
                </span>
              ) : null}
            </div>
          )}

          <h3 className="mt-2 line-clamp-2 text-[15px] font-black leading-tight text-foreground">
            {title}
          </h3>

          {subtitle ? (
            <p className="mt-1 text-[12px] font-semibold text-muted-foreground">
              {subtitle}
            </p>
          ) : null}

          {objetivoPreview ? (
            <p className="mt-2 line-clamp-2 text-[12px] leading-snug text-muted-foreground">
              {objetivoPreview}
            </p>
          ) : null}
        </div>

        <div className="flex flex-shrink-0 flex-col items-end gap-1.5">
          {topActions.map((a, i) => (
            <TopActionButton key={`${a.label}-${i}`} action={a} accent={accent} />
          ))}
          <Icon
            aria-hidden="true"
            className={cn("h-5 w-5", accentStyles.icon)}
          />
        </div>
      </div>

      {/* Mini-grid de contadores (1–4 columnas según cantidad de stats). */}
      {miniStats.length > 0 ? (
        <div
          className={cn(
            "mt-4 grid gap-2 rounded-[12px] bg-muted/40 p-2 text-center",
            gridColsClass,
          )}
        >
          {miniStats.slice(0, 4).map((s, i) => (
            <MiniStat key={`${s.label}-${i}`} stat={s} />
          ))}
        </div>
      ) : null}

      {/* Cobertura OA: barra delgada con texto "OAs: X/Y". */}
      {coberturaOA ? (
        <CoberturaBar accent={accent} cobertura={coberturaOA} />
      ) : null}

      {/* Action group abajo, alineado al pie con `mt-auto`. */}
      {actions.length > 0 ? (
        <div className="mt-auto flex flex-wrap gap-1.5 pt-3">
          {actions.map((a, i) => (
            <ActionButton key={`${a.label}-${i}`} action={a} accent={accent} />
          ))}
        </div>
      ) : null}
    </article>
  )
}

export default DocumentCard

/* ───────────────────────── Subcomponentes internos ───────────────────────── */

function Badge({
  badge,
  accent,
}: {
  badge: DocumentCardBadge
  accent: Accent
}) {
  const cls = getBadgeToneClass(badge.tone, accent)
  return (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-wide",
        cls,
      )}
    >
      {badge.label}
    </span>
  )
}

function MiniStat({ stat }: { stat: DocumentCardMiniStat }) {
  return (
    <div>
      <div className="text-[15px] font-black text-foreground">{stat.value}</div>
      <div className="text-[9px] font-black uppercase tracking-wide text-muted-foreground">
        {stat.label}
      </div>
    </div>
  )
}

function CoberturaBar({
  accent,
  cobertura,
}: {
  accent: Accent
  cobertura: DocumentCardCobertura
}) {
  const total = Math.max(0, cobertura.total)
  const cubiertos = Math.max(0, Math.min(cobertura.cubiertos, total))
  const pct = total === 0 ? 0 : Math.round((cubiertos / total) * 100)
  const fillColor =
    accent === "violet"
      ? "bg-[var(--accent-guias)]"
      : "bg-[var(--accent-pruebas)]"

  return (
    <div
      className="mt-3 flex items-center gap-2"
      aria-label={`Cobertura de OAs: ${cubiertos} de ${total}`}
    >
      <span className="text-[10px] font-black uppercase tracking-wide text-muted-foreground">
        OAs: {cubiertos}/{total}
      </span>
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted"
      >
        <div
          className={cn("h-full transition-[width]", fillColor)}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

function ActionButton({
  action,
  accent,
}: {
  action: DocumentCardAction
  accent: Accent
}) {
  const tone: ActionTone = action.tone ?? "neutral"
  const Icon = action.icon
  const styles = getActionToneClass(tone, accent)

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        action.onClick()
      }}
      disabled={action.disabled}
      aria-label={action.label}
      title={action.label}
      className={cn(
        "inline-flex items-center justify-center gap-1.5 rounded-[10px] px-2.5 py-2 text-[12px] font-semibold transition",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        "disabled:cursor-not-allowed disabled:opacity-50",
        styles.base,
        styles.focus,
        // El primer botón "primary" gana flex-1 para parecerse al patrón de
        // las cards anteriores (Editar ocupa el ancho restante).
        tone === "primary" ? "flex-1 min-w-0" : "",
      )}
    >
      <Icon aria-hidden="true" className="h-3.5 w-3.5" />
      <span className={cn(tone === "primary" ? "" : "sr-only sm:not-sr-only")}>
        {action.label}
      </span>
    </button>
  )
}

function TopActionButton({
  action,
  accent,
}: {
  action: DocumentCardAction
  accent: Accent
}) {
  const tone: ActionTone = action.tone ?? "neutral"
  const Icon = action.icon
  const styles = getActionToneClass(tone, accent)

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        action.onClick()
      }}
      disabled={action.disabled}
      aria-label={action.label}
      title={action.label}
      className={cn(
        "inline-flex h-8 w-8 items-center justify-center rounded-[9px] text-[12px] font-semibold transition",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        "disabled:cursor-not-allowed disabled:opacity-50",
        styles.base,
        styles.focus,
      )}
    >
      <Icon aria-hidden="true" className="h-3.5 w-3.5" />
      <span className="sr-only">{action.label}</span>
    </button>
  )
}

/* ───────────────────────────── Style helpers ────────────────────────────── */

interface AccentStyles {
  cardHover: string
  focusRing: string
  icon: string
}

function getAccentStyles(accent: Accent): AccentStyles {
  if (accent === "violet") {
    return {
      cardHover: "hover:border-[var(--accent-guias)]/30",
      focusRing: "focus-visible:ring-[var(--accent-guias)]",
      icon: "text-[var(--accent-guias)]",
    }
  }
  return {
    cardHover: "hover:border-[var(--accent-pruebas)]/30",
    focusRing: "focus-visible:ring-[var(--accent-pruebas)]",
    icon: "text-[var(--accent-pruebas)]",
  }
}

function getBadgeToneClass(tone: BadgeTone, accent: Accent): string {
  switch (tone) {
    case "primary":
      return accent === "violet"
        ? "bg-[var(--accent-guias-soft)] text-[var(--accent-guias)]"
        : "bg-[var(--accent-pruebas-soft)] text-[var(--accent-pruebas)]"
    case "success":
      return "bg-[var(--status-green-bg)] text-[var(--status-green-text)] border border-[var(--status-green-border)]"
    case "warning":
      return "bg-[var(--status-amber-bg)] text-[var(--status-amber-text)] border border-[var(--status-amber-border)]"
    case "danger":
      return "bg-[var(--status-red-bg)] text-[var(--status-red-text)] border border-[var(--status-red-border)]"
    case "neutral":
    default:
      return "bg-muted text-muted-foreground"
  }
}

interface ActionToneStyles {
  base: string
  focus: string
}

function getActionToneClass(tone: ActionTone, accent: Accent): ActionToneStyles {
  if (tone === "primary") {
    if (accent === "violet") {
      return {
        base: "bg-[var(--accent-guias)] text-white hover:opacity-90",
        focus: "focus-visible:ring-[var(--accent-guias)]",
      }
    }
    return {
      base: "bg-[var(--accent-pruebas)] text-white hover:opacity-90",
      focus: "focus-visible:ring-[var(--accent-pruebas)]",
    }
  }

  if (tone === "danger") {
    return {
      base:
        "border border-border bg-card text-[var(--status-red-text)] hover:bg-[var(--status-red-bg)] hover:border-[var(--status-red-border)]",
      focus: "focus-visible:ring-[var(--status-red-text)]",
    }
  }

  // neutral
  return {
    base:
      "border border-border bg-card text-foreground hover:bg-muted/60",
    focus:
      accent === "violet"
        ? "focus-visible:ring-[var(--accent-guias)]"
        : "focus-visible:ring-[var(--accent-pruebas)]",
  }
}

function clampCols(n: number): 1 | 2 | 3 | 4 {
  if (n <= 1) return 1
  if (n === 2) return 2
  if (n === 3) return 3
  return 4
}
