"use client"

// ═══════════════════════════════════════════════════════════════════════════
// CoverageView — vista de cobertura curricular (read-only)
// ─────────────────────────────────────────────────────────────────────────
// Modal/drawer con drill-down por OA: lista las pruebas y guías que
// referencian cada Objetivo de Aprendizaje de la unidad activa, con enlaces
// directos a sus respectivos editores.
//
// Características:
//  • "use client" REQUERIDO (usa estado, efectos y document.addEventListener).
//  • Solo lectura: no escribe cambios a Firestore. Toda la lógica de cómputo
//    delega en `lib/coverage.ts` (función pura).
//  • Cada OA se renderiza como una fila colapsable; al expandirla se listan
//    las pruebas/guías vinculadas. Cada item es un botón que invoca
//    `onOpenPrueba`/`onOpenGuia` y cierra el modal.
//  • Header con título, nombre de la unidad, chip de porcentaje y barra de
//    progreso (`role="progressbar"`).
//  • Botón Cerrar (X) en la esquina superior derecha.
//  • Tecla `Escape` cierra el modal.
//  • Empty state cuando la unidad no tiene OAs definidos.
//
// Refs: Req 9.3, Req 9.5, Req 9.6
// ═══════════════════════════════════════════════════════════════════════════

import { useEffect, useMemo, useState } from "react"
import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Circle,
  ClipboardList,
  FileText,
  MinusCircle,
  Target,
  X,
} from "lucide-react"

import { cn } from "@/lib/utils"
import {
  computarCobertura,
  porcentajeCobertura,
  type CoberturaItem,
  type EstadoCobertura,
} from "@/lib/coverage"
import type { UnidadPlan } from "@/lib/curriculo"
import type { PruebaTemplate } from "@/lib/pruebas"
import type { GuiaTemplate } from "@/lib/guias"

// ─── Props ──────────────────────────────────────────────────────────────────

export interface CoverageViewProps {
  open: boolean
  onClose: () => void
  /** Unidad activa (de cargarPlanCurso). */
  unidad: UnidadPlan | null
  /** Conjunto de pruebas del curso. */
  pruebas: PruebaTemplate[]
  /** Conjunto de guías del curso. */
  guias: GuiaTemplate[]
  /** Callback al hacer click en una prueba: navegar al editor. */
  onOpenPrueba: (prueba: PruebaTemplate) => void
  /** Callback al hacer click en una guía: navegar al editor. */
  onOpenGuia: (guia: GuiaTemplate) => void
}

// ─── Componente principal ───────────────────────────────────────────────────

export function CoverageView({
  open,
  onClose,
  unidad,
  pruebas,
  guias,
  onOpenPrueba,
  onOpenGuia,
}: CoverageViewProps) {
  // Cálculo memoizado de la cobertura (función pura de lib/coverage.ts).
  const items = useMemo<CoberturaItem[]>(
    () => (open ? computarCobertura(unidad, pruebas, guias) : []),
    [open, unidad, pruebas, guias],
  )
  const pct = useMemo(() => porcentajeCobertura(items), [items])

  // Estado de fila expandida (solo una a la vez para evitar saturar el modal).
  const [expandedCode, setExpandedCode] = useState<string | null>(null)

  // Reset de expansión al cerrar/abrir el modal.
  useEffect(() => {
    if (!open) setExpandedCode(null)
  }, [open])

  // ESC cierra el modal.
  useEffect(() => {
    if (!open) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault()
        onClose()
      }
    }
    document.addEventListener("keydown", onKeyDown)
    return () => document.removeEventListener("keydown", onKeyDown)
  }, [open, onClose])

  if (!open) return null

  const unidadName = unidad?.name?.trim() || "Unidad sin título"
  const totalOAs = items.length

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Cobertura curricular"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-0 sm:p-4"
      onClick={(e) => {
        // Click fuera (en el backdrop) cierra el modal.
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        className={cn(
          "relative flex h-full w-full max-w-3xl flex-col overflow-hidden bg-card shadow-xl",
          "sm:h-auto sm:max-h-[90vh] sm:rounded-[16px] sm:border sm:border-border",
        )}
      >
        {/* Header */}
        <header className="flex items-start justify-between gap-3 border-b border-border bg-card px-5 py-4 sm:px-6 sm:py-5">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <Target
                aria-hidden="true"
                className="h-4 w-4 text-muted-foreground"
              />
              <h2 className="text-[18px] font-black tracking-tight text-foreground">
                Cobertura curricular
              </h2>
            </div>
            <p className="mt-0.5 truncate text-[13px] text-muted-foreground">
              {unidadName}
            </p>

            {/* Chip de porcentaje + barra de progreso */}
            <div className="mt-3 flex items-center gap-3">
              <span
                className={cn(
                  "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11.5px] font-black",
                  totalOAs === 0
                    ? "bg-muted text-muted-foreground"
                    : "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
                )}
                aria-label={`Cobertura: ${formatPct(pct)}%`}
              >
                {formatPct(pct)}%
              </span>
              <div
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(pct)}
                aria-label="Porcentaje de OAs cubiertos"
                className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted"
              >
                <div
                  className="h-full bg-emerald-500 transition-[width] dark:bg-emerald-400"
                  style={{ width: `${Math.max(0, Math.min(100, pct))}%` }}
                />
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className={cn(
              "grid h-9 w-9 flex-shrink-0 place-items-center rounded-[10px] border border-border bg-card text-muted-foreground",
              "transition-colors hover:bg-muted/60",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:ring-foreground",
            )}
          >
            <X aria-hidden="true" className="h-4 w-4" />
          </button>
        </header>

        {/* Body con scroll */}
        <div className="flex-1 overflow-y-auto px-5 py-4 sm:px-6 sm:py-5">
          {totalOAs === 0 ? (
            <EmptyOAs />
          ) : (
            <ul className="flex flex-col gap-2">
              {items.map((item) => {
                const code = item.oaCode || `OA?-${idxOf(items, item)}`
                const expanded = expandedCode === code
                return (
                  <li key={code}>
                    <CoverageRow
                      item={item}
                      code={code}
                      expanded={expanded}
                      onToggle={() =>
                        setExpandedCode(expanded ? null : code)
                      }
                      onOpenPrueba={(p) => {
                        onOpenPrueba(p)
                        onClose()
                      }}
                      onOpenGuia={(g) => {
                        onOpenGuia(g)
                        onClose()
                      }}
                    />
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}

export default CoverageView

// ─── Subcomponentes ─────────────────────────────────────────────────────────

interface CoverageRowProps {
  item: CoberturaItem
  code: string
  expanded: boolean
  onToggle: () => void
  onOpenPrueba: (p: PruebaTemplate) => void
  onOpenGuia: (g: GuiaTemplate) => void
}

function CoverageRow({
  item,
  code,
  expanded,
  onToggle,
  onOpenPrueba,
  onOpenGuia,
}: CoverageRowProps) {
  const stateStyles = getEstadoStyles(item.estado)
  const StateIcon = stateStyles.icon
  const bodyId = `coverage-row-body-${slug(code)}`

  return (
    <div className="rounded-[12px] border border-border bg-background">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        aria-controls={bodyId}
        className={cn(
          "flex w-full items-start gap-3 rounded-[12px] px-3 py-3 text-left transition-colors hover:bg-muted/40",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:ring-foreground",
        )}
      >
        <span className="mt-0.5 grid h-5 w-5 flex-shrink-0 place-items-center text-muted-foreground">
          {expanded ? (
            <ChevronDown aria-hidden="true" className="h-4 w-4" />
          ) : (
            <ChevronRight aria-hidden="true" className="h-4 w-4" />
          )}
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-md border border-border bg-card px-1.5 py-0.5 text-[11px] font-black text-foreground">
              {code}
            </span>
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-black uppercase tracking-wide",
                stateStyles.badge,
              )}
            >
              <StateIcon aria-hidden="true" className="h-3 w-3" />
              {stateStyles.label}
            </span>
            <CountChip
              icon={FileText}
              label="Pruebas"
              value={item.conteoP}
              tone="rose"
            />
            <CountChip
              icon={ClipboardList}
              label="Guías"
              value={item.conteoG}
              tone="violet"
            />
          </div>

          <p
            className="mt-1 text-[12.5px] leading-5 text-muted-foreground"
            style={lineClamp(2)}
          >
            {item.oaTexto || "Sin descripción disponible."}
          </p>
        </div>
      </button>

      {expanded ? (
        <div
          id={bodyId}
          className="border-t border-border bg-card px-3 py-3"
        >
          {item.pruebas.length === 0 && item.guias.length === 0 ? (
            <p className="px-1 py-2 text-[12.5px] text-muted-foreground">
              Ningún documento referencia este OA todavía.
            </p>
          ) : (
            <div className="flex flex-col gap-3">
              <DocList
                title="Pruebas"
                icon={FileText}
                tone="rose"
                emptyText="Sin pruebas vinculadas"
                items={item.pruebas.map((p) => ({
                  id: p.id,
                  nombre: p.nombre,
                  subtitulo: p.unidadNombre,
                  onClick: () => onOpenPrueba(p),
                }))}
              />
              <DocList
                title="Guías"
                icon={ClipboardList}
                tone="violet"
                emptyText="Sin guías vinculadas"
                items={item.guias.map((g) => ({
                  id: g.id,
                  nombre: g.nombre,
                  subtitulo: g.unidadNombre,
                  onClick: () => onOpenGuia(g),
                }))}
              />
            </div>
          )}
        </div>
      ) : null}
    </div>
  )
}

interface DocListProps {
  title: string
  icon: typeof FileText
  tone: "rose" | "violet"
  emptyText: string
  items: Array<{
    id: string
    nombre: string
    subtitulo?: string
    onClick: () => void
  }>
}

function DocList({ title, icon: Icon, tone, emptyText, items }: DocListProps) {
  const accentClass =
    tone === "violet"
      ? "text-[var(--accent-guias)]"
      : "text-[var(--accent-pruebas)]"
  const focusRing =
    tone === "violet"
      ? "focus-visible:ring-[var(--accent-guias)]"
      : "focus-visible:ring-[var(--accent-pruebas)]"

  return (
    <div>
      <div className="flex items-center gap-1.5 px-1 pb-1.5 text-[11px] font-black uppercase tracking-wide text-muted-foreground">
        <Icon aria-hidden="true" className={cn("h-3.5 w-3.5", accentClass)} />
        {title}
        <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
          {items.length}
        </span>
      </div>
      {items.length === 0 ? (
        <p className="px-1 py-1 text-[12px] italic text-muted-foreground">
          {emptyText}
        </p>
      ) : (
        <ul className="flex flex-col gap-1">
          {items.map((it) => (
            <li key={it.id}>
              <button
                type="button"
                onClick={it.onClick}
                aria-label={`Abrir ${title.toLowerCase().slice(0, -1)}: ${it.nombre}`}
                className={cn(
                  "flex w-full items-start gap-2 rounded-[10px] border border-border bg-background px-2.5 py-2 text-left transition-colors hover:bg-muted/40",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                  focusRing,
                )}
              >
                <Icon
                  aria-hidden="true"
                  className={cn("mt-0.5 h-3.5 w-3.5 flex-shrink-0", accentClass)}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12.5px] font-bold text-foreground">
                    {it.nombre || "Sin título"}
                  </span>
                  {it.subtitulo ? (
                    <span className="block truncate text-[11px] text-muted-foreground">
                      {it.subtitulo}
                    </span>
                  ) : null}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

interface CountChipProps {
  icon: typeof FileText
  label: string
  value: number
  tone: "rose" | "violet"
}

function CountChip({ icon: Icon, label, value, tone }: CountChipProps) {
  const styles =
    tone === "violet"
      ? "bg-[var(--accent-guias-soft)] text-[var(--accent-guias)]"
      : "bg-[var(--accent-pruebas-soft)] text-[var(--accent-pruebas)]"
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-black",
        styles,
      )}
      aria-label={`${value} ${label}`}
    >
      <Icon aria-hidden="true" className="h-3 w-3" />
      {value}
    </span>
  )
}

function EmptyOAs() {
  return (
    <div className="rounded-[14px] border-2 border-dashed border-border bg-card/40 p-8 text-center">
      <Target
        aria-hidden="true"
        className="mx-auto h-10 w-10 text-muted-foreground/60"
      />
      <h3 className="mt-3 text-[14px] font-extrabold text-foreground">
        Esta unidad aún no tiene OAs definidos.
      </h3>
      <p className="mx-auto mt-1 max-w-md text-[12.5px] leading-5 text-muted-foreground">
        Configura los Objetivos de Aprendizaje de la unidad en el currículum
        para ver su cobertura.
      </p>
    </div>
  )
}

// ─── Helpers ────────────────────────────────────────────────────────────────

interface EstadoStyle {
  label: string
  badge: string
  icon: typeof CheckCircle2
}

function getEstadoStyles(estado: EstadoCobertura): EstadoStyle {
  switch (estado) {
    case "cubierto":
      return {
        label: "Cubierto",
        badge:
          "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
        icon: CheckCircle2,
      }
    case "parcial":
      return {
        label: "Parcial",
        badge:
          "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
        icon: MinusCircle,
      }
    case "no-cubierto":
    default:
      return {
        label: "No cubierto",
        badge:
          "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300",
        icon: Circle,
      }
  }
}

function formatPct(value: number): string {
  // El cómputo ya viene redondeado a 1 decimal desde porcentajeCobertura.
  // Si es entero, mostrar sin decimal; si tiene fracción, mostrar 1 decimal.
  if (!Number.isFinite(value)) return "0"
  return Number.isInteger(value) ? String(value) : value.toFixed(1)
}

function lineClamp(lines: number): React.CSSProperties {
  return {
    display: "-webkit-box",
    WebkitLineClamp: lines,
    WebkitBoxOrient: "vertical" as const,
    overflow: "hidden",
  }
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-")
}

function idxOf<T>(arr: T[], item: T): number {
  return arr.indexOf(item)
}
