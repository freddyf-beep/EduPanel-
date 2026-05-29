"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  Play, Pause, RotateCcw, X, Timer, Zap, Brain, Sparkles,
  ChevronRight, Loader2, Coffee, MessageCircle, Volume2,
  Maximize2, Minimize2, CheckCircle2, AlertCircle,
} from "lucide-react"
import { cn } from "@/lib/utils"
import type { ActividadClase } from "@/lib/curriculo"

// ─── Configuración de momentos de la clase ─────────────────────────────
interface MomentoClase {
  key: "inicio" | "desarrollo" | "cierre"
  label: string
  emoji: string
  duracion: number  // minutos
  color: string     // tailwind gradient
  icon: typeof Play
  description: string
}

const DEFAULT_MOMENTOS: MomentoClase[] = [
  {
    key: "inicio", label: "Inicio", emoji: "🚀",
    duracion: 15, color: "from-amber-500 to-orange-500",
    icon: Coffee, description: "Motivación, activación de conocimientos previos",
  },
  {
    key: "desarrollo", label: "Desarrollo", emoji: "📚",
    duracion: 60, color: "from-blue-500 to-indigo-500",
    icon: Zap, description: "Trabajo con el contenido central de la clase",
  },
  {
    key: "cierre", label: "Cierre", emoji: "🎯",
    duracion: 15, color: "from-emerald-500 to-teal-500",
    icon: Brain, description: "Síntesis, metacognición y evaluación formativa",
  },
]

// ─── Types ─────────────────────────────────────────────────────────────
interface SugerenciaIA {
  tipo: "rompehielos" | "metacognicion" | "actividad_rapida"
  data: Record<string, any>
  loading: boolean
  error?: string
}

interface Props {
  open: boolean
  onClose: () => void
  actividad: ActividadClase | null
  asignatura: string
  curso: string
}

// ─── Helpers ───────────────────────────────────────────────────────────
function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
}

function stripHtml(html: string): string {
  if (!html) return ""
  return html.replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").trim()
}

// ═══════════════════════════════════════════════════════════════════════
// ModoClaseEnVivo — Pantalla completa de acompañamiento en el aula
// ═══════════════════════════════════════════════════════════════════════
export function ModoClaseEnVivo({ open, onClose, actividad, asignatura, curso }: Props) {
  // ─── Timer state ──────────────────────────────────────────
  const [momentoActualIdx, setMomentoActualIdx] = useState(0)
  const [tiempoRestante, setTiempoRestante] = useState(DEFAULT_MOMENTOS[0].duracion * 60)
  const [isRunning, setIsRunning] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // ─── AI suggestions state ─────────────────────────────────
  const [sugerencia, setSugerencia] = useState<SugerenciaIA | null>(null)

  const momentoActual = DEFAULT_MOMENTOS[momentoActualIdx]
  const objetivo = actividad?.objetivo || ""

  // Extract plain text from rich text fields
  const contenido = useMemo(() => ({
    inicio: stripHtml(actividad?.inicio || ""),
    desarrollo: stripHtml(actividad?.desarrollo || ""),
    cierre: stripHtml(actividad?.cierre || ""),
  }), [actividad])

  // ─── Timer logic ──────────────────────────────────────────
  useEffect(() => {
    if (!isRunning) {
      if (intervalRef.current) clearInterval(intervalRef.current)
      return
    }

    intervalRef.current = setInterval(() => {
      setTiempoRestante(prev => {
        if (prev <= 1) {
          // Auto-advance to next momento
          if (momentoActualIdx < DEFAULT_MOMENTOS.length - 1) {
            const nextIdx = momentoActualIdx + 1
            setMomentoActualIdx(nextIdx)
            return DEFAULT_MOMENTOS[nextIdx].duracion * 60
          }
          // Class ended
          setIsRunning(false)
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [isRunning, momentoActualIdx])

  // Reset timer when momento changes manually
  const cambiarMomento = useCallback((idx: number) => {
    setMomentoActualIdx(idx)
    setTiempoRestante(DEFAULT_MOMENTOS[idx].duracion * 60)
    setSugerencia(null)
  }, [])

  const resetTimer = useCallback(() => {
    setTiempoRestante(momentoActual.duracion * 60)
    setIsRunning(false)
  }, [momentoActual])

  // ─── Fullscreen logic ─────────────────────────────────────
  const toggleFullscreen = useCallback(async () => {
    if (!containerRef.current) return
    try {
      if (!document.fullscreenElement) {
        await containerRef.current.requestFullscreen()
        setIsFullscreen(true)
      } else {
        await document.exitFullscreen()
        setIsFullscreen(false)
      }
    } catch { /* fullscreen not supported */ }
  }, [])

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement)
    document.addEventListener("fullscreenchange", handler)
    return () => document.removeEventListener("fullscreenchange", handler)
  }, [])

  // ─── AI suggestion fetcher ────────────────────────────────
  const pedirSugerencia = useCallback(async (tipo: SugerenciaIA["tipo"]) => {
    setSugerencia({ tipo, data: {}, loading: true })
    try {
      const res = await fetch("/api/clase-en-vivo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tipo,
          asignatura,
          curso,
          objetivo,
          momento: momentoActual.key,
          contexto: contenido[momentoActual.key] || "",
        }),
      })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Error de IA")
      const data = await res.json()
      setSugerencia({ tipo, data, loading: false })
    } catch (err: any) {
      setSugerencia({ tipo, data: {}, loading: false, error: err.message })
    }
  }, [asignatura, curso, objetivo, momentoActual, contenido])

  // ─── Progress calculations ────────────────────────────────
  const totalMinutes = DEFAULT_MOMENTOS.reduce((acc, m) => acc + m.duracion, 0)
  const elapsedMinutes = DEFAULT_MOMENTOS.slice(0, momentoActualIdx).reduce((acc, m) => acc + m.duracion, 0)
    + (momentoActual.duracion - tiempoRestante / 60)
  const progressPercent = Math.min(100, (elapsedMinutes / totalMinutes) * 100)

  // Timer urgency
  const isUrgent = tiempoRestante < 60 && isRunning
  const isWarning = tiempoRestante < 180 && tiempoRestante >= 60 && isRunning

  if (!open) return null

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-[800] flex flex-col bg-[#0a0a0f] text-white print:hidden animate-fade-in overflow-hidden"
    >
      {/* ══ Top Bar ══════════════════════════════════════════════ */}
      <div className="flex items-center justify-between px-6 py-3 bg-white/[0.03] border-b border-white/[0.06] flex-shrink-0">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="h-2.5 w-2.5 rounded-full bg-green-400 animate-pulse" />
            <span className="text-[13px] font-bold text-white/60 tracking-wider uppercase">
              Clase en Vivo
            </span>
          </div>
          {actividad && (
            <span className="text-[13px] text-white/40 font-medium truncate max-w-[300px]">
              {asignatura} · {curso} · Clase {actividad.numeroClase}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={toggleFullscreen}
            className="grid h-8 w-8 place-items-center rounded-lg bg-white/5 hover:bg-white/10 transition-colors text-white/60 hover:text-white"
            title={isFullscreen ? "Salir de pantalla completa" : "Pantalla completa"}
          >
            {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </button>
          <button
            onClick={() => {
              setIsRunning(false)
              onClose()
            }}
            className="grid h-8 w-8 place-items-center rounded-lg bg-white/5 hover:bg-red-500/20 transition-colors text-white/60 hover:text-red-400"
            title="Cerrar modo clase"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* ══ Global Progress Bar ══════════════════════════════════ */}
      <div className="h-1 w-full bg-white/[0.04] flex-shrink-0">
        <div
          className="h-full bg-gradient-to-r from-amber-500 via-blue-500 to-emerald-500 transition-all duration-1000 ease-linear"
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      {/* ══ Main Content ════════════════════════════════════════ */}
      <div className="flex-1 flex flex-col lg:flex-row gap-0 overflow-hidden">

        {/* ── Left: Timer + Momento ─────────────────────────── */}
        <div className="flex-1 flex flex-col items-center justify-center p-6 lg:p-12 relative overflow-hidden">

          {/* Background glow effect */}
          <div className={cn(
            "absolute inset-0 opacity-10 blur-[120px] transition-colors duration-1000",
            `bg-gradient-to-br ${momentoActual.color}`
          )} />

          {/* Momento selector pills */}
          <div className="flex items-center gap-2 mb-10 z-10">
            {DEFAULT_MOMENTOS.map((m, idx) => {
              const isCurrent = idx === momentoActualIdx
              const isPast = idx < momentoActualIdx
              return (
                <button
                  key={m.key}
                  onClick={() => cambiarMomento(idx)}
                  className={cn(
                    "flex items-center gap-2 rounded-full px-4 py-2 text-[13px] font-bold transition-all",
                    isCurrent
                      ? `bg-gradient-to-r ${m.color} text-white shadow-lg shadow-white/5`
                      : isPast
                        ? "bg-white/10 text-white/60 line-through"
                        : "bg-white/[0.04] text-white/30 hover:bg-white/[0.08] hover:text-white/50"
                  )}
                >
                  <span className="text-base">{m.emoji}</span>
                  <span>{m.label}</span>
                  <span className="text-[11px] opacity-70">{m.duracion}m</span>
                </button>
              )
            })}
          </div>

          {/* Timer display */}
          <div className="relative z-10 mb-6">
            <div className={cn(
              "text-[100px] lg:text-[140px] font-black tabular-nums leading-none tracking-tighter transition-colors duration-300",
              isUrgent
                ? "text-red-400 animate-pulse"
                : isWarning
                  ? "text-amber-400"
                  : "text-white"
            )}>
              {formatTime(tiempoRestante)}
            </div>
          </div>

          {/* Timer controls */}
          <div className="flex items-center gap-4 z-10 mb-8">
            <button
              onClick={() => setIsRunning(prev => !prev)}
              className={cn(
                "flex items-center gap-2 rounded-2xl px-8 py-4 text-[15px] font-bold transition-all",
                isRunning
                  ? "bg-white/10 text-white hover:bg-white/15"
                  : `bg-gradient-to-r ${momentoActual.color} text-white hover:brightness-110 shadow-lg`
              )}
            >
              {isRunning ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
              {isRunning ? "Pausar" : "Iniciar"}
            </button>
            <button
              onClick={resetTimer}
              className="grid h-12 w-12 place-items-center rounded-2xl bg-white/[0.06] text-white/50 hover:bg-white/10 hover:text-white transition-colors"
              title="Reiniciar momento"
            >
              <RotateCcw className="h-5 w-5" />
            </button>
          </div>

          {/* Current momento info */}
          <div className="z-10 text-center max-w-lg">
            <p className="text-[14px] text-white/40 font-medium mb-3">
              {momentoActual.description}
            </p>
            {contenido[momentoActual.key] && (
              <div className="rounded-2xl bg-white/[0.04] border border-white/[0.06] px-6 py-4 max-h-[120px] overflow-y-auto">
                <p className="text-[13px] text-white/70 leading-relaxed">
                  {contenido[momentoActual.key]}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* ── Right: Clase Info + AI Tools ──────────────────── */}
        <div className="w-full lg:w-[400px] bg-white/[0.02] border-l border-white/[0.06] flex flex-col overflow-hidden flex-shrink-0">

          {/* Objetivo */}
          <div className="px-5 py-5 border-b border-white/[0.06]">
            <h3 className="text-[11px] font-bold text-white/30 uppercase tracking-wider mb-2">
              Objetivo de la Clase
            </h3>
            <p className="text-[14px] text-white/80 font-medium leading-relaxed">
              {objetivo || "Sin objetivo definido"}
            </p>
          </div>

          {/* AI Quick Actions */}
          <div className="px-5 py-4 border-b border-white/[0.06]">
            <h3 className="text-[11px] font-bold text-white/30 uppercase tracking-wider mb-3">
              Asistente IA ✨
            </h3>
            <div className="space-y-2">
              <AIQuickButton
                icon={Coffee}
                label="Actividad rompehielos"
                sublabel="Warm-up de 3-5 min"
                onClick={() => pedirSugerencia("rompehielos")}
                color="from-amber-500/20 to-orange-500/20 hover:from-amber-500/30 hover:to-orange-500/30"
                borderColor="border-amber-500/20"
                loading={sugerencia?.tipo === "rompehielos" && sugerencia.loading}
              />
              <AIQuickButton
                icon={Zap}
                label="Actividad rápida"
                sublabel={`Para el ${momentoActual.label.toLowerCase()}`}
                onClick={() => pedirSugerencia("actividad_rapida")}
                color="from-blue-500/20 to-indigo-500/20 hover:from-blue-500/30 hover:to-indigo-500/30"
                borderColor="border-blue-500/20"
                loading={sugerencia?.tipo === "actividad_rapida" && sugerencia.loading}
              />
              <AIQuickButton
                icon={Brain}
                label="Pregunta de metacognición"
                sublabel="Reflexión de cierre"
                onClick={() => pedirSugerencia("metacognicion")}
                color="from-emerald-500/20 to-teal-500/20 hover:from-emerald-500/30 hover:to-teal-500/30"
                borderColor="border-emerald-500/20"
                loading={sugerencia?.tipo === "metacognicion" && sugerencia.loading}
              />
            </div>
          </div>

          {/* AI Result */}
          <div className="flex-1 overflow-y-auto px-5 py-4">
            {sugerencia && !sugerencia.loading && !sugerencia.error && (
              <AIResultCard tipo={sugerencia.tipo} data={sugerencia.data} />
            )}
            {sugerencia?.loading && (
              <div className="flex flex-col items-center py-10">
                <Loader2 className="h-8 w-8 text-white/40 animate-spin mb-3" />
                <p className="text-[13px] text-white/40 font-medium">Generando sugerencia...</p>
              </div>
            )}
            {sugerencia?.error && (
              <div className="flex items-start gap-2.5 rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-3">
                <AlertCircle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
                <p className="text-[13px] text-red-400">{sugerencia.error}</p>
              </div>
            )}
            {!sugerencia && (
              <div className="flex flex-col items-center py-10 text-center">
                <Sparkles className="h-8 w-8 text-white/15 mb-3" />
                <p className="text-[13px] text-white/25 font-medium">
                  Usa los botones de arriba para obtener sugerencias de IA en tiempo real.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════
// Sub-components
// ═══════════════════════════════════════════════════════════════════════

function AIQuickButton({
  icon: Icon, label, sublabel, onClick, color, borderColor, loading,
}: {
  icon: typeof Play
  label: string
  sublabel: string
  onClick: () => void
  color: string
  borderColor: string
  loading?: boolean
}) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className={cn(
        "w-full flex items-center gap-3 rounded-xl border px-4 py-3 text-left transition-all",
        `bg-gradient-to-r ${color} ${borderColor}`,
        "disabled:opacity-60 disabled:cursor-not-allowed"
      )}
    >
      {loading
        ? <Loader2 className="h-4 w-4 text-white/60 animate-spin shrink-0" />
        : <Icon className="h-4 w-4 text-white/60 shrink-0" />
      }
      <div className="min-w-0">
        <p className="text-[13px] font-bold text-white/80">{label}</p>
        <p className="text-[11px] text-white/40">{sublabel}</p>
      </div>
      <ChevronRight className="h-3.5 w-3.5 text-white/20 ml-auto shrink-0" />
    </button>
  )
}

function AIResultCard({ tipo, data }: { tipo: SugerenciaIA["tipo"]; data: Record<string, any> }) {
  const titles: Record<string, string> = {
    rompehielos: "🎲 Rompehielos",
    metacognicion: "🧠 Metacognición",
    actividad_rapida: "⚡ Actividad Rápida",
  }

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center gap-2">
        <CheckCircle2 className="h-4 w-4 text-emerald-400" />
        <h4 className="text-[14px] font-bold text-white/80">{titles[tipo] || "Sugerencia IA"}</h4>
      </div>

      {/* Rompehielos / Actividad rápida */}
      {(tipo === "rompehielos" || tipo === "actividad_rapida") && (
        <div className="space-y-3">
          {data.nombre && (
            <div className="rounded-xl bg-white/[0.05] border border-white/[0.08] px-4 py-3">
              <h5 className="text-[15px] font-extrabold text-white/90 mb-1">{data.nombre}</h5>
              {data.duracion && (
                <span className="inline-flex items-center gap-1 text-[11px] text-white/40 font-bold">
                  <Timer className="h-3 w-3" /> {data.duracion}
                  {data.modalidad && <> · {data.modalidad}</>}
                </span>
              )}
            </div>
          )}
          {data.instrucciones && (
            <div className="rounded-xl bg-white/[0.03] px-4 py-3">
              <p className="text-[13px] text-white/70 leading-relaxed">{data.instrucciones}</p>
            </div>
          )}
          {data.tip && (
            <div className="flex items-start gap-2 rounded-xl bg-amber-500/10 border border-amber-500/15 px-4 py-3">
              <Sparkles className="h-3.5 w-3.5 text-amber-400 shrink-0 mt-0.5" />
              <p className="text-[12px] text-amber-300/80">{data.tip}</p>
            </div>
          )}
        </div>
      )}

      {/* Metacognición */}
      {tipo === "metacognicion" && (
        <div className="space-y-3">
          {data.pregunta && (
            <div className="rounded-xl bg-white/[0.05] border border-white/[0.08] px-5 py-4">
              <p className="text-[16px] font-bold text-white/90 leading-relaxed italic">
                "{data.pregunta}"
              </p>
            </div>
          )}
          {Array.isArray(data.variantes) && data.variantes.length > 0 && (
            <div className="rounded-xl bg-white/[0.03] px-4 py-3">
              <p className="text-[11px] font-bold text-white/30 uppercase tracking-wider mb-2">Variantes</p>
              <ul className="space-y-1.5">
                {data.variantes.map((v: string, i: number) => (
                  <li key={i} className="text-[13px] text-white/60 flex items-start gap-2">
                    <MessageCircle className="h-3.5 w-3.5 text-white/20 shrink-0 mt-0.5" />
                    <span>{v}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {data.estrategia && (
            <div className="flex items-start gap-2 rounded-xl bg-emerald-500/10 border border-emerald-500/15 px-4 py-3">
              <Volume2 className="h-3.5 w-3.5 text-emerald-400 shrink-0 mt-0.5" />
              <p className="text-[12px] text-emerald-300/80">{data.estrategia}</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
