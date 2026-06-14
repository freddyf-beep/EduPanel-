"use client"

import type { ReactNode } from "react"
import { ArrowLeft } from "lucide-react"

import { cn } from "@/lib/utils"

/**
 * Sticky toolbar compartida por los editores de Prueba y Guía.
 *
 * - `sticky top-0 z-30` con `backdrop-blur-sm` y `border-b` para mantenerse
 *   visible mientras el docente navega secciones largas, sin tapar el header
 *   compacto del shell unificado (`view === "editor"`).
 * - Cluster izquierdo: botón Volver (icon-only, min 36×36 px), slot opcional
 *   `actionsLeft`, input opcional de número de guía (max-w-24, centrado,
 *   bold), input editable de título (`flex-1 min-w-0 max-w-xl`), chip de
 *   counter ("{N} ítems · {P} pts"), chip de badge opcional con tono
 *   (`primary | neutral | success | warning | danger`) e indicador de
 *   cambios sin guardar (`●`).
 * - Cluster derecho: `actionsRight` agrupado con `ml-auto` y wrap natural
 *   en viewports angostos.
 * - Acento contextual: `rose` (Pruebas) o `violet` (Guías) consumido desde
 *   los tokens CSS `--accent-pruebas*` / `--accent-guias*` definidos en
 *   `app/globals.css` (tarea 1.1).
 * - El input de título y el de número limitan a 120 / 8 caracteres y se
 *   sanitizan también en `onChange` con `slice` por si el navegador
 *   ignora `maxLength`.
 *
 * Refs: Req 5.3, Req 6.3
 */

type Accent = "rose" | "violet"
type BadgeTone = "primary" | "neutral" | "success" | "warning" | "danger"

const TITLE_MAX_LENGTH = 120
const NUMERO_MAX_LENGTH = 8

export interface StickyEditorToolbarBadge {
  label: string
  tone: BadgeTone
}

export interface StickyEditorToolbarNumero {
  value: string
  onChange: (s: string) => void
}

export interface StickyEditorToolbarProps {
  /** Callback de "Volver" (icon-only). */
  onBack: () => void
  /** Texto actual del título. Se usa como `value` controlado del input. */
  title: string
  /** Setter del título; recibe el string ya truncado a 120 chars. */
  onTitleChange: (s: string) => void
  /** Input opcional de número de guía (solo en Editor_Guia). */
  numero?: StickyEditorToolbarNumero
  /** Texto del chip contador, p.ej. "24 ítems · 42 pts". */
  counter: string
  /** Chip de estado con tono semántico (Borrador, Lista, Aplicada...). */
  badge?: StickyEditorToolbarBadge
  /** Acento contextual: `rose` para Pruebas, `violet` para Guías. */
  accent: Accent
  /** Slot opcional renderizado entre Volver y el título. */
  actionsLeft?: ReactNode
  /** Slot principal de acciones, alineado a la derecha. */
  actionsRight: ReactNode
  /** Si hay cambios sin guardar, muestra un punto con `aria-label`. */
  dirty?: boolean
}

export function StickyEditorToolbar({
  onBack,
  title,
  onTitleChange,
  numero,
  counter,
  badge,
  accent,
  actionsLeft,
  actionsRight,
  dirty,
}: StickyEditorToolbarProps) {
  const styles = getAccentStyles(accent)

  return (
    <div
      className={cn(
        "sticky top-0 z-30 flex flex-wrap items-center gap-2",
        "border-b border-border bg-card/90 px-3 py-2 backdrop-blur-sm",
      )}
    >
      <button
        type="button"
        onClick={onBack}
        aria-label="Volver"
        title="Volver"
        className={cn(
          "inline-flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-[10px]",
          "border border-border bg-card text-foreground transition-colors hover:bg-muted/60",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
          styles.focusRing,
        )}
      >
        <ArrowLeft aria-hidden="true" className="h-4 w-4" />
      </button>

      {actionsLeft ? (
        <div className="flex flex-shrink-0 items-center gap-1.5">
          {actionsLeft}
        </div>
      ) : null}

      {numero ? (
        <input
          type="text"
          value={numero.value}
          onChange={(e) =>
            numero.onChange(e.target.value.slice(0, NUMERO_MAX_LENGTH))
          }
          maxLength={NUMERO_MAX_LENGTH}
          placeholder="N°"
          aria-label="Número de guía"
          className={cn(
            "h-9 max-w-24 rounded-[10px] border border-border bg-background px-2",
            "text-center text-[14px] font-bold text-foreground",
            "placeholder:font-medium placeholder:text-muted-foreground",
            "focus-visible:outline-none focus-visible:ring-2",
            styles.focusRing,
          )}
        />
      ) : null}

      <input
        type="text"
        value={title}
        onChange={(e) =>
          onTitleChange(e.target.value.slice(0, TITLE_MAX_LENGTH))
        }
        maxLength={TITLE_MAX_LENGTH}
        placeholder="Sin título"
        aria-label="Título"
        className={cn(
          "h-9 min-w-0 max-w-xl flex-1 border-0 bg-transparent px-1",
          "text-[15px] font-extrabold text-foreground",
          "placeholder:font-bold placeholder:text-muted-foreground",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:rounded-[8px]",
          styles.focusRing,
        )}
      />

      <span
        className={cn(
          "flex-shrink-0 rounded-full bg-muted px-2 py-0.5",
          "text-[11px] font-bold text-muted-foreground",
        )}
        aria-label={`Resumen: ${counter}`}
      >
        {counter}
      </span>

      {badge ? (
        <span
          className={cn(
            "flex-shrink-0 rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-wide",
            getBadgeToneClass(badge.tone, accent),
          )}
        >
          {badge.label}
        </span>
      ) : null}

      {dirty ? (
        <span
          aria-label="Cambios sin guardar"
          title="Cambios sin guardar"
          className={cn("flex-shrink-0 text-[14px] leading-none", styles.dirtyText)}
        >
          ●
        </span>
      ) : null}

      <div className="ml-auto flex flex-wrap items-center gap-1.5">
        {actionsRight}
      </div>
    </div>
  )
}

export default StickyEditorToolbar

/* ───────────────────────────── Style helpers ────────────────────────────── */

interface AccentStyles {
  focusRing: string
  dirtyText: string
}

function getAccentStyles(accent: Accent): AccentStyles {
  if (accent === "violet") {
    return {
      focusRing: "focus-visible:ring-[var(--accent-guias)]",
      dirtyText: "text-[var(--accent-guias)]",
    }
  }
  return {
    focusRing: "focus-visible:ring-[var(--accent-pruebas)]",
    dirtyText: "text-[var(--accent-pruebas)]",
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
