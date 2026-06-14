"use client"

// ═══════════════════════════════════════════════════════════════════════════
// VerCoberturaButton — botón "Ver cobertura" para el selector sticky.
// ─────────────────────────────────────────────────────────────────────────
// Wrapper liviano que se inyecta en la prop `extra` de `CursoUnidadSelector`.
// Mantiene el estado de apertura del modal `CoverageView` y reenvía la unidad
// activa, las pruebas y guías del curso, junto con los callbacks de
// navegación (`onOpenPrueba`, `onOpenGuia`).
//
// Comportamiento (Req 9.2):
//  • Visible siempre que el selector esté montado, pero sólo es accionable
//    cuando hay una `unidad` activa.
//  • Cuando `unidad === null`, el botón se renderiza `disabled` con
//    `title="Selecciona una unidad para ver la cobertura"` (tooltip nativo).
//  • Al hacer click abre el modal `CoverageView` (task 10.2).
//
// El componente NO modifica `CursoUnidadSelector`: se monta como `extra`.
//
// Refs: Req 9.2
// ═══════════════════════════════════════════════════════════════════════════

import { useState } from "react"
import { Target } from "lucide-react"

import { cn } from "@/lib/utils"
import { CoverageView } from "./coverage-view"
import type { UnidadPlan } from "@/lib/curriculo"
import type { PruebaTemplate } from "@/lib/pruebas"
import type { GuiaTemplate } from "@/lib/guias"

// ─── Props ──────────────────────────────────────────────────────────────────

export interface VerCoberturaButtonProps {
  /** Unidad activa para el cómputo. Si es null, el botón se renderiza disabled con tooltip. */
  unidad: UnidadPlan | null
  /** Pruebas del curso. */
  pruebas: PruebaTemplate[]
  /** Guías del curso. */
  guias: GuiaTemplate[]
  /** Callback al abrir una prueba desde el drill-down. */
  onOpenPrueba: (prueba: PruebaTemplate) => void
  /** Callback al abrir una guía desde el drill-down. */
  onOpenGuia: (guia: GuiaTemplate) => void
  /** Acento del foco visible. Default "rose" (Pruebas). */
  accent?: "rose" | "violet"
}

// ─── Componente ─────────────────────────────────────────────────────────────

export function VerCoberturaButton({
  unidad,
  pruebas,
  guias,
  onOpenPrueba,
  onOpenGuia,
  accent = "rose",
}: VerCoberturaButtonProps) {
  const [open, setOpen] = useState(false)

  const disabled = unidad === null

  // Anillo de foco según acento contextual (clases estáticas para Tailwind JIT).
  const focusRing =
    accent === "violet"
      ? "focus-visible:ring-[var(--accent-guias)]"
      : "focus-visible:ring-[var(--accent-pruebas)]"

  // Color del icono cuando el botón está habilitado: usa el acento contextual.
  const iconColor = disabled
    ? "text-muted-foreground"
    : accent === "violet"
      ? "text-[var(--accent-guias)]"
      : "text-[var(--accent-pruebas)]"

  return (
    <>
      <button
        type="button"
        onClick={() => {
          if (!disabled) setOpen(true)
        }}
        disabled={disabled}
        aria-label="Ver cobertura"
        title={
          disabled
            ? "Selecciona una unidad para ver la cobertura"
            : "Ver cobertura curricular de la unidad activa"
        }
        className={cn(
          "inline-flex h-9 items-center gap-1.5 rounded-[10px] border border-border bg-background px-3 text-[12px] font-bold text-foreground transition-colors",
          "hover:bg-muted/60",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1",
          focusRing,
          "disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-background",
        )}
      >
        <Target aria-hidden="true" className={cn("h-3.5 w-3.5", iconColor)} />
        Ver cobertura
      </button>

      <CoverageView
        open={open}
        onClose={() => setOpen(false)}
        unidad={unidad}
        pruebas={pruebas}
        guias={guias}
        onOpenPrueba={onOpenPrueba}
        onOpenGuia={onOpenGuia}
      />
    </>
  )
}

export default VerCoberturaButton
