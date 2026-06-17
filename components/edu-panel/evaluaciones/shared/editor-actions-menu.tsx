"use client"

import { useEffect, useRef, useState } from "react"
import type { LucideIcon } from "lucide-react"
import { MoreHorizontal } from "lucide-react"

import { cn } from "@/lib/utils"

type Accent = "rose" | "violet"

export interface EditorActionMenuItem {
  label: string
  icon: LucideIcon
  onClick: () => void
  danger?: boolean
  disabled?: boolean
}

interface EditorActionsMenuProps {
  accent: Accent
  actions: EditorActionMenuItem[]
}

export function EditorActionsMenu({ accent, actions }: EditorActionsMenuProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const focusRing =
    accent === "violet"
      ? "focus-visible:ring-[var(--accent-guias)]"
      : "focus-visible:ring-[var(--accent-pruebas)]"

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener("mousedown", onPointerDown)
    return () => document.removeEventListener("mousedown", onPointerDown)
  }, [open])

  if (actions.length === 0) return null

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-label="Más acciones"
        aria-haspopup="menu"
        aria-expanded={open}
        className={cn(
          "inline-flex h-9 w-9 items-center justify-center rounded-[10px] border border-border bg-card text-foreground transition-colors hover:bg-muted/60",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
          focusRing,
        )}
      >
        <MoreHorizontal aria-hidden="true" className="h-4 w-4" />
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute right-0 top-full z-50 mt-1.5 w-56 overflow-hidden rounded-[12px] border border-border bg-card p-1 shadow-[0_12px_30px_rgba(0,0,0,0.16)]"
        >
          {actions.map((action) => {
            const Icon = action.icon
            return (
              <button
                key={action.label}
                type="button"
                role="menuitem"
                disabled={action.disabled}
                onClick={() => {
                  setOpen(false)
                  action.onClick()
                }}
                className={cn(
                  "flex w-full items-center gap-2 rounded-[9px] px-3 py-2 text-left text-[12.5px] font-semibold transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset",
                  focusRing,
                  action.danger
                    ? "text-[var(--status-red-text)] hover:bg-[var(--status-red-bg)]"
                    : "text-foreground hover:bg-muted/60",
                  "disabled:cursor-not-allowed disabled:opacity-50",
                )}
              >
                <Icon aria-hidden="true" className="h-3.5 w-3.5 flex-shrink-0" />
                <span className="min-w-0 flex-1 truncate">{action.label}</span>
              </button>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}

export default EditorActionsMenu
