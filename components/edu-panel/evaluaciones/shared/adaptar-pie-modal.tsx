"use client"

import { useState } from "react"
import {
  AlertCircle, CheckCircle2, Heart, Loader2, Sparkles, X,
} from "lucide-react"
import { cn } from "@/lib/utils"
import type { Estudiante } from "@/lib/estudiantes"

// ─── Diagnósticos PIE comunes en Chile ────────────────────────────────────
const DIAGNOSTICOS_PIE = [
  { key: "TEL", label: "TEL – Trastorno Específico del Lenguaje", color: "bg-blue-500/10 text-blue-600 border-blue-500/20" },
  { key: "TDAH", label: "TDAH – Déficit Atencional / Hiperactividad", color: "bg-amber-500/10 text-amber-600 border-amber-500/20" },
  { key: "TEA", label: "TEA – Trastorno del Espectro Autista", color: "bg-violet-500/10 text-violet-600 border-violet-500/20" },
  { key: "DEA", label: "DEA – Dificultad Específica de Aprendizaje", color: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" },
  { key: "DI", label: "DI – Discapacidad Intelectual", color: "bg-rose-500/10 text-rose-600 border-rose-500/20" },
  { key: "FIL", label: "FIL – Func. Intelectual Limítrofe", color: "bg-orange-500/10 text-orange-600 border-orange-500/20" },
  { key: "OTRO", label: "Otro diagnóstico", color: "bg-slate-500/10 text-slate-600 border-slate-500/20" },
]

interface AdaptarPieModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  tipo: "prueba" | "guia"
  documento: any // PruebaTemplate | GuiaTemplate
  estudiantesPie: Estudiante[]
  onAdaptado: (resultado: {
    nombre: string
    instruccionesGenerales: string[]
    secciones: any[]
    notasAdecuacion: string
  }) => void
}

export function AdaptarPieModal({
  open,
  onOpenChange,
  tipo,
  documento,
  estudiantesPie,
  onAdaptado,
}: AdaptarPieModalProps) {
  const [selectedEstudiante, setSelectedEstudiante] = useState<Estudiante | null>(
    estudiantesPie.length === 1 ? estudiantesPie[0] : null
  )
  const [diagnosticoManual, setDiagnosticoManual] = useState("")
  const [notasExtra, setNotasExtra] = useState("")
  const [isProcessing, setIsProcessing] = useState(false)
  const [error, setError] = useState("")
  const [resultado, setResultado] = useState<any>(null)

  const diagnosticoActual = selectedEstudiante?.pieDiagnostico || diagnosticoManual
  const diagInfo = DIAGNOSTICOS_PIE.find(d => diagnosticoActual?.toUpperCase().includes(d.key))

  const handleAdaptar = async () => {
    setError("")
    setIsProcessing(true)
    try {
      const res = await fetch("/api/adaptar-pie", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tipo,
          documento,
          diagnostico: diagnosticoActual,
          notasPie: [
            selectedEstudiante?.pieNotas || "",
            notasExtra
          ].filter(Boolean).join(". "),
          especialista: selectedEstudiante?.pieEspecialista || "",
        }),
      })

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.error || "Error al procesar la adecuación con IA.")
      }

      const data = await res.json()
      setResultado(data)
    } catch (err: any) {
      setError(err.message || "Error al procesar la adecuación.")
    } finally {
      setIsProcessing(false)
    }
  }

  const handleAplicar = () => {
    if (!resultado) return
    onAdaptado(resultado)
    onOpenChange(false)
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[700] flex items-center justify-center bg-black/60 backdrop-blur-sm p-3 sm:p-4 print:hidden animate-fade-in">
      <div className="flex w-full max-w-2xl max-h-[90vh] flex-col overflow-hidden rounded-[24px] border border-white/10 bg-card/95 shadow-2xl backdrop-blur-md">

        {/* ── Header ────────────────────────────────────────── */}
        <div className="flex items-start justify-between gap-4 border-b border-border/60 px-6 py-5">
          <div className="min-w-0">
            <div className="mb-1 flex items-center gap-2.5">
              <div className="grid h-10 w-10 place-items-center rounded-xl bg-teal-500/10 text-teal-500 ring-1 ring-teal-500/20 shadow-[0_0_15px_rgba(20,184,166,0.15)]">
                <Heart className="h-5 w-5" />
              </div>
              <h2 className="text-[18px] font-extrabold bg-gradient-to-br from-teal-500 to-emerald-500 bg-clip-text text-transparent">
                Adecuación Curricular PIE
              </h2>
            </div>
            <p className="text-[13px] leading-relaxed text-muted-foreground mt-2">
              Genera una versión adaptada de esta {tipo === "prueba" ? "prueba" : "guía"} según las directrices DUA y el Decreto 170 para alumnos con NEE.
            </p>
          </div>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            disabled={isProcessing}
            className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-full bg-muted/60 text-muted-foreground hover:bg-muted transition-colors disabled:opacity-50 mt-1"
            title="Cerrar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* ── Body ──────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">

          {error && (
            <div className="flex items-start gap-2.5 rounded-[12px] border border-red-500/20 bg-red-500/5 px-4 py-3 text-[13px] text-red-500 font-medium">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {!resultado ? (
            <>
              {/* Selector de alumno PIE */}
              {estudiantesPie.length > 0 && (
                <div>
                  <label className="text-[12px] font-bold text-muted-foreground block mb-2">
                    Alumno PIE del curso
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {estudiantesPie.map(est => {
                      const isSelected = selectedEstudiante?.id === est.id
                      const diag = DIAGNOSTICOS_PIE.find(d => est.pieDiagnostico?.toUpperCase().includes(d.key))
                      return (
                        <button
                          key={est.id}
                          type="button"
                          onClick={() => {
                            setSelectedEstudiante(isSelected ? null : est)
                            if (!isSelected && est.pieDiagnostico) setDiagnosticoManual("")
                          }}
                          className={cn(
                            "flex items-center gap-2 rounded-[12px] border px-3 py-2.5 text-[13px] font-semibold transition-all",
                            isSelected
                              ? "border-teal-500 bg-teal-500/10 text-teal-600 ring-2 ring-teal-500/20"
                              : "border-border bg-card hover:bg-muted/50 text-foreground"
                          )}
                        >
                          <Heart className="h-3.5 w-3.5" />
                          <span>{est.nombre}</span>
                          {est.pieDiagnostico && (
                            <span className={cn("rounded-full px-1.5 py-0.5 text-[10px] font-bold border", diag?.color || "bg-slate-100 text-slate-500")}>
                              {est.pieDiagnostico}
                            </span>
                          )}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Diagnóstico manual (si no hay alumno seleccionado o el alumno no tiene diagnóstico) */}
              {(!selectedEstudiante || !selectedEstudiante.pieDiagnostico) && (
                <div>
                  <label className="text-[12px] font-bold text-muted-foreground block mb-2">
                    Diagnóstico PIE
                  </label>
                  <div className="flex flex-wrap gap-2 mb-3">
                    {DIAGNOSTICOS_PIE.map(d => (
                      <button
                        key={d.key}
                        type="button"
                        onClick={() => setDiagnosticoManual(d.key)}
                        className={cn(
                          "rounded-[10px] border px-3 py-2 text-[12px] font-semibold transition-all",
                          diagnosticoManual === d.key
                            ? cn(d.color, "ring-2 ring-offset-1")
                            : "border-border bg-card hover:bg-muted/50 text-muted-foreground"
                        )}
                      >
                        {d.key}
                      </button>
                    ))}
                  </div>
                  {diagnosticoManual && (
                    <p className="text-[12px] text-muted-foreground italic">
                      {DIAGNOSTICOS_PIE.find(d => d.key === diagnosticoManual)?.label}
                    </p>
                  )}
                </div>
              )}

              {/* Datos del alumno seleccionado */}
              {selectedEstudiante && (selectedEstudiante.pieNotas || selectedEstudiante.pieEspecialista) && (
                <div className="rounded-[14px] border border-teal-500/15 bg-teal-500/5 p-4 space-y-2">
                  <h4 className="text-[12px] font-bold text-teal-600">Ficha PIE del alumno</h4>
                  {selectedEstudiante.pieDiagnostico && (
                    <p className="text-[13px]">
                      <span className="font-semibold text-muted-foreground">Diagnóstico:</span>{" "}
                      <span className="font-medium">{selectedEstudiante.pieDiagnostico}</span>
                    </p>
                  )}
                  {selectedEstudiante.pieEspecialista && (
                    <p className="text-[13px]">
                      <span className="font-semibold text-muted-foreground">Especialista:</span>{" "}
                      <span className="font-medium">{selectedEstudiante.pieEspecialista}</span>
                    </p>
                  )}
                  {selectedEstudiante.pieNotas && (
                    <p className="text-[13px]">
                      <span className="font-semibold text-muted-foreground">Notas:</span>{" "}
                      <span className="font-medium">{selectedEstudiante.pieNotas}</span>
                    </p>
                  )}
                </div>
              )}

              {/* Notas adicionales */}
              <div>
                <label className="text-[12px] font-bold text-muted-foreground block mb-2">
                  Instrucciones adicionales para la IA (opcional)
                </label>
                <textarea
                  value={notasExtra}
                  onChange={(e) => setNotasExtra(e.target.value)}
                  rows={3}
                  placeholder="Ej: El alumno tiene dificultad con la lectura de textos largos. Prefiere actividades con apoyo gráfico..."
                  className="w-full rounded-[12px] border border-border bg-background px-4 py-3 text-[13px] outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/10 placeholder:text-muted-foreground/50 resize-none"
                />
              </div>
            </>
          ) : (
            /* ── Vista previa del resultado ───────────────── */
            <div className="space-y-4">
              <div className="flex items-center gap-2.5 mb-2">
                <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                <h3 className="text-[16px] font-bold text-foreground">Adecuación generada</h3>
              </div>

              <div className="rounded-[14px] border border-emerald-500/15 bg-emerald-500/5 p-4">
                <h4 className="text-[13px] font-bold text-emerald-600 mb-2">📋 {resultado.nombre}</h4>
                <p className="text-[12px] text-muted-foreground leading-relaxed">
                  {resultado.notasAdecuacion}
                </p>
              </div>

              <div className="rounded-[14px] border border-border bg-muted/30 p-4">
                <h4 className="text-[12px] font-bold text-muted-foreground mb-2">Instrucciones Generales Adaptadas</h4>
                <ul className="space-y-1">
                  {(resultado.instruccionesGenerales || []).map((inst: string, i: number) => (
                    <li key={i} className="text-[13px] flex items-start gap-2">
                      <span className="text-teal-500 font-bold mt-0.5">•</span>
                      <span>{inst}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="rounded-[14px] border border-border bg-muted/30 p-4">
                <h4 className="text-[12px] font-bold text-muted-foreground mb-2">Resumen de secciones</h4>
                <div className="space-y-2">
                  {(resultado.secciones || []).map((sec: any, i: number) => (
                    <div key={sec.id || i} className="flex items-center justify-between rounded-[10px] bg-card px-3 py-2 border border-border">
                      <span className="text-[13px] font-semibold">{sec.titulo}</span>
                      <span className="text-[11px] text-muted-foreground font-medium">
                        {sec.items?.length || 0} ítems
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ── Loading state ─────────────────────────────── */}
          {isProcessing && (
            <div className="flex flex-col items-center py-8">
              <div className="relative grid h-20 w-20 place-items-center mb-5">
                <div className="absolute inset-0 rounded-full bg-teal-500/10 animate-ping duration-[2000ms]"></div>
                <div className="absolute inset-2 rounded-full border-2 border-teal-500/20 border-t-teal-500 animate-spin"></div>
                <Heart className="h-7 w-7 text-teal-500" />
              </div>
              <h3 className="text-[15px] font-bold text-foreground mb-1">Generando adecuación curricular...</h3>
              <p className="text-[13px] text-muted-foreground text-center max-w-[300px]">
                La IA está adaptando {resultado ? "" : tipo === "prueba" ? "la prueba" : "la guía"} según las directrices DUA, Decreto 170 y el diagnóstico del alumno.
              </p>
            </div>
          )}
        </div>

        {/* ── Footer ───────────────────────────────────────── */}
        <div className="border-t border-border/60 bg-muted/30 px-6 py-4 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => {
              if (resultado) {
                setResultado(null)
                setError("")
              } else {
                onOpenChange(false)
              }
            }}
            disabled={isProcessing}
            className="rounded-[12px] px-5 py-2.5 text-[13px] font-bold text-muted-foreground hover:bg-muted transition-colors disabled:opacity-50"
          >
            {resultado ? "← Volver a configurar" : "Cancelar"}
          </button>

          {!resultado ? (
            <button
              type="button"
              onClick={handleAdaptar}
              disabled={isProcessing || !diagnosticoActual}
              className="flex items-center gap-2 rounded-[12px] bg-gradient-to-r from-teal-500 to-emerald-500 text-white px-6 py-2.5 text-[13px] font-bold hover:brightness-110 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_0_15px_rgba(20,184,166,0.2)]"
            >
              {isProcessing ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Adaptando...</>
              ) : (
                <><Sparkles className="h-4 w-4" /> Generar Adecuación PIE</>
              )}
            </button>
          ) : (
            <button
              type="button"
              onClick={handleAplicar}
              className="flex items-center gap-2 rounded-[12px] bg-gradient-to-r from-teal-500 to-emerald-500 text-white px-6 py-2.5 text-[13px] font-bold hover:brightness-110 transition-all shadow-[0_0_15px_rgba(20,184,166,0.2)]"
            >
              <CheckCircle2 className="h-4 w-4" />
              Crear {tipo === "prueba" ? "Prueba" : "Guía"} Adaptada
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
