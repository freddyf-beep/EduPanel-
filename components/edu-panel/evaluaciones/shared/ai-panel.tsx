"use client"

// ═══════════════════════════════════════════════════════════════════════════
// AIPanel — wrapper del EvalCopilotPanel como side drawer plegable
// ─────────────────────────────────────────────────────────────────────────
// Presenta el EvalCopilotPanel existente dentro de un drawer lateral que:
//   • En mobile: overlay full-screen con backdrop semitransparente.
//   • En desktop (lg+): sticky al lado derecho del editor, sin overlay.
//   • Animación de slide-in/out con transition-transform.
//   • Botón de cierre con aria-label.
//
// Refs: Req 5.15, Req 5.16
// ═══════════════════════════════════════════════════════════════════════════

import { Bot, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { EvalCopilotPanel } from "@/components/edu-panel/evaluaciones/ia/eval-copilot-panel"
import type { ContextoCurricular } from "@/lib/ai/evaluaciones-copilot"

// ─── Props ──────────────────────────────────────────────────────────────────

export interface AIPanelProps {
  /** Controla si el drawer está abierto. */
  open: boolean
  /** Callback para cerrar el drawer. */
  onClose: () => void
  // ── Props de EvalCopilotPanel ──────────────────────────────────────────
  /** Tipo de documento activo en el editor. */
  tipoDoc: "prueba" | "guia"
  /** Contexto curricular vinculado al documento. */
  contexto: ContextoCurricular
  /** Documento actual del editor (para que la IA lo tome como base). */
  documentoActual?: Record<string, unknown>
  /** Callback cuando la IA genera contenido JSON para aplicar al editor. */
  onAplicar?: (data: Record<string, unknown>) => void
}

// ─── Componente ─────────────────────────────────────────────────────────────

export function AIPanel({
  open,
  onClose,
  tipoDoc,
  contexto,
  documentoActual,
  onAplicar,
}: AIPanelProps) {
  return (
    <>
      {/* Overlay en mobile — cierra al hacer click fuera */}
      {open && (
        <div
          aria-hidden="true"
          className="fixed inset-0 z-40 bg-black/20 lg:hidden"
          onClick={onClose}
        />
      )}

      {/* Drawer lateral */}
      <aside
        aria-label="Panel Asistente IA"
        className={cn(
          // Base: fixed en mobile, sticky en desktop
          "fixed right-0 top-0 z-50 h-full w-full max-w-sm border-l border-border bg-card shadow-xl",
          "transition-transform duration-200",
          // Desktop: sticky dentro del layout del editor
          "lg:sticky lg:top-0 lg:h-[calc(100vh-4rem)] lg:translate-x-0 lg:shadow-none",
          // Visibilidad controlada por `open`
          open ? "translate-x-0" : "translate-x-full lg:hidden",
        )}
      >
        {/* Header del drawer */}
        <div className="flex h-14 items-center justify-between border-b border-border px-4">
          <div className="flex items-center gap-2 text-[13px] font-bold text-foreground">
            <Bot aria-hidden="true" className="h-4 w-4 text-primary" />
            Asistente IA
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar panel IA"
            className={cn(
              "rounded-[8px] p-1.5 text-muted-foreground",
              "transition-colors hover:bg-muted/40",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-offset-background focus-visible:ring-primary",
            )}
          >
            <X aria-hidden="true" className="h-4 w-4" />
          </button>
        </div>

        {/* Contenido: EvalCopilotPanel con scroll */}
        <div className="h-[calc(100%-3.5rem)] overflow-y-auto">
          <EvalCopilotPanel
            tipoDoc={tipoDoc}
            contexto={contexto}
            documentoActual={documentoActual}
            onAplicar={onAplicar}
            visible={open}
            onClose={onClose}
          />
        </div>
      </aside>
    </>
  )
}

export default AIPanel
