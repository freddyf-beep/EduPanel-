"use client"

import { useEffect, useMemo, useState, useRef, useCallback } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import {
  BookOpen, Bookmark, Check, ClipboardList, Loader2, MessageSquare, ShieldCheck, UserRound,
  Wand2, Calendar, AlertTriangle, ArrowRight, ArrowLeft, Zap, Target, Sparkles, Copy, History,
  Clock, ChevronLeft, ChevronRight, X, ListChecks, Bell, Repeat, Flame,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { cargarHorarioSemanal, ClaseHorario } from "@/lib/horario"
import { Estudiante, cargarEstudiantes } from "@/lib/estudiantes"
import {
  cargarLibroClases, guardarLibroClases, cargarCronograma,
  cargarVerUnidadesCurso, obtenerOAsActivosDelDia,
} from "@/lib/curriculo"
import type { BloqueLibroClase, EstadoAsistencia } from "@/lib/curriculo"
import { useActiveSubject } from "@/hooks/use-active-subject"
import { buildUrl, normalizeKeyPart, withAsignatura } from "@/lib/shared"
import {
  contarObservacionesPorEstudiante, type ResumenObservacionesEstudiante,
} from "@/lib/observaciones"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { Badge } from "@/components/ui/badge"

type TabKey = "hoy" | "historial" | "alertas"
const TABS: { key: TabKey; label: string; icon: typeof Calendar }[] = [
  { key: "hoy",       label: "Hoy",        icon: Clock },
  { key: "historial", label: "Historial",  icon: History },
  { key: "alertas",   label: "Alertas",    icon: Bell },
]

const ESTADOS: { key: EstadoAsistencia; label: string; long: string; cls: string; ringCls: string; tecla: string }[] = [
  { key: "presente", label: "P", long: "Presente",  cls: "bg-status-green-bg text-status-green-text",  ringCls: "ring-emerald-300",   tecla: "1" },
  { key: "ausente",  label: "A", long: "Ausente",   cls: "bg-status-red-bg text-status-red-text",      ringCls: "ring-rose-300",      tecla: "2" },
  { key: "atraso",   label: "T", long: "Tardanza",  cls: "bg-status-amber-bg text-status-amber-text",  ringCls: "ring-amber-300",     tecla: "3" },
  { key: "retirado", label: "R", long: "Retiro",    cls: "bg-status-slate-bg text-status-slate-text",  ringCls: "ring-slate-300",     tecla: "4" },
]

function toDateInput(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
}

function weekNumber(d: Date): number {
  const onejan = new Date(d.getFullYear(), 0, 1)
  return Math.ceil((((d.getTime() - onejan.getTime()) / 86400000) + onejan.getDay() + 1) / 7)
}

function minutesFromHHMM(value: string) {
  const [h, m] = value.split(":").map(Number)
  return h * 60 + m
}

function diaNombre(fecha: string) {
  return new Date(`${fecha}T12:00:00`).toLocaleDateString("es-CL", { weekday: "long" })
    .replace(/^./, (m) => m.toUpperCase())
}

function fechaCorta(fecha: string) {
  return new Date(`${fecha}T12:00:00`).toLocaleDateString("es-CL", { day: "numeric", month: "short" })
}

function buildBloques(curso: string, fecha: string, horarioBase: ClaseHorario[], estudiantes: Estudiante[]): BloqueLibroClase[] {
  const dia = diaNombre(fecha)
  const bloquesHorario = horarioBase.filter((b) => b.resumen === curso && b.dia === dia)

  return (bloquesHorario.length ? bloquesHorario : [{
    uid: `${curso}-${fecha}-1`, horaInicio: "08:30", horaFin: "09:15",
    resumen: curso, dia, color: "var(--primary)", tipo: "clase" as const,
  }]).map((bloque, index) => ({
    id: bloque.uid || `${curso}-${fecha}-${index+1}`,
    bloque: `Bloque ${index + 1}`,
    horaInicio: bloque.horaInicio,
    horaFin: bloque.horaFin,
    objetivo: "",
    actividad: "",
    firmado: false,
    asistencia: estudiantes.map((est) => ({
      id: est.id,
      nombre: est.nombre,
      estado: "presente" as EstadoAsistencia,
    })),
  }))
}

function fechaPrevSemana(fecha: string): string {
  const d = new Date(`${fecha}T12:00:00`)
  d.setDate(d.getDate() - 7)
  return toDateInput(d)
}

function fechaPrevDia(fecha: string): string {
  const d = new Date(`${fecha}T12:00:00`)
  d.setDate(d.getDate() - 1)
  return toDateInput(d)
}

interface OASugerido { id: string; numero?: number; descripcion: string; unidadId?: string }

export function LibroClasesV2Shell() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const tabParam = (searchParams.get("tab") as TabKey | null)
  const [activeTab, setActiveTab] = useState<TabKey>(tabParam ?? "hoy")
  const { asignatura: ASIGNATURA } = useActiveSubject()

  const [curso, setCurso] = useState("")
  const [cursosDisponibles, setCursosDisponibles] = useState<string[]>([])
  const [fecha, setFecha] = useState(toDateInput(new Date()))
  const [bloques, setBloques] = useState<BloqueLibroClase[]>([])
  const [estudiantesCurso, setEstudiantesCurso] = useState<Estudiante[]>([])
  const [loading, setLoading] = useState(true)
  const [saveStatus, setSaveStatus] = useState<"idle"|"saving_silent"|"saved"|"error">("idle")
  const [observacionesResumen, setObservacionesResumen] = useState<Record<string, ResumenObservacionesEstudiante>>({})
  const [oaSugeridosPorBloque, setOaSugeridosPorBloque] = useState<Record<string, OASugerido[]>>({})
  const [oaGlobalSugeridos, setOaGlobalSugeridos] = useState<OASugerido[]>([])
  const [expressMode, setExpressMode] = useState(false)
  const [expressBloqueId, setExpressBloqueId] = useState<string | null>(null)
  const [expressIndex, setExpressIndex] = useState(0)

  const ignoreNextSaveRef = useRef(true)

  useEffect(() => { setActiveTab(tabParam ?? "hoy") }, [tabParam])

  const goToTab = (key: TabKey) => {
    const params = new URLSearchParams(Array.from(searchParams.entries()))
    params.set("tab", key)
    router.replace(`/libro-clases?${params.toString()}`, { scroll: false })
    setActiveTab(key)
  }

  // Carga cursos
  useEffect(() => {
    cargarHorarioSemanal().then(hData => {
      const unique = Array.from(new Set(hData.map(h => h.resumen)))
      setCursosDisponibles(unique)
      if (unique.length > 0) setCurso(unique[0])
    })
  }, [])

  // Carga del libro del día
  useEffect(() => {
    if (!curso) return
    setLoading(true)
    Promise.all([
      cargarLibroClases(ASIGNATURA, curso, fecha),
      cargarHorarioSemanal(),
      cargarEstudiantes(curso),
      obtenerOAsActivosDelDia(ASIGNATURA, curso, fecha),
    ])
      .then(([data, hData, est, oas]) => {
        setEstudiantesCurso(est)
        setBloques(data?.bloques || buildBloques(curso, fecha, hData || [], est))
        setOaGlobalSugeridos(oas.slice(0, 6).map(oa => ({
          id: oa.id, numero: oa.numero, descripcion: oa.descripcion, unidadId: oa.unidadId,
        })))
      })
      .finally(() => {
        setLoading(false)
        ignoreNextSaveRef.current = true
      })
  }, [curso, fecha, ASIGNATURA])

  // Observaciones
  useEffect(() => {
    if (!curso) { setObservacionesResumen({}); return }
    contarObservacionesPorEstudiante(ASIGNATURA, curso)
      .then(setObservacionesResumen)
      .catch(() => setObservacionesResumen({}))
  }, [curso, ASIGNATURA])

  // Autosave
  useEffect(() => {
    if (loading) return
    if (ignoreNextSaveRef.current) { ignoreNextSaveRef.current = false; return }
    setSaveStatus("saving_silent")
    const timer = setTimeout(() => { handleGuardar(true) }, 2500)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bloques])

  const pieMap = useMemo(() => {
    const m = new Map<string, Estudiante>()
    estudiantesCurso.forEach(e => m.set(e.id, e))
    return m
  }, [estudiantesCurso])

  const resumen = useMemo(() => {
    let presentes = 0, ausentes = 0, atrasos = 0, retirados = 0, total = 0
    for (const bloque of bloques) {
      for (const a of bloque.asistencia) {
        total++
        if (a.estado === "presente") presentes++
        if (a.estado === "ausente") ausentes++
        if (a.estado === "atraso") atrasos++
        if (a.estado === "retirado") retirados++
      }
    }
    const pctPresente = total > 0 ? Math.round((presentes / total) * 100) : 0
    return { presentes, ausentes, atrasos, retirados, total, pctPresente }
  }, [bloques])

  const handleGuardar = useCallback(async (isAutoSave = false) => {
    try {
      await guardarLibroClases(ASIGNATURA, curso, fecha, bloques)
      setSaveStatus("saved")
      setTimeout(() => setSaveStatus("idle"), 2500)
    } catch {
      setSaveStatus("error")
      setTimeout(() => setSaveStatus("idle"), 2500)
    }
  }, [ASIGNATURA, curso, fecha, bloques])

  // Atajo guardar Ctrl+S
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault()
        handleGuardar(false)
      }
    }
    document.addEventListener("keydown", handler)
    return () => document.removeEventListener("keydown", handler)
  }, [handleGuardar])

  const setBulkAttendance = (bloqueId: string, estado: EstadoAsistencia) => {
    setBloques(prev => prev.map(b => b.id !== bloqueId ? b : {
      ...b,
      asistencia: b.asistencia.map(e => ({ ...e, estado })),
    }))
  }

  const setEstudianteEstado = (bloqueId: string, estId: string, estado: EstadoAsistencia) => {
    setBloques(prev => prev.map(b => b.id !== bloqueId ? b : {
      ...b,
      asistencia: b.asistencia.map(e => e.id === estId ? { ...e, estado } : e),
    }))
  }

  const cycleEstudianteEstado = (bloqueId: string, estId: string) => {
    setBloques(prev => prev.map(b => b.id !== bloqueId ? b : {
      ...b,
      asistencia: b.asistencia.map(e => {
        if (e.id !== estId) return e
        const idx = ESTADOS.findIndex(x => x.key === e.estado)
        const next = ESTADOS[(idx + 1) % ESTADOS.length]
        return { ...e, estado: next.key }
      }),
    }))
  }

  const copiarBloqueAnterior = (bloqueIndex: number) => {
    if (bloqueIndex === 0) return
    setBloques(prev => prev.map((b, i) => i !== bloqueIndex ? b : {
      ...b,
      asistencia: prev[bloqueIndex - 1].asistencia.map(a => ({ ...a })),
    }))
  }

  const repetirSemanaPasada = async () => {
    const fechaPrev = fechaPrevSemana(fecha)
    const data = await cargarLibroClases(ASIGNATURA, curso, fechaPrev)
    if (!data?.bloques?.length) {
      setSaveStatus("error")
      setTimeout(() => setSaveStatus("idle"), 2500)
      return
    }
    setBloques(prev => {
      return prev.map((b, i) => {
        const prevBloque = data.bloques[i]
        if (!prevBloque) return b
        return {
          ...b,
          objetivo: b.objetivo || prevBloque.objetivo || "",
          actividad: b.actividad || prevBloque.actividad || "",
        }
      })
    })
  }

  const repetirDiaAnterior = async () => {
    const fechaPrev = fechaPrevDia(fecha)
    const data = await cargarLibroClases(ASIGNATURA, curso, fechaPrev)
    if (!data?.bloques?.length) {
      setSaveStatus("error")
      setTimeout(() => setSaveStatus("idle"), 2500)
      return
    }
    setBloques(prev => prev.map((b, i) => {
      const prevBloque = data.bloques[i] || data.bloques[0]
      if (!prevBloque) return b
      return {
        ...b,
        objetivo: prevBloque.objetivo || b.objetivo,
        actividad: prevBloque.actividad || b.actividad,
      }
    }))
  }

  const autocompletar = async (bloqueId: string) => {
    const [crono, verUnidades, oasSugeridos] = await Promise.all([
      cargarCronograma(ASIGNATURA, curso),
      cargarVerUnidadesCurso(ASIGNATURA, curso),
      obtenerOAsActivosDelDia(ASIGNATURA, curso, fecha),
    ])
    const fechaDate = new Date(`${fecha}T12:00:00`)
    const semana = weekNumber(fechaDate)
    const dia = diaNombre(fecha)

    setOaSugeridosPorBloque(prev => ({
      ...prev,
      [bloqueId]: oasSugeridos.slice(0, 4).map(oa => ({
        id: oa.id,
        numero: oa.numero,
        descripcion: oa.descripcion,
        unidadId: oa.unidadId,
      })),
    }))

    setBloques(prev => prev.map(bloque => {
      if (bloque.id !== bloqueId) return bloque
      const planned = (crono?.actividades || [])
        .filter(item => item.semana === semana && item.dia === dia)
        .sort((a, b) =>
          Math.abs(minutesFromHHMM(a.hora) - minutesFromHHMM(bloque.horaInicio))
          - Math.abs(minutesFromHHMM(b.hora) - minutesFromHHMM(bloque.horaInicio))
        )[0]

      const unidadKey = planned?.unidad ? normalizeKeyPart(planned.unidad) : ""
      const unidad = unidadKey ? verUnidades[unidadKey] : undefined
      const oaSeleccionado = unidad?.oas?.find(oa => oa.seleccionado)
      const actividadPlanificada = unidad?.actividades?.find(act => act.fecha === fecha) || unidad?.actividades?.[0]
      const oaSugerido = oasSugeridos[0]

      return {
        ...bloque,
        objetivo: bloque.objetivo
          || oaSeleccionado?.descripcion || oaSugerido?.descripcion || planned?.nombre
          || "Desarrollar y ejercitar los objetivos planificados para el bloque.",
        actividad: bloque.actividad
          || actividadPlanificada?.nombre || planned?.nombre
          || "Inicio, desarrollo y cierre registrados desde EduPanel para su trazabilidad.",
      }
    }))
  }

  const aplicarOaAObjetivo = (bloqueId: string, oa: OASugerido) => {
    const texto = oa.numero ? `OA ${oa.numero}: ${oa.descripcion}` : oa.descripcion
    setBloques(prev => prev.map(b => b.id === bloqueId ? { ...b, objetivo: texto } : b))
  }

  const setObjetivo = (bloqueId: string, valor: string) => {
    setBloques(prev => prev.map(b => b.id === bloqueId ? { ...b, objetivo: valor } : b))
  }
  const setActividad = (bloqueId: string, valor: string) => {
    setBloques(prev => prev.map(b => b.id === bloqueId ? { ...b, actividad: valor } : b))
  }
  const toggleFirmado = (bloqueId: string) => {
    setBloques(prev => prev.map(b => b.id === bloqueId ? { ...b, firmado: !b.firmado } : b))
  }

  // Express mode
  const startExpress = (bloqueId: string) => {
    setExpressMode(true)
    setExpressBloqueId(bloqueId)
    setExpressIndex(0)
  }
  const closeExpress = () => {
    setExpressMode(false)
    setExpressBloqueId(null)
  }

  const expressBloque = expressMode && expressBloqueId
    ? bloques.find(b => b.id === expressBloqueId) || null
    : null

  useEffect(() => {
    if (!expressMode || !expressBloque) return
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      const tag = target?.tagName
      if (tag === "INPUT" || tag === "TEXTAREA" || target?.isContentEditable) return

      const total = expressBloque.asistencia.length
      if (e.key === "Escape") { e.preventDefault(); closeExpress(); return }
      if (e.key === "ArrowRight" || e.key === " ") {
        e.preventDefault()
        setExpressIndex(i => Math.min(total - 1, i + 1))
        return
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault()
        setExpressIndex(i => Math.max(0, i - 1))
        return
      }
      const estado = ESTADOS.find(x => x.tecla === e.key)
      if (estado && expressBloque) {
        e.preventDefault()
        const est = expressBloque.asistencia[expressIndex]
        if (!est) return
        setEstudianteEstado(expressBloque.id, est.id, estado.key)
        setExpressIndex(i => Math.min(total - 1, i + 1))
      }
    }
    document.addEventListener("keydown", handler)
    return () => document.removeEventListener("keydown", handler)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expressMode, expressBloque, expressIndex])

  return (
    <div className="mx-auto max-w-[1400px] px-3 sm:px-5 pb-10">
      {/* Hero / KPIs */}
      <div className="mb-5 grid gap-3 lg:grid-cols-[1.7fr_1fr]">
        <div className="relative overflow-hidden rounded-[18px] bg-gradient-to-br from-pink-500 via-rose-500 to-amber-500 px-6 py-6 text-white">
          <div className="absolute -right-12 -top-10 h-44 w-44 rounded-full bg-white/10 blur-2xl" />
          <div className="relative">
            <div className="text-[11px] font-bold opacity-90 inline-flex items-center gap-1">
              <ClipboardList className="h-3 w-3" /> LIBRO DE CLASES · BETA
            </div>
            <h1 className="mt-1 text-[22px] sm:text-[26px] font-extrabold leading-tight">
              Asistencia y leccionario en un solo flujo
            </h1>
            <p className="mt-1 text-[12.5px] text-white/85">
              {curso ? <>{diaNombre(fecha)} · {curso} · {ASIGNATURA}</> : "Carga tu primer curso para empezar"}
            </p>

            <div className="mt-4 flex flex-wrap items-end gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-bold opacity-80">CURSO</label>
                <select
                  value={curso}
                  onChange={(e) => setCurso(e.target.value)}
                  className="rounded-[10px] bg-white/15 px-3 py-1.5 text-[12.5px] font-semibold text-white backdrop-blur outline-none [&>option]:text-foreground"
                >
                  {cursosDisponibles.map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-bold opacity-80">FECHA</label>
                <input
                  type="date"
                  value={fecha}
                  onChange={(e) => setFecha(e.target.value)}
                  className="rounded-[10px] bg-white/15 px-3 py-1.5 text-[12.5px] font-semibold text-white backdrop-blur outline-none"
                />
              </div>
              <SaveBadge status={saveStatus} onSave={() => handleGuardar(false)} />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          <Kpi label="Presentes"  value={resumen.presentes}  cls="bg-status-green-bg text-status-green-text" />
          <Kpi label="Ausentes"   value={resumen.ausentes}   cls="bg-status-red-bg text-status-red-text" />
          <Kpi label="Atrasos"    value={resumen.atrasos}    cls="bg-status-amber-bg text-status-amber-text" />
          <Kpi label="Retiros"    value={resumen.retirados}  cls="bg-status-slate-bg text-status-slate-text" />
        </div>
      </div>

      {/* Tabs */}
      <div className="sticky top-0 z-10 -mx-3 mb-5 bg-background/85 px-3 backdrop-blur sm:-mx-5 sm:px-5">
        <div className="flex flex-wrap items-center gap-1 border-b border-border pb-1">
          {TABS.map(tab => {
            const Icon = tab.icon
            const isActive = activeTab === tab.key
            return (
              <button
                key={tab.key}
                onClick={() => goToTab(tab.key)}
                className={`inline-flex items-center gap-1.5 rounded-t-[10px] px-3 py-2 text-[12.5px] font-semibold transition-colors ${
                  isActive
                    ? "bg-pink-light text-primary border-b-2 border-primary -mb-px"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {tab.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Vistas */}
      {activeTab === "hoy" && (
        <HoyView
          loading={loading}
          curso={curso}
          fecha={fecha}
          bloques={bloques}
          pieMap={pieMap}
          observacionesResumen={observacionesResumen}
          asignatura={ASIGNATURA}
          oaGlobalSugeridos={oaGlobalSugeridos}
          oaPorBloque={oaSugeridosPorBloque}
          onObjetivo={setObjetivo}
          onActividad={setActividad}
          onToggleFirmado={toggleFirmado}
          onCycleAsistencia={cycleEstudianteEstado}
          onSetAsistencia={setEstudianteEstado}
          onBulk={setBulkAttendance}
          onCopiarAnterior={copiarBloqueAnterior}
          onAutocompletar={autocompletar}
          onAplicarOA={aplicarOaAObjetivo}
          onRepetirSemana={repetirSemanaPasada}
          onRepetirDia={repetirDiaAnterior}
          onIniciarExpress={startExpress}
        />
      )}

      {activeTab === "historial" && (
        <HistorialView
          asignatura={ASIGNATURA}
          curso={curso}
          fecha={fecha}
          onSelectFecha={(f) => { setFecha(f); goToTab("hoy") }}
        />
      )}

      {activeTab === "alertas" && (
        <AlertasView
          asignatura={ASIGNATURA}
          curso={curso}
          fecha={fecha}
          estudiantes={estudiantesCurso}
        />
      )}

      {/* Express modal */}
      {expressMode && expressBloque && (
        <ExpressModal
          bloque={expressBloque}
          index={expressIndex}
          pieMap={pieMap}
          onSet={(estado) => {
            const est = expressBloque.asistencia[expressIndex]
            if (!est) return
            setEstudianteEstado(expressBloque.id, est.id, estado)
            setExpressIndex(i => Math.min(expressBloque.asistencia.length - 1, i + 1))
          }}
          onPrev={() => setExpressIndex(i => Math.max(0, i - 1))}
          onNext={() => setExpressIndex(i => Math.min(expressBloque.asistencia.length - 1, i + 1))}
          onClose={closeExpress}
        />
      )}
    </div>
  )
}

function Kpi({ label, value, cls }: { label: string; value: number; cls: string }) {
  return (
    <div className="rounded-[14px] border border-border bg-card px-4 py-3 flex items-center gap-3">
      <div className={cn("flex h-10 w-10 items-center justify-center rounded-[10px] text-[14px] font-extrabold", cls)}>
        {value}
      </div>
      <div>
        <div className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className="text-[12px] font-semibold">en el día</div>
      </div>
    </div>
  )
}

function SaveBadge({ status, onSave }: { status: "idle"|"saving_silent"|"saved"|"error"; onSave: () => void }) {
  return (
    <div className="ml-auto flex items-center gap-2">
      {status === "saving_silent" && (
        <span className="inline-flex items-center gap-1 rounded-full bg-white/15 px-2.5 py-1 text-[10.5px] font-bold backdrop-blur">
          <Loader2 className="h-3 w-3 animate-spin" /> Guardando…
        </span>
      )}
      {status === "saved" && (
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/30 px-2.5 py-1 text-[10.5px] font-bold backdrop-blur">
          <Check className="h-3 w-3" /> Guardado
        </span>
      )}
      {status === "error" && (
        <span className="inline-flex items-center gap-1 rounded-full bg-red-500/40 px-2.5 py-1 text-[10.5px] font-bold backdrop-blur">
          Error
        </span>
      )}
      <button
        onClick={onSave}
        className="inline-flex items-center gap-1.5 rounded-[10px] bg-white/20 px-3 py-1.5 text-[12px] font-bold backdrop-blur hover:bg-white/30"
      >
        <Bookmark className="h-3.5 w-3.5" /> Guardar
      </button>
    </div>
  )
}

interface HoyViewProps {
  loading: boolean
  curso: string
  fecha: string
  bloques: BloqueLibroClase[]
  pieMap: Map<string, Estudiante>
  observacionesResumen: Record<string, ResumenObservacionesEstudiante>
  asignatura: string
  oaGlobalSugeridos: OASugerido[]
  oaPorBloque: Record<string, OASugerido[]>
  onObjetivo: (bloqueId: string, valor: string) => void
  onActividad: (bloqueId: string, valor: string) => void
  onToggleFirmado: (bloqueId: string) => void
  onCycleAsistencia: (bloqueId: string, estId: string) => void
  onSetAsistencia: (bloqueId: string, estId: string, estado: EstadoAsistencia) => void
  onBulk: (bloqueId: string, estado: EstadoAsistencia) => void
  onCopiarAnterior: (bloqueIndex: number) => void
  onAutocompletar: (bloqueId: string) => void
  onAplicarOA: (bloqueId: string, oa: OASugerido) => void
  onRepetirSemana: () => void
  onRepetirDia: () => void
  onIniciarExpress: (bloqueId: string) => void
}

function HoyView({
  loading, curso, fecha, bloques, pieMap, observacionesResumen, asignatura,
  oaGlobalSugeridos, oaPorBloque,
  onObjetivo, onActividad, onToggleFirmado,
  onCycleAsistencia, onSetAsistencia, onBulk,
  onCopiarAnterior, onAutocompletar, onAplicarOA,
  onRepetirSemana, onRepetirDia, onIniciarExpress,
}: HoyViewProps) {
  const [draggingOA, setDraggingOA] = useState<OASugerido | null>(null)

  if (loading || !curso) {
    return (
      <div className="flex items-center justify-center py-20 gap-3 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" /> Cargando libro…
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* Plantillas rápidas + chips OA */}
      <div className="rounded-[14px] border border-border bg-card p-4">
        <div className="flex flex-wrap items-start gap-3 justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              <h3 className="text-[13px] font-extrabold">Atajos del día</h3>
            </div>
            <p className="text-[11.5px] text-muted-foreground mt-0.5">
              Repite contenidos previos o arrastra un OA al objetivo de un bloque.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={onRepetirDia}
              className="inline-flex items-center gap-1.5 rounded-[10px] border border-border bg-background px-3 py-1.5 text-[12px] font-semibold hover:border-primary"
            >
              <Repeat className="h-3.5 w-3.5" /> Repetir día anterior
            </button>
            <button
              onClick={onRepetirSemana}
              className="inline-flex items-center gap-1.5 rounded-[10px] border border-border bg-background px-3 py-1.5 text-[12px] font-semibold hover:border-primary"
            >
              <Repeat className="h-3.5 w-3.5" /> Misma clase semana pasada
            </button>
          </div>
        </div>
        {oaGlobalSugeridos.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-1.5 rounded-[10px] border border-status-blue-border bg-status-blue-bg/40 px-3 py-2">
            <span className="text-[11px] font-bold text-status-blue-text inline-flex items-center gap-1">
              <Target className="h-3 w-3" /> OAs sugeridos:
            </span>
            {oaGlobalSugeridos.map(oa => (
              <span
                key={`g-${oa.unidadId || ""}-${oa.id}`}
                draggable
                onDragStart={() => setDraggingOA(oa)}
                onDragEnd={() => setDraggingOA(null)}
                className="cursor-grab active:cursor-grabbing rounded-full bg-card border border-status-blue-border px-2 py-0.5 text-[10.5px] font-bold text-status-blue-text"
                title={`Arrastra para asignar: ${oa.descripcion}`}
              >
                {oa.numero ? `OA ${oa.numero}` : oa.id}
              </span>
            ))}
            <span className="ml-auto text-[10.5px] text-muted-foreground italic">↓ arrastra al objetivo de un bloque</span>
          </div>
        )}
      </div>

      {bloques.map((bloque, index) => {
        const oasDelBloque = oaPorBloque[bloque.id] || []
        return (
          <div key={bloque.id} className="bg-card border border-border rounded-[16px] overflow-hidden">
            <div className="px-5 py-3.5 border-b border-border bg-background flex flex-wrap items-center gap-3 justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-[10px] bg-pink-light text-primary">
                  <span className="text-[15px] font-extrabold">{index + 1}</span>
                </div>
                <div>
                  <h2 className="text-[14px] font-extrabold">{bloque.bloque}</h2>
                  <p className="text-[11.5px] text-muted-foreground">
                    {bloque.horaInicio} – {bloque.horaFin} · {bloque.asistencia.length} estudiantes
                  </p>
                </div>
                {bloque.firmado && (
                  <Badge className="bg-status-green-bg text-status-green-text border-status-green-border">
                    <ShieldCheck className="h-3 w-3 mr-1" /> Firmado
                  </Badge>
                )}
              </div>

              <div className="flex flex-wrap gap-1.5">
                <button
                  onClick={() => onIniciarExpress(bloque.id)}
                  className="inline-flex items-center gap-1.5 rounded-[10px] bg-primary text-white px-3 py-1.5 text-[12px] font-bold hover:bg-pink-dark"
                >
                  <Zap className="h-3.5 w-3.5" /> Pasar lista express
                </button>
                <button
                  onClick={() => onAutocompletar(bloque.id)}
                  className="rounded-[10px] border border-primary text-primary px-3 py-1.5 text-[12px] font-semibold hover:bg-pink-light flex items-center gap-1.5"
                >
                  <Wand2 className="h-3.5 w-3.5" /> Autocompletar
                </button>
                {index > 0 && (
                  <button
                    onClick={() => onCopiarAnterior(index)}
                    className="rounded-[10px] border border-border px-3 py-1.5 text-[12px] font-semibold hover:bg-background"
                  >
                    <Copy className="inline h-3.5 w-3.5 mr-1" /> Copiar bloque anterior
                  </button>
                )}
              </div>
            </div>

            <div className="grid lg:grid-cols-[1.1fr_1fr] gap-0">
              {/* Leccionario con drop zone */}
              <div
                className="p-5 border-b lg:border-b-0 lg:border-r border-border"
                onDragOver={(e) => { if (draggingOA) e.preventDefault() }}
                onDrop={() => { if (draggingOA) { onAplicarOA(bloque.id, draggingOA); setDraggingOA(null) } }}
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <ClipboardList className="h-4 w-4 text-primary" />
                    <h3 className="text-[13px] font-bold">Leccionario</h3>
                  </div>
                  {draggingOA && (
                    <span className="text-[10.5px] font-bold text-primary inline-flex items-center gap-1 animate-pulse">
                      <ArrowRight className="h-3 w-3" /> Suelta para aplicar
                    </span>
                  )}
                </div>

                <label className="text-[11px] font-semibold text-muted-foreground block mb-1.5">Objetivo</label>
                <textarea
                  value={bloque.objetivo}
                  onChange={(e) => onObjetivo(bloque.id, e.target.value)}
                  rows={2}
                  className={cn(
                    "w-full rounded-[10px] border px-3 py-2.5 text-[13px] mb-3 outline-none transition-colors",
                    draggingOA ? "border-primary border-dashed bg-pink-light/50" : "border-border focus:border-primary"
                  )}
                  placeholder="Describe el objetivo del bloque (o arrastra un OA aquí)…"
                />

                {oasDelBloque.length > 0 && (
                  <div className="mb-3 flex flex-wrap items-center gap-1.5 rounded-[10px] border border-status-blue-border bg-status-blue-bg/40 px-3 py-2">
                    <span className="text-[11px] font-bold text-status-blue-text">OAs sugeridos del día</span>
                    {oasDelBloque.map(oa => (
                      <button
                        key={`${bloque.id}-${oa.unidadId || ""}-${oa.id}`}
                        onClick={() => onAplicarOA(bloque.id, oa)}
                        title={oa.descripcion}
                        className="rounded-full bg-card px-2 py-0.5 text-[10px] font-bold text-status-blue-text border border-status-blue-border hover:bg-status-blue-bg/60"
                      >
                        {oa.numero ? `OA ${oa.numero}` : oa.id}
                      </button>
                    ))}
                  </div>
                )}

                <label className="text-[11px] font-semibold text-muted-foreground block mb-1.5">Actividad</label>
                <textarea
                  value={bloque.actividad}
                  onChange={(e) => onActividad(bloque.id, e.target.value)}
                  rows={4}
                  className="w-full rounded-[10px] border border-border px-3 py-2.5 text-[13px] outline-none focus:border-primary"
                  placeholder="Inicio, desarrollo, cierre…"
                />

                <button
                  onClick={() => onToggleFirmado(bloque.id)}
                  className={cn(
                    "mt-4 flex items-center gap-2 rounded-[10px] px-4 py-2.5 text-[13px] font-bold transition-colors",
                    bloque.firmado
                      ? "bg-status-green-bg text-status-green-text border border-status-green-border"
                      : "bg-card border border-primary text-primary hover:bg-pink-light"
                  )}
                >
                  <ShieldCheck className="h-4 w-4" />
                  {bloque.firmado ? "Firmado internamente" : "Marcar como firmado"}
                </button>
              </div>

              {/* Asistencia */}
              <div className="p-5">
                <div className="flex items-center justify-between gap-2 mb-3">
                  <div className="flex items-center gap-2">
                    <UserRound className="h-4 w-4 text-primary" />
                    <h3 className="text-[13px] font-bold">Asistencia</h3>
                  </div>
                  <div className="flex gap-1.5">
                    <button
                      onClick={() => onBulk(bloque.id, "presente")}
                      className="rounded-[8px] border border-emerald-300 bg-status-green-bg px-2.5 py-1.5 text-[11px] font-bold text-status-green-text hover:brightness-95"
                      title="Marcar todos presentes"
                    >Todos P</button>
                    <button
                      onClick={() => onBulk(bloque.id, "ausente")}
                      className="rounded-[8px] border border-rose-300 bg-status-red-bg px-2.5 py-1.5 text-[11px] font-bold text-status-red-text hover:brightness-95"
                      title="Marcar todos ausentes"
                    >Todos A</button>
                  </div>
                </div>

                <div className="space-y-1.5 max-h-[400px] overflow-y-auto pr-1">
                  {bloque.asistencia.map((est) => {
                    const state = ESTADOS.find(item => item.key === est.estado)!
                    const isPie = pieMap.get(est.id)?.pie
                    const obs = observacionesResumen[est.id]
                    return (
                      <div
                        key={est.id}
                        className="flex items-center gap-2 rounded-[10px] border border-border px-3 py-2 hover:bg-background"
                      >
                        <button
                          onClick={() => onCycleAsistencia(bloque.id, est.id)}
                          className="flex-1 min-w-0 text-left text-[12.5px] font-medium flex items-center gap-1.5"
                        >
                          <span className="truncate">{est.nombre}</span>
                          {isPie && (
                            <span className="rounded bg-status-pie-bg px-1.5 py-0.5 text-[9px] font-bold text-status-pie-text border border-status-pie-border flex-shrink-0">PIE</span>
                          )}
                          {obs && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Link
                                  href={buildUrl("/perfil-360", withAsignatura({ curso, alumno: est.id }, asignatura))}
                                  onClick={(e) => e.stopPropagation()}
                                  className="inline-flex items-center gap-1 rounded-full border border-status-blue-border bg-status-blue-bg px-1.5 py-0.5 text-[10px] font-bold text-status-blue-text flex-shrink-0"
                                >
                                  <MessageSquare className="h-3 w-3" />
                                  {obs.total}
                                </Link>
                              </TooltipTrigger>
                              <TooltipContent className="max-w-[260px]">
                                <span>{obs.ultimaFecha}: {obs.ultimoExtracto}</span>
                              </TooltipContent>
                            </Tooltip>
                          )}
                        </button>

                        <div className="flex items-center gap-0.5 flex-shrink-0">
                          {ESTADOS.map(e => (
                            <button
                              key={e.key}
                              onClick={() => onSetAsistencia(bloque.id, est.id, e.key)}
                              className={cn(
                                "h-7 w-7 rounded-md text-[11px] font-bold transition-all",
                                est.estado === e.key
                                  ? `${e.cls} ring-2 ${e.ringCls} scale-105`
                                  : "bg-background text-muted-foreground hover:bg-muted"
                              )}
                              title={e.long}
                            >
                              {e.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function ExpressModal({ bloque, index, pieMap, onSet, onPrev, onNext, onClose }: {
  bloque: BloqueLibroClase
  index: number
  pieMap: Map<string, Estudiante>
  onSet: (estado: EstadoAsistencia) => void
  onPrev: () => void
  onNext: () => void
  onClose: () => void
}) {
  const total = bloque.asistencia.length
  const est = bloque.asistencia[index]
  if (!est) return null
  const isPie = pieMap.get(est.id)?.pie
  const completados = bloque.asistencia.filter((_, i) => i <= index).length
  const pct = total > 0 ? Math.round((completados / total) * 100) : 0

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="relative w-full max-w-2xl overflow-hidden rounded-[20px] border border-border bg-card shadow-2xl">
        {/* Header */}
        <div className="bg-gradient-to-br from-primary via-rose-500 to-fuchsia-500 px-6 py-4 text-white">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-[12px] font-bold">
              <Flame className="h-3.5 w-3.5" /> MODO EXPRESS · BLOQUE {bloque.bloque}
            </div>
            <button onClick={onClose} className="rounded-full bg-white/15 p-1.5 hover:bg-white/25">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="mt-2 flex items-center gap-2">
            <div className="flex-1 h-1.5 rounded-full bg-white/20 overflow-hidden">
              <div className="h-full bg-white transition-all" style={{ width: `${pct}%` }} />
            </div>
            <span className="text-[11px] font-bold opacity-90">{index + 1}/{total}</span>
          </div>
        </div>

        {/* Cuerpo */}
        <div className="p-8 text-center">
          <div className="mb-3 inline-flex items-center justify-center rounded-full bg-pink-light px-3 py-1 text-[11px] font-bold text-primary">
            Estudiante {index + 1}
          </div>
          <h2 className="text-[28px] sm:text-[36px] font-extrabold leading-tight tracking-tight">
            {est.nombre}
          </h2>
          {isPie && (
            <span className="mt-2 inline-block rounded bg-status-pie-bg px-2 py-0.5 text-[10px] font-bold text-status-pie-text border border-status-pie-border">
              PIE
            </span>
          )}

          {/* Botones grandes */}
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {ESTADOS.map(e => (
              <button
                key={e.key}
                onClick={() => onSet(e.key)}
                className={cn(
                  "rounded-[14px] border-2 px-4 py-4 text-[20px] font-extrabold transition-all hover:-translate-y-0.5",
                  est.estado === e.key ? `${e.cls} border-primary` : "border-border bg-background hover:border-primary"
                )}
              >
                <div>{e.label}</div>
                <div className="text-[10px] font-semibold text-muted-foreground mt-1">
                  {e.long} · tecla {e.tecla}
                </div>
              </button>
            ))}
          </div>

          <div className="mt-6 flex items-center justify-between">
            <button
              onClick={onPrev}
              disabled={index === 0}
              className="inline-flex items-center gap-1.5 rounded-[10px] border border-border bg-background px-3 py-2 text-[12px] font-semibold hover:border-primary disabled:opacity-50"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Atrás
            </button>
            <span className="text-[11px] text-muted-foreground">
              Atajos: <kbd className="rounded bg-muted px-1">1-4</kbd> marca · <kbd className="rounded bg-muted px-1">Espacio</kbd> sigue · <kbd className="rounded bg-muted px-1">Esc</kbd> sale
            </span>
            <button
              onClick={onNext}
              disabled={index >= total - 1}
              className="inline-flex items-center gap-1.5 rounded-[10px] bg-primary px-3 py-2 text-[12px] font-bold text-white hover:opacity-90 disabled:opacity-50"
            >
              Siguiente <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

interface DiaHistorial {
  fecha: string
  estado: "vacio" | "parcial" | "firmado"
  bloques: number
  presentes: number
  total: number
}

function HistorialView({ asignatura, curso, fecha, onSelectFecha }: {
  asignatura: string
  curso: string
  fecha: string
  onSelectFecha: (fecha: string) => void
}) {
  const [mes, setMes] = useState(() => {
    const d = new Date(`${fecha}T12:00:00`)
    return { y: d.getFullYear(), m: d.getMonth() }
  })
  const [diasData, setDiasData] = useState<Record<string, DiaHistorial>>({})
  const [loadingHistorial, setLoadingHistorial] = useState(false)

  const diasDelMes = useMemo(() => {
    const last = new Date(mes.y, mes.m + 1, 0).getDate()
    const dias: { dateStr: string; date: Date; weekday: number }[] = []
    for (let d = 1; d <= last; d++) {
      const date = new Date(mes.y, mes.m, d)
      const dateStr = toDateInput(date)
      dias.push({ dateStr, date, weekday: date.getDay() })
    }
    return dias
  }, [mes])

  useEffect(() => {
    if (!curso) return
    let cancel = false
    setLoadingHistorial(true)
    const promises = diasDelMes
      .filter(d => d.weekday >= 1 && d.weekday <= 5)
      .map(async d => {
        const data = await cargarLibroClases(asignatura, curso, d.dateStr).catch(() => null)
        if (!data?.bloques?.length) {
          return [d.dateStr, { fecha: d.dateStr, estado: "vacio", bloques: 0, presentes: 0, total: 0 }] as const
        }
        const todosFirmados = data.bloques.every(b => b.firmado)
        let presentes = 0, total = 0
        data.bloques.forEach(b => {
          b.asistencia.forEach(a => { total++; if (a.estado === "presente") presentes++ })
        })
        const estado: DiaHistorial["estado"] = todosFirmados ? "firmado" : "parcial"
        return [d.dateStr, { fecha: d.dateStr, estado, bloques: data.bloques.length, presentes, total }] as const
      })
    Promise.all(promises).then(results => {
      if (cancel) return
      const map: Record<string, DiaHistorial> = {}
      results.forEach(([k, v]) => { map[k] = v })
      setDiasData(map)
    }).finally(() => { if (!cancel) setLoadingHistorial(false) })
    return () => { cancel = true }
  }, [mes, curso, asignatura, diasDelMes])

  const startWeekday = new Date(mes.y, mes.m, 1).getDay() // 0=Dom
  const offset = (startWeekday + 6) % 7 // 0=Lun

  const cambiarMes = (delta: number) => {
    setMes(prev => {
      const m = prev.m + delta
      if (m < 0) return { y: prev.y - 1, m: 11 }
      if (m > 11) return { y: prev.y + 1, m: 0 }
      return { y: prev.y, m }
    })
  }

  const nombreMes = new Date(mes.y, mes.m, 1).toLocaleDateString("es-CL", { month: "long", year: "numeric" })
    .replace(/^./, m => m.toUpperCase())

  return (
    <div className="rounded-[16px] border border-border bg-card p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-primary" />
          <h2 className="text-[14px] font-extrabold">Historial mensual · {curso || "—"}</h2>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => cambiarMes(-1)} className="rounded-md border border-border p-1.5 hover:bg-background"><ChevronLeft className="h-4 w-4" /></button>
          <div className="px-3 text-[12.5px] font-bold min-w-[140px] text-center">{nombreMes}</div>
          <button onClick={() => cambiarMes(1)} className="rounded-md border border-border p-1.5 hover:bg-background"><ChevronRight className="h-4 w-4" /></button>
        </div>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-3 text-[11px]">
        <Legend cls="bg-emerald-100 dark:bg-emerald-900/40" label="Firmado" />
        <Legend cls="bg-amber-100 dark:bg-amber-900/40" label="Parcial / sin firmar" />
        <Legend cls="bg-muted" label="Sin registrar" />
        {loadingHistorial && (
          <span className="ml-auto inline-flex items-center gap-1 text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" /> Cargando…
          </span>
        )}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {["L", "M", "M", "J", "V", "S", "D"].map((d, i) => (
          <div key={i} className="text-center text-[10px] font-bold text-muted-foreground py-1">{d}</div>
        ))}
        {Array.from({ length: offset }).map((_, i) => (
          <div key={`pad-${i}`} className="aspect-square" />
        ))}
        {diasDelMes.map(d => {
          const data = diasData[d.dateStr]
          const isWeekend = d.weekday === 0 || d.weekday === 6
          const isSelected = d.dateStr === fecha
          let cellCls = "bg-muted/30 text-muted-foreground"
          if (data?.estado === "firmado") cellCls = "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-900 dark:text-emerald-100"
          else if (data?.estado === "parcial") cellCls = "bg-amber-100 dark:bg-amber-900/40 text-amber-900 dark:text-amber-100"
          else if (data) cellCls = "bg-muted text-muted-foreground"
          return (
            <button
              key={d.dateStr}
              onClick={() => onSelectFecha(d.dateStr)}
              disabled={isWeekend && !data}
              className={cn(
                "aspect-square rounded-[8px] border p-1 text-left flex flex-col justify-between transition-all",
                cellCls,
                isSelected ? "border-primary border-2 ring-2 ring-primary/30" : "border-transparent hover:border-primary",
                isWeekend && !data && "opacity-40 cursor-not-allowed",
              )}
              title={data ? `${data.bloques} bloque(s) · ${data.presentes}/${data.total} presentes` : "Sin registrar"}
            >
              <span className="text-[11px] font-bold">{d.date.getDate()}</span>
              {data && data.estado !== "vacio" && (
                <span className="text-[9px] font-semibold leading-none">
                  {data.bloques}b · {data.total > 0 ? Math.round((data.presentes/data.total)*100) : 0}%
                </span>
              )}
            </button>
          )
        })}
      </div>

      <p className="mt-4 text-[11px] text-muted-foreground">
        Click en un día para cargar su libro en la pestaña "Hoy". Los días sábados/domingo se muestran inactivos salvo que tengan registros.
      </p>
    </div>
  )
}

function Legend({ cls, label }: { cls: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn("inline-block h-3 w-3 rounded-sm", cls)} />
      <span className="text-muted-foreground">{label}</span>
    </span>
  )
}

interface AlertaItem {
  tipo: "ausencias" | "atrasos" | "sin_objetivo" | "sin_firmar"
  severidad: "alta" | "media" | "baja"
  titulo: string
  detalle: string
  fecha?: string
}

function AlertasView({ asignatura, curso, fecha, estudiantes }: {
  asignatura: string
  curso: string
  fecha: string
  estudiantes: Estudiante[]
}) {
  const [alertas, setAlertas] = useState<AlertaItem[]>([])
  const [loadingAlertas, setLoadingAlertas] = useState(false)

  useEffect(() => {
    if (!curso || estudiantes.length === 0) { setAlertas([]); return }
    setLoadingAlertas(true)
    let cancel = false
    const fechas: string[] = []
    const baseDate = new Date(`${fecha}T12:00:00`)
    for (let i = 0; i < 14; i++) {
      const d = new Date(baseDate)
      d.setDate(d.getDate() - i)
      if (d.getDay() >= 1 && d.getDay() <= 5) fechas.push(toDateInput(d))
    }
    Promise.all(fechas.map(f => cargarLibroClases(asignatura, curso, f).catch(() => null)))
      .then(libros => {
        if (cancel) return
        const result: AlertaItem[] = []

        // Ausencias seguidas y atrasos por estudiante
        const porEst: Record<string, Array<{ fecha: string; estado: EstadoAsistencia | null }>> = {}
        estudiantes.forEach(e => { porEst[e.id] = [] })
        fechas.forEach((f, idx) => {
          const lib = libros[idx]
          if (!lib?.bloques?.length) {
            estudiantes.forEach(e => porEst[e.id].push({ fecha: f, estado: null }))
            return
          }
          const primerBloque = lib.bloques[0]
          estudiantes.forEach(est => {
            const a = primerBloque.asistencia.find(x => x.id === est.id)
            porEst[est.id].push({ fecha: f, estado: a?.estado || null })
          })
        })

        estudiantes.forEach(est => {
          const reg = porEst[est.id]
          let ausenciasSeguidas = 0
          for (const r of reg) {
            if (r.estado === "ausente") ausenciasSeguidas++
            else if (r.estado === null) continue
            else break
          }
          if (ausenciasSeguidas >= 3) {
            result.push({
              tipo: "ausencias",
              severidad: ausenciasSeguidas >= 5 ? "alta" : "media",
              titulo: `${est.nombre} lleva ${ausenciasSeguidas} ausencias seguidas`,
              detalle: `Sin asistir desde ${reg[ausenciasSeguidas - 1]?.fecha}`,
            })
          }
          const atrasos14 = reg.filter(r => r.estado === "atraso").length
          if (atrasos14 >= 4) {
            result.push({
              tipo: "atrasos",
              severidad: atrasos14 >= 7 ? "alta" : "baja",
              titulo: `${est.nombre} acumula ${atrasos14} atrasos en 2 semanas`,
              detalle: "Considera comunicarte con el apoderado.",
            })
          }
        })

        // Bloques sin objetivo o sin firmar
        let bloquesSinObjetivo = 0
        let diasSinFirmar = 0
        fechas.forEach((f, idx) => {
          const lib = libros[idx]
          if (!lib?.bloques?.length) return
          const algunoSinObjetivo = lib.bloques.some(b => !b.objetivo?.trim())
          const algunoSinFirmar = lib.bloques.some(b => !b.firmado)
          if (algunoSinObjetivo) bloquesSinObjetivo++
          if (algunoSinFirmar) diasSinFirmar++
        })
        if (bloquesSinObjetivo >= 3) {
          result.push({
            tipo: "sin_objetivo",
            severidad: "media",
            titulo: `${bloquesSinObjetivo} días con bloques sin objetivo`,
            detalle: "Recuerda completar el leccionario para mantener trazabilidad.",
          })
        }
        if (diasSinFirmar >= 5) {
          result.push({
            tipo: "sin_firmar",
            severidad: "alta",
            titulo: `${diasSinFirmar} días con bloques sin firmar`,
            detalle: "Pendiente de firma interna.",
          })
        }

        result.sort((a, b) => {
          const order = { alta: 0, media: 1, baja: 2 }
          return order[a.severidad] - order[b.severidad]
        })
        setAlertas(result)
      })
      .finally(() => { if (!cancel) setLoadingAlertas(false) })
    return () => { cancel = true }
  }, [asignatura, curso, fecha, estudiantes])

  if (loadingAlertas) {
    return (
      <div className="rounded-[16px] border border-border bg-card p-10 text-center">
        <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />
        <p className="mt-2 text-[12px] text-muted-foreground">Analizando últimas 2 semanas…</p>
      </div>
    )
  }

  if (alertas.length === 0) {
    return (
      <div className="rounded-[16px] border border-emerald-200 bg-emerald-50 dark:border-emerald-900/40 dark:bg-emerald-950/30 p-8 text-center">
        <Check className="mx-auto h-8 w-8 text-emerald-600 dark:text-emerald-300" />
        <h3 className="mt-2 text-[14px] font-extrabold text-emerald-900 dark:text-emerald-100">¡Todo en orden!</h3>
        <p className="mt-1 text-[12px] text-emerald-800 dark:text-emerald-200/80">
          No detectamos patrones críticos en las últimas 2 semanas.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="rounded-[10px] border border-amber-200 bg-amber-50 dark:border-amber-900/40 dark:bg-amber-950/30 px-4 py-2.5 text-[11.5px] text-amber-900 dark:text-amber-100">
        <ListChecks className="inline h-3.5 w-3.5 mr-1" />
        Análisis automático de las últimas 14 jornadas. {alertas.length} {alertas.length === 1 ? "alerta detectada" : "alertas detectadas"}.
      </div>
      {alertas.map((a, i) => {
        const sevCls =
          a.severidad === "alta"  ? "border-rose-300 bg-rose-50 dark:border-rose-900/40 dark:bg-rose-950/30 text-rose-900 dark:text-rose-100" :
          a.severidad === "media" ? "border-amber-300 bg-amber-50 dark:border-amber-900/40 dark:bg-amber-950/30 text-amber-900 dark:text-amber-100" :
                                    "border-blue-200 bg-blue-50 dark:border-blue-900/40 dark:bg-blue-950/30 text-blue-900 dark:text-blue-100"
        return (
          <div key={i} className={cn("flex items-start gap-3 rounded-[14px] border-2 p-4", sevCls)}>
            <AlertTriangle className="h-5 w-5 flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <h4 className="text-[13px] font-extrabold">{a.titulo}</h4>
              <p className="mt-0.5 text-[11.5px] opacity-80">{a.detalle}</p>
            </div>
            <Badge variant="outline" className="text-[10px] uppercase">
              {a.severidad}
            </Badge>
          </div>
        )
      })}
    </div>
  )
}
