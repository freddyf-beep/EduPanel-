"use client"

import { useEffect, useState } from "react"
import { Download, Loader2, X, FileText, Table2 } from "lucide-react"
import { cn } from "@/lib/utils"

export type FormatoDescarga = "detallado" | "tabla"
export type SemestreDescarga = 1 | 2 | "ambos"

interface Props {
  open: boolean
  downloading: boolean
  onClose: () => void
  tieneEncabezado?: boolean
  onDescargar: (formato: FormatoDescarga, semestre: SemestreDescarga, usarEncabezado: boolean) => void
}

// ─── Mockup visual: Formato Detallado ───────────────────────────────────────
function MockupDetallado() {
  return (
    <div className="rounded-[6px] border border-border bg-white p-3 text-[8px] leading-relaxed text-foreground select-none overflow-hidden">
      <div className="font-extrabold text-[11px] mb-1">Planificaciones 4° Básico</div>
      <div className="font-bold text-[9px] mt-2 text-muted-foreground border-t border-border/60 pt-1.5">
        Unidad 1 — Ritmo y Sonido
      </div>
      <div className="text-muted-foreground mt-1">Objetivos basales:</div>
      <div className="pl-2 text-[7.5px]">• OA 01: Identificar elementos...</div>
      <div className="font-bold text-[9px] mt-2 border-t border-border/60 pt-1.5">Clase 01</div>
      <div className="text-muted-foreground text-[7.5px]">Objetivo: Reconocer patrones rítmicos</div>
      <div className="text-muted-foreground text-[7.5px]">Inicio: Activar conocimientos previos...</div>
      <div className="text-muted-foreground text-[7.5px]">Desarrollo: Escucha activa con...</div>
      <div className="text-muted-foreground text-[7.5px]">Cierre: Reflexión grupal sobre...</div>
      <div className="font-bold text-[9px] mt-2 border-t border-border/60 pt-1.5 text-muted-foreground/60">
        Clase 02  ·  Clase 03  ·  ...
      </div>
    </div>
  )
}

// ─── Mockup visual: Formato Tabla ────────────────────────────────────────────
function MockupTabla() {
  return (
    <div className="rounded-[6px] border border-border bg-white p-3 select-none overflow-hidden">
      <div className="font-extrabold text-[9px] text-center mb-2 uppercase tracking-tight">
        PLANIFICACIÓN SEMESTRAL 2026
      </div>
      {/* Tabla info */}
      <div className="text-[7.5px] border border-border/60 rounded overflow-hidden mb-1.5">
        {[
          ["Nombre Unidad 1", "Ritmo y Sonido"],
          ["Fecha inicio y término", "03/03 – 15/04"],
          ["Propósito", "Conocer elementos del sonido..."],
        ].map(([k, v]) => (
          <div key={k} className="flex">
            <div className="w-[38%] bg-[#deebf6] px-1.5 py-0.5 font-bold border-b border-r border-border/60">
              {k}
            </div>
            <div className="flex-1 px-1.5 py-0.5 border-b border-border/60 text-muted-foreground">
              {v}
            </div>
          </div>
        ))}
      </div>
      {/* Tabla OAs */}
      <div className="text-[7.5px] border border-border/60 rounded overflow-hidden">
        <div className="flex">
          {["Objetivos", "Indicadores", "Estrategia"].map(h => (
            <div key={h} className="flex-1 bg-[#deebf6] px-1 py-0.5 font-bold border-b border-r last:border-r-0 border-border/60">
              {h}
            </div>
          ))}
        </div>
        <div className="flex">
          <div className="flex-1 px-1 py-0.5 border-r border-border/60 text-muted-foreground">OA 01: Identificar...</div>
          <div className="flex-1 px-1 py-0.5 border-r border-border/60 text-muted-foreground">• Reconoce patrones...</div>
          <div className="flex-1 px-1 py-0.5 text-muted-foreground/40 italic">campo libre</div>
        </div>
      </div>
    </div>
  )
}

// ─── Selector de semestre ────────────────────────────────────────────────────
const SEMESTRES: { value: SemestreDescarga; label: string }[] = [
  { value: 1,       label: "Semestre 1" },
  { value: 2,       label: "Semestre 2" },
  { value: "ambos", label: "Anual completo" },
]

// ─── Componente principal ────────────────────────────────────────────────────
export function FormatoDescargaModal({ open, downloading, onClose, tieneEncabezado, onDescargar }: Props) {
  const [semestre, setSemestre] = useState<SemestreDescarga>("ambos")
  const [usarEncabezado, setUsarEncabezado] = useState(() => tieneEncabezado ?? false)

  useEffect(() => {
    if (open) setUsarEncabezado(tieneEncabezado ?? false)
  }, [open, tieneEncabezado])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Overlay */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={!downloading ? onClose : undefined}
      />

      {/* Modal */}
      <div className="relative w-full max-w-2xl rounded-[16px] border border-border bg-card shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div>
            <h2 className="text-[16px] font-extrabold">Elige el formato de descarga</h2>
            <p className="text-[12px] text-muted-foreground mt-0.5">
              Cada colegio usa su propio formato — elige el que corresponde al tuyo
            </p>
          </div>
          {!downloading && (
            <button
              onClick={onClose}
              className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground hover:bg-muted/60 hover:text-foreground transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Body */}
        <div className="p-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

            {/* ── Tarjeta: Formato Detallado ── */}
            <div className="flex flex-col rounded-[12px] border-2 border-border bg-background p-4 gap-3">
              <div className="flex items-center gap-2">
                <div className="grid h-8 w-8 place-items-center rounded-lg bg-primary/10">
                  <FileText className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <p className="text-[13px] font-extrabold">Formato Detallado</p>
                  <p className="text-[11px] text-muted-foreground">Clase a clase</p>
                </div>
              </div>

              <MockupDetallado />

              <p className="text-[11px] text-muted-foreground leading-relaxed">
                Incluye cada clase con sus secciones de Inicio, Desarrollo y Cierre, OAs e indicadores. Ideal para portafolio docente.
              </p>

              <button
                onClick={() => onDescargar("detallado", "ambos", false)}
                disabled={downloading}
                className="mt-auto flex items-center justify-center gap-2 rounded-[10px] bg-primary px-4 py-2.5 text-[13px] font-bold text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {downloading ? (
                  <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Generando…</>
                ) : (
                  <><Download className="h-3.5 w-3.5" /> Descargar</>
                )}
              </button>
            </div>

            {/* ── Tarjeta: Formato Tabla ── */}
            <div className="flex flex-col rounded-[12px] border-2 border-border bg-background p-4 gap-3">
              <div className="flex items-center gap-2">
                <div className="grid h-8 w-8 place-items-center rounded-lg bg-blue-100 dark:bg-blue-900/30">
                  <Table2 className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <p className="text-[13px] font-extrabold">Formato por Tabla</p>
                  <p className="text-[11px] text-muted-foreground">Resumen por unidad</p>
                </div>
              </div>

              <MockupTabla />

              <p className="text-[11px] text-muted-foreground leading-relaxed">
                Una tabla por unidad con OAs, indicadores y espacio para estrategia de evaluación. Formato estándar de muchos colegios.
              </p>

              {/* Selector de semestre */}
              <div>
                <p className="text-[11px] font-bold text-muted-foreground mb-1.5">Período a exportar:</p>
                <div className="flex gap-1.5">
                  {SEMESTRES.map(s => (
                    <button
                      key={String(s.value)}
                      onClick={() => setSemestre(s.value)}
                      className={cn(
                        "flex-1 rounded-lg border px-2 py-1.5 text-[11px] font-bold transition-colors",
                        semestre === s.value
                          ? "border-blue-500 bg-blue-50 text-blue-700 dark:border-blue-400 dark:bg-blue-900/30 dark:text-blue-300"
                          : "border-border bg-card text-muted-foreground hover:bg-muted/60"
                      )}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Toggle encabezado del colegio */}
              {tieneEncabezado && (
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <div
                    role="checkbox"
                    aria-checked={usarEncabezado}
                    tabIndex={0}
                    onClick={() => setUsarEncabezado(v => !v)}
                    onKeyDown={e => { if (e.key === " " || e.key === "Enter") setUsarEncabezado(v => !v) }}
                    className={cn(
                      "h-4 w-4 flex-shrink-0 rounded border-[1.5px] transition-colors cursor-pointer",
                      usarEncabezado
                        ? "border-blue-500 bg-blue-500"
                        : "border-border bg-card"
                    )}
                  >
                    {usarEncabezado && (
                      <svg viewBox="0 0 10 10" className="w-full h-full text-white fill-none stroke-white stroke-[1.5]">
                        <polyline points="2,5 4,7.5 8,2.5" />
                      </svg>
                    )}
                  </div>
                  <span className="text-[11px] text-muted-foreground leading-snug">
                    Incluir encabezado del colegio
                  </span>
                </label>
              )}

              <button
                onClick={() => onDescargar("tabla", semestre, usarEncabezado)}
                disabled={downloading}
                className="mt-auto flex items-center justify-center gap-2 rounded-[10px] border-2 border-blue-500 bg-blue-50 px-4 py-2.5 text-[13px] font-bold text-blue-700 hover:bg-blue-100 dark:border-blue-400 dark:bg-blue-900/30 dark:text-blue-300 dark:hover:bg-blue-900/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {downloading ? (
                  <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Generando…</>
                ) : (
                  <><Download className="h-3.5 w-3.5" /> Descargar</>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
