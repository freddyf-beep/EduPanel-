import type { LucideIcon } from "lucide-react"

import { cn } from "@/lib/utils"

type Accent = "rose" | "violet"

interface EmptyStateAction {
  label: string
  onClick: () => void
  icon?: LucideIcon
}

interface EmptyStateProps {
  icon: LucideIcon
  title: string
  text?: string
  action?: EmptyStateAction
  accent?: Accent
  secondaryAction?: EmptyStateAction
}

/**
 * EmptyState compartido para los hubs y editores de Pruebas y Guías.
 *
 * - Border dashed con acento contextual (`rose` para Pruebas, `violet` para Guías).
 * - Soporte automático de dark mode al consumir tokens CSS (`--accent-*`,
 *   `--background`, `--foreground`, `--muted-foreground`).
 * - Sin `"use client"`: es un componente puramente presentacional.
 *
 * Refs: Req 13.5, Req 2.17, Req 2.18, Req 3.15
 */
export function EmptyState({
  icon: Icon,
  title,
  text,
  action,
  accent,
  secondaryAction,
}: EmptyStateProps) {
  const accentStyles = getAccentStyles(accent)

  return (
    <div
      className={cn(
        "rounded-[14px] border-2 border-dashed p-8 text-center",
        accentStyles.container,
      )}
    >
      <Icon
        aria-hidden="true"
        className={cn("mx-auto h-10 w-10", accentStyles.icon)}
      />

      <h3 className="mt-3 text-[14px] font-extrabold text-foreground">
        {title}
      </h3>

      {text ? (
        <p className="mx-auto mt-1 max-w-md text-[12.5px] leading-5 text-muted-foreground">
          {text}
        </p>
      ) : null}

      {action || secondaryAction ? (
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          {action ? (
            <button
              type="button"
              onClick={action.onClick}
              aria-label={action.label}
              className={cn(
                "inline-flex items-center justify-center gap-1.5 rounded-[10px] px-4 py-2 text-[12px] font-bold transition-opacity",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                accentStyles.primaryButton,
              )}
            >
              {action.icon ? (
                <action.icon aria-hidden="true" className="h-4 w-4" />
              ) : null}
              {action.label}
            </button>
          ) : null}

          {secondaryAction ? (
            <button
              type="button"
              onClick={secondaryAction.onClick}
              aria-label={secondaryAction.label}
              className={cn(
                "inline-flex items-center justify-center gap-1.5 rounded-[10px] border border-border bg-card px-4 py-2 text-[12px] font-medium text-foreground transition-colors hover:bg-muted/60",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                accentStyles.secondaryButtonFocus,
              )}
            >
              {secondaryAction.icon ? (
                <secondaryAction.icon aria-hidden="true" className="h-4 w-4" />
              ) : null}
              {secondaryAction.label}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

export default EmptyState

interface AccentStyles {
  container: string
  icon: string
  primaryButton: string
  secondaryButtonFocus: string
}

function getAccentStyles(accent?: Accent): AccentStyles {
  if (accent === "rose") {
    return {
      container:
        "border-[var(--accent-pruebas)]/30 bg-[var(--accent-pruebas-soft)]/30",
      icon: "text-[var(--accent-pruebas)]/60",
      primaryButton:
        "bg-[var(--accent-pruebas)] text-white hover:opacity-90 focus-visible:ring-[var(--accent-pruebas)]",
      secondaryButtonFocus: "focus-visible:ring-[var(--accent-pruebas)]",
    }
  }

  if (accent === "violet") {
    return {
      container:
        "border-[var(--accent-guias)]/30 bg-[var(--accent-guias-soft)]/30",
      icon: "text-[var(--accent-guias)]/60",
      primaryButton:
        "bg-[var(--accent-guias)] text-white hover:opacity-90 focus-visible:ring-[var(--accent-guias)]",
      secondaryButtonFocus: "focus-visible:ring-[var(--accent-guias)]",
    }
  }

  return {
    container: "border-border bg-card text-foreground",
    icon: "text-muted-foreground/60",
    primaryButton:
      "bg-primary text-primary-foreground hover:opacity-90 focus-visible:ring-primary",
    secondaryButtonFocus: "focus-visible:ring-primary",
  }
}
