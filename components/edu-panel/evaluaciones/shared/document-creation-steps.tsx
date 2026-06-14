"use client"

import { Check, ClipboardList, Eye, Settings } from "lucide-react"
import { cn } from "@/lib/utils"

export type DocumentCreationStep = "config" | "contenido" | "revisar"

interface DocumentCreationStepsProps {
  current: DocumentCreationStep
  onChange: (step: DocumentCreationStep) => void
  accent: "rose" | "violet"
  contentCount: number
  contentLabel: string
  ready: boolean
}

const STEPS: Array<{
  id: DocumentCreationStep
  label: string
  icon: typeof Settings
}> = [
  { id: "config", label: "Configuración", icon: Settings },
  { id: "contenido", label: "Contenido", icon: ClipboardList },
  { id: "revisar", label: "Revisar", icon: Eye },
]

export function DocumentCreationSteps({
  current,
  onChange,
  accent,
  contentCount,
  contentLabel,
  ready,
}: DocumentCreationStepsProps) {
  const accentVar = `var(--accent-${accent === "rose" ? "pruebas" : "guias"})`
  const accentSoft = `var(--accent-${accent === "rose" ? "pruebas" : "guias"}-soft)`
  const focusRing =
    accent === "violet"
      ? "focus-visible:ring-[var(--accent-guias)]"
      : "focus-visible:ring-[var(--accent-pruebas)]"

  return (
    <div className="rounded-[12px] border border-border bg-card p-3 shadow-sm">
      <div className="grid gap-2 sm:grid-cols-3">
        {STEPS.map((step, index) => {
          const Icon = step.icon
          const active = step.id === current
          const done =
            step.id === "config"
              ? ready
              : step.id === "contenido"
                ? contentCount > 0
                : false

          return (
            <button
              key={step.id}
              type="button"
              onClick={() => onChange(step.id)}
              className={cn(
                "flex min-h-12 items-center gap-2 rounded-[10px] border px-3 py-2 text-left transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                focusRing,
                active
                  ? "text-foreground"
                  : "border-border bg-background text-muted-foreground hover:bg-muted/50",
              )}
              style={active ? { borderColor: accentVar, backgroundColor: accentSoft } : undefined}
            >
              <span
                className="grid h-7 w-7 flex-shrink-0 place-items-center rounded-full text-[11px] font-extrabold"
                style={{
                  backgroundColor: active ? accentVar : "var(--muted)",
                  color: active ? "white" : "var(--muted-foreground)",
                }}
              >
                {done ? <Check className="h-3.5 w-3.5" /> : index + 1}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[12px] font-extrabold">{step.label}</span>
                <span className="block truncate text-[10.5px] font-semibold opacity-75">
                  {step.id === "contenido" ? `${contentCount} ${contentLabel}` : step.id === "revisar" ? "Vista final" : "Datos base"}
                </span>
              </span>
              <Icon className="h-3.5 w-3.5 flex-shrink-0 opacity-70" />
            </button>
          )
        })}
      </div>
    </div>
  )
}

export default DocumentCreationSteps
