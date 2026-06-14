import type { LucideIcon } from "lucide-react"

import { cn } from "@/lib/utils"

/**
 * Header compacto para los Hubs de Pruebas y Guías.
 *
 * - Layout flex responsive: columna en mobile, fila alineada al final con
 *   acciones a la derecha en desktop (`lg:`).
 * - Avatar de icono (h-11 w-11) con fondo soft + foreground del acento
 *   contextual (`rose` para Pruebas, `violet` para Guías) consumiendo
 *   tokens CSS definidos en `app/globals.css`.
 * - El subtítulo se trunca a 120 caracteres para evitar overflow visual
 *   incluso si el llamador pasa un texto más largo.
 * - Acciones secundarias se renderizan antes que la primaria (orden
 *   visual de "menos énfasis a más énfasis"). Todas exponen `aria-label`,
 *   anillo de foco con el acento contextual y estilos disabled
 *   consistentes (`opacity-50` + `cursor-not-allowed`).
 * - No requiere `"use client"`: los callbacks se reciben como props desde
 *   componentes client (los hubs).
 *
 * Refs: Req 2.2, Req 3.2, Req 12.5
 */

type Accent = "rose" | "violet"

interface HubHeaderAction {
  label: string
  icon: LucideIcon
  onClick: () => void
  disabled?: boolean
}

interface HubHeaderProps {
  icon: LucideIcon
  title: string
  subtitle: string
  primary: HubHeaderAction
  secondary: HubHeaderAction[]
  accent: Accent
}

const SUBTITLE_MAX_LENGTH = 120

export function HubHeader({
  icon: Icon,
  title,
  subtitle,
  primary,
  secondary,
  accent,
}: HubHeaderProps) {
  const PrimaryIcon = primary.icon
  const styles = getAccentStyles(accent)
  const truncatedSubtitle =
    subtitle.length > SUBTITLE_MAX_LENGTH
      ? subtitle.slice(0, SUBTITLE_MAX_LENGTH)
      : subtitle

  return (
    <header className="rounded-[18px] border border-border bg-card p-5 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex items-start gap-3">
          <span
            aria-hidden="true"
            className={cn(
              "grid h-11 w-11 place-items-center rounded-[12px]",
              styles.iconAvatar,
            )}
          >
            <Icon className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h1 className="text-[24px] font-black tracking-tight text-foreground">
              {title}
            </h1>
            <p className="mt-1 max-w-2xl text-[13px] leading-5 text-muted-foreground">
              {truncatedSubtitle}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {secondary.map((item) => {
            const SecondaryIcon = item.icon
            return (
              <button
                key={item.label}
                type="button"
                onClick={item.onClick}
                disabled={item.disabled}
                aria-label={item.label}
                className={cn(
                  "inline-flex items-center gap-2 rounded-[10px] border border-border bg-card px-3 py-2",
                  "text-[12px] font-black text-foreground transition-colors hover:bg-muted/60",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                  styles.focusRing,
                  "disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-card",
                )}
              >
                <SecondaryIcon aria-hidden="true" className="h-4 w-4" />
                {item.label}
              </button>
            )
          })}

          <button
            type="button"
            onClick={primary.onClick}
            disabled={primary.disabled}
            aria-label={primary.label}
            className={cn(
              "inline-flex items-center gap-2 rounded-[10px] px-4 py-2",
              "text-[12px] font-black text-white shadow-sm transition-opacity hover:opacity-90",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
              styles.primaryButton,
              styles.focusRing,
              "disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:opacity-50",
            )}
          >
            <PrimaryIcon aria-hidden="true" className="h-4 w-4" />
            {primary.label}
          </button>
        </div>
      </div>
    </header>
  )
}

export default HubHeader

interface AccentStyles {
  iconAvatar: string
  primaryButton: string
  focusRing: string
}

function getAccentStyles(accent: Accent): AccentStyles {
  if (accent === "violet") {
    return {
      iconAvatar:
        "bg-[var(--accent-guias-soft)] text-[var(--accent-guias)]",
      primaryButton: "bg-[var(--accent-guias)] text-white",
      focusRing: "focus-visible:ring-[var(--accent-guias)]",
    }
  }

  return {
    iconAvatar:
      "bg-[var(--accent-pruebas-soft)] text-[var(--accent-pruebas)]",
    primaryButton: "bg-[var(--accent-pruebas)] text-white",
    focusRing: "focus-visible:ring-[var(--accent-pruebas)]",
  }
}
